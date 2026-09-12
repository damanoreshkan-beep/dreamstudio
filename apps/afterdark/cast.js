// afterdark — the CAST tab: who dances and what they dance (owner, 2026-09-12: «окремий таб: персонажі сіткою
// аватарів, окремо танці»). Two sections behind one strip: the CHARACTER GRID — every Mixamo character as a
// round avatar, tap to put on / take off the stage (up to MAX_CAST) — and the MOVE LIBRARY: the 36 curated
// dances and the library's dances in the open, the other ~2100 motions (walks, fights, idles…) behind one
// «Ще +» key (owner: «другорядні рухи сховай за кнопкою ще+»), with a search that cuts through all of it.
// This tab only edits the persisted working set (state.js); the stage view listens and drives the engine.
import { html } from "htm/preact";
import { useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { persistentAtom } from "@nanostores/persistent";
import { Segmented, Sheet } from "/_rt/ui.js";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { CHARACTERS, avatarUrl } from "./characters.js";
import { MOVES, DEFAULT_MOVES, loadCatalog, getCatalog } from "./dances.js";
import { $cast, $moves, getCast, getMoves, toggleChar, toggleMove, setCast, setMoves, mixCast, DEFAULT_CAST, MAX_CAST, $myChars, getMyChars, removeMyChar, $genCharLoading, $genCharPct, $genCharError, $newChar } from "./state.js";
import { generateCharacter, cancelGenerate, genElapsed } from "./genchar.js";

const $section = persistentAtom("afterdark:castTab", "chars");
const TIER_TINT = { light: "#8B5CF6", groove: "#39FF6A", drive: "#FF3EB5" };
const SHOW_MAX = 400;                          // the long tail renders this many at once; the search reaches the rest
const norm = (s) => String(s || "").toLowerCase();
const chip = (on) => `btn btn-sm rounded-full h-auto min-h-0 py-1.5 gap-1.5 normal-case font-normal ${on ? "btn-primary" : "btn-ghost border border-base-content/15"}`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const STAGE_KEY = { picture: "gPicture", queued: "gQueued", mesh: "gMesh", rig: "gRig", store: "gStore" };

// ── a new character from words: the sheet behind «Створити» (genchar.js does the work, at module level) ──
function GenSheet({ t, loc, open, onClose }) {
  const stage = useStore($genCharLoading), pct = useStore($genCharPct), error = useStore($genCharError);
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("human");
  const [, tick] = useState(0);
  useEffect(() => { if (!stage) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [stage]);
  const go = () => {
    const p = prompt.trim(); if (!p || stage || gate) return;
    const nm = name.trim() || p.split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    generateCharacter({ prompt: p, name: nm.slice(0, 40), kind }).then((c) => { if (c) onClose(); });
  };
  return html`<${Sheet} id="gen-sheet" open=${open} onClose=${onClose} title=${T(t, "genTitle")} subtitle=${T(t, "genSub")} icon="lucide:sparkles" locale=${loc}>
    <div data-gen-form class="flex flex-col gap-3">
      <textarea data-gen-prompt rows="3" value=${prompt} placeholder=${T(t, "genPrompt")} disabled=${!!stage} onInput=${(e) => setPrompt(e.currentTarget.value)} class="textarea textarea-bordered bg-base-100 w-full text-base leading-snug"></textarea>
      <div class="flex items-center gap-2 flex-wrap">
        <input data-gen-name type="text" maxlength="40" value=${name} placeholder=${T(t, "genName")} disabled=${!!stage} onInput=${(e) => setName(e.currentTarget.value)} class="input input-sm input-bordered bg-base-100 flex-1 min-w-[8rem]" />
        <${Segmented} attr="data-gen-kind" size="sm" variant="ghost" label=${T(t, "kind")} value=${kind} onChange=${setKind}
          items=${[{ id: "human", label: T(t, "kindHuman"), icon: "lucide:user" }, { id: "creature", label: T(t, "kindCreature"), icon: "lucide:ghost" }]} />
      </div>
      ${stage ? html`<div data-gen-progress class="rounded-2xl bg-base-content/5 p-3 flex items-center gap-3">
          <span class="loading loading-ring loading-md text-[var(--app-accent)] shrink-0"></span>
          <div class="flex-1 min-w-0">
            <div class="text-[0.9rem] leading-tight">${T(t, STAGE_KEY[stage] || "gQueued")}${pct ? ` · ${pct}%` : ""}</div>
            <div class="font-mono text-[0.72rem] text-muted tabular-nums">${mmss(genElapsed())} · ${T(t, "genHint")}</div>
          </div>
          <button data-gen-cancel type="button" class="btn btn-ghost btn-sm rounded-full" onClick=${cancelGenerate}>${T(t, "genCancel")}</button>
        </div>`
        : html`<button data-gen-go type="button" disabled=${!prompt.trim()} onClick=${go} class="btn btn-primary rounded-full gap-2 normal-case"><iconify-icon icon="lucide:sparkles"></iconify-icon>${T(t, "genGo")}</button>`}
      ${error ? html`<p data-gen-error class="text-[0.85rem] text-error" aria-live="polite">${T(t, error)}</p>` : null}
    </div>
  </${Sheet}>`;
}

function MoveChip({ m, on, name }) {
  const tint = TIER_TINT[m.tier] || TIER_TINT.groove;
  // a library name can run to 60 characters: the chip wraps its text (never wider than the column)
  return html`<button key=${m.id} data-move=${m.id} type="button" aria-pressed=${on ? "true" : "false"} title=${name} onClick=${() => toggleMove(m.id)} class=${chip(on) + " pl-2 pr-3 max-w-full text-left"}>
    <span class="w-2 h-2 rounded-full shrink-0" style=${`background:${tint};box-shadow:${on ? `0 0 6px ${tint}` : "none"}`}></span>
    <span class="font-mono text-[0.78rem] tracking-wide leading-tight min-w-0 [overflow-wrap:anywhere]">${name}</span>
  </button>`;
}

export function castView({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const section = useStore($section);
  useStore($cast); useStore($moves); useStore($myChars);
  const cast = getCast(), moves = getMoves(), mine = getMyChars();
  const newChar = useStore($newChar), genStage = useStore($genCharLoading);
  const [genOpen, setGenOpen] = useState(false);
  const onStage = new Set(cast), onFloor = new Set(moves);
  const [kind, setKind] = useState("all");
  const [capHint, setCapHint] = useState(false);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState(getCatalog());
  useEffect(() => { if (section === "moves" && !catalog) loadCatalog().then((c) => setCatalog(c)); }, [section]);
  useEffect(() => { if (!capHint) return; const id = setTimeout(() => setCapHint(false), 2200); return () => clearTimeout(id); }, [capHint]);

  const byKind = (g) => kind === "all" || (kind === "creature" ? g.kind === "creature" : g.kind !== "creature");
  const chars = [...mine.filter(byKind), ...CHARACTERS.filter(byKind)];   // mine first, newest first
  const tap = (id) => { if (!toggleChar(id)) setCapHint(true); };
  const isTopCast = cast.length === DEFAULT_CAST.length && DEFAULT_CAST.every((id) => onStage.has(id));

  const ql = norm(q.trim());
  const libDances = (catalog || []).filter((m) => m.dance);
  const libRest = (catalog || []).filter((m) => !m.dance);
  const hit = (m, name) => !ql || norm(name).includes(ql) || norm(m.title).includes(ql);
  const curated = MOVES.filter((m) => hit(m, m.name));
  const dances = libDances.filter((m) => hit(m, m.name));
  const rest = (more || ql) ? libRest.filter((m) => hit(m, m.name)) : [];
  const allDanceIds = [...MOVES.map((m) => m.id), ...libDances.map((m) => m.id)];
  const isStars = moves.length === DEFAULT_MOVES.length && DEFAULT_MOVES.every((id) => onFloor.has(id));
  const allDancesOn = allDanceIds.length > 0 && allDanceIds.every((id) => onFloor.has(id));

  // a DOCUMENT, not a scroll container: a non-fit tab scrolls with the page. An own `overflow-y:auto` box here
  // (with the farm's `overscroll-behavior: contain` on every such box) swallowed the touch swipe on the phone
  // when its content was taller than the viewport — the owner could not scroll the grid at all (2026-09-12);
  // and the header's negative side margins made the page wider than the viewport (a horizontal scroll).
  return html`<div data-cast-tab class="pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+1rem)] overflow-x-clip">
    ${/* the section strip scrolls away with the list — nothing floats over the content (owner, 2026-09-12:
         «нічого не має плавати») */""}
    <div class="py-2">
      <${Segmented} attr="data-cast-section" size="sm" label=${T(t, "tabCast")} value=${section} onChange=${(v) => $section.set(v)}
        items=${[{ id: "chars", label: T(t, "dancers"), icon: "lucide:users", meta: String(cast.length) }, { id: "moves", label: T(t, "moves"), icon: "lucide:footprints", meta: String(moves.length) }]} />
    </div>

    ${section === "chars" ? html`
      <div class="flex items-center gap-2 py-2 flex-wrap">
        <span data-cast-count class="badge badge-ghost font-mono tabular-nums">${cast.length}/${MAX_CAST}</span>
        <button data-cast-top type="button" class=${chip(isTopCast)} onClick=${() => setCast(DEFAULT_CAST.slice())}><iconify-icon icon="lucide:star"></iconify-icon>${T(t, "starMoves")}</button>
        <button data-mix type="button" class=${chip(false)} onClick=${() => mixCast()}><iconify-icon icon="lucide:shuffle"></iconify-icon>${T(t, "mix")}</button>
        <button data-gen-open type="button" class=${chip(!!genStage)} onClick=${() => setGenOpen(true)}>${genStage ? html`<span class="loading loading-ring loading-xs"></span>` : html`<iconify-icon icon="lucide:sparkles"></iconify-icon>`}${T(t, "genOpen")}</button>
        <div class="ml-auto"><${Segmented} attr="data-kind" size="sm" variant="ghost" label=${T(t, "kind")} value=${kind} onChange=${setKind}
          items=${[{ id: "all", label: T(t, "all"), icon: "lucide:users" }, { id: "human", label: T(t, "kindHuman"), icon: "lucide:user" }, { id: "creature", label: T(t, "kindCreature"), icon: "lucide:ghost" }]} /></div>
      </div>
      <p data-cap-hint class=${`text-[0.82rem] text-warning transition-opacity duration-300 ${capHint ? "opacity-100" : "opacity-0"}`} aria-live="polite">${T(t, "capHint")}</p>
      <div data-char-grid class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-x-2 gap-y-4 pt-1">
        ${chars.map((g) => { const on = onStage.has(g.id), own = !!g.glb; return html`<div key=${g.id} class="relative min-w-0">
          <button data-char=${g.id} type="button" aria-pressed=${on ? "true" : "false"} aria-label=${g.name} onClick=${() => tap(g.id)}
            class=${`w-full flex flex-col items-center gap-1.5 min-w-0 rounded-2xl p-1 active:scale-[.96] transition-[transform,opacity] ${on ? "" : "opacity-60 hover:opacity-100"}`}>
            <span class=${`rounded-full p-0.5 transition-shadow duration-200 bg-base-content/5 ${g.id === newChar ? "animate-pulse" : ""}`} style=${on ? `box-shadow:0 0 0 2.5px ${g.tint},0 0 16px ${g.tint}66` : ""}>
              <img src=${avatarUrl(g.id)} alt="" width="72" height="72" loading="lazy" decoding="async" class="w-16 h-16 sm:w-[4.5rem] sm:h-[4.5rem] rounded-full object-cover block" />
            </span>
            <span class="text-[0.7rem] leading-tight truncate max-w-full text-base-content/80">${g.name}</span>
          </button>
          ${own ? html`<button data-char-remove=${g.id} type="button" aria-label=${T(t, "remove")} title=${T(t, "remove")} onClick=${() => removeMyChar(g.id)}
            class="absolute top-0 right-0 w-6 h-6 rounded-full bg-base-100 border border-base-content/15 text-base-content/70 flex items-center justify-center text-sm leading-none">×</button>` : null}
        </div>`; })}
      </div>
      <${GenSheet} t=${t} loc=${loc} open=${genOpen} onClose=${() => setGenOpen(false)} />` : html`
      <div class="flex items-center gap-2 py-2 flex-wrap">
        <span data-moves class="badge badge-ghost font-mono tabular-nums" data-moves=${moves.length}>${moves.length}</span>
        <button data-stars type="button" class=${chip(isStars)} onClick=${() => setMoves(DEFAULT_MOVES.slice())}><iconify-icon icon="lucide:star"></iconify-icon>${T(t, "starMoves")}</button>
        <button data-all-moves type="button" aria-pressed=${allDancesOn ? "true" : "false"} class=${chip(allDancesOn)} onClick=${() => setMoves(allDancesOn ? DEFAULT_MOVES.slice() : allDanceIds)}><iconify-icon icon="lucide:sparkles"></iconify-icon>${T(t, "allDances")}</button>
        <input data-move-search type="search" value=${q} placeholder=${T(t, "searchMoves")} onInput=${(e) => setQ(e.currentTarget.value)} class="input input-sm input-bordered bg-base-100 flex-1 min-w-[9rem]" />
      </div>
      <h3 class="text-[0.78rem] font-medium text-muted pt-1 pb-1.5">${T(t, "moves")} · ${curated.length + dances.length}</h3>
      <div data-move-list class="flex flex-wrap gap-1.5">
        ${curated.map((m) => html`<${MoveChip} key=${m.id} m=${m} on=${onFloor.has(m.id)} name=${m.name} />`)}
        ${dances.map((m) => html`<${MoveChip} key=${m.id} m=${m} on=${onFloor.has(m.id)} name=${m.name} />`)}
      </div>
      ${!catalog ? html`<p class="text-[0.82rem] text-muted py-3">${T(t, "loadingLib")}</p>` : more || ql ? html`
        <h3 class="text-[0.78rem] font-medium text-muted pt-4 pb-1.5">${T(t, "moreMoves")} · ${rest.length}</h3>
        <div data-more-list class="flex flex-wrap gap-1.5">${rest.slice(0, SHOW_MAX).map((m) => html`<${MoveChip} key=${m.id} m=${m} on=${onFloor.has(m.id)} name=${m.name} />`)}</div>
        ${rest.length > SHOW_MAX ? html`<p class="text-[0.82rem] text-muted py-3">${T(t, "narrowSearch")}</p>` : null}`
        : html`<button data-more type="button" class="btn btn-ghost btn-sm rounded-full mt-4 gap-1.5 border border-base-content/15" onClick=${() => setMore(true)}>
            <iconify-icon icon="lucide:plus"></iconify-icon>${T(t, "more")} +${libRest.length}</button>`}`}
  </div>`;
}
