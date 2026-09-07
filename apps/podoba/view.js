// podoba — the camera in our materials, live. ONE fit screen: the STAGE is the kit's GlStage projecting the
// camera (or the frozen frame, or the gate's still) through podoba.frag, and the ISLAND holds the material
// strip and the one verb of the moment. ONE-SHOT operations (owner, 2026-09-05): shoot → the keeper develops
// over the stage → save (the big verb) or share or enlarge; choosing a material at ANY point is the way back
// to the camera. State and the jobs live in state.js, outside the mount. State map: RESEARCH.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { GlStage } from "/_rt/glstage.js";
import { Island, Stage } from "/_rt/ui.js";
import { CamStage } from "/_rt/camstage.js";
import { MAX_SIDE } from "/_rt/intake.js";
import { downloadUrl, shareFile } from "/_rt/apk.js";
import { STYLES, styleIndex } from "/_rt/styles.js";
import * as M from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
const mono = "font-mono uppercase tracking-[0.14em] text-[length:var(--ms-label)] tabular-nums";
const thumb = (id) => new URL(`assets/style-${id}.webp`, import.meta.url).href;
const GAIN_MS = 250;
// the keeper lands like a print developing; the working word shimmers like mirage's; the scan line is zir's
// enlarging idiom (the tap's focus ring is CamStage's own). All still under reduced motion.
const CSS = `.ly-in{animation:lyIn 1.2s ease-out both}@keyframes lyIn{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}
.ly-sh{background:linear-gradient(90deg,rgba(255,255,255,.45) 0%,#fff 50%,rgba(255,255,255,.45) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lySweep 2.2s linear infinite}
@keyframes lySweep{from{background-position:200% 0}to{background-position:-200% 0}}
.ly-scrim{height:calc(var(--hdr-h,3.5rem) * 1.9);background:linear-gradient(to bottom,light-dark(rgba(246,244,238,.72),rgba(0,0,0,.62)) 0%,light-dark(rgba(246,244,238,.36),rgba(0,0,0,.32)) 35%,light-dark(rgba(246,244,238,.08),rgba(0,0,0,.07)) 75%,transparent 100%)}
.ly-scan{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--app-accent),transparent);box-shadow:0 0 18px 4px color-mix(in oklch,var(--app-accent) 55%,transparent);animation:lyScan 2.6s ease-in-out infinite}
@keyframes lyScan{0%{top:2%}50%{top:98%}100%{top:2%}}
@media (prefers-reduced-motion:reduce){.ly-in,.ly-sh,.ly-scan{animation:none}}`;

export function podoba({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const st = useStore(M.$st);
  const live = st.phase === "live", working = st.phase === "working", enhancing = st.phase === "enhancing", failed = st.phase === "error";
  const shown = (st.phase === "done" || enhancing) && !!st.out, done = st.phase === "done" && !!st.out;
  // The camera is the kit's ONE stage (CamStage, core ≥ 1.2.50): the priming screen, the stream and its retry,
  // the wake lock, the flip, the torch, the pinch-zoom and the tap-to-focus live there. This view only says
  // WHICH way the camera looks and takes the playing element to paint through the shader.
  const [ready, setReady] = useState(false);      // the stage has a picture — the flip and the shutter wait for it
  const [caps, setCaps] = useState(null);         // what the track declares: torch · zoom · focus
  const [torch, setTorch] = useState(false);
  const camEl = useRef(null);    // the playing <video> (the gate: the still's <img>) CamStage hands out
  const frozen = useRef(null);   // the canvas of the shot frame: the shader keeps painting it while the pods work
  const ctx = { t, loc };
  const armed = ready;
  useEffect(() => { setTorch(false); }, [st.facing]);   // the other camera opens with its LED off

  // a 1 s tick only while the pods work — the elapsed readout, nothing else re-renders for it
  const [, tick] = useState(0);
  useEffect(() => { if (!working && !enhancing) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [working, enhancing]);

  // The shader's channels: plain refs the stage reads every frame, never state. The exposure is ONE number
  // measured here four times a second on a 16×16 canvas (ink.w) — the shader used to sum it per pixel. The
  // front camera is mirrored by the shader only while LIVE; the frozen frame is drawn mirrored already.
  const chan = useRef({ busy: 0, arrive: 0, gain: 1 }).current;
  useEffect(() => { chan.busy = working || enhancing ? 1 : 0; }, [working, enhancing]);
  useEffect(() => {
    if (!done) { chan.arrive = 0; return; }
    chan.arrive = 1; const t0 = Date.now(); let raf = 0;
    const ease = () => { chan.arrive = Math.max(0, 1 - (Date.now() - t0) / 1400); if (chan.arrive > 0) raf = requestAnimationFrame(ease); };
    raf = requestAnimationFrame(ease);
    return () => cancelAnimationFrame(raf);
  }, [done]);
  useEffect(() => {
    if (!armed) return;
    const cv = document.createElement("canvas"); cv.width = 16; cv.height = 16;
    const g = cv.getContext("2d", { willReadFrequently: true });
    const id = setInterval(() => {
      const src = M.$st.get().phase === "live" ? camEl.current : frozen.current;
      const w = src?.videoWidth || src?.naturalWidth || src?.width || 0;
      if (!(w > 0) || !g) return;
      try { g.drawImage(src, 0, 0, 16, 16); } catch { return; }
      const d = g.getImageData(0, 0, 16, 16).data; let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      chan.gain = Math.min(2.8, Math.max(1, 0.42 / Math.max(sum / (d.length / 4) / 255, 0.02)));
    }, GAIN_MS);
    return () => clearInterval(id);
  }, [armed]);
  const now = useRef(st); now.current = st;
  const ink = () => [0.90, 0.79, 0.54, chan.gain];
  const vary = () => [chan.busy, chan.arrive, styleIndex(now.current.mat) / 10, now.current.phase === "live" && now.current.facing === "user" ? 1 : 0];
  const cam = () => now.current.phase === "live" ? camEl.current : frozen.current;

  const shoot = () => {
    const src = camEl.current;
    const w = src?.videoWidth || src?.naturalWidth || 0, h = src?.videoHeight || src?.naturalHeight || 0;
    if (!(w > 0 && h > 0)) return;
    const k = Math.min(1, MAX_SIDE / Math.max(w, h));
    const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const g = c.getContext("2d");
    if (st.facing === "user") { g.translate(c.width, 0); g.scale(-1, 1); }
    try { g.drawImage(src, 0, 0, c.width, c.height); } catch { return; }
    frozen.current = c;
    M.shoot(c.toDataURL("image/jpeg", 0.9), ctx);
  };
  const name = () => `podoba-${st.mat}-${Date.now()}.${st.out?.ext || "png"}`;
  const save = async () => { if (!st.out) return; try { await downloadUrl(st.out.url, name()); toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const share = async () => { if (!st.out) return; try { const r = await shareFile(await (await fetch(st.out.url)).blob(), name()); if (r === "saved") toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const lv = M.liveOf(st.live);
  const elapsed = st.t0 ? Math.round((Date.now() - st.t0) / 1000) : 0;
  const act = (id, icon, lab, onClick, extra = "") => html`<button data-act=${id} class=${`${tool} ${extra}`} aria-label=${lab} title=${lab} onClick=${onClick}>${Icon(icon, "text-lg")}</button>`;
  // THE BIG VERB: one pill, one word, centred — save when a picture exists, try again when the pods failed
  const big = (id, icon, lab, onClick) => html`<button data-act=${id} class="btn btn-primary rounded-full h-[3.25rem] min-h-0 px-6 gap-2 text-base shrink-0" onClick=${onClick}>${Icon(icon, "text-xl")}<span>${lab}</span></button>`;

  return html`<${Fragment}>
    <style>${CSS}</style>
    <${GlStage} shader=${new URL("podoba.frag", import.meta.url)} seed=${0.21} ink=${ink} vary=${vary} cam=${cam} zClass="z-0" />
    ${shown ? html`<img data-keeper data-hd=${st.out.hd ? "1" : null} src=${st.out.url} alt=${T(t, "keeper")} decoding="async" class="ly-in fixed inset-0 z-[1] w-full h-full object-cover cursor-zoom-in" onClick=${() => done && S.screen.set("view")} />` : null}
    ${enhancing ? html`<div aria-hidden="true" class="fixed inset-0 z-[1] pointer-events-none overflow-hidden"><div class="ly-scan"></div></div>` : null}
    ${/* The wordmark sits on FOREIGN content whose ground the theme cannot know — black for seven materials, white
         for paper and ink, a photograph once the keeper lands — so a theme-aware gradient under the header
         (paper in light, black in dark) keeps it legible on every one; a scrim over a camera feed is not a band. */""}
    <div aria-hidden="true" class="ly-scrim fixed inset-x-0 top-0 z-[2] pointer-events-none"></div>

    ${/* the full-size look: the keeper alone, pinch-zoomable by the browser, Back closes it */""}
    ${screen === "view" && done ? html`<div data-lightbox class="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick=${() => S.screen.set(null)}>
      <img src=${st.out.url} alt=${T(t, "keeper")} class="max-w-full max-h-full object-contain" />
      <button data-lightbox-close aria-label=${T(t, "close")} class="absolute top-3 right-3 btn btn-circle btn-sm bg-black/50 text-white border-0" onClick=${() => S.screen.set(null)}>${Icon("lucide:x", "text-base")}</button>
    </div>` : null}

    <div data-readout data-phase=${st.phase} data-material=${st.mat} data-facing=${st.facing} data-ready=${armed ? "1" : null} class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <${Stage}>
        ${/* The kit's ONE camera: it draws nothing here (`show` false) — the shader does — but it owns the
             priming, the stream, the flip, the torch and the gestures. No fullscreen: a tap on this stage
             already MEANS something (the developed frame, full size). The privacy line is OURS: the built-in
             one promises nothing is uploaded, and here the shot frame is. */""}
        <${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")}
            privacy=${T(t, "primePrivacy")} privacyIcon="lucide:cloud-upload"
            facing=${st.facing} torch=${torch} still=${gate ? M.mockURL : null} show=${false} fullscreen=${false}
            onVideo=${(el) => { camEl.current = el; }} onState=${(s) => { setReady(!!s.ready); setCaps(s.caps); }}>
          ${/* Off the live mirror the pinch and the tap-to-focus have nothing to aim at, so this layer covers
               the stage's gesture layer (z-[1]) and carries the one tap that state does have: the developed
               picture, full size. The fixed keeper underneath never receives it — measured, not assumed. */""}
          ${live ? null : html`<div data-keeper-tap class="absolute inset-0 z-[2]" onClick=${() => done && S.screen.set("view")}></div>`}
        <//>
      <//>
      <div class="shrink-0">
      <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
        ${/* THE STRIP — the eleven materials, on the screen, never behind a sheet, ALWAYS live: a tap is the way
             back to the camera from any state (a running keeper is cancelled, a developed one let go). Only the
             x axis lives here (the kit's overflow-x-auto rule keeps the page's vertical swipe). */""}
        <div data-strip role="group" aria-label=${T(t, "material")} class="ly-strip overflow-x-auto flex items-start gap-1 -mx-1 px-1">
          ${STYLES.map((s) => { const active = st.mat === s.id; return html`<button key=${s.id} data-mat=${s.id} aria-pressed=${active} aria-label=${T(t, s.key)}
              class="shrink-0 w-[3.7rem] h-[4.2rem] flex flex-col items-center justify-start gap-1 rounded-[var(--ms-r-in)] pt-1" onClick=${() => M.setMat(s.id)}>
            <img src=${thumb(s.id)} alt="" loading="lazy" decoding="async" class=${`w-11 h-11 rounded-full object-cover bg-black ring-2 ${active ? "ring-[var(--app-accent)]" : "ring-transparent"}`} />
            <span class=${`font-mono uppercase tracking-wide text-[0.58rem] leading-none truncate max-w-full ${active ? "text-base-content" : "text-base-content/70"}`}>${T(t, s.key)}</span>
          </button>`; })}
        </div>
        ${/* THE ROW — three cells, one verb in the middle: the shutter (live) · the word and the clock (working,
             enlarging) · SAVE, big (developed) · TRY AGAIN, big (failed). Small tools live at the sides: the torch
             only when the track has one, the flip, enlarge ×4, share. Nothing else. */""}
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-[3.9rem]">
          <div class="flex items-center gap-1">
            ${live && caps?.torch ? html`<button data-torch aria-pressed=${torch} class=${`${tool} ${torch ? "text-[var(--app-accent)]" : ""}`} aria-label=${T(t, "torch")} title=${T(t, "torch")} onClick=${() => setTorch((v) => !v)}>${Icon(torch ? "lucide:zap" : "lucide:zap-off", "text-lg")}</button>` : null}
            ${working || enhancing ? html`<button data-act="stop" class=${tool} aria-label=${T(t, "stop")} title=${T(t, "stop")} onClick=${M.again}>${Icon("lucide:x", "text-lg")}</button>` : null}
            ${done ? (st.out.hd && st.out.w ? html`<span data-px class=${`${mono} text-base-content/70 truncate`}>${st.out.w}×${st.out.h}</span>` : act("hd", "lucide:gem", T(t, "hd"), () => M.enhance(ctx))) : null}
          </div>
          <div class="flex items-center justify-center">
            ${live ? html`<button data-shutter aria-label=${T(t, "shoot")} title=${T(t, "shoot")} disabled=${!armed} onClick=${shoot}
                class="w-[3.9rem] h-[3.9rem] rounded-full bg-white/10 sf-e3 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40">
              <span class="w-[3rem] h-[3rem] rounded-full bg-primary border-4 border-base-100"></span>
            </button>` : null}
            ${working || enhancing ? html`<span data-working class=${`${mono} ${gate ? "text-base-content" : "ly-sh"}`}>${T(t, enhancing ? "enhancing" : lv.key)} · ${fmt(elapsed)}</span>` : null}
            ${done ? big("save", "lucide:download", T(t, "save"), save) : null}
            ${failed ? big("retry", "lucide:rotate-ccw", T(t, "retry"), () => M.retry(ctx)) : null}
          </div>
          <div class="flex items-center justify-end gap-1">
            ${live ? html`<button data-flip class=${tool} aria-label=${T(t, "flip")} title=${T(t, "flip")} disabled=${!armed} onClick=${M.flip}>${Icon("lucide:switch-camera", "text-lg")}</button>` : null}
            ${done ? act("share", "lucide:share-2", T(t, "share"), share) : null}
          </div>
        </div>
        ${st.error ? html`<p data-error role="alert" class="text-sm text-error px-1 text-center">${T(t, st.error)}</p>` : null}
      <//>
      </div>
    </div>
  </${Fragment}>`;
}
