import { html } from "htm/preact";
import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T, sys } from "/_rt/i18n.js";
import { Sheet } from "/_rt/ui.js";
import { taskOne } from "/_rt/task.js";
import { shareFile, downloadBlob } from "/_rt/apk.js";
import { resolveSearch, buildSearchUrl } from "/_rt/urlquery.js";
import { siteName } from "/_rt/sitelabel.js";
import { Icon, openExternal } from "./util.js";
import { subscribe, $sessions, sessionKey, setSession, $sessSite } from "./store.js";
import { openAsSource } from "./feed.js";

export function SourceSheet({ S, t }) {
  const [val, setVal] = useState("");
  const [q, setQ] = useState("");
  const norm = () => {
    const u = val.trim().replace(/\s+/g, "");
    if (!u) return "";
    const withScheme = /^https?:\/\//i.test(u) ? u : "https://" + u.replace(/^\/+/, "");
    try { const url = new URL(withScheme); return url.hostname.includes(".") ? url.href : ""; } catch { return ""; }
  };
  const goto = (url) => openAsSource(S, url);
  const load = (e) => { e?.preventDefault?.(); const url = norm(); if (!url) return S.screen.set(null); goto(url); };
  const sr = resolveSearch(norm());
  const search = (e) => { e?.preventDefault?.(); const url = norm(), term = q.trim(); if (url && term) goto(buildSearchUrl(url, term)); };
  return html`<${Sheet} open onClose=${() => S.screen.set(null)} title=${T(t, "srcTitle")} icon="lucide:link">
    <form onSubmit=${load} class="flex flex-col gap-3">
      <label class="input flex items-center gap-2 rounded-2xl">
        ${Icon("lucide:globe", "opacity-50 shrink-0")}
        ${""}
        <input id="src-input" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" class="grow min-w-0" placeholder=${T(t, "srcPlaceholder")} aria-label=${T(t, "srcTitle")} value=${val} onInput=${(e) => setVal(e.target.value)} />
      </label>
      ${sr.searchable ? html`<div class="flex gap-2">
        <label class="input flex items-center gap-2 rounded-2xl flex-1">
          ${Icon("lucide:search", "opacity-50 shrink-0")}
          <input id="sheet-search" type="search" inputmode="search" autocomplete="off" class="grow min-w-0" placeholder=${T(t, "searchPh")} aria-label=${T(t, "search")} value=${q} onInput=${(e) => setQ(e.target.value)} />
        </label>
        <button type="button" class="btn btn-primary rounded-2xl gap-1 shrink-0" onClick=${search}>${Icon("lucide:search")} ${T(t, "search")}</button>
      </div>` : null}
      <button id="src-load" type="submit" class="btn btn-primary rounded-2xl gap-1">${Icon("lucide:play")} ${T(t, "load")}</button>
    </form>
  <//>`;
}

export function SessionSheet({ S, t, undo }) {
  const site = useStore($sessSite), sessions = useStore($sessions);
  const cur = sessions[sessionKey(site)] || "";
  const [val, setVal] = useState(cur);
  useEffect(() => { setVal(cur); }, [cur, site]);
  const close = () => S.screen.set(null);
  const save = (e) => { e?.preventDefault?.(); const next = val.trim(); if (!next) return; setSession(site, next); close(); };
  const forget = () => { undo(() => setSession(site, cur), siteName(site)); setSession(site, ""); close(); };
  return html`<${Sheet} open onClose=${close} title=${T(t, "sessTitle")} subtitle=${sessionKey(site)} icon="lucide:key-round">
    <form onSubmit=${save} class="flex flex-col gap-3">
      <textarea id="sess-input" rows="4" autocomplete="off" spellcheck="false" class="textarea rounded-2xl font-mono text-xs leading-snug w-full break-all" placeholder="name=value; name2=value2" aria-label=${T(t, "sessTitle")} value=${val} onInput=${(e) => setVal(e.target.value)}></textarea>
      <button id="sess-save" type="submit" class="btn btn-primary rounded-2xl gap-1" disabled=${!val.trim()}>${Icon("lucide:check")} ${T(t, "sessSave")}</button>
      ${cur ? html`<button type="button" data-sess-forget class="btn btn-ghost rounded-2xl gap-1 text-base-content/70" onClick=${forget}>${Icon("lucide:trash-2")} ${T(t, "sessForget")}</button>` : null}
    </form>
  <//>`;
}

const $busy = atom("");

const exportName = (item, ext) => `${(item?.title || "clip").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "clip"}.${ext}`;

async function exportClip({ item, format, mode, t, toast }) {
  const url = item?.orig || item?.video;
  if (!url || $busy.get()) return;
  $busy.set(`${format}-${mode}`);
  try {
    // The export is a TASK on the edge (rt/task.js): the download, the transcode and a file of up to ~27 MB no
    // longer hang on one connection — a dead zone costs a pause, and the file resumes by byte range.
    const r = await taskOne("/clip/task", { url, page: item.page || null, format });
    if (r.status !== "done") { toast?.(r.error ? `${T(t, "expFail")}: ${r.error}` : T(t, "expFail")); return; }
    const blob = r.blob;
    const name = exportName(item, format);
    if (mode === "share") {
      const how = await shareFile(blob, name);
      if (how === "saved") toast?.(T(t, "expSaved"));
    } else {
      downloadBlob(blob, name);
      toast?.(T(t, "expSaved"));
    }
  } catch (e) {
    toast?.(e?.status && e.message ? `${T(t, "expFail")}: ${e.message}` : T(t, "expFail"));
  } finally {
    $busy.set("");
  }
}

export function MoreSheet({ S, t, item, src, title, subbed, toast }) {
  const page = item?.page || item?.orig || item?.video || "";
  const busy = useStore($busy), loc = useStore(S.locale);
  const close = () => S.screen.set(null);
  const row = "btn btn-ghost justify-start gap-3 rounded-2xl w-full font-normal";
  const pair = (format, icon, label) => html`<div class="flex items-center gap-3 px-4 py-1 rounded-2xl">
    ${Icon(icon, "text-lg opacity-70 shrink-0")}
    <span class="flex-1 min-w-0 truncate">${label}</span>
    ${[["save", "lucide:download"], ["share", "lucide:share-2"]].map(([mode, icon]) => {
      const key = `${format}-${mode}`;
      return html`<button data-exp=${key} class=${`btn btn-sm btn-circle btn-ghost border border-base-content/15${busy === key ? " btn-active" : ""}`} disabled=${!!busy}
        aria-label=${`${T(t, mode === "save" ? "expSave" : "expShare")}: ${label}`}
        onClick=${() => exportClip({ item, format, mode, t, toast })}>${Icon(icon)}</button>`;
    })}
  </div>`;
  return html`<${Sheet} open onClose=${close} title=${T(t, "more")} icon="lucide:ellipsis">
    <div class="flex flex-col gap-2">
      ${item ? html`<${Fragment}>
        ${pair("gif", "lucide:image", T(t, "expGif"))}
        ${pair("mp4", "lucide:video", T(t, "expVideo"))}
        ${""}
        ${busy ? html`<div data-exp-busy class="text-xs text-muted px-4">${T(t, "expBusy")} ${T(t, busy.startsWith("mp4") ? "expVideo" : "expGif")}</div>` : null}
        <div class="h-px bg-base-content/10 my-1"></div>
      </${Fragment}>` : null}
      ${""}
      <button data-clean class=${row} onClick=${() => { close(); S.clean.set(true); }}>${Icon("lucide:maximize-2", "text-lg opacity-70")}${sys("clean", loc)}</button>
      ${!subbed ? html`<button data-subscribe class=${row} onClick=${() => { subscribe({ name: title, url: src }); close(); }}>${Icon("lucide:plus", "text-lg opacity-70")}${T(t, "sub")}</button>` : null}
      ${""}
      ${page ? html`<button data-open-page class=${row} onClick=${() => { close(); openExternal(page); }}>${Icon("lucide:external-link", "text-lg opacity-70")}${T(t, "openBrowser")}</button>` : null}
    </div>
  <//>`;
}
