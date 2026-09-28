import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { sourceTitle } from "/_rt/sitelabel.js";
import { usePanX } from "/_rt/gesture.js";
import { Pixels } from "/_rt/skeleton.js";
import { Icon } from "./util.js";
import { $src, $mono, $subs, markWatched, $items, $next, $loading, $err, $active, $ephemeral, $srcTitle, $frames, $restoreTo, $feedChannel } from "./store.js";
import { bindNav, popFrame, diveTarget, diveTo, checkBlankPosters, loadSource } from "./feed.js";
import { FullClip, Slide } from "./player.js";
import { Favicon, SourceIsland } from "./island.js";
import { MoreSheet } from "./sheets.js";

const PRELOAD = 1;

let booted = false;

export function useMonoFlag() {
  const mono = useStore($mono);
  useEffect(() => {
    const root = document.documentElement;
    if (mono === "1") root.setAttribute("data-mono", "1"); else root.removeAttribute("data-mono");
  }, [mono]);
}

function DragReveal({ underRef, diveRef, backRef, target, targetLabel, prev }) {
  return html`<div ref=${underRef} aria-hidden="true" class="fixed inset-0 z-0 sf-inset opacity-0">
    ${prev ? html`<div ref=${backRef} class="absolute inset-y-0 left-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      ${Icon("lucide:corner-up-left", "text-2xl text-primary")}
      <span class="text-sm font-medium text-base-content truncate max-w-full">${prev.label}</span>
    </div>` : null}
    ${target ? html`<div ref=${diveRef} class="absolute inset-y-0 right-0 w-40 flex flex-col items-center justify-center gap-2 px-3 text-center opacity-0">
      <${Favicon} url=${target} size="w-10 h-10" />
      <span class="text-sm font-medium text-base-content truncate max-w-full">${targetLabel}</span>
      ${Icon("lucide:chevrons-right", "text-2xl text-primary")}
    </div>` : null}
  </div>`;
}

export function FeedSurface({ S, t, toast }) {
  const items = useStore($items), loading = useStore($loading), err = useStore($err);
  const active = useStore($active), next = useStore($next), ephemeral = useStore($ephemeral);
  const src = useStore($src), frames = useStore($frames), subs = useStore($subs), restoreTo = useStore($restoreTo);
  const title = useStore($srcTitle), feedChannel = useStore($feedChannel);
  const screen = useStore(S.screen);
  const suspended = screen === "full";
  const clean = useStore(S.clean);
  const mono = useStore($mono);
  const underRef = useRef(), diveRef = useRef(), backRef = useRef();
  const target = diveTarget(items[active], src);
  const targetLabel = target ? sourceTitle(target, { hint: items[active]?.title }) : "";
  const prev = frames.length ? frames[frames.length - 1] : null;

  const { paneRef, pan } = usePanX({
    threshold: 64,
    canNext: !!target, canPrev: frames.length > 0,
    onNext: () => diveTo(S, target, items[active]?.title),
    onPrev: () => popFrame(S),
    onDrag: (dx) => {
      const u = underRef.current; if (!u) return;
      u.style.opacity = String(Math.min(1, Math.abs(dx) / 110));
      if (diveRef.current) diveRef.current.style.opacity = dx < 0 ? "1" : "0";
      if (backRef.current) backRef.current.style.opacity = dx > 0 ? "1" : "0";
    },
  });

  useEffect(() => {
    bindNav(S);
    if (!booted) { booted = true; if (!gate) loadSource($src.get()); }
    else if ($active.get() > 0) $restoreTo.set($active.get());
    const root = document.documentElement;
    root.setAttribute("data-feed", "");
    return () => { root.removeAttribute("data-feed"); S.clean.set(false); };
  }, [S]);
  useMonoFlag();
  useEffect(() => { void checkBlankPosters(); }, [items]);
  useEffect(() => { if (next && active >= items.length - 3) loadSource(next, true); }, [active, items.length, next]);
  useEffect(() => { const it = items[active]; if (!it || gate) return; const id = setTimeout(() => markWatched(it.orig || it.video), 2500); return () => clearTimeout(id); }, [active, items]);
  useEffect(() => {
    const root = paneRef.current; if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && e.intersectionRatio >= 0.6) { const i = Number(e.target.dataset.idx); if (!Number.isNaN(i)) $active.set(i); } }, { root, threshold: [0.6] });
    root.querySelectorAll("[data-idx]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);
  useLayoutEffect(() => {
    if (restoreTo == null) return;
    const el = paneRef.current;
    if (el) el.scrollTop = restoreTo * (el.clientHeight || 0);
    $restoreTo.set(null);
  }, [restoreTo, items]);

  const body = loading
    ? html`<section class="h-[100dvh] w-full"><${Pixels} cls="w-full h-full" /></section>`
    : err
      ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/70 px-8 text-center">${Icon("lucide:cloud-off", "text-5xl")}<div>${T(t, "loadErr")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => loadSource(src)}>${T(t, "retry")}</button></section>`
      : !items.length
        ? html`<section class="h-[100dvh] w-full flex flex-col items-center justify-center gap-3 text-white/60 px-8 text-center">${Icon("lucide:film", "text-5xl")}<div>${T(t, "empty")}</div><button class="btn btn-sm btn-outline text-white border-white/25 rounded-2xl" onClick=${() => S.tab.set("sources")}>${T(t, "changeSrc")}</button></section>`
        : items.map((it, i) => html`<${Slide} S=${S} item=${it} idx=${i} active=${i === active && !suspended} near=${Math.abs(i - active) <= PRELOAD} ephemeral=${it.eph != null ? it.eph : ephemeral} key=${(it.orig || it.video) + i} />`);

  const cur = items[active];
  const channel = cur?.channel || feedChannel;

  return html`<${Fragment}>
    <${DragReveal} underRef=${underRef} diveRef=${diveRef} backRef=${backRef} target=${target} targetLabel=${targetLabel} prev=${prev} />
    ${""}
    <div ref=${paneRef} ...${pan} data-scroller tabindex="0" role="region" aria-label=${T(t, "tabReel")} class="fixed inset-0 z-[1] bg-black overflow-y-auto snap-y snap-mandatory overscroll-y-contain touch-pan-y will-change-transform">${body}</div>
    ${""}
    ${clean ? null : html`<${SourceIsland} S=${S} t=${t} src=${src} title=${title} clip=${cur?.title || ""} subbed=${subs.some((s) => s.url === src)} depth=${frames.length}
      channel=${channel} page=${cur?.page || ""} />`}
    ${""}
    ${screen === "more" ? html`<${MoreSheet} S=${S} t=${t} toast=${toast} item=${cur} src=${src} title=${title}
      subbed=${subs.some((s) => s.url === src)} />` : null}
    ${""}
    ${suspended ? html`<${FullClip} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}
