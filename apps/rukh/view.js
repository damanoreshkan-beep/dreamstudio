// Рух — film from words or a photo. One fit screen: the FRAME on the stage (the clip once it exists, the first
// frame before it, an empty frame with the three picture sources before that), the words + the transport + the
// verb in one island at the foot; ≤520 px tall the frame moves beside the island (.ms-side). The clips sheet is
// the collection. Precedents and measurements: apps/rukh/RESEARCH.md.
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Island, Stage, Transport } from "/_rt/ui.js";
import { Chooser, Camera } from "/_rt/intake.js";
import { permRequest } from "/_rt/permissions.js";
import { $src, $words, $gen, $clip, $clips, $player, WORDS_MAX,
  boot, setSrc, removeSrc, generate, attachVideo, toggle, seek, selectClip, share, save, removeClip } from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LOCALE = { uk: "uk-UA", en: "en-GB" };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function rukh({ t, S, screen, closeScreen, toast, undo }) {
  const src = useStore($src), words = useStore($words), gen = useStore($gen), clip = useStore($clip), clips = useStore($clips), player = useStore($player);
  const loc = useStore(S.locale);
  const [cam, setCam] = useState(false);
  const videoRef = useRef();
  useEffect(() => { boot(); }, []);
  useEffect(() => { attachVideo(videoRef.current || null); });
  const working = gen.phase === "working";
  const canShoot = (!!words.trim() || !!src) && !working;
  const label = "font-mono text-[var(--ms-label)] uppercase tracking-wider text-base-content/70";
  const fmt = new Intl.DateTimeFormat(LOCALE[loc] || LOCALE.en, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  // what the stage shows: the camera, the clip (the picture steps aside once a clip exists — the picture is the
  // clip's first frame), the first frame, or the empty frame with its sources
  const showClip = !!clip && !cam && !src;
  const actions = clip ? [
    { id: "share", icon: "lucide:share-2", label: T(t, "share"), attr: { "data-share": "" }, onClick: async () => { const r = await share(clip); if (r === "shared") toast?.(T(t, "shared")); else if (r === "saved") toast?.(T(t, "saved")); } },
    { id: "save", icon: "lucide:download", label: T(t, "save"), attr: { "data-save": "" }, onClick: () => { save(clip); toast?.(T(t, "saved")); } },
    { id: "clips", icon: "lucide:film", label: T(t, "clips"), attr: { "data-clips": "" }, onClick: () => S.screen.set("clips") },
  ] : [];

  return html`<div class="rk-root h-full min-h-0 flex flex-col ms-side" data-rk-phase=${gen.phase} data-rk-mode=${src ? "picture" : "text"}>
    <${Stage} className="flex items-center justify-center p-[var(--ms-gap)]">
      <div data-frame data-live=${clip ? "" : null} class="rk-frame relative h-full w-full max-w-[min(100%,26rem)] mx-auto rounded-[var(--ms-r)] overflow-hidden sf-inset">
        ${/* the ONE <video> stays mounted so the transport's element survives a mode change; hidden when the frame shows something else */""}
        <video ref=${videoRef} data-clip=${clip ? clip.id : null} playsinline loop preload="metadata" class=${`absolute inset-0 w-full h-full object-contain bg-black ${showClip ? "" : "hidden"}`}></video>
        ${cam ? html`<${Camera} loc=${loc} reason=${T(t, "camReason")} privacy=${T(t, "primePrivacy")}
            onCapture=${(d) => { setSrc(d); setCam(false); }} onClose=${() => setCam(false)} onSettings=${() => permRequest("camera")} />`
          : src ? html`<img data-picture src=${src} alt="" class="absolute inset-0 w-full h-full object-contain bg-black" />
            <button data-remove-picture data-haptic="bump" aria-label=${T(t, "removePicture")} class="absolute top-3 left-3 btn btn-circle btn-sm bg-black/50 text-white border-0"
              onClick=${() => { const restore = removeSrc(); undo && undo(restore, T(t, "pictureRemoved")); }}>${Icon("lucide:x", "text-base")}</button>
            <div class=${`absolute bottom-3 left-3 ${label} text-white/80`}>${T(t, "picture")}</div>`
          : showClip ? html`<div data-clip-meta class=${`absolute bottom-3 left-3 right-3 flex items-baseline justify-between gap-2 ${label} text-white/80 pointer-events-none`}>
              <span class="truncate">${clip.pic ? T(t, "fromPicture") : T(t, "fromText")}</span>
              <span class="tabular-nums shrink-0">${clip.res ? clip.res.replace("x", "×") + " · " : ""}${mmss(clip.dur || player.dur || 0)}</span>
            </div>`
          : null}
        ${/* the three picture sources ride on the frame in every state but the camera's and the picture's: a
             compact glyph row on a clip, the labelled island on an empty frame */""}
        ${!cam && !src ? (showClip
          ? html`<div class="absolute top-0 inset-x-0 h-14"><${Chooser} loc=${loc} compact onPick=${setSrc} onCamera=${() => setCam(true)} /></div>`
          : html`<${Chooser} loc=${loc} onPick=${setSrc} onCamera=${() => setCam(true)} />`) : null}
      </div>
    <//>

    <div class="ms-side-main flex flex-col justify-end min-h-0 p-[var(--ms-pad)] pt-0">
      <${Island} tone="glass" className="flex flex-col gap-2 min-w-0">
        <textarea data-words rows="2" value=${words} spellcheck="false" aria-label=${T(t, "wordsLabel")} placeholder=${T(t, "wordsPlaceholder")}
          onInput=${(e) => $words.set(e.currentTarget.value.slice(0, WORDS_MAX))}
          class="rk-words w-full min-w-0 resize-none bg-transparent text-[0.95rem] leading-snug focus:outline-none placeholder:text-base-content/45"></textarea>
        ${gen.error ? html`<div data-error class="text-sm text-error">${T(t, gen.error)}</div>` : null}
        ${working ? html`<div data-status class=${`${label} flex items-center gap-2`}>
          <span class="rk-st">${T(t, src ? "animating" : "filming")}<span class="rk-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>
          ${gen.eta ? html`<span class="ml-auto tabular-nums normal-case">${Math.max(0, Math.round(gen.eta - (gen.elapsed || 0)))} s</span>` : null}
        </div>` : null}
        ${clip && !working ? html`<${Transport} locale=${loc} size="sm" playing=${player.playing} onToggle=${toggle} pos=${player.pos} dur=${player.dur} onSeek=${seek}
          title=${clip.words || T(t, "clip")} subtitle=${clip.pic ? T(t, "fromPicture") : T(t, "fromText")} actions=${actions} keep=${3}
          moreOpen=${screen === "more"} onMore=${() => S.screen.set("more")} onMoreClose=${closeScreen} />` : null}
        <button data-generate class="btn btn-primary rounded-full w-full gap-2" disabled=${!canShoot} onClick=${generate}>${Icon("lucide:clapperboard", "text-lg")}${T(t, src ? "animate" : "shoot")}</button>
      <//>
    </div>

    <${Sheet} id="rk-clips" open=${screen === "clips"} onClose=${closeScreen} title=${T(t, "clips")} icon="lucide:film" locale=${loc}>
      ${clips.length ? html`<ul data-clip-list class="flex flex-col divide-y divide-base-content/10">
        ${clips.map((c) => html`<li key=${c.id} data-clip-row=${c.id} class="flex items-center gap-2 py-2 min-w-0">
          <button data-clip-play class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "clip")} onClick=${() => { setSrc(null); selectClip(c.id); closeScreen(); }}>${Icon("lucide:play", "text-base")}</button>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm">${c.words || T(t, "clip")}</div>
            <div class=${`${label} truncate`}>${c.pic ? T(t, "fromPicture") : T(t, "fromText")} · ${mmss(c.dur || 0)} · ${fmt.format(new Date(c.ts))}</div>
          </div>
          <button data-clip-delete data-haptic="bump" class="btn btn-ghost btn-sm btn-circle shrink-0 text-base-content/70" aria-label=${T(t, "delete")}
            onClick=${() => { const restore = removeClip(c.id); undo && undo(restore, T(t, "deleted")); }}>${Icon("lucide:trash-2", "text-base")}</button>
        </li>`)}
      </ul>` : html`<div data-clip-empty class="flex flex-col items-center gap-2 py-8 text-center">
        ${Icon("lucide:film", "text-3xl text-base-content/70")}
        <div class="font-medium">${T(t, "noClips")}</div>
        <div class="text-sm text-base-content/70">${T(t, "noClipsHint")}</div>
      </div>`}
    <//>
  </div>`;
}
