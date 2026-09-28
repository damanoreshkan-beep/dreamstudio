import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Segmented, Panel, Slider } from "/_rt/ui.js";
import { CamStage } from "/_rt/camstage.js";
import { gate } from "/_rt/gate.js";
import { downloadBlob } from "/_rt/apk.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { } };

const FX = [
  ["fxNone", ""],
  ["fxNoir", "grayscale(1) contrast(1.35) brightness(0.95)"],
  ["fxMono", "grayscale(1)"],
  ["fxSepia", "sepia(0.7) contrast(1.05) brightness(1.02)"],
  ["fxWarm", "saturate(1.25) sepia(0.22) brightness(1.03)"],
  ["fxCool", "saturate(1.1) hue-rotate(14deg) contrast(1.04)"],
  ["fxVivid", "saturate(1.6) contrast(1.16)"],
  ["fxFade", "contrast(0.82) brightness(1.1) saturate(0.78)"],
];
const CONSTRAINTS = { width: { ideal: 1920 }, height: { ideal: 1920 } };
const ASPECTS = ["1:1", "4:5", "16:9"];
const arOf = (a) => (a === "4:5" ? 4 / 5 : a === "16:9" ? 16 / 9 : 1);

export function cam({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [facing, setFacing] = useState("environment");
  const [fx, setFx] = useState(0);
  const [expo, setExpo] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(false);
  const [mirror, setMirror] = useState(false);
  const [torch, setTorch] = useState(false);
  const [timer, setTimer] = useState(0);
  const [aspect, setAspect] = useState("1:1");
  const [caps, setCaps] = useState(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState(null);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [frontFlash, setFrontFlash] = useState(false);
  const [lit, setLit] = useState(false);

  const videoRef = useRef(), timerRef = useRef(0);
  const filterStr = () => `${FX[fx][1]} brightness(${expo.toFixed(2)})`.trim();

  const cycleTimer = () => { buzz(); setTimer((v) => (v === 0 ? 3 : v === 3 ? 10 : 0)); };
  const cycleAspect = () => { buzz(); setAspect((a) => ASPECTS[(ASPECTS.indexOf(a) + 1) % ASPECTS.length]); };
  const flip = () => { buzz(); setTorch(false); setFacing((f) => (f === "environment" ? "user" : "environment")); };

  const showMirror = mirror !== (facing === "user");

  const grab = () => {
    const v = videoRef.current; if (!v || !(v.videoWidth > 0)) return;
    try {
      const vw = v.videoWidth, vh = v.videoHeight, src = Math.min(vw, vh) / zoom;
      const sx = (vw - src) / 2, sy = (vh - src) / 2;
      const ar = arOf(aspect); let ow = 1200, oh = Math.round(1200 / ar); if (ar < 1) { oh = 1200; ow = Math.round(1200 * ar); }
      const out = document.createElement("canvas"); out.width = ow; out.height = oh;
      const ctx = out.getContext("2d"); ctx.filter = filterStr();
      if (showMirror) { ctx.translate(ow, 0); ctx.scale(-1, 1); }
      const scale = Math.max(ow / src, oh / src), dw = src * scale, dh = src * scale;
      ctx.drawImage(v, sx, sy, src, src, (ow - dw) / 2, (oh - dh) / 2, dw, dh);
      out.toBlob((blob) => {
        if (!blob) return; const url = URL.createObjectURL(blob); setShot((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
        const file = new File([blob], `cam-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file] }).catch(() => {}); }
        else { downloadBlob(blob, file.name); S.toast?.(T(t, "aSaved")); }
      }, "image/jpeg", 0.92);
    } catch { }
    setFlash(true); setTimeout(() => setFlash(false), 160);
  };
  const fire = () => {
    if (frontFlash && facing === "user") { setLit(true); setTimeout(() => { grab(); setTimeout(() => setLit(false), 140); }, 420); }
    else grab();
  };
  const shoot = () => {
    buzz(14);
    if (timer > 0) { let n = timer; setCount(n); clearInterval(timerRef.current); timerRef.current = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(timerRef.current); setCount(0); fire(); } else { setCount(n); buzz(6); } }, 1000); }
    else fire();
  };
  useEffect(() => () => clearInterval(timerRef.current), []);

  const Toggle = (on, icon, label, onClick, extra) => html`<button aria-pressed=${!!on} aria-label=${label} onClick=${onClick} class=${`btn btn-circle btn-sm ${on ? "btn-primary" : "bg-base-100 text-base-content/80"}`}>${extra || Icon(icon, "text-base")}</button>`;

  return html`<${Fragment}>
    <div class="ms-stage z-20 flex items-stretch justify-center p-[var(--ms-gap)]" data-facing=${facing} data-aspect=${aspect} data-timer=${timer} data-cam-fx=${FX[fx][0]} data-count=${count}>
      <!-- the console body -->
      ${""}
      <${Panel} className="w-full max-w-sm mx-auto min-h-0">
        <div class="shrink-0 flex items-center justify-between px-0.5">
          <div class="flex items-center gap-1.5">
            ${""}
            <span class="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]" aria-hidden="true"></span>
            <span class=${LABEL}>${loc === "uk" ? "μКАМ" : "μCAM"}</span>
          </div>
          <div class=${`flex items-center gap-1.5 ${LABEL}`}>
            <span>${T(t, FX[fx][0])}</span><span class="text-muted">·</span><span>${aspect}</span>${zoom > 1.02 ? html`<span>· ${zoom.toFixed(1)}×</span>` : null}
          </div>
        </div>

        <!-- the square viewfinder screen, set in a well -->
        ${""}
        <div class="flex-1 min-h-0 flex items-center justify-center">
          <div data-screen class="relative aspect-square max-h-full max-w-full w-full rounded-[var(--ms-r-in)] overflow-hidden sf-inset">
            ${""}
            ${gate ? html`<div class="absolute inset-0 bg-neutral" aria-hidden="true"></div>` : null}
            ${""}
            <div class="absolute inset-0" style=${ready ? `filter:${filterStr()};transform:scale(${zoom.toFixed(3)})` : null}>
              <${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")} primeFull
                facing=${facing} torch=${torch} constraints=${CONSTRAINTS} still=${null} show=${true} fullscreen=${false} gestures=${false}
                onVideo=${(el) => { videoRef.current = el; }} onState=${(s) => { setCaps(s.caps); setReady(s.ready); }} />
            </div>
            ${grid ? html`<div class="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div class="absolute left-1/3 top-0 bottom-0 w-px bg-white/25"></div><div class="absolute left-2/3 top-0 bottom-0 w-px bg-white/25"></div>
              <div class="absolute top-1/3 left-0 right-0 h-px bg-white/25"></div><div class="absolute top-2/3 left-0 right-0 h-px bg-white/25"></div>
            </div>` : null}
            ${aspect !== "1:1" ? cropBars(aspect) : null}
            ${""}
            ${frontFlash && facing === "user" && !lit ? html`<div class="absolute inset-0 rounded-[inherit] pointer-events-none border-[3px] border-white/90" aria-hidden="true"></div>` : null}
            <div class="absolute inset-3 pointer-events-none" aria-hidden="true">
              ${["top-0 left-0 border-t-2 border-l-2 rounded-tl-md", "top-0 right-0 border-t-2 border-r-2 rounded-tr-md", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md", "bottom-0 right-0 border-b-2 border-r-2 rounded-br-md"].map((c, i) => html`<span key=${i} class=${`absolute w-5 h-5 border-white/30 ${c}`}></span>`)}
            </div>
            ${""}
            ${count > 0 ? html`<div class="absolute inset-0 flex items-center justify-center"><div class="text-[length:var(--ms-hero)] font-bold tabular-nums text-white drop-shadow-lg">${count}</div></div>` : null}
            <div class=${`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${flash ? "opacity-80" : "opacity-0"}`}></div>
          </div>
        </div>

        <!-- deck -->
        <div class="shrink-0 flex flex-col gap-[var(--ms-gap)]">
          <!-- filters -->
          <${Segmented} attr="data-fx" scroll variant="outline" size="sm" label=${T(t, "fxTitle")}
            items=${FX.map(([k], i) => ({ id: String(i), label: T(t, k) }))}
            value=${String(fx)} onChange=${(id) => { buzz(); setFx(Number(id)); }} />
          <!-- exposure + zoom: two kit sliders, their captions the accessible names -->
          <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
            <${Slider} id="expo" attr="data-dial" label=${T(t, "aExposure")} min=${0.6} max=${1.6} step=${0.02} value=${expo} onInput=${setExpo} />
            <${Slider} id="zoom" attr="data-dial" label=${T(t, "aZoom")} min=${1} max=${4} step=${0.1} value=${zoom} onInput=${setZoom} />
          </div>
          <!-- toggles: a recessed button deck -->
          <div class="flex items-center justify-center gap-2 flex-wrap rounded-[var(--ms-r-in)] sf-inset px-2.5 py-2.5">
            ${Toggle(facing === "user", "lucide:switch-camera", T(t, "aFlip"), flip)}
            ${facing === "user"
              ? Toggle(frontFlash, "lucide:zap", T(t, "aFrontFlash"), () => { buzz(); setFrontFlash((v) => !v); })
              : (caps?.torch ? Toggle(torch, "lucide:flashlight", T(t, "aTorch"), () => { buzz(); setTorch((v) => !v); }) : null)}
            ${Toggle(grid, "lucide:grid-3x3", T(t, "aGrid"), () => { buzz(); setGrid((v) => !v); })}
            ${Toggle(timer > 0, "lucide:timer", T(t, "aTimer"), cycleTimer, timer > 0 ? html`<span class="text-xs font-mono font-bold">${timer}</span>` : null)}
            ${Toggle(showMirror, "lucide:flip-horizontal-2", T(t, "aMirror"), () => { buzz(); setMirror((v) => !v); })}
            ${Toggle(false, "lucide:ratio", T(t, "aAspect"), cycleAspect, html`<span class="text-[length:var(--ms-label)] font-mono font-bold leading-none">${aspect}</span>`)}
          </div>
          <!-- shutter row -->
          <div class="flex items-center justify-between px-2 pt-0.5">
            ${""}
            <div class="w-11 h-11 rounded-[var(--ms-r-in)] sf-inset overflow-hidden shrink-0">${shot ? html`<img src=${shot} alt="" class="w-full h-full object-cover" />` : null}</div>
            ${""}
            <button data-shutter aria-label=${T(t, "aShutter")} onClick=${shoot} class="w-[4.6rem] h-[4.6rem] rounded-full sf-raised flex items-center justify-center active:scale-95 transition-transform sf-e3">
              <span class="w-[3.6rem] h-[3.6rem] rounded-full bg-primary border-4 border-base-100"></span>
            </button>
            <div class="w-11 h-11 shrink-0"></div>
          </div>
        </div>
      <//>
    </div>

    ${""}
    ${lit ? html`<div class="fixed inset-0 z-40 bg-white" aria-hidden="true"></div>` : null}
  </${Fragment}>`;
}

function cropBars(aspect) {
  if (aspect === "4:5") return html`<div class="absolute inset-0 pointer-events-none" aria-hidden="true"><div class="absolute inset-y-0 left-0 w-[10%] bg-black/55"></div><div class="absolute inset-y-0 right-0 w-[10%] bg-black/55"></div></div>`;
  return html`<div class="absolute inset-0 pointer-events-none" aria-hidden="true"><div class="absolute inset-x-0 top-0 h-[22%] bg-black/55"></div><div class="absolute inset-x-0 bottom-0 h-[22%] bg-black/55"></div></div>`;
}
