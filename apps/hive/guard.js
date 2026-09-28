import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { guardScore, GUARD } from "/_rt/radar.js";
import { useField, $scanning, $fix, Icon, labelOf } from "./store.js";
import { ScanButton } from "./scan.js";

export function guardView({ S, t }) {
  const field = useField(S);
  const scanning = useStore($scanning);
  const fix = useStore($fix);

  const scored = field
    .filter((d) => d.kind === "ble")
    .map((d) => ({ d, s: guardScore({ sightings: d.sightings, separated: !!d.cls?.separated, classifiable: !!d.cls?.classifiable }) }))
    .sort((a, b) => b.s.confidence - a.s.confidence);
  const flagged = scored.filter((x) => x.s.meets);

  return html`<div class="flex flex-col gap-[var(--ms-gap)]">
    <${Panel} title=${T(t, "guard")}>
      <div class="flex items-center gap-[var(--ms-gap)]"><${ScanButton} t=${t} /></div>
      ${""}
      <div data-policy class="text-[length:var(--ms-label)] text-base-content/70">
        ${T(t, "policy")
          .replace("{n}", GUARD.minSightings)
          .replace("{min}", Math.round(GUARD.minSpanMs / 60000))
          .replace("{m}", GUARD.minDisplacementM)}
      </div>
    <//>

    ${flagged.length ? html`<${Panel} title=${T(t, "possible")}>
      ${flagged.map(({ d }) => html`<div key=${d.addr} data-flag=${d.addr} class="flex items-center gap-3">
        ${Icon("lucide:shield-alert", "text-[length:var(--ms-icon)] text-[var(--app-accent)] shrink-0")}
        <span class="flex-1 min-w-0">
          <span class="block truncate">${labelOf(d, t)}</span>
          <span class="block font-mono text-[length:var(--ms-label)] text-base-content/70">${T(t, "separatedNow")}</span>
        </span>
      </div>`)}
    <//>` : null}

    <${Panel} title=${T(t, "watching")}>
      <div data-live class="flex flex-col gap-2">
        ${scored.length === 0 ? html`<div class="text-base-content/70 text-sm">${T(t, "nothingYet")}</div>` : null}
        ${scored.slice(0, 12).map(({ d, s }) => html`<div key=${d.addr} data-watch=${d.addr} class="flex items-start gap-3">
          <span class="font-mono tabular-nums text-[length:var(--ms-label)] text-base-content/70 w-10 shrink-0">
            ${Math.round(s.confidence * 100)}%
          </span>
          <span class="flex-1 min-w-0">
            <span class="flex items-center gap-2 min-w-0">
              <span class="truncate">${labelOf(d, t)}</span>
              ${
                d.cls?.separated ? html`<span data-sep=${d.addr}
                  class="shrink-0 font-mono uppercase tracking-wide text-[length:var(--ms-label)] px-1.5 rounded-full border border-[var(--app-accent)] text-base-content">
                  ${T(t, "sepTag")}</span>` : null}
            </span>
            ${""}
            <span class="block font-mono text-[length:var(--ms-label)] text-base-content/70">
              ${s.reasons.length ? s.reasons.map((r) => T(t, "why_" + r)).join(" · ") : T(t, "allMet")}
            </span>
          </span>
        </div>`)}
      </div>
    <//>

    ${!fix && scanning && !gate ? html`<div data-nofix class="text-[length:var(--ms-label)] text-base-content/70">${T(t, "needFix")}</div>` : null}
  </div>`;
}
