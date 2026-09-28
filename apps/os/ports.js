import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { shell, ERR } from "/_rt/shell.js";
import { classify, orderPorts, tallyPorts } from "/_rt/portid.js";
import { Icon, LABEL, Field } from "./ui.js";

const SERVICE_ICON = {
  http: "lucide:globe", tls: "lucide:lock", ssh: "lucide:terminal",
  redis: "lucide:database", pop3: "lucide:mail", imap: "lucide:mail", "smtp-or-ftp": "lucide:split",
  gone: "lucide:circle-slash", unknown: "lucide:circle-help",
};
const CONF_TONE = { product: "text-success", protocol: "text-success", ambiguous: "text-warning" };
const SERVICE_NAME = { http: "HTTP", tls: "TLS", ssh: "SSH", redis: "Redis", pop3: "POP3", imap: "IMAP", "smtp-or-ftp": "SMTP / FTP" };

const GATE_PORTS = [
  { port: 22, family: "4", probe: "passive", hex: "5353482d322e302d4f70656e5353485f392e362044656269616e2d322b6465623132753300", ms: 2 },
  { port: 443, family: "4", probe: "tls", hex: "160303004a020000460303", tls: "handshake_ok", cert: "CN=localhost, O=microspec gate, C=UA", proto: "TLSv1.3", ms: 31 },
  { port: 5432, family: "6", probe: "silent", hex: "", ms: 1 },
  { port: 21, family: "4", probe: "passive", hex: "323230205365727669636520726561647920666f72206e657720757365720d0a", ms: 4 },
  { port: 41642, family: "4", gone: true, ms: 0 },
];

export function Ports({ S, t, toast }) {
  const [rows, setRows] = useState(() => (gate ? GATE_PORTS : []));
  const [sweep, setSweep] = useState(() => (gate
    ? { scanned: 131070, total: 131070, found: 6, elapsed: 2841, addrs: "127.0.0.1,::1", done: true }
    : null));
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState(null);
  const stopRef = useRef(null);

  const key = (o) => `${o.family || "4"}:${o.port}`;
  const upsert = (o) => {
    if (!o || o.ack || o.started) return;
    if (o.done) { setSweep({ scanned: o.scanned, total: o.total, found: o.found, elapsed: o.elapsed, addrs: o.addrs, done: true }); setRunning(false); return; }
    if (o.progress) { setSweep((s) => (s?.done ? s : { scanned: o.scanned, total: o.total, found: o.found })); return; }
    if (!o.port) return;
    setRows((prev) => [...prev.filter((r) => key(r) !== key(o)), o]);
  };

  const start = () => {
    if (running || !shell.has("lan.ports")) return;
    setRows([]); setSweep(null); setErr(null); setRunning(true);
    stopRef.current = shell.subscribe("lan.ports", {}, upsert, (e) => {
      setErr(e?.detail || e?.code || ERR.failed);
      setRunning(false);
    });
  };
  const stop = () => {
    setRunning(false);
    try { stopRef.current?.(); } catch { }
    stopRef.current = null;
  };
  useEffect(() => {
    if (gate) shell.subscribe("lan.ports", {}, upsert, () => {});
    return () => { try { stopRef.current?.(); } catch { } };
  }, []);

  const why = shell.whyCapability("lan");
  const seen = orderPorts(rows.map((o) => ({ ...o, ...classify(o) })));
  const tally = tallyPorts(seen);

  const evidence = (r) => {
    if (r.confidence === "gone") return T(t, "portGone");
    if (r.detail) return r.detail;
    if (r.confidence === "protocol" || r.confidence === "ambiguous") return T(t, "portProto");
    return [T(t, r.probe === "silent" || !r.hex ? "portSilent" : "portNoise"), r.hint ? `${r.hint}?` : ""].filter(Boolean).join(" · ");
  };

  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">
    <${Panel}>
      <div class="flex items-center gap-2 pb-1">
        ${Icon("lucide:plug", "text-base text-primary shrink-0")}
        <span class="font-semibold text-sm min-w-0 flex-1 truncate">${T(t, "portsTitle")}</span>
        <!-- ONE number. "6 · 4" was open and named — the same two-bare-numbers defect the station line and
             the bridge line each had to be fixed for, made a third time. How many identified themselves is
             already on every row, in the colour of its icon. -->
        <span data-ports-tally class=${`${LABEL} text-muted tabular-nums shrink-0`}>
          ${sweep && !sweep.done && running ? `${sweep.scanned}/${sweep.total}` : tally.open}
        </span>
      </div>

      ${why ? html`<div class="py-2 text-sm text-muted">${why === ERR.staleBridge ? T(t, "stStale") : T(t, "stNone")}</div>`
        : err ? html`<div data-ports-err class="py-2 text-sm text-error break-all">${err}</div>`
        : !seen.length ? html`<div data-ports-state class="py-2 text-sm text-muted">
            ${running ? T(t, "portsSweeping") : sweep ? T(t, "portsNone") : T(t, "portsIdle")}
          </div>` : null}

      ${seen.map((r) => html`<div key=${`${r.family}:${r.port}`} data-port=${r.port} data-conf=${r.confidence}
          class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0">
        ${Icon(SERVICE_ICON[r.service] || "lucide:circle-help", `text-base shrink-0 ${CONF_TONE[r.confidence] || "text-muted"}`)}
        <div class="min-w-0 flex-1">
          <div class=${`text-sm truncate ${r.confidence === "gone" ? "text-muted" : ""}`}>${SERVICE_NAME[r.service] || T(t, "portUnknown")}</div>
          <!-- Two lines, not one: the evidence IS the row, and a certificate subject cut off after
               "CN=localhost, O=micros…" is the half that carries no information. -->
          <!-- break-words, never break-all: break-all split "номером" across two lines and left a lone
               "00" under a 200, which reads as corrupted output rather than a wrapped line. -->
          <div class=${`${LABEL} text-muted line-clamp-2 break-words`}>${evidence(r)}</div>
        </div>
        <!-- The port, and only for ::1 the family beside it — a "v4" on every row would be a column that
             is the same in all but a handful of them. -->
        <div class="font-mono text-sm tabular-nums shrink-0">${r.port}${r.family === "6" ? html`<span class=${`${LABEL} text-muted`}>/6</span>` : null}</div>
      </div>`)}

      <button id="ports-toggle" class=${`btn btn-sm rounded-full w-full gap-2 mt-3 ${running ? "" : "btn-primary"}`}
          disabled=${!!why} data-scanning=${running} onClick=${() => (running ? stop() : start())}>
        ${Icon(running ? "lucide:square" : "lucide:radar")}<span>${T(t, running ? "radarStop" : "radarStart")}</span>
      </button>
      <!-- Said once, where the list is, because every row on this screen is bounded by it: a sweep can only
           report what answered a connect, and Android lets nobody ask which app owns the socket. -->
      ${seen.length ? html`<div data-ports-limit class=${`pt-2 ${LABEL} text-muted`}>${T(t, "portsLimit")}</div>` : null}
    <//>

    <!-- What was ASKED, which is what makes the list above mean anything. "Nothing answered" after ten
         ports and after all 65535 on both addresses are opposite findings and read identically without it. -->
    ${sweep?.done ? html`<${Panel}>
      <div data-ports-scope class="flex flex-col">
        <!-- The addresses come off the wire rather than being assumed: a phone with no ::1 sweeps one
             family, and a screen that printed both would be describing a sweep that never happened. -->
        <${Field} label=${T(t, "portsSwept")} value=${String(sweep.scanned)} mono sub=${(sweep.addrs || "").split(",").join(" · ")} />
        <${Field} label=${T(t, "portsTook")} value=${`${(sweep.elapsed / 1000).toFixed(1)} s`} mono />
      </div>
    <//>` : null}
  </div>`;
}
