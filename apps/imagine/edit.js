// Retouch (Онови) — instruction image editing, FREE and keyless. You give it a photo (upload · camera · the
// last image you made in Уяви) and a few words — "add snow", "remove the wires", "as an oil painting" — and
// the image is rewritten. The instruction + image go to our VPS proxy's /feed/image/edit, which cascades
// across anonymous public HF Gradio Spaces (FLUX.1-Kontext, Qwen-Image-Edit, Step1X, …) and streams the
// edited image back — no API key, no credits, ever. Editing is iterative BY CHOICE: after a result you can
// "keep editing" (the result becomes the new base) or go back to the "original", so a chain of edits or a
// fresh pass off the source are both one tap. Sibling to Уяви (apps/imagine).
//
// Where the picture comes from is the kit's /_rt/intake.js (the chooser island, the primed viewfinder, the
// capped JPEG on the wire); the race is the kit's /_rt/imagejob.js. The headless gate has no camera and no
// network and must stay deterministic, so under `gate` it seeds mockArt as the source and, on edit, a
// differently-seeded one as the result — the whole flow runs without a single call out.
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
import { startJob, follow as followJob, cancelJob } from "/_rt/imagejob.js";
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
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* */ } };
const randSeed = () => Math.floor(Math.random() * 1e9);
// Random seed phrases for the "surprise me" button — the AI expands one into a short, localized edit
// instruction. Only a spark for variety (never shown); the model writes the actual instruction in the locale.
const SPARKS = ["turn it into an oil painting", "cinematic golden-hour lighting", "vintage film photograph", "soft watercolour illustration", "add dramatic shadows", "make it a snowy winter scene", "cyberpunk neon aesthetic", "dreamy pastel tones", "black-and-white film noir", "warm autumn colours", "add a glowing sunset sky", "studio portrait lighting", "misty morning atmosphere", "retro 80s synthwave look", "add gentle falling rain", "turn day into night", "pencil sketch style", "vibrant pop-art colours", "soft cinematic bloom", "add a shallow depth of field"];
const gateDream = "перетвори на олійний живопис";                                  // gate: deterministic, no network
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;    // seconds → m:ss
const EST = 40;                                                                   // rough edit wall-clock (steps-heavy models run slower than text→image)
const BASE = `${VPS_PROXY}/image/edit`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";

export function retouch({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  // phase: empty (source chooser) · camera (viewfinder) · ready (image + instruction) · editing · done · error
  const [phase, setPhase] = useKept("edit.phase", gate ? "ready" : "empty");
  const [srcUrl, setSrcUrl] = useKept("edit.src", gate ? mockArt(3) : null);                 // the image currently being edited (display)
  const [original, setOriginal] = useKept("edit.original", gate ? mockArt(3) : null);            // the first source loaded (for "revert")
  // SLIDES: the race returns up to K edits and they land one by one; `cur` is the one in view (Save / keep / handoff).
  const [slides, setSlides] = useKept("edit.slides", []);                                       // [{url, w, h, by}]
  const [idx, setIdx] = useKept("edit.idx", 0);
  const [more, setMore] = useKept("edit.more", false);                                        // the race is still delivering
  const cur = slides[idx] || slides[0] || null;
  const [prompt, setPrompt] = useKept("edit.prompt", gate ? "add falling snow, cinematic" : "");
  const [error, setError] = useState(null);
  const [t0, setT0] = useState(0);
  const [live, setLive] = useState(null);                                          // the Space's own progress {eta, pct, step, steps}, once the worker reports it
  const [suggesting, setSuggesting] = useState(false);                            // "surprise me" instruction is being written by the AI

  const runRef = useRef(0), blobs = useRef([]), jobRef = useRef(null), holdRef = useRef(null);
  const [hist, remember] = usePromptHistory("edit");
  // a 1s tick only while an edit runs — the elapsed readout, nothing else re-renders for it
  const [, tick] = useState(0);
  useEffect(() => { if (phase !== "editing") return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [phase]);
  const elapsed = phase === "editing" && t0 ? Math.round((Date.now() - t0) / 1000) : 0;

  // Object URLs are revoked when the picture they point at is REPLACED (dropSlides / keep / a new run), never
  // on unmount. Unmount is not the end of this screen's life: the runtime mounts one tab at a time, so a trip
  // to Твори and back used to revoke every blob the kept state is now holding on to, and the tab returned to
  // a row of broken images. `own()` still marks a URL as this screen's to free at the moment it is dropped.
  const own = (url) => { if (url?.startsWith?.("blob:")) blobs.current.push(url); return url; };
  const revoke = (url) => { if (url?.startsWith?.("blob:")) { try { URL.revokeObjectURL(url); } catch { /* */ } blobs.current = blobs.current.filter((u) => u !== url); } };

  // A run that was in flight when this tab went away cannot be resumed — unlike Твори, Онови keeps no job id
  // in storage — and returning to a progress bar that will never move is worse than returning to the
  // composer. Settle a stranded "editing" into whatever the kept slides actually justify.
  useEffect(() => {
    if (phase === "editing" && !jobRef.current) setPhase(slides.length ? "done" : (srcUrl ? "ready" : "empty"));
  }, []);

  // load a source image and go to the ready state (revoke the previous run's result blob first)
  const dropSlides = () => { slides.forEach((x) => revoke(x.url)); setSlides([]); setIdx(0); setMore(false); };
  const loadSource = (url) => {
    dropSlides(); setError(null); setLive(null);
    setSrcUrl(own(url)); setOriginal(url); setPhase("ready");
  };
  const backToChooser = () => { setPhase("empty"); };

  const fail = (run, key) => { if (run !== runRef.current) return; holdRef.current?.(); holdRef.current = null; jobRef.current = null; setError(key); setPhase("error"); };

  // A photo + read handed over from Опиши: it becomes the source on stage and the instruction in the field,
  // consumed once (whether this view was mounted or comes up now).
  const handed = useStore(editHandoff);
  useEffect(() => { if (handed?.url) { loadSource(handed.url); setPrompt(handed.prompt || ""); editHandoff.set(null); } }, [handed]);

  // "Surprise me" — the AI writes a fresh edit instruction from a random spark: English under the hood, the
  // reader's language in the field (suggestPrompt seeds the pair, so edit() sends the model's own English).
  // Fail-open: a miss leaves the field as-is. The gate uses a fixed line.
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
    try { image = (await toDataURL(srcUrl)).data; } catch { return fail(run, "edFailed"); }   // the kit answers { data, w, h } — the string is `.data` (mirage's regression, 2026-09-03)
    if (run !== runRef.current) return;
    if (image.length > 9_000_000) return fail(run, "eBig");                       // ~6.7 MB decoded — over the proxy's body cap
    let pEn; try { pEn = await toEnglish(p); } catch (e) { return fail(run, e.code || "eTranslate"); }   // English or nothing: a native instruction at a Space is the defect (2026-09-03)
    if (run !== runRef.current) return;
    // Async job + poll, exactly like Уяви: POST starts the cascade, short polls never trip the proxy's 60s cap.
    let job; try { job = await startJob(BASE, { image, prompt: pEn, seed, k: 4 }); } catch (e) { return fail(run, e.code === "eFailed" ? "edFailed" : (e.code || "eNetwork")); }
    if (run !== runRef.current) { cancelJob(BASE, job); return; }
    jobRef.current = job;
    const release = holdBackground({ title: T(t, "title"), body: T(t, "eEditing") }); holdRef.current = release;   // APK: stay warm while we poll
    const mine = [];
    const status = await followJob({
      base: BASE, job, alive: () => run === runRef.current,
      onLive: (l) => setLive(l),
      onSlide: (s) => {
        mine.push({ url: own(s.url), w: s.w, h: s.h, by: s.by });
        setSlides([...mine]); setMore(true);
        if (mine.length === 1) {
          setIdx(0); setPhase("done"); buzz(12);
          if (document.visibilityState === "hidden") notify({ id: "imagine-edit-done", title: T(t, "title"), body: T(t, "notifEditDone"), url: "./?tab=edit" });
        }
      },
    });
    if (status === "stale") return;
    release(); holdRef.current = null; jobRef.current = null;
    setMore(false); setLive(null);
    if (!mine.length) fail(run, status === "timeout" ? "eTimeout" : status === "busy" ? "eBusy" : "edFailed");
  };

  // Cancel — abandon this run (a stale reply cannot land) and tell the edge, so the worker stops the race.
  const cancel = () => {
    if (phase !== "editing") return;
    runRef.current++; const job = jobRef.current; jobRef.current = null;
    holdRef.current?.(); holdRef.current = null;
    setMore(false); setLive(null); setPhase("ready");
    if (job && !gate) cancelJob(BASE, job);
  };

  // keep editing: the result becomes the new base (iterative). revert: back to the untouched original.
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

    ${/* The image stage (contain, so an editor never crops what you're working on). The black is a MEDIA
         backdrop — it belongs under a photo or a camera feed, which is foreign content; the white on it (the
         working line, the dots, the × over a picture) is white for the same reason. With nothing loaded the
         stage is simply the page, so the chooser island reads against the material it was built for. */""}
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

      ${/* the working state: the real readout (elapsed · the Space's own step) and a light whose LENGTH is the
           progress along the stage's bottom edge (head.html .im-light) — never a spinner */""}
      ${phase === "editing" ? html`<${Fragment}>
        <div data-working data-gen class="relative z-10 im-chip rounded-full px-4 py-2 font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums">${T(t, "eEditing")} ${fmt(elapsed)}${live?.steps ? html` · ${live.step}/${live.steps}` : null}</div>
        <div class="im-light" style=${`--pct:${Math.max(4, pct)}%`}></div>
      </${Fragment}>` : null}
    </div>

    ${/* The composer is an island in flow under the stage: the page's own material, so the boundary with the
         black stage is a colour change and never needed a hairline on top of it. */""}
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
