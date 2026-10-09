import { html } from "htm/preact";
import { useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { Panel } from "/_rt/ui.js";
import facts from "./facts.json" with { type: "json" };

export { iss } from "./track.js";
export { quakes } from "./quakes.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LIST = Object.entries(facts).map(([id, f]) => ({ id, ...f }));
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const iso = (flag) => Array.from(flag || "").map((ch) => { const n = ch.codePointAt(0) - 0x1F1E6; return n >= 0 && n < 26 ? String.fromCharCode(65 + n) : ""; }).join("");

export function globe({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(null);
  const f = sel ? facts[sel] : null;
  const ql = q.trim().toLowerCase();
  const matches = ql ? LIST.filter((c) => c.n.toLowerCase().includes(ql) || (c.nUk || "").toLowerCase().includes(ql)).slice(0, 6) : [];

  const pick = ({ id }) => { if (id && facts[id]) { setSel(id); setQ(""); } };
  const choose = (c) => { setSel(c.id); setQ(""); setFocus({ lat: c.ll[0], lon: c.ll[1] }); };

  const num = (n) => n == null ? "—" : Number(n).toLocaleString(loc === "uk" ? "uk-UA" : "en-US");
  const row = (icon, label, val) => val ? html`<div class="flex items-start gap-2.5 py-2"><span class="text-muted shrink-0 w-5 text-center mt-0.5">${Icon(icon)}</span><div class="min-w-0"><div class=${LABEL}>${T(t, label)}</div><div class="font-medium break-words">${val}</div></div></div>` : null;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-sel=${sel || ""} data-matches=${matches.length}>
    <${Globe} selected=${sel} focus=${focus} onPick=${pick} spin=${!sel} />

    <label class="input flex items-center gap-2 h-auto min-h-[var(--ms-ctl)] rounded-[var(--ms-r)]">${Icon("lucide:search", "text-lg text-muted")}<textarea rows="1" data-line enterkeyhint="search" id="country-search" class="grow leading-6 py-1.5 bg-transparent outline-none border-0" placeholder=${T(t, "search")} autocomplete="off" value=${q} onInput=${(e) => setQ(e.target.value)}></textarea></label>
    ${matches.length ? html`<div class="flex flex-col gap-1" id="matches">${matches.map((c) => html`<button class="btn btn-ghost btn-sm justify-start gap-2" data-id=${c.id} key=${c.id} onClick=${() => choose(c)}><span class=${`${LABEL} w-7 text-center shrink-0`}>${iso(c.flag)}</span>${c.n}</button>`)}</div>` : null}

    ${f
      ? html`<${Panel} data-facts=${sel}>
          <div class="flex items-center gap-3">
            ${""}
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
