import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { useKept } from "./kept.js";
import { T, sys } from "/_rt/i18n.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { gate } from "/_rt/gate.js";
import { Island } from "/_rt/ui.js";
import { Chooser, Camera, mockArt, toDataURL } from "/_rt/intake.js";
import { cancelJob } from "/_rt/imagejob.js";
import { taskSlides, jobCode } from "/_rt/task.js";
import { toEnglish } from "/_rt/translate.js";
import { suggestPrompt } from "/_rt/ai-text.js";
import { downloadUrl } from "/_rt/apk.js";
import { Lightbox } from "./lightbox.js";
import { usePromptHistory, HistorySheet } from "./history.js";
import { editHandoff } from "./handoff.js";
import { notify, notifyAsk } from "/_rt/notify.js";
import { holdBackground } from "/_rt/bghold.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { } };
const randSeed = () => Math.floor(Math.random() * 1e9);
const SPARKS = ["turn it into an oil painting", "cinematic golden-hour lighting", "vintage film photograph", "soft watercolour illustration", "add dramatic shadows", "make it a snowy winter scene", "cyberpunk neon aesthetic", "dreamy pastel tones", "black-and-white film noir", "warm autumn colours", "add a glowing sunset sky", "studio portrait lighting", "misty morning atmosphere", "retro 80s synthwave look", "add gentle falling rain", "turn day into night", "pencil sketch style", "vibrant pop-art colours", "soft cinematic bloom", "add a shallow depth of field"];
const gateDream = "перетвори на олійний живопис";
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const EST = 40;
const BASE = `${VPS_PROXY}/image/edit`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";

export function retouch({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const [phase, setPhase] = useKept("edit.phase", gate ? "ready" : "empty");
  const [srcUrl, setSrcUrl] = useKept("edit.src", gate ? mockArt(3) : null);
  const [original, setOriginal] = useKept("edit.original", gate ? mockArt(3) : null);
  const [slides, setSlides] = useKept("edit.slides", []);
  const [idx, setIdx] = useKept("edit.idx", 0);
  const [more, setMore] = useKept("edit.more", false);
  const cur = slides[idx] || slides[0] || null;
  const [prompt, setPrompt] = useKept("edit.prompt", gate ? "add falling snow, cinematic" : "");
  const [error, setError] = useState(null);
  const [t0, setT0] = useState(0);
  const [live, setLive] = useState(null);
  const [suggesting, setSuggesting] = useState(false);

  const runRef = useRef(0), blobs = useRef([]), jobRef = useRef(null), holdRef = useRef(null);
  const [hist, remember] = usePromptHistory("edit");
  const [, tick] = useState(0);
  useEffect(() => { if (phase !== "editing") return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [phase]);
  const elapsed = phase === "editing" && t0 ? Math.round((Date.now() - t0) / 1000) : 0;

  const own = (url) => { if (url?.startsWith?.("blob:")) blobs.current.push(url); return url; };
  const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { } blobs.current = blobs.current.filter((u) => u !== url); } };

  useEffect(() => {
    if (phase === "editing" && !jobRef.current) setPhase(slides.length ? "done" : (srcUrl ? "ready" : "empty"));
  }, []);

  const dropSlides = () => { slides.forEach((x) => revoke(x.url)); setSlides([]); setIdx(0); setMore(false); };
  const loadSource = (url) => {
    dropSlides(); setError(null); setLive(null);
    setSrcUrl(own(url)); setOriginal(url); setPhase("ready");
  };
  const backToChooser = () => { setPhase("empty"); };

  const fail = (run, key) => { if (run !== runRef.current) return; holdRef.current?.(); holdRef.current = null; jobRef.current = null; setError(key); setPhase("error"); };

  const handed = useStore(editHandoff);
  useEffect(() => { if (handed?.url) { loadSource(handed.url); setPrompt(handed.prompt || ""); editHandoff.set(null); } }, [handed]);

  const dream = async () => {
    if (suggesting || phase === "editing") return;
    if (gate) { setPrompt(gateDream); return; }
    setSuggesting(true);
    try { const p = await suggestPrompt("edit", SPARKS[Math.floor(Math.random() * SPARKS.length)], loc); if (p) setPrompt(p.local); }
    finally { setSuggesting(false); }
  };

  const edit = async () => {
    const p = prompt.trim();
    if (!p || !srcUrl || phase === "editing") return;
    const seed = randSeed(), run = ++runRef.current;
    buzz(); setError(null); setLive(null); setT0(Date.now());
    holdRef.current?.(); holdRef.current = null;
    dropSlides(); setPhase("editing");
    remember(p);
    if (gate) { await sleep(120); if (run === runRef.current) { setSlides([0, 1, 2, 3].map((n) => ({ url: mockArt(seed + n) }))); setPhase("done"); } return; }
    notifyAsk();
    let image;
    try { image = (await toDataURL(srcUrl)).data; } catch { return fail(run, "edFailed"); }
    if (run !== runRef.current) return;
    if (image.length > 9_000_000) return fail(run, "eBig");
    let pEn; try { pEn = await toEnglish(p); } catch (e) { return fail(run, e.code || "eTranslate"); }
    if (run !== runRef.current) return;
    // the edit is a TASK on the edge (rt/task.js, the weak-link transport): each picture by byte range as it lands
    const alive = () => run === runRef.current;
    const release = holdBackground({ title: T(t, "title"), body: T(t, "eEditing") }); holdRef.current = release;
    const mine = [];
    let status;
    try {
      status = await taskSlides("/feed/image/edit", { image, prompt: pEn, seed, k: 4 }, {
        onStart: (_id, rep) => { if (alive()) jobRef.current = rep.job; else cancelJob(BASE, rep.job); },
        onLive: (l) => { if (alive()) setLive(l); },
        onSlide: (s) => {
          if (!alive()) return;
          mine.push({ url: own(s.url), w: s.w, h: s.h, by: s.by });
          setSlides([...mine]); setMore(true);
          if (mine.length === 1) {
            setIdx(0); setPhase("done"); buzz(12);
            if (document.visibilityState === "hidden") notify({ id: "imagine-edit-done", title: T(t, "title"), body: T(t, "notifEditDone"), url: "./?tab=edit" });
          }
        },
      });
    } catch (e) { release(); holdRef.current = null; const c = jobCode(e); return fail(run, c === "eFailed" ? "edFailed" : c); }
    if (!alive()) return;
    release(); holdRef.current = null; jobRef.current = null;
    setMore(false); setLive(null);
    if (!mine.length) fail(run, status === "busy" ? "eBusy" : "edFailed");
  };

  const cancel = () => {
    if (phase !== "editing") return;
    runRef.current++; const job = jobRef.current; jobRef.current = null;
    holdRef.current?.(); holdRef.current = null;
    setMore(false); setLive(null); setPhase("ready");
    if (job && !gate) cancelJob(BASE, job);
  };

  const keep = () => { if (!cur?.url) return; buzz(); const next = cur.url; slides.forEach((x) => { if (x.url !== next) revoke(x.url); }); setSlides([]); setIdx(0); setMore(false); setSrcUrl(next); setPrompt(""); setError(null); setPhase("ready"); };
  const revert = () => { buzz(); dropSlides(); setSrcUrl(original); setError(null); setPhase("ready"); };
  const onSlidesScroll = (e) => { const el = e.currentTarget; const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (n !== idx && n >= 0 && n < slides.length) setIdx(n); };

  const save = () => {
    const url = cur?.url; if (!url) return;
    try {
      downloadUrl(url, `retouch-${Date.now()}.jpg`); toast?.(T(t, "saved"));
    } catch { toast?.(T(t, "eNetwork")); }
  };

  const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); edit(); } };

  const isDone = phase === "done" && !!cur;
  const pct = live?.pct != null ? Math.min(99, Math.round(live.pct)) : Math.min(96, Math.round(elapsed / EST * 100));
  const placeholder = T(t, "edPlaceholder");

  return html`<div class="ms-stage z-20 bg-base-100 flex flex-col" data-phase=${phase}>
    <${Lightbox} open=${screen === "view" && !!(isDone ? cur?.url : srcUrl)} slides=${isDone ? slides : null} src=${isDone ? null : srcUrl} index=${idx} onIndex=${setIdx} alt=${prompt} onClose=${() => S.screen.set(null)} />
    <${HistorySheet} id="hist-edit" open=${screen === "hist"} onClose=${() => S.screen.set(null)} items=${hist} onPick=${setPrompt} t=${t} locale=${loc} />

    ${""}
    <div class=${`relative flex-1 min-h-0 overflow-hidden flex items-center justify-center ${phase === "empty" ? "bg-base-100" : "bg-black"}`}>
      ${phase === "empty" ? html`<${Chooser} loc=${loc} onPick=${loadSource} onCamera=${() => { buzz(); setPhase("camera"); }} />` : null}
      ${phase === "camera" ? html`<${Camera} loc=${loc} reason=${T(t, "primeReason")} privacy=${T(t, "primePrivacy")}
        onCapture=${(d) => { buzz(14); loadSource(d); }} onClose=${backToChooser} onSettings=${() => S.screen.set("perms")} />` : null}

      ${isDone ? html`<div data-slides tabindex="0" role="region" aria-label=${T(t, "slides")} class="absolute inset-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory outline-none" style="scrollbar-width:none" onScroll=${onSlidesScroll}>
        ${slides.map((x, i) => html`<div key=${x.url} class="w-full h-full shrink-0 snap-center bg-black"><img data-result data-slide=${i} src=${x.url} alt=${prompt} class="w-full h-full object-contain" onClick=${() => S.screen.set("view")} /></div>`)}
      </div>` : null}
      ${isDone && (slides.length > 1 || more) ? html`<div data-dots class="absolute inset-x-0 bottom-3 flex justify-center items-center gap-1.5 pointer-events-none text-white">
        ${slides.map((x, i) => html`<span key=${x.url} class=${`rounded-full bg-current transition-[width,opacity] ${i === idx ? "w-4 h-1.5" : "w-1.5 h-1.5 opacity-45"}`}></span>`)}
        ${more ? html`<span class="w-1.5 h-1.5 rounded-full bg-current im-more"></span>` : null}
      </div>` : null}
      ${(phase === "ready" || phase === "editing" || phase === "done" || phase === "error") && srcUrl ? html`<${Fragment}>
        ${isDone ? null : html`<img data-result src=${srcUrl} alt="" class=${`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${phase === "editing" ? "opacity-30" : "opacity-100"}`} onClick=${() => phase === "ready" && S.screen.set("view")} />`}
        ${isDone ? html`<button data-new aria-label=${T(t, "newImg")} class="absolute top-3 left-3 btn btn-circle btn-sm im-chip border-0" onClick=${() => { revert(); setPhase("empty"); }}>${Icon("lucide:x", "text-base")}</button>` : null}
      </${Fragment}>` : null}

      ${""}
      ${phase === "editing" ? html`<${Fragment}>
        <div data-working data-gen class="relative z-10 im-chip rounded-full px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums">${T(t, "eEditing")} ${fmt(elapsed)}${live?.steps ? html` · ${live.step}/${live.steps}` : null}</div>
        <div class="im-light" style=${`--pct:${Math.max(4, pct)}%`}></div>
      </${Fragment}>` : null}
    </div>

    ${""}
    ${phase === "ready" || phase === "editing" || phase === "error" || isDone ? html`<div class="shrink-0 p-[var(--ms-gap)]">
    <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
      ${isDone ? html`<div data-actions class="@container flex items-center gap-1.5">
        <button data-keep class="btn btn-sm btn-primary rounded-full flex-1 min-w-0 gap-1.5" onClick=${keep}>${Icon("lucide:wand-sparkles", "text-base shrink-0")}<span class="truncate @max-[15rem]:hidden">${T(t, "keep")}</span></button>
        <button data-revert class="btn btn-sm rounded-full flex-1 min-w-0 gap-1.5" onClick=${revert}>${Icon("lucide:undo-2", "text-base shrink-0")}<span class="truncate @max-[15rem]:hidden">${T(t, "revert")}</span></button>
        <button data-save class="btn btn-sm btn-circle shrink-0" aria-label=${T(t, "save")} title=${T(t, "save")} onClick=${save}>${Icon("lucide:download", "text-base")}</button>
      </div>` : html`<${Fragment}>
        <div data-field class="sf-inset rounded-[var(--ms-r-in)] p-2 flex flex-col gap-1 focus-within:ring-1 focus-within:ring-base-content/25">
          <textarea id="prompt" rows="2" aria-label=${placeholder}
            class="w-full resize-none bg-transparent border-0 outline-none px-2 pt-1 text-[0.95rem] leading-snug text-base-content placeholder:text-muted"
            placeholder=${placeholder} value=${prompt} onInput=${(e) => setPrompt(e.target.value)} onKeyDown=${onKey}></textarea>
          <div class="flex items-center gap-0.5">
            <button data-new aria-label=${T(t, "newImg")} class=${tool} disabled=${phase === "editing"} onClick=${backToChooser}>${Icon("lucide:image-plus", "text-lg")}</button>
            <button data-dream aria-label=${T(t, "edDream")} aria-busy=${suggesting ? "true" : null} class=${tool} disabled=${suggesting || phase === "editing"} onClick=${() => { buzz(); dream(); }}>${Icon("lucide:dices", "text-lg")}</button>
            <button data-history aria-label=${T(t, "history")} class=${tool} onClick=${() => S.screen.set("hist")}>${Icon("lucide:history", "text-lg")}</button>
            <div class="flex-1"></div>
            ${phase === "editing"
              ? html`<button data-cancel class="btn btn-sm rounded-full gap-1.5 shrink-0" onClick=${cancel}>${Icon("lucide:square", "text-base")}${sys("cancel", loc)}</button>`
              : html`<button data-edit class="btn btn-primary btn-sm rounded-full gap-1.5 shrink-0" disabled=${!prompt.trim()} onClick=${edit}>${Icon("lucide:wand-sparkles", "text-base")}${T(t, phase === "error" ? "edAgain" : "editBtn")}</button>`}
          </div>
        </div>
        ${phase === "error" ? html`<p data-error role="alert" class="text-sm text-error px-1">${T(t, error || "edFailed")}</p>` : null}
      </${Fragment}>`}
    <//>
    </div>` : null}
  </div>`;
}
