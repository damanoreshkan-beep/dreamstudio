import { html } from "htm/preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Sheet, Segmented } from "/_rt/ui.js";
import { Scramble } from "/_rt/skeleton.js";
import { gate } from "/_rt/gate.js";
import { KMH, compass8 } from "/_rt/ride.js";
import { FACES, SKINS } from "./faces.js";
import { $on, $trip, $lean, $err, $over, $skin, $limit, $seen, start, stop, loadDays } from "./engine.js";
export { motoLog } from "./log.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70 truncate";
const CELL = "min-w-0 rounded-[var(--ms-r-in)] sf-inset px-2.5 py-2 flex flex-col gap-1 @max-[20rem]:flex-row @max-[20rem]:items-center @max-[20rem]:justify-between @max-[20rem]:gap-2 @max-[20rem]:py-1.5";
const VALUE = "text-xl @max-[20rem]:text-base font-bold tabular-nums leading-none truncate flex items-center gap-1.5";
const SUB = "text-xs text-base-content/70 tabular-nums truncate flex items-center gap-1 min-h-4 @max-[20rem]:hidden";
const HEAD = ["hN", "hNE", "hE", "hSE", "hS", "hSW", "hW", "hNW"];
const LIMITS = ["0", "50", "90", "110", "130"];
const HUD_INK = "#FFB23E";
const clock = (loc) => (gate ? "10:08" : new Date().toLocaleTimeString(loc === "uk" ? "uk-UA" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }));
const deg = (v) => `${Math.round(Math.abs(v))}°`;

function LeanCell({ t }) {
  const l = useStore($lean);
  return html`<div class=${CELL} data-lean=${l.deg == null ? "" : Math.round(l.deg)}>
    <div class=${LABEL}>${T(t, "lean")}</div>
    <div class=${VALUE}>
      ${l.deg == null ? null : html`<svg viewBox="0 0 24 24" class="w-5 h-5 shrink-0" aria-hidden="true">
        <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="transition-transform duration-150 motion-reduce:transition-none"
          style=${`transform-origin:12px 12px;transform:rotate(${l.deg.toFixed(1)}deg)`} />
      </svg>`}
      <span class="truncate">${l.deg == null ? "—" : deg(l.deg)}</span>
    </div>
    <div class=${SUB}>${Icon("lucide:chevron-left", "shrink-0")}${deg(l.maxL)}<span class="opacity-50">·</span>${deg(l.maxR)}${Icon("lucide:chevron-right", "shrink-0")}</div>
  </div>`;
}

export function motoRide({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale), screen = useStore(S.screen);
  const on = useStore($on), trip = useStore($trip), err = useStore($err), over = useStore($over);
  const skin = useStore($skin), limit = Number(useStore($limit)) || 0;
  const [, tick] = useState(0);
  useEffect(() => { loadDays(); const id = setInterval(() => tick((n) => n + 1), 20000); return () => clearInterval(id); }, []);

  const sprint = trip.sprint.last, told = useRef(sprint);
  useEffect(() => {
    if (sprint != null && sprint !== told.current) toast?.(T(t, "sprintToast", { s: sprint.toFixed(1) }));
    told.current = sprint;
  }, [sprint]);

  const Face = FACES[skin] || FACES.classic, hud = skin === "hud";
  const kmh = on && trip.v != null ? trip.v * KMH : null;
  const close = () => S.screen.set(null);
  const go = () => { if (on) stop(); else if (!$seen.get()) S.screen.set("notice"); else start(); };
  const ride = () => { $seen.set("1"); close(); start(); };

  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side" style="--ms-side-stage:clamp(38%,calc(100% - 16rem),56%)" data-moto=${skin} data-on=${on ? "1" : "0"} data-over=${over ? "1" : "0"}>
    <div data-stage-box class=${`relative flex-1 min-h-0 rounded-[var(--ms-r)] overflow-hidden ${hud ? "bg-black" : "sf-inset text-base-content"}`} style=${hud ? `color:${HUD_INK}` : null}>
      <div class="absolute inset-0 p-[var(--ms-pad)]" data-live=${kmh != null ? "" : null}>
        <${Face} kmh=${kmh} limit=${limit} unit=${T(t, "unitKmh")} over=${over} />
      </div>
      ${over ? html`<div aria-hidden="true" class="absolute inset-0 rounded-[var(--ms-r)] border-[6px] border-error animate-pulse motion-reduce:animate-none pointer-events-none"></div>` : null}
      ${on && kmh == null ? html`<div class="absolute inset-x-0 bottom-2 px-3 flex justify-center text-sm pointer-events-none">
        ${err ? html`<span data-gps="err" class="text-error flex items-center gap-1.5 min-w-0">${Icon("lucide:satellite", "shrink-0")}<span class="truncate">${T(t, err === "denied" ? "noPerm" : "noGps")}</span></span>`
          : html`<span data-gps="wait" class="flex items-center gap-1.5 min-w-0">${Icon("lucide:satellite", "shrink-0")}<${Scramble} text=${T(t, "locating")} /></span>`}
      </div>` : null}
    </div>

    <div class="ms-side-main shrink-0 flex flex-col gap-[var(--ms-gap)]">
      <div class="@container"><div class="grid grid-cols-3 @max-[20rem]:grid-cols-1 gap-[var(--ms-gap)]">
        <${LeanCell} t=${t} />
        <div class=${CELL} data-today>
          <div class=${LABEL}>${T(t, "today")}</div>
          <div class=${VALUE}><span class="truncate">${(trip.dist / 1000).toFixed(1)}</span><span class="font-mono text-[length:var(--ms-label)] font-normal text-base-content/70 shrink-0">${T(t, "unitKm")}</span></div>
          <div class=${SUB}>${T(t, "max")} ${Math.round(trip.max * KMH)}</div>
        </div>
        <div class=${CELL} data-course>
          <div class=${LABEL}>${T(t, "course")}</div>
          <div class=${VALUE}><span class="truncate">${on && trip.heading != null ? T(t, HEAD[compass8(trip.heading)]) : "—"}</span></div>
          <div class=${SUB}>${clock(loc)}</div>
        </div>
      </div></div>
      <div class="flex items-center gap-2">
        <button id="go" data-haptic=${on ? "bump" : null} class=${`btn rounded-full flex-1 min-w-0 gap-2 ${on ? "btn-outline" : "btn-primary"}`} onClick=${go}>
          ${Icon(on ? "lucide:square" : "lucide:circle-dot", "text-lg shrink-0")}<span class="truncate">${T(t, on ? "stop" : "start")}</span>
        </button>
        <button id="look" aria-label=${T(t, "look")} class="btn btn-outline btn-circle shrink-0" onClick=${() => S.screen.set("look")}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
      </div>
    </div>

    <${Sheet} id="look-sheet" open=${screen === "look"} onClose=${close} title=${T(t, "look")} icon="lucide:sliders-horizontal" locale=${loc}>
      <div class="flex flex-col gap-1.5">
        <div class=${LABEL}>${T(t, "skin")}</div>
        <${Segmented} attr="data-skin" variant="outline" label=${T(t, "skin")} value=${skin} onChange=${(id) => $skin.set(id)}
          items=${SKINS.map((s) => ({ id: s.id, label: T(t, s.key), icon: s.icon }))} />
      </div>
      <div class="flex flex-col gap-1.5">
        <div class=${LABEL}>${T(t, "limit")} · ${T(t, "unitKmh")}</div>
        <${Segmented} attr="data-limit" variant="outline" label=${T(t, "limit")} value=${String(limit)} onChange=${(id) => $limit.set(id)}
          items=${LIMITS.map((id) => (id === "0" ? { id, icon: "lucide:bell-off", title: T(t, "off") } : { id, label: id }))} />
      </div>
    </${Sheet}>

    <${Sheet} id="notice-sheet" open=${screen === "notice"} onClose=${close} title=${T(t, "noticeTitle")} icon="lucide:triangle-alert" locale=${loc}>
      <p class="text-sm leading-relaxed">${T(t, "noticeMount")}</p>
      <p class="text-sm leading-relaxed">${T(t, "noticeGps")}</p>
      <button id="notice-go" class="btn btn-primary rounded-full gap-2 w-full" onClick=${ride}>${Icon("lucide:circle-dot", "text-lg")}${T(t, "noticeGo")}</button>
    </${Sheet}>
  </div>`;
}
