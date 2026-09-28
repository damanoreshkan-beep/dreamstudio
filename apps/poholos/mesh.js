import { atom, map } from "nanostores";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { permAndroid, refreshHeld, heldPermissions } from "/_rt/permissions.js";

export const $state = atom({ running: false, peerCount: 0, myPeerID: "", nick: "" });
export const $peers = atom([]);
export const $room = atom([]);
export const $threads = map({});
export const $queued = atom(false);
export const $fault = atom(null);
export const $log = atom([]);

const RING = 200;
export function note(kind, text) {
  const line = { t: Date.now(), kind, text: String(text) };
  const next = [...$log.get(), line];
  $log.set(next.length > RING ? next.slice(-RING) : next);
  return line;
}
const faultOf = (e) => ({ code: (e && e.code) || ERR.failed, detail: (e && (e.detail || e.message)) || String(e) });

const env = { scan: 0, presence: 0, pulse: 0, alone: 1, last: 0 };

/** A stable point on the field for an identity — NOT a position in the room. Unit space: [x, y] in
 *  -1..1 with y DOWN (the DOM's way), plus the node's own breathing phase. */
export function siteOf(peerID) {
  let h = 2166136261;
  for (let i = 0; i < peerID.length; i++) { h ^= peerID.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  const rad = 0.55 + (((h >>> 11) & 255) / 255) * 0.45;
  const ph = ((h >>> 19) & 255) / 255;
  return [Math.cos(a) * rad, Math.sin(a) * rad, ph];
}

export const fieldBox = { x: 0, y: 0, w: 0, h: 0 };
/** Pixel centre and radius of the field's layout circle, from the measured box. */
export function fieldGeom() {
  const R = Math.min(fieldBox.w, fieldBox.h) * 0.44;
  return { cx: fieldBox.x + fieldBox.w / 2, cy: fieldBox.y + fieldBox.h / 2, R };
}
/** Viewport pixels of a node — the same numbers the chip is placed at. */
export function placeOf(peerID) {
  const [x, y] = siteOf(peerID);
  const { cx, cy, R } = fieldGeom();
  return { px: cx + x * R, py: cy + y * R };
}
const toUv = (px, py) => {
  const vw = innerWidth, vh = innerHeight, m = Math.min(vw, vh);
  return [(px - vw / 2) / m, (vh / 2 - py) / m];
};

/** GlStage `points`: [me, …one per neighbour], flat [x,y,z,w, …] in viewport uv, capped at the kit's eight. */
export function sites() {
  if (!fieldBox.w) return [];
  const { cx, cy } = fieldGeom();
  const out = [...toUv(cx, cy), 0, 0];
  for (const p of $peers.get().slice(0, 7)) {
    const id = p.peerID || "";
    const { px, py } = placeOf(id);
    out.push(...toUv(px, py), 1, siteOf(id)[2]);
  }
  return out;
}

/** An event just happened — the field answers with one ripple. */
export function bump() { env.pulse = 1; }

/** GlStage `vary`: presence · sweep phase · pulse · alone. */
export function field() {
  const now = performance.now();
  const dt = env.last ? Math.min(0.1, (now - env.last) / 1000) : 0;
  env.last = now;
  const n = $state.get().peerCount;
  const target = Math.min(1, n / 6);
  env.presence += (target - env.presence) * Math.min(1, dt * 2.2);
  env.alone += ((n === 0 ? 1 : 0) - env.alone) * Math.min(1, dt * 2.2);
  env.scan += dt;
  env.pulse = Math.max(0, env.pulse - dt * 0.85);
  return [env.presence, env.scan, env.pulse, env.alone];
}


const live = () => shell.present && shell.has("mesh.start");
const demo = () => gate || (typeof location !== "undefined" && /[?&](mock|demo)=/.test(location.search));
let cancels = [];
let starting = false;
let rescanning = false;
let hiddenAt = 0;

async function startLive() {
  note("call", "mesh.start");
  const { peerID, nick } = await shell.call("mesh.start", {});
  note("ok", `mesh.start → peerID ${peerID || "—"} nick ${nick || "—"}`);
  $state.set({ ...$state.get(), running: true, myPeerID: peerID, nick });
  await checkHeld();
  const data = (name) => (fn) => (v) => { if (v && v.ack !== undefined) return note("ack", name); if (v) fn(v); };
  cancels.push(shell.subscribe("mesh.peers", {}, data("mesh.peers")((list) => {
    const peers = list?.peers || [];
    note("peers", `${peers.length} · ${peers.map((p) => p.nick || p.peerID).join(", ") || "—"}`);
    $peers.set(peers);
    $state.set({ ...$state.get(), peerCount: peers.length });
    bump();
  }), (e) => note("err", `mesh.peers: ${faultOf(e).code} ${faultOf(e).detail}`)));
  cancels.push(shell.subscribe("mesh.messages", {}, data("mesh.messages")((m) => {
    note("in", `${m.kind === "private" ? "private" : "public"} from ${m.nick || m.fromPeerID}: ${m.text}`);
    if (m.kind === "private") {
      const t = $threads.get()[m.fromPeerID] || [];
      $threads.setKey(m.fromPeerID, [...t, { id: m.msgId, text: m.text, ts: m.ts, mine: false }]);
    } else {
      $room.set([...$room.get(), { id: m.msgId, from: m.fromPeerID, nick: m.nick, text: m.text, ts: m.ts, mine: false }]);
    }
  }), (e) => note("err", `mesh.messages: ${faultOf(e).code} ${faultOf(e).detail}`)));
  cancels.push(shell.subscribe("mesh.receipts", {}, data("mesh.receipts")((r) => {
    note("rcpt", `${r.msgId} → ${r.state}`);
    for (const [pid, arr] of Object.entries($threads.get())) {
      const i = arr.findIndex((x) => x.id === r.msgId);
      if (i >= 0) { const copy = arr.slice(); copy[i] = { ...copy[i], status: r.state }; $threads.setKey(pid, copy); }
    }
  }), (e) => note("err", `mesh.receipts: ${faultOf(e).code} ${faultOf(e).detail}`)));
}

async function checkHeld() {
  await refreshHeld();
  const held = heldPermissions();
  if (!held) return;
  const missing = permAndroid("mesh").filter((p) => !held[p]);
  note("perm", missing.length ? `MISSING ${missing.join(", ")}` : `held ${permAndroid("mesh").length}/4`);
  if (missing.length) $fault.set({ code: "denied", detail: missing.join(", ") });
}

export async function start() {
  if ($state.get().running || starting) return;
  starting = true;
  try {
    if (demo()) return await startMock();
    if (live()) {
      try { return await startLive(); }
      catch (e) { const f = faultOf(e); $fault.set(f); note("err", `mesh.start: ${f.code} ${f.detail}`); return; }
    }
    note("idle", shell.present ? `no mesh.start on this bridge (v${shell.version})` : "no shell — browser");
    $state.set({ ...$state.get(), running: true, myPeerID: "", nick: $state.get().nick || "" });
  } finally { starting = false; }
}
export function stop() { cancels.forEach((c) => c && c()); cancels = []; }

export async function rescan() {
  if (rescanning) return;
  rescanning = true;
  try {
    note("rescan", "manual restart of the mesh transport");
    stop();
    if (live()) {
      note("call", "mesh.stop");
      try { const r = await shell.call("mesh.stop", {}); note("ok", `mesh.stop → running ${r?.running}`); }
      catch (e) { const f = faultOf(e); note("err", `mesh.stop: ${f.code} ${f.detail}`); }
    }
    $fault.set(null);
    $state.set({ ...$state.get(), running: false });
    await start();
  } finally { rescanning = false; }
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
    if (document.visibilityState === "visible" && live() && $state.get().running) {
      if (Date.now() - hiddenAt < 3000) return;
      note("wake", "foreground — rescanning the mesh transport");
      rescan();
    }
  });
}

export async function setNick(nick) {
  $state.set({ ...$state.get(), nick });
  if (live()) await shell.call("mesh.setNick", { name: nick });
}

export async function sendPublic(text) {
  text = text.trim(); if (!text) return;
  const msg = { id: rid(), from: $state.get().myPeerID, nick: $state.get().nick, text, ts: Date.now(), mine: true };
  $room.set([...$room.get(), msg]);
  $queued.set($state.get().peerCount === 0);
  if (!live()) return;
  note("out", `public: ${text}`);
  try { await shell.call("mesh.sendPublic", { text }); }
  catch (e) { const f = faultOf(e); $fault.set(f); note("err", `mesh.sendPublic: ${f.code} ${f.detail}`); }
}

export async function sendPrivate(peerID, text) {
  text = text.trim(); if (!text) return;
  const t = $threads.get()[peerID] || [];
  const msg = { id: rid(), text, ts: Date.now(), mine: true, status: "sent" };
  $threads.setKey(peerID, [...t, msg]);
  if (live()) {
    note("out", `private → ${peerID}: ${text}`);
    try { await shell.call("mesh.sendPrivate", { peerID, text }); }
    catch (e) { const f = faultOf(e); $fault.set(f); note("err", `mesh.sendPrivate: ${f.code} ${f.detail}`); }
  } else mockAck(peerID, msg.id);
}

const rid = () => Math.random().toString(36).slice(2, 10);

export async function diagnose() {
  const d = {
    at: new Date().toISOString(),
    shell: shell.present ? `bridge ${shell.version} (catalogue ${shell.catalogueVersion})` : "absent — plain browser",
    capability: shell.hasCapability("mesh") ? "granted" : `no — ${shell.whyCapability("mesh") || "unknown"}`,
    meshStart: shell.has("mesh.start") ? "available" : `no — ${shell.why("mesh.start") || "unknown"}`,
    needs: permAndroid("mesh"),
    caps: null, device: null,
    held: null, missing: null, locationOn: null, ble: null, mesh: null, bridgeLog: null,
    state: { ...$state.get() }, fault: $fault.get(),
  };
  if (!shell.present) return d;
  try {
    const info = await shell.call("system.info", {});
    d.held = info.perms || null;
    d.caps = info.caps ?? null;
    d.device = `${info.model || "?"} · Android ${info.release || "?"} (sdk ${info.sdk ?? "?"}) · ${info.pkg || "?"} · bridge ${info.bridge ?? "?"}`;
    d.locationOn = info.locationOn ?? null;
    if (d.held) d.missing = d.needs.filter((p) => !d.held[p]);
  } catch (e) { d.held = `system.info failed: ${faultOf(e).code}`; }
  try { d.ble = await shell.call("ble.state", {}); } catch (e) { d.ble = `ble.state failed: ${faultOf(e).code}`; }
  try { d.mesh = await shell.call("mesh.state", {}); } catch (e) { d.mesh = `mesh.state failed: ${faultOf(e).code}`; }
  try { d.bridgeLog = (await shell.call("system.logs", {})).lines || []; } catch { d.bridgeLog = null; }
  return d;
}

/** The whole diagnosis and the ring as ONE block of text — what the owner pastes back into the session. */
export function report(d) {
  const L = [];
  L.push(`поголос · ${d.at}`);
  L.push(`device:     ${d.device ?? "—"}`);
  L.push(`shell:      ${d.shell}`);
  L.push(`apk caps:   ${d.caps ?? "—"}`);
  L.push(`  mesh in apk caps: ${d.caps == null ? "—" : d.caps.split(",").map((c) => c.trim()).includes("mesh") ? "yes" : "NO — this install does not carry the mesh flavour"}`);
  L.push(`capability: ${d.capability}`);
  L.push(`mesh.start: ${d.meshStart}`);
  L.push(`needs:      ${d.needs.join(", ") || "—"}`);
  L.push(`held:       ${d.held && typeof d.held === "object" ? d.needs.map((p) => `${p}=${d.held[p] ? "yes" : "NO"}`).join(" ") : d.held ?? "—"}`);
  L.push(`location:   ${d.locationOn === null ? "—" : d.locationOn ? "on" : "OFF — a BLE scan returns empty with no error"}`);
  L.push(`ble:        ${typeof d.ble === "object" && d.ble ? JSON.stringify(d.ble) : d.ble ?? "—"}`);
  L.push(`mesh:       ${typeof d.mesh === "object" && d.mesh ? JSON.stringify(d.mesh) : d.mesh ?? "—"}`);
  L.push(`page state: ${JSON.stringify(d.state)}`);
  L.push(`fault:      ${d.fault ? `${d.fault.code} ${d.fault.detail}` : "none"}`);
  L.push("");
  L.push("-- events (page) --");
  for (const l of $log.get()) L.push(`${new Date(l.t).toISOString().slice(11, 19)} ${l.kind.padEnd(5)} ${l.text}`);
  L.push("");
  L.push("-- bridge (system.logs) --");
  for (const l of d.bridgeLog || []) L.push(String(l));
  return L.join("\n");
}

function startMock() {
  const me = "you";
  note("mock", "no transport — the deterministic demo is driving this screen");
  $state.set({ running: true, peerCount: 0, myPeerID: me, nick: $state.get().nick || "anon4f2a" });
  const q = typeof location !== "undefined" ? location.search : "";
  if (/[?&]mock=empty/.test(q)) return;
  const peersOnly = /[?&]mock=peers/.test(q);
  const seed = () => {
    note("peers", "2 · anon5aa3, мандрівник");
    $peers.set([
      { peerID: "a454fd4358ecdfbd", nick: "anon5aa3" },
      { peerID: "0f6821b7c93e4a15", nick: "мандрівник" },
    ]);
    $state.set({ ...$state.get(), peerCount: 2 });
    bump();
    if (peersOnly) return;
    $room.set([
      { id: "m1", from: "a454fd4358ecdfbd", nick: "anon5aa3", text: "є хтось поруч?", ts: Date.now() - 60000, mine: false },
      { id: "m2", from: "you", nick: "anon4f2a", text: "є, чую тебе", ts: Date.now() - 40000, mine: true },
      { id: "m3", from: "0f6821b7c93e4a15", nick: "мандрівник", text: "передайте далі, я почув", ts: Date.now() - 20000, mine: false },
    ]);
    $threads.set({ "a454fd4358ecdfbd": [
      { id: "d1", text: "привіт напряму", ts: Date.now() - 30000, mine: false },
      { id: "d2", text: "привіт, шифровано", ts: Date.now() - 25000, mine: true, status: "read" },
    ] });
  };
  if (gate) { seed(); return; }
  setTimeout(seed, 900);
}
function mockAck(peerID, id) {
  const bump = (status, d) => setTimeout(() => {
    const arr = $threads.get()[peerID] || []; const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) { const c = arr.slice(); c[i] = { ...c[i], status }; $threads.setKey(peerID, c); }
  }, d);
  bump("delivered", 500); bump("read", 1400);
}
