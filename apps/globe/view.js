// Глобус — the explore consumer of the systemic /_rt/globe.js component: spin the Earth, tap or search a
// country, read its facts (bundled facts.json, offline). The globe itself (drag/spin/tap/geo) is runtime,
// so the same component powers the sun compass's "pick a location" screen.
import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { Panel } from "/_rt/ui.js";
import facts from "./facts.json" with { type: "json" };

// Three views, one earth. iss and quakes were separate apps that each mounted this same Globe component and
// differed only in what they plot on it — a satellite, live seismicity, the countries themselves. They keep
// their own modules (the layers are genuinely independent) and the runtime resolves each tab's `view`
// against this file's exports.
export { iss } from "./track.js";
export { quakes } from "./quakes.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LIST = Object.entries(facts).map(([id, f]) => ({ id, ...f }));
// `length:` — a bare var() in text-[…] reads as a COLOUR to Tailwind v4 and the size falls back to the parent's
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
// facts.json carries each flag as a regional-indicator pair. The farm renders no emoji, so the pair is decoded
// back into the ISO 3166-1 alpha-2 code it encodes (U+1F1E6 is "A") and set in mono — the data stays as is.
const iso = (flag) => Array.from(flag || "").map((ch) => { const n = ch.codePointAt(0) - 0x1F1E6; return n >= 0 && n < 26 ? String.fromCharCode(65 + n) : ""; }).join("");

export function globe({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [sel, setSel] = useState(null);      // selected ccn3
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(null);  // {lat,lon} to fly to
  const f = sel ? facts[sel] : null;
  const ql = q.trim().toLowerCase();
  const matches = ql ? LIST.filter((c) => c.n.toLowerCase().includes(ql) || (c.nUk || "").toLowerCase().includes(ql)).slice(0, 6) : [];

  const pick = ({ id }) => { if (id && facts[id]) { setSel(id); setQ(""); } };                 // tap on the globe
  const choose = (c) => { setSel(c.id); setQ(""); setFocus({ lat: c.ll[0], lon: c.ll[1] }); };  // pick from search → fly

  const num = (n) => n == null ? "—" : Number(n).toLocaleString(loc === "uk" ? "uk-UA" : "en-US");
  const row = (icon, label, val) => val ? html`<div class="flex items-start gap-2.5 py-2"><span class="text-muted shrink-0 w-5 text-center mt-0.5">${Icon(icon)}</span><div class="min-w-0"><div class=${LABEL}>${T(t, label)}</div><div class="font-medium break-words">${val}</div></div></div>` : null;

  // The globe is its own invitation (it spins until a country is picked), so nothing captions it below.
  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-sel=${sel || ""} data-matches=${matches.length}>
    <${Globe} selected=${sel} focus=${focus} onPick=${pick} spin=${!sel} />

    <label class="input flex items-center gap-2 h-[var(--ms-ctl)] rounded-[var(--ms-r)]">${Icon("lucide:search", "text-lg text-muted")}<input id="country-search" type="search" class="grow" placeholder=${T(t, "search")} autocomplete="off" value=${q} onInput=${(e) => setQ(e.target.value)} /></label>
    ${matches.length ? html`<div class="flex flex-col gap-1" id="matches">${matches.map((c) => html`<button class="btn btn-ghost btn-sm justify-start gap-2" data-id=${c.id} key=${c.id} onClick=${() => choose(c)}><span class=${`${LABEL} w-7 text-center shrink-0`}>${iso(c.flag)}</span>${c.n}</button>`)}</div>` : null}

    ${f
      ? html`<${Panel} data-facts=${sel}>
          <div class="flex items-center gap-3">
            ${/* the country's code sits in a well — a mark in mono where the flag emoji used to be */""}
            <span class="w-11 h-11 shrink-0 rounded-[var(--ms-r-in)] sf-inset grid place-items-center font-mono font-semibold tracking-wider">${iso(f.flag)}</span>
            <div class="min-w-0"><div class="font-bold text-lg leading-tight break-words">${f.n}</div><div class="text-sm text-muted">${f.reg}${f.sub ? " · " + f.sub : ""}</div></div>
          </div>
          <div class="divide-y divide-base-300/40">
            ${row("lucide:landmark", "fCapital", f.cap)}
            ${row("lucide:users", "fPopulation", num(f.pop))}
            ${row("lucide:ruler", "fArea", f.area ? num(f.area) + " km²" : null)}
            ${row("lucide:languages", "fLang", f.langs)}
            ${row("lucide:coins", "fCurrency", f.cur)}
          </div>
        <//>`
      : null}
  </div>`;
}
