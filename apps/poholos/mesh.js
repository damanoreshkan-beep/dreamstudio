// Поголос — the PAGE side of the BLE mesh. The transport is native (the shell's `mesh` flavour, vendored
// bitchat — docs/research/ble-mesh-build.md §5.5); this file is the thin client the UI talks to, and NOTHING
// here is protocol: it forwards to `/_rt/shell.js` `mesh.*` actions when the APK provides them, and runs a
// deterministic MOCK everywhere else so the screen renders in a browser, in the eye (?mock / gate) and in
// e2e. Candidate for promotion to core `runtime/meshstage.js` once the flavour ships; kept local for the
// first build (the same way mirage kept a local imagejob copy).
import { atom, map } from "nanostores";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { permAndroid, refreshHeld, heldPermissions } from "/_rt/permissions.js";

// ── stores the views read ────────────────────────────────────────────────────────────────────────
export const $state = atom({ running: false, peerCount: 0, maxHops: 0, myPeerID: "", nick: "" });
export const $peers = atom([]);          // [{ peerID, nick, hops, lastSeen }]
export const $room = atom([]);           // public messages, oldest→newest: { id, from, nick, text, ts, mine, sys }
export const $threads = map({});         // peerID → [{ id, text, ts, mine, status }]
export const $queued = atom(false);      // a public send with no one nearby → store-and-forward
export const $fault = atom(null);        // { code, detail } — the transport refused, and the room says so
export const $log = atom([]);            // the app's own ring: what we asked the bridge, what came back

// ── the ring ─────────────────────────────────────────────────────────────────────────────────────
// A radio bug is invisible: nothing crashes, nobody answers, and the honest empty state looks exactly
// like a broken one. Every crossing of the bridge is noted here so the «Логи» tab can be copied out of
// the phone verbatim — this is the only way a two-device test says anything at all.
const RING = 200;
export function note(kind, text) {
  const line = { t: Date.now(), kind, text: String(text) };
  const next = [...$log.get(), line];
  $log.set(next.length > RING ? next.slice(-RING) : next);
  return line;
}
const faultOf = (e) => ({ code: (e && e.code) || ERR.failed, detail: (e && (e.detail || e.message)) || String(e) });

const live = () => shell.present && shell.has("mesh.start");
// The mock is ONLY for the eye and e2e (gate) and an explicit ?mock/?demo — NEVER a real browser or an APK
// without the mesh flavour. A live user with no transport must see the honest empty state, not fabricated
// peers and messages: an app that invents conversations is an app that lies.
const demo = () => gate || (typeof location !== "undefined" && /[?&](mock|demo)=/.test(location.search));
let cancels = [];

// ── real transport (APK) ─────────────────────────────────────────────────────────────────────────
async function startLive() {
  note("call", "mesh.start");
  const { peerID, nick } = await shell.call("mesh.start", {});
  note("ok", `mesh.start → peerID ${peerID || "—"} nick ${nick || "—"}`);
  $state.set({ ...$state.get(), running: true, myPeerID: peerID, nick });
  // The shell asks Android for the four permissions and then runs the action REGARDLESS of the answer
  // (ShellBridge.withPermissions). So a refused BLUETOOTH_ADVERTISE looks exactly like an empty room:
  // the node starts, nothing is transmitted, nothing fails. Read back what the OS actually held.
  await checkHeld();
  // EVERY subscribe is answered with a control frame — `stream(id, ackFrame())` runs before any logic, so
  // the first thing each of these three streams delivers is `{ack:true}`, not data. Taking it for data put
  // an empty "Invalid Date" bubble in the room and, worse, reset the neighbour count to zero on `peers`.
  const data = (name) => (fn) => (v) => { if (v && v.ack !== undefined) return note("ack", name); if (v) fn(v); };
  cancels.push(shell.subscribe("mesh.peers", {}, data("mesh.peers")((list) => {
    const peers = list?.peers || [];
    note("peers", `${peers.length} · ${peers.map((p) => `${p.nick}/${p.hops}h`).join(", ") || "—"}`);
    $peers.set(peers);
    $state.set({ ...$state.get(), peerCount: peers.length, maxHops: Math.max(0, ...peers.map((p) => p.hops || 0)) });
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

// What the OS actually granted, versus what the mesh capability rests on. A missing one is THE fault:
// the node runs and stays silent, which no other signal in the app distinguishes from an empty room.
async function checkHeld() {
  await refreshHeld();
  const held = heldPermissions();
  if (!held) return;
  const missing = permAndroid("mesh").filter((p) => !held[p]);
  note("perm", missing.length ? `MISSING ${missing.join(", ")}` : `held ${permAndroid("mesh").length}/4`);
  if (missing.length) $fault.set({ code: "denied", detail: missing.join(", ") });
}

export async function start() {
  if ($state.get().running) return;
  // demo FIRST: under the eye/e2e `gate` makes the bridge report present with single-event catalogue mocks,
  // which would show one stray message. Our own mock paints a full, deterministic conversation instead.
  if (demo()) return startMock();
  if (live()) {
    // Never let this reject into nothing: an unhandled rejection here left `running` false, the room
    // showing "no one nearby", and the actual reason — a refused permission, a stale bridge — nowhere.
    try { return await startLive(); }
    catch (e) { const f = faultOf(e); $fault.set(f); note("err", `mesh.start: ${f.code} ${f.detail}`); return; }
  }
  note("idle", shell.present ? `no mesh.start on this bridge (v${shell.version})` : "no shell — browser");
  // Honest idle: no transport here (a plain browser, or the APK before the mesh flavour exists). Running,
  // but zero peers and zero messages — the room shows "quiet / no one nearby", which is the truth.
  $state.set({ ...$state.get(), running: true, myPeerID: "", nick: $state.get().nick || "" });
}
export function stop() { cancels.forEach((c) => c && c()); cancels = []; }

export async function setNick(nick) {
  $state.set({ ...$state.get(), nick });
  if (live()) await shell.call("mesh.setNick", { name: nick });
}

export async function sendPublic(text) {
  text = text.trim(); if (!text) return;
  const msg = { id: rid(), from: $state.get().myPeerID, nick: $state.get().nick, text, ts: Date.now(), mine: true };
  $room.set([...$room.get(), msg]);
  $queued.set($state.get().peerCount === 0);       // no one to hear it yet → it waits
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

// ── diagnosis ────────────────────────────────────────────────────────────────────────────────────
// One reading of every gate between the page and the air, in the order they can fail. Nothing is
// inferred: each field is what a call answered, or null because the call could not be made. The two
// silent killers are first — a refused Android permission, and location services off, which makes a
// BLE scan return an empty result with no error at all.
export async function diagnose() {
  const d = {
    at: new Date().toISOString(),
    shell: shell.present ? `bridge ${shell.version} (catalogue ${shell.catalogueVersion})` : "absent — plain browser",
    capability: shell.hasCapability("mesh") ? "granted" : `no — ${shell.whyCapability("mesh") || "unknown"}`,
    meshStart: shell.has("mesh.start") ? "available" : `no — ${shell.why("mesh.start") || "unknown"}`,
    needs: permAndroid("mesh"),
    // What the INSTALLED apk actually grants, from its own baked-in bridge config. The page's own
    // catalogue can say "available" while the Java side refuses: `allowed()` matches the action's
    // capability against THIS string, so when the two disagree, this is the half that decides.
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

// ── the mock (browser / eye / e2e) ─────────────────────────────────────────────────────────────
// Deterministic under the gate so shots and e2e never flake; a light simulation in a plain browser so the
// app is explorable. Two neighbours, one two hops away, a short public thread — a POPULATED screen.
function startMock() {
  const me = "you";
  note("mock", "no transport — the deterministic demo is driving this screen");
  $state.set({ running: true, peerCount: 0, maxHops: 0, myPeerID: me, nick: $state.get().nick || "anon4f2a" });
  // `?mock=empty` demos the empty state in the eye (no peers, no messages) — so every state is shootable.
  if (typeof location !== "undefined" && /[?&]mock=empty/.test(location.search)) return;
  const seed = () => {
    note("peers", "2 · anon5aa3/1h, мандрівник/2h");
    $peers.set([
      { peerID: "5aa3", nick: "anon5aa3", hops: 1, lastSeen: Date.now() },
      { peerID: "0f68", nick: "мандрівник", hops: 2, lastSeen: Date.now() - 8000 },
    ]);
    $state.set({ ...$state.get(), peerCount: 2, maxHops: 2 });
    $room.set([
      { id: "m1", from: "5aa3", nick: "anon5aa3", text: "є хтось поруч?", ts: Date.now() - 60000, mine: false },
      { id: "m2", from: "you", nick: "anon4f2a", text: "є, чую тебе", ts: Date.now() - 40000, mine: true },
      { id: "m3", from: "0f68", nick: "мандрівник", text: "передайте далі — я за два стрибки", ts: Date.now() - 20000, mine: false },
    ]);
    $threads.set({ "5aa3": [
      { id: "d1", text: "привіт напряму", ts: Date.now() - 30000, mine: false },
      { id: "d2", text: "привіт, шифровано", ts: Date.now() - 25000, mine: true, status: "read" },
    ] });
  };
  if (gate) { seed(); return; }        // instant, fixed — the eye/e2e see the full screen
  setTimeout(seed, 900);               // a plain browser watches neighbours "appear"
}
function mockAck(peerID, id) {
  const bump = (status, d) => setTimeout(() => {
    const arr = $threads.get()[peerID] || []; const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) { const c = arr.slice(); c[i] = { ...c[i], status }; $threads.setKey(peerID, c); }
  }, d);
  bump("delivered", 500); bump("read", 1400);
}
