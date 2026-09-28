import { html } from "htm/preact";
import { useStore } from "@nanostores/preact";
import { T } from "/_rt/i18n.js";
import { Island, Stage } from "/_rt/ui.js";
import { gate } from "/_rt/gate.js";
import { hexSpiral, hexToXY, combSize } from "/_rt/radar.js";
import { useField, $scanning, $target, Legend, Reason } from "./store.js";
import { ScanButton } from "./scan.js";

const HEX = 10;
const CORNERS = Array.from({ length: 6 }, (_, i) => ((60 * i + 30) * Math.PI) / 180);
const hexPath = (cx, cy, r) =>
  CORNERS.map((a, i) => `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`).join("") + "Z";
const CELL = hexPath(0, 0, HEX * 0.92);

const chain = (r, idx) =>
  idx.map((ci, j) => `${j ? "L" : "M"}${(Math.cos(CORNERS[ci]) * r).toFixed(2)} ${(Math.sin(CORNERS[ci]) * r).toFixed(2)}`).join("");
const CELL_UP = chain(HEX * 0.92, [2, 3, 4, 5]);
const CELL_DOWN = chain(HEX * 0.92, [5, 0, 1, 2]);
function Bevel({ raised }) {
  return html`
    <path d=${CELL_UP} style=${`stroke:var(${raised ? "--nm-light" : "--nm-dark"})`} fill="none"
      stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
    <path d=${CELL_DOWN} style=${`stroke:var(${raised ? "--nm-dark" : "--nm-light"})`} fill="none"
      stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />`;
}

export function hiveView({ S, t }) {
  const field = useField(S);
  const scanning = useStore($scanning);
  const target = useStore($target);

  const coords = hexSpiral(combSize(Math.max(1, field.length)));
  const pts = coords.map((c) => hexToXY(c, HEX));
  const pad = HEX * 1.3;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const s = 200 / Math.max(maxX - minX, maxY - minY);

  return html`<div class="h-full min-h-0 flex flex-col gap-[var(--ms-gap)] ms-side">
    <${Stage}>
      <div class="absolute inset-0 flex items-center justify-center p-1">
        ${""}
        ${""}
        <svg data-mark viewBox="0 0 200 200"
          class="w-full h-full max-h-full text-base-content" role="img"
          aria-label=${`${field.length} ${T(t, "cells")}`}>
          <defs>
            ${""}
            <pattern id="hvHatch" patternUnits="userSpaceOnUse" width="2.6" height="2.6" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="2.6" stroke="currentColor" stroke-width="0.9" />
            </pattern>
          </defs>
          <g class="hv-scale" style=${`transform:translate(100px,100px) scale(${s.toFixed(4)})`}>
            ${coords.map((c, i) => {
              const { x, y } = pts[i];
              const at = `transform:translate(${(x - cx).toFixed(2)}px,${(y - cy).toFixed(2)}px)`;
              const d = field[i];
              if (!d) {
                return html`<g key=${`e${i}`} class=${gate ? "hv-cell" : "hv-cell hv-e-in"} style=${at}>
                  <${Bevel} raised=${false} />
                </g>`;
              }
              const k = Math.sqrt(Math.max(0, Math.min(100, d.percent)) / 100);
              const tone = d.kind === "ble" ? "text-[var(--app-accent)]" : "text-base-content";
              const solid = d.kind === "lte" ? 0.5 : d.kind === "wifi" ? 0.45 : 0.55;
              return html`<g key=${d.addr} data-cell=${d.addr} data-kind=${d.kind} class=${`hv-cell ${tone}`} style=${at}>
                <g class=${gate ? "" : "hv-in"} style=${gate ? "" : `animation-delay:${Math.min(i, 20) * 24}ms`}>
                  <${Bevel} raised=${true} />
                  <g class="hv-fill" style=${`transform:scale(${k.toFixed(3)})`}>
                    <path d=${CELL} fill=${d.kind === "lte" ? "url(#hvHatch)" : "currentColor"} fill-opacity=${solid} />
                  </g>
                  ${d.addr === target ? html`<path d=${CELL} fill="none" stroke="currentColor" stroke-width="2"
                    vector-effect="non-scaling-stroke" class="text-[var(--app-accent)]" />` : null}
                  <text x="0" y=${(HEX * 0.34).toFixed(2)} text-anchor="middle"
                    class="font-mono text-base-content" font-size=${HEX * 0.72} fill="currentColor">${d.percent}</text>
                </g>
              </g>`;
            })}
          </g>
        </svg>
      </div>
      <div data-live class="absolute inset-x-0 top-0 flex justify-center pointer-events-none">
        <span class="flex items-center gap-1.5 font-mono uppercase tracking-wide text-[length:var(--ms-label)] text-base-content/70">
          ${""}
          ${scanning ? html`<span class=${`inline-block w-1.5 h-1.5 rounded-full bg-[var(--app-accent)] ${gate ? "" : "hv-dot-live"}`}></span>` : null}
          <span>${field.length} ${T(t, "cells")}${scanning ? "" : " · " + T(t, "idle")}</span>
        </span>
      </div>
    <//>

    <div class="ms-side-main flex flex-col justify-end items-center pb-[var(--ms-gap)]">
      <${Island} className="w-full max-w-md">
        ${""}
        <div class="flex flex-wrap items-center gap-[var(--ms-gap)] min-w-0">
          <${ScanButton} t=${t} />
          <${Legend} t=${t} field=${field} />
        </div>
        <${Reason} t=${t} />
      <//>
    </div>
  </div>`;
}
