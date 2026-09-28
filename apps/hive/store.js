import { html } from "htm/preact";
import { useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { shell, ERR } from "/_rt/shell.js";
import { gate } from "/_rt/gate.js";
import { signalPercent, orderDevices } from "/_rt/radar.js";

export const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

const SEEN_MS = 20_000;
export const RADIO_MS = 30_000;

export const KIND_ICON = { ble: "lucide:bluetooth", wifi: "lucide:wifi", lte: "lucide:radio-tower" };
const KINDS = ["ble", "wifi", "lte"];

export const $devices = atom(new Map());
export const $scanning = atom(false);
export const $err = atom(null);
export const $target = atom(null);
export const $roseAt = atom(0);
export const $fix = atom(null);
export const $now = atom(Date.now());
export const $oui = atom(null);
export const $copied = atom(null);
export const $look = atom(null);

/**
 * The one ordered, filtered view of the field — the grid and the list both read it, so they can never
 * describe different things. Nothing ages under the gate: the mocked subscribe emits once, so a decay
 * there would empty the screen rather than reflect a radio.
 */
export function useField(S) {
  const map = useStore($devices);
  const now = useStore($now);
  const f = useStore(S.filters);
  const kinds = Array.isArray(f?.kinds) ? f.kinds : KINDS;
  const sort = typeof f?.sort === "string" ? f.sort : "seen";
  return useMemo(() => {
    const live = [...map.values()].filter((d) =>
      (gate || d.kind !== "ble" || now - d.at < SEEN_MS) && kinds.includes(d.kind));
    return orderDevices(live, sort).map((d) => ({ ...d, percent: signalPercent(d.smooth ?? d.rssi, d.kind) }));
  }, [map, now, kinds.join(","), sort]);
}

export const labelOf = (d, t) => d.name || (d.kind === "wifi" ? T(t, "hidden") : T(t, "unnamed"));

export function Reason({ t }) {
  const err = useStore($err);
  const why = shell.whyCapability("ble");
  if (!err && !why) return null;
  const key = why === ERR.staleBridge ? "needsNewer"
    : why ? "needsShell"
    : err === ERR.denied ? "denied"
    : /scanFailed:6/.test(String(err)) ? "tooOften"
    : err === ERR.unavailable ? "radioOff" : "failed";
  return html`<div data-reason class="text-[length:var(--ms-label)] text-error">${T(t, key)}</div>`;
}

/** Per-radio tally — the "mark BLE, Wi-Fi and cell separately" requirement, as one readable row. */
export function Legend({ t, field }) {
  return html`<div data-legend class="flex items-center gap-3 min-w-0 overflow-hidden">
    ${KINDS.map((k) => {
      const n = field.filter((d) => d.kind === k).length;
      return html`<span key=${k} data-legend-kind=${k} class="flex items-center gap-1 min-w-0">
        ${Icon(KIND_ICON[k], `text-[length:var(--ms-icon)] shrink-0 ${k === "ble" ? "text-[var(--app-accent)]" : "text-base-content/70"}`)}
        <span class="font-mono tabular-nums text-[length:var(--ms-label)] ${n ? "text-base-content" : "text-muted"}">${n}</span>
      </span>`;
    })}
  </div>`;
}
