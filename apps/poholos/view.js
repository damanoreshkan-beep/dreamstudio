// Поголос — the two rooms of an off-grid mesh. Pure UI over mesh.js (the bridge + its honest mock). The
// modern shape: a scrolling feed between two glass ISLANDS — presence on top, the composer at the bottom —
// with tailed bubbles. All depth comes from the kit's Island/surfaces, nothing hand-rolled.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island } from "/_rt/ui.js";
import { start, sendPublic, sendPrivate, $state, $peers, $room, $threads, $queued } from "./mesh.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const clock = (ts, loc) => new Date(ts).toLocaleTimeString(loc === "uk" ? "uk-UA" : "en-US", { hour: "2-digit", minute: "2-digit" });
const near = (t, n) => n === 0 ? T(t, "nearNone") : n === 1 ? T(t, "nearOne") : T(t, "nearMany", { n });
const RCPT = { sent: "rcptSent", delivered: "rcptDelivered", read: "rcptRead", queued: "rcptQueued" };

const $peer = atom(null);   // the open private thread, or null for the peer list

// ── presence: the one honest number, a glass chip that floats atop the feed ────────────────────────
function Presence({ t }) {
  const s = useStore($state);
  const alone = s.peerCount === 0;
  return html`<${Island} className="self-start !py-1.5 !px-3 rounded-full">
    <div class="ph-near">
      <span class="ph-dot" data-alone=${alone ? "1" : "0"}></span>
      <span>${near(t, s.peerCount)}</span>
      ${!alone && s.maxHops > 1 && html`<span class="ph-near-sub">· ${T(t, "hops", { k: s.maxHops })}</span>`}
    </div>
  <//>`;
}

// ── the composer, a floating island at the bottom ──────────────────────────────────────────────────
function Composer({ t, placeholder, onSend }) {
  const [text, setText] = useState("");
  const send = () => { const v = text.trim(); if (!v) return; onSend(v); setText(""); };
  return html`<${Island} className="!py-2 !px-3 rounded-[1.6rem]">
    <div class="flex items-end gap-2">
      <textarea class="ph-input" rows="1" value=${text} placeholder=${placeholder} spellcheck="false"
        onInput=${(e) => { setText(e.currentTarget.value); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = Math.min(e.currentTarget.scrollHeight, 96) + "px"; }}
        onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}></textarea>
      <button class="ph-send" aria-label=${T(t, "send")} disabled=${!text.trim()} onClick=${send}>
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

// ── «Поруч» — the public room ──────────────────────────────────────────────────────────────────────
export function room({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const s = useStore($state);
  const msgs = useStore($room);
  const queued = useStore($queued);
  useEffect(() => { start(); }, []);
  const feed = autoscroll(msgs.length);

  if (msgs.length === 0) return html`<${Fragment}>
    <div class="ph-wrap h-full">
      ${Hero("lucide:radio", s.peerCount === 0 ? T(t, "roomEmptyAlone") : T(t, "roomEmptyPeers", { n: s.peerCount }))}
      <${Composer} t=${t} placeholder=${T(t, "composerRoom")} onSend=${(v) => sendPublic(v)} />
    </div>
  <//>`;

  return html`<${Fragment}>
    <div class="ph-wrap h-full">
      <${Presence} t=${t} />
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
      ${queued && html`<div class="ph-banner">${Icon("lucide:clock", "opacity-70")} ${T(t, "queuedBanner")}</div>`}
      <${Composer} t=${t} placeholder=${T(t, "composerRoom")} onSend=${(v) => sendPublic(v)} />
    </div>
  <//>`;
}

// ── «Особисті» — the peer list, then a thread ──────────────────────────────────────────────────────
export function dm({ S }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const peers = useStore($peers);
  const open = useStore($peer);
  useEffect(() => { start(); }, []);

  if (open) return Thread({ t, loc, peerID: open });

  if (peers.length === 0) return html`<${Fragment}>
    <div class="ph-wrap h-full">${Hero("lucide:lock", T(t, "dmEmpty"))}</div>
  <//>`;

  return html`<${Fragment}>
    <div class="ph-wrap h-full">
      <${Presence} t=${t} />
      <div class="ph-feed">
        ${peers.map((p) => html`<button key=${p.peerID} class="ph-peer" onClick=${() => $peer.set(p.peerID)}>
          <span class="ph-dot"></span>
          <span class="flex-1 min-w-0"><span class="block truncate">${p.nick}</span>
            <span class="ph-meta !float-none !m-0 !opacity-60">${p.hops === 1 ? T(t, "nearOne") : T(t, "hops", { k: p.hops })}</span></span>
          ${Icon("lucide:chevron-right", "text-muted shrink-0 opacity-60")}
        </button>`)}
      </div>
    </div>
  <//>`;
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
