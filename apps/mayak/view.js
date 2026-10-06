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
import { shell } from "/_rt/shell.js";
import { CATEGORIES, COUNTRIES, KIND_OF, presetQuery, parseQuery, freeTerm } from "./categories.js";
import fixture from "./fixture.json" with { type: "json" };

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const ACCENT = "#F5B94D";
const RED = "#F2777A";
const LABEL = "font-mono text-[length:var(--ms-label)] uppercase tracking-wider text-base-content/70";
const CAT_ICON = { camera: "lucide:cctv", database: "lucide:database", access: "lucide:monitor", files: "lucide:folder-open", device: "lucide:printer", vuln: "lucide:shield-alert" };
const PAGE = 20;
const NS_ORG = { ultradns: "UltraDNS", awsdns: "AWS", cloudflare: "Cloudflare", googledomains: "Google", google: "Google", azure: "Azure", dnsimple: "DNSimple", nsone: "NS1", akamai: "Akamai", domaincontrol: "GoDaddy", dnsmadeeasy: "DNS Made Easy" };
const nsOrg = (host) => {
  const parts = String(host || "").toLowerCase().split(".");
  for (const seg of parts) for (const k in NS_ORG) if (seg.includes(k)) return NS_ORG[k];
  return parts.length >= 2 ? parts[parts.length - 2].replace(/[-_]\d.*$/, "").replace(/^./, (c) => c.toUpperCase()) : String(host || "");
};

const color = (h) => h.vulns > 0 ? RED : ACCENT;

// The country's name in the reader's language; "" is everywhere. Never a hardcoded dictionary.
function regionName(cc, loc, everywhere) {
  if (!cc) return everywhere;
  try { return new Intl.DisplayNames([loc === "uk" ? "uk" : "en"], { type: "region" }).of(cc) || cc; } catch { return cc; }
}

// Everything the scan knows about a host, as text a person can keep — the owner wanted to send it to Telegram.
function hostText(h, t, loc) {
  const L = [];
  L.push(`${T(t, "kind." + (h.kind || "access"))}${h.product ? " · " + h.product : ""}`);
  L.push(`${h.ip}${h.port ? ":" + h.port : ""}`);
  if (h.org) L.push(h.org);
  const place = [h.city, regionName(h.country, loc, "")].filter(Boolean).join(", ");
  if (place) L.push(place);
  if (h.lat != null && h.lon != null) L.push(`${h.lat}, ${h.lon}`);
  L.push(`Shodan: https://www.shodan.io/host/${h.ip}`);
  return L.join("\n");
}

export function map({ S, toast, openScreen, closeScreen }) {
  const t = useStore(S.t);
  const loc = useStore(S.locale);
  const me = useStore(session);
  const screen = useStore(S.screen);
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [cat, setCat] = useState(gate ? null : "cameras");
  const [hosts, setHosts] = useState(gate ? fixture.matches : []);
  const [loading, setLoading] = useState(!gate);
  const [reason, setReason] = useState("");
  const [sel, setSel] = useState(null);
  const [shownN, setShownN] = useState(PAGE);
  const seq = useRef(0);
  const moreRef = useRef(null);

  const runLive = async (query, kind, cc = "") => {
    setShownN(PAGE);
    if (!query || gate) return;
    const my = ++seq.current;
    setReason(""); setLoading(true);
    try {
      const r = await fetch(VPS_PROXY + "/shodan/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, country: cc || "" }) });
      const j = await r.json().catch(() => null);
      if (my !== seq.current) return;
      if (r.ok && j && Array.isArray(j.matches)) {
        setHosts(j.matches.map((m) => ({ ...m, kind: kind || m.kind || "access" })));
        if (!j.matches.length) setReason("noHosts");
      } else { setHosts([]); setReason(j && j.error === "no_key" ? "noKey" : j && j.error === "no_query_credits" ? "creditsWarn" : "updFail"); }
    } catch { if (my === seq.current) setReason("updFail"); }
    finally { if (my === seq.current) setLoading(false); }
  };
  // With a country chosen the preset becomes a filtered query (needs credits); without one it stays the free word.
  const liveOf = (p, cc) => (cc ? presetQuery(p, cc) : (freeTerm(p) || presetQuery(p, "")));

  useEffect(() => {
    if (gate) return;
    let alive = true;
    (async () => {
      if (!me) await restore().catch(() => null);
      if (!alive) return;
      const p = CATEGORIES.find((c) => c.id === (cat || "cameras")).presets[0];
      runLive(liveOf(p, country), KIND_OF[p], country);
    })();
    return () => { alive = false; };
  }, [me]);

  const catOfPreset = (p) => (CATEGORIES.find((c) => c.presets.includes(p)) || CATEGORIES[0]).id;
  const pickCat = (id) => { setCat(id); setQ(""); const p = CATEGORIES.find((c) => c.id === id).presets[0]; runLive(liveOf(p, country), KIND_OF[p], country); };
  // A specific sweet from the library: run its query, highlight its category, close the sheet.
  const runPreset = (p) => { setCat(catOfPreset(p)); setQ(""); runLive(liveOf(p, country), KIND_OF[p], country); closeScreen && closeScreen(); };
  const search = () => { const query = q.trim(); if (!query) return; setCat(null); runLive(parseQuery(query, country).query, null, country); };
  // A new country re-runs whatever is on screen: the typed query, or the current category's preset.
  const pickCountry = (cc) => {
    setCountry(cc);
    if (q.trim()) runLive(parseQuery(q.trim(), cc).query, null, cc);
    else { const p = CATEGORIES.find((c) => c.id === (cat || "cameras")).presets[0]; runLive(liveOf(p, cc), KIND_OF[p], cc); }
  };
  const shareHost = async (h) => {
    const text = hostText(h, t, loc), title = `${h.ip}${h.port ? ":" + h.port : ""}`;
    if (shell.has("share.send")) { try { await shell.call("share.send", { title, text }); return; } catch { } }
    if (typeof navigator !== "undefined" && navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e?.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(text); toast && toast(T(t, "shareCopied")); } catch { }
  };

  const all = useMemo(() => {
    if (!gate || !cat) return hosts;
    const kind = KIND_OF[CATEGORIES.find((c) => c.id === cat).presets[0]];
    return hosts.filter((h) => h.kind === kind);
  }, [hosts, cat]);

  const shown = all.slice(0, shownN);
  const hasMore = shownN < all.length;

  useEffect(() => {
    const el = moreRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setShownN((n) => n + PAGE); }, { rootMargin: "0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, all.length]);

  const openHost = (h) => { setSel(h); openScreen && openScreen("host"); };
  const kindWord = (h) => T(t, "kind." + (h.kind || "access"));
  const place = (h) => h.city || h.country || "";
  const summary = (h) => [place(h) ? T(t, "sumPlace", { city: place(h) }) : "", T(t, "sumPorts", { n: h.ports || 1 }), h.vulns > 0 ? T(t, "sumVulns", { n: h.vulns }) : T(t, "sumSafe")].filter(Boolean).join(". ") + ".";

  if ((screen === "host" || screen === "peek") && sel) {
    return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-host=${sel.ip}>
      <div class="flex items-center justify-between gap-2">
        <button class="btn btn-ghost btn-sm gap-1.5 -ml-1" onClick=${() => closeScreen && closeScreen()} data-back>
          ${Icon("lucide:arrow-left", "text-lg")} ${T(t, "back")}
        </button>
        <div class="flex items-center gap-1">
          <button class="btn btn-ghost btn-sm gap-1.5" data-peek onClick=${() => openScreen && openScreen("peek")} aria-label=${T(t, "peekOpen")}>
            ${Icon("lucide:globe", "text-base")} ${T(t, "peekOpen")}
          </button>
          <button class="btn btn-ghost btn-sm gap-1.5" data-share onClick=${() => shareHost(sel)} aria-label=${T(t, "shareHost")}>
            ${Icon("lucide:share-2", "text-base")} ${T(t, "shareHost")}
          </button>
        </div>
      </div>
      <${Sheet} id="peek" open=${screen === "peek"} onClose=${() => openScreen && openScreen("host")}
        title=${`${sel.ip}${sel.port ? ":" + sel.port : ""}`} icon="lucide:globe" locale=${loc}>
        <div class="flex flex-col gap-2" data-peek-sheet>
          <div class="flex items-start gap-2 text-xs text-muted leading-snug">
            ${Icon("lucide:shield", "text-sm shrink-0 mt-0.5")}
            <span>${T(t, "peekHint")}</span>
          </div>
          <div class="rounded-[var(--ms-r-in)] overflow-hidden sf-inset bg-black" style="height:62dvh">
            ${gate ? html`<div class="w-full h-full grid place-items-center text-muted text-sm">${T(t, "sample")}</div>`
              : html`<iframe data-peek-frame src=${`${VPS_PROXY}/peek?ip=${encodeURIComponent(sel.ip)}&port=${encodeURIComponent(sel.port || 80)}`}
                  sandbox="" referrerpolicy="no-referrer" loading="lazy" credentialless="true"
                  class="w-full h-full border-0 bg-white" title=${T(t, "peekTitle")}></iframe>`}
          </div>
        </div>
      <//>
      <${Globe} points=${[{ lat: sel.lat, lon: sel.lon, r: 6, color: color(sel), pulse: true }]} focus=${{ lat: sel.lat, lon: sel.lon }} spin=${false} />
      <${Panel}>
        <div class="flex items-start gap-3">
          <span class="w-10 h-10 shrink-0 rounded-[var(--ms-r-in)] grid place-items-center" style=${{ background: color(sel) + "22", color: color(sel) }}>${Icon(CAT_ICON[sel.kind] || "lucide:radio-tower", "text-xl")}</span>
          <div class="min-w-0 grow">
            <div class="font-semibold leading-tight">${kindWord(sel)}${sel.product ? html` · <span class="font-normal text-base-content/80">${sel.product}</span>` : null}</div>
            <div class="text-sm text-base-content/80 leading-snug mt-0.5">${summary(sel)}</div>
            <div class="font-mono text-xs text-muted mt-1 break-all">${sel.ip}${sel.port ? ":" + sel.port : ""}${sel.org ? " · " + sel.org : ""}</div>
          </div>
        </div>
      <//>
    </div>`;
  }

  const skeleton = loading && !shown.length;
  // items-start + a wrapping min-w-0 column: a 39-char IPv6 breaks onto a second line instead of pushing the row wide.
  const rowLine = (h) => html`<button key=${h.ip + ":" + h.port} data-result=${h.ip} onClick=${() => openHost(h)}
    class="flex items-start gap-2.5 w-full text-left py-1.5 px-1 rounded-[var(--ms-r-in)] hover:bg-base-content/5">
    <span class="shrink-0 w-5 text-center mt-0.5" style=${{ color: color(h) }}>${Icon(CAT_ICON[h.kind] || "lucide:radio-tower", "text-base")}</span>
    <span class="min-w-0 grow">
      <span class="font-mono text-sm break-all">${h.ip}${h.port ? ":" + h.port : ""}</span>
      <span class="block text-sm text-muted truncate">${h.product || kindWord(h)}${place(h) ? " · " + place(h) : ""}</span>
    </span>
    ${h.vulns > 0 ? html`<span class="shrink-0 mt-0.5" style=${{ color: RED }}>${Icon("lucide:shield-alert", "text-sm")}</span>` : null}
    ${Icon("lucide:chevron-right", "text-base text-base-content/40 shrink-0 mt-0.5")}
  </button>`;

  return html`<div class="flex flex-col gap-[var(--ms-gap)]" data-shown=${shown.length} data-cat=${cat || ""} data-total=${all.length}>
    <${Island}>
      ${/* A textarea, not an input: a Shodan query can be long and multi-token. It grows to the text (2–5 rows),
           Enter searches, Shift+Enter is a newline. */""}
      <div class="sf-inset rounded-[var(--ms-r-in)] flex items-start gap-2 p-2">
        ${Icon("lucide:search", "text-lg text-base-content/70 mt-1 shrink-0")}
        <textarea id="host-search" rows="1" autocomplete="off" spellcheck="false"
          class="grow bg-transparent outline-none resize-none font-mono text-sm leading-snug max-h-32 py-1"
          value=${q} onInput=${(e) => { setQ(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 128) + "px"; }}
          onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); search(); } }}
          placeholder=${T(t, "searchPlaceholder")}></textarea>
        ${q.trim() ? html`<button class="btn btn-ghost btn-xs btn-circle shrink-0 mt-0.5" onClick=${search} aria-label=${T(t, "searchBtn")}>${Icon("lucide:arrow-right", "text-base")}</button>` : null}
      </div>
      <div class="mt-2 flex items-center gap-2">
        ${Icon("lucide:map-pin", "text-base text-base-content/70 shrink-0")}
        <select id="region" data-region=${country || "all"} aria-label=${T(t, "region")} value=${country}
          class="select select-sm sf-inset rounded-[var(--ms-r-in)] grow min-w-0 font-medium"
          onChange=${(e) => pickCountry(e.target.value)}>
          ${COUNTRIES.map((cc) => html`<option key=${cc || "all"} value=${cc}>${regionName(cc, loc, T(t, "everywhere"))}</option>`)}
        </select>
      </div>
      <div class="mt-2 flex gap-1.5 overflow-x-auto -mx-1 px-1">
        <button data-presets-btn aria-label=${T(t, "presetsTitle")}
          class="flex items-center gap-1.5 shrink-0 rounded-full px-3 h-8 text-sm sf-raised"
          onClick=${() => openScreen && openScreen("presets")}>
          <span style=${{ color: ACCENT }}>${Icon("lucide:sparkles", "text-base")}</span>${T(t, "presetsBtn")}
        </button>
        ${CATEGORIES.map((c) => {
          const on = c.id === cat;
          return html`<button key=${c.id} data-cat-btn=${c.id} aria-pressed=${on}
            class=${"flex items-center gap-1.5 shrink-0 rounded-full px-3 h-8 text-sm " + (on ? "sf-pressed" : "sf-raised")}
            onClick=${() => pickCat(c.id)}>
            <span style=${on ? { color: ACCENT } : null}>${Icon(c.icon, "text-base")}</span>${T(t, "cat." + c.id)}
          </button>`;
        })}
      </div>
      <div class="mt-2 flex items-center justify-between gap-2 min-h-5" data-status=${reason || (loading ? "loading" : all.length ? "ok" : "empty")}>
        <span class=${LABEL}>${loading ? T(t, "scanning") : all.length ? html`${T(t, "found")} · ${all.length}` : T(t, "noHosts")}</span>
        ${reason ? html`<span class="text-xs text-warning text-right">${T(t, reason)}</span>`
          : gate ? html`<span data-sample class="badge badge-ghost gap-1 font-mono text-xs uppercase tracking-wider">${Icon("lucide:flask-conical")} ${T(t, "sample")}</span>` : null}
      </div>
    <//>

    <${Panel} data-list=${all.length}>
      ${skeleton
        ? html`<div class="flex flex-col gap-1">${Array.from({ length: 8 }).map((_, i) => html`<div key=${i} class="flex items-center gap-2.5 py-1.5 px-1">
            <span class="w-5 h-5 shrink-0 rounded bg-base-content/10 animate-pulse"></span>
            <span class="h-3 w-24 rounded bg-base-content/10 animate-pulse"></span>
            <span class="h-3 grow rounded bg-base-content/10 animate-pulse"></span>
          </div>`)}</div>`
        : shown.length
          ? html`<div class="flex flex-col divide-y divide-base-300/40">${shown.map(rowLine)}</div>`
          : html`<div class="text-sm text-muted py-6 text-center">${T(t, "noHosts")}</div>`}
      ${hasMore ? html`<div ref=${moreRef} class="pt-2">
        <button class="btn btn-ghost btn-sm w-full" onClick=${() => setShownN((n) => n + PAGE)} data-more>${T(t, "more")}</button>
      </div>` : null}
    <//>

    ${/* The library of ready queries ("sweets"), grouped by category, each with a plain line of what it finds.
         Research-only: a tap runs the search; Маяк never logs in anywhere. */""}
    <${Sheet} id="presets" open=${screen === "presets"} onClose=${() => closeScreen && closeScreen()}
      title=${T(t, "presetsTitle")} icon="lucide:sparkles" locale=${loc}>
      <div class="flex flex-col gap-4" data-presets>
        ${CATEGORIES.map((c) => html`<div key=${c.id} class="flex flex-col gap-1">
          <div class=${LABEL + " flex items-center gap-1.5 px-1"}>${Icon(c.icon, "text-sm")} ${T(t, "cat." + c.id)}</div>
          <div class="flex flex-col divide-y divide-base-300/40">
            ${c.presets.map((p) => html`<button key=${p} data-preset=${p} onClick=${() => runPreset(p)}
              class="text-left py-2 px-1 rounded-[var(--ms-r-in)] hover:bg-base-content/5">
              <span class="font-medium text-sm">${T(t, "cat." + c.id + "." + p)}</span>
              <span class="block text-xs text-muted leading-snug mt-0.5">${T(t, "desc." + p)}</span>
            </button>`)}
          </div>
        </div>`)}
      </div>
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
      if (gate) return;
      const s = me || await restore().catch(() => null);
      if (!s || !alive) return;
      try {
        const r = await fetch(VPS_PROXY + "/shodan/info");
        if (!r.ok) return;
        const j = await r.json();
        if (alive && j && typeof j.scan_credits === "number") { setAcc(j); setLive(true); }
      } catch { }
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
          <p>${T(t, "routeLede", { ms: reachMs })}${hidden ? " " + T(t, "routeHidden", { n: hidden }) : ""}</p>
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
