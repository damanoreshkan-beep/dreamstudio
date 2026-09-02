// Дух карти — one card fills the screen, and its spirit speaks. The whole 78-card deck is ONE draw
// (/_rt/tarot.js `draw(seed, 78, 78)`: every card once, an orientation each), seeded by the day so the
// first card is the card of the day and the sequence holds until shuffled; swipe or the chevrons walk it.
// Tapping the card opens the spirit: a night veil over the page (iching's Ceremony precedent — the film
// is night in both themes) where the model's words, grounded in Waite's meaning for THIS orientation
// (rt/ai-tarot.js `groundCard`), type themselves out under the small card. The meaning itself stays on
// screen beneath the words, so a model outage costs the prose and never the substance.
// The scans are re-inked per material by CSS alone (head.html) — the pictures are never regenerated.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { tr, warm, trTick } from "/_rt/translate.js";
import { spiritRead, isSpiritRead, warmSpiritRead, groundCard, aiTick } from "/_rt/ai-tarot.js";
import { Scramble } from "/_rt/skeleton.js";
import { hashSeed, draw } from "/_rt/tarot.js";
import { DECK } from "/_rt/tarotdeck.js";
import { gate } from "/_rt/gate.js";
import { animate } from "motion";
import { usePanX, useSheetDrag } from "/_rt/gesture.js";
import { Sheet } from "/_rt/ui.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const imgURL = (file) => new URL(`./assets/${file}`, import.meta.url).href;
const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const randSeed = () => Math.floor(Math.random() * 0x100000000) >>> 0;
const SUIT_KEY = { wands: "suitWands", cups: "suitCups", swords: "suitSwords", pentacles: "suitPentacles" };
const cardName = (c, loc) => (loc === "uk" ? c.uk : c.name);
const kindOf = (c, t) => c.arcana === "major" ? T(t, "arcanaMajor") : `${T(t, "arcanaMinor")} · ${T(t, SUIT_KEY[c.suit])}`;
const meaningOf = (d) => DECK[d.card][d.reversed ? "rev" : "up"];
// the gate and reduced motion get the final state at once — no typewriter, no entry move
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const instant = () => gate || reduced();

// The gate has no network: the spirit speaks a fixed line so the shot and the e2e stay deterministic.
const GATE_SPIRIT = {
  uk: "Я — та сила, що тримає рівновагу між поспіхом і зупинкою. Сьогодні не вирішуй усе одразу: візьми одну справу й доведи її до кінця, а решту залиш на завтра. Не сперечайся з тим, хто ще не готовий слухати. Спокій тепер — твій найкращий союзник.",
  en: "I am the force that holds the balance between haste and standing still. Today do not settle everything at once: take one matter and see it through, and leave the rest for tomorrow. Do not argue with someone who is not yet ready to listen. Calm is your best ally now.",
};

export function spirit({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  useStore(trTick);
  const [nonce, setNonce] = useState(0);            // bumped by shuffle → a fresh order
  const [idx, setIdx] = useState(0);
  const liveBase = useRef(randSeed()).current;
  const frameRef = useRef();

  const now = gate ? new Date(2027, 6, 23) : new Date();
  const seed = nonce === 0 ? hashSeed(dk(now)) : (gate ? hashSeed("shuffle:" + nonce) : (liveBase ^ hashSeed(String(nonce))) >>> 0);
  const order = useMemo(() => draw(seed, DECK.length, DECK.length), [seed]);
  const d = order[idx];
  const c = DECK[d.card];

  const go = (step) => setIdx((i) => (i + step + order.length) % order.length);
  const shuffle = () => { setNonce((n) => n + 1); setIdx(0); };
  const { paneRef, pan } = usePanX({ onNext: () => go(1), onPrev: () => go(-1) });

  // the next card arrives like a cut: a short rise, no scatter
  useEffect(() => {
    if (instant()) return;
    const el = frameRef.current; if (!el) return;
    const a = animate(el, { opacity: [0, 1], transform: ["translateY(10px) scale(.985)", "translateY(0px) scale(1)"] }, { duration: 0.35, ease: "easeOut" });
    return () => a.stop?.();
  }, [seed, idx]);
  useEffect(() => { warm([meaningOf(d)], loc); }, [d, loc]);   // the meaning in force, in the reader's language

  const rev = d.reversed;
  return html`<${Fragment}>
    <div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <div class="shrink-0 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div data-name class="font-bold text-[length:var(--ms-title)] leading-tight truncate">${cardName(c, loc)}</div>
          <div class="mt-0.5 font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-muted truncate">${kindOf(c, t)} · <span data-orient class=${rev ? "text-warning" : "text-secondary"}>${T(t, rev ? "reversed" : "upright")}</span></div>
        </div>
        <div data-count class="shrink-0 font-mono tabular-nums text-[length:var(--ms-label)] text-muted pt-1">${idx + 1}/${order.length}</div>
      </div>

      ${/* the void takes every pixel the chrome leaves; the frame is exactly the scan's shape inside it */""}
      <div ref=${paneRef} ...${pan} class="sp-void flex-1 min-h-0 flex items-center justify-center touch-pan-y">
        <button ref=${frameRef} data-card data-reversed=${rev ? "1" : "0"} aria-label=${T(t, "spiritOpen")} onClick=${() => openScreen("spirit")}
          class=${`sp-frame sf-e3 active:scale-[.985] ${rev ? "rotate-180" : ""}`}>
          <img src=${imgURL(c.img)} alt=${cardName(c, loc)} class="sp-art" />
        </button>
      </div>

      <div class="shrink-0 flex items-center justify-center gap-[var(--ms-gap)]">
        <button data-prev aria-label=${T(t, "prevCard")} class="btn btn-sm btn-circle" onClick=${() => go(-1)}>${Icon("lucide:chevron-left", "text-lg")}</button>
        <button data-shuffle aria-label=${T(t, "shuffle")} class="btn btn-sm btn-circle" onClick=${shuffle}>${Icon("lucide:shuffle", "text-base")}</button>
        <button data-deck aria-label=${T(t, "deckOpen")} class="btn btn-sm btn-circle" onClick=${() => openScreen("deck")}>${Icon("lucide:layout-grid", "text-base")}</button>
        <button data-next aria-label=${T(t, "nextCard")} class="btn btn-sm btn-circle" onClick=${() => go(1)}>${Icon("lucide:chevron-right", "text-lg")}</button>
      </div>
    </div>

    <${SpiritAct} open=${screen === "spirit"} onClose=${closeScreen} onNext=${() => { closeScreen(); go(1); }} d=${d} c=${c} t=${t} loc=${loc} />
    <${DeckSheet} open=${screen === "deck"} onClose=${closeScreen} order=${order} idx=${idx} t=${t} loc=${loc}
      onPick=${(i) => { setIdx(i); closeScreen(); }} />
  </${Fragment}>`;
}

// The whole deck in its CANONICAL order (majors 0–21, then the suits) so a card can be found, each tile
// in the orientation this shuffle gave it; the current card carries the accent ring. A tap goes to that
// card's place in the shuffled order. The kit Sheet owns the scroll — 78 lazy thumbnails, no page scroll.
function DeckSheet({ open, onClose, order, idx, t, loc, onPick }) {
  const at = useMemo(() => { const m = new Array(order.length); order.forEach((d, i) => { m[d.card] = i; }); return m; }, [order]);
  return html`<${Sheet} id="deck" open=${open} onClose=${onClose} locale=${loc} title=${T(t, "deckTitle")} subtitle=${String(DECK.length)} icon="lucide:layout-grid">
    ${open ? html`<div class="grid gap-2" style="grid-template-columns:repeat(auto-fill,minmax(4.25rem,1fr))">
      ${DECK.map((c, ci) => { const i = at[ci], rev = order[i].reversed, on = i === idx; return html`<button key=${c.id} data-deck-card=${c.id} aria-pressed=${on} aria-label=${cardName(c, loc)} onClick=${() => onPick(i)}
          class="flex flex-col items-center gap-1 min-w-0 active:scale-95 transition-transform">
          <span class=${`block w-full aspect-[350/600] rounded-[var(--ms-r-in)] overflow-hidden sf-e1 ${rev ? "rotate-180" : ""}`} style=${on ? "box-shadow:0 0 0 2px var(--app-accent)" : ""}>
            <img src=${imgURL(c.img)} alt="" loading="lazy" class="sp-art" />
          </span>
          <span class="w-full truncate text-center font-mono text-[0.55rem] uppercase tracking-wide text-muted leading-tight">${cardName(c, loc)}</span>
        </button>`; })}
    </div>` : null}
  </${Sheet}>`;
}

// The spirit's words for one card: cached per (card, orientation, locale) under the signature groundCard
// pairs with its block. Fail-open — after ~12s with nothing landed the skeleton yields to a retry.
function useSpirit(c, d, loc, active) {
  useStore(aiTick);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const { text: block, sig } = groundCard(c, d.reversed);
  const text = !active ? "" : gate ? (GATE_SPIRIT[loc] || GATE_SPIRIT.en) : spiritRead(sig, loc);
  useEffect(() => {
    if (!active || gate || isSpiritRead(sig, loc)) return;
    setFailed(false);
    warmSpiritRead(sig, block, loc);
    const id = setTimeout(() => setFailed(!isSpiritRead(sig, loc)), 12000);
    return () => clearTimeout(id);
  }, [active, sig, loc, nonce]);
  return { text, failed, retry: () => setNonce((x) => x + 1) };
}

// The veil: a transparent full-screen dialog over the page (tarot's Ritual / iching's Ceremony precedent),
// history-backed through S.screen. `data-theme="signal"` keeps the ink white inside it in both themes; the
// near-black veil is a solid-alpha ground axe composites over the page.
function SpiritAct({ open, onClose, onNext, d, c, t, loc }) {
  const dref = useRef(), actRef = useRef();
  const { boxRef, grip } = useSheetDrag(onClose);
  const { text, failed, retry } = useSpirit(c, d, loc, open);
  useStore(trTick);
  useEffect(() => { const el = dref.current; if (!el) return; if (open) { if (!el.open) el.showModal?.(); } else el.close?.(); }, [open]);
  useEffect(() => {
    if (instant() || !open) return;
    const el = actRef.current;
    if (el) animate(el, { opacity: [0, 1], transform: ["translateY(18px)", "translateY(0px)"] }, { duration: 0.45, ease: "easeOut" });
  }, [open]);
  const rev = d.reversed;
  const pill = "rounded-full border px-6 py-2.5 font-mono uppercase tracking-[0.18em] text-sm transition-colors";
  return html`<dialog id="spirit" ref=${dref} class="modal" aria-label=${T(t, "spiritTitle")} onClose=${onClose}>
    <div ref=${boxRef} data-theme="signal" class="modal-box max-w-none w-screen h-[100dvh] max-h-none rounded-none p-0 overflow-hidden relative bg-transparent text-white [&_*]:!shadow-none">
      <div aria-hidden="true" class="absolute inset-0 bg-[#0b0f14]/90"></div>
      <div class="relative z-10 flex flex-col h-full px-6" style="padding-top:calc(env(safe-area-inset-top) + 0.5rem);padding-bottom:calc(env(safe-area-inset-bottom) + 1.25rem)">
        ${grip}
        <div class="flex items-center justify-end shrink-0">
          <button data-spirit-close aria-label=${T(t, "close")} class="btn btn-sm btn-circle btn-ghost text-white" onClick=${onClose}>${Icon("lucide:x", "text-lg")}</button>
        </div>
        ${open ? html`<div ref=${actRef} class="flex-1 min-h-0 overflow-y-auto flex flex-col max-w-[480px] w-full mx-auto">
          <div class="shrink-0 flex flex-col items-center gap-2.5 pt-1 text-center">
            <div class=${`sp-mini ${rev ? "rotate-180" : ""}`}><img src=${imgURL(c.img)} alt="" class="sp-art" /></div>
            <div class="text-[clamp(1.6rem,5vh,2.4rem)] font-light leading-none">${cardName(c, loc)}</div>
            <div class="font-mono uppercase tracking-[0.3em] text-[length:var(--ms-label)] text-white/70">${kindOf(c, t)} · ${T(t, rev ? "reversed" : "upright")}</div>
          </div>

          <div class="flex-1 flex flex-col justify-center py-5">
            ${text ? html`<${Typewriter} key=${c.id + (rev ? "r" : "u") + loc} text=${text} />`
              : failed ? html`<div class="flex flex-col items-center gap-3 py-4 text-center">
                  <span class="text-white/80">${T(t, "spiritFail")}</span>
                  <button data-spirit-retry onClick=${retry} class=${`${pill} border-white/30 text-white hover:bg-white/10`}>${T(t, "retry")}</button>
                </div>`
              : html`<div class="flex flex-col items-center gap-2 text-white/70">${[26, 32, 28, 20].map((n, i) => html`<div key=${i}><${Scramble} len=${n} /></div>`)}</div>`}
            ${/* the substance under the prose: Waite's meaning for this orientation, the block the model was
                  handed, so the words above can be checked against it */""}
            <div aria-hidden="true" class="mt-5 h-px w-full" style="background:linear-gradient(90deg,transparent,var(--app-accent),transparent);opacity:.5"></div>
            <p data-meaning class="mt-4 text-center text-sm leading-relaxed text-white/70">${tr(meaningOf(d), loc)}</p>
          </div>

          <div class="shrink-0 flex flex-col items-center gap-3 pb-1">
            <div class="flex items-start gap-2 text-[length:var(--ms-label)] text-white/70 text-center">
              ${Icon("lucide:sparkles", "shrink-0 mt-0.5")}<span>${T(t, "spiritGenerated")}</span>
            </div>
            <div class="flex gap-2.5">
              <button data-spirit-next onClick=${onNext} class=${`${pill} border-white/30 text-white hover:bg-white/10`}>${T(t, "nextCard")}</button>
              <button data-spirit-done onClick=${onClose} class=${`${pill} border-transparent bg-white text-[#0b0f14] hover:bg-white/90`}>${T(t, "close")}</button>
            </div>
          </div>
        </div>` : null}
      </div>
    </div>
    <form method="dialog" class="modal-backdrop"><button>${T(t, "close")}</button></form>
  </dialog>`;
}

// iching's subtitle idiom: the full text for the reader (sr-only), the typed slice for the eye.
function Typewriter({ text }) {
  const [n, setN] = useState(() => (instant() ? text.length : 0));
  useEffect(() => {
    if (instant()) { setN(text.length); return; }
    setN(0);
    const step = Math.max(12, Math.min(28, 9000 / Math.max(1, text.length)));
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= text.length) clearInterval(id); }, step);
    return () => clearInterval(id);
  }, [text]);
  const done = n >= text.length;
  return html`<div data-spirit-text class="text-center text-[1.05rem] font-light leading-loose whitespace-pre-line text-white/95">
    <span class="sr-only">${text}</span>
    <span aria-hidden="true">${text.slice(0, n)}${done ? "" : html`<span class="sp-caret ml-0.5"></span>`}</span>
  </div>`;
}
