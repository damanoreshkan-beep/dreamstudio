// Поголос — the two rooms of an off-grid mesh, and nothing more. All state comes from mesh.js (the bridge
// with its browser mock); this file is pure UI. The presence line at the top of every screen is the answer
// to "am I shouting into the void" — it is the peer count, live, from mesh.peers.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { start, sendPublic, sendPrivate, $state, $peers, $room, $threads, $queued } from "./mesh.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const clock = (ts, loc) => new Date(ts).toLocaleTimeString(loc === "uk" ? "uk-UA" : "en-US", { hour: "2-digit", minute: "2-digit" });
const near = (t, n) => n === 0 ? T(t, "nearNone") : n === 1 ? T(t, "nearOne") : T(t, "nearMany", { n });

const $peer = atom(null);   // the private thread that is open, or null for the peer list

// ── presence: the one honest number, in the header of both rooms ───────────────────────────────────
function Presence({ t }) {
  const s = useStore($state);
  const alone = s.peerCount === 0;
  return html`<div class="ph-near text-muted">
    <span class="ph-dot" data-alone=${alone ? "1" : "0"}></span>
    <span>${near(t, s.peerCount)}${!alone && s.maxHops > 1 ? ` · ${T(t, "hops", { k: s.maxHops })}` : ""}</span>
  </div>`;
}

// ── the composer, shared by both rooms ─────────────────────────────────────────────────────────────
function Composer({ t, placeholder, onSend }) {
  const [text, setText] = useState("");
  const send = () => { const v = text.trim(); if (!v) return; onSend(v); setText(""); };
  return html`<div class="ph-composer">
    <input class="input input-bordered ph-input h-[var(--ms-ctl)] min-h-0 rounded-[var(--ms-r-in)]"
      value=${text} placeholder=${placeholder} spellcheck="false"
      onInput=${(e) => setText(e.currentTarget.value)}
      onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }} />
    <button class="btn btn-primary btn-square rounded-[var(--ms-r-in)] shrink-0" aria-label=${T(t, "send")}
      disabled=${!text.trim()} onClick=${send}>${Icon("lucide:send-horizontal")}</button>
  </div>`;
}

function autoscroll(dep) {
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [dep]);
  return ref;
}

// ── «Поруч» — the public room ──────────────────────────────────────────────────────────────────────
export function room({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const s = useStore($state);
  const msgs = useStore($room);
  const queued = useStore($queued);
  useEffect(() => { start(); }, []);
  const feed = autoscroll(msgs.length);

  const empty = s.peerCount === 0
    ? T(t, "roomEmptyAlone")
    : T(t, "roomEmptyPeers", { n: s.peerCount });

  return html`<${Fragment}>
    <div class="ph-wrap h-full">
      <${Presence} t=${t} />
      ${msgs.length === 0
        ? html`<div class="flex-1 grid place-items-center text-center px-6" data-mascot>
            <p class="text-muted max-w-xs leading-relaxed">${empty}</p></div>`
        : html`<div class="ph-feed" ref=${feed}>
            ${msgs.map((m) => m.sys
              ? html`<div key=${m.id} class="ph-sys">${m.text}</div>`
              : html`<div key=${m.id} class="ph-row" data-mine=${m.mine ? "1" : "0"}>
                  <div class="ph-bubble">
                    ${!m.mine && html`<div class="ph-who">${m.nick}</div>`}
                    <div>${m.text}</div>
                    <div class="ph-meta text-right">${clock(m.ts, loc)}</div>
                  </div></div>`)}
          </div>`}
      ${queued && html`<div class="ph-banner">${T(t, "queuedBanner")}</div>`}
      <${Composer} t=${t} placeholder=${T(t, "composerRoom")} onSend=${(v) => sendPublic(v)} />
    </div>
  <//>`;
}

// ── «Особисті» — the peer list, then a thread ──────────────────────────────────────────────────────
const RCPT = { sent: "rcptSent", delivered: "rcptDelivered", read: "rcptRead", queued: "rcptQueued" };

export function dm({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const peers = useStore($peers);
  const open = useStore($peer);
  useEffect(() => { start(); }, []);

  if (open) return Thread({ t, loc, peerID: open });

  if (peers.length === 0) return html`<${Fragment}>
    <div class="ph-wrap h-full"><${Presence} t=${t} />
      <div class="flex-1 grid place-items-center text-center px-6" data-mascot>
        <p class="text-muted max-w-xs leading-relaxed">${T(t, "dmEmpty")}</p></div>
    </div><//>`;

  return html`<${Fragment}>
    <div class="ph-wrap h-full"><${Presence} t=${t} />
      <div class="ph-feed">
        ${peers.map((p) => html`<button key=${p.peerID}
          class="flex items-center gap-3 w-full text-left p-2 rounded-[var(--ms-r)] hover:bg-[color-mix(in_oklch,currentColor_6%,transparent)]"
          onClick=${() => $peer.set(p.peerID)}>
          <span class="ph-dot" style="position:static"></span>
          <span class="flex-1 min-w-0"><span class="block truncate">${p.nick}</span>
            <span class="ph-meta">${T(t, p.hops === 1 ? "nearOne" : "hops", p.hops === 1 ? {} : { k: p.hops })}</span></span>
          ${Icon("lucide:chevron-right", "text-muted shrink-0")}
        </button>`)}
      </div>
    </div><//>`;
}

function Thread({ t, loc, peerID }) {
  const threads = useStore($threads);
  const peers = useStore($peers);
  const msgs = threads[peerID] || [];
  const peer = peers.find((p) => p.peerID === peerID);
  const feed = autoscroll(msgs.length);
  return html`<${Fragment}>
    <div class="ph-wrap h-full">
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label="←" onClick=${() => $peer.set(null)}>
          ${Icon("lucide:arrow-left")}</button>
        <div class="flex-1 min-w-0"><div class="truncate font-medium">${peer?.nick || peerID}</div>
          <div class="ph-near text-muted"><span>${T(t, "encrypted")}</span></div></div>
      </div>
      <div class="ph-feed" ref=${feed}>
        ${msgs.map((m) => html`<div key=${m.id} class="ph-row" data-mine=${m.mine ? "1" : "0"}>
          <div class="ph-bubble"><div>${m.text}</div>
            <div class="ph-meta text-right">${clock(m.ts, loc)}${m.mine && m.status ? ` · ${T(t, RCPT[m.status] || "rcptSent")}` : ""}</div>
          </div></div>`)}
      </div>
      <${Composer} t=${t} placeholder=${T(t, "composerDm")} onSend=${(v) => sendPrivate(peerID, v)} />
    </div>
  <//>`;
}
