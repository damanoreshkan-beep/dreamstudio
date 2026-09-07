// Eyedropper (Піпетка) — point the rear camera at anything and read the colour under the reticle live:
// HEX / RGB / HSL, plus the frame's dominant palette. The stream is the kit's ONE camera element
// (/_rt/camstage.js `CamStage`): it owns the priming screen, the lifecycle, the wake lock and the gestures,
// shows the picture itself (`show`) and hands the playing `<video>` out through `onVideo` — this app only
// samples it. The pixel maths (average, median-cut palette, HEX/HSL, readable ink) lives in /_rt/colour.js,
// unit-tested, so it runs in the headless gate on a seeded buffer: the gate has no camera and no canvas, so
// we never sample a live frame there — the stage stands aside, we seed the reading and draw the palette as a
// gradient. Freeze holds a reading; every swatch taps to copy its HEX.
import { html } from "htm/preact";
import { useState, useEffect, useRef, useMemo } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { avgColor, palette, rgbToHex, rgbToHsl } from "/_rt/colour.js";
import { CamStage } from "/_rt/camstage.js";
import { Panel } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";

const Icon = (icon, cls) => html`<iconify-icon icon=${icon} class=${cls || ""}></iconify-icon>`;

// A synthetic frame for the gate: five saturated bands. The real colour.js runs on it (deterministic
// palette + a picked colour), so the seeded shot exercises the maths, never a live capture.
function seedBuffer() {
  const bands = [[233, 90, 74], [228, 185, 60], [70, 196, 110], [63, 199, 192], [122, 90, 200]];
  const px = new Uint8ClampedArray(bands.length * 24 * 4);
  let o = 0;
  for (const c of bands) for (let i = 0; i < 24; i++) { px[o++] = c[0]; px[o++] = c[1]; px[o++] = c[2]; px[o++] = 255; }
  return px;
}

export function pipette({ S }) {
  const t = useStore(S.t), loc = useStore(S.locale);
  // gate seed: picked = the palette's middle swatch, which is exactly the 135° gradient's centre — so the
  // reticle dot matches what it sits on in the seeded shot (on a real device picked IS the centre pixel).
  const seed = useMemo(() => { if (!gate) return null; const pal = palette(seedBuffer(), 5); return { pal, picked: pal[2] || pal[0] }; }, []);
  const [picked, setPicked] = useState(seed ? seed.picked : null);
  const [pal, setPal] = useState(seed ? seed.pal : []);
  const [ready, setReady] = useState(false);
  const [vid, setVid] = useState(null);           // the stage's playing <video>, handed out by onVideo
  const [frozen, setFrozen] = useState(false);
  const canvasRef = useRef(), frozenRef = useRef(false);
  frozenRef.current = frozen;

  // sampling only — the stream is the stage's. In the gate the stage stands aside, `vid` stays null and the
  // seeded reading above is what the shot shows.
  useEffect(() => {
    if (!vid) return;
    const sample = () => {
      const cv = canvasRef.current;
      if (!cv || vid.readyState < 2 || frozenRef.current) return;
      try {
        const W = 48, H = Math.max(24, Math.round(48 * ((vid.videoHeight || 4) / (vid.videoWidth || 3))));
        cv.width = W; cv.height = H;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(vid, 0, 0, W, H);
        const cx = (W >> 1) - 3, cy = (H >> 1) - 3;
        setPicked(avgColor(ctx.getImageData(cx, cy, 6, 6).data));
        setPal(palette(ctx.getImageData(0, 0, W, H).data, 5));
      } catch { /* transient decode / read */ }
    };
    const timer = setInterval(sample, 150);
    return () => clearInterval(timer);
  }, [vid]);

  const copy = async (rgb) => {
    const hex = rgbToHex(rgb);
    try { await navigator.clipboard.writeText(hex); S.toast?.(T(t, "copied", { v: hex })); } catch { /* clipboard blocked */ }
  };

  const hex = picked ? rgbToHex(picked) : "—";
  const rgbStr = picked ? `rgb(${picked.join(" ")})` : "";
  const hslStr = picked ? (([h, s, l]) => `hsl(${h} ${s}% ${l}%)`)(rgbToHsl(picked)) : "";
  const grad = pal.length ? `linear-gradient(135deg, ${pal.map(rgbToHex).join(", ")})` : "#18181b";

  return html`<div class="ms-stage z-20 bg-base-200 flex flex-col">
    <!-- preview -->
    <div class="relative flex-1 min-h-0 overflow-hidden bg-black">
      ${/* `show` — this app READS the picture, it never draws it, so the stage displays the feed itself and
           the app's own <video> is gone. No fullscreen: a tap that hides the readout would hide the whole
           point of the app. Gestures stay: the pinch zooms onto a distant surface and the tap focuses what
           is being sampled. The stage's own layers sit under z-[1], so everything below declares z-[2].
           `primeFull` — the stage here is only the preview box, but the ask for the camera is about the whole
           app, so the priming screen is pinned to .ms-stage and covers the readout too, as it did before. */""}
      <${CamStage} loc=${loc} reason=${T(t, "primeReason")} onSettings=${() => S.screen.set("perms")}
          still=${null} show=${true} fullscreen=${false} gestures=${true} primeFull=${true}
          onVideo=${(el) => setVid(el)} onState=${(s) => setReady(!!s.ready)}>
        ${gate ? html`<div class="absolute inset-0 z-[2]" style=${`background:${grad}`}></div>` : null}
        ${/* The reticle KEEPS its rings. They are not a surface hairline on one of our panels — they sit on a
             live camera frame (foreign content), where a white/dark ring pair is the only thing that stays
             legible over an arbitrary image. The extrusion cannot do that job: it reads against OUR page tone,
             and there is no page here. Same reason the theme bans glass on base-* but allows it over video. */""}
        ${ready ? html`<div class="absolute inset-0 z-[2] flex items-center justify-center pointer-events-none">
          <div class="w-16 h-16 rounded-full border-2 border-white/90" style="box-shadow:0 0 0 2px rgba(0,0,0,.45),inset 0 0 0 1px rgba(0,0,0,.35)">
            <div class="w-full h-full rounded-full flex items-center justify-center">
              <div class="w-5 h-5 rounded-full border border-white/80" style=${picked ? `background:${hex}` : ""}></div>
            </div>
          </div>
        </div>` : null}
      <//>
      <canvas ref=${canvasRef} class="hidden"></canvas>
    </div>

    ${/* readout — the kit's Panel: a solid surface in flow (it is a sibling of the preview and shortens it,
         it does not float over it, so this is a Panel and not an Island). The material carries the edge now:
         the deck is the page EXTRUDED, so the old border-t hairline and the two chip outlines are gone. */""}
    <div class="shrink-0 p-3">
      <${Panel} className="max-w-md w-full mx-auto">
        <div class="flex items-center gap-3">
          ${/* The chip's face is an arbitrary sampled colour, so it declares only the extrusion — the inline
               background wins over sf-raised's base-100 face, and the shadow pair still reads in both themes
               (a hairline could not: on a light chip in the light theme it vanished). */""}
          <button aria-label=${hex} onClick=${() => picked && copy(picked)} class="w-14 h-14 rounded-2xl shrink-0 sf-raised active:scale-95 transition" style=${picked ? `background:${hex}` : ""}></button>
          <div class="flex-1 min-w-0">
            ${/* `data-readout`, not `data-live`: the stage stamps `data-live` on itself, and the e2e asserts
                 there is exactly ONE of each mark. */""}
            <div data-readout class="text-2xl font-bold font-mono tabular-nums leading-tight">${hex}</div>
            <div class="text-[0.7rem] text-muted font-mono leading-snug truncate">${rgbStr}</div>
            ${hslStr ? html`<div class="text-[0.7rem] text-muted font-mono leading-snug truncate">${hslStr}</div>` : null}
          </div>
          <button data-freeze aria-label=${T(t, frozen ? "live" : "freeze")} aria-pressed=${frozen} onClick=${() => setFrozen((f) => !f)} class=${`btn btn-circle btn-sm ${frozen ? "btn-primary" : "btn-ghost"}`}>${Icon(frozen ? "lucide:play" : "lucide:snowflake", "text-lg")}</button>
        </div>
        <div class="flex gap-2">
          ${/* A filled swatch is a raised tile (sf-e2 — the smaller rung, proportionate to a 36px object);
               an empty slot is the WELL it will land in, which is what sf-inset means. */""}
          ${(pal.length ? pal : Array(5).fill(null)).map((c, i) => c
            ? html`<button data-swatch aria-label=${rgbToHex(c)} onClick=${() => copy(c)} class="flex-1 h-9 rounded-lg sf-e2 active:scale-95 transition" style=${`background:${rgbToHex(c)}`} key=${i}></button>`
            : html`<div class="flex-1 h-9 rounded-lg sf-inset" key=${i}></div>`)}
        </div>
      <//>
    </div>
  </div>`;
}
