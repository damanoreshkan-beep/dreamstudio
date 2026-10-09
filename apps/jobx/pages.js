import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { Island } from "/_rt/ui.js";
import { T, ago } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";
import { EMPLOYMENT, empKey, CITIES, CITY_IDS, cityName, inCity, $city, DISTRICTS, $jobs, $sent, $posting, $err, $form, jobById, shortSalary, kmFromCentre, applyLink, streetOf, salaryNote, rowTitle, isNew } from "./jobs.js";

export const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

export function JobRow({ t, j, loc, onOpen }) {
  const km = kmFromCentre(j.lat, j.lon), pay = shortSalary(j.salary), street = streetOf(j.address);
  const age = Number.isFinite(j.ms) ? ago(t, j.ms, loc) : "";
  return html`<button data-job-row class="w-full text-left card sf-raised sf-e2 rounded-[var(--ms-r)] active:scale-[.99] transition" onClick=${onOpen}>
    <div class="card-body p-[var(--ms-pad)] gap-1.5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1"><div data-job-title class="font-semibold leading-tight line-clamp-2">${rowTitle(j.title)}</div>
          <div class="text-[0.88rem] text-muted truncate">${j.company}</div></div>
        <div class="shrink-0 max-w-[min(22ch,45%)] flex flex-col items-end gap-0.5 pt-0.5">
          ${pay
            ? html`<div class="font-mono text-[0.8rem] font-semibold whitespace-nowrap tabular-nums">${pay}</div>`
            : j.salary ? html`<div data-job-pay-text class="text-[0.78rem] text-muted truncate max-w-full">${j.salary}</div>` : null}
          ${age ? html`<div data-job-age class="flex items-center gap-1 font-mono text-[0.68rem] uppercase tracking-wide text-muted whitespace-nowrap">${isNew(j) ? html`<span data-job-new aria-hidden="true" class="w-1.5 h-1.5 rounded-full bg-[var(--app-accent)]"></span>` : null}${age}</div>` : null}
        </div>
      </div>
      <div class="flex items-center gap-2 text-[0.76rem] text-muted min-w-0">
        ${j.employment && empKey[j.employment] ? html`<span class="badge badge-sm badge-ghost shrink-0">${T(t, empKey[j.employment])}</span>` : null}
        ${street ? html`<span class="flex items-center gap-1 min-w-0">${Icon("lucide:map-pin", "text-[0.95em] shrink-0")}<span class="truncate">${street}</span></span>` : null}
        ${km != null ? html`<span class="ml-auto shrink-0 whitespace-nowrap font-mono tabular-nums">${km} ${T(t, "km")}</span>` : null}
      </div>
    </div>
  </button>`;
}

function Page({ t, title, onBack, children }) {
  return html`<div data-page class="fixed inset-0 z-40 bg-base-200 overflow-y-auto ms-detail-in">
    <header class="navbar sticky top-0 z-10 bg-base-100 sf-e2 px-2 gap-1 min-h-14" style="padding-top:env(safe-area-inset-top)">
      <button data-back class="btn btn-ghost btn-sm btn-circle" aria-label=${T(t, "back")} onClick=${onBack}>${Icon("lucide:arrow-left", "text-xl")}</button>
      <div class="flex-1 font-bold tracking-tight truncate px-1">${title}</div>
    </header>
    <div class="px-[var(--ms-pad)] py-[var(--ms-gap)] max-w-2xl mx-auto pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+1rem)]">${children}</div>
  </div>`;
}

function JobPage({ t, id, onBack }) {
  const j = jobById(id);
  if (!j) return html`<${Page} t=${t} title=${T(t, "job")} onBack=${onBack}><div class="text-muted py-10 text-center">—</div><//>`;
  const km = kmFromCentre(j.lat, j.lon), link = applyLink(j.contact), pay = shortSalary(j.salary), note = salaryNote(j.salary);
  return html`<${Page} t=${t} title=${T(t, "job")} onBack=${onBack}>
    <div class="flex flex-col gap-[var(--ms-gap)] pb-[calc(var(--ms-ctl)+2rem)]">
      <div>
        <h1 class="text-2xl font-bold leading-tight break-words">${j.title}</h1>
        <div class="text-base-content/80 mt-0.5">${j.company}</div>
      </div>
      ${pay
        ? html`<div><div class="text-xl font-mono font-semibold tabular-nums">${pay}</div>${note ? html`<div data-pay-note class="text-[0.85rem] text-muted">${note}</div>` : null}</div>`
        : j.salary ? html`<div class="text-base-content/80">${j.salary}</div>` : null}
      ${j.employment && empKey[j.employment] ? html`<div><span class="badge badge-neutral">${T(t, empKey[j.employment])}</span></div>` : null}
      ${j.address || km != null
        ? html`<div data-job-where class="flex items-start gap-1.5 text-[0.9rem] text-muted">${Icon("lucide:map-pin", "shrink-0 mt-[0.2em]")}<span>${j.address || ""}${j.address && km != null ? " · " : ""}${km != null ? `${km} ${T(t, "kmFromCentre")}` : ""}</span></div>`
        : null}
      ${j.description ? html`<p class="text-[0.98rem] leading-relaxed whitespace-pre-line text-base-content/90">${j.description}</p>` : null}
      ${j.poster ? html`<div class="text-[0.82rem] text-muted">${T(t, "postedBy")}: ${j.poster}</div>` : null}
    </div>
    ${""}
    <div class="fixed inset-x-0 z-20 flex justify-center px-3 pointer-events-none" style="bottom:calc(env(safe-area-inset-bottom) + 0.75rem)">
      <${Island} tone="glass" className=${`pointer-events-auto ${link ? "!p-1 rounded-full w-full max-w-md" : "!p-2 rounded-[var(--ms-r)] w-full max-w-md"}`}>
        ${link
          ? html`<a data-apply href=${link} target="_blank" rel="noopener noreferrer" class="btn btn-primary rounded-full gap-2 w-full">${Icon("lucide:send")}<span>${T(t, "applyBtn")}</span></a>`
          : html`<div data-apply class="font-mono text-center select-all px-3 py-2 truncate">${j.contact}</div>`}
      <//>
    </div>
  <//>`;
}

function Field({ label, children }) {
  return html`<label class="block"><span class="block mb-1 text-[0.82rem] font-medium text-muted">${label}</span>${children}</label>`;
}
function PostPage({ t, loc, onBack }) {
  const sent = useStore($sent), posting = useStore($posting), err = useStore($err), f = useStore($form);
  const city = useStore($city);
  const input = "input input-bordered w-full bg-base-100";
  const submit = async () => {
    if ($posting.get()) return;
    if (!f.title.trim() || !f.company.trim() || !f.description.trim() || !f.contact.trim()) { $err.set("errFields"); return; }
    let lat, lon, address;
    if (city === "kyiv") { const d = DISTRICTS[f.district] || DISTRICTS.shevchenkivskyi; lat = d.lat; lon = d.lon; address = (loc === "en" ? d.en : d.uk); }
    else { const c = CITIES[city]; lat = c.lat; lon = c.lon; address = cityName(city, loc); }
    const sess = session.get();
    if (!gate && !(sess && sess.sid)) { $err.set("needLogin"); return; }
    $err.set(null); $posting.set(true);
    try {
      if (!gate) { const r = await fetch(`${VPS_PROXY}/jobs/post`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sid: sess.sid, title: f.title, company: f.company, salary: f.salary, employment: f.employment, description: f.description, contact: f.contact, city, lat, lon, address }) }); if (!r.ok) throw new Error("post " + r.status); }
      $sent.set(true); ["title", "company", "salary", "description", "contact"].forEach((k) => $form.setKey(k, ""));
    } catch { $err.set("errFailed"); }
    $posting.set(false);
  };
  return html`<${Page} t=${t} title=${T(t, "postTitle")} onBack=${onBack}>
    ${sent
      ? html`<div data-sent class="flex flex-col items-center gap-3 py-12 text-center">
          <span class="grid place-items-center w-16 h-16 rounded-full bg-[var(--app-accent)]/15 text-[var(--app-accent)]">${Icon("lucide:check", "text-3xl")}</span>
          <div class="text-xl font-semibold">${T(t, "sentTitle")}</div><p class="max-w-sm text-muted">${T(t, "sentBody")}</p>
          <button class="btn btn-primary rounded-full mt-2" onClick=${onBack}>${T(t, "close")}</button></div>`
      : html`<form data-form class="flex flex-col gap-[var(--ms-gap)]" onSubmit=${(e) => { e.preventDefault(); submit(); }}>
          <${Field} label=${T(t, "fldTitle")}><textarea rows="1" data-line data-f-title class=${input} value=${f.title} maxlength="120" placeholder=${T(t, "fldTitlePh")} onInput=${(e) => $form.setKey("title", e.currentTarget.value)}></textarea><//>
          <div class="grid grid-cols-2 gap-[var(--ms-gap)]">
            <${Field} label=${T(t, "fldCompany")}><textarea rows="1" data-line data-f-company class=${input} value=${f.company} maxlength="100" placeholder=${T(t, "fldCompanyPh")} onInput=${(e) => $form.setKey("company", e.currentTarget.value)}></textarea><//>
            <${Field} label=${T(t, "fldSalary")}><textarea rows="1" data-line data-f-salary class=${input} value=${f.salary} maxlength="80" placeholder=${T(t, "fldSalaryPh")} onInput=${(e) => $form.setKey("salary", e.currentTarget.value)}></textarea><//>
          </div>
          ${city === "kyiv"
            ? html`<${Field} label=${T(t, "fldDistrict")}>
                <select data-f-district class="select select-bordered w-full bg-base-100" value=${f.district} onChange=${(e) => $form.setKey("district", e.currentTarget.value)}>
                  ${Object.entries(DISTRICTS).map(([k, d]) => html`<option value=${k} selected=${f.district === k}>${loc === "en" ? d.en : d.uk}</option>`)}
                </select>
              <//>`
            : html`<${Field} label=${T(t, "fldCity")}>
                <div class="input input-bordered w-full bg-base-100 flex items-center gap-2 opacity-80">${Icon("lucide:map-pin", "text-primary")}${cityName(city, loc)}</div>
              <//>`}
          <${Field} label=${T(t, "fldEmployment")}>
            <div class="flex flex-wrap gap-1.5">${EMPLOYMENT.map((e) => html`<button type="button" data-emp=${e} class=${`btn btn-sm rounded-full ${f.employment === e ? "btn-primary" : "btn-ghost border border-base-content/15"}`} onClick=${() => $form.setKey("employment", e)}>${T(t, empKey[e])}</button>`)}</div>
          <//>
          <${Field} label=${T(t, "fldDesc")}><textarea data-f-desc rows="5" class="textarea textarea-bordered w-full bg-base-100 leading-relaxed" value=${f.description} maxlength="2000" placeholder=${T(t, "fldDescPh")} onInput=${(e) => $form.setKey("description", e.currentTarget.value)}></textarea><//>
          <${Field} label=${T(t, "fldContact")}><textarea rows="1" data-line data-f-contact class=${input} value=${f.contact} maxlength="200" placeholder=${T(t, "fldContactPh")} onInput=${(e) => $form.setKey("contact", e.currentTarget.value)}></textarea><//>
          ${err ? html`<div data-err class="text-[0.9rem] text-error">${T(t, err)}</div>` : null}
          <button data-submit type="submit" class="btn btn-primary rounded-full mt-1" disabled=${posting}>${posting ? T(t, "submitting") : T(t, "submit")}</button>
        </form>`}
  <//>`;
}

function CityPage({ t, loc, onBack }) {
  const city = useStore($city);
  const jobs = useStore($jobs);
  const pick = (id) => { $city.set(id); onBack(); };
  return html`<${Page} t=${t} title=${T(t, "cityTitle")} onBack=${onBack}>
    <div class="flex flex-col gap-[var(--ms-gap)]">
      ${CITY_IDS.map((id) => { const n = jobs.filter((j) => inCity(j, id)).length; return html`<button key=${id} data-city-opt=${id} onClick=${() => pick(id)}
        class=${`w-full text-left card sf-raised rounded-[var(--ms-r)] active:scale-[.99] transition ${id === city ? "ring-2 ring-primary" : ""}`}>
        <div class="card-body p-[var(--ms-pad)] flex-row items-center gap-3">
          ${Icon("lucide:building-2", "text-xl text-primary")}
          <div class="flex-1 font-semibold">${cityName(id, loc)}</div>
          ${n ? html`<span class="badge badge-ghost badge-sm font-mono">${n}</span>` : null}
          ${id === city ? Icon("lucide:check", "text-primary text-xl") : null}
        </div>
      </button>`; })}
    </div>
  <//>`;
}

export function Screens({ t, loc, screen, close }) {
  if (screen === "search") return null;
  if (screen === "post") return html`<${PostPage} t=${t} loc=${loc} onBack=${close} />`;
  if (screen === "city") return html`<${CityPage} t=${t} loc=${loc} onBack=${close} />`;
  if (screen && screen.startsWith("job:")) return html`<${JobPage} t=${t} id=${screen.slice(4)} onBack=${close} />`;
  return null;
}
