import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { resolve, isComplete, EMPTY } from "/_rt/birth.js";
import { searchPlaces, placeLabel, formatCoords } from "/_rt/places.js";
import { Scramble } from "/_rt/skeleton.js";
import { Sheet, Segmented } from "/_rt/ui.js";
import { Icon, LBL, META, $birth } from "./lib.js";

export const NeedBirth = ({ t, onOpen }) => html`<div data-need-birth class="flex flex-col items-center gap-4 py-14 px-6 text-center">
  <div class="rounded-full sf-raised sf-e3 p-4 text-base-content/70">${Icon("lucide:calendar-clock", "text-3xl")}</div>
  <div class="text-base font-semibold max-w-[22rem]">${T(t, "needBirth")}</div>
  <button data-open-birth class="btn btn-primary rounded-full gap-2" onClick=${onOpen}>
    ${Icon("lucide:plus", "text-base")}<span>${T(t, "birthSet")}</span>
  </button>
</div>`;

export function BirthSheet({ open, onClose, t, locale }) {
  const stored = useStore($birth);
  const [draft, setDraft] = useState(stored || EMPTY);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  useEffect(() => { if (open) { setDraft(stored || EMPTY); setQ(""); setResults(null); } }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setResults(null); setSearching(false); return; }
    const ctl = new AbortController();
    setSearching(true);
    const id = setTimeout(async () => {
      const r = await searchPlaces(q, { signal: ctl.signal });
      setResults(r); setSearching(false);
    }, 350);
    return () => { clearTimeout(id); ctl.abort(); setSearching(false); };
  }, [q, open]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const r = resolve(draft);
  const complete = isComplete(draft) && r.ok;
  const save = () => { if (complete) { $birth.set(draft); onClose(); } };

  const field = (label, node) => html`<label class="flex flex-col gap-1 min-w-0">
    <span class=${LBL}>${label}</span>
    ${node}
  </label>`;
  const MODES = [["place", "zmPlace"], ["lmt", "zmLmt"], ["manual", "zmManual"]];

  return html`<${Sheet} id="birthsheet" open=${open} onClose=${onClose} title=${T(t, "birthTitle")} icon="lucide:calendar-clock">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          ${field(T(t, "birthDate"), html`<input data-birth-date type="date" value=${draft.date} min="1500-01-01" max="2100-12-31"
            onInput=${(e) => set({ date: e.target.value })} class="input input-bordered rounded-full h-[var(--ms-ctl)] w-full text-sm" />`)}
          ${field(T(t, "birthTime"), html`<input data-birth-time type="time" step="1" value=${draft.time}
            onInput=${(e) => set({ time: e.target.value })} class="input input-bordered rounded-full h-[var(--ms-ctl)] w-full text-sm font-mono" />`)}
        </div>

        ${field(T(t, "birthPlace"), html`<input data-birth-place type="search" value=${q} placeholder=${draft.place ? placeLabel(draft.place) : T(t, "placeSearch")}
          onInput=${(e) => setQ(e.target.value)} class="input input-bordered rounded-full h-[var(--ms-ctl)] w-full text-sm" />`)}

        ${searching ? html`<div class="flex flex-col gap-2 px-1">${[26, 22, 24].map((n, i) => html`<div class="text-sm text-base-content/70" key=${i}><${Scramble} len=${n} /></div>`)}</div>` : null}
        ${results && !searching ? (results.length ? html`<div class="flex flex-col rounded-[var(--ms-r-in)] sf-raised sf-e2 overflow-hidden">
          ${results.map((p) => html`<button data-place-hit class="px-3 py-2.5 text-left border-b border-base-300/50 last:border-0 active:bg-primary/10 transition-colors" onClick=${() => { set({ place: p }); setQ(""); setResults(null); }} key=${p.id}>
            <div class="text-sm font-medium truncate">${placeLabel(p)}</div>
            <div class=${`${META} truncate`}>${formatCoords(p.lat, p.lng)} · ${p.zone}</div>
          </button>`)}
        </div>` : html`<div class="text-sm text-muted px-1">${T(t, "placeNone")}</div>`) : null}

        ${""}
        ${draft.place ? html`<div data-birth-chosen class="rounded-[var(--ms-r-in)] sf-inset px-3 py-2">
          <div class="text-sm font-medium truncate">${placeLabel(draft.place)}</div>
          <div class=${`${META} truncate`}>${formatCoords(draft.place.lat, draft.place.lng)} · ${draft.place.zone}</div>
        </div>` : null}

        ${field(T(t, "zoneMode"), html`<${Segmented} attr="data-zone-mode" size="sm" label=${T(t, "zoneMode")}
          items=${MODES.map(([v, k]) => ({ id: v, label: T(t, k) }))}
          value=${draft.zoneMode || "place"} onChange=${(v) => set({ zoneMode: v })} />`)}

        ${(draft.zoneMode === "manual") ? field(T(t, "zmManual"), html`<input data-birth-offset type="text" inputmode="text" value=${draft.offset}
          placeholder="+02:00" onInput=${(e) => set({ offset: e.target.value })} class="input input-bordered rounded-full h-[var(--ms-ctl)] w-full text-sm font-mono" />`) : null}

        <!-- the one thing the user can actually check against a birth certificate -->
        <div data-birth-resolved class="rounded-[var(--ms-r-in)] sf-inset px-3 py-2.5">
          <div class=${LBL}>${T(t, "resolved")}</div>
          ${r.ok ? html`<div class="font-mono text-sm tabular-nums mt-0.5">${r.date.toISOString().replace(".000Z", "Z")}</div>
            <div class=${META}>${T(t, "utcMark")} ${r.offsetLabel}${r.zone ? " · " + r.zone : ""}</div>`
            : html`<div class="text-sm text-muted mt-0.5">${T(t, "need_" + r.reason)}</div>`}
        </div>

        ${""}
        ${r.ok && r.ambiguous ? html`<div data-birth-warn class="rounded-[var(--ms-r-in)] sf-e2 bg-warning/10 px-3 py-2 text-sm">${T(t, "warnAmbiguous")}</div>` : null}
        ${r.ok && r.nonexistent ? html`<div data-birth-warn class="rounded-[var(--ms-r-in)] sf-e2 bg-warning/10 px-3 py-2 text-sm">${T(t, "warnNonexistent")}</div>` : null}

        <button data-birth-save disabled=${!complete} class="btn btn-primary rounded-full h-[var(--ms-ctl)] mt-1" onClick=${save}>${T(t, "birthSave")}</button>
      </div>
  </${Sheet}>`;
}
