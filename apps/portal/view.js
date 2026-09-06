// portal — the camera as art at 60 fps on a READY system. ONE fit screen with TWO stages, chosen by where the
// page runs (docs/research/portal-godot.md):
//   · inside the shell's `godot` flavour (the APK) the stage is the kit's GodotStage — the Godot project in
//     godot/portal/ renders the camera and the materials under the page, the page is the UI (owner, 2026-09-05:
//     "тачдизайнер хочу … не окремий застосунок, у нас вже є механізм збірки apk");
//   · in a browser the stage is the kit's CamStage + the pixi graph (graph.js — the TD-style TOP network on
//     pixi's machinery: trace, hatch, feedback, the camera as is).
// Either way: the strip picks the material, the theme picks light or dark, the knobs behind one icon are the
// material's own set (presets.js KNOBS, remembered per material), SAVE writes the frame. State map: RESEARCH.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Island, Stage, Sheet } from "/_rt/ui.js";
import { CamStage } from "/_rt/camstage.js";
import { GodotStage, godotAvailable, godotSave } from "/_rt/godotstage.js";
import { downloadUrl } from "/_rt/apk.js";
import { report } from "/_rt/telemetry.js";
import { PRESETS, IDS, KNOBS, ENGINE_KNOBS, tuned, knobValue, buildChain } from "./presets.js";
import { createGraph } from "./graph.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
const thumb = (id) => new URL(`assets/style-${id}.webp`, import.meta.url).href;
const texUrl = (id) => new URL(`assets/tex-${id}.webp`, import.meta.url).href;
const mockURL = new URL("assets/mock.webp", import.meta.url).href;
const packURL = new URL("assets/portal.pck", import.meta.url).href;   // the Godot project, exported by CI
const KEY = "portal:preset";
const TUNE = (id) => `portal:tune:${id}`;
const docMaterial = () => document.documentElement.getAttribute("data-material") || "lum";
const docLight = () => (document.documentElement.getAttribute("data-theme") || "").includes("light");
// probe-guarded like GlStage: preflight's canvas stub answers null and the system is never loaded there
const hasGL = () => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };
// the wordmark sits on foreign content whose ground the theme cannot know — a theme-aware gradient keeps it
// legible; in the stage's fullscreen there is no wordmark and the scrim goes with it
const CSS = `.pt-scrim{height:calc(var(--hdr-h,3.5rem) * 1.9);background:linear-gradient(to bottom,light-dark(rgba(246,244,238,.72),rgba(0,0,0,.62)) 0%,light-dark(rgba(246,244,238,.36),rgba(0,0,0,.32)) 35%,light-dark(rgba(246,244,238,.08),rgba(0,0,0,.07)) 75%,transparent 100%)}
[data-fullscreen] .pt-scrim{display:none}
.pt-swatch{background:radial-gradient(circle at 35% 35%,color-mix(in oklch,var(--app-accent) 55%,white) 0%,var(--app-accent) 45%,color-mix(in oklch,var(--app-accent) 40%,black) 100%)}`;

const firstPreset = () => { try { const v = localStorage.getItem(KEY); if (v && PRESETS[v]) return v; } catch { /* */ } return PRESETS[docMaterial()] ? docMaterial() : "lum"; };
const loadTune = (id) => { try { const v = JSON.parse(localStorage.getItem(TUNE(id)) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const saveTune = (id, over) => { try { if (Object.keys(over).length) localStorage.setItem(TUNE(id), JSON.stringify(over)); else localStorage.removeItem(TUNE(id)); } catch { /* */ } };
const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.01 ? 2 : 3).replace(/\.?0+$/, ""));

export function portal({ S, toast, screen, closeScreen }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const engine = godotAvailable();                // the APK with the engine, or a browser
  const [ready, setReady] = useState(false);      // a picture is on the stage
  const [caps, setCaps] = useState(null);         // what the track declares: torch · zoom · focus (web stage)
  const [torch, setTorch] = useState(false);
  const [preset, setPreset] = useState(firstPreset);
  const [light, setLight] = useState(docLight);
  const [facing, setFacing] = useState("environment");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(() => loadTune(firstPreset()));   // the knobs of the current material
  const [fps, setFps] = useState(0);              // what the engine reports
  const canvasRef = useRef();
  const px = useRef({ P: null, F: null, app: null, graph: null, filters: [], source: null, pending: null }).current;

  // the document's theme, observed — the view does not re-render on a toggle
  useEffect(() => {
    const mo = new MutationObserver(() => setLight(docLight()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // ---- the web stage: the pixi graph on the element CamStage hands over ------------------------------
  const presetRef = useRef(preset); presetRef.current = preset;
  const lightRef = useRef(light); lightRef.current = light;
  const overRef = useRef(over); overRef.current = over;
  const apply = async () => {
    const { graph, F } = px; if (!graph || !F) return;
    const id = presetRef.current, lite = lightRef.current, o = overRef.current;
    await graph.setPreset(tuned(id, lite, o), texUrl);
    if (presetRef.current !== id || lightRef.current !== lite || overRef.current !== o) return;
    px.filters = buildChain(F, id, lite, o);
    graph.out.filters = px.filters.length ? px.filters : null;
  };
  useEffect(() => { if (!engine) apply(); }, [preset, light, ready, over]);
  const onVideo = (el, { mirror }) => {
    px.pending = el ? { el, mirror } : null;
    const { graph, P } = px; if (!graph || !P) return;
    if (el) { px.source = P.Texture.from(el); graph.setSource(px.source, mirror); setReady(true); }
    else setReady(false);
  };
  useEffect(() => {
    if (engine || !hasGL() || !canvasRef.current) return;
    let alive = true;
    (async () => {
      let P, F;
      // the preflight (linkedom) answers a stub context to the probe and has no import map for the system: the
      // import throws there, and a portal without its system simply never lifts a picture — nothing else breaks
      try { [P, F] = await Promise.all([import("pixi.js"), import("pixi-filters")]); }
      catch (e) { if (canvasRef.current) canvasRef.current.dataset.err = String(e?.message || e).slice(0, 120); return; }
      if (!alive) return;
      const app = new P.Application();
      await app.init({ canvas: canvasRef.current, resizeTo: globalThis, resolution: Math.min(2, globalThis.devicePixelRatio || 1), autoDensity: true, preference: "webgl", antialias: false, backgroundAlpha: 1, background: 0x000000 });
      if (!alive) { app.destroy(); return; }
      const graph = await createGraph(P, app);
      if (!alive) { graph.destroy(); app.destroy(); return; }
      app.stage.addChild(graph.out);
      px.P = P; px.F = F; px.app = app; px.graph = graph;
      canvasRef.current.dataset.render = "pixi";
      app.ticker.add((tk) => { const dt = tk.deltaMS / 1000; for (const f of px.filters) if (typeof f.time === "number") f.time += dt; graph.tick(dt); });
      if (px.pending) onVideo(px.pending.el, px.pending);   // the stage was faster than the system
    })();
    return () => { alive = false; try { px.graph?.destroy(); px.app?.destroy(); } catch { /* gone */ } px.app = null; px.graph = null; };
  }, [engine]);

  // ---- the engine stage: what the project is told, and what it says back ------------------------------
  // one object per change: GodotStage diffs it by key and sends only what moved
  const params = { facing, preset, light, knobs: over, mark: gate };
  const onEngineState = (f) => {
    if (f.state === "running") {
      setReady(true);
      if (typeof f.fps === "number") setFps(Math.round(f.fps));
      // the engine's own notes (camera bound / saved / a switch that failed) reach the client log, where a
      // phone's picture can be read from the VPS — a green, frozen frame has a reason there
      if (typeof f.detail === "string" && /^(camera|saved|save:)/.test(f.detail)) report("engine.note", { detail: f.detail });
    } else if (f.state === "stopped" || f.state === "failed") {
      setReady(false);
      // the reason goes to our client log — a phone's toast says nothing to the log reader (vps/logs.sh portal)
      if (f.state === "failed") { report("engine.fail", { detail: f.detail || "" }); toast?.(T(t, "eEngine")); }
    }
  };

  const pick = (id) => { setPreset(id); setOver(loadTune(id)); try { localStorage.setItem(KEY, id); } catch { /* */ } };
  const turn = (path, v) => { const o = { ...overRef.current, [path]: v }; setOver(o); saveTune(preset, o); };
  const resetTune = () => { setOver({}); saveTune(preset, {}); };
  const flip = () => { setTorch(false); setFacing((f) => f === "user" ? "environment" : "user"); };
  const save = async () => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      if (engine) { await godotSave(`portal-${preset}-${Date.now()}.png`); }
      else {
        const { app } = px; if (!app) throw new Error("no stage");
        const c = app.renderer.extract.canvas(app.stage);
        const blob = await new Promise((r) => c.toBlob(r, "image/png"));
        if (!blob) throw new Error("no frame");
        const url = URL.createObjectURL(blob);
        try { await downloadUrl(url, `portal-${preset}-${Date.now()}.png`); toast?.(T(t, "saved")); } finally { URL.revokeObjectURL(url); }
      }
    } catch { toast?.(T(t, "eSave")); }
    finally { setBusy(false); }
  };

  const knobs = [...(KNOBS[preset] || KNOBS.plain), ...(engine ? ENGINE_KNOBS : [])];   // the engine's own knobs only where the engine is
  return html`<${Fragment}>
    <style>${CSS}</style>
    <div data-live="1" data-preset=${preset} data-mode=${light ? "light" : "dark"} data-facing=${facing} data-stage=${engine ? "godot" : "web"} data-tuned=${Object.keys(over).length ? "1" : null} class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <${Stage}>
        ${engine
          ? html`<${GodotStage} pack=${packURL} params=${params} onState=${onEngineState}>
              <div aria-hidden="true" class="pt-scrim fixed inset-x-0 top-0 z-[1] pointer-events-none"></div>
              ${fps ? html`<span data-fps class="absolute left-3 top-[calc(var(--hdr-h,3.5rem)+0.25rem)] z-[2] font-mono text-[length:var(--ms-label)] text-muted tabular-nums pointer-events-none">${fps} fps</span>` : null}
            <//>`
          : html`<${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")} facing=${facing} torch=${torch} still=${gate ? mockURL : null}
              onVideo=${onVideo} onState=${(s) => setCaps(s.caps)}>
              <canvas ref=${canvasRef} data-portal aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>
              <div aria-hidden="true" class="pt-scrim fixed inset-x-0 top-0 z-[1] pointer-events-none"></div>
            <//>`}
      <//>
      <div class="shrink-0 relative z-[2]">
      <${Island} className="w-full max-w-xl mx-auto flex flex-col gap-[var(--ms-gap)]">
        ${/* THE STRIP — the twelve themes as material cards, on the screen; a tap re-builds the graph in one frame */""}
        <div data-strip role="group" aria-label=${T(t, "material")} class="overflow-x-auto flex items-start gap-1 -mx-1 px-1">
          ${IDS.map((id) => { const p = PRESETS[id], active = preset === id; return html`<button key=${id} data-mat=${id} aria-pressed=${active} aria-label=${T(t, p.key)}
              class="shrink-0 w-[3.7rem] h-[4.2rem] flex flex-col items-center justify-start gap-1 rounded-[var(--ms-r-in)] pt-1" onClick=${() => pick(id)}>
            ${p.thumb ? html`<img src=${thumb(p.thumb)} alt="" loading="lazy" decoding="async" class=${`w-11 h-11 rounded-full object-cover bg-black ring-2 ${active ? "ring-[var(--app-accent)]" : "ring-transparent"}`} />`
              : html`<span aria-hidden="true" class=${`pt-swatch w-11 h-11 rounded-full ring-2 ${active ? "ring-[var(--app-accent)]" : "ring-transparent"}`}></span>`}
            <span class=${`font-mono uppercase tracking-wide text-[0.58rem] leading-none truncate max-w-full ${active ? "text-base-content" : "text-base-content/70"}`}>${T(t, p.key)}</span>
          </button>`; })}
        </div>
        ${/* THE ROW — one verb: SAVE, big, centred; the knobs icon (and the torch, when the track has one) at the
             left, the flip at the right. Nothing else. */""}
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-[3.9rem]">
          <div class="flex items-center justify-start gap-1">
            <button data-tune class=${`${tool} ${Object.keys(over).length ? "text-[var(--app-accent)]" : ""}`} aria-label=${T(t, "tune")} title=${T(t, "tune")} onClick=${() => S.screen.set("tune")}>${Icon("lucide:sliders-horizontal", "text-lg")}</button>
            ${caps?.torch ? html`<button data-torch aria-pressed=${torch} class=${`${tool} ${torch ? "text-[var(--app-accent)]" : ""}`} aria-label=${T(t, "torch")} title=${T(t, "torch")} onClick=${() => setTorch((v) => !v)}>${Icon(torch ? "lucide:zap" : "lucide:zap-off", "text-lg")}</button>` : null}
          </div>
          <button data-save aria-busy=${busy ? "true" : null} disabled=${!ready || busy} class="btn btn-primary rounded-full h-[3.25rem] min-h-0 px-7 gap-2 text-base shrink-0" onClick=${save}>${Icon("lucide:download", "text-xl")}<span>${T(t, "save")}</span></button>
          <div class="flex items-center justify-end">
            <button data-flip class=${tool} aria-label=${T(t, "flip")} title=${T(t, "flip")} disabled=${!ready} onClick=${flip}>${Icon("lucide:switch-camera", "text-lg")}</button>
          </div>
        </div>
      <//>
      </div>
    </div>

    ${/* THE KNOBS — the material's own set of fine settings, live on the picture behind the frost, remembered per material */""}
    <${Sheet} id="tune" open=${screen === "tune"} onClose=${closeScreen} title=${T(t, "tune")} subtitle=${T(t, PRESETS[preset].key)} icon="lucide:sliders-horizontal" tone="frost" locale=${loc}>
      <div data-knobs class="flex flex-col gap-3">
        ${knobs.map((k) => { const v = knobValue(preset, light, over, k); return html`<label key=${k.path} class="flex flex-col gap-1">
          <span class="flex items-baseline justify-between gap-2">
            <span class="text-sm">${T(t, k.id)}</span>
            <span class="font-mono text-[length:var(--ms-label)] text-base-content/70 tabular-nums">${fmt(v, k.step)}</span>
          </span>
          <input type="range" data-knob=${k.path} class="range range-xs range-primary" min=${k.min} max=${k.max} step=${k.step} value=${v} onInput=${(e) => turn(k.path, Number(e.currentTarget.value))} />
        </label>`; })}
      </div>
      <button data-reset class="btn btn-ghost btn-sm self-end gap-2" disabled=${!Object.keys(over).length} onClick=${resetTune}>${Icon("lucide:rotate-ccw", "text-base")}<span>${T(t, "reset")}</span></button>
    </${Sheet}>
  </${Fragment}>`;
}
