import { html } from "htm/preact";
import { Fragment } from "preact";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Icon } from "./util.js";
import { $likes, unlike, $items, $next, $loading, $err, $active, $ephemeral, $restoreTo, $owner } from "./store.js";
import { pushFrame } from "./feed.js";
import { useShareIntake } from "./share.js";
import { SourceSheet } from "./sheets.js";
import { useMonoFlag, FeedSurface } from "./surface.js";

export function reel({ S, toast }) {
  const t = useStore(S.t), screen = useStore(S.screen);
  useShareIntake(S, toast);
  return html`<${Fragment}>
    <${FeedSurface} S=${S} t=${t} toast=${toast} />
    ${screen === "source" ? html`<${SourceSheet} S=${S} t=${t} />` : null}
  </${Fragment}>`;
}

export function liked({ S, toast }) {
  const t = useStore(S.t), likes = useStore($likes), owner = useStore($owner);
  useShareIntake(S, toast);
  useMonoFlag();
  const sorted = [...likes].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (owner === "liked") return html`<${FeedSurface} S=${S} t=${t} toast=${toast} />`;
  const playAt = (i) => {
    pushFrame(S, T(t, "tabLiked"));
    $owner.set("liked"); $ephemeral.set(false); $next.set(null); $err.set(false); $loading.set(false);
    $items.set([...sorted.slice(i), ...sorted.slice(0, i)]);
    $active.set(0); $restoreTo.set(0);
  };
  if (!sorted.length) return html`<div class="flex flex-col items-center justify-center gap-3 text-muted text-center" style="min-height:60vh">${Icon("lucide:heart", "text-6xl opacity-30")}<div class="text-sm max-w-[16rem]">${T(t, "likedEmpty")}</div></div>`;
  return html`<div data-liked class="grid grid-cols-3 gap-1.5">
    ${""}
    ${sorted.map((l, i) => html`<div class="relative aspect-[9/16] rounded-xl overflow-hidden sf-inset" key=${l.id}>
      <button data-liked-tile class="absolute inset-0 w-full h-full active:scale-[.98] transition" aria-label=${l.title || l.host} onClick=${() => playAt(i)}>
        ${l.poster
          ? html`<img src=${l.poster} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => e.currentTarget.remove()} />`
          : html`<div class="absolute inset-0 flex items-center justify-center">${Icon("lucide:play", "text-2xl opacity-40")}</div>`}
        <div class="absolute inset-x-0 bottom-0 p-1.5 pt-6 bg-gradient-to-t from-black/75 to-transparent"><div class="text-[10px] text-white/90 truncate text-left">${l.title || l.host}</div></div>
      </button>
      <button class="absolute top-1 right-1 btn btn-xs btn-circle bg-black/45 border-0 text-rose-400 hover:bg-black/70" aria-label=${T(t, "unlike")} data-haptic="bump" onClick=${() => unlike(l.id)}>${Icon("lucide:heart", "text-sm fill-current")}</button>
    </div>`)}
  </div>`;
}

export { sources } from "./sources.js";
