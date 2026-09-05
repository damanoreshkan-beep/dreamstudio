// lychyna — the camera in our materials, live. ONE fit screen: the STAGE is the kit's GlStage projecting the
// camera (or the frozen frame, or the gate's still) through lychyna.frag, and the ISLAND holds the material
// strip and the shutter. The keeper — the pods' rendering of the shot frame in the same material — fades over
// the stage when it lands. State and the job live in state.js, outside the mount. State map: RESEARCH.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { GlStage } from "/_rt/glstage.js";
import { Island, Stage } from "/_rt/ui.js";
import { camera, wakeLock } from "/_rt/sensors.js";
import { CameraPrime } from "/_rt/camprime.js";
import { MAX_SIDE } from "/_rt/intake.js";
import { downloadUrl, shareFile } from "/_rt/apk.js";
import { STYLES, styleIndex } from "/_rt/styles.js";
import * as M from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
const mono = "font-mono uppercase tracking-[0.14em] text-[length:var(--ms-label)] tabular-nums";
const thumb = (id) => new URL(`assets/style-${id}.webp`, import.meta.url).href;
// the keeper lands like a print developing — a slow fade with the faintest settle; the working word shimmers
// like mirage's and zir's. Both still under reduced motion and in the gate.
const CSS = `.ly-in{animation:lyIn 1.2s ease-out both}@keyframes lyIn{from{opacity:0;transform:scale(1.02)}to{opacity:1;transform:none}}
.ly-sh{background:linear-gradient(90deg,rgba(255,255,255,.45) 0%,#fff 50%,rgba(255,255,255,.45) 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lySweep 2.2s linear infinite}
@keyframes lySweep{from{background-position:200% 0}to{background-position:-200% 0}}
.ly-strip{scrollbar-width:none}.ly-strip::-webkit-scrollbar{display:none}
.ly-scrim{height:calc(var(--hdr-h,3.5rem) * 1.9);background:linear-gradient(to bottom,light-dark(rgba(246,244,238,.72),rgba(0,0,0,.62)) 0%,light-dark(rgba(246,244,238,.36),rgba(0,0,0,.32)) 35%,light-dark(rgba(246,244,238,.08),rgba(0,0,0,.07)) 75%,transparent 100%)}
@media (prefers-reduced-motion:reduce){.ly-in,.ly-sh{animation:none}}`;

export function lychyna({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const st = useStore(M.$st);
  const live = st.phase === "live", working = st.phase === "working", done = st.phase === "done" && !!st.out;
  const [enabled, setEnabled] = useState(gate);   // the camera opens only after the tap on Enable (gate: at once)
  const [err, setErr] = useState(null);
  const videoRef = useRef(), mockRef = useRef();
  const frozen = useRef(null);   // the canvas of the shot frame: the shader keeps painting it while the pods work
  const ctx = { t, loc };
  const on = enabled && !err;

  // The camera: the kit's lifecycle, reopened on flip, every track stopped on the way out; the screen stays
  // awake while the mirror runs.
  useEffect(() => {
    if (gate || !enabled) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let alive = true, stop = () => {};
    const wl = wakeLock.acquire();
    camera.start(videoRef.current, (e) => { if (alive) setErr(e); }, { facingMode: st.facing }).then((s) => { if (alive) stop = s; else s(); });
    return () => { alive = false; stop(); wl?.release?.(); };
  }, [enabled, st.facing]);

  // a 1 s tick only while the pods paint — the elapsed readout, nothing else re-renders for it
  const [, tick] = useState(0);
  useEffect(() => { if (!working) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [working]);

  // The shader's channels: plain refs the stage reads every frame, never state. The front camera is mirrored
  // by the shader only while LIVE — the frozen frame is drawn mirrored already (the frame the eye saw).
  const chan = useRef({ busy: 0, arrive: 0 }).current;
  useEffect(() => { chan.busy = working ? 1 : 0; }, [working]);
  useEffect(() => {
    if (!done) { chan.arrive = 0; return; }
    chan.arrive = 1; const t0 = Date.now(); let raf = 0;
    const ease = () => { chan.arrive = Math.max(0, 1 - (Date.now() - t0) / 1400); if (chan.arrive > 0) raf = requestAnimationFrame(ease); };
    raf = requestAnimationFrame(ease);
    return () => cancelAnimationFrame(raf);
  }, [done]);
  const now = useRef(st); now.current = st;
  const vary = () => [chan.busy, chan.arrive, styleIndex(now.current.mat) / 10, now.current.phase === "live" && now.current.facing === "user" ? 1 : 0];
  const cam = () => now.current.phase === "live" ? (gate ? mockRef.current : videoRef.current) : frozen.current;

  const shoot = () => {
    const src = gate ? mockRef.current : videoRef.current;
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
  const name = () => `lychyna-${st.mat}-${Date.now()}.${st.out?.ext || "png"}`;
  const save = async () => { if (!st.out) return; try { await downloadUrl(st.out.url, name()); toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const share = async () => { if (!st.out) return; try { const r = await shareFile(await (await fetch(st.out.url)).blob(), name()); if (r === "saved") toast?.(T(t, "saved")); } catch { toast?.(T(t, "eNetwork")); } };
  const lv = M.liveOf(st.live);
  const elapsed = st.t0 ? Math.round((Date.now() - st.t0) / 1000) : 0;
  const act = (id, icon, lab, onClick) => html`<button data-act=${id} class=${tool} aria-label=${lab} title=${lab} onClick=${onClick}>${Icon(icon, "text-lg")}</button>`;

  return html`<${Fragment}>
    <style>${CSS}</style>
    <${GlStage} shader=${new URL("lychyna.frag", import.meta.url)} seed=${0.21} ink=${[0.90, 0.79, 0.54, 1]} vary=${vary} cam=${cam} zClass="z-0" />
    ${done ? html`<img data-keeper src=${st.out.url} alt=${T(t, "keeper")} decoding="async" class="ly-in fixed inset-0 z-[1] w-full h-full object-cover cursor-zoom-in" onClick=${() => S.screen.set("view")} />` : null}
    ${/* The wordmark sits on FOREIGN content whose ground the theme cannot know — black for seven materials, white
         for paper and ink, a photograph once the keeper lands — so a theme-aware gradient under the header
         (paper in light, black in dark) keeps it legible on every one; a scrim over a camera feed is not a band. */""}
    <div aria-hidden="true" class="ly-scrim fixed inset-x-0 top-0 z-[2] pointer-events-none"></div>

    ${/* the full-size look: the keeper alone, pinch-zoomable by the browser, Back closes it */""}
    ${screen === "view" && done ? html`<div data-lightbox class="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick=${() => S.screen.set(null)}>
      <img src=${st.out.url} alt=${T(t, "keeper")} class="max-w-full max-h-full object-contain" />
      <button data-lightbox-close aria-label=${T(t, "close")} class="absolute top-3 right-3 btn btn-circle btn-sm bg-black/50 text-white border-0" onClick=${() => S.screen.set(null)}>${Icon("lucide:x", "text-base")}</button>
    </div>` : null}

    <div data-live=${on || gate ? "1" : null} data-phase=${st.phase} data-material=${st.mat} data-facing=${st.facing} class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <${Stage}>
        <video ref=${videoRef} autoplay muted playsinline aria-hidden="true" class="absolute w-px h-px opacity-0 pointer-events-none"></video>
        ${gate ? html`<img ref=${mockRef} src=${M.mockURL} alt="" aria-hidden="true" class="absolute w-px h-px opacity-0 pointer-events-none" />` : null}
        ${on || gate ? null : html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} privacy=${T(t, "primePrivacy")} privacyIcon="lucide:cloud-upload"
          onEnable=${() => { setErr(null); setEnabled(true); }} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />`}
      <//>
      <div class="shrink-0">
      <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
        ${/* THE STRIP — the eleven materials, on the screen, never behind a sheet: a tap re-inks the live frame at
             once. Only the x axis lives here (the kit's overflow-x-auto rule keeps the page's vertical swipe). */""}
        <div data-strip role="group" aria-label=${T(t, "material")} class="ly-strip overflow-x-auto flex items-start gap-1 -mx-1 px-1">
          ${STYLES.map((s) => { const active = st.mat === s.id; return html`<button key=${s.id} data-mat=${s.id} aria-pressed=${active} aria-label=${T(t, s.key)} disabled=${!live}
              class="shrink-0 w-[3.7rem] h-[4.2rem] flex flex-col items-center justify-start gap-1 rounded-[var(--ms-r-in)] pt-1 disabled:opacity-50 transition-opacity" onClick=${() => M.setMat(s.id)}>
            <img src=${thumb(s.id)} alt="" loading="lazy" decoding="async" class=${`w-11 h-11 rounded-full object-cover bg-black ring-2 ${active ? "ring-[var(--app-accent)]" : "ring-transparent"}`} />
            <span class=${`font-mono uppercase tracking-wide text-[0.58rem] leading-none truncate max-w-full ${active ? "text-base-content" : "text-base-content/70"}`}>${T(t, s.key)}</span>
          </button>`; })}
        </div>
        ${/* THE ROW — three cells: the tool on the left, the verb in the middle, the results on the right. The
             shutter is the kit's idiom (intake's viewfinder); while the pods paint the middle is the word + the clock. */""}
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-[3.9rem]">
          <div class="flex items-center gap-1">
            ${live ? html`<button data-flip class=${tool} aria-label=${T(t, "flip")} title=${T(t, "flip")} disabled=${!(on || gate)} onClick=${M.flip}>${Icon("lucide:switch-camera", "text-lg")}</button>` : null}
            ${working ? html`<button data-act="stop" class=${tool} aria-label=${T(t, "stop")} title=${T(t, "stop")} onClick=${M.again}>${Icon("lucide:x", "text-lg")}</button>` : null}
            ${done || st.phase === "error" ? act("again", "lucide:camera", T(t, "again"), M.again) : null}
          </div>
          <div class="flex items-center justify-center">
            ${live ? html`<button data-shutter aria-label=${T(t, "shoot")} title=${T(t, "shoot")} disabled=${!(on || gate)} onClick=${shoot}
                class="w-[3.9rem] h-[3.9rem] rounded-full bg-white/10 sf-e3 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40">
              <span class="w-[3rem] h-[3rem] rounded-full bg-primary border-4 border-base-100"></span>
            </button>` : null}
            ${working ? html`<span data-working class=${`${mono} ${gate ? "text-base-content" : "ly-sh"}`}>${T(t, lv.key)} · ${fmt(elapsed)}</span>` : null}
            ${done ? html`<span data-done class=${`${mono} text-base-content/70`}>${T(t, "done")}</span>` : null}
          </div>
          <div class="flex items-center justify-end gap-1">
            ${done ? html`<${Fragment}>${act("save", "lucide:download", T(t, "save"), save)}${act("share", "lucide:share-2", T(t, "share"), share)}</${Fragment}>` : null}
          </div>
        </div>
        ${st.error ? html`<p data-error role="alert" class="text-sm text-error px-1">${T(t, st.error)}</p>` : null}
      <//>
      </div>
    </div>
  </${Fragment}>`;
}
