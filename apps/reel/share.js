import { useEffect } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { shell } from "/_rt/shell.js";
import { openAsSource } from "./feed.js";

const SHARE_KEYS = ["sh_url", "sh_text", "sh_title"];
const LINK_RE = /https?:\/\/[^\s<>"']+/i;
const BARE_RE = /(?:^|[\s("'])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/i;
function sharedHref(raw) {
  try {
    const u = new URL(String(raw).trim().replace(/[.,;:!?)\]'"]+$/, ""));
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return "";
    if (typeof location !== "undefined" && u.origin === location.origin) return "";
    return u.href;
  } catch { return ""; }
}
function sharedUrl(p) {
  const fields = [p?.url, p?.text, p?.title].filter((s) => typeof s === "string" && s.trim());
  for (const s of fields) { const m = s.match(LINK_RE); if (m) { const u = sharedHref(m[0]); if (u) return u; } }
  for (const s of fields) { const m = s.match(BARE_RE); if (m) { const u = sharedHref("https://" + m[1]); if (u) return u; } }
  return "";
}

let APP = null, TOAST = null, waiting = null;
function shareIn(payload) { waiting = payload; flushShare(); }
function flushShare() {
  if (!APP || !waiting) return;
  const p = waiting; waiting = null;
  const url = sharedUrl(p);
  if (url) openAsSource(APP, url);
  else TOAST?.(T(APP.t.get(), "shareNoLink"));
}
export function useShareIntake(S, toast) {
  useEffect(() => { APP = S; TOAST = toast; flushShare(); }, [S, toast]);
}

if (typeof location !== "undefined") {
  const u = new URL(location.href);
  if (SHARE_KEYS.some((k) => u.searchParams.has(k))) {
    shareIn({ url: u.searchParams.get("sh_url"), text: u.searchParams.get("sh_text"), title: u.searchParams.get("sh_title") });
    for (const k of SHARE_KEYS) u.searchParams.delete(k);
    const q = u.searchParams.toString();
    try { window.history.replaceState(null, "", u.pathname + (q ? `?${q}` : "") + u.hash); } catch { }
  }
}

if (shell.has("share.target")) {
  shell.call("share.target", { kinds: ["text"] }).catch(() => { });
  shell.subscribe("share.incoming", {}, (f) => { if (f?.text) shareIn({ text: f.text }); });
}
