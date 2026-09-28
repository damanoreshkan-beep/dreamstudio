import { html } from "htm/preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { shell, ERR } from "/_rt/shell.js";
import { permLabels, refreshHeld, heldPermissions } from "/_rt/permissions.js";
import { Icon, LABEL } from "./ui.js";

const SEEN_MS = 20_000;
const WIFI_MS = 30_000;
export const band = (freq) => (!freq ? "" : freq >= 5925 ? "6 GHz" : freq >= 5000 ? "5 GHz" : "2.4 GHz");
const cellRadius = (rssi) => {
  const clamped = Math.max(-125, Math.min(-55, rssi));
  return 12 + ((-55 - clamped) / 70) * 78;
};
const rssiRadius = (rssi) => {
  const clamped = Math.max(-100, Math.min(-30, rssi));
  return 12 + ((-30 - clamped) / 70) * 78;
};
const angleOf = (addr) => {
  let h = 2166136261;
  for (let i = 0; i < addr.length; i++) { h ^= addr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (((Math.imul(h >>> 0, 2654435761) >>> 0) / 4294967296) * 360) * (Math.PI / 180);
};

const GATE_DEVICES = [
  { addr: "02:00:00:00:AA:01", name: "Gate Beacon", rssi: -52 },
  { addr: "02:00:00:00:AA:02", name: "Watch", rssi: -67 },
  { addr: "02:00:00:00:AA:03", name: "", rssi: -78 },
  { addr: "02:00:00:00:AA:04", name: "Earbuds", rssi: -44 },
  { addr: "02:00:00:00:AA:05", name: "", rssi: -91 },
];

export function radar({ S, t, toast }) {
  const loc = useStore(S.locale);
  const [devices, setDevices] = useState(() => (gate ? GATE_DEVICES.map((d) => ({ ...d, at: Date.now() })) : []));
  const [scanning, setScanning] = useState(gate);
  const [err, setErr] = useState(null);
  const [held, setHeld] = useState(null);
  const [events, setEvents] = useState(0);
  const stopRef = useRef(null);
  const [nets, setNets] = useState([]);
  const [cells, setCells] = useState([]);
  const [throttled, setThrottled] = useState(false);
  const wifiRef = useRef(null);
  const [hosts, setHosts] = useState([]);
  const [sweep, setSweep] = useState(null);
  const [lanOn, setLanOn] = useState(false);
  const [lanErr, setLanErr] = useState(null);
  const lanRef = useRef(null);

  const [show, setShow] = useState({ ble: true, wifi: true, cell: true, lan: true });
  const toggle = (k) => setShow((s) => ({ ...s, [k]: !s[k] }));

  const ipSort = (a, b) => {
    const n = (s) => s.split(".").reduce((v, o) => v * 256 + (parseInt(o, 10) || 0), 0);
    return n(a.ip) - n(b.ip);
  };
  const upsertHost = (h) => {
    if (!h) return;
    if (h.done) { setSweep({ scanned: h.scanned, found: h.found, sources: h.sources, done: true }); return; }
    if (h.progress) { setSweep((s) => (s?.done ? s : { scanned: h.scanned, total: h.total })); return; }
    if (h.started || h.ack || !h.ip) return;
    setHosts((prev) => {
      const at = prev.find((x) => x.ip === h.ip);
      if (!at) return [...prev, { ...h, via: [h.via] }].sort(ipSort);
      return prev.map((x) => x.ip !== h.ip ? x : {
        ...x,
        name: x.name || h.name,
        ports: x.ports || h.ports,
        via: x.via.includes(h.via) ? x.via : [...x.via, h.via],
      });
    });
  };
  const [locOn, setLocOn] = useState(null);
  useEffect(() => {
    refreshHeld().then(() => setHeld(heldPermissions()));
    if (shell.has("system.info")) shell.call("system.info", {}).then((i) => setLocOn(i.locationOn)).catch(() => {});
  }, []);
  const why = shell.whyCapability("ble");
  const L = permLabels(loc);

  const [started, setStarted] = useState(false);
  const [ack, setAck] = useState(false);
  const upsert = (d) => {
    if (d && d.ack) { setAck(true); return; }
    if (d && d.started) { setStarted(true); return; }
    setEvents((n) => n + 1); setDevices((prev) => {
    const rest = prev.filter((x) => x.addr !== d.addr);
    return [...rest, { ...d, at: Date.now() }].sort((a, b) => b.rssi - a.rssi);
  }); };

  const sweepRadios = async () => {
    if (shell.has("wifi.scan")) {
      try {
        const r = await shell.call("wifi.scan", {});
        setNets((r.networks || []).slice().sort((a, b) => b.rssi - a.rssi));
        setThrottled(!!r.throttled);
      } catch { }
    }
    if (shell.has("cell.info")) {
      try {
        const r = await shell.call("cell.info", {});
        setCells((r.cells || []).slice().sort((a, b) => (b.rssi || -999) - (a.rssi || -999)));
      } catch { }
    }
  };

  const start = () => {
    if (scanning || why) return;
    setScanning(true);
    setErr(null);
    setStarted(false);
    setAck(false);
    stopRef.current = shell.subscribe("ble.scan", {}, upsert, (e) => { setErr(e?.detail || e?.code || ERR.failed); setScanning(false); });
    sweepRadios();
    wifiRef.current = setInterval(sweepRadios, WIFI_MS);
    setHosts([]); setSweep(null); setLanErr(null); setLanOn(false);
    if (shell.has("lan.scan")) {
      setLanOn(true);
      lanRef.current = shell.subscribe("lan.scan", {}, upsertHost, (e) => {
        setLanErr(e?.detail || e?.code || ERR.failed);
        setLanOn(false);
      });
    }
  };
  const stop = () => {
    setScanning(false);
    try { stopRef.current?.(); } catch { }
    stopRef.current = null;
    clearInterval(wifiRef.current);
    wifiRef.current = null;
    try { lanRef.current?.(); } catch { }
    lanRef.current = null;
  };
  useEffect(() => {
    if (gate) {
      sweepRadios();
      setLanOn(true);
      shell.subscribe("lan.scan", {}, upsertHost, () => {});
    }
    return () => {
      try { stopRef.current?.(); } catch { }
      try { lanRef.current?.(); } catch { }
      clearInterval(wifiRef.current);
    };
  }, []);

  useEffect(() => {
    if (gate) return;
    const id = setInterval(() => setDevices((prev) => prev.filter((d) => Date.now() - d.at < SEEN_MS)), 2000);
    return () => clearInterval(id);
  }, []);

  const fresh = (d) => Math.max(0.25, 1 - (Date.now() - d.at) / SEEN_MS);

  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">
    <${Panel}>
      <div data-radar class="relative mx-auto w-full max-w-[20rem] aspect-square">
        <svg viewBox="0 0 200 200" class="w-full h-full text-base-content" aria-hidden="true">
          ${[30, 60, 90].map((r) => html`<circle key=${r} cx="100" cy="100" r=${r} fill="none" stroke="currentColor" stroke-width="0.6" opacity="0.16" />`)}
          <line x1="100" y1="10" x2="100" y2="190" stroke="currentColor" stroke-width="0.6" opacity="0.1" />
          <line x1="10" y1="100" x2="190" y2="100" stroke="currentColor" stroke-width="0.6" opacity="0.1" />
          ${scanning ? html`<g class="ms-sweep" style="transform-origin:100px 100px;color:var(--app-accent)">
            <line x1="100" y1="100" x2="100" y2="12" stroke="currentColor" stroke-width="1.2" opacity="0.45" />
          </g>` : null}
          <!-- Two natures, told apart WITHOUT relying on colour: an advertisement is a filled dot, a
               network is an open ring. Colour then only reinforces it — accent for the thing that streams
               at us, ink for the thing we have to ask about. A legend would be the hand-holding this
               screen does not need: the list below carries the same two icons. -->
          <!-- Cells are triangles, and the one you are REGISTERED on is filled while its neighbours are
               outlined. That distinction is the only one here a user can act on: a neighbour is what the
               phone would hand over to, the serving cell is what it is actually talking through. -->
          <g class="text-base-content">
            ${(show.cell ? cells : []).map((c) => {
              const key = `${c.type}-${c.pci ?? ""}-${c.cid ?? ""}-${c.arfcn ?? ""}`;
              const a = angleOf(key), r = cellRadius(c.rssi ?? -110);
              const x = 100 + Math.cos(a) * r, y = 100 + Math.sin(a) * r;
              const pts = `${x.toFixed(1)},${(y - 4.6).toFixed(1)} ${(x - 4.2).toFixed(1)},${(y + 3.2).toFixed(1)} ${(x + 4.2).toFixed(1)},${(y + 3.2).toFixed(1)}`;
              return html`<polygon key=${key} points=${pts}
                fill=${c.serving ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.2"
                stroke-linejoin="round" opacity=${c.serving ? "0.75" : "0.5"} />`;
            })}
          </g>
          <g class="text-base-content">
            ${(show.wifi ? nets : []).map((n) => {
              const key = n.bssid || n.ssid || String(n.rssi);
              const a = angleOf(key), r = rssiRadius(n.rssi);
              return html`<circle key=${key} cx=${(100 + Math.cos(a) * r).toFixed(1)} cy=${(100 + Math.sin(a) * r).toFixed(1)}
                r="4.2" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.55" />`;
            })}
          </g>
          <g style="color:var(--app-accent)">
            ${(show.ble ? devices : []).map((d) => {
              const a = angleOf(d.addr), r = rssiRadius(d.rssi);
              return html`<circle key=${d.addr} cx=${(100 + Math.cos(a) * r).toFixed(1)} cy=${(100 + Math.sin(a) * r).toFixed(1)}
                r="3.4" fill="currentColor" opacity=${fresh(d).toFixed(2)} />`;
            })}
          </g>
        </svg>
        <!-- The counters ARE the filter. One row instead of two, and every kind is present even at zero —
             which is the point: a network the sweep never reached and a network with nothing on it were
             indistinguishable while the row only appeared once something was found. -->
        <div data-kinds class=${`absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 ${LABEL} tabular-nums`}>
          ${[
            ["ble", "lucide:bluetooth", devices.length],
            ["wifi", "lucide:wifi", nets.length],
            ["cell", "lucide:radio-tower", cells.length],
            ["lan", "lucide:network", hosts.length],
          ].map(([k, icon, n]) => html`<button key=${k} data-kind-toggle=${k} aria-pressed=${!!show[k]}
              aria-label=${`${L[k] || k}: ${n}`} onClick=${() => toggle(k)}
              class=${`flex items-center gap-1 rounded-full px-2 py-1 transition-[opacity,background-color] ${show[k] ? "bg-base-content/[0.07]" : "opacity-35"}`}
              style=${show[k] && k === "ble" ? "color:var(--app-accent)" : ""}>
            ${Icon(icon, "text-sm")}<span>${n}</span>
          </button>`)}
        </div>
      </div>

      <button id="radar-toggle" class=${`btn btn-sm rounded-full w-full gap-2 mt-2 ${scanning ? "" : "btn-primary"}`}
          disabled=${!!why} data-scanning=${scanning} onClick=${() => (scanning ? stop() : start())}>
        ${Icon(scanning ? "lucide:square" : "lucide:radar")}<span>${T(t, scanning ? "radarStop" : "radarStart")}</span>
      </button>
      ${held && shell.present ? html`<div data-ble-perms class=${`flex flex-wrap gap-x-3 gap-y-1 pt-2 ${LABEL}`}>
        <!-- Both radios' permissions, deduped: fine location is shared, and listing it twice would read
             as two different facts about the same switch. -->
        ${[...new Set([...shell.androidFor("ble"), ...shell.androidFor("wifi"), ...shell.androidFor("cell")])].filter((p) => p in held).map((p) => html`<span key=${p} class=${held[p] ? "text-success" : "text-error"}>${held[p] ? "+" : "−"} ${p}</span>`)}
        ${locOn === false ? html`<span class="text-error">− LOCATION SERVICES</span>` : null}
        <!-- Only meaningful from bridge 15, which is when the shell started sending it. Showing a red
             ACK on an older APK reports a fault that does not exist — the indicator was newer than the
             app it was describing. -->
        ${shell.version >= 15 ? html`<span class=${ack ? "text-success" : "text-error"}>${ack ? "+" : "−"} ACK</span>` : null}
        <span class=${started ? "text-success" : "text-error"}>${started ? "+" : "−"} STARTED</span>
        <!-- Four scans per two minutes is the OS budget. Over it the call still succeeds and returns the
             PREVIOUS results, so without this the screen would quietly show a stale field as a live one. -->
        ${throttled ? html`<span data-wifi-throttled class="text-warning">− THROTTLED</span>` : null}
        <!-- The sweep gets the same treatment as the scan above it. Without SWEEP, "the OS refused it",
             "it is still running" and "it finished empty" were one absent panel with nothing to read. -->
        <span data-lan-flag class=${lanErr ? "text-error" : lanOn || sweep ? "text-success" : "text-error"}>
          ${lanErr || !(lanOn || sweep) ? "−" : "+"} SWEEP${sweep?.done ? ` ${sweep.found}/${sweep.scanned}` : sweep ? ` ${sweep.scanned}/${sweep.total}` : ""}
        </span>
        <!-- WHICH probe found things, not just how many. "ping=0 udp=0 tcp=1" and "ping=9 tcp=1" are
             different faults, and a host count alone reads the same for both. -->
        ${sweep?.sources ? html`<span data-lan-sources class="text-muted">${sweep.sources}</span>` : null}
        <span class="text-muted">rx ${events}</span>
        <!-- The reason belongs NEXT TO the fact it explains. On its own line below it was missed twice,
             which left "no error was shown" and "no error happened" indistinguishable — the one
             distinction this whole diagnostic exists to make. -->
        ${err ? html`<span data-radar-reason class="text-error break-all">${String(err)}</span>` : null}
      </div>` : null}
      ${why ? html`<div class="pt-2 text-sm text-muted">${why === ERR.staleBridge ? T(t, "stStale") : T(t, "stNone")}</div>`
        : err ? html`<div data-radar-err class="pt-2 text-sm text-error">${
            err === ERR.denied ? T(t, "radarDenied")
            : err === ERR.unavailable ? T(t, "radarOff")
            : /scanFailed:6/.test(String(err)) ? T(t, "radarTooOften")
            : /scanFailed:4/.test(String(err)) ? T(t, "radarUnsupported")
            : err}</div>` : null}
    <//>

    <!-- ONE list for one radar. Sorted by signal across both radios, because "what is closest" is the
         question the screen answers and splitting it in two would make that unanswerable at a glance. -->
    ${(show.ble ? devices.length : 0) + (show.wifi ? nets.length : 0) + (show.cell ? cells.length : 0)
      ? html`<${Panel} title=${T(t, "radarSeen")}>
      ${[
        ...(show.ble ? devices : []).map((d) => ({ key: d.addr, kind: "ble", name: d.name || T(t, "radarUnnamed"), sub: d.addr, rssi: d.rssi })),
        ...(show.wifi ? nets : []).map((n) => ({ key: n.bssid || n.ssid, kind: "wifi", name: n.ssid || T(t, "radarHidden"), rssi: n.rssi,
          sub: [band(n.freq), n.bssid].filter(Boolean).join(" · ") })),
        ...(show.cell ? cells : []).map((c) => ({
          key: `${c.type}-${c.pci ?? ""}-${c.cid ?? ""}-${c.arfcn ?? ""}`, kind: "cell", strong: !!c.serving,
          name: [c.type ? c.type.toUpperCase() : "", c.mcc ? `${c.mcc}-${c.mnc ?? ""}` : ""].filter(Boolean).join(" · "),
          sub: [c.pci != null ? `PCI ${c.pci}` : "", c.cid != null ? `CID ${c.cid}` : "", c.arfcn != null ? `ARFCN ${c.arfcn}` : ""].filter(Boolean).join(" · "),
          rssi: c.rssi ?? -999,
        })),
      ].sort((a, b) => b.rssi - a.rssi).map((e) => html`<div key=${e.key} data-dev=${e.key} data-kind=${e.kind}
          class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0">
        ${Icon(e.kind === "wifi" ? "lucide:wifi" : e.kind === "cell" ? "lucide:radio-tower" : "lucide:bluetooth",
          `text-base shrink-0 ${e.kind === "ble" ? "text-primary" : e.strong ? "text-base-content" : "text-muted"}`)}
        <div class="min-w-0 flex-1">
          <div class="text-sm truncate">${e.name}</div>
          <div class=${`${LABEL} text-muted truncate`}>${e.sub}</div>
        </div>
        <div class="font-mono text-sm tabular-nums shrink-0">${e.rssi}<span class=${`${LABEL} text-muted`}>dBm</span></div>
      </div>`)}
    <//>` : null}
    <!-- The network is a different question from the radar above it — not "what is radiating near me" but
         "who shares this wire" — so it gets its own list rather than a shape on a circle it does not fit. -->
    ${show.lan && (hosts.length || sweep || lanOn || lanErr) ? html`<${Panel}>
      <div class="flex items-center gap-2 pb-1">
        ${Icon("lucide:network", "text-base text-primary shrink-0")}
        <span class="font-semibold text-sm min-w-0 flex-1 truncate">${T(t, "radarHosts")}</span>
        <!-- "6 of 254" rather than a count alone: a sweep that ended having looked at everything and one
             that is still a third of the way through produce the same six rows otherwise. -->
        <span data-lan-sweep class=${`${LABEL} text-muted tabular-nums shrink-0`}>
          ${sweep?.done ? `${sweep.found}/${sweep.scanned}` : sweep ? `${sweep.scanned}/${sweep.total}` : hosts.length}
        </span>
      </div>
      <!-- The panel exists from the moment the sweep starts, so the ten seconds before the first host are
           a state and not an absence. It ends by SAYING it ended, even at zero. -->
      ${lanErr ? html`<div data-lan-err class="py-2 text-sm text-error break-all">${lanErr}</div>`
        : !hosts.length ? html`<div data-lan-state class="py-2 text-sm text-muted">
            ${sweep ? T(t, "lanNone") : T(t, "lanSweeping")}
          </div>` : null}
      ${hosts.map((h) => html`<div key=${h.ip} data-host=${h.ip}
          class="flex items-center gap-3 py-2 border-b border-base-content/10 last:border-0">
        ${Icon(h.via.includes("ssdp") ? "lucide:tv-minimal" : "lucide:hard-drive", "text-base text-muted shrink-0")}
        <div class="min-w-0 flex-1">
          <div class="text-sm truncate">${h.name || h.ip}</div>
          <div class=${`${LABEL} text-muted truncate`}>${h.name ? `${h.ip}${h.ports ? ` · ${h.ports}` : ""}` : (h.ports || T(t, "hostQuiet"))}</div>
        </div>
      </div>`)}
    <//>` : null}

  </div>`;
}
