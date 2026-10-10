import { html } from "htm/preact";
import { useEffect, useRef } from "preact/hooks";
import { isGate } from "/_rt/gate.js";
import { viewFor, DEV_HOST, $glReady, shortSalary } from "./jobs.js";

const GEO = `${location.origin}/geo`;   // same origin, absolute — deck.gl's tile template is resolved by loaders.gl, not the page
const LUMA = "9.4.2";
const DECK_URL = `https://esm.sh/deck.gl@9.4.0?deps=${["core", "engine", "shadertools", "webgl", "gpgpu", "gltf"].map((p) => `@luma.gl/${p}@${LUMA}`).join(",")}`;

const LANDMARKS = {
  kyiv: [
    { id: "maidan", uk: "Майдан Незалежності", en: "Maidan Nezalezhnosti", lat: 50.45024, lon: 30.52406 },
    { id: "sofia", uk: "Софійський собор", en: "St Sophia Cathedral", lat: 50.45291, lon: 30.51425 },
    { id: "lavra", uk: "Києво-Печерська лавра", en: "Kyiv Pechersk Lavra", lat: 50.435, lon: 30.55445 },
    { id: "zoloti", uk: "Золоті ворота", en: "Golden Gate", lat: 50.44885, lon: 30.51337 },
    { id: "motherland", uk: "Батьківщина-Мати", en: "Motherland Monument", lat: 50.42655, lon: 30.56307 },
    { id: "vdng", uk: "ВДНГ", en: "VDNH", lat: 50.38085, lon: 30.47658 },
    { id: "olymp", uk: "НСК Олімпійський", en: "Olimpiyskiy Stadium", lat: 50.43404, lon: 30.51897 },
    { id: "kontraktova", uk: "Контрактова площа", en: "Kontraktova Square", lat: 50.46271, lon: 30.51839 },
  ],
  lviv: [
    { id: "rynok", uk: "Площа Ринок", en: "Rynok Square", lat: 49.84193, lon: 24.03237 },
    { id: "vysokyi", uk: "Високий замок", en: "High Castle", lat: 49.84817, lon: 24.03924 },
    { id: "potocki", uk: "Палац Потоцьких", en: "Potocki Palace", lat: 49.83795, lon: 24.02693 },
  ],
  odesa: [
    { id: "potemkin", uk: "Потьомкінські сходи", en: "Potemkin Stairs", lat: 46.4885, lon: 30.74188 },
    { id: "derybasivska", uk: "Дерибасівська вулиця", en: "Derybasivska Street", lat: 46.48431, lon: 30.73574 },
    { id: "prymorskyi", uk: "Приморський бульвар", en: "Prymorsky Boulevard", lat: 46.48786, lon: 30.74132 },
  ],
  kharkiv: [
    { id: "derzhprom", uk: "Держпром", en: "Derzhprom", lat: 50.00486, lon: 36.23222 },
    { id: "mirror", uk: "Дзеркальний струмінь", en: "Mirror Stream", lat: 49.99865, lon: 36.23471 },
    { id: "annunciation", uk: "Благовіщенський собор", en: "Annunciation Cathedral", lat: 49.9909, lon: 36.22225 },
  ],
  dnipro: [
    { id: "naberezhna", uk: "Дніпровська набережна", en: "Dnipro Embankment", lat: 48.44506, lon: 35.07754 },
    { id: "menora", uk: "Менора", en: "Menorah Center", lat: 48.46371, lon: 35.05327 },
    { id: "ostriv", uk: "Монастирський острів", en: "Monastyrsky Island", lat: 48.46008, lon: 35.08263 },
  ],
};
const lmUrl = (id) => new URL(`assets/lm-${id}.webp`, import.meta.url).href;
const LM_ZOOM = 12.5;
const LM_Z = 120;

let _ctx = null;
function themeRGB(name, fb) {
  try {
    const p = document.createElement("span");
    p.style.cssText = `color:var(${name});position:absolute;left:-9999px`;
    document.body.appendChild(p);
    const c = getComputedStyle(p).color;
    p.remove();
    _ctx = _ctx || document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    _ctx.clearRect(0, 0, 1, 1); _ctx.fillStyle = "#000"; _ctx.fillStyle = c; _ctx.fillRect(0, 0, 1, 1);
    const d = _ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  } catch { return fb; }
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
let _pal = null;
function palette() {
  const base2 = themeRGB("--color-base-200", [10, 10, 12]);
  const ink = themeRGB("--color-base-content", [235, 235, 235]);
  const key = `${document.documentElement.dataset.theme || ""}|${base2.join()}|${ink.join()}`;
  if (_pal && _pal.key === key) return _pal;
  const base1 = themeRGB("--color-base-100", [16, 16, 18]);
  const base3 = themeRGB("--color-base-300", [22, 22, 26]);
  const accent = themeRGB("--app-accent", [242, 184, 75]);
  const accent2 = themeRGB("--app-accent-2", [92, 228, 220]);
  const dark = (ink[0] + ink[1] + ink[2]) / 3 > 140;
  const white = [255, 255, 255];
  return (_pal = {
    key, dark, bg: base2, ink, accent,
    building: mix(base2, ink, dark ? 0.09 : 0.15), buildingHi: dark ? mix(base2, ink, 0.26) : mix(base2, ink, 0.05),
    water: [...mix(base3, accent2, dark ? 0.35 : 0.45), 210], waterLine: [...mix(base3, accent2, 0.6), 160],
    roadMajor: [...mix(base2, ink, dark ? 0.62 : 0.6), 215], roadMid: [...mix(base2, ink, dark ? 0.46 : 0.42), 180], road: [...mix(base2, ink, dark ? 0.34 : 0.28), 140],
    district: [...ink, dark ? 55 : 50], districtText: [...ink, 200],
    stationRing: [...(dark ? base2 : white), 235],
    pillBg: [...base1, 242], pillBgSel: [...mix(base1, accent, 0.28), 250], pillText: [...ink, 255], pillBorder: [...accent, 255],
    clusterBg: [...accent, 245], clusterText: [...(dark ? base2 : white), 255],
    accentHi: mix(accent, white, 0.35), leader: [...accent, 150], lmLeader: [...ink, 70],
    me: [...accent2, 255],
    lmText: [...ink, 255], lmBg: [...base1, 224],
  });
}

const PILL_H = 34, PILL_GAP = 8;
const BLOCK_H = 40, PILL_Z = 120;
const BLD_ZOOM = 12.5;
const LABEL_ZOOM = 13.2;
const labelOf = (c) => (c.count > 1 ? String(c.count) : (shortSalary(c.jobs[0] && c.jobs[0].salary) || ""));
const pillW = (lab) => (lab ? lab.length * 7.6 + 20 : 12);
function clusterJobs(jobs, vp) {
  const out = [];
  for (const j of jobs) {
    if (!Number.isFinite(j.lat) || !Number.isFinite(j.lon)) continue;
    const [x, y] = vp.project([j.lon, j.lat, PILL_Z]);
    const wj = pillW(shortSalary(j.salary) || "");
    let hit = null;
    for (const c of out) if (Math.abs(c.x - x) < (wj + pillW(labelOf(c))) / 2 + PILL_GAP && Math.abs(c.y - y) < PILL_H) { hit = c; break; }
    if (!hit) { out.push({ x, y, lon: j.lon, lat: j.lat, count: 1, jobs: [j] }); continue; }
    hit.jobs.push(j); hit.count++;
    const k = 1 / hit.count;
    hit.x += (x - hit.x) * k; hit.y += (y - hit.y) * k; hit.lon += (j.lon - hit.lon) * k; hit.lat += (j.lat - hit.lat) * k;
  }
  return out.map((c) => ({ coordinates: [c.lon, c.lat], count: c.count, jobs: c.jobs, x: c.x, y: c.y }));
}
const landmarkFree = (lm, clusters, vp) => { const [x, y] = vp.project([lm.lon, lm.lat, LM_Z]); return !clusters.some((c) => Math.abs(c.x - x) < (pillW(labelOf(c)) / 2 + 40) && Math.abs(c.y - y) < 60); };
function colourStations(metro) {
  if (!metro || !metro.stations || !metro.lines) return [];
  const pts = [];
  for (const f of metro.lines.features || []) { const c = f.properties && f.properties.color; if (!c) continue; const g = f.geometry; const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates; for (const ln of lines) for (let i = 0; i < ln.length; i += 3) pts.push([ln[i][0], ln[i][1], c]); }
  return metro.stations.map((s) => { let best = null, bd = Infinity; for (const p of pts) { const d = (p[0] - s.coordinates[0]) ** 2 + (p[1] - s.coordinates[1]) ** 2; if (d < bd) { bd = d; best = p[2]; } } return { coordinates: s.coordinates, color: best || [150, 150, 150] }; });
}
function groundCSS(pal) {
  const c = pal.dark ? mix(pal.bg, pal.accent, 0.07) : mix(pal.bg, [255, 255, 255], 0.35);
  const e = pal.dark ? mix(pal.bg, [0, 0, 0], 0.55) : mix(pal.bg, pal.ink, 0.1);
  return `radial-gradient(120% 90% at 50% 38%, rgb(${c.join(",")}) 0%, rgb(${pal.bg.join(",")}) 55%, rgb(${e.join(",")}) 100%)`;
}

async function makeDeck(canvas, cityId) {
  if (isGate) return null;
  try { if (!canvas.getContext("webgl2")) return null; } catch { return null; }
  let D; try { D = await import(DECK_URL); } catch { return null; }
  if (!D || !D.Deck) return null;

  const VIEW = viewFor(cityId);
  const gbase = `${GEO}/${cityId}`;
  const geo = {};
  const grab = async (n) => { try { geo[n] = await (await fetch(`${gbase}/${n}.json`)).json(); } catch { geo[n] = null; } };
  const baseLayers = cityId === "kyiv" ? ["water", "roads", "districts", "metro"] : ["water", "roads"];
  await Promise.all(baseLayers.map(grab));
  const stations = colourStations(geo.metro);
  const districtLabels = (geo.districts && geo.districts.features || []).filter((f) => f.properties && f.properties.name && f.properties.center).map((f) => ({ name: f.properties.name, coordinates: f.properties.center }));

  let zoom = VIEW.zoom, cLng = VIEW.longitude, cLat = VIEW.latitude, cPitch = VIEW.pitch, cBearing = VIEW.bearing;
  let pal = palette(), jobs = [], onPick = () => {}, curClusters = [], camSig = "", loc = "uk", me = null, selected = null;
  let staticLayers = [], dead = false;
  const landmarks = LANDMARKS[cityId] || [];
  const viewportNow = () => new D.WebMercatorViewport({ width: canvas.clientWidth || 384, height: canvas.clientHeight || 832, longitude: cLng, latitude: cLat, zoom, pitch: cPitch, bearing: cBearing });
  const OVER = { depthTest: false };
  const hw = (f) => (f.properties && f.properties.hw) || "";
  const bldColor = (f) => { const h = (f.properties && f.properties.h) || 12; return mix(pal.building, pal.buildingHi, Math.max(0, Math.min(1, (h - 8) / 70))); };

  function layers() {
    const L = [], vp = viewportNow();
    if (geo.districts && zoom < 14) L.push(new D.GeoJsonLayer({ id: "districts", data: geo.districts, filled: false, stroked: true, getLineColor: pal.district, getLineWidth: 2, lineWidthMinPixels: 1, lineWidthMaxPixels: 2, pickable: false }));
    if (geo.water) L.push(new D.GeoJsonLayer({ id: "water", data: geo.water, filled: true, stroked: true, getFillColor: pal.water, getLineColor: pal.waterLine, lineWidthMinPixels: 1, pickable: false }));
    if (geo.roads) L.push(new D.GeoJsonLayer({
      id: "roads", data: geo.roads, filled: false, stroked: true, pickable: false,
      getLineColor: (f) => { const h = hw(f); return h === "motorway" || h === "trunk" || h === "primary" ? pal.roadMajor : h === "secondary" ? pal.roadMid : pal.road; },
      getLineWidth: (f) => { const h = hw(f); return h === "motorway" || h === "trunk" ? 16 : h === "primary" ? 11 : h === "secondary" ? 7 : 4; },
      lineWidthUnits: "meters", lineWidthMinPixels: 0.6, lineWidthMaxPixels: 6, capRounded: true, jointRounded: true,
      updateTriggers: { getLineColor: [pal.key] },
    }));
    if (zoom >= BLD_ZOOM) {
      L.push(new D.MVTLayer({
        id: "buildings", data: `${gbase}/tiles/{z}/{x}/{y}.pbf`, minZoom: 13, maxZoom: 16,
        extruded: true, opacity: 1, getElevation: (f) => (f.properties && f.properties.h) || 12,
        getFillColor: bldColor, material: { ambient: pal.dark ? 0.42 : 0.55, diffuse: 0.65, shininess: 1, specularColor: [0, 0, 0] },
        pickable: false, updateTriggers: { getFillColor: [pal.key] },
      }));
    }
    if (geo.metro && geo.metro.lines) {
      const lineCol = (a) => (f) => { const c = (f.properties && f.properties.color) || pal.accent; return [c[0], c[1], c[2], a]; };
      L.push(new D.GeoJsonLayer({ id: "metro-glow", data: geo.metro.lines, filled: false, stroked: true, getLineColor: lineCol(pal.dark ? 75 : 85), getLineWidth: 26, lineWidthUnits: "meters", lineWidthMinPixels: 5, lineWidthMaxPixels: 16, capRounded: true, jointRounded: true, pickable: false, parameters: OVER }));
      L.push(new D.GeoJsonLayer({ id: "metro", data: geo.metro.lines, filled: false, stroked: true, getLineColor: lineCol(240), getLineWidth: 6, lineWidthUnits: "meters", lineWidthMinPixels: 1.8, lineWidthMaxPixels: 5, capRounded: true, jointRounded: true, pickable: false, parameters: OVER }));
      if (zoom >= 12 && stations.length) L.push(new D.ScatterplotLayer({ id: "stations", data: stations, getPosition: (d) => d.coordinates, getFillColor: (d) => d.color, getLineColor: pal.stationRing, stroked: true, lineWidthMinPixels: 2, getRadius: 34, radiusUnits: "meters", radiusMinPixels: 4, radiusMaxPixels: 8, pickable: false, parameters: OVER }));
    }
    if (districtLabels.length && zoom < LABEL_ZOOM) {
      L.push(new D.TextLayer({
        id: "district-labels", data: districtLabels, pickable: false, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => d.coordinates, getText: (d) => d.name, getSize: 11, sizeMinPixels: 10, sizeMaxPixels: 13,
        getColor: pal.districtText, fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, characterSet: "auto",
        outlineWidth: 3, outlineColor: [...pal.bg, 220], fontSettings: { sdf: true, fontSize: 48 },
        parameters: OVER, updateTriggers: { getColor: [pal.key], outlineColor: [pal.key] },
      }));
    }
    const cl = clusterJobs(jobs, vp);
    curClusters = cl;
    if (zoom >= LM_ZOOM && landmarks.length) {
      const lms = landmarks.filter((lm) => landmarkFree(lm, cl, vp));
      L.push(new D.IconLayer({ id: "landmarks", data: lms, pickable: false, billboard: true, sizeUnits: "pixels", getSize: 46, sizeMinPixels: 30, sizeMaxPixels: 56, getPosition: (d) => [d.lon, d.lat, LM_Z], getIcon: (d) => ({ url: lmUrl(d.id), width: 256, height: 256, anchorY: 128, mask: false }), parameters: OVER }));
      L.push(new D.LineLayer({ id: "landmark-leaders", data: lms, getSourcePosition: (d) => [d.lon, d.lat, 0], getTargetPosition: (d) => [d.lon, d.lat, LM_Z - 20], getColor: pal.lmLeader, getWidth: 1, widthMinPixels: 1, widthMaxPixels: 1.5, pickable: false, parameters: OVER }));
      L.push(new D.TextLayer({
        id: "landmark-labels", data: lms, pickable: false, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => [d.lon, d.lat, LM_Z], getText: (d) => (/uk/i.test(loc) ? d.uk : d.en),
        getSize: 12, sizeMinPixels: 10, sizeMaxPixels: 15, getPixelOffset: [0, 33],
        background: true, backgroundBorderRadius: 8, backgroundPadding: [7, 3, 7, 3], getBackgroundColor: pal.lmBg, getColor: pal.lmText,
        fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 600, characterSet: "auto", parameters: OVER,
        updateTriggers: { getText: [loc], getBackgroundColor: [pal.key], getColor: [pal.key] },
      }));
    }
    if (cl.length) {
      const pilled = cl.filter((d) => labelOf(d));
      const isSel = (d) => selected && d.coordinates[0] === selected[0] && d.coordinates[1] === selected[1];
      L.push(new D.ColumnLayer({ id: "highlight", data: cl, diskResolution: 4, radius: 15, angle: 45, extruded: true, elevationScale: 1, getPosition: (d) => d.coordinates, getElevation: BLOCK_H, getFillColor: (d) => (isSel(d) ? pal.accentHi : pal.accent), opacity: 0.95, material: { ambient: 0.7, diffuse: 0.4, shininess: 1, specularColor: [0, 0, 0] }, pickable: true, autoHighlight: true, highlightColor: [...pal.accentHi, 255], parameters: OVER, updateTriggers: { getFillColor: [selected, pal.key] } }));
      L.push(new D.LineLayer({ id: "leaders", data: cl, getSourcePosition: (d) => [d.coordinates[0], d.coordinates[1], BLOCK_H], getTargetPosition: (d) => [d.coordinates[0], d.coordinates[1], PILL_Z - 14], getColor: pal.leader, getWidth: 1.5, widthUnits: "pixels", widthMinPixels: 1, widthMaxPixels: 2, pickable: false, parameters: OVER }));
      L.push(new D.TextLayer({
        id: "pills", data: pilled, pickable: true, billboard: true, sizeUnits: "pixels",
        getPosition: (d) => [d.coordinates[0], d.coordinates[1], PILL_Z],
        getText: labelOf, getSize: (d) => (d.count > 1 ? 16 : 14), sizeMinPixels: 12, sizeMaxPixels: 22,
        background: true, backgroundBorderRadius: 11, backgroundPadding: [10, 6, 10, 6],
        getBackgroundColor: (d) => (d.count > 1 ? pal.clusterBg : (isSel(d) ? pal.pillBgSel : pal.pillBg)),
        getBorderColor: pal.pillBorder, getBorderWidth: 1.2,
        getColor: (d) => (d.count > 1 ? pal.clusterText : pal.pillText),
        fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 700, characterSet: "auto", parameters: OVER,
        updateTriggers: { getBackgroundColor: [pal.key, selected], getColor: [pal.key], getBorderColor: [pal.key], getText: [jobs] },
      }));
    }
    if (me) L.push(new D.ScatterplotLayer({ id: "me", data: [me], getPosition: (d) => d, getFillColor: pal.me, getLineColor: [255, 255, 255, 230], stroked: true, lineWidthMinPixels: 2, getRadius: 12, radiusUnits: "pixels", pickable: false, parameters: OVER }));
    return L;
  }
  const pulseLayer = (t) => new D.ScatterplotLayer({
    id: "pulse", data: curClusters, getPosition: (d) => d.coordinates, stroked: true, filled: false,
    getLineColor: [...pal.accent, Math.round(120 * (1 - t))], getRadius: 14 + 26 * t, radiusUnits: "pixels", lineWidthMinPixels: 1.5, lineWidthMaxPixels: 2,
    pickable: false, parameters: OVER, updateTriggers: { getRadius: [t], getLineColor: [t] },
  });
  const commit = () => { staticLayers = layers(); deck.setProps({ layers: [...staticLayers, pulseLayer(pulseT)] }); };
  let pulseT = 0, pulseTimer = null, still = false;
  const pulse = () => { if (dead) return; if (!still && !document.hidden && curClusters.length && curClusters.length <= 80) { pulseT = (pulseT + 0.045) % 1; deck.setProps({ layers: [...staticLayers, pulseLayer(pulseT)] }); } pulseTimer = setTimeout(pulse, 80); };

  function pickCluster(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !curClusters.length) return null;
    const vp = viewportNow();
    let best = null, bd = Infinity;
    for (const c of curClusters) {
      const lab = labelOf(c);
      const [px, py] = vp.project([c.coordinates[0], c.coordinates[1], PILL_Z]);
      const [gx, gy] = vp.project([c.coordinates[0], c.coordinates[1], 0]);
      let dPill = Infinity;
      if (lab) { const hw2 = pillW(lab) / 2, hh = PILL_H / 2; dPill = Math.hypot(Math.max(Math.abs(x - px) - hw2, 0), Math.max(Math.abs(y - py) - hh, 0)); }
      const vx = px - gx, vy = py - gy, len2 = vx * vx + vy * vy || 1; const tt = Math.max(0, Math.min(1, ((x - gx) * vx + (y - gy) * vy) / len2));
      const dLead = Math.hypot(x - (gx + vx * tt), y - (gy + vy * tt));
      const d = Math.min(dPill, Math.hypot(x - gx, y - gy), dLead + 4);
      if (d < bd) { bd = d; best = c; }
    }
    return bd <= 18 ? best : null;
  }
  const flyTo = (lon, lat, z, ms = 900) => { deck.setProps({ initialViewState: { longitude: lon, latitude: lat, zoom: z, pitch: cPitch, bearing: cBearing, minZoom: VIEW.minZoom, maxZoom: VIEW.maxZoom, transitionDuration: ms, transitionInterpolator: new D.FlyToInterpolator({ speed: 1.4 }) } }); };
  const deck = new D.Deck({
    canvas, initialViewState: VIEW, controller: { dragRotate: true, touchRotate: true, inertia: 300 }, views: new D.MapView({ repeat: false }),
    useDevicePixels: Math.min(globalThis.devicePixelRatio || 1, 1.5),
    effects: [new D.LightingEffect({ ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: pal.dark ? 0.9 : 1.0 }), sun: new D.DirectionalLight({ color: [255, 250, 240], intensity: pal.dark ? 1.4 : 1.3, direction: [-0.6, -1, -2.2] }) })],
    getCursor: ({ isDragging, isHovering }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
    onClick: (info) => { const c = (info && info.object && info.object.jobs) ? info.object : pickCluster(info && info.x, info && info.y); if (c && c.jobs) onPick(c, { zoom, flyTo }); else onPick(null); },
    onViewStateChange: ({ viewState }) => {
      zoom = viewState.zoom; cLng = viewState.longitude; cLat = viewState.latitude; cPitch = viewState.pitch; cBearing = viewState.bearing;
      const sig = `${Math.round(zoom * 4)}|${Math.round(cPitch / 10)}|${Math.round(cBearing / 20)}|${Math.round(cLng * 40)}|${Math.round(cLat * 60)}`;
      if (sig !== camSig) { camSig = sig; commit(); }
    },
    layers: [],
  });
  pulse();
  const ctl = {
    rebuild(next) {
      if (next.pal) pal = next.pal; if (next.jobs) jobs = next.jobs; if ("onPick" in next) onPick = next.onPick; if ("loc" in next) loc = next.loc;
      if ("me" in next) me = next.me; if ("selected" in next) selected = next.selected;
      deck.setProps({ style: { background: groundCSS(pal) }, effects: [new D.LightingEffect({ ambient: new D.AmbientLight({ color: [255, 255, 255], intensity: pal.dark ? 0.9 : 1.0 }), sun: new D.DirectionalLight({ color: [255, 250, 240], intensity: pal.dark ? 1.4 : 1.3, direction: [-0.6, -1, -2.2] }) })] });
      commit();
    },
    flyTo,
    zoom: () => zoom,
    still(v) { still = !!v; },
    destroy() { dead = true; clearTimeout(pulseTimer); try { deck.finalize(); } catch { } },
  };
  if (DEV_HOST) globalThis.__jobx = ctl;
  return ctl;
}

export function MapStage({ isDark, city, jobs, onPick, loc, me, selected, ctlRef }) {
  const ref = useRef(null), ctl = useRef(null);
  useEffect(() => {
    let dead = false;
    (async () => { const c = await makeDeck(ref.current, city); if (dead) { c && c.destroy(); return; } ctl.current = c; if (ctlRef) ctlRef.current = c; if (c) { $glReady.set(true); c.rebuild({ pal: palette(), jobs, onPick, loc, me, selected }); } })();
    return () => { dead = true; $glReady.set(false); ctl.current && ctl.current.destroy(); ctl.current = null; if (ctlRef) ctlRef.current = null; };
  }, [city]);
  useEffect(() => { ctl.current && ctl.current.rebuild({ pal: palette(), jobs, onPick, loc, me, selected }); }, [isDark, jobs, loc, me, selected]);
  return html`<canvas ref=${ref} data-map class="absolute inset-0 w-full h-full block" aria-hidden="true"></canvas>`;
}
