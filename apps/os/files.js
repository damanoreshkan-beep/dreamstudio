import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { Icon, LABEL } from "./ui.js";

const $fs = atom({ open: false, root: null, trail: [], entries: [], preview: null, busy: false, error: "" });
const setFs = (patch) => $fs.set({ ...$fs.get(), ...patch });

const fsDepth = (fs) => Math.max(0, fs.trail.length - 1) + (fs.preview ? 1 : 0);
const syncStack = (S) => {
  const want = fsDepth($fs.get());
  if (S.stack.get().length !== want) S.stack.set(Array.from({ length: want }, (_, i) => `fs${i}`));
};

const FILE_ICON = (mime, dir) => {
  if (dir) return "lucide:folder";
  const m = mime || "";
  if (m.startsWith("image/")) return "lucide:image";
  if (m.startsWith("audio/")) return "lucide:file-audio";
  if (m.startsWith("video/")) return "lucide:file-video";
  if (m.startsWith("text/") || m.includes("json") || m.includes("xml")) return "lucide:file-text";
  if (m.includes("zip") || m.includes("compressed")) return "lucide:file-archive";
  if (m.includes("pdf")) return "lucide:file-type";
  return "lucide:file";
};

const KB = 1024;
const size = (n, loc) => {
  if (!n) return "";
  const u = n < KB ? [n, "B"] : n < KB * KB ? [n / KB, "KB"] : [n / KB / KB, "MB"];
  return `${u[0].toLocaleString(loc, { maximumFractionDigits: u[0] < 10 && u[1] !== "B" ? 1 : 0 })} ${u[1]}`;
};

const ordered = (entries, loc) => [...entries].sort((a, b) =>
  a.dir === b.dir ? a.name.localeCompare(b.name, loc) : (a.dir ? -1 : 1));

const bytesOf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const previewable = (mime) => (mime || "").startsWith("image/")
  || (mime || "").startsWith("text/") || (mime || "").includes("json") || (mime || "").includes("xml");

async function fsOpenFolder(S, root, trail) {
  setFs({ open: true, root, trail, preview: null, busy: true, error: "" });
  syncStack(S);
  try {
    const r = await shell.call("files.list", { uri: root.uri, docId: trail[trail.length - 1].docId });
    setFs({ entries: r.entries || [], busy: false });
  } catch (e) {
    setFs({ entries: [], busy: false, error: e?.code || String(e) });
  }
}

async function fsEnterRoot(S, root) {
  await fsOpenFolder(S, root, [{ docId: null, name: root.name }]);
}

async function fsGrant(S) {
  setFs({ busy: true, error: "" });
  try {
    const r = await shell.call("files.grant", {});
    if (r?.granted) { await fsEnterRoot(S, { uri: r.uri, name: r.name }); return; }
    setFs({ busy: false });
  } catch (e) { setFs({ busy: false, error: e?.code || String(e) }); }
}

function Explorer({ S, t, loc, toast }) {
  const fs = useStore($fs);
  const [roots, setRoots] = useState(null);

  const loadRoots = async () => {
    try {
      const r = await shell.call("files.roots", {});
      const list = r.roots || [];
      setRoots(list);
      if (list.length === 1) await fsEnterRoot(S, list[0]);
    } catch { setRoots([]); }
  };
  useEffect(() => { if (fs.open && !fs.root) loadRoots(); }, [fs.open, fs.root]);

  const enter = async (e) => {
    if (e.dir) { await fsOpenFolder(S, fs.root, [...fs.trail, { docId: e.docId, name: e.name }]); return; }
    setFs({ busy: true, error: "" });
    try {
      const r = await shell.call("files.read", { uri: fs.root.uri, docId: e.docId });
      const bytes = bytesOf(r.base64);
      const text = (e.mime || "").startsWith("image/") ? null : new TextDecoder().decode(bytes);
      const src = (e.mime || "").startsWith("image/") ? `data:${e.mime};base64,${r.base64}` : null;
      setFs({ busy: false, preview: { name: e.name, mime: e.mime, bytes: r.bytes, base64: r.base64, text, src } });
      syncStack(S);
    } catch (e2) { setFs({ busy: false, error: e2?.code === ERR.failed ? e2.detail : (e2?.code || String(e2)) }); }
  };

  const saveLog = async () => {
    try {
      const r = await shell.call("system.logs", {});
      const body = (r.lines || []).join("\n");
      const b64 = btoa(unescape(encodeURIComponent(body)));
      const at = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const out = await shell.call("files.write", {
        uri: fs.root.uri, docId: fs.trail[fs.trail.length - 1].docId,
        name: `microspec-${at}.log`, mime: "text/plain", base64: b64,
      });
      toast?.(`${T(t, "fsSaved")} · ${size(out.bytes, loc)}`);
      await fsOpenFolder(S, fs.root, fs.trail);
    } catch (e) { toast?.(e?.code || String(e)); }
  };

  const share = async (p) => {
    try {
      await shell.call("files.share", { name: p.name, mime: p.mime || "application/octet-stream", base64: p.base64 });
    } catch (e) { toast?.(e?.code || String(e)); }
  };

  if (fs.preview) {
    const p = fs.preview;
    return html`<${Panel}>
      <div data-fs-preview class="flex flex-col gap-2 pt-1">
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm min-w-0 flex-1 truncate">${p.name}</span>
          <button data-fs-share class="btn btn-xs btn-ghost btn-circle shrink-0"
              aria-label=${T(t, "fsShare")} onClick=${() => share(p)}>
            ${Icon("lucide:share-2", "text-base")}
          </button>
        </div>
        <div class=${`${LABEL} text-muted`}>${p.mime || "?"} · ${size(p.bytes, loc)}</div>
        ${""}
        ${p.src ? html`<img src=${p.src} alt=${p.name} class="w-full rounded-[var(--ms-r-in)] bg-base-200" />`
          : p.text != null ? html`<pre class="font-mono text-xs whitespace-pre-wrap break-all rounded-[var(--ms-r-in)] sf-inset p-3">${p.text}</pre>`
          : html`<div class="text-sm text-muted">${T(t, "fsNoPreview")}</div>`}
      </div>
    <//>`;
  }

  if (!fs.root) {
    return html`<${Panel} title=${T(t, "fsTitle")}>
      <div data-fs-roots class="flex flex-col gap-2 pt-1">
        ${(roots || []).map((r) => html`<button key=${r.uri} data-fs-root=${r.name}
            class="flex items-center gap-3 py-2.5 border-b border-base-content/10 last:border-0 text-left"
            onClick=${() => fsEnterRoot(S, r)}>
          ${Icon("lucide:folder", "text-xl text-primary shrink-0")}
          <span class="min-w-0 flex-1 truncate">${r.name}</span>
          ${Icon("lucide:chevron-right", "text-base text-muted shrink-0")}
        </button>`)}
        <button id="fs-grant" data-fs-grant class="btn btn-sm btn-primary rounded-full w-full gap-2 mt-1"
            disabled=${fs.busy} onClick=${() => fsGrant(S)}>
          ${Icon("lucide:folder-plus")}<span>${T(t, "fsGrant")}</span>
        </button>
        ${fs.error ? html`<div class="text-sm text-error">${fs.error}</div>` : null}
      </div>
    <//>`;
  }

  const trail = fs.trail.length <= 2
    ? fs.trail.map((f) => f.name).join(" / ")
    : `… / ${fs.trail.slice(-2).map((f) => f.name).join(" / ")}`;
  return html`<${Panel}>
    <div class="flex items-center gap-2 pb-1">
      <span data-fs-trail class="font-mono text-sm min-w-0 flex-1 truncate">${trail}</span>
      <button class="btn btn-xs btn-ghost btn-circle shrink-0" aria-label=${T(t, "fsSaveLog")} onClick=${saveLog}>
        ${Icon("lucide:save", "text-base")}
      </button>
      <button class="btn btn-xs btn-ghost btn-circle shrink-0" aria-label=${T(t, "fsGrant")} onClick=${() => fsGrant(S)}>
        ${Icon("lucide:folder-plus", "text-base")}
      </button>
    </div>
    <div data-fs-list>
      ${fs.error ? html`<div class="py-3 text-sm text-error">${fs.error}</div>` : null}
      ${!fs.error && !fs.busy && !fs.entries.length ? html`<div class="py-3 text-sm text-muted">${T(t, "fsEmpty")}</div>` : null}
      ${ordered(fs.entries, loc).map((e) => html`<button key=${e.docId} data-fs-entry=${e.name}
          class="flex items-center gap-3 py-2.5 w-full border-b border-base-content/10 last:border-0 text-left"
          onClick=${() => enter(e)}>
        ${Icon(FILE_ICON(e.mime, e.dir), `text-xl shrink-0 ${e.dir ? "text-primary" : "text-muted"}`)}
        <span class="min-w-0 flex-1 truncate">${e.name}</span>
        ${e.dir ? Icon("lucide:chevron-right", "text-base text-muted shrink-0")
          : html`<span class=${`${LABEL} tabular-nums text-muted shrink-0`}>${size(e.size, loc)}</span>`}
      </button>`)}
    </div>
  <//>`;
}

export function files({ S, t, toast }) {
  const loc = useStore(S.locale);
  useEffect(() => {
    setFs({ open: true });
    syncStack(S);
    return () => { if (S.stack.get().length) S.stack.set([]); };
  }, []);

  useEffect(() => S.stack.listen((v) => {
    const cur = $fs.get();
    const now = v?.length || 0;
    if (now >= fsDepth(cur)) return;
    if (cur.preview) { setFs({ preview: null }); return; }
    fsOpenFolder(S, cur.root, cur.trail.slice(0, Math.max(1, now + 1)));
  }), []);

  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1"><${Explorer} S=${S} t=${t} loc=${loc} toast=${toast} /></div>`;
}
