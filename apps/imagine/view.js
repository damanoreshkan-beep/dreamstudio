import { html } from "htm/preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { useKept } from "./kept.js";
import { T, sys } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { Dust } from "/_rt/dust.js";
import { Island, Segmented } from "/_rt/ui.js";
import { mockArt, extOf } from "/_rt/intake.js";
import { startJob, follow as followJob, cancelJob } from "/_rt/imagejob.js";
import { writeLastGen } from "/_rt/lastgen.js";
import { toEnglish } from "/_rt/translate.js";
import { suggestPrompt } from "/_rt/ai-text.js";
import { downloadUrl } from "/_rt/apk.js";
import { promptHandoff } from "./handoff.js";
import { Lightbox } from "./lightbox.js";
import { usePromptHistory, HistorySheet } from "./history.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";

const JOB_KEY = "ms:imagine:job";
const BASE = `${VPS_PROXY}/image`;

export { retouch } from "./edit.js";
export { describe } from "./describe.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randSeed = () => Math.floor(Math.random() * 1e9);
const SPARKS = ["a lighthouse in a raging storm", "bioluminescent jellyfish in the deep sea", "a lone cabin under the northern lights", "brutalist architecture at dawn", "a fox in a misty autumn forest", "floating islands above the clouds", "a neon-lit rainy Tokyo alley", "an astronaut on a pastel desert planet", "a koi pond with cherry blossoms", "a snowy mountain village at dusk", "a whale swimming through a starry sky", "an old library with towering shelves", "a hummingbird at a tropical flower", "a coral reef bursting with colour", "a foggy harbour at first light", "a field of lavender under a purple sky", "a dragon curled on a mountain peak", "a quiet café on a rainy Paris street"];
const gateDream = "гірське озеро на світанку, кришталева вода, золоте світло, кінематографічно";
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const W = 768, H = 1024;
const EST = { fast: 18, "2k": 32 };
const ASPECTS = [["screen", "lucide:smartphone"], ["square", "lucide:square"], ["portrait", "lucide:rectangle-vertical"], ["landscape", "lucide:rectangle-horizontal"]];
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";

export function imagine({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const [prompt, setPrompt] = useKept("make.prompt", gate ? "northern lights over a frozen lake, cinematic, ultra detailed" : "");
  const [phase, setPhase] = useKept("make.phase", gate ? "done" : "idle");
  const [slides, setSlides] = useKept("make.slides", gate ? [7, 8, 9, 10].map((seed) => ({ url: mockArt(seed), w: W, h: H, seed })) : []);
  const [idx, setIdx] = useKept("make.idx", 0);
  const [more, setMore] = useKept("make.more", false);
  const [error, setError] = useKept("make.error", null);
  const [t0, setT0] = useKept("make.t0", 0);
  const [live, setLive] = useState(null);
  const [quality, setQuality] = useKept("make.quality", "fast");
  const [aspect, setAspect] = useKept("make.aspect", "screen");
  const [suggesting, setSuggesting] = useState(false);
  const runRef = useRef(0);
  const jobRef = useRef(null);
  const holdRef = useRef(null);
  const islandRef = useRef(null);
  const [islandH, setIslandH] = useState(0);
  useEffect(() => {
    const el = islandRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setIslandH(el.getBoundingClientRect().height)); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [, tick] = useState(0);
  useEffect(() => { if (phase !== "generating") return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [phase]);
  const elapsed = phase === "generating" && t0 ? Math.round((Date.now() - t0) / 1000) : 0;

  const handed = useStore(promptHandoff);
  useEffect(() => { if (handed) { setPrompt(handed); promptHandoff.set(null); } }, [handed]);

  const est = EST[quality];
  const cur = slides[idx] || slides[0] || null;
  const [hist, remember] = usePromptHistory("make");

  const fail = (run, key) => { if (run !== runRef.current) return; holdRef.current?.(); holdRef.current = null; jobRef.current = null; setError(key); setPhase("error"); };

  const dream = async () => {
    if (suggesting || phase === "generating") return;
    if (gate) { setPrompt(gateDream); return; }
    setSuggesting(true);
    try { const p = await suggestPrompt("dream", SPARKS[Math.floor(Math.random() * SPARKS.length)], loc); if (p) setPrompt(p.local); }
    finally { setSuggesting(false); }
  };

  const freeSlides = (list) => list.forEach((s) => { if (s.url?.startsWith?.("blob:")) URL.revokeObjectURL(s.url); });

  const follow = async (job, run, p, seed) => {
    const alive = () => run === runRef.current;
    const release = holdBackground({ title: T(t, "title"), body: T(t, "eGenerating") });
    holdRef.current = release;
    const mine = [];
    const status = await followJob({
      base: BASE, job, alive,
      onLive: (l) => setLive(l),
      onSlide: (s) => {
        mine.push({ url: s.url, w: s.w || W, h: s.h || H, by: s.by, seed: seed + s.n, ext: extOf(s.blob) });
        setSlides([...mine]); setMore(true);
        if (mine.length === 1) {
          setIdx(0); setPhase("done"); writeLastGen(s.blob, p);
          if (document.visibilityState === "hidden") notify({ id: "imagine-done", title: T(t, "title"), body: T(t, "notifDone"), url: "./" });
        }
      },
    });
    if (status === "stale") return;
    release(); holdRef.current = null; jobRef.current = null;
    setMore(false); setLive(null);
    try { localStorage.removeItem(JOB_KEY); } catch { }
    if (!mine.length) fail(run, status === "timeout" ? "eTimeout" : status === "busy" ? "eBusy" : "eFailed");
  };

  const generate = async () => {
    const p = prompt.trim();
    if (!p || phase === "generating") return;
    const seed = randSeed(), run = ++runRef.current;
    setError(null); setLive(null); setMore(false); setT0(Date.now());
    holdRef.current?.(); holdRef.current = null;
    freeSlides(slides); setSlides([]); setIdx(0); setPhase("generating");
    remember(p);
    if (gate) { await sleep(90); if (run === runRef.current) { setSlides([seed, seed + 1, seed + 2, seed + 3].map((sd) => ({ url: mockArt(sd), w: W, h: H, seed: sd }))); setPhase("done"); } return; }
    notifyAsk();
    let pEn; try { pEn = await toEnglish(p); } catch (e) { return fail(run, e.code || "eTranslate"); }
    if (run !== runRef.current) return;
    const ratio = Math.max(0.3, Math.min(3, (window.innerWidth || 1) / (window.innerHeight || 1)));
    let job; try { job = await startJob(BASE, { prompt: pEn, quality, aspect, ratio, seed, k: 4 }); } catch (e) { return fail(run, e.code || "eNetwork"); }
    if (run !== runRef.current) { cancelJob(BASE, job); return; }
    jobRef.current = job;
    const began = Date.now(); setT0(began);
    try { localStorage.setItem(JOB_KEY, JSON.stringify({ job, prompt: p, seed, ts: began })); } catch { }
    await follow(job, run, p, seed);
  };

  useEffect(() => {
    if (gate) return;
    let j = null; try { j = JSON.parse(localStorage.getItem(JOB_KEY) || "null"); } catch { }
    if (!j?.job || Date.now() - j.ts > 240000) { try { localStorage.removeItem(JOB_KEY); } catch { } return; }
    const run = ++runRef.current; jobRef.current = j.job;
    setPrompt(j.prompt || ""); setPhase("generating"); setT0(j.ts);
    follow(j.job, run, j.prompt || "", j.seed || 0);
  }, []);

  const cancel = () => {
    if (phase !== "generating") return;
    runRef.current++; const job = jobRef.current; jobRef.current = null;
    holdRef.current?.(); holdRef.current = null;
    setMore(false); setLive(null); setPhase("idle"); try { localStorage.removeItem(JOB_KEY); } catch { }
    if (job && !gate) cancelJob(BASE, job);
  };

  const onSlidesScroll = (e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (n !== idx && n >= 0 && n < slides.length) setIdx(n); };
  useEffect(() => { if (!gate && cur?.url && phase === "done") writeLastGen(cur.url, prompt); }, [idx]);

  const save = () => {
    if (!cur?.url) return;
    try {
      downloadUrl(cur.url, `imagine-${cur.seed}.${cur.ext || "jpg"}`);
      toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); generate(); } };
  const genProgress = phase === "generating" ? (live?.pct != null ? Math.max(0.02, live.pct / 100) : Math.min(0.95, elapsed / Math.max(1, est))) : null;
  const fit = aspect === "screen" ? "object-cover" : "object-contain";
  const slideStyle = aspect === "screen" ? "" : `padding-bottom:${Math.round(islandH)}px`;
  const placeholder = T(t, "promptPlaceholder");

  return html`<div class="ms-stage relative overflow-hidden bg-black" data-phase=${phase} data-aspect-fit=${aspect} data-quality=${quality}>
    <${Lightbox} open=${screen === "view" && !!cur} slides=${slides} index=${idx} onIndex=${setIdx} alt=${prompt} onClose=${() => S.screen.set(null)} />
    <${HistorySheet} id="hist-make" open=${screen === "hist"} onClose=${() => S.screen.set(null)} items=${hist} onPick=${setPrompt} t=${t} locale=${loc} />
    <div class="absolute inset-0">
      ${phase === "done" && slides.length
        ? html`<div data-slides tabindex="0" role="region" aria-label=${T(t, "slides")} class="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory outline-none" style="scrollbar-width:none" onScroll=${onSlidesScroll}>
            ${slides.map((s, i) => html`<div key=${s.url} class="w-full h-full shrink-0 snap-center bg-black" style=${slideStyle}><img data-result data-slide=${i} src=${s.url} alt=${prompt} class=${`w-full h-full ${fit}`} loading=${i > 1 ? "lazy" : "eager"} onClick=${() => S.screen.set("view")} /></div>`)}
          </div>`
        : html`<${Dust} active=${phase === "generating"} progress=${genProgress} />`}
      <div class="absolute inset-x-0 bottom-0 h-2/5 im-scrim-b pointer-events-none"></div>
      <div class="absolute inset-x-0 top-0 h-24 im-scrim-t pointer-events-none"></div>
    </div>

    <div class="relative z-10 h-full flex flex-col pointer-events-none">
      <div class="flex justify-end px-[var(--ms-pad)] pt-[var(--ms-gap)] min-h-[1.5rem]">
        ${phase === "done" && cur ? html`<span data-res class="im-chip font-mono text-[length:var(--ms-label)] tabular-nums px-2 py-0.5 rounded-full">${cur.w}×${cur.h}</span>` : null}
      </div>

      <div class="flex-1 min-h-0 flex items-center justify-center px-8 text-center">
        ${phase === "generating" ? html`<div data-working data-gen class="im-chip rounded-full px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums">${T(t, "eGenerating")} ${fmt(elapsed)}${live?.steps ? html` · ${live.step}/${live.steps}` : null}</div>` : null}
      </div>

      ${""}
      ${phase === "done" && (slides.length > 1 || more) ? html`<div data-dots class="flex justify-center items-center gap-1.5 pb-2 text-white">
        ${slides.map((s, i) => html`<span key=${s.url} class=${`rounded-full bg-current transition-[width,opacity] ${i === idx ? "w-4 h-1.5" : "w-1.5 h-1.5 opacity-45"}`}></span>`)}
        ${more ? html`<span class="w-1.5 h-1.5 rounded-full bg-current im-more"></span>` : null}
      </div>` : null}

      <div ref=${islandRef} class="p-[var(--ms-gap)] pt-0 pointer-events-auto">
      <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
        ${""}
        <div class="flex gap-[var(--ms-gap)]">
          <div class="flex-1 min-w-0">
            <${Segmented} attr="data-q" size="sm" label=${T(t, "quality")} value=${quality} onChange=${setQuality}
              items=${[{ id: "fast", label: T(t, "speed"), icon: "lucide:zap" }, { id: "2k", label: T(t, "quality"), icon: "lucide:gem" }]} />
          </div>
          <div class="flex-1 min-w-0">
            <${Segmented} attr="data-aspect" size="sm" label=${T(t, "aspect")} value=${aspect} onChange=${setAspect}
              items=${ASPECTS.map(([id, icon]) => ({ id, icon, label: T(t, "aspect_" + id) }))} />
          </div>
        </div>
        <div data-field class="sf-inset rounded-[var(--ms-r-in)] p-2 flex flex-col gap-1 focus-within:ring-1 focus-within:ring-base-content/25">
          <textarea id="prompt" rows="2" aria-label=${placeholder}
            class="w-full resize-none bg-transparent border-0 outline-none px-2 pt-1 text-[0.95rem] leading-snug text-base-content placeholder:text-muted"
            placeholder=${placeholder} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
          <div class="flex items-center gap-0.5">
            <button data-dream aria-label=${T(t, "dream")} aria-busy=${suggesting ? "true" : null} class=${tool} disabled=${suggesting || phase === "generating"} onClick=${dream}>${Icon("lucide:dices", "text-lg")}</button>
            <button data-history aria-label=${T(t, "history")} class=${tool} onClick=${() => S.screen.set("hist")}>${Icon("lucide:history", "text-lg")}</button>
            <div class="flex-1"></div>
            ${phase === "done" && cur ? html`<button data-save aria-label=${T(t, "save")} title=${T(t, "save")} class="btn btn-sm btn-circle shrink-0" onClick=${save}>${Icon("lucide:download", "text-base")}</button>` : null}
            ${phase === "generating"
              ? html`<button data-cancel class="btn btn-sm rounded-full gap-1.5 shrink-0" onClick=${cancel}>${Icon("lucide:square", "text-base")}${sys("cancel", loc)}</button>`
              : html`<button id="go" data-go class="btn btn-primary btn-sm rounded-full gap-1.5 shrink-0" disabled=${!prompt.trim()} onClick=${generate}>${Icon("lucide:sparkles", "text-base")}${T(t, phase === "done" || phase === "error" ? "again" : "generate")}</button>`}
          </div>
        </div>
        ${phase === "error" ? html`<p data-error role="alert" class="text-sm text-error px-1">${T(t, error || "eFailed")}</p>` : null}
      <//>
      </div>
    </div>
  </div>`;
}
