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
const clock = (ts, loc) => Number.isFinite(ts) ? new Date(ts).toLocaleTimeString(loc === "uk" ? "uk-UA" : "en-US", { hour: "2-digit", minute: "2-digit" }) : "";
const near = (t, n) => n === 0 ? T(t, "nearNone") : n === 1 ? T(t, "nearOne") : T(t, "nearMany", { n });
const RCPT = { sent: "rcptSent", delivered: "rcptDelivered", read: "rcptRead", queued: "rcptQueued" };

const $peer = atom(null);

const $nick = persistentAtom("poholos:nick", "", { encode: String, decode: String });
const JC = (init) => ({ encode: JSON.stringify, decode: (s) => { try { return JSON.parse(s); } catch { return init; } } });
const $seen = persistentAtom("poholos:seen", {}, JC({}));
const lastIn = (msgs) => { let t = 0; for (const m of msgs || []) if (!m.mine && Number.isFinite(m.ts) && m.ts > t) t = m.ts; return t; };
const isUnread = (peerID, threads, seen) => lastIn(threads[peerID]) > (seen[peerID] || 0);
const markSeen = (peerID) => { const cur = $seen.get(); if ((cur[peerID] || 0) < Date.now()) $seen.set({ ...cur, [peerID]: Date.now() }); };
const ensureNick = () => { const n = $nick.get(); if (n && n !== $state.get().nick) setNick(n); };

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
  } catch { }
  return acc.rgb;
}

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

function Field({ t, peers, onPeer }) {
  const s = useStore($state);
  const nick = useStore($nick);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const myName = nick || s.nick || "";
  const openEdit = () => { setDraft(myName); setEditing(true); };
  const commit = () => { const v = draft.trim().slice(0, 24); if (v) { $nick.set(v); setNick(v); } setEditing(false); };
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
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
    ${""}
    ${s.peerCount === 0 && html`<p class="ph-field-note">${T(t, "fieldSearching")}</p>`}
  </div>`;
}

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

const Hero = (icon, text) => html`<div class="ph-hero">
  <div class="ph-hero-glyph">${Icon(icon)}</div>
  <p class="ph-hero-text">${text}</p>
</div>`;

const firstOfRun = (list, i) => i === 0 || list[i - 1].mine !== list[i].mine || (!list[i].mine && list[i - 1].from !== list[i].from);

const FaultBanner = (t, fault) => fault && html`<div class="ph-banner" data-fault="1">
  ${Icon("lucide:alert-triangle", "opacity-80")} ${T(t, "faultBanner")}</div>`;

export function room({ S }) {
  const t = useStore(S.t);
  const s = useStore($state);
  const peers = useStore($peers);
  const fault = useStore($fault);
  useEffect(() => { start().then(ensureNick); }, []);

  return html`<${Fragment}>
    <div class="ph-wrap h-full" data-near data-peers=${s.peerCount}>
      ${""}
      <${GlStage} shader=${new URL("near.frag", import.meta.url)} zClass="z-0"
        seed=${0.37} ink=${accent} vary=${field} points=${sites} />
      <${Presence} t=${t} tone="frost" />
      <${Field} t=${t} peers=${peers} onPeer=${(id) => { markSeen(id); $peer.set(id); S.tab.set("dm"); }} />
      ${FaultBanner(t, fault)}
    </div>
  <//>`;
}

export function pub({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const s = useStore($state);
  const msgs = useStore($room);
  const queued = useStore($queued);
  const fault = useStore($fault);
  useEffect(() => { start().then(ensureNick); }, []);
  const feed = autoscroll(msgs.length);

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

export function dm({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const peers = useStore($peers);
  const threads = useStore($threads);
  const seen = useStore($seen);
  const open = useStore($peer);
  useEffect(() => { start().then(ensureNick); }, []);

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

const VERDICT = { Ok: "ok", Perm: "err", Location: "warn", BtOff: "warn", BtNone: "err", NeedsApp: "warn", Stale: "warn", WrongApk: "err", Fault: "err" };

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
  useStore($fault);
  const [d, setD] = useState(null);
  const [copied, setCopied] = useState(false);
  const refresh = () => diagnose().then(setD);
  useEffect(() => { start().then(() => { ensureNick(); refresh(); }); }, []);

  const v = verdictOf(d);
  const tone = v ? VERDICT[v.key] : "warn";
  const copy = async () => {
    try { await navigator.clipboard.writeText(report(d)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { }
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
