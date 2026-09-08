// Рух — film from words or a photo (third cut, 2026-09-03, from the state map in RESEARCH.md). One fit screen:
// the FRAME on the stage (the clip once it exists, the first frame before it, the empty frame with its three
// picture sources before that), the words + the model rail + the transport + the verb in one island at the
// foot; ≤520 px tall the frame moves beside the island (.ms-side) and the island demotes (head.html). The
// clips sheet is the collection. Every hook the e2e reads is a data-* attribute set here.
import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Island, Stage, Transport, Segmented } from "/_rt/ui.js";
import { Chooser, Camera } from "/_rt/intake.js";
import { permRequest } from "/_rt/permissions.js";
import { $src, $words, $model, $models, $job, $clip, $clips, $player, WORDS_MAX,
  boot, setSrc, removeSrc, generate, attachVideo, toggle, seek, selectClip, share, save, removeClip, loadModels, modelsFor, setModel, playList } from "./state.js";
import { $reel, $reelJob, $length, LENGTHS, CHUNK_SEC, runReel, stopReel } from "./reel.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LOCALE = { uk: "uk-UA", en: "en-GB" };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// a model's short name: the Space's own tail, as mirage shows it
const shortName = (id) => { const n = String(id || "").split("/").pop(); return n.length > 20 ? n.slice(0, 19) + "…" : n; };
// `length:` — a bare var() in text-[…] reads as a COLOUR to Tailwind v4 and the size falls back to the parent's
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider";
const label = `${LABEL} text-base-content/70`;
const frameLabel = `${LABEL} text-white/80`;   // ON the frame the ground is always black, so the caption is always light

export function rukh({ t, S, screen, closeScreen, toast, undo }) {
  const src = useStore($src), words = useStore($words), job = useStore($job), clip = useStore($clip), clips = useStore($clips), player = useStore($player);
  const model = useStore($model), models = useStore($models), loc = useStore(S.locale);
  const reel = useStore($reel), reelJob = useStore($reelJob), length = useStore($length);
  const [cam, setCam] = useState(false);
  const videoRef = useRef();
  useEffect(() => { boot(); }, []);
  useEffect(() => { attachVideo(videoRef.current || null); return () => attachVideo(null); }, []);
  const reeling = reelJob.phase === "writing" || reelJob.phase === "filming";
  const working = job.phase === "working" || reeling;
  const canShoot = (!!words.trim() || !!src) && !working;
  // a montage films from WORDS: the beats are written from them, so a picture alone has nothing to slice
  const canReel = !!words.trim() && !working;
  const reelDone = reel.filter((c) => c.status === "done");
  const fmt = new Intl.DateTimeFormat(LOCALE[loc] || LOCALE.en, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const origin = (c) => (c.by && c.by !== "mock" ? shortName(c.by) : T(t, c.pic ? "fromPicture" : "fromText"));
  // the rail for this mode; a chosen model the mode cannot use reads as auto (an i2v row without a picture)
  const rail = modelsFor(!!src);
  const modelSel = model !== "auto" && !rail.some((m) => m.id === model) ? "auto" : model;
  // what the frame shows: the camera · the picture · the clip · the empty frame with its sources
  // A reel puts its newest landed chunk on the same frame, so the montage BUILDS in front of the owner
  // instead of hiding behind a storyboard of thumbnails.
  const newest = reelDone.length ? reelDone[reelDone.length - 1] : null;
  const showClip = (!!clip || !!newest) && !cam && !src;
  useEffect(() => { if (newest?.url) playList([newest.url]); }, [newest?.i]);
  const actions = clip ? [
    { id: "share", icon: "lucide:share-2", label: T(t, "share"), attr: { "data-share": "" }, onClick: async () => { const r = await share(clip); if (r === "shared") toast?.(T(t, "shared")); else if (r === "saved") toast?.(T(t, "saved")); } },
    { id: "save", icon: "lucide:download", label: T(t, "save"), attr: { "data-save": "" }, onClick: () => { save(clip); toast?.(T(t, "saved")); } },
    { id: "clips", icon: "lucide:film", label: T(t, "clips"), attr: { "data-clips": "" }, onClick: () => S.screen.set("clips") },
  ] : [];

  return html`<div class="rk-root h-full min-h-0 flex flex-col ms-side" data-rk-phase=${job.phase} data-rk-mode=${src ? "picture" : "text"} data-rk-model=${modelSel}>
    <${Stage} className="flex items-center justify-center p-[var(--ms-gap)]">
      <div data-frame data-live=${clip ? "" : null} class="rk-frame relative h-full w-full max-w-[min(100%,26rem)] mx-auto rounded-[var(--ms-r)] overflow-hidden sf-inset">
        ${/* the ONE <video> stays mounted so the state's element survives a mode change; hidden when the frame shows something else */""}
        <video ref=${videoRef} data-clip=${clip ? clip.id : null} playsinline loop muted preload="metadata" class=${`absolute inset-0 w-full h-full object-contain bg-black ${showClip ? "" : "hidden"}`}></video>
        ${cam ? html`<${Camera} loc=${loc} reason=${T(t, "camReason")} privacy=${T(t, "primePrivacy")}
            onCapture=${(d) => { setSrc(d); setCam(false); }} onClose=${() => setCam(false)} onSettings=${() => permRequest("camera")} />`
          : src ? html`<img data-picture src=${src} alt="" class="absolute inset-0 w-full h-full object-contain bg-black" />
            <button data-remove-picture data-haptic="bump" aria-label=${T(t, "removePicture")} class="rk-chip absolute top-3 left-3 z-10 btn btn-circle btn-sm border-0"
              onClick=${() => { const restore = removeSrc(); undo && undo(restore, T(t, "pictureRemoved")); }}>${Icon("lucide:x", "text-base")}</button>
            <div class=${`absolute bottom-3 left-3 ${frameLabel} pointer-events-none`}>${T(t, "picture")}</div>`
          : showClip ? html`<${"div"} class="contents">
              ${clip?.pic ? html`<button data-first-frame aria-label=${T(t, "picture")} title=${T(t, "picture")} class="rk-thumb absolute top-3 left-3 z-10 overflow-hidden" onClick=${() => setSrc(clip.pic)}>
                <img src=${clip.pic} alt="" class="w-full h-full object-cover" />
              </button>` : null}
              ${/* the caption names a CLIP; on a reel chunk it names the beat being filmed instead */""}
              <div data-clip-meta class=${`absolute bottom-3 left-3 right-3 flex items-baseline justify-between gap-2 ${frameLabel} pointer-events-none`}>
                <span class="truncate">${clip ? T(t, clip.pic ? "fromPicture" : "fromText") : (newest?.beat || "")}</span>
                <span class="tabular-nums shrink-0 flex items-center gap-1.5">${player.muted ? Icon("lucide:volume-x", "text-[0.8rem]") : null}${clip?.res ? html`<span class="rk-res">${clip.res.replace("x", "×")} · </span>` : ""}${mmss((clip ? clip.dur : newest?.dur) || player.dur || 0)}</span>
              </div>
            <//>`
          /* nothing has landed yet: the frame carries the BEAT being filmed. A minute of empty hero is worse
             than no hero, and "what is it making right now" is the one thing a person waiting wants answered
             — the storyboard below already says how far along it is. */
          : reeling ? html`<div data-beat class="absolute inset-0 grid place-items-center px-6 text-center">
              <p class="text-white/80 text-[0.95rem] leading-snug max-w-[22ch]">${reelJob.phase === "writing" ? T(t, "scenario") : (reel.find((c) => c.i === reelJob.at)?.beat || "")}</p>
            </div>`
          : null}
        ${/* the working light: a 2 px filament along the frame's bottom edge whose LENGTH is the job's progress */""}
        ${working ? html`<span data-progress aria-hidden="true" class="rk-light" style=${`--pct:${Math.max(4, job.pct || 4)}%`}></span>` : null}
        ${/* the picture sources ride on the frame in every state but the camera's and the picture's: a compact
             glyph row over the clip, the labelled island on an empty frame */""}
        ${/* not while a reel films: the sources are a CHOICE, and once the beats are written there is nothing
             left to choose — it would sit in the hero position doing nothing while the storyboard works */""}
        ${!cam && !src && !reeling ? (showClip
          ? html`<div class="absolute top-0 inset-x-0 h-14"><${Chooser} loc=${loc} compact onPick=${setSrc} onCamera=${() => setCam(true)} /></div>`
          : html`<${Chooser} loc=${loc} onPick=${setSrc} onCamera=${() => setCam(true)} />`) : null}
      </div>
    <//>

    ${/* THE STORYBOARD — the montage's only honest progress display. A reel is serial by construction (each
         chunk needs the last frame of the one before), so there is nothing to show but WHICH chunk is filming
         and what the ones before it came out as. A tile carries its own last frame once it lands; tapping it
         plays that chunk. Scrolls inside itself — the page never scrolls sideways. */""}
    ${reel.length ? html`<div data-reel class="shrink-0 px-[var(--ms-pad)] pb-2">
      <div class=${`${label} flex items-baseline gap-2 mb-1.5`}>
        <span>${T(t, "storyboard")}</span>
        <span class="tabular-nums normal-case">${reelDone.length} ${T(t, "reelOf")} ${reel.length}</span>
        ${reeling ? html`<button data-reel-stop class="ml-auto btn btn-ghost btn-xs" onClick=${stopReel}>${T(t, "stop")}</button>`
          : reelDone.length ? html`<button data-reel-play class="ml-auto btn btn-ghost btn-xs gap-1" onClick=${() => playList(reelDone.map((c) => c.url))}>${Icon("lucide:play", "text-sm")}${T(t, "playReel")}</button>` : null}
      </div>
      <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        ${reel.map((c) => html`<button key=${c.i} data-chunk=${c.i} data-chunk-status=${c.status}
          disabled=${c.status !== "done"} onClick=${() => c.url && playList([c.url])}
          title=${c.beat}
          class=${`rk-tile relative shrink-0 w-14 h-14 rounded-[calc(var(--ms-r)*0.6)] overflow-hidden border ${
            c.status === "filming" ? "border-primary" : c.status === "done" ? "border-base-content/20" : "border-base-content/10"} ${
            c.status === "waiting" ? "opacity-40" : ""}`}>
          ${c.thumb ? html`<img src=${c.thumb} alt="" class="absolute inset-0 w-full h-full object-cover" />` : null}
          ${c.status === "error"
            ? html`<span class="absolute inset-0 grid place-items-center text-muted">${Icon("lucide:minus", "text-base")}</span>`
            : html`<span class=${`absolute bottom-0.5 right-1 ${LABEL} tabular-nums ${c.thumb ? "text-white/90" : "text-muted"}`}>${c.i}</span>`}
          ${c.status === "filming" ? html`<span data-chunk-live class="rk-light absolute bottom-0 left-0" style="--pct:100%"></span>` : null}
        </button>`)}
      </div>
    </div>` : null}

    <div class="ms-side-main flex flex-col justify-end min-h-0 p-[var(--ms-pad)] pt-0">
      <${Island} tone="glass" className="flex flex-col gap-2 min-w-0">
        <textarea data-words rows="2" value=${words} spellcheck="false" aria-label=${T(t, "wordsLabel")} placeholder=${T(t, "wordsPlaceholder")}
          onInput=${(e) => $words.set(e.currentTarget.value.slice(0, WORDS_MAX))}
          class="rk-words w-full min-w-0 resize-none bg-transparent border-0 outline-none text-[0.95rem] leading-snug focus:outline-none placeholder:text-base-content/45"></textarea>
        ${/* THE MODEL — the owner's choice, not the back end's (mirage's language): Авто is the measured pool, every
             other pill a Space the edge can run NOW — green = HF says RUNNING, grey = HF could not say; a dead one
             is never offered, an i2v-only one only with a picture */""}
        <div data-models class="flex items-center gap-2 min-w-0">
          <span class=${`${label} shrink-0`}>${T(t, "model")}</span>
          <div class="min-w-0 flex-1">
            <${Segmented} attr="data-model" size="sm" variant="outline" scroll label=${T(t, "model")} value=${modelSel} onChange=${setModel}
              items=${[{ id: "auto", label: T(t, "modelAuto"), icon: "lucide:sparkles" }, ...rail.map((m) => ({ id: m.id, label: shortName(m.id), title: m.id, dot: m.alive ? "var(--color-success)" : "color-mix(in oklch, var(--color-base-content) 35%, transparent)" }))]} />
          </div>
          <button data-models-check aria-label=${T(t, "modelCheck")} class="btn btn-ghost btn-xs btn-circle shrink-0 text-base-content/70" disabled=${models.loading} onClick=${() => loadModels(true)}>${Icon("lucide:refresh-cw", `text-base ${models.loading ? "animate-spin" : ""}`)}</button>
        </div>
        ${job.error ? html`<div data-error class="text-sm text-error">${T(t, job.error)}</div>` : null}
        ${showClip && player.unplayable ? html`<div data-unplayable class="text-sm text-warning">${T(t, "eUnplayable")}</div>` : null}
        ${/* while the scenario is being written the FRAME already says so, and one screen saying the same
             thing twice is noise; once chunks start the two lines differ (the beat above, the count here) */""}
        ${working && !(reeling && reelJob.phase === "writing") ? html`<div data-status class=${`${label} flex items-center gap-2`}>
          <span class="rk-st">${reeling ? T(t, reelJob.phase === "writing" ? "scenario" : "filming") : T(t, src ? "animating" : "filming")}<span class="rk-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>
          ${/* a reel counts CHUNKS, not seconds: an eta over a serial chain of ~20 calls would be a guess
               dressed as a number, and the storyboard already says exactly how far it has got */""}
          ${reeling && reelJob.of ? html`<span data-reel-at class="ml-auto tabular-nums normal-case">${reelJob.at} ${T(t, "reelOf")} ${reelJob.of}</span>`
            : job.eta ? html`<span class="ml-auto tabular-nums normal-case">${Math.max(0, Math.round(job.eta - (job.elapsed || 0)))} s</span>` : null}
        </div>` : null}
        ${clip && showClip && !working ? html`<${Transport} locale=${loc} size="sm" playing=${player.playing && !player.muted} onToggle=${toggle} pos=${player.pos} dur=${player.dur} onSeek=${seek}
          title=${clip.words || T(t, "clip")} subtitle=${origin(clip)} actions=${actions} keep=${3}
          moreOpen=${screen === "more"} onMore=${() => S.screen.set("more")} onMoreClose=${closeScreen} />` : null}
        ${/* THE LENGTH is the montage's only setting: it decides how many beats the edge writes and therefore
             how many chunks are filmed. The pools return ~3 s a call, so the count is the length over that. */""}
        <div data-lengths class="flex items-center gap-2 min-w-0">
          <span class=${`${label} shrink-0`}>${T(t, "length")}</span>
          <div class="min-w-0 flex-1">
            <${Segmented} attr="data-length" size="sm" variant="outline" label=${T(t, "length")} value=${String(length)} onChange=${(v) => $length.set(Number(v))}
              items=${LENGTHS.map((s) => ({ id: String(s), label: `${s} s`, title: `${Math.ceil(s / CHUNK_SEC)}` }))} />
          </div>
        </div>
        <div class="flex gap-2 min-w-0">
          <button data-generate class="btn btn-primary rounded-full flex-1 gap-2" disabled=${!canShoot} onClick=${generate}>${Icon("lucide:clapperboard", "text-lg")}${T(t, src ? "animate" : "shoot")}</button>
          <button data-montage class="btn btn-outline rounded-full flex-1 gap-2" disabled=${!canReel}
            onClick=${() => { const first = src || ""; setSrc(null); runReel({ prompt: words, firstFrame: first, locale: loc }); }}>${Icon("lucide:film", "text-lg")}${T(t, "montage")}</button>
        </div>
      <//>
    </div>

    <${Sheet} id="rk-clips" open=${screen === "clips"} onClose=${closeScreen} title=${T(t, "clips")} icon="lucide:film" locale=${loc}>
      ${clips.length ? html`<ul data-clip-list class="flex flex-col divide-y divide-base-content/10">
        ${clips.map((c) => html`<li key=${c.id} data-clip-row=${c.id} class="flex items-center gap-2 py-2 min-w-0">
          <button data-clip-play class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "clip")} onClick=${() => { selectClip(c.id); closeScreen(); }}>${Icon("lucide:play", "text-base")}</button>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm">${c.words || T(t, "clip")}</div>
            <div class=${`${label} truncate`}>${origin(c)} · ${mmss(c.dur || 0)} · ${fmt.format(new Date(c.ts))}</div>
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
