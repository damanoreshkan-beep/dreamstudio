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
import { report } from "/_rt/telemetry.js";
import { VARIANTS, remixFile, roomKey, presetLine, whyKeys, parseTags, groundSong, errorKey, FIXTURE_LINK, FIXTURE_META, FIXTURE_ANALYSIS, FIXTURE_TAGS } from "/_rt/remix.js";
import { startTask, followTask, fetchResumable, taskKey } from "/_rt/task.js";

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
// The task's stages, in order, as the edge reports them (rt/task.js): the step track fills left to right.
const STAGES = ["listen", "fetch", "measure", "mix"];
const STAGE_UI = { listen: ["lucide:ear", "listening"], fetch: ["lucide:cloud-download", "stageFetch"], measure: ["lucide:audio-waveform", "stageMeasure"], mix: ["lucide:sparkles", "mixing"] };
// iconify fetches an icon the first time it is shown, and the worker caches it — so a dead zone cannot draw an
// icon it never saw online (measured: the offline line kept the sparkles icon). These are drawn, unseen, from the tap on.
const LATER_ICONS = ["lucide:wifi-off", "lucide:audio-lines", "lucide:arrow-down-to-line", "lucide:x", ...Object.values(STAGE_UI).map(([i]) => i)];
const $link = atom(gate ? FIXTURE_LINK : "");
const $meta = atom(gate ? FIXTURE_META : null);
const $busy = atom("");          // "" | "meta" | "listen" | "fetch" | "measure" | "mix" — the task's own stages
const $offline = atom(!gate && globalThis.navigator?.onLine === false);   // a dead zone: the mix waits, it does not fail
if (!gate) { addEventListener("offline", () => $offline.set(true)); addEventListener("online", () => $offline.set(false)); }
const $err = atom("");
// Under the gate the song is already mixed: the store card and the shots show the whole screen, not its first step.
const MIXED = Object.fromEntries(VARIANTS.map((v) => [v, { state: "ready" }]));
const $ana = atom(gate ? FIXTURE_ANALYSIS : null);   // the edge's analysis: bpm, density…, presets, why
const $tags = atom(gate ? FIXTURE_TAGS : null);      // the AI's genre / vocal / why
const $tracks = atom(gate ? MIXED : {});             // variant → { state: "wait"|"render"|"dl"|"ready"|"err", pct?, url? }
const $cur = atom(gate ? VARIANTS[0] : "");          // the variant in the transport
const $playing = atom(false);
const $pos = atom(0), $dur = atom(0);
let seq = 0, audio = null, run = null;   // run: the AbortController of the mix in flight
const CALL_MS = 110_000;         // /library/keep only — the edge answers inside nginx's 120 s
takeShared((s) => { const link = firstLink(s) || String(s.text || "").trim(); if (link) { $link.set(link); find(link); } });

function reset() { run?.abort(); run = null; stop(); $ana.set(null); $tags.set(null); for (const t of Object.values($tracks.get())) if (t.url) URL.revokeObjectURL(t.url); $tracks.set({}); $cur.set(""); }

async function find(link) {
  const id = videoId(link);
  if (!id) { report("link.reject", { link: String(link || "").slice(0, 120) }, "info"); $err.set("errLink"); $meta.set(null); reset(); return; }
  const my = ++seq;
  $err.set(""); $busy.set("meta"); reset();
  if (gate) { $meta.set(FIXTURE_META); $busy.set(""); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/music/meta?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(40000) });
    if (my !== seq) return;
    if (!r.ok) { report("meta.fail", { status: r.status }); $meta.set(null); const k = errorKey(r.status); if (k) $err.set(k); return; }
    $meta.set(await r.json());
  } catch (e) { report("meta.throw", { err: String(e?.message || e).slice(0, 120) }); if (my === seq) { $meta.set(null); $err.set("errMeta"); } }
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
  // The remix is a TASK on the edge (rt/task.js): started once, it runs to the end whatever the link does; its
  // events arrive by offset and each file by byte range, so a dead zone costs a pause, never the remix. Files
  // come one at a time in the order they land, so the first version plays while the others are on the way.
  const ac = run = new AbortController(), signal = ac.signal;
  const fail = (status) => { const k = errorKey(status); $err.set(k === "errMeta" ? "errMix" : k); $tracks.set({}); $busy.set(""); };
  const mark = (v, t) => { if (my === seq) $tracks.set({ ...$tracks.get(), [v]: t }); };
  let files = Promise.resolve();
  try {
    const { id } = await startTask("/music/task", { url: link, genre: tags?.genre || "", vocal: tags?.vocal || "", k: taskKey() }, { signal });
    await followTask(id, (ev) => {
      if (my !== seq) return;
      if (ev.t === "stage") $busy.set(ev.s === "measure" ? "measure" : "fetch");
      else if (ev.t === "analysis") { $ana.set(ev); $busy.set("mix"); }
      else if (ev.t === "render") mark(ev.v, { state: "render" });
      else if (ev.t === "ready") { mark(ev.v, { state: "queued" }); files = files.then(async () => {
        try {
          let pct = 0;
          mark(ev.v, { state: "dl", pct });
          const onProgress = (got, total) => { const p = total ? Math.min(100, Math.floor(got * 100 / total)) : 0; if (p !== pct) { pct = p; mark(ev.v, { state: "dl", pct }); } };
          const url = URL.createObjectURL(await fetchResumable(`${VPS_PROXY}/task/${id}/${ev.v}`, { signal, size: ev.bytes, onProgress }));
          if (my !== seq) { URL.revokeObjectURL(url); return; }
          mark(ev.v, { state: "ready", url });
          if (!$cur.get()) $cur.set(ev.v);
        } catch (e) { if (!signal.aborted) { report("remix.fail", { v: ev.v, status: e?.status, err: String(e?.message || e).slice(0, 120) }); mark(ev.v, { state: "err" }); } }
      }); }
      else if (ev.t === "fail" && ev.v) { report("remix.fail", { v: ev.v, err: String(ev.error || "").slice(0, 120) }); mark(ev.v, { state: "err" }); }
      else if (ev.t === "fail") { report("task.fail", { status: ev.status, err: String(ev.error || "").slice(0, 120) }); fail(ev.status); }
    }, { signal });
    await files;
  } catch (e) {
    if (signal.aborted || my !== seq) return;
    report("task.throw", { status: e?.status, err: String(e?.message || e).slice(0, 120) });
    fail(e?.status);
    return;
  }
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
  const playing = useStore($playing), pos = useStore($pos), dur = useStore($dur), offline = useStore($offline);
  const input = useRef();
  useEffect(() => { if (!gate && !meta) input.current?.focus(); }, []);
  const paste = async () => {
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) { $link.set(text); find(text); } else report("paste.empty", null, "info"); }
    catch (e) { report("paste.fail", { err: String(e?.name || e).slice(0, 60) }); input.current?.focus(); }
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
      </button>` : busy ? (() => {
        const i = Math.max(0, STAGES.indexOf(busy));
        const [ic, key] = offline ? ["lucide:wifi-off", "offlineWait"] : STAGE_UI[STAGES[i]];
        return html`<div data-stage=${offline ? "offline" : STAGES[i]} role="status" class="relative flex flex-col gap-2 px-1">
          <span aria-hidden="true" class="absolute w-px h-px overflow-hidden opacity-0 pointer-events-none">${LATER_ICONS.map((ic) => Icon(ic))}</span>
          <div class=${`flex items-center gap-2 min-h-[var(--ms-ctl)] text-sm ${offline ? "text-warning" : "text-base-content/70"}`}>
            ${Icon(ic, `shrink-0 text-[length:var(--ms-icon)] ${offline ? "" : "animate-pulse"}`)}<span class="flex-1 leading-snug">${T(t, key)}</span>
            <span class="shrink-0 font-mono text-xs tabular-nums text-base-content/50">${i + 1}/${STAGES.length}</span>
          </div>
          <div aria-hidden="true" class="grid grid-cols-4 gap-1">${STAGES.map((s, k) => html`<span key=${s}
            class=${`h-1 rounded-full transition-colors duration-500 ${k < i ? "bg-[var(--app-accent)]" : k === i ? `bg-[var(--app-accent)] ${offline ? "opacity-40" : "animate-pulse"}` : "bg-base-content/15"}`}></span>`)}</div>
        </div>`;
      })() : null}
    <//>` : null}

    ${started ? html`<${Panel} title=${T(t, "remixes")}>
      <div class="flex flex-col">
        ${VARIANTS.map((v) => {
          const st = tracks[v]?.state || "wait", p = preset(v), on = cur === v, pct = tracks[v]?.pct || 0;
          return html`<div key=${v} data-track=${v} data-state=${st} class="relative flex items-center gap-2 border-b border-base-content/10 last:border-b-0 py-1">
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
              : html`<button data-save=${v} aria-label=${st === "ready" ? T(t, "aSave") : st === "dl" ? `${T(t, "receiving")} ${pct}%` : T(t, st === "err" ? "failed" : st === "render" ? "rendering" : "waiting")} disabled=${st !== "ready"}
                onClick=${() => toast?.(T(t, "saved"))} class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${st === "dl"
                  ? html`<span class="font-mono text-[11px] tabular-nums text-base-content">${pct}%</span>`
                  : Icon({ ready: "lucide:download", err: "lucide:x", render: "lucide:audio-lines", queued: "lucide:arrow-down-to-line" }[st] || "lucide:hourglass", `text-[length:var(--ms-icon)] ${st === "render" ? "animate-pulse" : ""}`)}</button>`}
            ${/* the row's divider is its progress, in the stage track's language: pulsing = rendering on the edge, filling = arriving */""}
            ${st === "render" ? html`<span data-progress="render" aria-hidden="true" class="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--app-accent)] animate-pulse"></span>`
              : st === "dl" ? html`<progress data-progress="dl" aria-hidden="true" max="100" value=${pct} class="progress absolute inset-x-0 -bottom-px h-0.5 rounded-none text-[var(--app-accent)]"></progress>` : null}
          </div>`;
        })}
      </div>
      ${/* no title block: the picked row above already names the version — the same words twice is a caption */""}
      ${anyReady ? html`<${Transport} size="sm" locale=${locale} playing=${playing} onToggle=${toggle}
        onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek} />` : null}
    <//>` : null}
  </div>`;
}
