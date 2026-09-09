// jobx — jobs on the map of Ukraine. The farm's OWN job board (no third-party API): a signed-in user posts a
// vacancy, the owner approves it from Telegram, and it lands as a bubble on the city where it lives. Tap a city
// to read its openings; tap + to post one.
//
// Data lives on the edge (edge/jobs.js): POST /feed/jobs/cities → {cities, counts}, /feed/jobs/list {city} →
// {jobs}, /feed/jobs/post {sid, …} → queued for moderation. Calls ride the sealed tunnel transparently
// (installSealedFetch, wired in the runtime boot), so a plain fetch to VPS_PROXY is all this needs.
//
// The map is one projection (uamap.js): a real Ukraine border + every city placed by its true lat/lon, so a
// bubble always sits where the city is. Bubble area ∝ openings; an empty city is a faint dot you can still tap
// to be the first to post there.
import { html } from "htm/preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom, map as nmap } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Sheet, Island } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";
import { CITIES, UA_PATH, VIEWBOX, MAP_W, MAP_H } from "./uamap.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const EMPLOYMENT = ["full", "part", "remote", "contract", "internship"];
const empKey = { full: "empFull", part: "empPart", remote: "empRemote", contract: "empContract", internship: "empInternship" };

// ── state ────────────────────────────────────────────────────────────────────────────────────────────────
// Under the gate the map is seeded at module load, so the very first paint already carries the counts (a
// reviewer/e2e never catches an empty pre-fetch frame).
const MOCK_COUNTS = { kyiv: 5, lviv: 3, kharkiv: 2, odesa: 2, dnipro: 1, lutsk: 1 };
const $counts = nmap(gate ? { ...MOCK_COUNTS } : {});   // cityKey → approved openings
const $total = atom(gate ? Object.values(MOCK_COUNTS).reduce((a, b) => a + b, 0) : 0);
const $city = atom(null);      // the open city sheet, a CITIES key, or null
const $cityJobs = atom(null);  // jobs for the open city, or null while loading
const $post = atom(false);     // post sheet open?
const $sent = atom(false);     // post succeeded → thank-you state
const $posting = atom(false);
const $err = atom(null);
const $form = nmap({ title: "", company: "", city: "kyiv", employment: "full", salary: "", description: "", contact: "" });

const MOCK_JOB = {
  id: "1", title: "Frontend-розробник", company: "Dreamware", city: "kyiv",
  salary: "45000–70000 ₴", employment: "remote", poster: "Octocat",
  description: "Preact, невеликі PWA, чистий код. Гнучкий графік, дружня команда.",
  contact: "@dreamware_jobs", ms: Date.now(),
};

async function loadCounts() {
  if (gate) { $counts.set({ ...MOCK_COUNTS }); $total.set(Object.values(MOCK_COUNTS).reduce((a, b) => a + b, 0)); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/jobs/cities`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const j = await r.json();
    const counts = (j && j.counts) || {};
    $counts.set(counts);
    $total.set(Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0));
  } catch { /* the map still renders; bubbles are just empty */ }
}

async function openCity(key) {
  $city.set(key);
  $cityJobs.set(null);
  if (gate) { $cityJobs.set(key === "kyiv" ? [MOCK_JOB] : []); return; }
  try {
    const r = await fetch(`${VPS_PROXY}/jobs/list`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ city: key }) });
    const j = await r.json();
    $cityJobs.set(Array.isArray(j && j.jobs) ? j.jobs : []);
  } catch { $cityJobs.set([]); }
}

async function submit(t) {
  if ($posting.get()) return;
  const f = $form.get();
  if (!f.title.trim() || !f.company.trim() || !f.description.trim() || !f.contact.trim()) { $err.set("errFields"); return; }
  const sess = session.get();
  if (!gate && !(sess && sess.sid)) { $err.set("needLogin"); return; }
  $err.set(null); $posting.set(true);
  try {
    if (!gate) {
      const r = await fetch(`${VPS_PROXY}/jobs/post`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sid: sess.sid, ...f }),
      });
      if (!r.ok) throw new Error("post " + r.status);
    }
    $sent.set(true);
    $form.setKey("title", ""); $form.setKey("company", ""); $form.setKey("salary", "");
    $form.setKey("description", ""); $form.setKey("contact", "");
  } catch { $err.set("errFailed"); }
  $posting.set(false);
}

// bubble diameter (px) from openings — a fixed-size pin (does not scale with map zoom), area ∝ count.
const dOf = (n) => (n > 0 ? Math.min(56, 24 + Math.sqrt(n) * 9) : 10);

// The SVG letterboxes itself (preserveAspectRatio="meet"); this replays that same fit so an HTML overlay of
// real <button> pins sits exactly on the SVG's coordinates. Buttons (not SVG <g>) so they are focusable,
// tappable and their number is real text — SVG nodes have no innerText and no .click(), which the browser and
// the e2e harness both need. Recomputed on every resize.
function useMapFit() {
  const ref = useRef(null);
  const [fit, setFit] = useState({ scale: 0, ox: 0, oy: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      const scale = Math.min(cw / MAP_W, ch / MAP_H);
      setFit({ scale, ox: (cw - MAP_W * scale) / 2, oy: (ch - MAP_H * scale) / 2 });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, fit];
}

export function mapView({ t, S }) {
  const counts = useStore($counts);
  const total = useStore($total);
  const city = useStore($city);
  const loc = useStore(S.locale);
  const [boxRef, fit] = useMapFit();

  useEffect(() => { loadCounts(); }, []);

  const closeCity = () => { $city.set(null); $cityJobs.set(null); };
  const openPost = () => { $sent.set(false); $err.set(null); $post.set(true); };

  return html`<div class="h-full min-h-0 px-[var(--ms-pad)] pb-[var(--ms-pad)]">
    <div data-stage class="relative h-full min-h-0 rounded-[var(--ms-r)] bg-base-100 overflow-hidden
                grid grid-rows-[auto_minmax(0,1fr)]">

      <div class="flex items-center gap-2 px-[var(--ms-pad)] pt-3 pb-1">
        <div class="min-w-0">
          <div class="font-semibold leading-tight truncate">${T(t, "mapHint")}</div>
          <div data-total class="font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-muted">
            ${total} ${T(t, "openings")}
          </div>
        </div>
      </div>

      <div ref=${boxRef} class="relative min-h-0 min-w-0 px-2 pb-2">
        <svg data-map viewBox=${VIEWBOX} preserveAspectRatio="xMidYMid meet"
             class="w-full h-full block" aria-hidden="true">
          <path d=${UA_PATH} class="fill-base-200 stroke-base-content/20" stroke-width="1.5" />
        </svg>

        ${fit.scale > 0 ? Object.entries(CITIES).map(([key, c]) => {
          const n = Number(counts[key]) || 0;
          const d = dOf(n);
          const left = fit.ox + c.x * fit.scale, top = fit.oy + c.y * fit.scale;
          const label = `${c[loc] || c.uk} · ${n} ${T(t, "openings")}`;
          const base = "absolute -translate-x-1/2 -translate-y-1/2 rounded-full grid place-items-center transition-transform active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--app-accent)]";
          return n > 0
            ? html`<button data-city=${key} aria-label=${label}
                style=${`left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:${d}px;height:${d}px`}
                class=${`${base} bg-[var(--app-tint)] ring-2 ring-[var(--app-accent)] text-base-content font-bold`}
                onClick=${() => openCity(key)}>
                <span class="leading-none" style=${`font-size:${Math.max(11, d * 0.42)}px`}>${n}</span>
              </button>`
            // empty city: a small dot, but a 24px hit target (tap-target floor) around it.
            : html`<button data-city=${key} aria-label=${label}
                style=${`left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;width:24px;height:24px`}
                class=${base} onClick=${() => openCity(key)}>
                <span class="w-2.5 h-2.5 rounded-full bg-base-content/35 hover:bg-base-content/60"></span>
              </button>`;
        }) : null}

        <button data-post class="absolute right-3 bottom-3 btn btn-primary gap-2 sf-e3 rounded-full"
                onClick=${openPost}>
          ${Icon("lucide:plus", "text-[1.15em]")}<span class="font-medium">${T(t, "postCta")}</span>
        </button>
      </div>
    </div>

    <${CitySheet} t=${t} loc=${loc} city=${city} onClose=${closeCity} onPost=${() => { closeCity(); openPost(); }} />
    <${PostSheet} t=${t} loc=${loc} onClose=${() => $post.set(false)} />
  </div>`;
}

function CitySheet({ t, loc, city, onClose, onPost }) {
  const jobs = useStore($cityJobs);
  const c = city ? CITIES[city] : null;
  return html`<${Sheet} id="jobx-city" open=${!!city} onClose=${onClose}
      title=${c ? (c[loc] || c.uk) : ""} icon="lucide:map-pin">
    ${city
      ? (jobs == null
          ? html`<div class="py-8 text-center text-muted">${T(t, "loadingJobs")}</div>`
          : jobs.length === 0
            ? html`<div class="flex flex-col items-center gap-3 py-6 text-center">
                <span class="text-muted">${T(t, "noJobsCity")}</span>
                <button class="btn btn-primary btn-sm gap-2 rounded-full" onClick=${onPost}>
                  ${Icon("lucide:plus")}<span>${T(t, "postCta")}</span>
                </button>
              </div>`
            : html`<div class="flex flex-col gap-[var(--ms-gap)] pb-2">
                ${jobs.map((j) => html`<${JobCard} t=${t} j=${j} />`)}
              </div>`)
      : null}
  <//>`;
}

function JobCard({ t, j }) {
  const emp = j.employment && empKey[j.employment] ? T(t, empKey[j.employment]) : "";
  const link = /^https?:\/\//i.test(j.contact) ? j.contact
    : /^@/.test(j.contact) ? `https://t.me/${j.contact.slice(1)}`
    : /@/.test(j.contact) ? `mailto:${j.contact}` : null;
  return html`<${Island} className="p-[var(--ms-pad)]">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div data-job-title class="font-semibold leading-tight">${j.title}</div>
        <div class="text-[0.9rem] text-muted truncate">${j.company}</div>
      </div>
      ${j.salary ? html`<div class="shrink-0 font-mono text-[0.8rem] text-[var(--app-accent)] whitespace-nowrap">${j.salary}</div>` : null}
    </div>
    ${(emp) ? html`<div class="mt-1.5 flex flex-wrap gap-1.5">
      <span class="badge badge-sm badge-ghost">${emp}</span>
    </div>` : null}
    ${j.description ? html`<p class="mt-2 text-[0.9rem] leading-relaxed text-muted whitespace-pre-line">${j.description}</p>` : null}
    <div class="mt-3 flex items-center justify-between gap-2">
      ${j.poster ? html`<span class="text-[0.78rem] text-muted truncate">${j.poster}</span>` : html`<span></span>`}
      ${link
        ? html`<a data-apply href=${link} target="_blank" rel="noopener noreferrer"
              class="btn btn-primary btn-sm gap-1.5 rounded-full">
              ${Icon("lucide:send", "text-[1em]")}<span>${T(t, "applyBtn")}</span></a>`
        : html`<span data-apply class="font-mono text-[0.8rem] text-muted select-all">${j.contact}</span>`}
    </div>
  <//>`;
}

function Field({ label, children }) {
  return html`<label class="block">
    <span class="block mb-1 text-[0.82rem] font-medium text-muted">${label}</span>
    ${children}
  </label>`;
}

function PostSheet({ t, loc, onClose }) {
  const open = useStore($post);
  const sent = useStore($sent);
  const posting = useStore($posting);
  const err = useStore($err);
  const f = useStore($form);
  const input = "input input-bordered w-full bg-base-200/60";

  return html`<${Sheet} id="jobx-post" open=${open} onClose=${onClose}
      title=${T(t, "postTitle")} icon="lucide:briefcase">
    ${sent
      ? html`<div data-sent class="flex flex-col items-center gap-3 py-8 text-center">
          <span class="grid place-items-center w-14 h-14 rounded-full bg-[var(--app-accent)]/15 text-[var(--app-accent)]">
            ${Icon("lucide:check", "text-2xl")}
          </span>
          <div class="text-lg font-semibold">${T(t, "sentTitle")}</div>
          <p class="max-w-xs text-muted">${T(t, "sentBody")}</p>
          <button class="btn btn-primary btn-sm rounded-full mt-1" onClick=${onClose}>${T(t, "close")}</button>
        </div>`
      : html`<form data-form class="flex flex-col gap-[var(--ms-gap)] pb-2" onSubmit=${(e) => { e.preventDefault(); submit(t); }}>
          <${Field} label=${T(t, "fldTitle")}>
            <input data-f-title class=${input} value=${f.title} maxlength="120"
              placeholder=${T(t, "fldTitlePh")} onInput=${(e) => $form.setKey("title", e.currentTarget.value)} />
          <//>
          <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
            <${Field} label=${T(t, "fldCompany")}>
              <input data-f-company class=${input} value=${f.company} maxlength="100"
                placeholder=${T(t, "fldCompanyPh")} onInput=${(e) => $form.setKey("company", e.currentTarget.value)} />
            <//>
            <${Field} label=${T(t, "fldCity")}>
              <select data-f-city class="select select-bordered w-full bg-base-200/60" value=${f.city}
                onChange=${(e) => $form.setKey("city", e.currentTarget.value)}>
                ${Object.entries(CITIES).map(([k, c]) => html`<option value=${k} selected=${f.city === k}>${c[loc] || c.uk}</option>`)}
              </select>
            <//>
          </div>
          <${Field} label=${T(t, "fldEmployment")}>
            <div class="flex flex-wrap gap-1.5">
              ${EMPLOYMENT.map((e) => html`<button type="button" data-emp=${e}
                class=${`btn btn-sm rounded-full ${f.employment === e ? "btn-primary" : "btn-ghost border border-base-content/15"}`}
                onClick=${() => $form.setKey("employment", e)}>${T(t, empKey[e])}</button>`)}
            </div>
          <//>
          <${Field} label=${T(t, "fldSalary")}>
            <input data-f-salary class=${input} value=${f.salary} maxlength="80"
              placeholder=${T(t, "fldSalaryPh")} onInput=${(e) => $form.setKey("salary", e.currentTarget.value)} />
          <//>
          <${Field} label=${T(t, "fldDesc")}>
            <textarea data-f-desc rows="4" class="textarea textarea-bordered w-full bg-base-200/60 leading-relaxed"
              value=${f.description} maxlength="2000" placeholder=${T(t, "fldDescPh")}
              onInput=${(e) => $form.setKey("description", e.currentTarget.value)}></textarea>
          <//>
          <${Field} label=${T(t, "fldContact")}>
            <input data-f-contact class=${input} value=${f.contact} maxlength="200"
              placeholder=${T(t, "fldContactPh")} onInput=${(e) => $form.setKey("contact", e.currentTarget.value)} />
          <//>
          ${err ? html`<div data-err class="text-[0.85rem] text-error">${T(t, err)}</div>` : null}
          <button data-submit type="submit" class="btn btn-primary rounded-full mt-1" disabled=${posting}>
            ${posting ? T(t, "submitting") : T(t, "submit")}
          </button>
        </form>`}
  <//>`;
}
