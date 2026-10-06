import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { atom } from "nanostores";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { Panel } from "/_rt/ui.js";
import { takeShared, firstLink } from "/_rt/share.js";
import { videoId, clock, byline, errorKey, FIXTURE_LINK, FIXTURE_META } from "/_rt/muzak.js";

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
    const r = await fetch(`${VPS_PROXY}/music/file?url=${encodeURIComponent(link)}`, { signal: AbortSignal.timeout(200000) });
    if (!r.ok) { const k = errorKey(r.status); if (k) $err.set(k === "errMeta" ? "errFile" : k); return; }
    const blob = await r.blob();
    const name = `${[meta.artist, meta.title].filter(Boolean).join(" - ") || meta.id}.mp3`.replace(/[\\/:*?"<>|]/g, "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast?.(T(t, "saved"));
  } catch { $err.set("errFile"); }
  finally { $busy.set(""); }
}

export function muzak({ S, toast }) {
  const t = useStore(S.t);
  const link = useStore($link), meta = useStore($meta), busy = useStore($busy), err = useStore($err);
  const input = useRef();
  useEffect(() => { if (!gate && !meta) input.current?.focus(); }, []);

  const paste = async () => {
    try { const text = (await navigator.clipboard.readText()).trim(); if (text) { $link.set(text); find(text); } } catch { input.current?.focus(); }
  };

  return html`<div data-muzak data-busy=${busy || null} data-song=${meta ? meta.id : null} class="flex flex-col gap-[var(--ms-gap)] p-[var(--ms-pad)]">
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
          ${Icon("lucide:music-2", "text-3xl")}
          ${meta.cover ? html`<img src=${meta.cover} alt="" class="absolute inset-0 w-full h-full object-cover" onError=${(e) => { e.target.remove(); }} />` : null}
        </div>
        <div class="min-w-0 flex-1 flex flex-col gap-1">
          <div data-song-title class="font-semibold text-[length:var(--ms-title)] leading-tight break-words">${meta.title}</div>
          <div class="text-sm text-base-content/70 leading-snug break-words">${byline(meta)}</div>
          <div class="font-mono text-xs tabular-nums text-base-content/70">${clock(meta.duration)}</div>
        </div>
      </div>
      <button data-save disabled=${busy === "file"} onClick=${() => save(link, meta, toast, t)}
        class=${`btn btn-primary w-full h-[var(--ms-ctl)] min-h-0 gap-2 sf-e3 ${busy === "file" ? "animate-pulse" : ""}`}>
        ${Icon(busy === "file" ? "lucide:hourglass" : "lucide:download", "text-[length:var(--ms-icon)]")}<span>${T(t, busy === "file" ? "preparing" : "download")}</span>
      </button>
    <//>` : null}
  </div>`;
}
