import { html } from "htm/preact";
import { sealedFrameUrl } from "/_rt/sealedfetch.js";

export const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
export const framed = (u, ref) => sealedFrameUrl(u, ref);

export function openExternal(url) { if (url && typeof window !== "undefined") window.open(url, "_blank", "noopener"); }
export const openSite = (s) => openExternal(s.url);
