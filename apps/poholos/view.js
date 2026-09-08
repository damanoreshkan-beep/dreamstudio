// Поголос — the two rooms of an off-grid mesh. Pure UI over mesh.js (the bridge + its honest mock). The
// modern shape: a scrolling feed between two glass ISLANDS — presence on top, the composer at the bottom —
// with tailed bubbles. All depth comes from the kit's Island/surfaces, nothing hand-rolled.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { persistentAtom } from "@nanostores/persistent";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island } from "/_rt/ui.js";
import { permRequest } from "/_rt/permissions.js";
import { shell } from "/_rt/shell.js";
import { GlStage } from "/_rt/glstage.js";
import { start, rescan, sendPublic, sendPrivate, setNick, diagnose, report, field, sites, placeOf, fieldGeom, fieldBox, bump, $state, $peers, $room, $threads, $queued, $fault, $log } from "./mesh.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
// A timestamp the transport did not send is nothing, never "Invalid Date": a bubble that shows the string
// the Date constructor produced is the app printing its own bug at the user.
const clock = (ts, loc) => Number.isFinite(ts) ? new Date(ts).toLocaleTimeString(loc === "uk" ? "uk-UA" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "";
const near = (t, n) => n === 0 ? T(t, "nearNone") : n === 1 ? T(t, "nearOne") : T(t, "nearMany", { n });
const RCPT = { sent: "rcptSent", delivered: "rcptDelivered", read: "rcptRead", queued: "rcptQueued" };

const $peer = atom(null);   // the open private thread, or null for the peer list

// ── identity + unread, both the PAGE's own copy (persisted here; the native side is told via setNick) ──
// The nick the owner chose, remembered on THIS device. The native mesh persists its own copy too, but the
// page needs one so the map's «me» node reads right on a cold open before the bridge has answered.
const $nick = persistentAtom("poholos:nick", "", { encode: String, decode: String });
// peerID → the ts we last OPENED that thread at. A private line newer than that is unread — the answer to
// "who is writing to me". Persisted so the badge survives a reload; a plain object through JSON.
const JC = (init) => ({ encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return init; } } });
const $seen = persistentAtom("poholos:seen", {}, JC({}));
const lastIn = (msgs) => { let t = 0; for (const m of msgs || []) if (!m.mine && Number.isFinite(m.ts) && m.ts > t) t = m.ts; return t; };
const isUnread = (peerID, threads, seen) => lastIn(threads[peerID]) > (seen[peerID] || 0);
const markSeen = (peerID) => { const cur = $seen.get(); if ((cur[peerID] || 0) < Date.now()) $seen.set({ ...cur, [peerID]: Date.now() }); };
// push the remembered nick to the native side once the transport is up (idempotent; no-op under the mock)
const ensureNick = () => { const n = $nick.get(); if (n && n !== $state.get().nick) setNick(n); };

// The field's colour is the THEME's accent, read from the cascade rather than written here twice: a hex
// copied into JS is right until the material changes and then quietly wrong. getComputedStyle resolves
// whatever colour space the token is in, so this survives oklch. Cached — it is read every frame, and the
// theme can only change on a toggle, so a re-read twice a second is plenty.
const acc = { rgb: [0.35, 0.84, 0.88, 1], at: 0, probe: null };
function accent() {
  const now = performance.now();
  if (now - acc.at < 500) return acc.rgb;
  acc.at = now;
  try {
    if (!acc.probe) {
      acc.probe = document.createElement("span");
      acc.probe.style.cssText = "position:absolute;width:0;height:0;color:var(--app-accent)";
      document.body.appendChild(acc.probe);
    }
    const m = getComputedStyle(acc.probe).color.match(/[\d.]+/g);
    if (m && m.length >= 3) acc.rgb = [+m[0] / 255, +m[1] / 255, +m[2] / 255, 1];
  } catch { /* no DOM (preflight) — the fallback above is the accent's own value */ }
  return acc.rgb;
}

// ── presence: the one honest number, a glass chip that floats atop the feed ────────────────────────
function Presence({ t, tone = "glass" }) {
  const s = useStore($state);
  const alone = s.peerCount === 0;
  return html`<${Island} tone=${tone} className="self-start !py-1.5 !pl-3 !pr-1.5 rounded-full">
    <div class="flex items-center gap-2">
      <div class="ph-near">
        <span class="ph-dot" data-alone=${alone ? "1" : "0"}></span>
        <span>${near(t, s.peerCount)}</span>
      </div>
      <button class="ph-rescan" data-rescan aria-label=${T(t, "rescan")}
        title=${T(t, "rescan")} onClick=${() => { rescan(); bump(); }}>
        ${Icon("lucide:refresh-cw")}
      </button>
    </div>
  <//>`;
}

// ── the field of who is within earshot ─────────────────────────────────────────────────────────────
// A node's point comes from the hash of its peerID, so the same person is always the same place on the
// screen — and that place says NOTHING about distance or direction. The bridge sends { peerID, nick }
// and no geometry at all, so a radar with range rings would be invented; the caption says as much.
// The shader draws the sweep and a well per node; these chips are the same nodes in the DOM, because
// the DOM is the only thing axe, e2e and a screen reader can see.
// The stage is `fixed inset-0` by contract — it is the SCREEN's background, not a panel inside one. Mounted
// with the kit's own default it sits UNDER in-flow content; `z-0` put it over the glass islands, which then
// rendered into the DOM and were invisible in the shot.
function Field({ t, peers, onPeer }) {
  const s = useStore($state);
  const nick = useStore($nick);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const myName = nick || s.nick || "";
  // the owner's name, edited in place ON the map (M5 parity): the «me» node IS the field's identity, so it
  // is where the nick is set — no separate settings screen. Persisted here + pushed to the native mesh.
  const openEdit = () => { setDraft(myName); setEditing(true); };
  const commit = () => { const v = draft.trim().slice(0, 24); if (v) { $nick.set(v); setNick(v); } setEditing(false); };
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  // The box is MEASURED, and re-measured whenever it moves: the chrome above and below it changes with
  // the density step and the split shapes, and a chip placed from an assumed box lands under the composer.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      Object.assign(fieldBox, { x: r.left, y: r.top, w: r.width, h: r.height });
      setBox({ w: r.width, h: r.height });
    };
    read();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    ro?.observe(el);
    addEventListener("resize", read);
    return () => { ro?.disconnect(); removeEventListener("resize", read); };
  }, []);
  const at = (px, py) => `left:${px - fieldBox.x}px;top:${py - fieldBox.y}px`;
  const { cx, cy } = fieldGeom();
  return html`<div class="ph-field" data-peers=${peers.length}>
    <div class="ph-sites" ref=${ref}>
      ${box.w > 0 && peers.slice(0, 7).map((p) => {
        const { px, py } = placeOf(p.peerID || "");
        return html`<button key=${p.peerID} data-node=${p.peerID} class="ph-site" style=${at(px, py)}
          onClick=${() => onPeer(p.peerID)}>
          <span class="ph-site-dot"></span>
          <span class="ph-site-label">
            <span class="ph-site-name">${p.nick || p.peerID.slice(0, 6)}</span>
            <span class="ph-site-id">${(p.peerID || "").slice(0, 4)}</span>
          </span>
        </button>`;
      })}
      <div class="ph-site ph-site-me" style=${box.w > 0 ? at(cx, cy) : "left:50%;top:50%"}>
        <span class="ph-site-dot"></span>
        <span class="ph-site-label">
          ${editing
            ? html`<span class="ph-nick-edit">
                <input class="ph-nick-input" data-nick-input autofocus value=${draft} maxLength="24"
                  placeholder=${T(t, "you")} aria-label=${T(t, "nick")} spellcheck="false"
                  onInput=${(e) => setDraft(e.currentTarget.value)}
                  onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { setEditing(false); } }} />
                <button class="ph-nick-save" data-nick-save aria-label=${T(t, "send")} onClick=${commit}>${Icon("lucide:check")}</button>
              </span>`
            : html`<button class="ph-site-name ph-me-edit" data-me aria-label=${T(t, "nick")}
                title=${T(t, "nick")} onClick=${openEdit}>${myName || T(t, "you")}</button>`}
        </span>
      </div>
    </div>
    ${/* one line while the field is empty — the kit's Empty shape; once people are here the field is self-evident and carries no caption */""}
    ${s.peerCount === 0 && html`<p class="ph-field-note">${T(t, "fieldSearching")}</p>`}
  </div>`;
}

// ── the composer, a floating island at the bottom ──────────────────────────────────────────────────
function Composer({ t, placeholder, onSend, tone = "glass" }) {
  const [text, setText] = useState("");
  const send = () => { const v = text.trim(); if (!v) return; onSend(v); setText(""); };
  return html`<${Island} tone=${tone} className="ph-composer !py-2 !px-2.5">
    <div class="flex items-end gap-2">
      <textarea class="ph-input" data-say rows="1" value=${text} placeholder=${placeholder} spellcheck="false"
        onInput=${(e) => { setText(e.currentTarget.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 96) + "px"; }}
        onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <button class="ph-send" data-send aria-label=${T(t, "send")} disabled=${!text.trim()} onClick=${send}>
        ${Icon("lucide:arrow-up", "text-[1.1rem]")}</button>
    </div>
  <//>`;
}

function autoscroll(dep) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [dep]);
  return ref;
}

// The empty state is a HERO, centred on the whole area (no presence chip competing): a soft accent glyph
// and the line. Its own flex-1 column, so it sits dead-centre above whatever the screen keeps below it.
const Hero = (icon, text) => html`<div class="ph-hero">
  <div class="ph-hero-glyph">${Icon(icon)}</div>
  <p class="ph-hero-text">${text}</p>
</div>`;

// group flag: a message is the "first" of a run when the previous one was a different sender/side
const firstOfRun = (list, i) => i === 0 || list[i - 1].mine !== list[i].mine || (!list[i].mine && list[i - 1].from !== list[i].from);

// A fault outranks everything: "no one nearby" / "quiet" is a lie when the radio was never allowed to speak.
const FaultBanner = (t, fault) => fault && html`<div class="ph-banner" data-fault="1">
  ${Icon("lucide:alert-triangle", "opacity-80")} ${T(t, "faultBanner")}</div>`;

// ── «Поруч» — the MAP: who is within earshot, and a tap opens a private line ────────────────────────
// Discovery only. The public broadcast lives in its own «Публічний» tab now; this screen is the field, the
// presence chip and the owner's own «me» node (where the nick is set). Tapping a device point → their DM.
export function room({ S }) {
  const t = useStore(S.t);
  const s = useStore($state);
  const peers = useStore($peers);
  const fault = useStore($fault);
  useEffect(() => { start().then(ensureNick); }, []);

  return html`<${Fragment}>
    <div class="ph-wrap h-full" data-near data-peers=${s.peerCount}>
      ${/* html and body paint an OPAQUE ground (measured rgb(0,0,0)), so a stage under it is invisible and a
           stage over it buries the static chrome. It sits at z-0 above the ground; .ph-wrap's other children
           are lifted to z-1 in head.html, which is the layer the glass islands need to stay readable. */""}
      <${GlStage} shader=${new URL("near.frag", import.meta.url)} zClass="z-0"
        seed=${0.37} ink=${accent} vary=${field} points=${sites} />
      <${Presence} t=${t} tone="frost" />
      <${Field} t=${t} peers=${peers} onPeer=${(id) => { markSeen(id); $peer.set(id); S.tab.set("dm"); }} />
      ${FaultBanner(t, fault)}
    </div>
  <//>`;
}

// ── «Публічний» — the public broadcast feed: a clean chat, no map, no stage ─────────────────────────
export function pub({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const s = useStore($state);
  const msgs = useStore($room);
  const queued = useStore($queued);
  const fault = useStore($fault);
  useEffect(() => { start().then(ensureNick); }, []);
  const feed = autoscroll(msgs.length);

  // Nothing broadcast yet — a hero that orients (quiet if alone, "say the first word" once neighbours are here).
  if (msgs.length === 0) return html`<${Fragment}>
    <div class="ph-wrap h-full">
      ${Hero("lucide:megaphone", T(t, s.peerCount === 0 ? "roomEmptyAlone" : "roomEmptyPeers", { n: s.peerCount }))}
      ${FaultBanner(t, fault)}
      <${Composer} t=${t} placeholder=${T(t, "composerRoom")} onSend=${(v) => { sendPublic(v); bump(); }} />
    </div>
  <//>`;

  return html`<${Fragment}>
    <div class="ph-wrap h-full">
      <div class="ph-feed" ref=${feed}>
        ${msgs.map((m, i) => m.sys
          ? html`<div key=${m.id} class="ph-sys">${m.text}</div>`
          : html`<div key=${m.id} class="ph-row" data-mine=${m.mine ? "1" : "0"} data-first=${firstOfRun(msgs, i) ? "1" : "0"}>
              <div class="ph-bubble">
                ${!m.mine && firstOfRun(msgs, i) && html`<div class="ph-who">${m.nick}</div>`}
                <span class="ph-text">${m.text}</span>
                <span class="ph-meta">${clock(m.ts, loc)}</span>
              </div></div>`)}
      </div>
      ${FaultBanner(t, fault)}
      ${queued && !fault && html`<div class="ph-banner">${Icon("lucide:clock", "opacity-70")} ${T(t, "queuedBanner")}</div>`}
      <${Composer} t=${t} placeholder=${T(t, "composerRoom")} onSend=${(v) => { sendPublic(v); bump(); }} />
    </div>
  <//>`;
}

// ── «Особисті» — the peer list, then a thread ──────────────────────────────────────────────────────
export function dm({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const peers = useStore($peers);
  const threads = useStore($threads);
  const seen = useStore($seen);
  const open = useStore($peer);
  useEffect(() => { start(); }, []);

  if (open) return Thread({ t, loc, peerID: open });

  if (peers.length === 0) return html`<${Fragment}>
    <div class="ph-wrap h-full">${Hero("lucide:lock", T(t, "dmEmpty"))}</div>
  <//>`;

  return html`<${Fragment}>
    <div class="ph-wrap h-full">
      <${Presence} t=${t} />
      <div class="ph-feed ph-list">
        ${peers.map((p) => { const unread = isUnread(p.peerID, threads, seen);
          return html`<button key=${p.peerID} data-peer=${p.peerID} data-unread=${unread ? "1" : "0"}
            class="ph-peer sf-raised sf-e2 sf-press" onClick=${() => { markSeen(p.peerID); $peer.set(p.peerID); }}>
          <span class="ph-dot"></span>
          <span class="flex-1 min-w-0"><span class="ph-peer-nick truncate">${p.nick}</span>
            <span class="ph-peer-id font-mono">${(p.peerID || "").slice(0, 8)}</span></span>
          ${unread ? html`<span class="ph-unread" data-unread-dot aria-label=${T(t, "unread")}></span>` : ""}
          ${Icon("lucide:chevron-right", "ph-peer-chev shrink-0")}
        </button>`; })}
      </div>
    </div>
  <//>`;
}

// ── «Логи» — the one screen that can tell a quiet room from a broken radio ─────────────────────────
// A mesh fails silently: nothing throws, nobody answers, and an empty room looks exactly like a refused
// BLUETOOTH_ADVERTISE. So this tab reads every gate between the page and the air, in the order they fail,
// and hands the whole thing over as one block of text — the only artifact a two-device test produces.
const VERDICT = { Ok: "ok", Perm: "err", Location: "warn", BtOff: "warn", BtNone: "err", NeedsApp: "warn", Stale: "warn", WrongApk: "err", Fault: "err" };

// The caps the INSTALLED apk grants, which is a different question from the one the catalogue answers:
// `shell.hasCapability` is derived from the catalogue and the bridge version alone and never reads them,
// so it says "granted" while the Java side refuses the very same action. This is the deciding half.
const apkLacksMesh = (d) => typeof d.caps === "string" && !d.caps.split(",").map((c) => c.trim()).includes("mesh");

function verdictOf(d) {
  if (!d) return null;
  if (!shell.present) return { key: "NeedsApp" };
  if (apkLacksMesh(d)) return { key: "WrongApk" };
  if (d.meshStart !== "available") return { key: String(d.meshStart).includes("stale") ? "Stale" : "NeedsApp" };
  if (d.missing && d.missing.length) return { key: "Perm", p: d.missing.join(", ") };
  if (d.locationOn === false) return { key: "Location" };
  if (d.ble && typeof d.ble === "object" && d.ble.supported === false) return { key: "BtNone" };
  if (d.ble && typeof d.ble === "object" && d.ble.on === false) return { key: "BtOff" };
  if (d.fault) return { key: "Fault", p: `${d.fault.code} ${d.fault.detail}` };
  return { key: "Ok", id: d.state.myPeerID || "" };
}

export function logs({ S }) {
  const t = useStore(S.t);
  const lines = useStore($log);
  useStore($fault);                                  // a fault must repaint the verdict, not wait for a tap
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => diagnose().then(setD);
  useEffect(() => { start().then(refresh); }, []);

  const v = verdictOf(d);
  const tone = v ? VERDICT[v.key] : "warn";
  const copy = async () => {
    try { await navigator.clipboard.writeText(report(d)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* no clipboard in this WebView — the text below is selectable, which is the fallback */ }
  };
  const held = d && d.held && typeof d.held === "object";

  return html`<div data-logs class="ph-wrap h-full overflow-y-auto">
    ${v && html`<${Island} className="ph-verdict" data-tone=${tone}>
      <div class="flex items-start gap-2">
        ${Icon(tone === "ok" ? "lucide:check-circle-2" : "lucide:alert-triangle", "shrink-0 mt-0.5")}
        <div class="min-w-0 flex-1">
          <div class="font-medium leading-tight">${T(t, `logsVerdict${v.key}`)}</div>
          <p class="ph-verdict-sub">${T(t, `logsVerdict${v.key}Sub`, { p: v.p || "", id: v.id || "" })}</p>
        </div>
      </div>
      ${v.key === "Perm" && html`<div class="flex gap-2 mt-2">
        <button class="btn btn-sm btn-primary rounded-full" onClick=${async () => { await permRequest("mesh"); refresh(); }}>${T(t, "logsAllow")}</button>
        <button class="btn btn-sm btn-ghost rounded-full" onClick=${() => shell.call("system.settings", {}).catch(() => {})}>${T(t, "logsSettings")}</button>
      </div>`}
    <//>`}

    <div class="flex gap-2">
      <button class="btn btn-sm btn-ghost rounded-full" onClick=${refresh}>${Icon("lucide:refresh-cw")} ${T(t, "logsRefresh")}</button>
      <button class="btn btn-sm btn-ghost rounded-full" onClick=${copy} disabled=${!d}>
        ${Icon(copied ? "lucide:check" : "lucide:copy")} ${T(t, copied ? "logsCopied" : "logsCopy")}</button>
    </div>

    <section class="ph-logsec">
      <h2 class="ph-logh">${T(t, "logsState")}</h2>
      <dl class="ph-kv">
        <dt>${T(t, "logsRowDevice")}</dt><dd>${d?.device || "—"}</dd>
        <dt>${T(t, "logsRowShell")}</dt><dd>${d?.shell || "—"}</dd>
        <dt>${T(t, "logsRowCaps")}</dt>
        <dd>${d?.caps == null ? "—" : html`<span class="ph-perm" data-held=${apkLacksMesh(d) ? "0" : "1"}>mesh ${T(t, apkLacksMesh(d) ? "logsNo" : "logsYes")}</span><span class="ph-capsraw">${d.caps}</span>`}</dd>
        <dt>${T(t, "logsRowCap")}</dt><dd>${d?.capability || "—"}</dd>
        <dt>${T(t, "logsRowAction")}</dt><dd>${d?.meshStart || "—"}</dd>
        <dt>${T(t, "logsRowHeld")}</dt>
        <dd>${held ? d.needs.map((p) => html`<span class="ph-perm" data-held=${d.held[p] ? "1" : "0"}>${p.replace("android.permission.", "")} ${T(t, d.held[p] ? "logsYes" : "logsNo")}</span>`) : "—"}</dd>
        <dt>${T(t, "logsRowLocation")}</dt><dd>${d == null || d.locationOn === null ? "—" : T(t, d.locationOn ? "logsOn" : "logsOff")}</dd>
        <dt>${T(t, "logsRowBle")}</dt><dd>${d?.ble ? JSON.stringify(d.ble) : "—"}</dd>
        <dt>${T(t, "logsRowMesh")}</dt><dd>${d?.mesh ? JSON.stringify(d.mesh) : "—"}</dd>
      </dl>
    </section>

    <section class="ph-logsec">
      <h2 class="ph-logh">${T(t, "logsEvents")}</h2>
      ${lines.length === 0
        ? html`<p class="ph-logempty">${T(t, "logsEmpty")}</p>`
        : html`<pre class="ph-pre" tabindex="0" role="group" aria-label=${T(t, "logsEvents")}>${lines.map((l) => `${new Date(l.t).toISOString().slice(11, 19)} ${l.kind.padEnd(5)} ${l.text}`).join("\n")}</pre>`}
    </section>

    <section class="ph-logsec">
      <h2 class="ph-logh">${T(t, "logsBridge")}</h2>
      ${!d?.bridgeLog || d.bridgeLog.length === 0
        ? html`<p class="ph-logempty">${T(t, "logsEmpty")}</p>`
        : html`<pre class="ph-pre" tabindex="0" role="group" aria-label=${T(t, "logsBridge")}>${d.bridgeLog.join("\n")}</pre>`}
    </section>
  </div>`;
}

function Thread({ t, loc, peerID }) {
  const threads = useStore($threads);
  const peers = useStore($peers);
  const msgs = threads[peerID] || [];
  const peer = peers.find((p) => p.peerID === peerID);
  const feed = autoscroll(msgs.length);
  return html`<${Fragment}>
    <div class="ph-wrap h-full" data-thread=${peerID}>
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm btn-circle shrink-0" data-thread-back aria-label="←" onClick=${() => $peer.set(null)}>
          ${Icon("lucide:arrow-left")}</button>
        <div class="flex-1 min-w-0">
          <div class="truncate font-medium leading-tight">${peer?.nick || peerID}</div>
          <div class="ph-near ph-near-sub"><span>${Icon("lucide:lock", "text-[0.7rem]")}</span><span>${T(t, "encrypted")}</span></div>
        </div>
      </div>
      <div class="ph-feed" ref=${feed}>
        ${msgs.map((m) => html`<div key=${m.id} class="ph-row" data-mine=${m.mine ? "1" : "0"} data-first="1">
          <div class="ph-bubble"><span class="ph-text">${m.text}</span>
            <span class="ph-meta">${clock(m.ts, loc)}${m.mine && m.status ? html` · ${T(t, RCPT[m.status] || "rcptSent")}` : ""}</span>
          </div></div>`)}
      </div>
      <${Composer} t=${t} placeholder=${T(t, "composerDm")} onSend=${(v) => sendPrivate(peerID, v)} />
    </div>
  <//>`;
}
