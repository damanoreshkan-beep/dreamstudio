import { html } from "htm/preact";
import { useEffect } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Panel, Transport } from "/_rt/ui.js";
import { advance } from "/_rt/player.js";
import { holdAudio } from "/_rt/mediasession.js";
import { sealedUrl } from "/_rt/sealedfetch.js";
import { authWall } from "/_rt/authwall.js";
import { takeShared } from "/_rt/share.js";
import { clock } from "/_rt/muzak.js";
import { isAudio, songLine, usageLine, titleOf, errorKey, FIXTURE_SONGS, FIXTURE_USAGE } from "/_rt/fonoteka.js";

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
const $songs = atom(gate ? FIXTURE_SONGS : null);   // null until the shelf is read
const $usage = atom(gate ? FIXTURE_USAGE : null);
const $uploads = atom([]);                           // [{ k, name, state: "up" | "err" }]
const $err = atom("");
const $cur = atom("");
const $playing = atom(false);
const $pos = atom(0), $dur = atom(0);
let audio = null, hold = null, loaded = gate;

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const r = await fetch(`${VPS_PROXY}/library/list`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(20000) });
    if (!r.ok) { if (r.status !== 401) $err.set("errList"); $songs.set([]); return; }
    const j = await r.json();
    $songs.set(j.songs || []);
    $usage.set({ count: j.count, bytes: j.bytes, maxFiles: j.maxFiles, maxBytes: j.maxBytes });
  } catch { $err.set("errList"); $songs.set([]); }
}

// A file share lands here (sh_files): every song is uploaded as it is, raw, on a sealed URL that carries the session.
let toastFn = null, tNow = null;
takeShared((s) => { for (const f of s.files || []) { if (isAudio(f)) upload(f); else toastFn?.(T(tNow, "skipped")); } });

async function upload(f) {
  const k = `${Date.now()}-${f.name}`;
  $uploads.set([{ k, name: f.name, state: "up" }, ...$uploads.get()]);
  $err.set("");
  if (gate) { $uploads.set($uploads.get().filter((u) => u.k !== k)); return; }
  try {
    const r = await fetch(await sealedUrl("/library/put", { n: f.name }), { method: "POST", headers: { "content-type": f.type || "audio/mpeg" }, body: f, signal: AbortSignal.timeout(110000) });
    if (!r.ok) {
      if (r.status === 401) authWall.set(authWall.get() + 1);
      const why = (await r.json().catch(() => null))?.error;
      const key = errorKey(r.status, why); if (key) $err.set(key);
      $uploads.set($uploads.get().map((u) => (u.k === k ? { ...u, state: "err" } : u)));
      return;
    }
    const row = await r.json();
    $songs.set([row, ...($songs.get() || [])]);
    const u = $usage.get(); if (u) $usage.set({ ...u, count: u.count + 1, bytes: u.bytes + row.size });
    $uploads.set($uploads.get().filter((x) => x.k !== k));
    toastFn?.(T(tNow, "uploaded"));
  } catch { $err.set("errUpload"); $uploads.set($uploads.get().map((u) => (u.k === k ? { ...u, state: "err" } : u))); }
}

// ── one element, the shelf as its queue ──────────────────────────────────────────────────────────────────
function ensure() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "metadata";
  audio.addEventListener("timeupdate", () => $pos.set(Math.round(audio.currentTime * 1000)));
  audio.addEventListener("durationchange", () => $dur.set(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0));
  audio.addEventListener("play", () => { $playing.set(true); hold?.setPlaying(); });
  audio.addEventListener("pause", () => { $playing.set(false); hold?.setPaused(); });
  audio.addEventListener("ended", () => step(1, false));
  return audio;
}
const songOf = (id) => ($songs.get() || []).find((s) => s.id === id);
async function play(id) {
  const s = songOf(id);
  if (!s) return;
  if (gate) { $cur.set(id); $playing.set(true); $dur.set(Math.round(s.dur * 1000)); return; }
  const a = ensure();
  if ($cur.get() !== id || !a.src) { a.src = await sealedUrl("/library/get", { id }); $pos.set(0); }
  $cur.set(id);
  if (!hold) hold = holdAudio({ title: titleOf(s), artist: s.artist || "", onPlay: () => a.play(), onPause: () => a.pause(), onPrev: () => step(-1), onNext: () => step(1) });
  else hold.meta(titleOf(s));
  a.play().catch(() => $playing.set(false));
}
function toggle() {
  if ($playing.get()) { if (gate) $playing.set(false); else audio?.pause(); return; }
  const id = $cur.get() || ($songs.get() || [])[0]?.id;
  if (id) play(id);
}
function step(dir, manual = true) {
  const list = $songs.get() || [];
  const next = advance(list.findIndex((s) => s.id === $cur.get()), list.length, { step: dir, repeat: "all", manual });
  if (next >= 0) play(list[next].id);
}
function seek(ms) { if (audio && !gate) audio.currentTime = ms / 1000; $pos.set(ms); }
function stop() { if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } $cur.set(""); $playing.set(false); $pos.set(0); $dur.set(0); }

async function remove(s) {
  if (!gate) {
    const r = await fetch(`${VPS_PROXY}/library/del`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }), signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (!r || !r.ok) { $err.set("errDelete"); return; }
  }
  if ($cur.get() === s.id) stop();
  $songs.set(($songs.get() || []).filter((x) => x.id !== s.id));
  const u = $usage.get(); if (u) $usage.set({ ...u, count: Math.max(0, u.count - 1), bytes: Math.max(0, u.bytes - s.size) });
  toastFn?.(T(tNow, "deleted"));
}

export function fonoteka({ S, toast, confirm }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const songs = useStore($songs), usage = useStore($usage), uploads = useStore($uploads), err = useStore($err);
  const cur = useStore($cur), playing = useStore($playing), pos = useStore($pos), dur = useStore($dur);
  toastFn = toast; tNow = t;
  useEffect(() => { load(); }, []);
  const now = cur ? songOf(cur) : null;
  const askDelete = (s) => confirm({ title: T(t, "delTitle"), body: T(t, "delBody"), verb: T(t, "delYes"), onConfirm: () => remove(s) });

  return html`<div data-fonoteka data-playing=${playing ? "true" : null} data-songs=${songs ? songs.length : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    <${Panel} title=${T(t, "now")}>
      <${Transport} size="sm" locale=${locale} playing=${playing} onToggle=${toggle} disabled=${!songs?.length}
        onPrev=${() => step(-1)} onNext=${() => step(1)} pos=${pos} dur=${dur} onSeek=${seek}
        title=${now ? titleOf(now) : T(t, "nothing")} subtitle=${now ? (now.artist || clock(now.dur)) : null} />
    <//>

    <${Panel} title=${T(t, "songs")}>
      ${usage ? html`<div data-usage class="font-mono text-xs tabular-nums text-base-content/70">${usageLine(usage, { songs: T(t, "wSongs"), of: T(t, "wOf") })}</div>` : null}
      ${err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}
      <div class="flex flex-col">
        ${uploads.map((u) => html`<div key=${u.k} data-upload data-state=${u.state} class=${`flex items-center gap-3 border-b border-base-content/10 py-1 px-2 h-[var(--ms-ctl)] ${u.state === "up" ? "animate-pulse" : ""}`}>
          ${Icon(u.state === "up" ? "lucide:hourglass" : "lucide:x", `text-[length:var(--ms-icon)] ${u.state === "err" ? "text-error" : "text-base-content/70"}`)}
          <span class="min-w-0 flex-1 flex flex-col leading-tight"><span class="font-semibold text-sm truncate">${u.name}</span><span class="text-xs text-base-content/70">${T(t, u.state === "up" ? "uploading" : "errUpload")}</span></span>
        </div>`)}
        ${songs === null ? [0, 1, 2].map((i) => html`<div key=${i} class="flex items-center gap-3 py-1 px-2 h-[var(--ms-ctl)]"><div class="skeleton w-2 h-2 rounded-full"></div><div class="flex-1 flex flex-col gap-1.5"><div class="skeleton h-3.5 w-2/3"></div><div class="skeleton h-3 w-1/3"></div></div></div>`)
          : songs.map((s) => {
            const on = cur === s.id;
            return html`<div key=${s.id} data-song=${s.id} class="flex items-center gap-2 border-b border-base-content/10 last:border-b-0 py-1">
              <button data-play=${s.id} aria-pressed=${on ? "true" : "false"} aria-label=${`${T(t, "aPlay")}: ${titleOf(s)}`} onClick=${() => (on ? toggle() : play(s.id))}
                class=${`flex-1 min-w-0 flex items-center gap-3 text-left rounded-[var(--ms-r-in)] px-2 h-[var(--ms-ctl)] min-h-0 ${on ? "sf-pressed" : ""}`}>
                <span aria-hidden="true" class=${`w-2 h-2 shrink-0 rounded-full ${on ? "bg-[var(--app-accent)]" : "bg-base-content/20"}`}></span>
                <span class="min-w-0 flex-1 flex flex-col leading-tight">
                  <span class="font-semibold text-sm truncate">${titleOf(s)}</span>
                  <span class="font-mono text-xs tabular-nums text-base-content/70 truncate">${songLine(s, clock)}</span>
                </span>
              </button>
              <button data-del=${s.id} data-haptic="bump" aria-label=${`${T(t, "aDelete")}: ${titleOf(s)}`} onClick=${() => askDelete(s)}
                class="btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 text-base-content/70">${Icon("lucide:trash-2", "text-[length:var(--ms-icon)]")}</button>
            </div>`;
          })}
        ${songs && !songs.length && !uploads.length ? html`<div data-empty class="py-6 flex flex-col items-center gap-2 text-center text-base-content/70">
          ${Icon("lucide:library", "text-3xl")}<div class="font-semibold text-sm text-base-content">${T(t, "empty")}</div><div class="text-sm">${T(t, "emptyHint")}</div>
        </div>` : null}
      </div>
    <//>
  </div>`;
}
