import { html } from "htm/preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { render } from "preact";

export function muzak({ S, toast }) {
  const t = S.t;
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError(null);
      if (text && /youtube|youtu\.be|music\.youtube/.test(text)) {
        fetchMeta(text);
      }
    } catch {
      setError(T(t, "errorNetworkError"));
    }
  };

  const fetchMeta = async (link) => {
    if (!link || !/youtube|youtu\.be|music\.youtube/.test(link)) {
      setError(T(t, "errorInvalidUrl"));
      return;
    }
    setLoading(true);
    setError(null);
    setMeta(null);
    try {
      const params = new URLSearchParams({ url: link });
      const res = await fetch(`/feed/music/metadata?${params}`);
      if (!res.ok) throw new Error(T(t, "errorMetaFailed"));
      const data = await res.json();
      setMeta(data);
    } catch (e) {
      setError(T(t, "errorMetaFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!url || !meta) return;
    setDownloading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ url });
      const res = await fetch(`/feed/music/download?${params}`, { method: "POST" });
      if (!res.ok) throw new Error(T(t, "errorDownloadFailed"));
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = dlUrl;
      a.download = `${meta.title || "song"}.mp3`;
      a.click();
      URL.revokeObjectURL(dlUrl);
      toast?.(T(t, "copied"));
    } catch (e) {
      setError(T(t, "errorDownloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return html`
    <div data-muzak class="min-h-screen">
      <div data-muzak-input>
        <input
          ref=${inputRef}
          type="text"
          placeholder=${T(t, "pasteUrl")}
          value=${url}
          onInput=${(e) => { setUrl(e.target.value); setError(null); }}
          onKeyPress=${(e) => e.key === "Enter" && fetchMeta(url)}
          class="input input-bordered w-full"
        />
        <button onClick=${handlePaste} class="btn btn-primary">
          ${T(t, "paste")}
        </button>
      </div>

      ${loading ? html`
        <div data-muzak-loading>
          <div data-muzak-spinner></div>
          <span>${T(t, "fetchingMeta")}</span>
        </div>
      ` : null}

      ${error ? html`
        <div class="alert alert-error">
          <span>${error}</span>
        </div>
      ` : null}

      ${meta && !loading ? html`
        <div data-muzak-meta>
          <div data-muzak-thumb>
            ${meta.thumbnail ? html`<img src=${meta.thumbnail} alt="thumbnail" />` : null}
          </div>
          <div data-muzak-info>
            <div data-muzak-title>${meta.title}</div>
            <div data-muzak-artist>${meta.artist}</div>
            <div data-muzak-stats>
              ${meta.duration ? html`<span>${Math.floor(meta.duration / 60)}:${String(meta.duration % 60).padStart(2, "0")}</span>` : null}
              ${meta.date ? html`<span>${meta.date}</span>` : null}
            </div>
            <button
              onClick=${handleDownload}
              disabled=${downloading}
              class="btn btn-accent mt-4 w-full"
            >
              ${downloading ? html`
                <span class="loading loading-spinner loading-sm"></span>
                ${T(t, "downloading")}
              ` : T(t, "download")}
            </button>
          </div>
        </div>
      ` : null}

      ${!meta && !loading && !url ? html`
        <div class="flex items-center justify-center h-64 text-muted">
          ${T(t, "empty")}
        </div>
      ` : null}
    </div>
  `;
}

(async () => {
  const { appState } = await import("/_rt/app.js");
  const S = appState();
  const toast = (msg) => console.log(msg);
  render(html`<${muzak} S=${S} toast=${toast} />`, document.querySelector("#app"));
  const boot = document.querySelector("#boot");
  if (boot) setTimeout(() => boot.classList.add("gone"), 100);
})();
