import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { T } from "/_rt/i18n.js";
import { band, rotates } from "/_rt/radar.js";
import { vendorOf } from "/_rt/oui.js";
import { labelOf } from "./store.js";

export function dossier(d, t, oui, loc) {
  const L = (k) => T(t, k);
  const time = (ms) => new Date(ms).toLocaleTimeString(loc === "en" ? "en-GB" : "uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const rssi = Math.round(d.smooth ?? d.rssi);
  const lines = [
    `${labelOf(d, t)} · ${L("k" + d.kind[0].toUpperCase() + d.kind.slice(1))}`,
    `${d.kind === "wifi" ? "BSSID" : d.kind === "lte" ? L("cellId") : L("address")} ${d.addr}`,
    `${L("signal")} ${rssi} dBm · ${d.percent}% · ${L("band_" + band(d.smooth ?? d.rssi))}`,
  ];
  const vendor = vendorOf(d.addr, d.kind, oui);
  if (vendor) lines.push(`${L("vendor")} ${vendor}`);
  if (d.kind === "ble") {
    if (rotates(d.addr)) lines.push(L("rotating"));
    if (d.cls?.protocols?.length) lines.push(`${L("protocols")} ${d.cls.protocols.join(", ")}`);
    if (d.cls?.tracker && d.cls.tracker !== "none") lines.push(`${L("tracker")} ${L(d.cls.tracker === "separated" ? "separatedNow" : "watching")}`);
    if (d.raw) lines.push(`${L("advert")} ${d.raw}`);
  }
  if (d.kind === "wifi") {
    if (d.freq) lines.push(`${L("freq")} ${d.freq} MHz${chanOf(d.freq) ? ` · ${L("channel")} ${chanOf(d.freq)}` : ""}`);
    if (d.ftm != null) lines.push(`FTM (802.11mc) ${L(d.ftm ? "yes" : "no")}`);
  }
  if (d.kind === "lte") {
    lines.push(`${L("role")} ${L(d.serving ? "serving" : "neighbour")}`);
    if (d.cid) lines.push(`CID ${d.cid}`);
    if (d.lac) lines.push(`LAC ${d.lac}`);
  }
  lines.push(`${L("firstSeen")} ${time(d.first)} · ${L("lastSeen")} ${time(d.at)} · ${L("samples")} ${d.sightings?.length ?? 0}`);
  return lines.join("\n");
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

function chanOf(mhz) {
  if (mhz === 2484) return 14;
  if (mhz >= 2412 && mhz <= 2472) return (mhz - 2407) / 5;
  if (mhz >= 5160 && mhz <= 5885) return (mhz - 5000) / 5;
  if (mhz >= 5955 && mhz <= 7115) return (mhz - 5950) / 5;
  return null;
}

const PIN = "#F2B84B";

export function MapView({ lat, lon, accuracy }) {
  const ref = useRef(null);
  useEffect(() => {
    let map = null, alive = true, timer = 0;
    (async () => {
      const mod = await import("./leaflet.vendor.js");
      const L = mod.default ?? mod;
      if (!alive || !ref.current) return;
      map = L.map(ref.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.5 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      const r = Math.max(accuracy || 0, 25);
      L.circle([lat, lon], { radius: r, color: PIN, weight: 1, opacity: .6, fillColor: PIN, fillOpacity: .14 }).addTo(map);
      L.circleMarker([lat, lon], { radius: 6, color: "#0A0A0D", weight: 2, fillColor: PIN, fillOpacity: 1 }).addTo(map);
      map.fitBounds(L.latLng(lat, lon).toBounds(r * 2.4), { animate: false });
      timer = setTimeout(() => { if (alive && map) { map.invalidateSize(); ref.current?.setAttribute("data-map-ready", "1"); } }, 380);
    })();
    return () => { alive = false; clearTimeout(timer); map?.remove(); };
  }, [lat, lon, accuracy]);
  return html`<div ref=${ref} data-map class="hv-map w-full rounded-[var(--ms-r)] overflow-hidden sf-inset bg-black" style="height:min(60dvh, 380px)"></div>`;
}
