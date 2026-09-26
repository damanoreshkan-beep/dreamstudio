// mayak — a beam across the network, told for people, not for engineers (owner, 2026-09-25: "не технічний,
// motion, все візуалізація … люди не розуміють що таке хост … фільтри категорії як у shodan-lite"). Three
// views over one key that lives on the edge (microspec-edge: shodan.js → the isolated shodan process; net.js).
//   map   — pick a CATEGORY (cameras, databases, access…), see it on the globe, read each result in plain words.
//   state — the account card (query credits 0 on edu → the map runs on fixture and says «Демодані»).
//   trace — a site's path and DNS, drawn as branches that grow in.
import { html } from "htm/preact";
import { useState, useMemo, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { animate, stagger } from "motion";
import { T } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { Panel, Island, Segmented, Sheet } from "/_rt/ui.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { session, restore } from "/_rt/auth.js";
import { gate } from "/_rt/gate.js";
import { CATEGORIES, KIND_OF, presetQuery, parseQuery } from "./categories.js";
import fixture from "./fixture.json" with { type: "json" };

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const ACCENT = "#F5B94D";
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const CAT_ICON = { camera: "lucide:cctv", database: "lucide:database", access: "lucide:monitor", files: "lucide:folder-open", device: "lucide:printer", vuln: "lucide:shield-alert" };
// A vendor preset narrows the fixture by product; the "all" preset (first of a category) does not.
const VENDOR = { cam_dahua: "Dahua", cam_hik: "Hikvision", cam_axis: "Axis", db_mongo: "Mongo", db_redis: "Redis", db_mysql: "MySQL", db_postgres: "PostgreSQL", elastic: "Elastic", acc_rdp: "RDP", ssh: "SSH", vnc: "VNC" };
// A name server's hostname is jargon; a person recognises the company behind it. Map the well-known ones, else
// fall back to the registrable label (ns-1567.awsdns-03.co.uk → AWS, sdns3.ultradns.org → UltraDNS).
const NS_ORG = { ultradns: "UltraDNS", awsdns: "AWS", cloudflare: "Cloudflare", googledomains: "Google", google: "Google", azure: "Azure", dnsimple: "DNSimple", nsone: "NS1", akamai: "Akamai", domaincontrol: "GoDaddy", dnsmadeeasy: "DNS Made Easy" };
const nsOrg = (host) => {
  const parts = String(host || "").toLowerCase().split(".");
  for (const seg of parts) for (const k in NS_ORG) if (seg.includes(k)) return NS_ORG[k];
  return parts.length >= 2 ? parts[parts.length - 2].replace(/[-_]\d.*$/, "").replace(/^./, (c) => c.toUpperCase()) : String(host || "");
};

export function map({ S }) {
  const t = useStore(S.t);
  const me = useStore(session);
  const [cat, setCat] = useState(gate ? null : "cameras");   // gate browses the fixture; live opens on cameras
  const [preset, setPreset] = useState(null);  // a refined kind within the category
  const [country, setCountry] = useState("all");
  const [sel, setSel] = useState(null);
  const [hosts, setHosts] = useState(gate ? fixture.matches : []);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(!gate);
  const [onlyVuln, setOnlyVuln] = useState(false);
  const [reason, setReason] = useState("");
  const [free, setFree] = useState(null);      // a free-text search, when one is active (clears the category)
  const [adv, setAdv] = useState("");
  const [advOpen, setAdvOpen] = useState(false);

  const activeCat = CATEGORIES.find((c) => c.id === cat) || null;
  const catKind = activeCat ? KIND_OF[activeCat.presets[0]] : null;
  const kindOfSel = free ? null : catKind;

  // One live query. Under the gate we never fetch — the fixture IS the screen, deterministically. Signed out,
  // the call 401s and the runtime's sealed transport raises the systemic sign-in wall; when the user signs in
  // `session` updates, the mount effect re-runs and the same query loads for real. On the edu plan the free
  // first page is a 200 with real hosts (no query credit spent), so a signed-in user always gets live data.
  const seq = useRef(0);
  const runLive = async (query, kind) => {
    if (!query || gate) return;
    const my = ++seq.current;
    setReason(""); setLoading(true);
    try {
      const r = await fetch(VPS_PROXY + "/shodan/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, country: country === "all" ? "" : country }) });
      const j = await r.json().catch(() => null);
      if (my !== seq.current) return;
      if (r.ok && j && Array.isArray(j.matches)) {
        setHosts(j.matches.map((m) => ({ ...m, kind: kind || m.kind || "access" }))); setLive(true); setSel(null);
        if (!j.matches.length) setReason("noHosts");
      } else setReason(j && j.error === "no_key" ? "noKey" : j && j.error === "no_query_credits" ? "creditsWarn" : "updFail");
    } catch { if (my === seq.current) setReason("updFail"); }
    finally { if (my === seq.current) setLoading(false); }
  };

  // Live-first: on mount (and whenever the session changes), load the open category for real. restore()
  // rehydrates a stored session first so a signed-in user does not hit the wall on a cold open.
  useEffect(() => {
    if (gate) return;
    let alive = true;
    (async () => {
      if (!me) await restore().catch(() => null);
      if (!alive) return;
      const q = free ? parseQuery(free, country).query : cat ? presetQuery(activeCat.presets[0], country) : "";
      if (q) runLive(q, kindOfSel);
    })();
    return () => { alive = false; };
  }, [me]);   // eslint-disable-line

  const pickCat = (id) => {
    const next = id === cat ? null : id;
    setCat(next); setPreset(null); setSel(null); setFree(null); setOnlyVuln(false);
    if (next) { const p = CATEGORIES.find((c) => c.id === next).presets[0]; runLive(presetQuery(p, country), KIND_OF[p]); }
  };
  const pickPreset = (p) => { setPreset(p); setSel(null); setFree(null); runLive(presetQuery(p, country), KIND_OF[p]); };
  const pickCountry = (cc) => {
    setCountry(cc); setSel(null);
    const q = free ? parseQuery(free, cc).query : preset ? presetQuery(preset, cc) : cat ? presetQuery(activeCat.presets[0], cc) : "";
    if (q) runLive(q, kindOfSel);
  };
  const runFree = () => {
    const parsed = parseQuery(adv.trim(), country);
    if (!parsed.query) return;
    setCat(null); setPreset(null); setFree(adv.trim()); setSel(null); setOnlyVuln(false); setAdvOpen(false);
    runLive(parsed.query, null);
  };

  // The set every facet summarises: live results as-is, or (under the gate) the fixture narrowed to the
  // chosen category and vendor. Country and the vulnerable toggle then filter what is DISPLAYED on top of it.
  const base = useMemo(() => {
    if (!gate) return hosts;
    const vend = preset && VENDOR[preset] ? VENDOR[preset].toLowerCase() : null;
    return hosts.filter((h) => (!catKind || h.kind === catKind) && (!vend || (h.product || "").toLowerCase().includes(vend)));
  }, [hosts, catKind, preset]);

  const shown = useMemo(() =>
    base.filter((h) => (country === "all" || h.cc === country) && (!onlyVuln || h.vulns > 0)),
    [base, country, onlyVuln]);

  const facets = useMemo(() => {
    const m = new Map(), name = new Map();
    for (const h of base) if (h.cc) { m.set(h.cc, (m.get(h.cc) || 0) + 1); if (!name.has(h.cc)) name.set(h.cc, h.country || h.cc); }
    return [...m].map(([cc, n]) => ({ cc, n, label: name.get(cc) })).sort((a, b) => b.n - a.n).slice(0, 6);
  }, [base]);
  const vulnTotal = useMemo(() => base.filter((h) => h.vulns > 0).length, [base]);

  const color = (h) => h.vulns > 0 ? "#F2777A" : ACCENT;
  const points = shown.map((h) => ({ lat: h.lat, lon: h.lon, r: 5, color: color(h), pulse: !!sel && sel.ip === h.ip, host: h }));
  const focus = sel ? { lat: sel.lat, lon: sel.lon } : null;
  const pick = ({ point }) => { if (point && point.host) setSel(point.host); };

  const kindWord = (h) => T(t, "kind." + (h.kind || "access"));
  const summary = (h) => [h.city ? T(t, "sumPlace", { city: h.city }) : "", T(t, "sumPorts", { n: h.ports || 1 }), h.vulns > 0 ? T(t, "sumVulns", { n: h.vulns }) : T(t, "sumSafe")].filter(Boolean).join(". ") + ".";
  const skeleton = loading && !shown.length;

  const row = (h) => html`<button key=${h.ip} data-result=${h.ip} aria-pressed=${!!sel && sel.ip === h.ip}
    class=${"flex items-start gap-3 w-full text-left px-2 py-2 rounded-[var(--ms-r-in)] transition-colors " + (sel && sel.ip === h.ip ? "sf-pressed" : "hover:bg-base-content/5")}
    onClick=${() => setSel(h)}>
    <span class="w-9 h-9 shrink-0 rounded-[var(--ms-r-in)] grid place-items-center" style=${{ background: color(h) + "22", color: color(h) }}>${Icon(CAT_ICON[h.kind] || "lucide:radio-tower", "text-lg")}</span>
    <span class="min-w-0 grow">
      <span class="flex items-center gap-2">
        <span class="font-semibold leading-tight truncate">${kindWord(h)}${h.product ? html` · <span class="font-normal text-base-content/80">${h.product}</span>` : null}</span>
      </span>
      <span class="block text-sm text-base-content/80 leading-snug">${summary(h)}</span>
      <span class="block font-mono text-xs text-muted truncate">${h.ip}${h.org ? " · " + h.org : ""}</span>
    </span>
  </button>`;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-shown=${shown.length} data-cat=${cat || ""} data-live=${live ? "1" : null}>
    <${Globe} points=${points} focus=${focus} spin=${!sel} onPick=${pick} />

    ${sel ? html`<${Panel} data-host=${sel.ip}>
      <div class="flex items-start gap-3">
        <span class="w-10 h-10 shrink-0 rounded-[var(--ms-r-in)] grid place-items-center" style=${{ background: color(sel) + "22", color: color(sel) }}>${Icon(CAT_ICON[sel.kind] || "lucide:radio-tower", "text-xl")}</span>
        <div class="min-w-0 grow">
          <div class="font-semibold leading-tight">${kindWord(sel)}${sel.product ? html` · <span class="font-normal text-base-content/80">${sel.product}</span>` : null}</div>
          <div class="text-sm text-base-content/80 leading-snug mt-0.5">${summary(sel)}</div>
          <div class="font-mono text-xs text-muted mt-1">${sel.ip}${sel.org ? " · " + sel.org : ""}</div>
        </div>
        <button class="btn btn-ghost btn-xs btn-circle shrink-0" onClick=${() => setSel(null)} aria-label=${T(t, "close")}>${Icon("lucide:x", "text-base")}</button>
      </div>
    <//>` : null}

    <${Island}>
      <div class=${LABEL + " mb-2"}>${T(t, "pick")}</div>
      <div class="grid grid-cols-3 gap-1.5">
        ${CATEGORIES.map((c) => {
          const on = c.id === cat;
          return html`<button key=${c.id} data-cat-btn=${c.id} aria-pressed=${on}
            class=${"flex flex-col items-center justify-center gap-1 py-2 rounded-[var(--ms-r-in)] " + (on ? "sf-pressed" : "sf-raised")}
            onClick=${() => pickCat(c.id)}>
            <span style=${on ? { color: ACCENT } : null}>${Icon(c.icon, "text-xl")}</span>
            <span class="text-[length:var(--ms-label)]">${T(t, "cat." + c.id)}</span>
          </button>`;
        })}
      </div>

      ${activeCat ? html`<div class="mt-2">
        <${Segmented} items=${activeCat.presets.map((p) => ({ id: p, label: T(t, "cat." + activeCat.id + "." + p) }))}
          value=${preset || activeCat.presets[0]} onChange=${pickPreset} variant="outline" size="sm" scroll attr="data-preset" />
      </div>` : null}

      ${free ? html`<div class="mt-2 flex items-center gap-2 text-sm">
        <span class="text-base-content/70 shrink-0">${Icon("lucide:search", "text-base")}</span>
        <span class="font-mono truncate grow">${free}</span>
        <button class="btn btn-ghost btn-xs btn-circle shrink-0" onClick=${() => pickCat("cameras")} aria-label=${T(t, "close")}>${Icon("lucide:x", "text-base")}</button>
      </div>` : null}

      <div class="mt-2 flex items-center justify-between gap-2 min-h-6" data-status=${reason || (loading ? "loading" : shown.length ? "ok" : "empty")}>
        <span class=${LABEL}>${loading ? T(t, "scanning") : shown.length ? html`${T(t, "found")} · ${shown.length}` : T(t, "noHosts")}</span>
        ${reason ? html`<span class="text-xs text-warning text-right">${T(t, reason)}</span>`
          : gate ? html`<span data-sample class="badge badge-ghost gap-1 font-mono text-xs uppercase tracking-wider">${Icon("lucide:flask-conical")} ${T(t, "sample")}</span>` : null}
      </div>
    <//>

    ${(facets.length > 1 || vulnTotal > 0) ? html`<${Island}>
      <div class=${LABEL + " mb-2"}>${T(t, "atAGlance")}</div>
      <div class="flex flex-wrap gap-1.5">
        <button data-facet="all" aria-pressed=${country === "all"} onClick=${() => pickCountry("all")}
          class=${"badge gap-1 " + (country === "all" ? "badge-primary" : "badge-ghost")}>${T(t, "everywhere")}</button>
        ${facets.map((f) => html`<button key=${f.cc} data-facet=${f.cc} aria-pressed=${country === f.cc} onClick=${() => pickCountry(f.cc)}
          class=${"badge gap-1.5 " + (country === f.cc ? "badge-primary" : "badge-ghost")}>${f.label} <span class="font-mono tabular-nums opacity-70">${f.n}</span></button>`)}
        ${vulnTotal > 0 ? html`<button data-facet="vuln" aria-pressed=${onlyVuln} onClick=${() => setOnlyVuln((v) => !v)}
          class=${"badge gap-1.5 " + (onlyVuln ? "badge-error" : "badge-ghost")} style=${onlyVuln ? null : { color: "#F2777A" }}>${Icon("lucide:shield-alert", "text-sm")} ${T(t, "onlyVulns")} <span class="font-mono tabular-nums opacity-70">${vulnTotal}</span></button>` : null}
      </div>
    <//>` : null}

    <${Panel} title=${T(t, "results")} data-list=${shown.length}>
      <button class="btn btn-ghost btn-sm w-full justify-start gap-2" onClick=${() => setAdvOpen(true)} data-adv>
        ${Icon("lucide:search", "text-lg text-base-content/70")}<span class="text-base-content/70 font-normal">${T(t, "searchPlaceholder")}</span>
      </button>
      ${skeleton
        ? html`<div class="flex flex-col gap-1">${[0, 1, 2, 3, 4].map((i) => html`<div key=${i} class="flex items-start gap-3 px-2 py-2">
            <span class="w-9 h-9 shrink-0 rounded-[var(--ms-r-in)] bg-base-content/10 animate-pulse"></span>
            <span class="grow flex flex-col gap-1.5 pt-0.5"><span class="h-3 w-1/2 rounded bg-base-content/10 animate-pulse"></span><span class="h-3 w-3/4 rounded bg-base-content/10 animate-pulse"></span></span>
          </div>`)}</div>`
        : shown.length
          ? html`<div class="flex flex-col divide-y divide-base-300/40">${shown.map(row)}</div>`
          : html`<div class="text-sm text-muted py-6 text-center">${T(t, "noHosts")}</div>`}
    <//>

    <${Sheet} id="adv" open=${advOpen} onClose=${() => setAdvOpen(false)} title=${T(t, "advanced")} subtitle=${T(t, "searchHint")} locale=${useStore(S.locale)}>
      <label class="input flex items-center gap-2 h-[var(--ms-ctl)] rounded-[var(--ms-r-in)]">
        ${Icon("lucide:terminal", "text-lg text-base-content/70")}
        <input id="adv-q" class="grow bg-transparent outline-none font-mono text-sm" value=${adv}
          onInput=${(e) => setAdv(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") runFree(); }} placeholder=${T(t, "searchPlaceholder")} />
      </label>
      <button class="btn btn-primary w-full mt-3" onClick=${runFree} disabled=${!adv.trim()}>${T(t, "searchBtn")}</button>
    <//>
  </div>`;
}

export function state({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), me = useStore(session);
  const [acc, setAcc] = useState(fixture.account);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (gate) return;   // the gate's session is a mock; the fixture card is what it renders
      const s = me || await restore().catch(() => null);
      if (!s || !alive) return;
      try {
        const r = await fetch(VPS_PROXY + "/shodan/info");
        if (!r.ok) return;
        const j = await r.json();
        if (alive && j && typeof j.scan_credits === "number") { setAcc(j); setLive(true); }
      } catch { /* fixture stays */ }
    })();
    return () => { alive = false; };
  }, [me]);

  const num = (n) => n == null ? "—" : Number(n).toLocaleString(loc === "uk" ? "uk-UA" : "en-US");
  const row = (icon, label, val, warn) => html`<div class="flex items-center gap-2.5 py-2">
    <span class="text-base-content/70 shrink-0 w-5 text-center">${Icon(icon)}</span>
    <span class="grow text-sm">${label}</span>
    <span class=${"font-mono font-semibold tabular-nums " + (warn ? "text-warning" : "")}>${val}</span>
  </div>`;
  const lim = acc.usage_limits || {};

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-plan=${acc.plan || ""} data-live=${live ? "1" : null}>
    <${Panel} title=${T(t, "sPlan")}>
      <div class="divide-y divide-base-300/40">
        ${row("lucide:badge-check", T(t, "sPlan"), (acc.plan || "—").toUpperCase())}
        ${row("lucide:search", T(t, "sQuery"), num(acc.query_credits), acc.query_credits === 0)}
        ${row("lucide:scan-line", T(t, "sScan"), num(acc.scan_credits))}
        ${row("lucide:eye", T(t, "sMonitored"), num(acc.monitored_ips))}
        ${row("lucide:lock", T(t, "sHttps"), acc.https ? T(t, "yes") : T(t, "no"))}
        ${row("lucide:unlock", T(t, "sUnlocked"), acc.unlocked ? T(t, "yes") : T(t, "no"))}
      </div>
      ${live ? null : html`<div class="flex justify-end"><span data-sample class="badge badge-ghost gap-1 font-mono text-xs uppercase tracking-wider">${Icon("lucide:flask-conical")} ${T(t, "sample")}</span></div>`}
    <//>
    <${Panel} title=${T(t, "sLimits")}>
      <div class="divide-y divide-base-300/40">
        ${row("lucide:search", T(t, "sQuery"), num(lim.query_credits))}
        ${row("lucide:scan-line", T(t, "sScan"), num(lim.scan_credits))}
        ${row("lucide:eye", T(t, "sMonitored"), num(lim.monitored_ips))}
      </div>
    <//>
  </div>`;
}

// trace — a site's path and names, as motion. DNS is a set of BRANCHES that grow out of the site node; the
// route is a run of nodes whose latency bars sweep in. Browsers cannot traceroute, so both come from the edge
// (/feed/net/trace, /feed/net/dns) — every process exits through the VPN, so the path leaves from OUR node.
export function trace({ S }) {
  const t = useStore(S.t);
  const [mode, setMode] = useState("site");
  const [target, setTarget] = useState(fixture.trace.target);
  const [dns, setDns] = useState(fixture.dns);
  const [hops, setHops] = useState(fixture.trace.hops);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const treeRef = useRef(null);
  const hopsRef = useRef(null);

  const run = async () => {
    const to = mode === "me" ? "me" : target.trim();
    if (!to || busy) return;
    setBusy(true); setFailed(false);
    try {
      const q = encodeURIComponent(to);
      const [tr, dn] = await Promise.all([
        fetch(VPS_PROXY + "/net/trace?target=" + q).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(VPS_PROXY + "/net/dns?name=" + q).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (tr && Array.isArray(tr.hops) && tr.hops.length) { setHops(tr.hops); setLive(true); } else setFailed(true);
      if (dn && dn.records) setDns(dn);
    } finally { setBusy(false); }
  };

  // The branches sprout: each leaf fades and slides out from the trunk, staggered. The hop bars sweep to width.
  useEffect(() => {
    if (treeRef.current) {
      const leaves = treeRef.current.querySelectorAll("[data-leaf]");
      if (leaves.length) animate(leaves, { opacity: [0, 1], transform: ["translateX(-8px)", "translateX(0px)"] }, { duration: 0.4, delay: stagger(0.05), ease: "easeOut" });
    }
  }, [dns]);
  useEffect(() => {
    if (hopsRef.current) {
      const bars = hopsRef.current.querySelectorAll("[data-bar]");
      if (bars.length) animate(bars, { transform: ["scaleX(0)", "scaleX(1)"] }, { duration: 0.5, delay: stagger(0.04), ease: "easeOut" });
    }
  }, [hops]);

  const branch = (label, arr) => arr && arr.length ? html`<div class="flex items-stretch gap-2">
    <div class="relative w-5 shrink-0">
      <span class="absolute left-2 top-0 bottom-0 w-px" style=${{ background: ACCENT + "44" }}></span>
    </div>
    <div class="min-w-0 grow py-1">
      <div class=${LABEL + " mb-1"}>${label}</div>
      <div class="flex flex-wrap gap-1.5">
        ${arr.map((v) => html`<span data-leaf class="badge badge-ghost font-mono text-xs" style=${{ textTransform: "none" }}>${v}</span>`)}
      </div>
    </div>
  </div>` : null;

  const maxRtt = Math.max(1, ...hops.map((h) => h.rtt || 0));
  // The plain-language answer to "and what does this mean?" (owner, 2026-09-25, looking at raw hops).
  const answered = hops.filter((h) => h.rtt != null).length;
  const hidden = hops.filter((h) => !h.ip).length;
  const reachMs = Math.round(Math.max(0, ...hops.map((h) => h.rtt || 0)));
  const addr = (dns.records && dns.records.A && dns.records.A[0]) || dns.ip || "";
  const nsLeaves = [...new Set((dns.records && dns.records.NS || []).map(nsOrg))];

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-hops=${hops.length} data-live=${live ? "1" : null} data-busy=${busy ? "1" : null}>
    <${Island}>
      <${Segmented} items=${[{ id: "site", label: T(t, "toSite") }, { id: "me", label: T(t, "toMe") }]}
        value=${mode} onChange=${setMode} variant="solid" size="sm" attr="data-mode" />
      <div class="flex items-center gap-2 mt-2">
        ${mode === "site"
          ? html`<label class="input flex items-center gap-2 grow h-[var(--ms-ctl)] rounded-[var(--ms-r-in)]">
              ${Icon("lucide:globe", "text-lg text-base-content/70")}
              <input id="trace-target" type="text" autocomplete="off" inputmode="url" class="grow bg-transparent outline-none" value=${target}
                onInput=${(e) => setTarget(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") run(); }} placeholder=${T(t, "targetPlaceholder")} />
            </label>`
          : html`<div class="grow flex items-center gap-2 h-[var(--ms-ctl)] px-1 text-sm text-base-content/70">${Icon("lucide:arrow-down-to-line", "text-lg")}<span>${T(t, "fromNode")}</span></div>`}
        <button class="btn btn-primary h-[var(--ms-ctl)] rounded-[var(--ms-r-in)]" onClick=${run} disabled=${busy || (mode === "site" && !target.trim())} data-trace>${T(t, "traceBtn")}</button>
      </div>
      ${failed ? html`<div class="mt-2 text-xs text-warning" data-fail>${T(t, "traceFail")}</div>` : null}
    <//>

    <${Panel} title=${T(t, "meaning")} data-meaning>
      <div class="flex items-start gap-2.5 text-sm leading-snug">
        <span class="shrink-0 mt-0.5" style=${{ color: ACCENT }}>${Icon("lucide:sparkles", "text-lg")}</span>
        <div class="flex flex-col gap-1.5">
          <p>${T(t, "routeLede", { n: answered, ms: reachMs })}${hidden ? " " + T(t, "routeHidden", { n: hidden }) : ""}</p>
          ${addr ? html`<p>${T(t, "dnsAddr", { ip: addr })}${nsLeaves.length ? " " + T(t, "dnsNames", { orgs: nsLeaves.join(", ") }) : ""}</p>` : null}
        </div>
      </div>
    <//>

    <${Panel} title=${T(t, "dnsTree")} data-dns=${dns.ip || ""}>
      <div class="flex items-center gap-2.5 pb-2 mb-1 border-b border-base-300/40">
        <span class="w-9 h-9 shrink-0 rounded-[var(--ms-r-in)] grid place-items-center" style=${{ background: ACCENT + "22", color: ACCENT }}>${Icon("lucide:git-branch", "text-lg")}</span>
        <div class="min-w-0">
          <div class="font-mono font-semibold truncate">${mode === "me" ? T(t, "myIp") : target}</div>
          ${dns.ptr ? html`<div class="font-mono text-xs text-muted truncate">${dns.ptr}</div>` : dns.ip ? html`<div class="font-mono text-xs text-muted truncate">${dns.ip}</div>` : null}
        </div>
      </div>
      <div ref=${treeRef} class="flex flex-col">
        ${branch(T(t, "lblAddr"), dns.records && dns.records.A)}
        ${branch(T(t, "lblAddr6"), dns.records && dns.records.AAAA)}
        ${branch(T(t, "lblNames"), nsLeaves)}
      </div>
    <//>

    <${Panel}>
      <div class="flex items-center justify-between gap-2">
        <span class=${LABEL}>${T(t, "hops")} · ${hops.length}${live ? " · " + T(t, "fromNode") : ""}</span>
        ${live ? null : html`<span data-sample class="badge badge-ghost gap-1 font-mono text-xs uppercase tracking-wider">${Icon("lucide:flask-conical")} ${T(t, "sample")}</span>`}
      </div>
      <ol ref=${hopsRef} class="flex flex-col">
        ${hops.map((h, i) => html`<li class="flex items-stretch gap-3 py-1" data-hop=${h.n}>
          <div class="flex flex-col items-center">
            ${(h.host || h.ip)
              ? html`<span class="w-6 h-6 shrink-0 rounded-full grid place-items-center font-mono text-xs font-semibold tabular-nums text-base-content" style=${{ background: ACCENT + "33" }}>${h.n}</span>`
              : html`<span class="w-6 h-6 shrink-0 rounded-full grid place-items-center font-mono text-xs tabular-nums text-muted border border-dashed border-base-content/30">${h.n}</span>`}
            ${i < hops.length - 1 ? html`<span class="w-px grow" style=${{ background: ACCENT + "33" }}></span>` : null}
          </div>
          <div class="min-w-0 grow pb-1">
            ${(h.host || h.ip)
              ? html`<div class="font-mono text-sm truncate">${h.host || h.ip}</div>`
              : html`<div class="text-sm text-muted">${T(t, "hopHidden")}</div>`}
            ${h.host && h.ip ? html`<div class="font-mono text-xs text-base-content/70 truncate">${h.ip}</div>` : null}
            <div class="mt-1 h-1 rounded-full bg-base-300/40 overflow-hidden">
              <span data-bar class="block h-full rounded-full origin-left" style=${{ width: (h.rtt != null ? Math.max(2, Math.round(h.rtt / maxRtt * 100)) : 0) + "%", background: ACCENT }}></span>
            </div>
          </div>
          <div class="shrink-0 self-center font-mono text-xs tabular-nums text-base-content/70 w-16 text-right">${h.rtt != null ? h.rtt.toFixed(1) + " ms" : "—"}</div>
        </li>`)}
      </ol>
    <//>
  </div>`;
}
