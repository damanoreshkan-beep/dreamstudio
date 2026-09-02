// zir — sight for a picture. ONE fit screen: the Stage (the photo; the scan while it is enlarged; then the
// COMPARE — the original and the enlarged one under a divider you drag) over the GL field, and ONE island
// with the quality and the action. The result is the same picture at 4× the pixels, so the stage never
// changes shape between before and after — only what is under the divider does. State and actions live in
// state.js, outside the mount, because the runtime mounts one tab at a time.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { GlStage } from "/_rt/glstage.js";
import { Segmented, Island, Sheet, Stage } from "/_rt/ui.js";
import { downloadUrl, shareFile } from "/_rt/apk.js";
import { Chooser, Camera } from "./source.js";
import * as M from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
const label = "font-mono uppercase tracking-wide font-semibold text-[var(--ms-label)] text-base-content/70";
// The scan: one bright line sweeps the photo top to bottom while the pods work — the upscaler's own idiom,
// and it needs no picture of the result to exist. The working line shimmers like mirage's (a gradient clipped
// to the glyphs); both are still under reduced motion and in the gate.
const CSS = `.zr-scan{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--app-accent),transparent);box-shadow:0 0 18px 4px color-mix(in oklch,var(--app-accent) 55%,transparent);animation:zrScan 2.6s ease-in-out infinite}
@keyframes zrScan{0%{top:2%}50%{top:98%}100%{top:2%}}
.zr-sh{background:linear-gradient(90deg,rgba(255,255,255,.45) 0%,#fff 50%,rgba(255,255,255,.45) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:zrSweep 2.2s linear infinite}
@keyframes zrSweep{from{background-position:200% 0}to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.zr-scan,.zr-sh{animation:none}}`;

// The compare: both pictures fill the SAME box (object-contain, identical aspect), the enlarged one on top
// clipped to the left of the divider. Dragging moves the clip; the pictures never move, so the eye reads the
// difference at one spot. Pointer capture keeps the drag alive past the divider's own 2px.
function Compare({ before, after, t, onOpen }) {
  const box = useRef(); const [x, setX] = useState(0.5); const [drag, setDrag] = useState(false);
  const at = (e) => { const r = box.current?.getBoundingClientRect(); if (!r || !r.width) return; setX(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))); };
  const down = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDrag(true); at(e); };
  const move = (e) => { if (drag) at(e); };
  const up = () => setDrag(false);
  const onKey = (e) => { if (e.key === "ArrowLeft") setX((v) => Math.max(0, v - 0.05)); else if (e.key === "ArrowRight") setX((v) => Math.min(1, v + 0.05)); };
  const pct = `${(x * 100).toFixed(1)}%`;
  return html`<div ref=${box} data-compare role="slider" tabindex="0" aria-label=${T(t, "compare")} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(x * 100)}
      class="relative w-full h-full rounded-[var(--ms-r)] overflow-hidden sf-raised select-none touch-none cursor-ew-resize outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onKeyDown=${onKey} onDblClick=${onOpen}>
    <img data-before src=${before} alt=${T(t, "before")} draggable="false" class="absolute inset-0 w-full h-full object-contain" />
    <img data-result data-after src=${after} alt=${T(t, "after")} draggable="false" class="absolute inset-0 w-full h-full object-contain" style=${`clip-path: inset(0 ${(100 - x * 100).toFixed(2)}% 0 0)`} />
    <div aria-hidden="true" class="absolute inset-y-0 w-px bg-white/90 shadow-[0_0_8px_rgba(0,0,0,.6)] pointer-events-none" style=${`left:${pct}`}></div>
    <div aria-hidden="true" class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center pointer-events-none" style=${`left:${pct}`}>${Icon("lucide:chevrons-left-right", "text-base")}</div>
    <span aria-hidden="true" class="absolute top-2 left-2 rounded-full bg-black/50 px-2 py-0.5 font-mono uppercase tracking-wide text-[0.62rem] text-white pointer-events-none">${T(t, "after")}</span>
    <span aria-hidden="true" class="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 font-mono uppercase tracking-wide text-[0.62rem] text-white pointer-events-none">${T(t, "before")}</span>
    <button data-view aria-label=${T(t, "view")} class="absolute bottom-2 right-2 btn btn-circle btn-xs bg-black/50 text-white border-0" onPointerDown=${(e) => e.stopPropagation()} onClick=${(e) => { e.stopPropagation(); onOpen(); }}>${Icon("lucide:maximize-2", "text-sm")}</button>
  </div>`;
}

export function zir({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const st = useStore(M.$st), opts = useStore(M.$opts), models = useStore(M.$models);
  const working = st.phase === "working";
  const shown = st.out?.url || st.src || null;
  const ctx = { t, loc };
  // a 1s tick only while something runs — the elapsed readout, nothing else re-renders for it
  const [, tick] = useState(0);
  useEffect(() => { if (!working) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [working]);

  // the field's live channels: a plain object the shader reads every frame, never state
  const chan = useRef({ busy: 0, arrive: 0, ready: 0 }).current;
  useEffect(() => { chan.busy = working ? 1 : 0; }, [working]);
  useEffect(() => {
    if (!shown) { chan.arrive = 0; return; }
    chan.arrive = 1; const t0 = Date.now(); let raf = 0;
    const ease = () => { chan.arrive = Math.max(0, 1 - (Date.now() - t0) / 1400); if (chan.arrive > 0) raf = requestAnimationFrame(ease); };
    raf = requestAnimationFrame(ease);
    return () => cancelAnimationFrame(raf);
  }, [shown]);
  const vary = () => [chan.busy, chan.arrive, 0.35, chan.ready];

  const go = () => working ? M.cancel() : M.enlarge(ctx);
  const name = () => `zir-${Date.now()}.${st.out?.ext || "png"}`;
  const save = async () => { if (!st.out) return; try { await downloadUrl(st.out.url, name()); toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const share = async () => { if (!st.out) return; try { const r = await shareFile(await (await fetch(st.out.url)).blob(), name()); if (r === "saved") toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const live = M.liveOf(st.live);
  const elapsed = st.t0 ? Math.round((Date.now() - st.t0) / 1000) : 0;
  const modelList = M.modelsAlive();
  const chosen = opts.model || "auto";
  const modelSel = chosen !== "auto" && !modelList.some((m) => m.id === chosen) && models.at && !models.error ? "auto" : chosen;
  const shortName = (id) => { const n = id.split("/").pop(); return n.length > 20 ? n.slice(0, 19) + "…" : n; };
  const hasResult = st.phase === "done" && !!st.out;
  const px = hasResult && st.out.w ? `${st.inW}×${st.inH} → ${st.out.w}×${st.out.h}` : null;

  const frame = "max-w-full max-h-full rounded-[var(--ms-r)] object-contain sf-raised";
  const stage = () => {
    if (st.phase === "empty") return html`<${Chooser} t=${t} onPick=${M.setSource} onCamera=${() => M.patch({ phase: "camera" })} />`;
    if (st.phase === "camera") return html`<${Camera} t=${t} loc=${loc} S=${S} reason=${T(t, "primeReason")} onCapture=${M.setSource} onClose=${() => M.patch({ phase: "empty" })} />`;
    if (hasResult) return html`<div class="absolute inset-0 p-[var(--ms-gap)] pb-7">
      <${Compare} before=${st.src} after=${st.out.url} t=${t} onOpen=${() => S.screen.set("view")} />
      ${px ? html`<div data-px class="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none"><span class="font-mono text-[0.68rem] uppercase tracking-[0.14em] tabular-nums text-base-content/70">${px}</span></div>` : null}
    </div>`;
    return html`<div class="absolute inset-0 flex items-center justify-center p-[var(--ms-gap)] pb-6">
      <div class="relative max-w-full max-h-full">
        <img data-result src=${st.src} alt="" class=${`${frame} ${working ? "opacity-70" : ""} transition-opacity`} onClick=${() => S.screen.set("view")} />
        ${working ? html`<${Fragment}>
          <div aria-hidden="true" class="absolute inset-0 rounded-[var(--ms-r)] overflow-hidden pointer-events-none"><div class="zr-scan"></div></div>
          <div data-working class="absolute inset-x-0 bottom-3 flex flex-col items-center gap-1 pointer-events-none text-white">
            <div class="rounded-full bg-black/55 px-4 py-2"><span class=${`font-mono text-[0.72rem] uppercase tracking-[0.18em] tabular-nums ${gate ? "" : "zr-sh"}`}>${T(t, live.key)} · ${fmt(elapsed)}</span></div>
            ${live.step ? html`<div class="font-mono text-[0.68rem] text-white/70 tabular-nums">${live.step}</div>` : null}
          </div>
        </${Fragment}>` : null}
      </div>
    </div>`;
  };

  const act = (id, icon, lab, onClick) => html`<button data-act=${id} class="btn btn-sm btn-circle shrink-0" aria-label=${lab} title=${lab} onClick=${onClick}>${Icon(icon, "text-base")}</button>`;

  return html`<${Fragment}>
    <style>${CSS}</style>
    <${GlStage} shader=${new URL("zir.frag", import.meta.url)} seed=${0.37} tex=${shown} vary=${vary} texReady=${(r) => { chan.ready = r; }} zClass="z-0" />

    ${/* the full-size look: the enlarged picture alone, pinch-zoomable by the browser, Back closes it */""}
    ${screen === "view" && shown ? html`<div data-lightbox class="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick=${() => S.screen.set(null)}>
      <img src=${shown} alt="" class="max-w-full max-h-full object-contain" />
      <button data-lightbox-close aria-label=${T(t, "view")} class="absolute top-3 right-3 btn btn-circle btn-sm bg-black/50 text-white border-0" onClick=${() => S.screen.set(null)}>${Icon("lucide:x", "text-base")}</button>
    </div>` : null}

    <${Sheet} id="opts" open=${screen === "opts"} onClose=${() => S.screen.set(null)} title=${T(t, "options")} icon="lucide:sliders-horizontal" locale=${loc}>
      <div class="flex flex-col gap-[var(--ms-gap)]">
        ${/* The model: the owner's choice, not the back end's. "Auto" is the measured cascade; every other pill is
             a Space the edge can run NOW — green = HF says RUNNING, grey = HF could not say; a dead one is
             never offered. Fetched when this sheet opens, re-probed on demand. */""}
        <div class="flex items-center justify-between gap-2">
          <div class=${label}>${T(t, "model")}</div>
          <button data-models-check aria-label=${T(t, "modelCheck")} class="btn btn-ghost btn-xs btn-circle text-base-content/70" disabled=${models.loading} onClick=${() => M.loadModels(true)}>${Icon("lucide:refresh-cw", `text-base ${models.loading ? "animate-spin" : ""}`)}</button>
        </div>
        <${Segmented} attr="data-model" label=${T(t, "model")} scroll value=${modelSel} onChange=${(id) => M.setOpts({ model: id || "auto" })}
          items=${[{ id: "auto", label: T(t, "modelAuto"), icon: "lucide:sparkles" }, ...modelList.map((m) => ({ id: m.id, label: shortName(m.id), title: m.id, dot: m.alive ? "var(--color-success)" : "color-mix(in oklch, var(--color-base-content) 35%, transparent)", meta: m.tier === "fast" ? "CPU" : null }))]} />
        ${models.error && !modelList.length ? html`<p data-models-none class="text-sm text-error">${T(t, "modelsNone")}</p>` : null}
      </div>
    <//>

    <div class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
      <${Stage}>${stage()}<//>
      <div class="ms-side-main shrink-0 flex flex-col justify-center">
      <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
        <div class="flex items-center gap-[var(--ms-gap)]">
          <${Segmented} attr="data-q" label=${T(t, "quality")} value=${opts.quality} onChange=${(q) => M.setOpts({ quality: q })}
            items=${[{ id: "hd", label: T(t, "qHd"), icon: "lucide:gem" }, { id: "fast", label: T(t, "qFast"), icon: "lucide:zap" }]} />
          <button data-opts aria-label=${T(t, "options")} class=${`${tool} ${modelSel !== "auto" ? "ring-1 ring-[var(--app-accent)]" : ""}`} onClick=${() => { M.loadModels(); S.screen.set("opts"); }}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
        </div>
        <div class="flex items-center gap-1.5">
          ${st.src ? html`<button data-new aria-label=${T(t, "newPhoto")} class=${tool} disabled=${working} onClick=${M.clearSource}>${Icon("lucide:image-plus", "text-lg")}</button>` : null}
          ${hasResult ? html`<${Fragment}>
            ${act("again", "lucide:repeat", T(t, "again"), M.again)}
            ${act("save", "lucide:download", T(t, "save"), save)}
            ${act("share", "lucide:share-2", T(t, "share"), share)}
          </${Fragment}>` : null}
          <div class="flex-1"></div>
          <button data-go aria-label=${working ? T(t, "stop") : T(t, "go")} aria-busy=${working ? "true" : null} class="btn btn-primary rounded-full gap-2 px-5 shrink-0" disabled=${!st.src || st.phase === "camera"} onClick=${go}>
            ${Icon(working ? "lucide:square" : "lucide:scan-eye", "text-xl")}<span>${working ? T(t, "stop") : T(t, "go")}</span>
          </button>
        </div>
        ${st.error ? html`<p data-error role="alert" class="text-sm text-error px-1">${T(t, st.error)}</p>` : null}
      <//>
      </div>
    </div>
  </${Fragment}>`;
}
