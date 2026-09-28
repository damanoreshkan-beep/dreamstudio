import { html } from "htm/preact";

export const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
export const LABEL = "font-mono text-[length:var(--ms-label)] tracking-wider";
export const CAPTION = "text-[length:var(--ms-label)] leading-tight text-center line-clamp-2";

const TONE = { ok: "text-success", warn: "text-warning", bad: "text-error" };
export function Field({ label, value, sub, mono, tone, wrap }) {
  return html`<div class="flex items-baseline gap-3 py-2 border-b border-base-content/10 last:border-0">
    <span class=${`${LABEL} uppercase text-muted w-24 shrink-0 truncate`}>${label}</span>
    <div class="min-w-0 flex-1">
      <!-- The wrap flag exists for the one value a person reads out loud: an address that ends in an
           ellipsis is not an address, and it cleared the reference device by two pixels. (No backticks in
           a comment inside a tagged template — they close the literal, as this one just did.) -->
      <div class=${`text-sm ${wrap ? "break-all" : "truncate"} ${mono ? "font-mono" : ""} ${TONE[tone] || ""}`}>${value}</div>
      ${sub ? html`<div class=${`${LABEL} text-muted truncate`}>${sub}</div>` : null}
    </div>
  </div>`;
}
