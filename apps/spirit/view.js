// Дух карти — a STUDY of the deck, not a draw (owner, 2026-09-02: "суть апки у вивченні колоди, а не
// угадуванні"). The main screen is the whole 78-card deck by its structure — the Major Arcana, then the four
// suits — and every card is a page: the scan fills the upper half, a flip turns it over (upright ↔
// reversed) and the card's spirit speaks for the orientation showing: the model's words, grounded in
// Waite's meaning for THAT orientation (rt/ai-tarot.js `groundCard`), typed out over the meaning itself,
// so a model outage costs the prose and never the substance. Chevrons or a swipe walk the deck in order.
// The scans are re-inked per material by CSS alone (head.html) — the pictures are never regenerated.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { tr, warm, trTick } from "/_rt/translate.js";
import { spiritRead, isSpiritRead, warmSpiritRead, groundCard, aiTick } from "/_rt/ai-tarot.js";
import { Scramble } from "/_rt/skeleton.js";
import { DECK } from "/_rt/tarotdeck.js";
import { gate } from "/_rt/gate.js";
import { animate } from "motion";
import { usePanX, useSheetDrag } from "/_rt/gesture.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const imgURL = (file) => new URL(`./assets/${file}`, import.meta.url).href;
const SUIT_KEY = { wands: "suitWands", cups: "suitCups", swords: "suitSwords", pentacles: "suitPentacles" };
const cardName = (c, loc) => (loc === "uk" ? c.uk : c.name);
const kindOf = (c, t) => c.arcana === "major" ? T(t, "arcanaMajor") : `${T(t, "arcanaMinor")} · ${T(t, SUIT_KEY[c.suit])}`;
// the gate and reduced motion get the final state at once — no typewriter, no entry move
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const instant = () => gate || reduced();

// The deck's structure: the Major Arcana, then the suits in the traditional order. Indices into DECK, so
// the page's prev/next walk the same order the grid shows.
const SECTIONS = [
  { id: "major", key: "arcanaMajor", cards: DECK.map((c, i) => c.arcana === "major" ? i : -1).filter((i) => i >= 0) },
  ...["wands", "cups", "swords", "pentacles"].map((s) => ({ id: s, key: SUIT_KEY[s], cards: DECK.map((c, i) => c.suit === s ? i : -1).filter((i) => i >= 0) })),
];
const ORDER = SECTIONS.flatMap((s) => s.cards);

const $sel = atom(ORDER[0]);          // the card whose page is open (a DECK index)

// The gate has no network: the spirit speaks a fixed line so the shot and the e2e stay deterministic.
const GATE_SPIRIT = {
  uk: "Я — та сила, що тримає рівновагу між поспіхом і зупинкою. Сьогодні не вирішуй усе одразу: візьми одну справу й доведи її до кінця, а решту залиш на завтра. Не сперечайся з тим, хто ще не готовий слухати. Спокій тепер — твій найкращий союзник.",
  en: "I am the force that holds the balance between haste and standing still. Today do not settle everything at once: take one matter and see it through, and leave the rest for tomorrow. Do not argue with someone who is not yet ready to listen. Calm is your best ally now.",
};

// ── the deck, by structure ───────────────────────────────────────────────────────────────────────
export function spirit({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const sel = useStore($sel);
  const open = (i) => { $sel.set(i); openScreen("card"); };
  return html`<${Fragment}>
    <div class="flex flex-col gap-[calc(var(--ms-gap)*1.5)]">
      ${SECTIONS.map((s) => html`<section key=${s.id} data-section=${s.id} class="flex flex-col gap-[var(--ms-gap)]">
        <div class="flex items-baseline justify-between px-0.5">
          <h2 class="font-mono uppercase tracking-[0.16em] text-[length:var(--ms-label)] text-muted">${T(t, s.key)}</h2>
          <span class="font-mono tabular-nums text-[length:var(--ms-label)] text-muted">${s.cards.length}</span>
        </div>
        <div class="grid gap-2" style="grid-template-columns:repeat(auto-fill,minmax(4.5rem,1fr))">
          ${s.cards.map((i) => { const c = DECK[i]; return html`<button key=${c.id} data-deck-card=${c.id} aria-label=${cardName(c, loc)} onClick=${() => open(i)}
              class="flex flex-col items-center gap-1 min-w-0 active:scale-95 transition-transform">
              <span class="block w-full aspect-[350/600] rounded-[var(--ms-r-in)] overflow-hidden sf-e1"><img src=${imgURL(c.img)} alt="" loading="lazy" class="sp-art" /></span>
              <span class="w-full truncate text-center font-mono text-[0.55rem] uppercase tracking-wide text-muted leading-tight">${cardName(c, loc)}</span>
            </button>`; })}
        </div>
      </section>`)}
    </div>
    <${CardPage} open=${screen === "card"} onClose=${closeScreen} idx=${sel} t=${t} loc=${loc} />
  </${Fragment}>`;
}

// The spirit's words for one card in one orientation: cached under the signature groundCard pairs with its
// block. Fail-open — after ~12s with nothing landed the skeleton yields to a retry.
function useSpirit(c, reversed, loc, active) {
  useStore(aiTick);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const { text: block, sig } = groundCard(c, reversed);
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

// ── the card's page ──────────────────────────────────────────────────────────────────────────────
// A full-screen top-layer dialog (tarot's Ritual precedent), history-backed through S.screen so Back
// closes it; opaque, in the page's own material. The art takes the upper half; a tap on it or the flip
// button turns it over, and the words below follow the orientation. The dialog body is the one scroll.
function CardPage({ open, onClose, idx, t, loc }) {
  const dref = useRef(), frameRef = useRef();
  const [rev, setRev] = useState(false);
  const { boxRef, grip } = useSheetDrag(onClose);
  useStore(trTick);
  const c = DECK[idx];
  const pos = ORDER.indexOf(idx);
  const goTo = (step) => { setRev(false); $sel.set(ORDER[(pos + step + ORDER.length) % ORDER.length]); };
  const { paneRef, pan } = usePanX({ onNext: () => goTo(1), onPrev: () => goTo(-1) });
  const { text, failed, retry } = useSpirit(c, rev, loc, open);

  useEffect(() => { const el = dref.current; if (!el) return; if (open) { if (!el.open) el.showModal?.(); } else el.close?.(); }, [open]);
  useEffect(() => { if (open) setRev(false); }, [open]);
  useEffect(() => { if (open) warm([c.up, c.rev], loc); }, [open, c, loc]);
  // a new card arrives like a cut: a short rise, no scatter
  useEffect(() => {
    if (instant() || !open) return;
    const el = frameRef.current; if (!el) return;
    const a = animate(el, { opacity: [0, 1], transform: ["translateY(10px) scale(.985)", "translateY(0px) scale(1)"] }, { duration: 0.35, ease: "easeOut" });
    return () => a.stop?.();
  }, [idx, open]);

  const meaning = rev ? c.rev : c.up;
  return html`<dialog id="card" ref=${dref} class="modal" aria-label=${cardName(c, loc)} onClose=${onClose}>
    <div ref=${boxRef} class="modal-box max-w-none w-screen h-[100dvh] max-h-none rounded-none p-0 overflow-hidden relative bg-base-100 text-base-content">
      <div class="flex flex-col h-full" style="padding-top:calc(env(safe-area-inset-top) + 0.5rem);padding-bottom:env(safe-area-inset-bottom)">
        ${grip}
        <div class="shrink-0 flex items-start justify-between gap-3 px-[var(--ms-pad)] pb-2">
          <div class="min-w-0">
            <div data-name class="font-bold text-[length:var(--ms-title)] leading-tight truncate">${cardName(c, loc)}</div>
            <div class="mt-0.5 font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-muted truncate">${kindOf(c, t)} · <span data-orient class=${rev ? "text-warning" : "text-secondary"}>${T(t, rev ? "reversed" : "upright")}</span></div>
          </div>
          <button data-card-close aria-label=${T(t, "close")} class="btn btn-sm btn-circle btn-ghost shrink-0" onClick=${onClose}>${Icon("lucide:x", "text-lg")}</button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-[var(--ms-gap)] px-[var(--ms-pad)] pb-[var(--ms-pad)]">
          ${/* the art: half the screen, the frame exactly the scan's shape; tap = flip; swipe = the next card */""}
          <div ref=${paneRef} ...${pan} class="sp-void sp-stage shrink-0 flex items-center justify-center touch-pan-y">
            <button ref=${frameRef} data-card data-reversed=${rev ? "1" : "0"} aria-label=${T(t, "flip")} aria-pressed=${rev} onClick=${() => setRev((r) => !r)}
              class=${`sp-frame sf-e3 ${rev ? "rotate-180" : ""}`}>
              <img src=${imgURL(c.img)} alt="" class="sp-art" />
            </button>
          </div>
          <div class="shrink-0 flex items-center justify-center gap-[var(--ms-gap)]">
            <button data-prev aria-label=${T(t, "prevCard")} class="btn btn-sm btn-circle" onClick=${() => goTo(-1)}>${Icon("lucide:chevron-left", "text-lg")}</button>
            <button data-flip class=${`btn btn-sm rounded-full gap-1.5 ${rev ? "btn-secondary" : ""}`} aria-pressed=${rev} onClick=${() => setRev((r) => !r)}>${Icon("lucide:flip-vertical-2", "text-base")}<span class="text-xs font-semibold">${T(t, "flip")}</span></button>
            <button data-next aria-label=${T(t, "nextCard")} class="btn btn-sm btn-circle" onClick=${() => goTo(1)}>${Icon("lucide:chevron-right", "text-lg")}</button>
          </div>

          <div class="flex flex-col max-w-[480px] w-full mx-auto pt-2">
            ${text ? html`<${Typewriter} key=${c.id + (rev ? "r" : "u") + loc} text=${text} />`
              : failed ? html`<div class="flex flex-col items-center gap-3 py-4 text-center">
                  <span class="text-base-content/80">${T(t, "spiritFail")}</span>
                  <button data-spirit-retry onClick=${retry} class="btn btn-sm rounded-full gap-2">${Icon("lucide:rotate-cw", "text-base")}<span class="text-xs">${T(t, "retry")}</span></button>
                </div>`
              : html`<div class="flex flex-col items-center gap-2 text-muted">${[26, 32, 28, 20].map((n, i) => html`<div key=${i}><${Scramble} len=${n} /></div>`)}</div>`}
            ${/* the substance under the prose: Waite's meaning for this orientation, the block the model was
                  handed, so the words above can be checked against it */""}
            <div aria-hidden="true" class="mt-5 h-px w-full" style="background:linear-gradient(90deg,transparent,var(--app-accent),transparent);opacity:.5"></div>
            <p data-meaning class="mt-4 text-center text-sm leading-relaxed text-muted">${tr(meaning, loc)}</p>
            <div class="mt-4 flex items-start justify-center gap-2 text-[length:var(--ms-label)] text-muted text-center">
              ${Icon("lucide:sparkles", "shrink-0 mt-0.5")}<span>${T(t, "spiritGenerated")}</span>
            </div>
          </div>
        </div>
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
  return html`<div data-spirit-text class="text-center text-[1.05rem] font-light leading-loose whitespace-pre-line text-base-content">
    <span class="sr-only">${text}</span>
    <span aria-hidden="true">${text.slice(0, n)}${done ? "" : html`<span class="sp-caret ml-0.5"></span>`}</span>
  </div>`;
}
