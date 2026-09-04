// hive — every radio around you as one hexagonal cell.
//
// Three negative results shape every screen here; they were settled by research before any code was
// written and they are not up for re-litigation (apps/hive/RESEARCH.md):
//   · RSSI is not a distance. Strength is a PERCENTAGE OF ITS OWN RADIO'S RANGE and a band in dBm — the
//     word "metres" appears nowhere.
//   · No stock-Android API gives a bearing. The hive is a honeycomb precisely because a honeycomb has no
//     compass: position is RANK. Angles exist only in Hunt, where the user earns them by sweeping.
//   · No standard says when to alert about a tracker — DULT's platform section is literally "TODO" — so
//     Guard's thresholds are named as ours and every unmet criterion is shown.
//
// The maths lives in packages/runtime/radar.js (parsing, per-radio percent, ordering, hex packing, guard
// scoring) and packages/runtime/df.js (the polar accumulator that withholds a bearing until it is earned).
// This file is wiring and layout.
import { html } from "htm/preact";
import { useEffect, useMemo, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel, Island, Sheet, Stage } from "/_rt/ui.js";
import { Globe } from "/_rt/globe.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { compass, geo, wakeLock } from "/_rt/sensors.js";
import { newRose, addSample, roseStats, hasBearing, petal, BEARING_MIN_COVERAGE } from "/_rt/df.js";
import {
  classify, band, smooth, guardScore, rotates, GUARD, signalPercent, orderDevices, hexSpiral, hexToXY, combSize,
  unwrapDeg, sightTrend,
} from "/_rt/radar.js";
import { parseOui, vendorOf } from "/_rt/oui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// A sighting older than this is gone, not "maybe still there". Android's low-latency scan window is 5 s,
// so 20 s is four chances to be seen again before we stop claiming a device is present.
const SEEN_MS = 20_000;
const RADIO_MS = 30_000;                   // the OS throttles a foreground Wi-Fi scan hard

const KIND_ICON = { ble: "lucide:bluetooth", wifi: "lucide:wifi", lte: "lucide:radio-tower" };
const KINDS = ["ble", "wifi", "lte"];

// Scanning outlives a tab switch — a subscription restarted per render would hit the framework's
// ~5-starts-per-30-seconds limit and go quiet with no error anyone could see.
const $devices = atom(new Map());
const $scanning = atom(false);
const $err = atom(null);
const $target = atom(null);
const $roseAt = atom(0);
const $fix = atom(null);
// Ageing needs a clock of its own. Reading Date.now() inside a useMemo keyed on the device map freezes
// "now" at the last sighting, so a tab mounted later aged the whole field out while an already-mounted one
// kept showing it — the same data, two answers, decided by mount order.
const $now = atom(Date.now());
// The IEEE registry is 519 KB, so it is fetched ONCE and only when a screen that shows names is opened —
// the hive itself never needs it. A failure is silent by design: a missing vendor is exactly what the
// lookup returns for most addresses anyway, so the UI already handles its absence.
const $oui = atom(null);
// What the last tap put on the clipboard — the only observable proof of a copy, since a headless browser
// refuses to paste it back.
const $copied = atom(null);
// The «Перевірити» lookup: { addr, state:"asking"|"done", v }. One at a time, because the button acts on
// the one find that is selected.
const $look = atom(null);

/**
 * What we may honestly ASK about this find. Null is an answer too — it means the transmitter did not say
 * enough to be looked up, and the UI says exactly that instead of sending a query that cannot match.
 * A cell needs its operator's numbers (a CID repeats across networks); Wi-Fi needs the neighbours seen in
 * the same sweep AND their SSIDs (beaconDB matches on MAC+SSID, so a hidden AP is unlookupable); a BLE
 * device needs a real address, which a rotating one is not.
 */
function requestFor(d, field) {
  if (d.kind === "lte") {
    return d.mcc != null && d.mnc != null && d.cid && d.lac
      ? { kind: "cell", cell: { radio: d.radio || "lte", mcc: d.mcc, mnc: d.mnc, lac: d.lac, cid: d.cid } }
      : null;
  }
  if (d.kind === "wifi") {
    const others = field.filter((x) => x.kind === "wifi" && x.addr !== d.addr)
      .sort((a, b) => (b.smooth ?? b.rssi) - (a.smooth ?? a.rssi)).slice(0, 5);
    const aps = [d, ...others].filter((x) => x.name)
      .map((x) => ({ bssid: x.addr, ssid: x.name, rssi: Math.round(x.smooth ?? x.rssi) }));
    return aps.length >= 2 ? { kind: "wifi", wifi: aps } : null;
  }
  if (d.kind === "ble") return rotates(d.addr) ? null : { kind: "ble", ble: { mac: d.addr } };
  return null;
}

// The gate has no network, so the lookup answers from a fixture — one of each verdict, so every branch of
// the UI is exercised by the screens the eye photographs: the Wi-Fi pair is placed, the cell is not known.
const GATE_LOOKUP = {
  wifi: { found: true, lat: 50.4501, lon: 30.5234, accuracy: 96, source: "beacondb" },
  lte: { found: false, reason: "unknown" },
  ble: { found: false, reason: "unknown" },
};

async function askAbout(d, field, onFound) {
  const req = requestFor(d, field);
  if (!req) { $look.set({ addr: d.addr, state: "done", v: { found: false, reason: "tooLittle" } }); return; }
  $look.set({ addr: d.addr, state: "asking", v: null });
  const settle = (v) => { $look.set({ addr: d.addr, state: "done", v }); if (v.found) onFound?.(); };
  if (gate) { settle(GATE_LOOKUP[d.kind] || { found: false, reason: "unknown" }); return; }
  try {
    // Plain fetch: the runtime's sealed transport re-expresses any call to VPS_PROXY as one encrypted
    // envelope, so the identifiers never cross the wire in the clear and this app knows nothing about it.
    const r = await fetch(`${VPS_PROXY}/hive/lookup`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req),
    });
    settle(r.ok ? await r.json() : { found: false, reason: "unavailable" });
  } catch { settle({ found: false, reason: "unavailable" }); }
}
let ouiPending = false;
function loadOui() {
  if (ouiPending || $oui.get()) return;
  ouiPending = true;
  fetch(new URL("./assets/oui.txt", import.meta.url).href)
    .then((r) => (r.ok ? r.text() : ""))
    .then((txt) => { if (txt) $oui.set(parseOui(txt)); })
    .catch(() => { /* offline on first run; names simply stay absent */ });
}

// The hunt rose DECAYS (~30 s of memory): the arrow must follow the walk, not stay anchored to where the
// user stood a minute ago. homin's stationary fox-hunt rose deliberately does not.
const HUNT_TAU = 30_000;
let rose = newRose(72, HUNT_TAU);
let stopScan = null, radioTimer = null, ageTimer = null, stopCompass = null, stopGeo = null, lock = null;
let heading = 0;
// The dial is heading-up (the world rotates, the needle says where to turn), so the heading must reach
// the render — rounded to whole degrees, or the 60 Hz orientation stream re-renders the tab per frame.
const $heading = atom(0);

// The gate has no radio, so seed a field wide enough to exercise every branch AND every radio: a DULT
// accessory advertising SEPARATED (the only spec-grade tracker evidence there is), an Apple device that
// must NOT read as a tracker, a Tile, an unnamed faint one, two networks and two cells.
// Addresses are chosen to exercise the vendor lookup's BOTH answers, because a fixture that can only
// produce one of them tests nothing: 4C.. is a resolvable private address (rotating, so it must stay
// nameless however registered the bytes look), while B8:27:EB and the two BSSIDs are real registered
// prefixes that must resolve.
const GATE_FIELD = [
  { addr: "4C:11:22:33:44:55", name: "", rssi: -63, raw: "0201060516b2fc0700", kind: "ble" },
  { addr: "B8:27:EB:0A:0B:0C", name: "Earbuds", rssi: -47, raw: "05ff4c00070f", kind: "ble" },
  { addr: "C3:0A:0B:0C:0D:0E", name: "Tile", rssi: -78, raw: "0201060303edfe", kind: "ble" },
  { addr: "0A:99:88:77:66:55", name: "", rssi: -92, raw: "020106", kind: "ble" },
  { addr: "24:0A:C4:11:22:33", name: "Gate-AP", rssi: -52, kind: "wifi", ftm: true, freq: 5180 },
  { addr: "3C:5A:B4:44:55:66", name: "Gate-Guest", rssi: -74, kind: "wifi", ftm: false, freq: 2437 },
  // The serving cell carries its identifiers, its neighbour carries none — that is not a gap in the
  // fixture but the radio's own rule, and a field where every cell had a CID could not test it.
  { addr: "lte:301", name: "LTE 1300", rssi: -89, kind: "lte", serving: true, cid: 27183, lac: 4102, mcc: 255, mnc: 1, radio: "lte" },
  { addr: "lte:118", name: "LTE 1300", rssi: -104, kind: "lte", serving: false },
];

// A sweep the gate can photograph. Under the gate the mocked subscribe emits ONCE, so no further samples
// reach the accumulator and Hunt would render an empty circle in every shot while the e2e asserted
// nothing. Seeded as a real lobe that clears df.js's concentration and coverage gates.
function seedRose(dirDeg = 292) {
  rose = newRose(72, HUNT_TAU);
  for (let b = 0; b < 72; b++) {
    const h = (b + 0.5) * 5;
    const off = Math.abs(((h - dirDeg + 540) % 360) - 180);
    addSample(rose, h, 0.12 + 0.78 * Math.max(0, Math.cos((off * Math.PI) / 180)) ** 2);
  }
  $roseAt.set(Date.now());
}

function upsert(frame) {
  if (!frame || frame.started || frame.ack || !frame.addr) return;
  const now = Date.now();
  const next = new Map($devices.get());
  const prev = next.get(frame.addr);
  const kind = frame.kind || "ble";
  const sm = smooth(prev?.smooth ?? NaN, frame.rssi, prev ? now - prev.at : 0);
  const sightings = [...(prev?.sightings || []), { at: now, rssi: frame.rssi, fix: $fix.get() }].slice(-60);
  next.set(frame.addr, {
    ...frame, kind, smooth: sm, at: now, first: prev?.first ?? now, sightings,
    // Only BLE carries an advertisement; a Wi-Fi or cell record has nothing to classify, and saying so
    // is different from saying "nothing found".
    cls: kind === "ble" ? classify(frame) : null,
  });
  $devices.set(next);

  // Raw samples, never the smoothed value: an EWMA drags a reading across the very bins the accumulator
  // exists to tell apart.
  if ($target.get() === frame.addr && Number.isFinite(frame.rssi)) {
    addSample(rose, heading, Math.max(0, (frame.rssi + 110) / 70));
    $roseAt.set(Date.now());
  }
}

// Android reports an unavailable cell field as Integer.MAX_VALUE instead of omitting it, and a neighbour
// cell carries no CID at all — only the cell the radio is camped on does. Both must read as "not stated"
// rather than as a number: a printed 2147483647 is an invented identifier. Every id here is ≤ 28 bits.
const cellNum = (v) => (Number.isInteger(v) && v > 0 && v < 0x10000000 ? v : null);

// Wi-Fi and cell are CALLS where BLE is a subscribe, so they are asked on a timer. Each failure is
// swallowed on its own: one radio being refused must never blank the other two.
async function sweepRadios() {
  if (shell.has("wifi.scan")) {
    try {
      const r = await shell.call("wifi.scan", {});
      for (const n of r.networks || []) {
        if (n.bssid) upsert({ addr: n.bssid, name: n.ssid || "", rssi: n.rssi, kind: "wifi", ftm: n.ftm, freq: n.freq });
      }
    } catch { /* the other radios still work */ }
  }
  if (shell.has("cell.info")) {
    try {
      const r = await shell.call("cell.info", {});
      for (const c of r.cells || []) {
        // A cell has no address, so its identity is the physical-layer id it broadcasts.
        const id = c.pci ?? c.cid ?? c.lac;
        if (id == null) continue;
        upsert({
          addr: `${c.type || "cell"}:${id}`, name: `${(c.type || "cell").toUpperCase()} ${c.arfcn ?? ""}`.trim(),
          rssi: c.rssi, kind: "lte", serving: !!c.serving, cid: cellNum(c.cid), lac: cellNum(c.lac),
          // The network's own numbers. They look like bookkeeping and they are the whole key: a CID is only
          // unique INSIDE one operator's network, so no database can place a cell without MCC+MNC. The
          // bridge has always put them on the wire; the app simply never read them (2026-09-04).
          mcc: cellNum(c.mcc), mnc: cellNum(c.mnc), radio: (c.type || "lte").toLowerCase(),
        });
      }
    } catch { /* a phone with no SIM answers nothing, which is not an error */ }
  }
}

function startScan() {
  if ($scanning.get()) return;
  $scanning.set(true);
  $err.set(null);
  if (gate) {
    for (const d of GATE_FIELD) upsert(d);
    if ($target.get()) seedRose();
    return;
  }
  rose = newRose(72, HUNT_TAU);
  $roseAt.set(Date.now());
  lock = wakeLock.acquire();
  stopScan = shell.subscribe("ble.scan", {}, upsert, (e) => {
    $err.set(e?.detail || e?.code || ERR.failed);
    $scanning.set(false);
  });
  sweepRadios();
  radioTimer = setInterval(sweepRadios, RADIO_MS);
  ageTimer = setInterval(() => $now.set(Date.now()), 1000);
  stopCompass = compass.start((deg) => {
    heading = deg;
    const h = Math.round(deg) % 360;
    if (h !== $heading.get()) $heading.set(h);
  });
  stopGeo = geo.watch((p) => $fix.set({ lat: p.lat, lon: p.lng, acc: p.accuracy }), () => {});
}

function endScan() {
  $scanning.set(false);
  try { stopScan?.(); } catch { /* already gone */ }
  stopScan = null;
  clearInterval(radioTimer); radioTimer = null;
  clearInterval(ageTimer); ageTimer = null;
  try { stopCompass?.(); } catch { /* never started */ }
  try { stopGeo?.(); } catch { /* never started */ }
  try { lock?.release(); } catch { /* never acquired */ }
  stopCompass = stopGeo = lock = null;
}

/**
 * The one ordered, filtered view of the field — the grid and the list both read it, so they can never
 * describe different things. Nothing ages under the gate: the mocked subscribe emits once, so a decay
 * there would empty the screen rather than reflect a radio.
 */
function useField(S) {
  const map = useStore($devices);
  const now = useStore($now);
  const f = useStore(S.filters);
  const kinds = Array.isArray(f?.kinds) ? f.kinds : KINDS;
  const sort = typeof f?.sort === "string" ? f.sort : "seen";
  return useMemo(() => {
    const live = [...map.values()].filter((d) =>
      (gate || d.kind !== "ble" || now - d.at < SEEN_MS) && kinds.includes(d.kind));
    return orderDevices(live, sort).map((d) => ({ ...d, percent: signalPercent(d.smooth ?? d.rssi, d.kind) }));
  }, [map, now, kinds.join(","), sort]);
}

const labelOf = (d, t) => d.name || (d.kind === "wifi" ? T(t, "hidden") : T(t, "unnamed"));

function ScanButton({ t }) {
  const on = useStore($scanning);
  const why = shell.whyCapability("ble");
  return html`<button data-scan=${on ? "on" : "off"} disabled=${!!why && !gate}
    onClick=${() => (on ? endScan() : startScan())}
    class=${`btn btn-sm gap-2 shrink-0 ${on ? "" : "btn-primary"}`}>
    ${Icon(on ? "lucide:square" : "lucide:radar")}<span>${T(t, on ? "stop" : "start")}</span>
  </button>`;
}

function Reason({ t }) {
  const err = useStore($err);
  const why = shell.whyCapability("ble");
  if (!err && !why) return null;
  const key = why === ERR.staleBridge ? "needsNewer"
    : why ? "needsShell"
    : err === ERR.denied ? "denied"
    : /scanFailed:6/.test(String(err)) ? "tooOften"
    : err === ERR.unavailable ? "radioOff" : "failed";
  return html`<div data-reason class="text-[length:var(--ms-label)] text-error">${T(t, key)}</div>`;
}

/** Per-radio tally — the "mark BLE, Wi-Fi and cell separately" requirement, as one readable row. */
function Legend({ t, field }) {
  return html`<div data-legend class="flex items-center gap-3 min-w-0 overflow-hidden">
    ${KINDS.map((k) => {
      const n = field.filter((d) => d.kind === k).length;
      return html`<span key=${k} data-legend-kind=${k} class="flex items-center gap-1 min-w-0">
        ${Icon(KIND_ICON[k], `text-[length:var(--ms-icon)] shrink-0 ${k === "ble" ? "text-[var(--app-accent)]" : "text-base-content/70"}`)}
        <span class="font-mono tabular-nums text-[length:var(--ms-label)] ${n ? "text-base-content" : "text-muted"}">${n}</span>
      </span>`;
    })}
  </div>`;
}

// ── hive ──────────────────────────────────────────────────────────────────────────────────────────────
// SVG, not WebGL. A lit 3D scene bought nothing this screen needed and cost everything it did: the
// percentage — the whole point — was unreadable in perspective, the neutral columns took their material
// from the TEXT token and rendered as black holes in light mode, and the geometry once shipped 230 million
// units off-camera because two clocks were subtracted. Flat cells keep the numbers crisp at any size,
// invert with the theme for free because they are `currentColor`, and the gate photographs them.
const HEX = 10;                       // circumradius in viewBox units
const CORNERS = Array.from({ length: 6 }, (_, i) => ((60 * i + 30) * Math.PI) / 180);   // pointy-top
const hexPath = (cx, cy, r) =>
  CORNERS.map((a, i) => `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`).join("") + "Z";
// Every cell is the SAME path; position and size live on groups as CSS transforms (apps/hive/index.html,
// the .hv-* block), so a rank change is a glide and a signal change is a swell — never an attribute jump.
const CELL = hexPath(0, 0, HEX * 0.92);

// The farm's material, drawn into the instrument itself: a cell is the page EXTRUDED (occupied) or
// RECESSED (empty), so the comb reads as one pressed surface rather than a wireframe. The lit edge is
// DRAWN, never inherited (the brick lesson): the three upper edges take one token of the --nm pair and
// the three lower edges take the other, and swapping the pair flips raised into inset. The tokens invert
// with the theme for free.
const chain = (r, idx) =>
  idx.map((ci, j) => `${j ? "L" : "M"}${(Math.cos(CORNERS[ci]) * r).toFixed(2)} ${(Math.sin(CORNERS[ci]) * r).toFixed(2)}`).join("");
const CELL_UP = chain(HEX * 0.92, [2, 3, 4, 5]);      // left → top-left → top-right edges
const CELL_DOWN = chain(HEX * 0.92, [5, 0, 1, 2]);    // right → bottom-right → bottom-left edges
function Bevel({ raised }) {
  return html`
    <path d=${CELL_UP} style=${`stroke:var(${raised ? "--nm-light" : "--nm-dark"})`} fill="none"
      stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
    <path d=${CELL_DOWN} style=${`stroke:var(${raised ? "--nm-dark" : "--nm-light"})`} fill="none"
      stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />`;
}

export function hiveView({ S, t }) {
  const field = useField(S);
  const scanning = useStore($scanning);
  const target = useStore($target);

  // Round UP to a complete ring. A spiral truncated mid-ring is lopsided — eight cells is a full first
  // ring plus one lone neighbour poking into the second — and reads as a rendering accident rather than a
  // hive. The surplus draws as empty comb, which is also the honest picture of a field with room in it.
  const coords = hexSpiral(combSize(Math.max(1, field.length)));
  const pts = coords.map((c) => hexToXY(c, HEX));
  const pad = HEX * 1.3;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  // The viewBox never changes. The comb reaches a new ring by SCALING a group, which is a transition
  // rather than an attribute jump — the whole field breathes outward instead of snapping.
  const s = 200 / Math.max(maxX - minX, maxY - minY);

  // .ms-side, with the island IN FLOW (v2m's structure): a pinned island is fixed OVER the stage, so a
  // short viewport slid the comb's bottom row underneath it — overlap no gate can see. In flow the
  // stage can never reach behind the controls, and below 520px of height the comb moves BESIDE them.
  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
    <${Stage}>
      <div class="absolute inset-0 flex items-center justify-center p-1">
        ${/* One accessible name for the whole picture: the cells are a rendering of the list, and the
             List tab is the interactive surface. A focusable <g> per cell would add 20 tab stops that
             lead nowhere. */""}
        ${/* viewBox starts at 0 0 ON PURPOSE: transform-box:view-box anchors its reference box at the
             ORIGIN of the viewBox coordinate system, not at its min-x/min-y corner, so a negative-origin
             viewBox makes every transform-origin resolve 100 units off. With 0 0 the two readings
             coincide and the centring lives in the transform chain itself. */""}
        <svg data-mark viewBox="0 0 200 200"
          class="w-full h-full max-h-full text-base-content" role="img"
          aria-label=${`${field.length} ${T(t, "cells")}`}>
          <defs>
            ${/* A tower is infrastructure, not a personal device, and the comb should say so without a
                 caption: cells are hatched, personal radios are solid. currentColor, so it themes. */""}
            <pattern id="hvHatch" patternUnits="userSpaceOnUse" width="2.6" height="2.6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="2.6" stroke="currentColor" stroke-width="0.9" />
            </pattern>
          </defs>
          <g class="hv-scale" style=${`transform:translate(100px,100px) scale(${s.toFixed(4)})`}>
            ${coords.map((c, i) => {
              const { x, y } = pts[i];
              const at = `transform:translate(${(x - cx).toFixed(2)}px,${(y - cy).toFixed(2)}px)`;
              const d = field[i];
              if (!d) {
                return html`<g key=${`e${i}`} class=${gate ? "hv-cell" : "hv-cell hv-e-in"} style=${at}>
                  <${Bevel} raised=${false} />
                </g>`;
              }
              // AREA carries the percentage, so the mark is proportional to the number beside it rather
              // than to its square root — the commonest way a "bigger means more" graphic lies.
              const k = Math.sqrt(Math.max(0, Math.min(100, d.percent)) / 100);
              const tone = d.kind === "ble" ? "text-[var(--app-accent)]" : "text-base-content";
              const solid = d.kind === "lte" ? 0.5 : d.kind === "wifi" ? 0.45 : 0.55;
              return html`<g key=${d.addr} data-cell=${d.addr} data-kind=${d.kind} class=${`hv-cell ${tone}`} style=${at}>
                <g class=${gate ? "" : "hv-in"} style=${gate ? "" : `animation-delay:${Math.min(i, 20) * 24}ms`}>
                  <${Bevel} raised=${true} />
                  <g class="hv-fill" style=${`transform:scale(${k.toFixed(3)})`}>
                    <path d=${CELL} fill=${d.kind === "lte" ? "url(#hvHatch)" : "currentColor"} fill-opacity=${solid} />
                  </g>
                  ${d.addr === target ? html`<path d=${CELL} fill="none" stroke="currentColor" stroke-width="2"
                    vector-effect="non-scaling-stroke" class="text-[var(--app-accent)]" />` : null}
                  <text x="0" y=${(HEX * 0.34).toFixed(2)} text-anchor="middle"
                    class="font-mono text-base-content" font-size=${HEX * 0.72} fill="currentColor">${d.percent}</text>
                </g>
              </g>`;
            })}
          </g>
        </svg>
      </div>
      <div data-live class="absolute inset-x-0 top-0 flex justify-center pointer-events-none">
        <span class="flex items-center gap-1.5 font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70">
          ${/* The state is a mark, not a caption: scanning shows a live pulse, idle says the word. */""}
          ${scanning ? html`<span class=${`inline-block w-1.5 h-1.5 rounded-full bg-[var(--app-accent)] ${gate ? "" : "hv-dot-live"}`}></span>` : null}
          <span>${field.length} ${T(t, "cells")}${scanning ? "" : " · " + T(t, "idle")}</span>
        </span>
      </div>
    <//>

    <div class="ms-side-main flex flex-col justify-end items-center pb-[var(--ms-gap)]">
      <${Island} className="w-full max-w-md">
        ${/* A ROW that wraps (the swarm precedent): in .ms-side's narrow column the legend drops to its
             own line instead of overflow-hidden silently eating the last radio's count. */""}
        <div class="flex flex-wrap items-center gap-[var(--ms-gap)] min-w-0">
          <${ScanButton} t=${t} />
          <${Legend} t=${t} field=${field} />
        </div>
        <${Reason} t=${t} />
      <//>
    </div>
  </div>`;
}

// A find, written out in full — what the tap copies. Every line is something a radio actually said: the
// same honesty rule the row itself follows, so an absent field is ABSENT, never a dash or a zero dressed
// as data. Identifiers keep their protocol spelling (BSSID, CID, dBm); only the labels are the reader's
// language, because the text is for a person to paste into a note, a ticket or a message.
function dossier(d, t, oui, loc) {
  const L = (k) => T(t, k);
  const time = (ms) => new Date(ms).toLocaleTimeString(loc === "en" ? "en-GB" : "uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const rssi = Math.round(d.smooth ?? d.rssi);
  const lines = [
    `${labelOf(d, t)} · ${L("k" + d.kind[0].toUpperCase() + d.kind.slice(1))}`,
    `${d.kind === "wifi" ? "BSSID" : d.kind === "lte" ? L("cellId") : L("address")} ${d.addr}`,
    `${L("signal")} ${rssi} dBm · ${d.percent}% · ${L("band_" + band(d.smooth ?? d.rssi))}`,
  ];
  const vendor = vendorOf(d.addr, d.kind, oui);
  if (vendor) lines.push(`${L("vendor")} ${vendor}`);
  if (d.kind === "ble") {
    if (rotates(d.addr)) lines.push(L("rotating"));
    if (d.cls?.protocols?.length) lines.push(`${L("protocols")} ${d.cls.protocols.join(", ")}`);
    if (d.cls?.tracker && d.cls.tracker !== "none") lines.push(`${L("tracker")} ${L(d.cls.tracker === "separated" ? "separatedNow" : "watching")}`);
    if (d.raw) lines.push(`${L("advert")} ${d.raw}`);
  }
  if (d.kind === "wifi") {
    if (d.freq) lines.push(`${L("freq")} ${d.freq} MHz${chanOf(d.freq) ? ` · ${L("channel")} ${chanOf(d.freq)}` : ""}`);
    if (d.ftm != null) lines.push(`FTM (802.11mc) ${L(d.ftm ? "yes" : "no")}`);
  }
  if (d.kind === "lte") {
    lines.push(`${L("role")} ${L(d.serving ? "serving" : "neighbour")}`);
    if (d.cid) lines.push(`CID ${d.cid}`);
    if (d.lac) lines.push(`LAC ${d.lac}`);
  }
  lines.push(`${L("firstSeen")} ${time(d.first)} · ${L("lastSeen")} ${time(d.at)} · ${L("samples")} ${d.sightings?.length ?? 0}`);
  return lines.join("\n");
}

// Copying with a floor under it. `navigator.clipboard.writeText` is the modern path and the one a phone
// takes, but it is refused outright in contexts that have no clipboard permission — measured on the see pod,
// where the async API rejects and the user would have read "could not copy" for a copy that could have
// happened. The old textarea + execCommand still works there, so it is the fallback rather than the error.
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the old path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

// The Wi-Fi channel a frequency belongs to — arithmetic, not a table: 2.4 GHz counts 5 MHz per channel from
// 2412 (14 is the exception Japan kept), 5 GHz and 6 GHz count from their own anchors.
function chanOf(mhz) {
  if (mhz === 2484) return 14;
  if (mhz >= 2412 && mhz <= 2472) return (mhz - 2407) / 5;
  if (mhz >= 5160 && mhz <= 5885) return (mhz - 5000) / 5;
  if (mhz >= 5955 && mhz <= 7115) return (mhz - 5950) / 5;
  return null;
}

// ── list ──────────────────────────────────────────────────────────────────────────────────────────────
// Rows never jump. Ordering is systemic (S.filters.sort, persisted) and "by signal" sorts on the BAND
// rather than the live number, because a stationary device fades 5-15 dB on its own — sorting on that
// reshuffles the screen several times a second and makes the list unreadable.
export function listView({ S, t, toast, screen, openScreen, closeScreen }) {
  const field = useField(S);
  const target = useStore($target);
  const oui = useStore($oui);
  const loc = useStore(S.locale);
  const look = useStore($look);
  const sel = field.find((d) => d.addr === target) || null;
  const mine = look && sel && look.addr === sel.addr ? look : null;
  const copied = useStore($copied);
  useEffect(loadOui, []);
  // A tap does BOTH: it aims the hunt at this find (the row is the only way into that screen) and puts the
  // whole find on the clipboard — the owner asked for the second and the first has no other entrance.
  const takeIt = async (d) => {
    $target.set(d.addr);
    if (gate) seedRose(); else { rose = newRose(72, HUNT_TAU); $roseAt.set(Date.now()); }
    const text = dossier(d, t, oui, loc);
    const ok = await copyText(text);
    // The clipboard cannot be read back in a headless context (paste is refused), so what WAS copied is
    // mirrored into the DOM: the gate and the driver assert the dossier by its address and its line count
    // rather than by a toast that would look the same for an empty string.
    $copied.set(ok ? { addr: d.addr, lines: text.split("\n").length } : null);
    toast?.(T(t, ok ? "copied" : "copyFail"));
  };
  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Panel}>
      <div class="flex items-center gap-[var(--ms-gap)] min-w-0">
        <${ScanButton} t=${t} />
        <${Legend} t=${t} field=${field} />
      </div>
      <${Reason} t=${t} />
    <//>

    ${/* The selected find, and the one question we can ask about it. The button acts on the SELECTION rather
         than sitting in every row: a row is already a button (tap = copy + aim), and a control inside a
         control is neither tappable nor announceable. The verdict lives here too — "nobody surveyed this
         transmitter" and "the lookup is broken" are different sentences and the app says which. */""}
    ${sel
      ? html`<${Panel} title=${T(t, "checkTitle")}>
        <div data-check-row data-verdict=${mine?.state === "done" ? (mine.v.found ? "found" : mine.v.reason) : mine?.state === "asking" ? "asking" : ""}
          class="flex items-center gap-[var(--ms-gap)] min-w-0">
          <span class="flex-1 min-w-0 truncate">${labelOf(sel, t)}</span>
          <button data-check class="btn btn-primary rounded-full shrink-0" disabled=${mine?.state === "asking"}
            onClick=${() => askAbout(sel, field, () => openScreen("where"))}>
            ${T(t, mine?.state === "asking" ? "asking" : "check")}
          </button>
        </div>
        ${mine?.state === "done" && !mine.v.found
          ? html`<div data-verdict-line class="text-sm text-muted">${T(t, "no_" + mine.v.reason)}</div>`
          : null}
        ${mine?.state === "done" && mine.v.found
          ? html`<button data-open-where class="text-sm text-left underline decoration-dotted" onClick=${() => openScreen("where")}>${T(t, "showOnGlobe")}</button>`
          : null}
      <//>`
      : null}

    <${Panel} title=${T(t, "signal")}>
      <div data-live data-copied=${copied?.addr || ""} data-copied-lines=${copied?.lines || 0} class="flex flex-col">
        ${field.length === 0 ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
        ${field.map((d) => html`<button key=${d.addr} data-dev=${d.addr} data-kind=${d.kind}
          aria-pressed=${String(d.addr === target)}
          onClick=${() => takeIt(d)}
          class="ms-reveal text-left py-2 border-b border-base-content/10 last:border-0 rounded-[var(--ms-r-in)] transition-colors hover:bg-base-content/5">
          <span class="flex items-center gap-2 min-w-0">
            ${Icon(KIND_ICON[d.kind], `text-[length:var(--ms-icon)] shrink-0 ${d.kind === "ble" ? "text-[var(--app-accent)]" : "text-base-content/70"}`)}
            <span class="flex-1 min-w-0 truncate">${labelOf(d, t)}</span>
            ${d.cls?.separated ? html`<span data-sep class="shrink-0 font-mono uppercase tracking-wide text-[length:var(--ms-label)] px-1.5 rounded-full border border-[var(--app-accent)]">${T(t, "sepTag")}</span>` : null}
            <span data-pct class="shrink-0 font-mono tabular-nums text-base-content">${d.percent}%</span>
          </span>
          ${/* The meter is the percentage made visible. transition-[width] and nothing else: the material
               IS box-shadow here, so `all` would cross-fade the surrounding extrusion on every tick. */""}
          <span class="mt-1.5 block h-1 rounded-full bg-base-content/10 overflow-hidden">
            <span class="block h-full rounded-full transition-[width] duration-500 ${d.kind === "ble" ? "bg-[var(--app-accent)]" : "bg-base-content/60"}"
              style=${`width:${d.percent}%`}></span>
          </span>
          ${/* The manufacturer appears only where the address actually has one — an AP's BSSID, a public
               BLE address. A rotating address gets the word "rotating" instead, which is the true
               statement about it; naming a vendor there would be inventing one. */""}
          <span class="mt-1 block font-mono text-[length:var(--ms-label)] text-base-content/70">
            ${(() => { const v = vendorOf(d.addr, d.kind, oui); return v ? html`<span data-vendor>${v}</span> · ` : null; })()}
            ${T(t, "band_" + band(d.smooth ?? d.rssi))} · ${Math.round(d.smooth ?? d.rssi)} dBm${rotates(d.addr) && d.kind === "ble" ? " · " + T(t, "rotating") : ""}
            ${/* The same honesty rule as the vendor above, for the other radio: a cell states the
                 identifiers it actually broadcast, and a neighbour that gave none stays bare. CID and LAC
                 are protocol abbreviations, so they are not translated — no more than dBm is. */""}
            ${d.cid || d.lac
              ? html` · <span data-cellid>${[d.cid ? `CID ${d.cid}` : null, d.lac ? `LAC ${d.lac}` : null].filter(Boolean).join(" · ")}</span>`
              : null}
          </span>
        </button>`)}
      </div>
    <//>

    ${/* WHERE IT WAS SURVEYED — the answer as a place, not as two numbers. The halo is the accuracy the
         database reported, drawn at the same scale as the dot so the reader sees the uncertainty instead of
         being told it; the globe never spins under an answer. Coordinates stay in the readout because a
         person copying them into a map needs them exactly. */""}
    <${Sheet} id="where" open=${screen === "where"} onClose=${closeScreen} title=${T(t, "whereTitle")} icon="lucide:globe">
      ${/* The globe is mounted only while the sheet is OPEN. A Sheet keeps its children in the DOM, and a
           canvas that measures itself inside a hidden box takes a zero size: the projection came out at the
           wrong scale and the accuracy halo landed a continent away from its own dot (measured on the see
           pod, 2026-09-04). Mounting on open makes it measure the box it will actually be seen in. */""}
      ${mine?.v?.found && screen === "where"
        ? html`<div data-where class="flex flex-col gap-[var(--ms-gap)]">
          ${/* Literal colours, not tokens: these are canvas fillStyle values, and a canvas cannot read a CSS
               custom property — an unresolvable string leaves the previous fill in place, which is how the
               halo came out as a filled continent. The pair is the luminous amber at two alphas. */""}
          <${Globe} points=${[
            { lat: mine.v.lat, lon: mine.v.lon, r: 16, color: "rgba(242,184,75,.16)" },
            { lat: mine.v.lat, lon: mine.v.lon, r: 5, color: "#F2B84B" },
          ]} focus=${{ lat: mine.v.lat, lon: mine.v.lon }} spin=${false} height=${300} />
          <div class="font-mono tabular-nums">${mine.v.lat.toFixed(5)}, ${mine.v.lon.toFixed(5)}</div>
          <div class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-muted">
            ${T(t, "accuracy")} ±${Math.round(mine.v.accuracy || 0)} m · ${T(t, "source")} ${mine.v.source}
          </div>
        </div>`
        : html`<div class="text-sm text-muted">${T(t, "no_unknown")}</div>`}
    <//>
  </div>`;
}

// ── hunt ──────────────────────────────────────────────────────────────────────────────────────────────
// The one screen where a direction can exist at all, and only because the user physically sweeps the
// phone. df.js withholds the bearing until the petal is a lobe rather than a circle — with the stock
// omnidirectional antenna it stays a circle, which is the instrument showing its own limit by its shape.
export function huntView({ S, t, screen, openScreen, closeScreen }) {
  const field = useField(S);
  const target = useStore($target);
  useStore($roseAt);
  const dev = field.find((d) => d.addr === target) || null;
  const stats = roseStats(rose);
  const locked = hasBearing(stats);
  const p = petal(rose);
  let max = 0;
  for (let i = 0; i < p.length; i++) max = Math.max(max, p[i]);

  const path = [];
  for (let i = 0; i < p.length; i++) {
    const a = ((i + 0.5) / p.length) * Math.PI * 2 - Math.PI / 2;
    const r = 12 + (max > 0 ? (p[i] / max) * 30 : 0);
    path.push(`${i ? "L" : "M"}${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`);
  }
  const dPath = path.join(" ") + " Z";

  // Both rotations are unwrapped to the nearest equivalent angle so their transitions always take the
  // short arc — 359° → 1° must never spin the long way round, on the needle OR on the dial.
  const angRef = useRef(0);
  if (stats.bearingDeg !== null) angRef.current = unwrapDeg(angRef.current, stats.bearingDeg);
  const hdg = useStore($heading);
  const dialRef = useRef(0);
  dialRef.current = unwrapDeg(dialRef.current, hdg);
  const trend = dev ? sightTrend(dev.sightings) : null;

  // The arrow exists from the FIRST sample — provisional (dashed, half-lit, inside a wide uncertainty
  // wedge) until df.js's gates are earned, then solid. The wedge IS the honesty: its span is the
  // concentration the sweep has actually achieved, so a guess and a bearing can never look alike.
  const spread = Math.max(12, Math.min(80, 90 * (1 - stats.r)));
  const wx = (a, r) => (50 + r * Math.sin((a * Math.PI) / 180)).toFixed(2);
  const wy = (a, r) => (50 - r * Math.cos((a * Math.PI) / 180)).toFixed(2);
  const wedge = `M50 50 L${wx(-spread, 40)} ${wy(-spread, 40)} A40 40 0 0 1 ${wx(spread, 40)} ${wy(spread, 40)} Z`;

  // The same in-flow island + .ms-side structure as the comb, for the same overlap reason.
  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
    <${Stage}>
      <div class="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 100 100" class="w-full h-full max-h-full text-base-content" role="img"
          aria-label=${T(t, locked ? "aLobe" : "aCircle")}>
          <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.18" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.18" />
          ${/* The lubber line — the phone's own forward direction, fixed to the glass. The dial under it
               is heading-up: the WORLD rotates, so walking the arrow onto the lubber walks you onto the
               strongest observed direction. */""}
          <path d="M47.4 2.6 L52.6 2.6 L50 7.6 Z" fill="currentColor" opacity="0.65" />
          <g class="hv-dial" style=${`transform:rotate(${(-dialRef.current).toFixed(1)}deg)`}>
            ${/* A compass rose before it is a measurement: without ticks an unswept screen is two bare
                 circles, which reads as a draw failure rather than an instrument waiting. The accent tick
                 is true north, and it moves because the world does. */
              Array.from({ length: 36 }, (_, i) => {
                const a = (i * 10 * Math.PI) / 180 - Math.PI / 2;
                const major = i % 9 === 0;
                const r0 = major ? 36 : 39.5;
                return html`<line key=${i} x1=${(50 + Math.cos(a) * r0).toFixed(2)} y1=${(50 + Math.sin(a) * r0).toFixed(2)}
                  x2=${(50 + Math.cos(a) * 42).toFixed(2)} y2=${(50 + Math.sin(a) * 42).toFixed(2)}
                  stroke="currentColor" stroke-width=${major ? 0.7 : 0.35} opacity=${major ? 0.45 : 0.2}
                  class=${i === 0 ? "text-[var(--app-accent)]" : ""} />`;
              })}
            ${/* The petal morphs: CSS can transition `d` when the point count is fixed, and ours is always
                 72 + Z, so every new sample reshapes the lobe instead of redrawing it. The attribute stays
                 as the fallback; the style wins where transitions exist. */""}
            ${max > 0 ? html`<path data-petal d=${dPath} style=${`d:path('${dPath}')`}
              fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="0.7"
              class=${`hv-petal text-[var(--app-accent)] ${gate ? "" : "hv-e-in"}`} />` : null}
            ${stats.bearingDeg !== null ? html`<g data-bearing
              class=${`hv-rose text-[var(--app-accent)] ${gate ? "" : "hv-e-in"}`}
              style=${`transform:rotate(${angRef.current.toFixed(1)}deg)`} opacity=${locked ? 1 : 0.55}>
              <path class="hv-petal" d=${wedge} style=${`d:path('${wedge}')`} fill="currentColor" fill-opacity="0.1" />
              <line x1="50" y1="50" x2="50" y2="10" stroke="currentColor" stroke-width=${locked ? 1.4 : 0.9}
                stroke-dasharray=${locked ? "none" : "2.5 2"} stroke-linecap="round" />
              <path d="M50 5.5 L46.6 13 L53.4 13 Z" fill="currentColor" />
            </g>` : null}
          </g>
          ${/* The live strength, fixed to the glass in the dial's empty centre — the hot/cold half of
               "lead me there": the number rises as you close in. The trend mark appears only past the
               6 dB median test (sightTrend) — a stationary trace wanders less than that on its own. */""}
          ${dev ? html`<g data-strength class="font-mono">
            <text x="50" y="53" text-anchor="middle" font-size="10.5" fill="currentColor"
              class="text-base-content font-mono">${dev.percent}</text>
            <text x="50" y="58.6" text-anchor="middle" font-size="3.2" fill="currentColor"
              class="text-base-content font-mono" opacity="0.55">${Math.round(dev.smooth ?? dev.rssi)} dBm</text>
            ${trend === "up" ? html`<path data-trend="up" d="M50 38 L47.4 42 L52.6 42 Z"
              fill="currentColor" class="text-[var(--app-accent)]" />` : null}
            ${trend === "down" ? html`<path data-trend="down" d="M50 42 L47.4 38 L52.6 38 Z"
              fill="currentColor" class="text-base-content" opacity="0.5" />` : null}
          </g>` : null}
        </svg>
      </div>
    <//>

    <div class="ms-side-main flex flex-col justify-end items-center pb-[var(--ms-gap)]">
      <${Island} className="w-full max-w-md">
        <div class="flex items-center gap-[var(--ms-gap)] min-w-0">
          <${ScanButton} t=${t} />
          <button data-pick class="btn btn-sm btn-ghost gap-2 min-w-0 flex-1 justify-start" onClick=${() => openScreen("pick")}>
            ${Icon("lucide:crosshair")}<span class="truncate">${dev ? labelOf(dev, t) : T(t, "pickTarget")}</span>
          </button>
        </div>
        ${/* Not hint text — a measurement. Coverage below df.js's gate is WHY no bearing is shown, and
             hiding it would make a working instrument look broken. */""}
        <div data-live class="font-mono uppercase tracking-wide text-[length:var(--ms-label)]">
          <div class="text-base-content truncate">${locked
            ? T(t, "strongestAt").replace("{deg}", Math.round(stats.bearingDeg))
            : T(t, "coverage").replace("{pct}", Math.round(stats.coverage * 100))}${
              stats.coverage < BEARING_MIN_COVERAGE && stats.samples > 0 ? " · " + T(t, "keepSweeping") : ""}</div>
          <div class="text-base-content/70 truncate">
            ${T(t, "concentration")} ${stats.r.toFixed(2)} · ${T(t, "samples")} ${stats.samples}
          </div>
        </div>
      <//>
    </div>

    <${Sheet} id="pick" open=${screen === "pick"} onClose=${closeScreen} title=${T(t, "pickTarget")} icon="lucide:crosshair">
      <div class="flex flex-col gap-1">
        ${field.filter((d) => d.kind === "ble").map((d) => html`<button key=${d.addr} data-pick-dev=${d.addr}
          aria-pressed=${String(d.addr === target)}
          onClick=${() => { $target.set(d.addr); if (gate) seedRose(); else { rose = newRose(72, HUNT_TAU); $roseAt.set(Date.now()); } closeScreen(); }}
          class="btn btn-ghost justify-start h-auto min-h-0 py-2 rounded-[var(--ms-r-in)]">
          <span class="flex-1 min-w-0 text-left">
            <span class="block truncate">${labelOf(d, t)}</span>
            <span class="block font-mono text-[length:var(--ms-label)] text-base-content/70">${d.percent}% · ${Math.round(d.smooth ?? d.rssi)} dBm</span>
          </span>
        </button>`)}
        ${field.filter((d) => d.kind === "ble").length === 0
          ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
      </div>
    <//>
  </div>`;
}

// ── guard ─────────────────────────────────────────────────────────────────────────────────────────────
export function guardView({ S, t }) {
  const field = useField(S);
  const scanning = useStore($scanning);
  const fix = useStore($fix);

  const scored = field
    .filter((d) => d.kind === "ble")
    .map((d) => ({ d, s: guardScore({ sightings: d.sightings, separated: !!d.cls?.separated, classifiable: !!d.cls?.classifiable }) }))
    .sort((a, b) => b.s.confidence - a.s.confidence);
  const flagged = scored.filter((x) => x.s.meets);

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Panel} title=${T(t, "guard")}>
      <div class="flex items-center gap-[var(--ms-gap)]"><${ScanButton} t=${t} /></div>
      ${/* The thresholds are OURS. No standard supplies them: DULT specifies the accessory, and its
           platform section is unwritten. Saying so is a correctness statement, not a disclaimer. */""}
      <div data-policy class="text-[length:var(--ms-label)] text-base-content/70">
        ${T(t, "policy")
          .replace("{n}", GUARD.minSightings)
          .replace("{min}", Math.round(GUARD.minSpanMs / 60000))
          .replace("{m}", GUARD.minDisplacementM)}
      </div>
    <//>

    ${flagged.length ? html`<${Panel} title=${T(t, "possible")}>
      ${flagged.map(({ d }) => html`<div key=${d.addr} data-flag=${d.addr} class="flex items-center gap-3">
        ${Icon("lucide:shield-alert", "text-[length:var(--ms-icon)] text-[var(--app-accent)] shrink-0")}
        <span class="flex-1 min-w-0">
          <span class="block truncate">${labelOf(d, t)}</span>
          <span class="block font-mono text-[length:var(--ms-label)] text-base-content/70">${T(t, "separatedNow")}</span>
        </span>
      </div>`)}
    <//>` : null}

    <${Panel} title=${T(t, "watching")}>
      <div data-live class="flex flex-col gap-2">
        ${scored.length === 0 ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
        ${scored.slice(0, 12).map(({ d, s }) => html`<div key=${d.addr} data-watch=${d.addr} class="flex items-start gap-3">
          <span class="font-mono tabular-nums text-[length:var(--ms-label)] text-base-content/70 w-10 shrink-0">
            ${Math.round(s.confidence * 100)}%
          </span>
          <span class="flex-1 min-w-0">
            <span class="flex items-center gap-2 min-w-0">
              <span class="truncate">${labelOf(d, t)}</span>
              ${/* The one row with spec-grade evidence must not look like the rest: a DULT accessory
                   ANNOUNCES separation, where everything else is inference. */
                d.cls?.separated ? html`<span data-sep=${d.addr}
                  class="shrink-0 font-mono uppercase tracking-wide text-[length:var(--ms-label)] px-1.5 rounded-full border border-[var(--app-accent)] text-base-content">
                  ${T(t, "sepTag")}</span>` : null}
            </span>
            ${/* What is MISSING, not a silent negative — and wrapped, never truncated, because the reasons
                 are exactly what differs between rows. */""}
            <span class="block font-mono text-[length:var(--ms-label)] text-base-content/70">
              ${s.reasons.length ? s.reasons.map((r) => T(t, "why_" + r)).join(" · ") : T(t, "allMet")}
            </span>
          </span>
        </div>`)}
      </div>
    <//>

    ${!fix && scanning && !gate ? html`<div data-nofix class="text-[length:var(--ms-label)] text-base-content/70">${T(t, "needFix")}</div>` : null}
  </div>`;
}

// The gate has no radio, so the field is seeded at load: an app whose default shot is empty is
// indistinguishable from one that is broken, and the e2e would be asserting nothing.
if (gate) startScan();
