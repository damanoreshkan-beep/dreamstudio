// apps/iskra/serialusb.js — a Web Serial `SerialPort` over WebUSB (navigator.usb), for the CH9102 bridge.
//
// WHY: the APK WebView has NO navigator.serial, and Android's kernel cdc_acm holds the CH9102 so WebSerial
// could not take it anyway. But the shell polyfills navigator.usb over its native USB bridge (the same one
// that drives the RTL8852AU) and force-claims the interface — so WebUSB reaches the device where WebSerial
// cannot. On desktop Chrome the page uses the real navigator.serial; only the APK path lands here.
//
// CH9102 is STANDARD CDC-ACM, so this is generic CDC: SET_LINE_CODING (0x20) for baud, SET_CONTROL_LINE_STATE
// (0x22) for DTR/RTS, and the bulk data endpoints for bytes. esptool-js drives the returned port unchanged.
// Endpoints/interfaces are this unit's descriptors (iface 0 = CDC control, 1 = data; EP 0x02 OUT / 0x82 IN).

const CH9102 = { vid: 0x1a86, pid: 0x55d4 };
const EP_NUM = 2;          // both bulk endpoints are number 2 (OUT 0x02 / IN 0x82); WebUSB addresses by number
const CTRL_IFACE = 0;      // the CDC control interface — line-coding / control-line requests target it
const DATA_IFACE = 1;      // the CDC data interface — bulk IN/OUT

export const usbSerialAvailable = () => typeof navigator !== "undefined" && !!navigator.usb;

// A minimal Web Serial SerialPort backed by WebUSB. Enough of the surface for esptool-js's Transport.
export async function makeUsbSerialPort({ vid = CH9102.vid, pid = CH9102.pid } = {}) {
  const dev = await navigator.usb.requestDevice({ filters: [{ vendorId: vid, productId: pid }, { vendorId: vid }] });

  async function setLineCoding(baud) {
    // CDC SET_LINE_CODING (0x20): 7 bytes = baud(LE u32), stopBits(0=1), parity(0=none), dataBits(8)
    const d = new Uint8Array(7);
    new DataView(d.buffer).setUint32(0, baud >>> 0, true);
    d[6] = 8;
    await dev.controlTransferOut({ requestType: "class", recipient: "interface", request: 0x20, value: 0, index: CTRL_IFACE }, d);
  }
  async function setControlLineState(dtr, rts) {
    // CDC SET_CONTROL_LINE_STATE (0x22): wValue bit0=DTR, bit1=RTS
    const w = (dtr ? 1 : 0) | (rts ? 2 : 0);
    await dev.controlTransferOut({ requestType: "class", recipient: "interface", request: 0x22, value: w, index: CTRL_IFACE });
  }

  let alive = false;
  const port = {
    getInfo: () => ({ usbVendorId: vid, usbProductId: pid }),

    async open({ baudRate = 115200 } = {}) {
      if (!dev.opened) await dev.open();
      if (!dev.configuration) await dev.selectConfiguration(1);
      for (const i of [CTRL_IFACE, DATA_IFACE]) { try { await dev.claimInterface(i); } catch { /* control iface may be held; the data iface is the one bulk needs */ } }
      await setLineCoding(baudRate);
      alive = true;

      port.readable = new ReadableStream({
        async pull(ctrl) {
          if (!alive) { ctrl.close(); return; }
          try {
            const r = await dev.transferIn(EP_NUM, 64);
            if (r.data && r.data.byteLength) ctrl.enqueue(new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength));
          } catch { /* a stall/timeout while the ROM is quiet is normal */ }
        },
        cancel() { alive = false; },
      });
      port.writable = new WritableStream({
        async write(chunk) { await dev.transferOut(EP_NUM, chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)); },
      });
    },

    // esptool-js drives the ESP reset here (RTS→EN, DTR→GPIO0 through the board's transistor pair).
    async setSignals({ dataTerminalReady, requestToSend } = {}) {
      await setControlLineState(!!dataTerminalReady, !!requestToSend);
    },

    async close() {
      alive = false;
      try { await dev.close(); } catch { /* already gone */ }
    },
  };
  return port;
}
