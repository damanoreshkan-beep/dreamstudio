// apps/iskra/serialusb.js — a Web Serial `SerialPort` over the shell's NATIVE USB bridge (shell.usb.*).
//
// WHY: the APK WebView has NO Web Serial AND NO Web USB (neither exists in a WebView —
// Usb.java). Android's kernel cdc_acm also holds the CH9102. The shell's native `usb` capability (full
// flavour) force-claims the interface and exposes control/bulk over `shell.call("usb.*")` — the same bridge
// that drives the RTL8852AU. So on the phone we drive the CH9102 through it and hand esptool-js a port.
// On desktop the page uses the real navigator.serial; only the APK path lands here.
//
// CH9102 is STANDARD CDC-ACM: SET_LINE_CODING (0x20) for baud, SET_CONTROL_LINE_STATE (0x22) for DTR/RTS,
// bulk data endpoints for bytes. Endpoints/ifaces are this unit's descriptors (iface 1 = CDC data,
// EP 0x02 OUT / 0x82 IN; iface 0 = CDC control) — re-probe a different revision.
import { shell } from "/_rt/shell.js";

const CH9102 = { vid: 0x1a86, pid: 0x55d4 };
const DATA_IFACE = 1, CTRL_IFACE = 0;
const EP_OUT = 0x02, EP_IN = 0x82;

const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

export const usbSerialAvailable = () => shell.has("usb.open") && shell.has("usb.bulk") && shell.has("usb.control");

// A minimal Web Serial SerialPort backed by shell.usb.*. Enough of the surface for esptool-js's Transport.
export async function makeUsbSerialPort({ vid = CH9102.vid, pid = CH9102.pid } = {}) {
  const r = await shell.call("usb.open", { vid, pid, iface: DATA_IFACE });
  if (!r?.opened) throw new Error("usb.open failed");
  let alive = false;
  // esptool-js toggles the reset lines ONE AT A TIME (setSignals({dataTerminalReady}) then
  // setSignals({requestToSend})); the classic ESP reset needs the other line to HOLD, so we keep each line's
  // last state and only change the field that was passed. Treating a missing field as false collapses DTR/RTS
  // to 0 on every call and the chip never enters the download ROM ("Failed to connect with the device").
  let sigDtr = false, sigRts = false;

  async function setLineCoding(baud) {
    const d = new Uint8Array(7);                 // baud(LE u32), stopBits(0=1), parity(0=none), dataBits(8)
    new DataView(d.buffer).setUint32(0, baud >>> 0, true); d[6] = 8;
    await shell.call("usb.control", { reqType: 0x21, request: 0x20, value: 0, index: CTRL_IFACE, length: 7, data: toHex(d) });
  }
  async function setControlLineState(dtr, rts) {
    const w = (dtr ? 1 : 0) | (rts ? 2 : 0);     // wValue bit0=DTR, bit1=RTS
    await shell.call("usb.control", { reqType: 0x21, request: 0x22, value: w, index: CTRL_IFACE, length: 0, data: "" });
  }

  const port = {
    getInfo: () => ({ usbVendorId: vid, usbProductId: pid }),

    async open({ baudRate = 115200 } = {}) {
      await setLineCoding(baudRate);
      alive = true;
      port.readable = new ReadableStream({
        async pull(ctrl) {
          if (!alive) { ctrl.close(); return; }
          try {
            const rr = await shell.call("usb.bulk", { ep: EP_IN, length: 64, timeout: 200 });
            const bytes = rr?.data ? fromHex(rr.data) : new Uint8Array(0);
            if (bytes.length) ctrl.enqueue(bytes);
          } catch { /* a timeout while the ROM is quiet is normal */ }
        },
        cancel() { alive = false; },
      });
      port.writable = new WritableStream({
        async write(chunk) {
          const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          await shell.call("usb.bulk", { ep: EP_OUT, data: toHex(u8), timeout: 2000 });
        },
      });
    },

    // esptool-js drives the ESP reset here (RTS→EN, DTR→GPIO0 through the board's transistor pair). It sets
    // one line per call, so we hold the other at its last value instead of forcing it low.
    async setSignals({ dataTerminalReady, requestToSend } = {}) {
      if (dataTerminalReady !== undefined) sigDtr = !!dataTerminalReady;
      if (requestToSend !== undefined) sigRts = !!requestToSend;
      await setControlLineState(sigDtr, sigRts);
    },

    async close() {
      alive = false;
      try { await shell.call("usb.close", {}); } catch { /* usb.close may not exist on older bridges */ }
    },
  };
  return port;
}
