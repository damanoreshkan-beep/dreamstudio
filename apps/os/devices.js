// os device roster + state model — the hub's data layer, pure and testable.
// The hero and (later) the device screens read state from here; the transports live natively in the shell
// (a WebView has no WebUSB/BLE/serial), so a browser shows every device absent — the honest "потрібен APK".
// Kept app-local for v1; promote to rt/ if another app needs it. See skill docs OS_DEVICE_HUB_FRAME.

// kind → which accent role the satellite takes when alive (theme tokens, colour = meaning).
export const ROSTER = [
  { id: "m5",     kind: "mcu",   name: "M5 Stick",  short: "M5",     usb: [0x1a86], transport: "ble+serial" },
  { id: "hackrf", kind: "radio", name: "HackRF",    short: "HackRF", usb: [0x1d50], transport: "usb" },
  { id: "rtlsdr", kind: "radio", name: "RTL-SDR",   short: "RTL",    usb: [0x0bda], transport: "usb" },
  { id: "ax56",   kind: "wifi",  name: "AX56",      short: "AX56",   usb: [0x0b05], transport: "usb/agent" },
  { id: "wisp",   kind: "ble",   name: "wisp BT",   short: "wisp",   usb: [0x2550], transport: "usb" },
];

// The five looks the hero draws. One source of truth for both the scene and the tiles.
export const STATE = { ABSENT: "absent", PRESENT: "present", CONNECTED: "connected", ACTIVE: "active", ERROR: "error" };

/**
 * Pure classifier: given a snapshot of what the shell reports, decide each device's state.
 * @param snap { present:boolean, usb:Array<{vendorId?:number}>|null, ble:{on?:boolean}|null, open?:Set<string> }
 * @returns Map<id, state>
 */
export function classify(snap) {
  const out = new Map();
  const bridge = !!(snap && snap.present);
  const usb = (snap && snap.usb) || [];
  const open = (snap && snap.open) || new Set();
  for (const d of ROSTER) {
    if (!bridge) { out.set(d.id, STATE.ABSENT); continue; }        // browser / no APK → everything grey
    if (open.has(d.id)) { out.set(d.id, STATE.CONNECTED); continue; }
    const seen = usb.some((u) => u && d.usb.includes(u.vendorId ?? u.vid));   // attached but not opened
    out.set(d.id, seen ? STATE.PRESENT : STATE.ABSENT);
  }
  return out;
}

// Gate/demo mix: one of every look so the constellation renders populated under the eye and CI.
export function demoStates() {
  return new Map([
    ["m5", STATE.CONNECTED],
    ["hackrf", STATE.PRESENT],
    ["rtlsdr", STATE.ABSENT],
    ["ax56", STATE.ABSENT],
    ["wisp", STATE.ERROR],
  ]);
}
