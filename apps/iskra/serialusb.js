// apps/iskra/serialusb.js — a Web Serial `SerialPort` over the shell's NATIVE serial bridge (usb.ser*).
//
// The bridge runs the vendored usb-serial-for-android CDC driver (the proven library, not a hand-rolled
// reimplementation): `usb.open` claims the device, `usb.serOpen` builds its CdcAcmSerialPort, and the rest is
// line-coding / DTR-RTS / read / write on that port. esptool-js drives the object below exactly as it drives
// a desktop SerialPort. On the phone this is the ONLY way to reach the CH9102 (Android holds it in cdc_acm).
import { shell } from "/_rt/shell.js";
import { report } from "/_rt/telemetry.js";   // DIAGNOSTIC: is the chip answering after reset?

const CH9102 = { vid: 0x1a86, pid: 0x55d4 };
const DATA_IFACE = 1;   // usb.open claims all interfaces; the CDC data endpoints live here

const toHex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

// The native serial capability exists only inside our APK (bridge >= 37). In a browser this is false, so the
// view falls back to its download-APK stub.
export const usbSerialAvailable = () => shell.has("usb.serOpen");

// A minimal Web Serial SerialPort backed by the native usb-serial driver. Enough for esptool-js's Transport.
export async function makeUsbSerialPort({ vid = CH9102.vid, pid = CH9102.pid } = {}) {
  await shell.call("usb.open", { vid, pid, iface: DATA_IFACE });   // permission + connection + claim-all
  await shell.call("usb.serOpen", { baud: 115200 });               // build the vendored CDC port on it
  // esptool-js toggles the reset lines one at a time; hold each line's last state so setting one never
  // clears the other (that is the classic ESP reset: RTS->EN, DTR->GPIO0).
  let sigDtr = false, sigRts = false, alive = false;
  let rxTotal = 0, rxSeen = false;   // DIAGNOSTIC counters

  const port = {
    getInfo: () => ({ usbVendorId: vid, usbProductId: pid }),

    async open({ baudRate = 115200 } = {}) {
      await shell.call("usb.serParams", { baud: baudRate });
      // esptool-js drives the reset itself (setSignals -> usb.serSignals) once per connect attempt, using the
      // custom sequence view.js passes it — better than a one-shot reset here because it re-tries and reads the
      // boot log between attempts.
      rxTotal = 0; rxSeen = false;
      alive = true;
      port.readable = new ReadableStream({
        async pull(ctrl) {
          if (!alive) { ctrl.close(); return; }
          try {
            const r = await shell.call("usb.serRead", { length: 64, timeout: 40 });
            const bytes = r?.data ? fromHex(r.data) : new Uint8Array(0);
            if (bytes.length) {
              rxTotal += bytes.length;
              if (!rxSeen) { rxSeen = true; report("usb.rx", { first: bytes.length, hex: r.data.slice(0, 24) }, "info"); }
              ctrl.enqueue(bytes);
            }
          } catch { /* a timeout while the ROM is quiet is normal */ }
        },
        cancel() { alive = false; },
      });
      port.writable = new WritableStream({
        async write(chunk) {
          const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
          await shell.call("usb.serWrite", { data: toHex(u8), timeout: 2000 });
        },
      });
    },

    // esptool-js drives the ESP reset here; we send BOTH lines' current state so the library sets them exactly.
    async setSignals({ dataTerminalReady, requestToSend } = {}) {
      if (dataTerminalReady !== undefined) sigDtr = !!dataTerminalReady;
      if (requestToSend !== undefined) sigRts = !!requestToSend;
      report("usb.sig", { dtr: sigDtr, rts: sigRts }, "info");   // DIAGNOSTIC: the reset sequence, via the library
      await shell.call("usb.serSignals", { dtr: sigDtr, rts: sigRts });
    },

    async close() {
      alive = false;
      report("usb.totals", { rx: rxTotal, rxSeen }, "info");   // DIAGNOSTIC: did the ROM ever answer?
      try { await shell.call("usb.close", {}); } catch { /* link already gone */ }
    },
  };
  return port;
}
