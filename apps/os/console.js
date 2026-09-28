import { html } from "htm/preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { shell, ERR } from "/_rt/shell.js";
import { Icon, LABEL } from "./ui.js";

const $runs = atom({});
const record = (id, v) => $runs.set({ ...$runs.get(), [id]: v });

const CAP_ICON = {
  system: "lucide:cpu", notify: "lucide:bell", alarm: "lucide:alarm-clock",
  background: "lucide:activity", wifi: "lucide:wifi", cell: "lucide:radio-tower",
  ble: "lucide:bluetooth", advertise: "lucide:radio", usb: "lucide:usb", location: "lucide:map-pin",
  files: "lucide:folder", server: "lucide:server", lan: "lucide:network",
};

const PROBE = {
  "system.info": () => ({}),
  "notify.show": (t) => ({ id: "os-probe", title: T(t, "probeNoteTitle"), body: T(t, "probeNoteBody") }),
  "notify.cancel": () => ({ id: "os-probe" }),
  "alarm.set": (t) => ({ id: "os-probe", at: Date.now() + 60_000, title: T(t, "probeAlarmTitle"), body: T(t, "probeAlarmBody") }),
  "alarm.cancel": () => ({ id: "os-probe" }),
  "alarm.list": () => ({}),
  "bg.start": (t) => ({ title: T(t, "probeBgTitle"), body: T(t, "probeBgBody") }),
  "bg.stop": () => ({}),
  "bg.status": () => ({}),
  "wifi.scan": () => ({}),
  "wifi.info": () => ({}),
  "cell.info": () => ({}),
  "system.grant": () => ({ permission: "READ_PHONE_STATE" }),
  "ble.state": () => ({}),
  "ble.advertise": () => ({ data: "6d736f73", ms: 3000 }),
  "ble.silence": () => ({}),
  "usb.list": () => ({}),
  "system.logs": () => ({}),
  "files.roots": () => ({}),
  "system.battery": () => ({}),
  "server.start": () => ({ port: 8080 }),
  "server.put": (t) => ({ path: "/", contentType: "text/html; charset=utf-8",
    base64: btoa(unescape(encodeURIComponent(`<!doctype html><meta charset=utf-8><title>${T(t, "title")}</title><h1>${T(t, "title")}</h1>`))) }),
  "server.status": () => ({}),
  "server.stop": () => ({}),
  "share.target": () => ({ kinds: [] }),
};

const stateOf = (id) => (shell.has(id) ? "ok" : shell.why(id) === ERR.staleBridge ? "stale" : "none");
const DOT = { ok: "bg-success", stale: "bg-warning", none: "bg-base-content/25" };

function groups() {
  const by = new Map();
  for (const id of shell.actions) {
    const cap = shell.action(id).capability;
    if (!by.has(cap)) by.set(cap, []);
    by.get(cap).push(id);
  }
  return [...by.entries()];
}

async function run(id, t, loc) {
  const args = PROBE[id] ? PROBE[id](t) : null;
  if (!args) { record(id, { ok: false, text: T(t, "noProbe"), ms: 0 }); return; }
  const t0 = Date.now();
  try {
    const value = await shell.call(id, args);
    record(id, { ok: true, text: summarise(id, value, loc), ms: Date.now() - t0 });
  } catch (e) {
    record(id, { ok: false, text: e?.code ? `${e.code}${e.detail ? ` · ${e.detail}` : ""}` : String(e), ms: Date.now() - t0 });
  }
}

function summarise(id, v, loc) {
  if (!v || typeof v !== "object") return String(v);
  if (id === "system.info") return `bridge ${v.bridge} · SDK ${v.sdk} · ${v.model}`;
  if (id === "alarm.set") return `${new Date(v.at).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })} · ${v.exact ? "exact" : "inexact"}`;
  if (id === "alarm.list") return `${(v.alarms || []).length}`;
  if (id === "wifi.scan") return `${(v.networks || []).length}${v.throttled ? " · throttled" : ""}`;
  if (id === "wifi.info") return v.connected ? `${v.ssid || "?"} ${v.rssi}dBm` : "—";
  if (id === "cell.info") return `${(v.cells || []).length}`;
  if (id === "system.grant") return v.state;
  if (id === "share.target") return (v.kinds || []).join(" ") || "—";
  if (id === "ble.state") {
    if (!v.supported) return "—";
    const adv = v.maxAdvLen ? ` · ${v.maxAdvLen}B${v.extAdv ? " ext" : ""}` : "";
    return `${v.on ? "on" : "off"}${adv}${v.advertising ? " · advertising" : ""}`;
  }
  if (id === "ble.advertise") return `${v.bytes ?? 0}B${v.replaced ? " · replaced" : ""}`;
  if (id === "ble.silence") return v.advertising ? "still on" : "off";
  if (id === "usb.list") return `${(v.devices || []).length}`;
  if (id === "system.logs") return `${(v.lines || []).length}`;
  if (id === "system.battery") return `${v.level}%${v.charging ? " · charging" : ""}${v.unrestricted === false ? " · restricted" : ""}`;
  if (id === "files.roots") return `${(v.roots || []).length}`;
  if (id === "files.list") return `${(v.entries || []).length}`;
  if (id.startsWith("server.")) return v.url || (v.running === false ? "off" : v.path || String(v.running));
  if (v.id) return v.id;
  if ("ok" in v) return String(v.ok);
  return JSON.stringify(v);
}

function Row({ id, t, loc }) {
  const runs = useStore($runs);
  const a = shell.action(id);
  const st = stateOf(id);
  const last = runs[id];
  const [busy, setBusy] = useState(false);
  const press = async () => { setBusy(true); await run(id, t, loc); setBusy(false); };
  return html`<div data-action=${id} class="flex items-center gap-3 py-2.5 border-b border-base-content/10 last:border-0">
    <span class=${`size-2 rounded-full shrink-0 ${DOT[st]}`} aria-hidden="true"></span>
    <div class="min-w-0 flex-1">
      <div class="font-mono text-sm truncate">${id}</div>
      <div class=${`${LABEL} text-muted truncate`}>
        ${st === "none" ? T(t, "stNone") : st === "stale" ? T(t, "stStale") : a.android.length ? a.android.join(" · ") : T(t, "noPerm")}
      </div>
      <!-- The result goes UNDER the name, across the full width. On the right it had ~8.5rem and
           truncated anything real: a LAN URL, a permission name, an exception. A result you cannot read
           is the same as no result — and this console exists to be read. -->
      ${last ? html`<div class=${`mt-1 flex items-baseline gap-2 font-mono text-[length:var(--ms-label)] tabular-nums ${last.ok ? "text-base-content/80" : "text-error"}`}>
        <span data-result=${id} class="break-all min-w-0">${last.text}</span>
        <span class="text-muted shrink-0">${last.ms} ms</span>
      </div>` : null}
    </div>
    <button class="btn btn-sm btn-circle btn-ghost shrink-0" disabled=${busy || !PROBE[id]}
        data-run=${id} aria-label=${`${T(t, "run")} ${id}`} onClick=${press}>
      ${Icon(PROBE[id] ? "lucide:play" : "lucide:minus", "text-base")}
    </button>
  </div>`;
}

export function Console({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [all, setAll] = useState(false);
  const present = shell.present;
  const ids = shell.actions;
  const done = ids.filter((id) => runs[id]).length;
  const failed = ids.filter((id) => runs[id] && !runs[id].ok).length;

  const runAll = async () => {
    if (all) return;
    setAll(true);
    for (const id of ids) await run(id, t, loc);
    setAll(false);
    toast?.(T(t, "ranAll"));
  };

  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">
    ${""}
    <${Panel} data-bridge>
      <div class="flex items-center gap-3">
        <span class=${`size-2.5 rounded-full shrink-0 ${present ? "bg-success" : "bg-base-content/25"}`} aria-hidden="true"></span>
        <div class="min-w-0 flex-1">
          <div class="font-medium truncate">${present ? T(t, "bridgeOn") : T(t, "bridgeOff")}</div>
          <div class=${`${LABEL} text-muted truncate`}>${present ? `bridge ${shell.version}` : T(t, "bridgeOffHint")}</div>
        </div>
        ${done ? html`<span data-tally class=${`${LABEL} tabular-nums shrink-0 ${failed ? "text-error" : "text-success"}`}>${done}/${ids.length}</span>` : null}
      </div>
      <!-- The checklist walk is the whole point of this screen, so it gets its own full-width row rather
           than competing with the status line for it — which truncated the status on a 360px phone. -->
      <button id="run-all" class="btn btn-sm btn-primary rounded-full w-full gap-2" disabled=${all} data-run-all onClick=${runAll}>
        ${Icon("lucide:list-checks")}<span>${T(t, "runAll")}</span>
      </button>
    <//>

    ${groups().map(([cap, ids2]) => html`<${Panel} key=${cap}>
      <div class="flex items-center gap-2 pb-1">
        ${Icon(CAP_ICON[cap] || "lucide:box", "text-base text-primary")}
        <span class="font-semibold text-sm">${T(t, `cap_${cap}`)}</span>
        <span class=${`${LABEL} text-muted ml-auto`}>${cap}</span>
      </div>
      ${ids2.map((id) => html`<${Row} key=${id} id=${id} t=${t} loc=${loc} />`)}
    <//>`)}

    <!-- The report lives HERE now, not in a tab of its own. It reads the same bridge these rows just
         exercised, and its copy button carries their results — one paste, one chain. -->
    <${Report} S=${S} t=${t} toast=${toast} />
  </div>`;
}

function Report({ S, t, toast }) {
  const loc = useStore(S.locale);
  const runs = useStore($runs);
  const [logs, setLogs] = useState([]);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);

  const load = async () => {
    try { setInfo(await shell.call("system.info", {})); setErr(null); }
    catch (e) { setErr(e?.code || ERR.failed); setInfo(null); }
    try { setLogs((await shell.call("system.logs", {})).lines || []); } catch { setLogs([]); }
  };
  useEffect(() => { load(); }, []);

  const lines = () => {
    const rows = [
      ["bridge", shell.present ? String(shell.version) : "—"],
      ["catalogue", `${shell.actions.length}`],
      ["version", info ? `${info.version || "?"} (${info.build ?? "?"})` : "—"],
      ["installed", info?.installed ? new Date(info.installed).toLocaleString(loc) : "—"],
      ["granted", info?.caps || "—"],
      ["sdk", info ? String(info.sdk) : "—"],
      ["release", info?.release || "—"],
      ["model", info?.model || "—"],
      ["package", info?.pkg || "—"],
      ["missing", info?.missing?.length ? info.missing.join(",") : "—"],
    ];
    for (const [id, r] of Object.entries(runs)) rows.push([id, `${r.ok ? "ok" : "fail"} ${r.text} (${r.ms}ms)`]);
    for (const line of logs) rows.push(["log", line]);
    return rows;
  };

  const copy = async () => {
    const text = lines().map(([k, v]) => `${k}: ${v}`).join("\n");
    try { await navigator.clipboard.writeText(text); toast?.(T(t, "copied")); } catch { toast?.(T(t, "copyFail")); }
  };

  return html`<div class="flex flex-col gap-3">
    <${Panel} title=${T(t, "reportTitle")}>
      <div data-report class="flex flex-col">
        ${lines().map(([k, v]) => html`<div key=${k} class="flex items-baseline gap-3 py-1.5 border-b border-base-content/10 last:border-0">
          <span class=${`${LABEL} text-muted w-20 shrink-0 truncate`}>${k}</span>
          <span class="font-mono text-sm min-w-0 flex-1 break-all">${v}</span>
        </div>`)}
      </div>
    <//>
    ${err ? html`<div class="text-sm text-error px-1">${err === ERR.unsupported ? T(t, "stNone") : err}</div>` : null}
    <div class="flex gap-2">
      <button id="rep-load" class="btn btn-sm btn-primary rounded-full flex-1 gap-2" onClick=${load}>${Icon("lucide:refresh-cw")}<span>${T(t, "reload")}</span></button>
      <button id="rep-copy" class="btn btn-sm rounded-full flex-1 gap-2" onClick=${copy}>${Icon("lucide:copy")}<span>${T(t, "copy")}</span></button>
    </div>
  </div>`;
}
