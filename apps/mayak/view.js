// mayak — our Shodan lens and the path between our node and anywhere. Three tool views over one key that lives
// server-side (microspec-edge: shodan.js, net.js). The globe plots fixture.json until the plan holds query
// credits (edu = 0, measured 2026-09-25): a live search answers no_query_credits, and the island says so.
// A signed-in route is fetched on a gesture or when a session exists — a tab never opens the authwall by
// merely being opened. State map: RESEARCH.md.
import { html } from "htm/preact";
import { useState, useMemo, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Globe } from "/_rt/globe.js";
import { Panel, Island, Segmented } from "/_rt/ui.js";
import { VPS_PROXY } from "/_rt/feed.js";
import { session } from "/_rt/auth.js";
import fixture from "./fixture.json" with { type: "json" };

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const ACCENT = "#F5B94D";
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const Chip = (t) => html`<span class="badge badge-ghost gap-1 font-mono text-xs uppercase tracking-wider" data-sample>${Icon("lucide:flask-conical")} ${T(t, "sample")}</span>`;
const REASON = { no_query_credits: "creditsWarn", no_key: "noKey" };

export function map({ S }) {
  const t = useStore(S.t);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("all");
  const [sel, setSel] = useState(null);
  const [hosts, setHosts] = useState(fixture.matches);
  const [live, setLive] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const countries = useMemo(() => {
    const seen = new Map();
    for (const h of hosts) if (h.cc && !seen.has(h.cc)) seen.set(h.cc, h.country || h.cc);
    return [{ id: "all", label: T(t, "filterAll") }, ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([id, label]) => ({ id, label }))];
  }, [t, hosts]);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return hosts.filter((h) => (country === "all" || h.cc === country) &&
      (!ql || h.ip.includes(ql) || (h.org || "").toLowerCase().includes(ql) || (h.city || "").toLowerCase().includes(ql) || String(h.port).includes(ql)));
  }, [q, country, hosts]);

  // Enter = the live search (one query credit a page upstream). A refusal keeps the fixture and names why.
  const search = async () => {
    const query = q.trim(); if (!query || busy) return;
    setBusy(true); setReason("");
    try {
      const r = await fetch(VPS_PROXY + "/feed/shodan/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, country: country === "all" ? "" : country }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j && Array.isArray(j.matches)) { setHosts(j.matches); setLive(true); setSel(null); setQ(""); }
      else setReason((j && REASON[j.error]) || (r.status === 401 ? "" : "creditsWarn"));
    } catch { setReason("creditsWarn"); }
    finally { setBusy(false); }
  };

  const points = shown.map((h) => ({ lat: h.lat, lon: h.lon, r: 5, color: ACCENT, pulse: !!sel && sel.ip === h.ip && sel.port === h.port, host: h }));
  const focus = sel ? { lat: sel.lat, lon: sel.lon } : null;
  const pick = ({ point }) => { if (point && point.host) setSel(point.host); };

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-shown=${shown.length} data-live=${live ? "1" : null}>
    <${Globe} points=${points} focus=${focus} spin=${!sel} onPick=${pick} />

    ${sel ? html`<${Panel} data-host=${sel.ip}>
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono font-semibold tracking-wide">${sel.ip}</span>
        <button class="btn btn-ghost btn-xs btn-circle" onClick=${() => setSel(null)} aria-label=${T(t, "close")}>${Icon("lucide:x", "text-base")}</button>
      </div>
      <div class="divide-y divide-base-300/40">
        ${[["lucide:door-open", "hostPort", String(sel.port)], ["lucide:building-2", "hostOrg", sel.org], ["lucide:server", "hostProduct", sel.product], ["lucide:map-pin", "hostPlace", [sel.city, sel.country].filter(Boolean).join(", ")]]
          .filter(([, , v]) => v).map(([icon, key, v]) => html`<div class="flex items-center gap-2.5 py-2">
            <span class="text-base-content/70 shrink-0 w-5 text-center">${Icon(icon)}</span>
            <span class="grow text-sm">${T(t, key)}</span>
            <span class="font-mono text-sm text-right break-all">${v}</span>
          </div>`)}
      </div>
    <//>` : null}

    <${Island}>
      <div class="flex items-center gap-2">
        <label class="input flex items-center gap-2 grow h-[var(--ms-ctl)] rounded-[var(--ms-r-in)]">
          ${Icon("lucide:search", "text-lg text-base-content/70")}
          <input id="host-search" type="search" autocomplete="off" class="grow bg-transparent outline-none" value=${q}
            onInput=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { if (e.key === "Enter") search(); }} placeholder=${T(t, "searchPlaceholder")} />
        </label>
        <button class="btn btn-primary btn-circle h-[var(--ms-ctl)] w-[var(--ms-ctl)]" onClick=${search} disabled=${busy || !q.trim()} data-search aria-label=${T(t, "searchPlaceholder")}>${Icon("lucide:arrow-right", "text-lg")}</button>
      </div>
      <div class="mt-2">
        <${Segmented} items=${countries} value=${country} onChange=${setCountry} variant="outline" size="sm" scroll attr="data-country" />
      </div>
      <div class="mt-2 flex items-center justify-between gap-2 min-h-6" data-status=${reason || (shown.length ? "ok" : "empty")}>
        <span class=${LABEL}>${shown.length ? html`${T(t, "hosts")} · ${shown.length}` : T(t, "noHosts")}</span>
        ${reason ? html`<span class="text-xs text-warning text-right">${T(t, reason)}</span>` : live ? null : Chip(t)}
      </div>
    <//>
  </div>`;
}

export function state({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale), me = useStore(session);
  const [acc, setAcc] = useState(fixture.account);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!me) return;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(VPS_PROXY + "/feed/shodan/info");
        if (!r.ok) return;
        const j = await r.json();
        if (alive && j && typeof j.scan_credits === "number") { setAcc(j); setLive(true); }
      } catch { /* the fixture stays: offline, or the route is not deployed yet */ }
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
    ${acc.query_credits === 0 ? html`<${Panel}><div class="flex items-start gap-2.5 text-sm"><span class="shrink-0 mt-0.5 text-warning">${Icon("lucide:triangle-alert", "text-lg")}</span><span>${T(t, "creditsWarn")}</span></div><//>` : null}
    <${Panel} title=${T(t, "sPlan")}>
      <div class="divide-y divide-base-300/40">
        ${row("lucide:badge-check", T(t, "sPlan"), (acc.plan || "—").toUpperCase())}
        ${row("lucide:search", T(t, "sQuery"), num(acc.query_credits), acc.query_credits === 0)}
        ${row("lucide:scan-line", T(t, "sScan"), num(acc.scan_credits))}
        ${row("lucide:eye", T(t, "sMonitored"), num(acc.monitored_ips))}
        ${row("lucide:lock", T(t, "sHttps"), acc.https ? T(t, "yes") : T(t, "no"))}
        ${row("lucide:unlock", T(t, "sUnlocked"), acc.unlocked ? T(t, "yes") : T(t, "no"))}
      </div>
      ${live ? null : html`<div class="flex justify-end">${Chip(t)}</div>`}
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

// trace — every hop from our node to a domain, or to the caller; plus the caller's address and the domain's
// records. The browser cannot traceroute, so both come from the edge (/feed/net/trace, /feed/net/dns).
export function trace({ S }) {
  const t = useStore(S.t);
  const [mode, setMode] = useState("site");
  const [target, setTarget] = useState(fixture.trace.target);
  const [dns, setDns] = useState(fixture.dns);
  const [hops, setHops] = useState(fixture.trace.hops);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    const to = mode === "me" ? "me" : target.trim();
    if (!to || busy) return;
    setBusy(true); setFailed(false);
    try {
      const q = encodeURIComponent(to);
      const [tr, dn] = await Promise.all([
        fetch(VPS_PROXY + "/feed/net/trace?target=" + q).then((r) => r.ok ? r.json() : null).catch(() => null),
        fetch(VPS_PROXY + "/feed/net/dns?name=" + q).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (tr && Array.isArray(tr.hops) && tr.hops.length) { setHops(tr.hops); setLive(true); } else setFailed(true);
      if (dn && dn.records) setDns(dn);
    } finally { setBusy(false); }
  };

  const maxRtt = Math.max(1, ...hops.map((h) => h.rtt || 0));
  const chips = (label, arr) => arr && arr.length ? html`<div class="flex flex-wrap items-center gap-1.5">
    <span class=${LABEL + " mr-1 w-10"}>${label}</span>
    ${arr.map((v) => html`<span class="badge badge-ghost font-mono text-xs" style=${{ textTransform: "none" }}>${v}</span>`)}
  </div>` : null;

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

    <${Panel} title=${T(t, "dnsRecords")} data-dns=${dns.ip || ""}>
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm">${T(t, "myIp")}</span>
          <span class="font-mono font-semibold">${dns.ip || "—"}</span>
        </div>
        ${dns.ptr ? html`<div class="flex items-center justify-between gap-2">
          <span class="text-sm">${T(t, "myDns")}</span>
          <span class="font-mono text-sm text-right break-all">${dns.ptr}</span>
        </div>` : null}
        ${chips("A", dns.records && dns.records.A)}
        ${chips("AAAA", dns.records && dns.records.AAAA)}
        ${chips("NS", dns.records && dns.records.NS)}
      </div>
    <//>

    <${Panel}>
      <div class="flex items-center justify-between gap-2">
        <span class=${LABEL}>${T(t, "hops")} · ${hops.length}${live ? " · " + T(t, "fromNode") : ""}</span>
        ${live ? null : Chip(t)}
      </div>
      <ol class="flex flex-col">
        ${hops.map((h, i) => html`<li class="flex items-stretch gap-3 py-1" data-hop=${h.n}>
          <div class="flex flex-col items-center">
            <span class="w-6 h-6 shrink-0 rounded-full grid place-items-center font-mono text-xs font-semibold tabular-nums text-base-content" style=${{ background: ACCENT + "33" }}>${h.n}</span>
            ${i < hops.length - 1 ? html`<span class="w-px grow" style=${{ background: ACCENT + "33" }}></span>` : null}
          </div>
          <div class="min-w-0 grow pb-1">
            <div class="font-mono text-sm truncate">${h.host || h.ip || "*"}</div>
            ${h.host && h.ip ? html`<div class="font-mono text-xs text-base-content/70 truncate">${h.ip}</div>` : null}
            <div class="mt-1 h-1 rounded-full bg-base-300/40 overflow-hidden">
              <span class="block h-full rounded-full" style=${{ width: (h.rtt != null ? Math.max(2, Math.round(h.rtt / maxRtt * 100)) : 0) + "%", background: ACCENT }}></span>
            </div>
          </div>
          <div class="shrink-0 self-center font-mono text-xs tabular-nums text-base-content/70 w-16 text-right">${h.rtt != null ? h.rtt.toFixed(1) + " ms" : "—"}</div>
        </li>`)}
      </ol>
    <//>
  </div>`;
}
