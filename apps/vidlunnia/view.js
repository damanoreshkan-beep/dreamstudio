// Відлуння — your voice, any language. One fit screen: the VOICE (a ring of your take, the mic in its centre)
// in the void, the words + the manner + the transport in one island at the foot; ≤520px tall the ring moves
// beside the island (.ms-side). Precedents and measurements: apps/vidlunnia/RESEARCH.md.
import { html } from "htm/preact";
import { useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented, Island, Stage, Transport } from "/_rt/ui.js";
import { MicPrime } from "/_rt/camprime.js";
import { permRequest } from "/_rt/permissions.js";
import { $take, $rec, $words, $manner, $primed, $gen, $echo, $echoes, $player, $voice, $presetView, MANNERS, VOICES, BARS, TAKE_MAX, mannerOf,
  boot, startRecord, stopRecord, playTake, generate, toggle, seek, selectEcho, selectVoice, share, save, removeEcho } from "./state.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LOCALE = { uk: "uk-UA", en: "en-GB" };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// THE RING — 48 radial bars: the live level while recording, the take's envelope once it exists (its "seal"),
// a resting hairline before. Drawn with currentColor + opacity (Tailwind fill/stroke utilities are not emitted
// reliably by the CDN build), the mark colour only while the voice is live or sealed.
function Ring({ bars, live, sealed, idle }) {
  const R0 = 64, cx = 100, cy = 100;
  const lines = [];
  for (let i = 0; i < BARS; i++) {
    const v = bars[i] ?? 0, a = (i / BARS) * Math.PI * 2 - Math.PI / 2, len = idle ? 4 : 5 + 28 * v;
    const x1 = cx + Math.cos(a) * R0, y1 = cy + Math.sin(a) * R0, x2 = cx + Math.cos(a) * (R0 + len), y2 = cy + Math.sin(a) * (R0 + len);
    lines.push(html`<line key=${i} x1=${x1.toFixed(1)} y1=${y1.toFixed(1)} x2=${x2.toFixed(1)} y2=${y2.toFixed(1)} />`);
  }
  return html`<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true"
    class=${`vd-ring block w-full h-full ${live || sealed ? "vd-ring-on" : "text-base-content"}`} data-ring-state=${live ? "live" : sealed ? "sealed" : "idle"}>
    <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.22" />
    <g stroke="currentColor" stroke-width="2.6" stroke-linecap="round" opacity=${idle ? 0.3 : 0.9}>${lines}</g>
  </svg>`;
}

export function vidlunnia({ t, S, screen, closeScreen, toast, undo }) {
  const take = useStore($take), rec = useStore($rec), words = useStore($words), manner = useStore($manner), primed = useStore($primed);
  const gen = useStore($gen), echo = useStore($echo), echoes = useStore($echoes), player = useStore($player), loc = useStore(S.locale);
  const voice = useStore($voice), pv = useStore($presetView);
  useEffect(() => { boot(); }, []);
  const recording = rec.state === "recording", decoding = rec.state === "decoding", working = gen.phase === "working";
  const bad = rec.err === "denied" || rec.err === "unavailable" || rec.err === "unsupported";
  // the priming screen only when the mic was ASKED for and is blocked — the presets speak without it
  const prime = !take && bad;
  const mine = voice === "mine";
  // the ring wears the voice that will speak: the take's seal, or the preset's; live levels while recording
  const sealed = !recording && (mine ? !!take : !!pv);
  const bars = recording ? rec.bars : mine ? (take?.bars || []) : (pv?.bars || []);
  const dur = mine ? take?.dur : pv?.dur;
  const since = recording ? Math.min(TAKE_MAX, (Date.now() - rec.since) / 1000) : 0;
  const canSay = !!words.trim() && (mine ? !!take : true) && !working && !recording && !decoding;
  const label = "font-mono text-[var(--ms-label)] uppercase tracking-wider text-base-content/70";
  const fmt = new Intl.DateTimeFormat(LOCALE[loc] || LOCALE.en, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const takeNote = rec.err === "short" ? T(t, "short") : take?.quiet ? T(t, "quiet") : take?.clipped ? T(t, "clipped") : "";

  const actions = echo ? [
    { id: "share", icon: "lucide:share-2", label: T(t, "share"), attr: { "data-share": "" }, onClick: async () => { const r = await share(echo); if (r === "shared") toast?.(T(t, "shared")); else if (r === "saved") toast?.(T(t, "saved")); } },
    { id: "save", icon: "lucide:download", label: T(t, "save"), attr: { "data-save": "" }, onClick: () => { save(echo); toast?.(T(t, "saved")); } },
    { id: "echoes", icon: "lucide:history", label: T(t, "echoes"), attr: { "data-echoes": "" }, onClick: () => S.screen.set("echoes") },
  ] : [];

  return html`<div class="h-full min-h-0 flex flex-col ms-side" data-vd-take=${take ? (take.seeded ? "seeded" : "real") : null} data-vd-phase=${gen.phase}>
    <${Stage} className="flex items-center justify-center p-[var(--ms-gap)]">
      ${prime ? html`<${MicPrime} loc=${loc} reason=${T(t, "micReason")} privacy=${T(t, "micPrivacy")} privacyIcon="lucide:cloud-upload"
        denied=${rec.err === "denied"} unavailable=${rec.err === "unavailable" || rec.err === "unsupported"}
        onEnable=${() => { $primed.set("1"); startRecord(); }} onSettings=${() => permRequest("microphone")} />` : null}
      <div data-take=${take ? "" : null} data-live=${take ? "" : null} class="vd-box relative h-full w-full max-w-[min(100%,26rem)] mx-auto">
        <${Ring} bars=${bars} live=${recording} sealed=${sealed} idle=${!sealed && !recording} />
        <div class="vd-centre absolute inset-0 flex flex-col items-center justify-center gap-1.5 pointer-events-none">
          ${recording
            ? html`<button data-record data-state="recording" class="btn btn-circle btn-lg btn-error pointer-events-auto" aria-label=${T(t, "stop")} onClick=${stopRecord}>${Icon("lucide:square", "text-2xl")}</button>`
            : html`<button data-record data-state=${take ? "again" : "idle"} disabled=${decoding || working} class=${`btn btn-circle btn-lg pointer-events-auto ${take ? "btn-ghost" : "btn-primary"}`}
                aria-label=${T(t, take ? "rerecord" : "record")} onClick=${() => { $primed.set("1"); startRecord(); }}>${Icon(take ? "lucide:mic" : "lucide:mic", "text-2xl")}</button>`}
          <div data-take-status class=${`${label} tabular-nums text-center`}>
            ${recording ? html`<span class="vd-name"><span class="text-error">${T(t, "recording")}</span> · </span>${mmss(since)}`
              : sealed ? html`<span class="vd-name">${T(t, mine ? "yourVoice" : VOICES.find((v) => v.id === voice)?.key || "vF")} · </span>${mmss(dur || 0)}` : T(t, "record")}
          </div>
          ${sealed ? html`<button data-play-take class="btn btn-ghost btn-xs rounded-full gap-1 pointer-events-auto" onClick=${playTake} aria-label=${T(t, "playTake")}>${Icon("lucide:play", "text-sm")}</button>` : null}
        </div>
      </div>
    <//>

    <div class="ms-side-main flex flex-col justify-end min-h-0 p-[var(--ms-pad)] pt-0">
      <${Island} tone="glass" className="flex flex-col gap-2 min-w-0">
        <textarea data-words rows="2" value=${words} spellcheck="false" aria-label=${T(t, "wordsLabel")} placeholder=${T(t, "wordsPlaceholder")}
          onInput=${(e) => $words.set(e.currentTarget.value.slice(0, 400))}
          class="w-full min-w-0 resize-none bg-transparent text-[0.95rem] leading-snug focus:outline-none placeholder:text-base-content/45"></textarea>
        <${Segmented} attr="data-voice" variant="outline" size="sm" label=${T(t, "voice")} value=${voice} onChange=${selectVoice}
          items=${VOICES.filter((v) => v.id !== "mine" || take).map((v) => ({ id: v.id, label: T(t, v.key), icon: v.id === "mine" ? "lucide:mic" : undefined }))} />
        <${Segmented} attr="data-manner" variant="outline" size="sm" scroll=${true} label=${T(t, "manner")} value=${manner} onChange=${(v) => $manner.set(v)}
          items=${MANNERS.map((m) => ({ id: m.id, label: T(t, m.key) }))} />
        ${takeNote ? html`<div data-take-note class="text-sm text-warning">${takeNote}</div>` : null}
        ${gen.error ? html`<div data-error class="text-sm text-error">${T(t, gen.error)}</div>` : null}
        ${working ? html`<div data-status class=${`${label} flex items-center gap-2`}>
          <span class="vd-st">${T(t, "working")}<span class="vd-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>
          ${gen.eta ? html`<span class="ml-auto tabular-nums normal-case">${Math.max(0, Math.round(gen.eta - (gen.elapsed || 0)))} s</span>` : null}
        </div>` : null}
        ${echo && !working ? html`<${Transport} locale=${loc} size="sm" playing=${player.playing} onToggle=${toggle} pos=${player.pos} dur=${player.dur} onSeek=${seek}
          title=${echo.words} subtitle=${T(t, mannerOf(echo.manner).key)} actions=${actions} keep=${3}
          moreOpen=${screen === "more"} onMore=${() => S.screen.set("more")} onMoreClose=${closeScreen} />` : null}
        <button data-generate class="btn btn-primary rounded-full w-full gap-2" disabled=${!canSay} onClick=${generate}>${Icon("lucide:sparkles", "text-lg")}${T(t, "generate")}</button>
      <//>
    </div>

    <${Sheet} id="vd-echoes" open=${screen === "echoes"} onClose=${closeScreen} title=${T(t, "echoes")} icon="lucide:history" locale=${loc}>
      ${echoes.length ? html`<ul data-echo-list class="flex flex-col divide-y divide-base-content/10">
        ${echoes.map((e) => html`<li key=${e.id} data-echo-row=${e.id} class="flex items-center gap-2 py-2 min-w-0">
          <button data-echo-play class="btn btn-ghost btn-sm btn-circle shrink-0" aria-label=${T(t, "echo")} onClick=${() => { selectEcho(e.id); closeScreen(); }}>${Icon("lucide:play", "text-base")}</button>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm">${e.words}</div>
            <div class=${`${label} truncate`}>${T(t, mannerOf(e.manner).key)} · ${fmt.format(new Date(e.ts))}</div>
          </div>
          <button data-echo-delete data-haptic="bump" class="btn btn-ghost btn-sm btn-circle shrink-0 text-base-content/70" aria-label=${T(t, "delete")}
            onClick=${() => { const restore = removeEcho(e.id); undo && undo(restore, T(t, "deleted")); }}>${Icon("lucide:trash-2", "text-base")}</button>
        </li>`)}
      </ul>` : html`<div data-echo-empty class="flex flex-col items-center gap-2 py-8 text-center">
        ${Icon("lucide:audio-lines", "text-3xl text-base-content/70")}
        <div class="font-medium">${T(t, "noEchoes")}</div>
        <div class="text-sm text-base-content/70">${T(t, "noEchoesHint")}</div>
      </div>`}
    <//>
  </div>`;
}
