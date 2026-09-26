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
import { CATEGORIES, KIND_OF, presetQuery } from "./categories.js";
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
  useEffect(() => { if (!me) restore().catch(() => {}); }, []);   // know if signed in without opening the wall
  const [cat, setCat] = useState(null);        // selected category id, or null = everything
  const [preset, setPreset] = useState(null);  // a refined kind within the category
  const [country, setCountry] = useState("all");
  const [sel, setSel] = useState(null);
  const [hosts, setHosts] = useState(fixture.matches);
  const [live, setLive] = useState(false);
  const [reason, setReason] = useState("");
  const [adv, setAdv] = useState("");
  const [advOpen, setAdvOpen] = useState(false);

  const activeCat = CATEGORIES.find((c) => c.id === cat) || null;
  const catKind = activeCat ? KIND_OF[activeCat.presets[0]] : null;

  const countries = useMemo(() => {
    const seen = new Map();
    for (const h of hosts) if (h.cc && !seen.has(h.cc)) seen.set(h.cc, h.country || h.cc);
    return [{ id: "all", label: T(t, "everywhere") }, ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({ id, label }))];
  }, [t, hosts]);

  const shown = useMemo(() => {
    const vend = preset && VENDOR[preset] ? VENDOR[preset].toLowerCase() : null;
    return hosts.filter((h) =>
      (!catKind || h.kind === catKind) &&
      (!vend || (h.product || "").toLowerCase().includes(vend)) &&
      (country === "all" || h.cc === country));
  }, [hosts, catKind, preset, country]);

  // Live search on the chosen preset (or the free query) — one query credit a page upstream. A refusal keeps
  // the fixture and names why; on the edu plan (0 credits) that is the normal path and the island says so.
  // Signed out, a category just filters the demo — it must NOT hit a signed-in-only route, or the 401 would
  // throw the systemic sign-in wall over someone who is only browsing. Live search augments once signed in
  // (with 0 credits the edge answers no_query_credits, a 200, so no wall).
  const runLive = async (query) => {
    if (!query || gate || !session.get()) return;   // the gate's session is a mock; never spend a real call under it
    setReason("");
    try {
      const r = await fetch(VPS_PROXY + "/shodan/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, country: country === "all" ? "" : country }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j && Array.isArray(j.matches) && j.matches.length) { setHosts(j.matches.map((m) => ({ ...m, kind: catKind || m.kind }))); setLive(true); setSel(null); }
      else setReason(j && j.error === "no_key" ? "noKey" : j && j.error === "no_query_credits" ? "creditsWarn" : "updFail");
    } catch { setReason("updFail"); }
  };

  const pickCat = (id) => {
    const next = id === cat ? null : id;
    setCat(next); setPreset(null); setSel(null);
    if (next) runLive(presetQuery(CATEGORIES.find((c) => c.id === next).presets[0], country));
  };
  const pickPreset = (p) => { setPreset(p); setSel(null); runLive(presetQuery(p, country)); };

  const color = (h) => h.vulns > 0 ? "#F2777A" : ACCENT;
  const points = shown.map((h) => ({ lat: h.lat, lon: h.lon, r: 5, color: color(h), pulse: !!sel && sel.ip === h.ip, host: h }));
  const focus = sel ? { lat: sel.lat, lon: sel.lon } : null;
  const pick = ({ point }) => { if (point && point.host) setSel(point.host); };

  const kindWord = (h) => T(t, "kind." + (h.kind || "access"));
  const summary = (h) => [h.city ? T(t, "sumPlace", { city: h.city }) : "", T(t, "sumPorts", { n: h.ports || 1 }), h.vulns > 0 ? T(t, "sumVulns", { n: h.vulns }) : T(t, "sumSafe")].filter(Boolean).join(". ") + ".";

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

      <div class="mt-2 flex items-center gap-2">
        <div class="grow min-w-0">
          <${Segmented} items=${countries} value=${country} onChange=${setCountry} variant="outline" size="sm" scroll attr="data-country" />
        </div>
        <button class="btn btn-ghost btn-sm btn-circle shrink-0" onClick=${() => setAdvOpen(true)} data-adv aria-label=${T(t, "advanced")}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
      </div>

      <div class="mt-2 flex items-center justify-between gap-2 min-h-6" data-status=${reason || (shown.length ? "ok" : "empty")}>
        <span class=${LABEL}>${shown.length ? html`${T(t, "found")} · ${shown.length}` : T(t, "noHosts")}</span>
        ${reason ? html`<span class="text-xs text-warning text-right">${T(t, reason)}</span>` : live ? null : html`<span data-sample class="badge badge-ghost gap-1 font-mono text-xs uppercase tracking-wider">${Icon("lucide:flask-conical")} ${T(t, "sample")}</span>`}
      </div>
    <//>

    <${Sheet} id="adv" open=${advOpen} onClose=${() => setAdvOpen(false)} title=${T(t, "advanced")} locale=${useStore(S.locale)}>
      <label class="input flex items-center gap-2 h-[var(--ms-ctl)] rounded-[var(--ms-r-in)]">
        ${Icon("lucide:terminal", "text-lg text-base-content/70")}
        <input id="adv-q" class="grow bg-transparent outline-none font-mono text-sm" value=${adv}
          onInput=${(e) => setAdv(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") { runLive(adv.trim()); setAdvOpen(false); } }} placeholder=${T(t, "searchPlaceholder")} />
      </label>
      <button class="btn btn-primary w-full mt-3" onClick=${() => { runLive(adv.trim()); setAdvOpen(false); }} disabled=${!adv.trim()}>${T(t, "traceBtn")}</button>
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
            <span class="w-6 h-6 shrink-0 rounded-full grid place-items-center font-mono text-xs font-semibold tabular-nums text-base-content" style=${{ background: ACCENT + "33" }}>${h.n}</span>
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
