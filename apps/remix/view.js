import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Panel, Transport } from "/_rt/ui.js";
import { advance } from "/_rt/player.js";
import { askAI } from "/_rt/ai-core.js";
import { takeShared, firstLink } from "/_rt/share.js";
import { videoId, clock, byline } from "/_rt/muzak.js";
import { VARIANTS, remixFile, roomKey, presetLine, whyKeys, parseTags, groundSong, errorKey, FIXTURE_LINK, FIXTURE_META, FIXTURE_ANALYSIS, FIXTURE_TAGS } from "/_rt/remix.js";

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
const $link = atom(gate ? FIXTURE_LINK : "");
const $meta = atom(gate ? FIXTURE_META : null);
const $busy = atom("");          // "" | "meta" | "listen" | "mix"
const $err = atom("");
// Under the gate the song is already mixed: the store card and the shots show the whole screen, not its first step.
const MIXED = Object.fromEntries(VARIANTS.map((v) => [v, { state: "ready" }]));
const $ana = atom(gate ? FIXTURE_ANALYSIS : null);   // the edge's analysis: bpm, density…, presets, why
const $tags = atom(gate ? FIXTURE_TAGS : null);      // the AI's genre / vocal / why
const $tracks = atom(gate ? MIXED : {});             // variant → { state: "wait"|"ready"|"err", url }
const $cur = atom(gate ? VARIANTS[0] : "");          // the variant in the transport
const $playing = atom(false);
const $pos = atom(0), $dur = atom(0);
let seq = 0, audio = null;
const CALL_MS = 110_000;         // the edge answers inside nginx's 120 s; a download + three renders fit with room
takeShared((s) => { const link = firstLink(s) || String(s.text || "").trim(); if (link) { $link.set(link); find(link); } });

function reset() { stop(); $ana.set(null); $tags.set(null); for (const t of Object.values($tracks.get())) if (t.url) URL.revokeObjectURL(t.url); $tracks.set({}); $cur.set(""); }

async function find(link) {
  const id = videoId(link);
  if (!id) { $err.set("errLink"); $meta.set(null); reset(); return; }
  const my = ++seq;
  $err.set(""); $busy.set("meta"); reset();
  if (gate) { $meta.set(FIXTURE_META); $busy.set(""); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/music/meta?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(40000) });
    if (my !== seq) return;
    if (!r.ok) { $meta.set(null); const k = errorKey(r.status); if (k) $err.set(k); return; }
    $meta.set(await r.json());
  } catch { if (my === seq) { $meta.set(null); $err.set("errMeta"); } }
  finally { if (my === seq) $busy.set(""); }
}

// The producer's ear the audio cannot give: genre and vocal type from the title. Fail-open — no tags, same remix.
async function askTags(meta, locale) {
  const { text } = groundSong(meta);
  try {
    const r = await Promise.race([askAI(text, locale, "remix"), new Promise((_, no) => setTimeout(() => no(new Error("slow")), 15000))]);
    return parseTags(r?.text);
  } catch { return null; }
}

async function mix(link, meta, locale) {
  if ($busy.get()) return;
  const my = ++seq;
  $err.set(""); reset();
  $tracks.set(Object.fromEntries(VARIANTS.map((v) => [v, { state: "wait" }])));
  if (gate) { $tags.set(FIXTURE_TAGS); $ana.set(FIXTURE_ANALYSIS); $tracks.set(MIXED); $cur.set(VARIANTS[0]); return; }
  $busy.set("listen");
  const tags = await askTags(meta, locale);
  if (my !== seq) return;
  $tags.set(tags);
  const q = `url=${encodeURIComponent(link)}${tags ? `&genre=${tags.genre}${tags.vocal ? `&vocal=${tags.vocal}` : ""}` : ""}`;
  try {
    const r = await fetch(`${VPS_PROXY}/music/analyze?${q}`, { signal: AbortSignal.timeout(CALL_MS) });
    if (my !== seq) return;
    if (!r.ok) { const k = errorKey(r.status); $err.set(k === "errMeta" ? "errMix" : k); $tracks.set({}); $busy.set(""); return; }
    $ana.set(await r.json());
  } catch { if (my === seq) { $err.set("errMix"); $tracks.set({}); $busy.set(""); } return; }
  $busy.set("mix");
  await Promise.all(VARIANTS.map(async (v) => {
    try {
      const r = await fetch(`${VPS_PROXY}/music/remix?${q}&v=${v}`, { signal: AbortSignal.timeout(CALL_MS) });
      if (!r.ok) throw new Error(String(r.status));
      const url = URL.createObjectURL(await r.blob());
      if (my !== seq) { URL.revokeObjectURL(url); return; }
      $tracks.set({ ...$tracks.get(), [v]: { state: "ready", url } });
      if (!$cur.get()) $cur.set(v);
    } catch { if (my === seq) $tracks.set({ ...$tracks.get(), [v]: { state: "err" } }); }
  }));
  if (my === seq) $busy.set("");
}

// ── one element, three files ──────────────────────────────────────────────────────────────────────────────
function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.addEventListener("timeupdate", () => $pos.set(Math.round(audio.currentTime * 1000)));
  audio.addEventListener("durationchange", () => $dur.set(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0));
  audio.addEventListener("pause", () => $playing.set(false));
  audio.addEventListener("play", () => $playing.set(true));
  audio.addEventListener("ended", () => step(1, false));
  return audio;
}
function stop() { if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } $playing.set(false); $pos.set(0); $dur.set(0); }
function play(v) {
  const t = $tracks.get()[v];
  if (!t || t.state !== "ready") return false;
  if (gate) { $cur.set(v); $playing.set(true); return true; }
  const a = ensure();
  if ($cur.get() !== v || !a.src) { a.src = t.url; $pos.set(0); }
  $cur.set(v);
  a.play().catch(() => $playing.set(false));
  return true;
}
function toggle() {
  if ($playing.get()) { if (gate) $playing.set(false); else audio?.pause(); return; }
  play($cur.get() || VARIANTS[0]);
}
function pick(v) { const was = $playing.get(); if (was) play(v); else $cur.set(v); }
function step(dir, manual = true) {
  const next = advance(VARIANTS.indexOf($cur.get()), VARIANTS.length, { step: dir, repeat: "all", manual });
  if (next < 0) return;
  const v = VARIANTS[next];
  if ($playing.get() || !manual) play(v); else $cur.set(v);
}
function seek(ms) { if (audio && !gate) audio.currentTime = ms / 1000; $pos.set(ms); }

// "У Фонотеку" — the edge makes this variant again straight into the person's shelf; nothing leaves the phone.
const $kept = atom({});   // variant → "" | "busy" | "done"
async function keep(v, link, toast, t) {
  if ($kept.get()[v]) return;
  $kept.set({ ...$kept.get(), [v]: "busy" });
  try {
    if (!gate) {
      const tags = $tags.get();
      const r = await fetch(`${VPS_PROXY}/library/keep`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link, v, genre: tags?.genre || "", vocal: tags?.vocal || "" }), signal: AbortSignal.timeout(CALL_MS) });
      if (!r.ok) throw new Error(String(r.status));
    }
    $kept.set({ ...$kept.get(), [v]: "done" });
    toast?.(T(t, "kept"));
  } catch { $kept.set({ ...$kept.get(), [v]: "" }); $err.set("errKeep"); }
}

export function remix({ S, toast }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const link = useStore($link), meta = useStore($meta), busy = useStore($busy), err = useStore($err);
  const ana = useStore($ana), tags = useStore($tags), tracks = useStore($tracks), cur = useStore($cur), kept = useStore($kept);
  const playing = useStore($playing), pos = useStore($pos), dur = useStore($dur);
  const input = useRef();
  useEffect(() => { if (!gate && !meta) input.current?.focus(); }, []);
  const paste = async () => {
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) { $link.set(text); find(text); } } catch { input.current?.focus(); }
  };
  const started = Object.keys(tracks).length > 0;
  const anyReady = VARIANTS.some((v) => tracks[v]?.state === "ready");
  const preset = (v) => ana?.presets?.[v];
  const words = ana ? whyKeys(ana.why).map((k) => T(t, k)) : [];

  return html`<div data-remix data-busy=${busy || null} data-song=${meta ? meta.id : null} data-playing=${playing ? "true" : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    <${Panel} title=${T(t, "link")}>
      <form class="flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); find(link); }}>
        <input ref=${input} data-link type="url" inputmode="url" autocomplete="off" spellcheck="false" enterkeyhint="go"
          class="input input-bordered sf-inset min-w-0 flex-1 h-[var(--ms-ctl)] font-mono text-sm"
          placeholder=${T(t, "linkPlaceholder")} value=${link}
          onInput=${(e) => { $link.set(e.target.value); if ($err.get()) $err.set(""); }} />
        <button type="button" data-paste aria-label=${T(t, "aPaste")} onClick=${paste}
          class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:clipboard-paste", "text-[length:var(--ms-icon)]")}</button>
        <button type="submit" data-find aria-label=${T(t, "aFind")} disabled=${!link || busy === "meta"}
          class="btn btn-primary btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 sf-e3">${Icon("lucide:search", "text-[length:var(--ms-icon)]")}</button>
      </form>
      ${err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}
    <//>

    ${busy === "meta" ? html`<${Panel} title=${T(t, "song")}>
      <div class="flex gap-[var(--ms-gap)] items-start">
        <div class="skeleton w-28 h-28 shrink-0 rounded-[var(--ms-r-in)]"></div>
        <div class="flex-1 flex flex-col gap-2 pt-1"><div class="skeleton h-5 w-3/4"></div><div class="skeleton h-4 w-1/2"></div><div class="skeleton h-4 w-16"></div></div>
      </div>
    <//>` : meta ? html`<${Panel} title=${T(t, "song")}>
      <div class="flex gap-[var(--ms-gap)] items-start">
        <div data-cover class="relative w-28 h-28 shrink-0 rounded-[var(--ms-r-in)] overflow-hidden sf-raised sf-e2 bg-base-200 flex items-center justify-center text-base-content/40">
          ${Icon("lucide:disc-3", "text-3xl")}
          ${meta.cover ? html`<img src=${meta.cover} alt="" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => { e.target.remove(); }} />` : null}
        </div>
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <div data-song-title class="font-semibold text-[length:var(--ms-title)] leading-tight break-words">${meta.title}</div>
          <div class="text-sm text-base-content/70 leading-snug break-words">${byline(meta)}</div>
          <div class="font-mono text-xs tabular-nums text-base-content/70">${clock(meta.duration)}</div>
        </div>
      </div>
      ${ana ? html`<div data-readout class="font-mono text-xs tabular-nums text-base-content/70 leading-relaxed text-balance">${[ana.bpm ? `${Math.round(ana.bpm)} BPM` : "", ...words].filter(Boolean).join(" · ")}</div>` : started ? html`<div class="skeleton h-3 w-2/3"></div>` : null}
      ${tags?.why ? html`<div data-why class="text-sm text-base-content/70 leading-snug">${tags.why}</div>` : null}
      ${!started ? html`<button data-mix onClick=${() => mix(link, meta, locale)}
        class="btn btn-primary w-full h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3">
        ${Icon("lucide:sparkles", "text-[length:var(--ms-icon)]")}<span>${T(t, "mix")}</span>
      </button>` : busy ? html`<div data-stage class="flex items-center gap-2 h-[var(--ms-ctl)] px-1 text-sm text-base-content/70 animate-pulse">
        ${Icon("lucide:hourglass", "text-[length:var(--ms-icon)]")}<span>${T(t, busy === "listen" ? "listening" : "mixing")}</span>
      </div>` : null}
    <//>` : null}

    ${started ? html`<${Panel} title=${T(t, "remixes")}>
      <div class="flex flex-col">
        ${VARIANTS.map((v) => {
          const st = tracks[v]?.state || "wait", p = preset(v), on = cur === v;
          return html`<div key=${v} data-track=${v} data-state=${st} class="flex items-center gap-2 border-b border-base-content/10 last:border-b-0 py-1">
            <button data-pick=${v} aria-pressed=${on ? "true" : "false"} aria-label=${`${T(t, "aPick")}: ${T(t, `v_${v}`)}`} disabled=${st !== "ready"}
              onClick=${() => pick(v)}
              class=${`flex-1 min-w-0 flex items-center gap-3 text-left rounded-[var(--ms-r-in)] px-2 h-[var(--ms-ctl)] min-h-0 ${on ? "sf-pressed" : ""} disabled:opacity-60`}>
              <span aria-hidden="true" class=${`w-2 h-2 shrink-0 rounded-full ${on ? "bg-[var(--app-accent)]" : "bg-base-content/20"}`}></span>
              <span class="min-w-0 flex-1 flex flex-col leading-tight">
                <span class="font-semibold text-sm truncate">${T(t, `v_${v}`)}</span>
                ${p ? html`<span class="flex flex-wrap gap-x-2 text-xs text-base-content/70 leading-snug"><span class="font-mono tabular-nums">${presetLine(p)}</span><span>${T(t, roomKey(p))}</span></span>`
                  : st === "err" ? html`<span class="text-xs text-error">${T(t, "failed")}</span>`
                  : html`<span class="skeleton h-3 w-28 mt-0.5"></span>`}
              </span>
            </button>
            <button data-keep=${v} aria-label=${T(t, kept[v] === "done" ? "keptA" : "aKeep")} disabled=${st !== "ready" || kept[v] === "busy"} onClick=${() => keep(v, link, toast, t)}
              class=${`btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ${kept[v] === "done" ? "text-primary" : "text-base-content/70"} ${kept[v] === "busy" ? "animate-pulse" : ""}`}>${Icon(kept[v] === "done" ? "lucide:library-big" : "lucide:library", "text-[length:var(--ms-icon)]")}</button>
            ${st === "ready" && !gate ? html`<a data-save=${v} href=${tracks[v].url} download=${remixFile(meta, v)} aria-label=${T(t, "aSave")}
                onClick=${() => toast?.(T(t, "saved"))} class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:download", "text-[length:var(--ms-icon)]")}</a>`
              : html`<button data-save=${v} aria-label=${st === "ready" ? T(t, "aSave") : T(t, st === "err" ? "failed" : "waiting")} disabled=${st !== "ready"}
                onClick=${() => toast?.(T(t, "saved"))} class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon(st === "ready" ? "lucide:download" : st === "err" ? "lucide:x" : "lucide:hourglass", "text-[length:var(--ms-icon)]")}</button>`}
          </div>`;
        })}
      </div>
      ${/* no title block: the picked row above already names the version — the same words twice is a caption */""}
      ${anyReady ? html`<${Transport} size="sm" locale=${locale} playing=${playing} onToggle=${toggle}
        onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek} />` : null}
    <//>` : null}
  </div>`;
}
