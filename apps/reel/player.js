import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { createPlayer, Player } from "/_rt/video.js";
import { useTap } from "/_rt/gesture.js";
import { Pixels } from "/_rt/skeleton.js";
import { Icon, framed } from "./util.js";
import { addLike, $full } from "./store.js";
import { openFull } from "./feed.js";

const START_FRACTION = 1 / 8;
const seekStart = (v) => {
  try { if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration * START_FRACTION; } catch { }
};

function useNoSystemFullscreen() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const isMedia = (el) => !!el && /^(VIDEO|AUDIO)$/.test(el.tagName || "");
    const on = () => {
      const el = document.fullscreenElement || document.webkitFullscreenElement;
      if (!isMedia(el)) return;
      try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {}); } catch { }
    };
    const iosIn = (e) => { try { e.target?.webkitExitFullscreen?.(); } catch { } };
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    document.addEventListener("webkitbeginfullscreen", iosIn, true);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
      document.removeEventListener("webkitbeginfullscreen", iosIn, true);
    };
  }, []);
}

export function FullClip({ S, t }) {
  const full = useStore($full), locale = useStore(S.locale);
  useNoSystemFullscreen();
  if (!full) return null;
  const close = () => { const b = $full.get()?.blob; S.screen.set(null); $full.set(null); if (b) { try { URL.revokeObjectURL(b); } catch { } } };
  if (full.url) return html`<${Player} url=${full.url} type=${full.type} title=${full.title} locale=${locale} onClose=${close} />`;
  return html`<div data-full role="dialog" aria-modal="true" aria-label=${full.title || T(t, "watch")}
      class="fixed inset-0 z-40 bg-black flex flex-col" style="padding-top:env(safe-area-inset-top)">
    <header class="flex items-center gap-1 px-2 py-1.5 text-white bg-black/70">
      <button data-full-back class="btn btn-ghost btn-sm btn-circle text-white" aria-label=${T(t, "back")} onClick=${close}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <span class="flex-1 min-w-0 truncate font-medium">${full.title || ""}</span>
    </header>
    <div class="flex-1 relative">
      ${full.err
        ? html`<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 p-6 text-center">
            ${Icon("lucide:tv-minimal-play", "text-5xl opacity-40")}<div>${T(t, "videoErr")}</div>
            ${""}
            <div class="flex items-center gap-2 flex-wrap justify-center">
              <button data-full-retry class="btn btn-sm btn-primary gap-2" onClick=${() => openFull(S, { page: full.page, title: full.title })}>${Icon("lucide:rotate-cw")}${T(t, "retry")}</button>
              <a href=${full.page} target="_blank" rel="noopener" class="btn btn-sm btn-outline text-white border-white/30 gap-2">${Icon("lucide:external-link")}${T(t, "openSite")}</a>
            </div>
          </div>`
        : html`<${Pixels} cls="w-full h-full" />`}
    </div>
  </div>`;
}

function usePosterSrc(poster, page) {
  const [src, setSrc] = useState(poster || null);
  useEffect(() => { setSrc(poster || null); }, [poster]);
  const fail = () => {
    if (!src || src !== poster || poster.startsWith("data:")) return setSrc(null);
    framed(poster, page).then((s) => setSrc(s || null)).catch(() => setSrc(null));
  };
  return [src, fail];
}
function PosterFill({ poster, page }) {
  const [src, fail] = usePosterSrc(poster, page);
  return src ? html`<${Fragment}>
    <img src=${src} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-55" />
    <img src=${src} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-contain" onError=${fail} />
  </${Fragment}>` : null;
}
function VideoLayer({ item, playing, ephemeral }) {
  const ref = useRef(), bgRef = useRef();
  const [errored, setErrored] = useState(false);
  const [viaProxy, setViaProxy] = useState(!!ephemeral);
  const [poster, posterFail] = usePosterSrc(item.poster, item.page);
  const [src, setSrc] = useState(ephemeral ? null : item.video);
  useEffect(() => {
    if (!viaProxy) { setSrc(item.video); return; }
    let dead = false;
    framed(item.video, item.page).then((s) => { if (!dead) setSrc(s); }).catch(() => { if (!dead) setErrored(true); });
    return () => { dead = true; };
  }, [viaProxy, item.video, item.page]);
  const [ready, setReady] = useState(false);
  const wants = useRef(playing);
  wants.current = playing;

  useEffect(() => {
    setErrored(false); setReady(false);
    const v = ref.current; if (!v || !src) return;
    v.muted = true; v.loop = true;
    v.preload = "auto";
    let handle, dead = false;
    createPlayer(v, src, {
      type: /\.m3u8(\?|#|$)/i.test(item.video) ? "hls" : "progressive",
      onReady: () => {
        if (dead) return;
        setReady(true);
        seekStart(v);
        if (wants.current) { v.play?.().catch(() => {}); return; }
        v.play?.().then(() => {
          if (dead || wants.current) return;
          v.pause?.();
          seekStart(v);
        }).catch(() => {});
      },
      onError: () => { if (dead) return; if (viaProxy) setErrored(true); else setViaProxy(true); },
    }).then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [src]);

  useEffect(() => {
    const v = ref.current; if (!v || !ready) return;
    if (playing) v.play?.().catch(() => {}); else v.pause?.();
  }, [playing, ready]);

  useEffect(() => {
    if (!playing || !ready || poster || errored) return;
    const bg = bgRef.current; if (!bg) return;
    bg.muted = true; bg.loop = true;
    let handle, dead = false;
    createPlayer(bg, src, { onReady: () => { if (!dead) bg.play?.().catch(() => {}); } })
      .then((h) => { if (dead) h?.destroy?.(); else handle = h; });
    return () => { dead = true; handle?.destroy?.(); };
  }, [playing, ready, src, poster, errored]);

  return html`<${Fragment}>
    ${errored
      ? html`<${PosterFill} poster=${item.poster} page=${item.page} />`
      : poster
        ? html`<img src=${poster} alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60" onError=${posterFail} />`
        : html`<video ref=${bgRef} aria-hidden="true" muted loop playsinline class="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50"></video>`}
    <div class="absolute inset-0 bg-black/25" aria-hidden="true"></div>
    ${""}
    <video ref=${ref} data-main data-playing=${playing ? "" : null} poster=${poster} playsinline loop muted class=${`absolute inset-0 w-full h-full object-contain ${errored ? "opacity-0" : ""}`}></video>
  </${Fragment}>`;
}

function HeartBurst({ x, y, onDone }) {
  const ref = useRef();
  useEffect(() => {
    const anim = ref.current?.animate?.([
      { transform: "translate(-50%,-50%) scale(.3) rotate(-12deg)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1.15) rotate(-4deg)", opacity: 1, offset: .28 },
      { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1, offset: .62 },
      { transform: "translate(-50%,-50%) scale(1.5) rotate(4deg)", opacity: 0 },
    ], { duration: 720, easing: "cubic-bezier(.22,1,.36,1)" });
    if (anim) anim.onfinish = () => onDone?.(); else onDone?.();
    return () => { if (anim) anim.onfinish = null; };
  }, []);
  return html`<div ref=${ref} aria-hidden="true" class="absolute z-[5] pointer-events-none" style=${`left:${x}px;top:${y}px`}>${Icon("lucide:heart", "text-7xl text-rose-500 fill-rose-500 drop-shadow-[0_2px_16px_rgba(0,0,0,.45)]")}</div>`;
}

export function Slide({ S, item, idx, active, near, ephemeral }) {
  const secRef = useRef();
  const [burst, setBurst] = useState(null);
  const onTap = useTap({
    onSingle: () => openFull(S, item),
    onDouble: (p) => { setBurst({ x: p.x, y: p.y, k: Date.now() }); addLike(item); navigator.vibrate?.(12); },
  });
  return html`<section ref=${secRef} data-reel data-idx=${idx} onClick=${onTap} class="snap-start snap-always relative h-[100dvh] w-full flex items-center justify-center bg-black overflow-hidden">
    ${""}
    ${near
      ? html`<${VideoLayer} item=${item} playing=${active} ephemeral=${ephemeral} />`
      : item.poster
        ? html`<${PosterFill} poster=${item.poster} page=${item.page} />`
        : null}
    ${burst ? html`<${HeartBurst} x=${burst.x} y=${burst.y} key=${burst.k} onDone=${() => setBurst(null)} />` : null}
  </section>`;
}
