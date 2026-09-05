// portal — the camera as art at 60 fps on a READY system: PixiJS 8 + pixi-filters (MIT), chosen by
// docs/research/portal.md. ONE fit screen: the camera goes through a PRESET GRAPH (graph.js — TouchDesigner's
// TOPs on pixi's own machinery: feedback, displacement by the material's texture, the material as a composite
// layer, a mirror, LFOs, then the post chain), the strip picks the material, the theme picks light or dark,
// SAVE writes the frame from the canvas. Nothing else exists (owner, 2026-09-05: "готові пресети під наші теми …
// канвас з камерою в 60фпс і все. і кнопка зберегти. всьо"). State map: RESEARCH.md.
import { html } from "htm/preact";
import { Fragment } from "preact";
import { useRef, useEffect, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { gate } from "/_rt/gate.js";
import { Island, Stage } from "/_rt/ui.js";
import { camera, wakeLock } from "/_rt/sensors.js";
import { CameraPrime } from "/_rt/camprime.js";
import { downloadUrl } from "/_rt/apk.js";
import { PRESETS, IDS, graphOf, buildChain } from "./presets.js";
import { createGraph } from "./graph.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;
const tool = "btn btn-ghost btn-sm btn-circle text-base-content/70";
const thumb = (id) => new URL(`assets/style-${id}.webp`, import.meta.url).href;
const texUrl = (id) => new URL(`assets/tex-${id}.webp`, import.meta.url).href;
const mockURL = new URL("assets/mock.webp", import.meta.url).href;
const KEY = "portal:preset";
const docMaterial = () => document.documentElement.getAttribute("data-material") || "lum";
const docLight = () => (document.documentElement.getAttribute("data-theme") || "").includes("light");
// probe-guarded like GlStage: preflight's canvas stub answers null and the system is never loaded there
const hasGL = () => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };
// the wordmark sits on foreign content whose ground the theme cannot know — a theme-aware gradient keeps it legible
const CSS = `.pt-scrim{height:calc(var(--hdr-h,3.5rem) * 1.9);background:linear-gradient(to bottom,light-dark(rgba(246,244,238,.72),rgba(0,0,0,.62)) 0%,light-dark(rgba(246,244,238,.36),rgba(0,0,0,.32)) 35%,light-dark(rgba(246,244,238,.08),rgba(0,0,0,.07)) 75%,transparent 100%)}
.pt-swatch{background:radial-gradient(circle at 35% 35%,color-mix(in oklch,var(--app-accent) 55%,white) 0%,var(--app-accent) 45%,color-mix(in oklch,var(--app-accent) 40%,black) 100%)}`;

const firstPreset = () => { try { const v = localStorage.getItem(KEY); if (v && PRESETS[v]) return v; } catch { /* */ } return PRESETS[docMaterial()] ? docMaterial() : "lum"; };

export function portal({ S, toast }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  const [enabled, setEnabled] = useState(gate);   // the camera opens only after the tap on Enable (gate: at once)
  const [err, setErr] = useState(null);
  const [ready, setReady] = useState(false);      // a picture is on the stage
  const [preset, setPreset] = useState(firstPreset);
  const [light, setLight] = useState(docLight);
  const [facing, setFacing] = useState("environment");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(), videoRef = useRef();
  const px = useRef({ P: null, F: null, app: null, graph: null, filters: [], source: null }).current;
  const on = enabled && !err;

  // the document's theme, observed — the view does not re-render on a toggle
  useEffect(() => {
    const mo = new MutationObserver(() => setLight(docLight()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  const presetRef = useRef(preset); presetRef.current = preset;
  const lightRef = useRef(light); lightRef.current = light;
  // the graph + the post chain for the current preset and mode — built once per change, never per frame
  const apply = async () => {
    const { graph, F } = px; if (!graph || !F) return;
    const id = presetRef.current, lite = lightRef.current;
    await graph.setPreset(graphOf(id, lite), texUrl);
    if (presetRef.current !== id || lightRef.current !== lite) return;
    px.filters = buildChain(F, id, lite);
    graph.out.filters = px.filters.length ? px.filters : null;
  };
  useEffect(() => { apply(); }, [preset, light, ready]);
  const mount = (texture, mirror) => { const { graph } = px; if (!graph) return; px.source = texture; graph.setSource(texture, mirror); setReady(true); };

  // THE SYSTEM, loaded lazily (the heavy-dep pattern of the farm's three apps): pixi owns the canvas; the ticker
  // runs the graph and advances the time-driven filters; the gate mounts the farm's own still
  useEffect(() => {
    if (!hasGL() || !canvasRef.current) return;
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
      if (gate) { const tex = await P.Assets.load(mockURL); if (alive) mount(tex, false); }
      else if (videoRef.current && videoRef.current.readyState >= 2) mount(P.Texture.from(videoRef.current), facing === "user");
    })();
    return () => { alive = false; try { px.graph?.destroy(); px.app?.destroy(); } catch { /* gone */ } px.app = null; px.graph = null; };
  }, []);

  // the camera: the kit's lifecycle (the retry after a flip is the kit's, core ≥ 1.2.32), never cold; the
  // picture mounts when the track PLAYS; the screen stays awake while the portal runs
  useEffect(() => {
    if (gate || !enabled) return;
    if (!camera.supported) { setErr("unsupported"); return; }
    let alive = true, stop = () => {};
    setReady(false);
    const wl = wakeLock.acquire();
    const v = videoRef.current;
    const onPlaying = () => { if (!alive || !px.P) return; mount(px.P.Texture.from(v), facing === "user"); };
    v?.addEventListener("playing", onPlaying);
    camera.start(v, (e) => { if (alive) setErr(e); }, { facingMode: facing }).then((s) => { if (alive) stop = s; else s(); });
    return () => { alive = false; v?.removeEventListener("playing", onPlaying); stop(); wl?.release?.(); };
  }, [enabled, facing]);

  const pick = (id) => { setPreset(id); try { localStorage.setItem(KEY, id); } catch { /* */ } };
  const save = async () => {
    const { app, graph } = px; if (!app || !graph || busy) return;
    setBusy(true);
    try {
      const c = app.renderer.extract.canvas(app.stage);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      if (!blob) throw new Error("no frame");
      const url = URL.createObjectURL(blob);
      try { await downloadUrl(url, `portal-${preset}-${Date.now()}.png`); toast?.(T(t, "saved")); } finally { URL.revokeObjectURL(url); }
    } catch { toast?.(T(t, "eSave")); }
    finally { setBusy(false); }
  };

  return html`<${Fragment}>
    <style>${CSS}</style>
    <canvas ref=${canvasRef} data-portal aria-hidden="true" class="fixed inset-0 z-0 w-full h-full pointer-events-none"></canvas>
    <div aria-hidden="true" class="pt-scrim fixed inset-x-0 top-0 z-[2] pointer-events-none"></div>

    <div data-live=${on || gate ? "1" : null} data-ready=${ready ? "1" : null} data-preset=${preset} data-mode=${light ? "light" : "dark"} data-facing=${facing} class="relative z-10 h-full min-h-0 flex flex-col gap-[var(--ms-gap)]">
      <${Stage}>
        <video ref=${videoRef} autoplay muted playsinline aria-hidden="true" class="absolute w-px h-px opacity-0 pointer-events-none"></video>
        ${on || gate ? null : html`<${CameraPrime} loc=${loc} reason=${T(t, "primeReason")} onEnable=${() => { setErr(null); setEnabled(true); }} onSettings=${() => S.screen.set("perms")} denied=${err === "denied"} unavailable=${err === "unavailable" || err === "unsupported"} />`}
      <//>
      <div class="shrink-0">
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
        ${/* THE ROW — one verb: SAVE, big, centred; the flip small at the right. Nothing else. */""}
        <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-h-[3.9rem]">
          <div></div>
          <button data-save aria-busy=${busy ? "true" : null} disabled=${!ready || busy} class="btn btn-primary rounded-full h-[3.25rem] min-h-0 px-7 gap-2 text-base shrink-0" onClick=${save}>${Icon("lucide:download", "text-xl")}<span>${T(t, "save")}</span></button>
          <div class="flex items-center justify-end">
            <button data-flip class=${tool} aria-label=${T(t, "flip")} title=${T(t, "flip")} disabled=${!(gate || (on && ready))} onClick=${() => setFacing((f) => f === "user" ? "environment" : "user")}>${Icon("lucide:switch-camera", "text-lg")}</button>
          </div>
        </div>
      <//>
      </div>
    </div>
  </${Fragment}>`;
}
