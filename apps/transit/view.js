import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Planet, hitTimes } from "/_rt/astro.js";
import { SkyDial, dialAt } from "/_rt/skydial.js";
import { Sign } from "/_rt/zodiac.js";
import { houseOf, norm360, HIT_PRECISION } from "/_rt/natal.js";
import { placeLabel, formatCoords } from "/_rt/places.js";
import { aiTick } from "/_rt/ai-astro.js";
import { Scramble } from "/_rt/skeleton.js";
import { Panel } from "/_rt/ui.js";
import { Icon, DAY, LBL, META, wheelAngle, signOf, bodyLabel, pt, dm, ASPECT_HUE, ASPECT_DASH, ASPECT_KEY, CHIPS, SCRUB, ymd, dayOffset, clampScrub, READ_TRANSIT, READ_PLACEMENT, READ_CUSP, READ_PORTRAIT, READ_ASK, readScreen, fmtHitAt, hitKey, dot, NOW, $offset, useChart } from "./lib.js";
import { NeedBirth, BirthSheet } from "./birth.js";
import { TransitSheet, PlacementSheet, CuspSheet, PortraitSheet, InterpSheet, AskSheet } from "./sheets.js";

export { match } from "./match.js";

function DayStep({ dir, t, offset }) {
  const to = clampScrub(offset + (dir === "prev" ? -1 : 1)), end = to === offset;
  return html`<button data-step=${dir} aria-label=${T(t, dir === "prev" ? "prevDay" : "nextDay")} disabled=${end}
    class=${`shrink-0 w-[var(--ms-ctl)] h-[var(--ms-ctl)] rounded-[var(--ms-r-in)] grid place-items-center transition-colors ${end ? "sf-inset text-muted" : "sf-raised sf-e2 sf-press"}`}
    onClick=${() => $offset.set(to)}>${Icon(dir === "prev" ? "lucide:chevron-left" : "lucide:chevron-right", "text-lg")}</button>`;
}

export function wheel({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  useStore(aiTick);
  const C = useChart(S);
  const offset = useStore($offset);

  const fmtDate = (d) => d.toLocaleDateString(locale === "en" ? "en-GB" : locale || "uk", { day: "numeric", month: "short", year: "numeric" });
  const shortDate = (d) => d.toLocaleDateString(locale === "en" ? "en-GB" : locale || "uk", { day: "numeric", month: "short" });
  const picked = offset !== 0 && offset !== 1;

  if (!C.ready) {
    return html`<${Fragment}>
      <${NeedBirth} t=${t} onOpen=${() => openScreen("birth")} />
      <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
    </${Fragment}>`;
  }

  const { H, natal, sky, hits, b } = C;
  const lonOf = Object.fromEntries([...C.targets].map((p) => [p.key, p.lon]));

  const cuspLines = H.cusps.map((c, i) => {
    const [x1, y1] = pt(wheelAngle(c), 17), [x2, y2] = pt(wheelAngle(c), 40);
    const angular = i === 0 || i === 9;
    return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke="currentColor"
      stroke-width=${angular ? 0.7 : 0.3} stroke-opacity=${angular ? 0.85 : 0.4} key=${"c" + i}></line>`;
  });
  const cuspNums = H.cusps.map((c, i) => {
    const span = norm360(H.cusps[(i + 1) % 12] - c);
    const [x, y] = pt(wheelAngle(norm360(c + span / 2)), 20);
    return html`<text x=${x} y=${y} fill="currentColor" fill-opacity="0.55" font-size="2.6" text-anchor="middle"
      dominant-baseline="middle" key=${"n" + i}>${i + 1}</text>`;
  });
  const chords = hits.map((a, i) => {
    const [x1, y1] = pt(wheelAngle(lonOf[a.n]), 16), [x2, y2] = pt(wheelAngle(sky.find((p) => p.key === a.t).lon), 16);
    return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke=${ASPECT_HUE[a.nature]} stroke-width=${a.exact ? 0.6 : 0.4}
      stroke-opacity=${a.exact ? 0.85 : 0.45} stroke-dasharray=${ASPECT_DASH[a.nature]} stroke-linecap="round" key=${i}></line>`;
  });
  const overlay = html`<svg viewBox="0 0 100 100" class="absolute inset-0 w-full h-full pointer-events-none" fill="none" aria-hidden="true">
    <g class="text-base-content/25">
      <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="0.4"></circle>
      <circle cx="50" cy="50" r="29" stroke="currentColor" stroke-width="0.3"></circle>
      <circle cx="50" cy="50" r="17" stroke="currentColor" stroke-width="0.3"></circle>
      ${Array.from({ length: 12 }, (_, i) => { const [x1, y1] = pt(norm360(270 - i * 30), 40), [x2, y2] = pt(norm360(270 - i * 30), 46.5); return html`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} stroke="currentColor" stroke-width="0.4" key=${"s" + i}></line>`; })}
    </g>
    <g class="text-base-content">${cuspLines}${cuspNums}</g>
    ${chords}
  </svg>`;

  const marks = sky.map((p) => ({ key: p.key, body: p.key, angle: wheelAngle(p.lon), value: norm360(p.lon), label: bodyLabel(t, p.key) }));
  const rim = Array.from({ length: 12 }, (_, i) => ({ label: html`<${Sign} i=${i} cls="w-[18px] h-[18px]" />`, angle: wheelAngle(i * 30 + 15), cls: "text-base-content/70", rimR: 43 }));
  const natalRing = html`<div class="absolute inset-0 pointer-events-none">
    ${natal.map((p) => html`<div data-natal=${p.key} class="absolute flex flex-col items-center" style=${dialAt(wheelAngle(p.lon), 24)} key=${p.key}>
      <div class="opacity-70 scale-[0.72] origin-center"><${Planet} body=${p.key} /></div>
    </div>`)}
    ${[["asc", H.asc], ["mc", H.mc]].map(([k, lon]) => html`<span data-angle=${k} class="absolute text-[0.52rem] font-mono font-bold tracking-tight text-primary" style=${dialAt(wheelAngle(lon), 36)} key=${k}>${T(t, k === "asc" ? "angAsc" : "angMc")}</span>`)}
  </div>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-4 items-center">
      <div class="relative w-full mx-auto" style="max-width:360px">
        <${SkyDial} size=${360} marks=${marks} rim=${rim} overlay=${overlay}
          radial=${() => 33} opacityFor=${() => 1} fan=${{ within: 8, step: 5, rim: 33, min: 30 }} />
        ${natalRing}
      </div>

      <!-- the birth moment this whole chart hangs on, and the date being transited -->
      <!-- the page extruded, pressed IN under a finger — the material's own press, so no scale nudge on top -->
      <button data-birth-row class="w-full max-w-[420px] rounded-[var(--ms-r)] sf-raised sf-e2 sf-press px-[var(--ms-pad)] py-3 flex items-center gap-3 text-left transition" onClick=${() => openScreen("birth")}>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">${placeLabel(b.place)}</div>
          <div class=${`${META} truncate`}>${C.rec.date} ${C.rec.time} ${b.offsetLabel} · ${formatCoords(b.lat, b.lng)}</div>
        </div>
        ${Icon("lucide:pencil", "text-base text-base-content/70")}
      </button>

      <div class="w-full max-w-[420px] flex flex-col gap-2">
        ${""}
        <div class="text-center">
          <span data-date class="text-2xl font-bold tabular-nums">${fmtDate(C.when)}</span>
        </div>
        ${""}
        <div class="flex items-center gap-2">
          <${DayStep} dir="prev" t=${t} offset=${offset} />
          <input id="scrub" type="range" min=${-SCRUB} max=${SCRUB} step="1" value=${offset} class="range range-xs range-primary min-w-0 flex-1" aria-label=${T(t, "dateAria")} onInput=${(e) => $offset.set(Number(e.target.value))} />
          <${DayStep} dir="next" t=${t} offset=${offset} />
        </div>
        ${""}
        <div class="grid grid-cols-3 gap-1.5 text-center">
          ${CHIPS.map(([o, lbl]) => html`<button data-chip=${lbl} aria-pressed=${offset === o} class=${`rounded-[var(--ms-r-in)] py-1.5 text-[0.78rem] font-medium transition-colors ${offset === o ? "sf-e2 bg-primary/10 text-primary font-semibold" : "sf-inset"}`} onClick=${() => $offset.set(o)} key=${lbl}>${T(t, lbl)}</button>`)}
          <label data-chip="pick" data-picked=${picked ? "true" : "false"} class=${`relative flex items-center justify-center gap-1 rounded-[var(--ms-r-in)] py-1.5 text-[0.78rem] font-medium transition-colors cursor-pointer ${picked ? "sf-e2 bg-primary/10 text-primary font-semibold" : "sf-inset"}`}>
            ${Icon("lucide:calendar-days", "text-sm shrink-0")}
            <span class="truncate">${picked ? shortDate(C.when) : T(t, "pickDay")}</span>
            <input data-pick type="date" aria-label=${T(t, "pickAria")} value=${ymd(C.when)}
              min=${ymd(new Date(NOW().getTime() - SCRUB * DAY))} max=${ymd(new Date(NOW().getTime() + SCRUB * DAY))}
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onInput=${(e) => { const v = e.target.value; if (v) $offset.set(clampScrub(dayOffset(v, NOW()))); }} />
          </label>
        </div>
      </div>

      <!-- the contacts themselves, tightest first; the header opens the grounded AI reading -->
      <${Panel} data-hits=${hits.length} className="w-full max-w-[420px] gap-1">
        <div class="flex items-center justify-between gap-2">
          <div class=${LBL}>${T(t, "contactsTitle")}</div>
          <button data-interp class="btn btn-sm btn-primary gap-1.5 rounded-full" onClick=${() => openScreen("interp")}>
            ${Icon("lucide:sparkles", "text-base")}<span class="font-semibold">${T(t, "interpBtn")}</span>
          </button>
        </div>
        <div>
          ${hits.length ? hits.map((a, i) => html`<${ContactRow} a=${a} t=${t} retro=${C.retro(a.t, sky.find((p) => p.key === a.t).lon)}
            onOpen=${() => openScreen(READ_TRANSIT + hitKey(a))} key=${i} />`)
            : html`<div class="py-2 text-sm text-muted">${T(t, "noContacts")}</div>`}
        </div>
      <//>
    </div>

    <${InterpSheet} open=${screen === "interp"} onClose=${closeScreen} C=${C} t=${t} loc=${locale} dateLabel=${fmtDate(C.when)} />
    <${TransitSheet} open=${readScreen(screen, READ_TRANSIT)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} dateLabel=${fmtDate(C.when)} />
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}

function ContactRow({ a, t, retro, onOpen }) {
  return html`<button data-contact onClick=${onOpen} class="w-full text-left flex items-center gap-2 py-1.5 border-b border-base-300/40 last:border-0 active:opacity-80 transition">
    ${dot(a.t)}
    <span class="font-medium truncate max-w-[4.6rem]">${bodyLabel(t, a.t)}${retro ? html`<span class="text-warning font-mono ml-0.5" title=${T(t, "retro")}>℞</span>` : null}</span>
    <span class="text-[0.78rem] font-medium shrink-0" style=${`color:${ASPECT_HUE[a.nature]}`}>${T(t, ASPECT_KEY[a.type])}</span>
    <span class="text-base-content/70 shrink-0 text-[0.78rem]">${T(t, "natalMark")}</span>
    <span class="font-medium truncate max-w-[4.6rem]">${bodyLabel(t, a.n)}</span>
    <div class="ml-auto flex items-center gap-1.5 shrink-0">
      ${a.applying != null ? html`<span class=${`font-mono text-[length:var(--ms-label)] uppercase tracking-wider ${a.applying ? "text-primary" : "text-base-content/70"}`}>${T(t, a.applying ? "aspApplying" : "aspSeparating")}</span>` : null}
      <span class=${`tabular-nums text-[0.78rem] w-9 text-right ${a.exact ? "text-primary font-semibold" : "text-base-content/70"}`}>${a.orb.toFixed(1)}°</span>
      ${Icon("lucide:sparkles", "text-sm text-primary")}
    </div>
  </button>`;
}

function useHitTimes(contacts, whenMs) {
  const [solved, setSolved] = useState({});
  const sig = contacts.map(hitKey).join(",") + "|" + Math.floor(whenMs / 36e5);
  useEffect(() => {
    setSolved({});
    let cancelled = false, i = 0;
    const step = () => {
      if (cancelled || i >= contacts.length) return;
      const a = contacts[i++];
      const times = hitTimes(a.t, a.natalLon, a.signedAngle, whenMs);
      setSolved((m) => ({ ...m, [hitKey(a)]: times }));
      setTimeout(step, 0);
    };
    const id = setTimeout(step, 0);
    return () => { cancelled = true; clearTimeout(id); };
  }, [sig]);
  return solved;
}

export function hits({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const C = useChart(S);
  const loc = locale === "en" ? "en-GB" : locale || "uk";
  const solved = useHitTimes(C.hits || [], C.when.getTime());

  if (!C.ready) {
    return html`<${Fragment}>
      <${NeedBirth} t=${t} onOpen=${() => openScreen("birth")} />
      <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
    </${Fragment}>`;
  }

  return html`<${Fragment}>
    <div class="flex flex-col gap-3">
      ${C.hits.length ? C.hits.map((a, i) => {
        const times = solved[hitKey(a)];
        const prec = HIT_PRECISION[a.t] || "minute";
        const nearest = times && times.length ? times.reduce((best, x) => Math.abs(x - C.when) < Math.abs(best - C.when) ? x : best) : null;
        return html`<button data-hit data-hit-key=${hitKey(a)} onClick=${() => openScreen(READ_TRANSIT + hitKey(a))}
          class="w-full text-left rounded-[var(--ms-r)] sf-raised sf-e2 sf-press px-[var(--ms-pad)] py-3 flex flex-col gap-2 transition" key=${i}>
        <div class="flex items-center gap-2">
          ${dot(a.t)}
          <span class="font-semibold truncate">${bodyLabel(t, a.t)}</span>
          <span class="text-[0.78rem] font-semibold truncate" style=${`color:${ASPECT_HUE[a.nature]}`}>${T(t, ASPECT_KEY[a.type])}</span>
          <span class="text-base-content/70 shrink-0 text-[0.78rem]">${T(t, "natalMark")}</span>
          <span class="font-semibold truncate">${bodyLabel(t, a.n)}</span>
          <span class="ml-auto tabular-nums text-[0.78rem] text-base-content/70 shrink-0">${a.orb.toFixed(2)}°</span>
          ${Icon("lucide:sparkles", "text-base text-primary shrink-0")}
        </div>
        ${times === undefined
          ? html`<div class="text-[0.8rem] text-base-content/70 font-mono"><${Scramble} len=${22} /></div>`
          : times.length ? html`<div class="flex flex-col gap-1 w-full">
            ${times.map((ms, j) => html`<div class=${`flex items-center gap-2 text-[0.8rem] ${ms === nearest ? "" : "text-base-content/70"}`} key=${j}>
              ${Icon(ms === nearest ? "lucide:crosshair" : "lucide:dot", `text-sm shrink-0 ${ms === nearest ? "text-primary" : ""}`)}
              <span data-hit-time class="font-mono tabular-nums">${fmtHitAt(ms, prec, locale)}</span>
              ${times.length > 1 && j === 0 ? html`<span class=${`ml-auto ${LBL} shrink-0`}>${T(t, "passes")} ${times.length}</span>` : null}
            </div>`)}
          </div>` : html`<div class="text-[0.8rem] text-base-content/70">${T(t, "noExactHit")}</div>`}
      </button>`;
      }) : html`<${Panel} className="py-6 text-sm text-muted text-center">${T(t, "noContacts")}<//>`}
    </div>
    <${TransitSheet} open=${readScreen(screen, READ_TRANSIT)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} dateLabel=${C.when.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" })} />
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}

export function chart({ S, screen, openScreen, closeScreen }) {
  const t = useStore(S.t), locale = useStore(S.locale);
  const C = useChart(S);

  if (!C.ready) {
    return html`<${Fragment}>
      <${NeedBirth} t=${t} onOpen=${() => openScreen("birth")} />
      <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
    </${Fragment}>`;
  }
  const { H, natal, b } = C;
  const rows = natal.slice().sort((x, y) => norm360(x.lon) - norm360(y.lon));

  const open = (key) => openScreen(READ_PLACEMENT + key);
  const mark = () => Icon("lucide:sparkles", "text-xs text-primary shrink-0 w-3.5");
  const ROW = "w-full text-left flex items-center gap-1.5 py-1.5 border-b border-base-300/40 last:border-0 active:opacity-80 transition";
  const angleRow = (key, lbl, lon) => html`<button data-angle-row=${lbl} data-place=${key} onClick=${() => open(key)} class=${ROW} key=${key}>
    <div class="flex-[1.1] min-w-0 font-medium truncate text-primary">${T(t, lbl)}</div>
    <div class="w-5 flex justify-center text-base-content/70 shrink-0"><${Sign} i=${signOf(lon)} cls="w-5 h-5" /></div>
    <div class="flex-1 min-w-0 truncate">${T(t, "s" + signOf(lon))}</div>
    <div class="tabular-nums text-base-content/70 w-[2.9rem] text-right font-mono text-[0.78rem] shrink-0">${dm(lon)}</div>
    <div class="w-[2.75rem] shrink-0"></div>
    ${mark()}
  </button>`;

  return html`<${Fragment}>
    <div class="flex flex-col gap-3">
      <button data-birth-row class="rounded-[var(--ms-r)] sf-raised sf-e2 sf-press px-[var(--ms-pad)] py-3 flex items-center gap-3 text-left transition" onClick=${() => openScreen("birth")}>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">${placeLabel(b.place)}</div>
          <div class=${`${META} truncate`}>${b.date.toISOString().replace(".000Z", "Z")} · ${T(t, "utcMark")} ${b.offsetLabel}</div>
        </div>
        ${Icon("lucide:pencil", "text-base text-base-content/70")}
      </button>

      <button data-ask-open class="rounded-[var(--ms-r)] sf-raised sf-e2 sf-press px-[var(--ms-pad)] py-3.5 flex items-center gap-3 text-left transition" onClick=${() => openScreen(READ_ASK)}>
        <div class="rounded-full sf-inset p-2 text-primary shrink-0">${Icon("lucide:sparkles", "text-lg")}</div>
        <span class="flex-1 min-w-0 font-semibold">${T(t, "askTitle")}</span>
        ${Icon("lucide:chevron-right", "text-base text-base-content/70 shrink-0")}
      </button>

      <${Panel} data-natal-table className="overflow-x-auto gap-0">
        <div class="min-w-[300px]">
          <div class="flex items-center justify-between gap-2 pb-1.5">
            <div class=${LBL}>${T(t, "natalTitle")}</div>
            <button data-portrait class="btn btn-sm btn-primary gap-1.5 rounded-full" onClick=${() => openScreen(READ_PORTRAIT)}>
              ${Icon("lucide:sparkles", "text-base")}<span class="font-semibold">${T(t, "portraitBtn")}</span>
            </button>
          </div>
          ${angleRow("asc", "angAsc", H.asc)}${angleRow("mc", "angMc", H.mc)}${angleRow("vertex", "angVertex", H.vertex)}
          ${rows.map((p) => {
            const s = signOf(p.lon), hs = houseOf(p.lon, H.cusps), r = C.natalRetroFor(p.key, p.lon);
            return html`<button data-row=${p.key} data-place=${p.key} onClick=${() => open(p.key)} class=${ROW} key=${p.key}>
              <div class="flex-[1.1] min-w-0 font-medium truncate">${bodyLabel(t, p.key)}</div>
              <div class="w-5 flex justify-center text-base-content/70 shrink-0"><${Sign} i=${s} cls="w-5 h-5" /></div>
              <div class="flex-1 min-w-0 truncate">${T(t, "s" + s)}</div>
              <div class="tabular-nums text-base-content/70 w-[2.9rem] text-right font-mono text-[0.78rem] shrink-0">${dm(p.lon)}</div>
              <div class="w-[2.75rem] text-right tabular-nums text-[0.78rem] text-base-content/70 shrink-0">${T(t, "houseShort")}${hs}${r ? html`<span class="text-warning font-mono ml-0.5" title=${T(t, "retro")}>℞</span>` : null}</div>
              ${mark()}
            </button>`;
          })}
        </div>
      <//>

      <${Panel} data-cusps className="gap-0">
        <div class="pb-1.5 flex items-center justify-between gap-2">
          <div class=${LBL}>${T(t, "cuspsTitle")}</div>
          <span data-house-system class=${LBL}>${T(t, "hs" + C.system[0].toUpperCase() + C.system.slice(1))}</span>
        </div>
        ${H.fallback ? html`<div data-house-fallback class="mb-2 rounded-[var(--ms-r-in)] sf-e2 bg-warning/10 px-3 py-2 text-sm text-base-content">${T(t, "hsFallback")}</div>` : null}
        <div class="grid grid-cols-2 gap-x-4">
          ${H.cusps.map((c, i) => html`<button data-cusp=${i + 1} onClick=${() => openScreen(READ_CUSP + (i + 1))}
              class="w-full text-left flex items-center gap-1.5 py-1 border-b border-base-300/40 last:border-0 active:opacity-80 transition" key=${i}>
            <span class="w-4 text-[0.78rem] font-mono text-base-content/70 tabular-nums">${i + 1}</span>
            <${Sign} i=${signOf(c)} cls="w-4 h-4 text-base-content/70 shrink-0" />
            <span class="ml-auto font-mono text-[0.78rem] tabular-nums">${dm(c)}</span>
            ${mark()}
          </button>`)}
        </div>
      <//>
    </div>
    <${PlacementSheet} open=${readScreen(screen, READ_PLACEMENT)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} />
    <${CuspSheet} open=${readScreen(screen, READ_CUSP)} onClose=${closeScreen} C=${C} t=${t} loc=${locale} />
    <${AskSheet} open=${screen === READ_ASK} onClose=${closeScreen} C=${C} t=${t} loc=${locale} />
    <${PortraitSheet} open=${screen === READ_PORTRAIT} onClose=${closeScreen} C=${C} t=${t} loc=${locale} />
    <${BirthSheet} open=${screen === "birth"} onClose=${closeScreen} t=${t} locale=${locale} />
  </${Fragment}>`;
}
