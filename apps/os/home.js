import { html } from "htm/preact";
import { Fragment } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { atom } from "nanostores";
import { T } from "/_rt/i18n.js";
import { Panel } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { shell } from "/_rt/shell.js";
import { buildApk, apkFilename } from "/_rt/apk.js";
import { PERMISSIONS, GROUPS, permLabels, permState, permRequest, refreshHeld } from "/_rt/permissions.js";
import { HeroAura, DeviceConstellation } from "./hero.js";
import { ROSTER, STATE, classify as classifyDevices, demoStates } from "./devices.js";
import { Icon, LABEL, CAPTION, Field } from "./ui.js";
import { Console } from "./console.js";
import { Ports } from "./ports.js";
import { band } from "./radar.js";

const TILE_DOT = { granted: "bg-success", partial: "bg-warning", denied: "bg-error", needsApp: "bg-base-content/30", staleApp: "bg-warning", prompt: "", unsupported: "", unknown: "" };

function Launcher({ S, loc, t, toast }) {
  const L = permLabels(loc);
  const [states, setStates] = useState({});
  const keys = Object.keys(PERMISSIONS);

  const refresh = async () => {
    await refreshHeld();
    const out = {};
    for (const k of keys) out[k] = (await permState(k)).state;
    setStates(out);
  };
  useEffect(() => { refresh(); }, []);

  const tap = async (k) => {
    const st = states[k];
    if (k === "files") {
      if (!shell.hasCapability("files")) { toast?.(st === "staleApp" ? L.staleAppHint : L.needsAppHint); return; }
      S.tab.set("files");
      return;
    }
    if (PERMISSIONS[k]?.capability && shell.present) { await permRequest(k); await refresh(); return; }
    if (st === "granted") { toast?.(L.revokeHint); return; }
    if (st === "needsApp") { toast?.(L.needsAppHint); return; }
    if (st === "staleApp") { toast?.(L.staleAppHint); return; }
    if (st === "denied") {
      if (shell.has("system.settings")) { await shell.call("system.settings", { page: "app" }); return; }
      toast?.(L.deniedHint);
      return;
    }
    await permRequest(k);
    await refresh();
  };

  const ordered = GROUPS.flatMap((g) => keys.filter((k) => PERMISSIONS[k].group === g));

  return html`<${Panel} title=${L.title}>
    <div data-launcher class="grid grid-cols-4 @min-[520px]:grid-cols-6 gap-x-3 gap-y-4 pt-2">
      <a data-store href="../store/" class="flex flex-col items-center gap-1.5 min-w-0">
        <span class="grid place-items-center aspect-square w-full rounded-[var(--ms-r-in)] sf-raised sf-e2">
          ${Icon("lucide:layout-grid", "text-2xl text-primary")}
        </span>
        <span class=${`${CAPTION} text-base-content/80`}>${T(t, "storeTile")}</span>
      </a>
      ${ordered.map((k) => {
        const st = states[k] || "unknown";
        const dim = st === "needsApp" || st === "unsupported";
        return html`<button key=${k} data-perm=${k} data-state=${st} onClick=${() => tap(k)}
            class="flex flex-col items-center gap-1.5 min-w-0 transition-opacity"
            aria-label=${`${L[k]} — ${L[st] || st}`}>
          <span class=${`relative grid place-items-center aspect-square w-full rounded-[var(--ms-r-in)] sf-raised sf-e2 ${dim ? "opacity-45" : ""}`}>
            ${Icon(PERMISSIONS[k].icon, "text-2xl text-base-content")}
            ${TILE_DOT[st] ? html`<span class=${`absolute -top-1 -right-1 size-2.5 rounded-full ring-2 ring-base-100 ${TILE_DOT[st]}`} aria-hidden="true"></span>` : null}
          </span>
          <span class=${`${CAPTION} ${dim ? "text-muted" : "text-base-content/80"}`}>${L[k]}</span>
        </button>`;
      })}
    </div>
  <//>`;
}

function Perms({ S, t, toast }) {
  const loc = useStore(S.locale);
  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1"><${Launcher} S=${S} loc=${loc} t=${t} toast=${toast} /></div>`;
}

function Station({ S, t, toast }) {
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);

  const read = async () => { try { setSt(await shell.call("server.status", {})); } catch { setSt(null); } };
  useEffect(() => { read(); }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (st?.running) { await shell.call("server.stop", {}); }
      else {
        await shell.call("server.start", { port: 8080 });
        const page = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">`
          + `<title>${T(t, "title")}</title><body style="font:16px system-ui;padding:2rem"><h1>${T(t, "title")}</h1>`;
        await shell.call("server.put", { path: "/", contentType: "text/html; charset=utf-8", base64: btoa(unescape(encodeURIComponent(page))) });
      }
      await read();
    } catch (e) { toast?.(e?.code || String(e)); } finally { setBusy(false); }
  };

  const on = !!st?.running;
  return html`<div class="flex flex-col gap-[var(--ms-gap)] pt-1">
    <${Panel}>
      <div data-station class="flex flex-col">
        <${Field} label=${T(t, "srvState")} value=${on ? T(t, "srvOn") : T(t, "srvOff")} tone=${on ? "ok" : ""} />
        ${on ? html`<${Field} label=${T(t, "srvUrl")} value=${st.url || "—"} mono wrap />` : null}
        <!-- One number per label. "3 · 1" was requests and resources under a heading that named only the
             first — the same defect twice on two screens, and moving it here did not fix it. -->
        ${on ? html`<${Field} label=${T(t, "srvServed")} value=${String(st.hits ?? 0)} mono />` : null}
        ${on ? html`<${Field} label=${T(t, "srvRoutes")} value=${String(st.routes ?? 0)} mono />` : null}
      </div>
      <button id="srv-toggle" data-on=${on} class=${`btn btn-sm rounded-full w-full gap-2 mt-3 ${on ? "" : "btn-primary"}`}
          disabled=${busy || !shell.has("server.start")} onClick=${toggle}>
        <!-- Power, not play: a station is switched on, and a play/square pair would claim this is a media
             transport — which is exactly what preflight reads it as, and it is right to. -->
        ${Icon(on ? "lucide:power-off" : "lucide:power")}<span>${T(t, on ? "srvStop" : "srvStart")}</span>
      </button>
    <//>
  </div>`;
}

const $home = atom(null);
const HOME_MS = 30_000;

export function home({ S, t, toast }) {
  const loc = useStore(S.locale);
  const screen = useStore($home);
  const [info, setInfo] = useState(null);
  const [batt, setBatt] = useState(null);
  const [net, setNet] = useState(null);
  const [roots, setRoots] = useState(null);
  const [ble, setBle] = useState(null);
  const [usb, setUsb] = useState(null);
  const [alarms, setAlarms] = useState(null);
  const [srv, setSrv] = useState(null);
  const [upd, setUpd] = useState(false);

  const read = async () => {
    if (shell.has("system.info")) { try { setInfo(await shell.call("system.info", {})); } catch { } }
    if (shell.has("system.battery")) { try { setBatt(await shell.call("system.battery", {})); } catch { setBatt(null); } }
    if (shell.has("wifi.info")) { try { setNet(await shell.call("wifi.info", {})); } catch { setNet(null); } }
    if (shell.has("files.roots")) { try { setRoots((await shell.call("files.roots", {})).roots || []); } catch { setRoots(null); } }
    if (shell.has("ble.state")) { try { setBle(await shell.call("ble.state", {})); } catch { setBle(null); } }
    if (shell.has("usb.list")) { try { setUsb((await shell.call("usb.list", {})).devices || []); } catch { setUsb(null); } }
    if (shell.has("alarm.list")) { try { setAlarms((await shell.call("alarm.list", {})).alarms || []); } catch { setAlarms(null); } }
    if (shell.has("server.status")) { try { setSrv(await shell.call("server.status", {})); } catch { setSrv(null); } }
  };
  useEffect(() => {
    read();
    if (gate) {
      const want = new URLSearchParams(location.search).get("home");
      if (want && ["perms", "console", "station", "ports"].includes(want)) { $home.set(want); S.stack.set([want]); }
    }
    const id = setInterval(read, HOME_MS);
    return () => { clearInterval(id); $home.set(null); if (S.stack.get().length) S.stack.set([]); };
  }, []);

  useEffect(() => S.stack.listen((v) => { if (!(v?.length) && $home.get()) $home.set(null); }), []);
  const open = (id) => { $home.set(id); S.stack.set([id]); };

  const update = async () => {
    if (upd) return;
    setUpd(true);
    try {
      const url = location.href.split("#")[0].split("?")[0];
      const blob = await buildApk({ url, name: T(t, "title") });
      const b64 = await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(",")[1]); f.onerror = rej; f.readAsDataURL(blob); });
      await shell.call("system.update", { name: apkFilename(T(t, "title")), base64: b64 });
      toast?.(T(t, "updStarted"));
    } catch (e) { toast?.(e?.code || T(t, "updFailed")); } finally { setUpd(false); }
  };

  const sub = (body) => html`<div data-home data-screen=${screen}>${body}</div>`;
  if (screen === "perms") return sub(html`<${Perms} S=${S} t=${t} toast=${toast} />`);
  if (screen === "console") return sub(html`<${Console} S=${S} t=${t} toast=${toast} />`);
  if (screen === "station") return sub(html`<${Station} S=${S} t=${t} toast=${toast} />`);
  if (screen === "ports") return sub(html`<${Ports} S=${S} t=${t} toast=${toast} />`);

  const battLine = !batt ? "—"
    : [`${batt.level}%`, T(t, batt.charging ? "battCharging" : "battIdle"),
       batt.saver ? T(t, "battSaver") : "", batt.unrestricted === false ? T(t, "battRestricted") : ""]
      .filter(Boolean).join(" · ");
  const netLine = !net ? "—" : net.connected ? `${net.ssid || "?"}` : T(t, "netOff");
  const radioLine = [
    ble ? `BT ${T(t, ble.supported ? (ble.on ? "radioOn" : "radioOff") : "radioNone")}` : "",
    usb == null ? "" : `USB ${usb.length}`,
  ].filter(Boolean).join("  ·  ") || "—";
  const netSub = net?.connected ? [`${net.rssi} dBm`, band(net.freq), net.ip].filter(Boolean).join(" · ") : "";

  const TILES = [
    ["store", "lucide:layout-grid", T(t, "storeTile"), null],
    ["station", "lucide:server", T(t, "tileStation"), () => open("station")],
    ["ports", "lucide:plug", T(t, "tilePorts"), () => open("ports")],
    ["perms", "lucide:shield-check", T(t, "tilePerms"), () => open("perms")],
    ["console", "lucide:terminal", T(t, "tileConsole"), () => open("console")],
  ];

  const dvMap = gate ? demoStates() : classifyDevices({ present: shell.present, usb: usb || [], ble });
  const dv = ROSTER.map((d) => ({ ...d, state: dvMap.get(d.id) || STATE.ABSENT }));
  const aliveN = dv.filter((d) => d.state === STATE.CONNECTED || d.state === STATE.ACTIVE).length;
  const alive = 0.4 + 0.6 * (dv.length ? aliveN / dv.length : 0);

  return html`<${Fragment}>
    <${HeroAura} alive=${alive} />
    <div data-home data-screen="home" data-bridge-on=${shell.present ? "1" : "0"} class="relative z-10 flex flex-col gap-[var(--ms-gap)] pt-1">
      <${DeviceConstellation} devices=${dv} t=${t} />
      ${!shell.present ? html`<div class=${`${CAPTION} text-muted text-center -mt-1`}>${T(t, "devNeedApp")}</div>` : null}
    ${shell.updateAvailable ? html`<${Panel} data-update>
      <div class="flex items-center gap-3">
        ${Icon("lucide:download", "text-xl text-warning shrink-0")}
        <div class="min-w-0 flex-1">
          <div class="font-medium truncate">${T(t, "updTitle")}</div>
          <div class=${`${LABEL} text-muted truncate`}>bridge ${shell.version} → ${shell.catalogueVersion}</div>
        </div>
        <button id="do-update" class="btn btn-sm btn-warning rounded-full shrink-0" disabled=${upd} onClick=${update}>${T(t, "updBtn")}</button>
      </div>
    <//>` : null}

    <${Panel}>
      <div data-state class="flex flex-col">
        <${Field} label=${T(t, "secDevice")} value=${info?.model || "—"}
          sub=${info ? `Android ${info.release || "?"} · SDK ${info.sdk ?? "?"}` : ""} />
        <${Field} label=${T(t, "secBattery")} value=${battLine} mono
          tone=${batt && batt.level <= 15 && !batt.charging ? "bad" : batt?.charging ? "ok" : ""} />
        <${Field} label=${T(t, "secNetwork")} value=${netLine} sub=${netSub} />
        <${Field} label=${T(t, "secRadio")} value=${radioLine} mono />
        <${Field} label=${T(t, "secStorage")} value=${roots == null ? "—" : roots.length ? roots.map((r) => r.name).join(" · ") : T(t, "secNoFolder")} />
        <!-- The address, and nothing else. "3 · 1" was hits and routes — the same two-bare-numbers defect
             the bridge line had, and those belong to the station screen where they are labelled. -->
        <${Field} label=${T(t, "secStation")} value=${srv?.running ? (srv.url || T(t, "srvOn")) : T(t, "srvOff")} mono
          tone=${srv?.running ? "ok" : ""} />
        <${Field} label=${T(t, "secAlarms")} value=${alarms == null ? "—" : String(alarms.length)} mono
          sub=${alarms?.length ? new Date(Math.min(...alarms.map((a) => a.at))).toLocaleString(loc, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : ""} />
        <!-- The bridge's own line carries only what is WRONG. "32 · —" said the catalogue has 32 actions
             and none are missing, which is two facts nobody can read; the action count belongs to the
             console, and a dash for "nothing is broken" is noise pretending to be data. -->
        <${Field} label=${T(t, "secBridge")} value=${shell.present ? `bridge ${shell.version}` : T(t, "bridgeOff")} mono
          tone=${shell.present ? "ok" : "bad"}
          sub=${info?.missing?.length ? `missing ${info.missing.join(" ")}` : ""} />
      </div>
    <//>

    <div data-tiles class="grid grid-cols-4 gap-x-3 gap-y-4 px-1">
      ${TILES.map(([id, icon, label, onClick]) => {
        const inner = html`<${Fragment}>
          <span class="grid place-items-center aspect-square w-full rounded-[var(--ms-r-in)] sf-raised sf-e2">
            ${Icon(icon, "text-2xl text-base-content")}
          </span>
          <span class=${`${CAPTION} text-base-content/80`}>${label}</span>
        <//>`;
        return onClick
          ? html`<button key=${id} data-go=${id} class="flex flex-col items-center gap-1.5 min-w-0" onClick=${onClick}>${inner}</button>`
          : html`<a key=${id} data-go=${id} data-store href="../store/" class="flex flex-col items-center gap-1.5 min-w-0">${inner}</a>`;
      })}
    </div>
  </div>
  <//>`;
}
