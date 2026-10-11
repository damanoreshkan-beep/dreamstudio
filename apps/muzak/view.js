import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Panel } from "/_rt/ui.js";
import { takeShared, firstLink } from "/_rt/share.js";
import { videoId, clock, byline, errorKey, FIXTURE_LINK, FIXTURE_META, FIXTURE_LIKES } from "/_rt/muzak.js";
import { taskOne, taskCall } from "/_rt/task.js";
import { openOutside } from "/_rt/tma.js";
import { session, restore } from "/_rt/auth.js";

const Icon = (icon, cls = "") => html`<iconify-icon icon=${icon} class=${cls}></iconify-icon>`;
const $link = atom(gate ? FIXTURE_LINK : "");
const $meta = atom(gate ? FIXTURE_META : null);
const $busy = atom("");        // "" | "meta" | "file"
const $err = atom("");
let seq = 0;
// A link shared from another app (the OS share sheet, spec.share) is the whole gesture: it lands in the field and is looked up at once.
takeShared((s) => { const link = firstLink(s) || String(s.text || "").trim(); if (link) { $link.set(link); find(link); } });

async function find(link) {
  const id = videoId(link);
  if (!id) { $err.set("errLink"); $meta.set(null); return; }
  const my = ++seq;
  $err.set(""); $busy.set("meta");
  if (gate) { $meta.set(FIXTURE_META); $busy.set(""); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/music/meta?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(40000) });
    if (my !== seq) return;
    if (!r.ok) { $meta.set(null); const k = errorKey(r.status); if (k) $err.set(k); return; }
    $meta.set(await r.json());
  } catch { if (my === seq) { $meta.set(null); $err.set("errMeta"); } }
  finally { if (my === seq) $busy.set(""); }
}

async function save(link, meta, toast, t) {
  if ($busy.get()) return;
  $err.set(""); $busy.set("file");
  try {
    if (gate) { toast?.(T(t, "saved")); return; }
    // a TASK on the edge (rt/task.js, the weak-link transport): yt-dlp runs to the end, the mp3 arrives by byte range
    if (!(await mp3(link, meta))) { $err.set("errFile"); return; }
    toast?.(T(t, "saved"));
  } catch (e) { const k = e?.status ? errorKey(e.status) : ""; $err.set(k && k !== "errMeta" ? k : "errFile"); }
  finally { $busy.set(""); }
}

// One song → its mp3 on the phone: a TASK on the edge (rt/task.js, the weak-link transport) — yt-dlp runs to the
// end, the file arrives by byte range — then saved through an <a download>. Both tabs download through here.
async function mp3(link, meta) {
  const r = await taskOne("/music/filetask", { url: link });
  if (r.status !== "done") return false;
  const name = `${[meta.artist, meta.title].filter(Boolean).join(" - ") || meta.id}.mp3`.replace(/[\\/:*?"<>|]/g, "");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(r.blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return true;
}

// "У Фонотеку" — the edge downloads the song again straight into the person's shelf (library.js keep); no upload.
const $kept = atom("");   // "" | "busy" | "done"
async function keep(link, toast, t) {
  if ($kept.get()) return;
  $kept.set("busy"); $err.set("");
  try {
    if (!gate) await taskCall("/library/keeptask", { url: link });   // a task: the shelf fills whatever the link does
    $kept.set("done"); toast?.(T(t, "kept"));
  } catch { $kept.set(""); $err.set("errKeep"); }
}

export function muzak({ S, toast }) {
  const t = useStore(S.t);
  const kept = useStore($kept);
  const link = useStore($link), meta = useStore($meta), busy = useStore($busy), err = useStore($err);
  const input = useRef();
  useEffect(() => { if (!gate && !meta) input.current?.focus(); }, []);

  const paste = async () => {
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) { $link.set(text); find(text); } } catch { input.current?.focus(); }
  };

  return html`<div data-muzak data-busy=${busy || null} data-song=${meta ? meta.id : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    <${Panel} title=${T(t, "link")}>
      <form class="flex items-center gap-2" onSubmit=${(e) => { e.preventDefault(); find(link); }}>
        <textarea rows="1" data-line ref=${input} data-link inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"
          class="input input-bordered sf-inset min-w-0 flex-1 font-mono text-sm"
          placeholder=${T(t, "linkPlaceholder")} value=${link}
          onInput=${(e) => { $link.set(e.target.value); if ($err.get()) $err.set(""); }}></textarea>
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
          ${Icon("lucide:music-2", "text-3xl")}
          ${meta.cover ? html`<img src=${meta.cover} alt="" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => { e.target.remove(); }} />` : null}
        </div>
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <div data-song-title class="font-semibold text-[length:var(--ms-title)] leading-tight break-words">${meta.title}</div>
          <div class="text-sm text-base-content/70 leading-snug break-words">${byline(meta)}</div>
          <div class="font-mono text-xs tabular-nums text-base-content/70">${clock(meta.duration)}</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button data-save disabled=${busy === "file"} onClick=${() => save(link, meta, toast, t)}
          class=${`btn btn-primary flex-1 min-w-0 h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3 ${busy === "file" ? "animate-pulse" : ""}`}>
          ${Icon(busy === "file" ? "lucide:hourglass" : "lucide:download", "text-[length:var(--ms-icon)]")}<span>${T(t, busy === "file" ? "preparing" : "download")}</span>
        </button>
        <button data-keep aria-label=${T(t, kept === "done" ? "keptA" : "aKeep")} disabled=${kept === "busy"} onClick=${() => keep(link, toast, t)}
          class=${`btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ${kept === "done" ? "text-primary" : "text-base-content/70"} ${kept === "busy" ? "animate-pulse" : ""}`}>${Icon(kept === "done" ? "lucide:library-big" : "lucide:library", "text-[length:var(--ms-icon)]")}</button>
      </div>
    <//>` : null}
  </div>`;
}

// ── «Вподобане»: the songs a person liked on YouTube (edge yt.js) ─────────────────────────────────────────────
// Owner 2026-10-10: any Google account, the liked songs as a list with links, each downloaded by its own tap —
// never all at once, so one song is prepared at a time and every other download button waits for it.
const $likes = atom(gate ? FIXTURE_LIKES : null);   // null = not read | { connected: false[, expired] } | { connected, channel, songs, next }
const $lBusy = atom("");                            // "" | "list" | "more" | "connect"
const $lErr = atom("");
const $dl = atom("");                               // the id of the ONE song being prepared
let back = false;                                   // the connect left for another app (Telegram, the APK's browser)

// Google returns the person to /muzak/?tab=likes&yt=ok|denied|fail: the word is read once and taken off the address.
try {
  const u = new URL(location.href), k = u.searchParams.get("yt");
  if (k) {
    if (k !== "ok") $lErr.set(k === "denied" ? "ytDenied" : "ytFail");
    u.searchParams.delete("yt");
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  }
} catch { }

const yt = (route, body = {}) => fetch(`${VPS_PROXY}/google/yt/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
const ytErr = async (r) => ((await r.json().catch(() => ({}))).error === "quota" ? "errQuota" : "errLikes");

async function readLikes(more = false) {
  if (gate || $lBusy.get()) return;
  const was = more ? $likes.get() : null;
  $lBusy.set(more ? "more" : "list");
  try {
    let songs = was?.songs || [], page = was?.next || "", j = null;
    // 50 likes can hold no song at all (vlogs, hour-long mixes): a tap reads on until it has something new
    for (let i = 0; i < 4; i++) {
      const r = await yt("likes", page ? { page } : {});
      if (!r.ok) { if (r.status === 401) $likes.set({ connected: false }); else $lErr.set(await ytErr(r)); return; }
      j = await r.json();
      if (!j.connected) { $likes.set(j); return; }
      const seen = new Set(songs.map((s) => s.id));
      songs = [...songs, ...j.songs.filter((s) => !seen.has(s.id))];
      page = j.next || "";
      if (songs.length > (was?.songs.length || 0) || !page) break;
    }
    $likes.set({ ...j, songs, next: page || null });
  } catch { $lErr.set("errLikes"); }
  finally { $lBusy.set(""); }
}

async function connect() {
  if (gate || $lBusy.get()) return;
  $lErr.set(""); $lBusy.set("connect");
  try {
    const r = await yt("start");
    if (!r.ok) { if (r.status !== 401) $lErr.set("ytFail"); return; }   // 401: the runtime's sign-in wall is already up
    back = openOutside((await r.json()).url) !== "page";
  } catch { $lErr.set("ytFail"); }
  finally { $lBusy.set(""); }
}

async function disconnect(toast, t) {
  if (!gate) { const r = await yt("revoke").catch(() => null); if (!r?.ok) { $lErr.set("errLikes"); return; } }
  $likes.set({ connected: false });
  toast?.(T(t, "ytOff"));
}

async function fetchSong(s, toast, t) {
  if ($dl.get()) return;
  $dl.set(s.id); $lErr.set("");
  try {
    if (!gate && !(await mp3(s.url, s))) { $lErr.set("errFile"); return; }
    toast?.(T(t, "saved"));
  } catch (e) { $lErr.set(e?.status === 429 ? "errBusy" : "errFile"); }
  finally { $dl.set(""); }
}

export function likes({ S, toast, confirm }) {
  const t = useStore(S.t);
  const sid = useStore(session)?.sid || "";
  const l = useStore($likes), busy = useStore($lBusy), err = useStore($lErr), dl = useStore($dl);
  // the session is restored lazily in the runtime (the account card does it); this tab needs it at once, and a
  // signed-out restore spends no network. Signing in later (the wall a connect tap raises) re-reads through `user`.
  useEffect(() => { if (!gate) restore().then((s) => { if (!s) $likes.set({ connected: false }); }).catch(() => {}); }, []);
  useEffect(() => { if (sid && !gate) readLikes(); }, [sid]);   // the sid, not the object: restore sets it twice (cached, then revalidated)
  // back from Telegram's browser or the APK's: the grant was made over there, so read the list again here
  useEffect(() => {
    const on = () => { if (back && document.visibilityState === "visible") { back = false; readLikes(); } };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  const open = (s) => { $link.set(s.url); find(s.url); S.tab.set("song"); };
  const askOff = () => confirm({ title: T(t, "offTitle"), body: T(t, "offBody"), verb: T(t, "offYes"), onConfirm: () => disconnect(toast, t) });
  const on = !!l?.connected;
  const reading = !gate && !!sid && l === null;

  return html`<div data-likes data-connected=${on ? "true" : l ? "false" : null} data-songs=${on ? l.songs.length : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
    ${err ? html`<div data-err role="alert" class="text-sm text-error">${T(t, err)}</div>` : null}

    ${reading ? [0, 1, 2, 3].map((i) => html`<div key=${i} class="flex items-center gap-3 px-1 py-1.5"><div class="skeleton w-12 h-12 shrink-0 rounded-[var(--ms-r-in)]"></div><div class="flex-1 flex flex-col gap-1.5"><div class="skeleton h-3.5 w-2/3"></div><div class="skeleton h-3 w-1/3"></div></div></div>`)

    : !on ? html`<${Panel} title=${T(t, "likesTitle")}>
      <div data-connect class="flex flex-col gap-3">
        <p class="text-sm leading-relaxed text-base-content/80">${T(t, l?.expired ? "ytExpired" : "connectBody")}</p>
        <button data-yt-connect disabled=${busy === "connect"} onClick=${connect}
          class=${`btn btn-primary w-full h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3 ${busy === "connect" ? "animate-pulse" : ""}`}>
          ${Icon("lucide:heart", "text-[length:var(--ms-icon)]")}<span>${T(t, busy === "connect" ? "connecting" : "connect")}</span>
        </button>
        <p class="text-xs leading-relaxed text-base-content/70">${T(t, "connectNote")}</p>
      </div>
    <//>`

    : html`<section aria-labelledby="mz-likes" class="flex flex-col gap-[var(--ms-gap)]">
      <div class="flex items-center justify-between gap-3">
        <h2 id="mz-likes" class="min-w-0 truncate font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70">${l.channel ? T(t, "ytAs", { name: l.channel }) : T(t, "likesTitle")}</h2>
        <button data-yt-off onClick=${askOff} class="btn btn-ghost btn-sm shrink-0 min-h-0 h-8 px-2 text-xs font-normal text-base-content/70">${T(t, "ytOffBtn")}</button>
      </div>
      <div class="flex flex-col gap-1">
        ${l.songs.map((s) => html`<div key=${s.id} data-like=${s.id} class="flex items-center gap-1">
          <button data-open=${s.id} aria-label=${`${T(t, "aOpen")}: ${s.title}`} onClick=${() => open(s)}
            class="flex-1 min-w-0 flex items-center gap-3 text-left px-1 py-1.5 min-h-0 rounded-[var(--ms-r-in)] ms-press">
            <span class="relative w-12 h-12 shrink-0 rounded-[var(--ms-r-in)] overflow-hidden sf-raised bg-base-200 flex items-center justify-center text-base-content/40">
              ${Icon("lucide:music-2", "text-lg")}
              ${s.cover ? html`<img src=${s.cover} alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => { e.target.remove(); }} />` : null}
            </span>
            <span class="min-w-0 flex-1 flex flex-col leading-tight gap-0.5">
              <span class="font-semibold text-sm truncate">${s.title}</span>
              <span class="text-xs text-base-content/70 truncate">${s.artist}<span class="font-mono tabular-nums"> · ${clock(s.dur)}</span></span>
            </span>
          </button>
          <button data-dl=${s.id} aria-label=${`${T(t, "download")}: ${s.title}`} disabled=${!!dl && dl !== s.id} onClick=${() => fetchSong(s, toast, t)}
            class=${`btn btn-ghost btn-circle shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] min-h-0 ${dl === s.id ? "text-primary animate-pulse" : "text-base-content/70"}`}>
            ${Icon(dl === s.id ? "lucide:hourglass" : "lucide:download", "text-[length:var(--ms-icon)]")}
          </button>
        </div>`)}
      </div>
      ${!l.songs.length ? html`<div data-none class="py-6 flex flex-col items-center gap-1 text-center">
        <div class="font-semibold text-sm">${T(t, "likesEmpty")}</div><div class="text-sm text-base-content/70">${T(t, "likesEmptyHint")}</div>
      </div>` : null}
      ${l.next ? html`<button data-more disabled=${busy === "more"} onClick=${() => readLikes(true)}
        class=${`btn rounded-full sf-raised self-center h-[var(--ms-ctl)] min-h-0 px-5 gap-2 font-medium ms-press ${busy === "more" ? "animate-pulse" : ""}`}>
        ${Icon("lucide:chevrons-down", "text-[length:var(--ms-icon)]")}<span>${T(t, "more")}</span>
      </button>` : null}
    </section>`}
  </div>`;
}
