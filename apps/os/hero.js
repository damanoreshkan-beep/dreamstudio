import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";
import { GlStage } from "/_rt/glstage.js";
import { T } from "/_rt/i18n.js";
import { ROSTER, STATE } from "./devices.js";

const _probe = (() => { try { return document.createElement("canvas").getContext("2d"); } catch { return null; } })();
function toRgb(raw, fallback) {
  const v = (raw || "").trim();
  if (!v) return fallback;
  try { _probe.fillStyle = "#000"; _probe.fillStyle = v; const n = _probe.fillStyle;
    if (n[0] === "#") { const h = n.length === 4 ? n.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : n;
      return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    const m = n.match(/(\d+(?:\.\d+)?)/g); if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  } catch { }
  return fallback;
}
const FALLBACK = { accent: [216, 180, 74], accent2: [98, 201, 126], ink: [235, 236, 240], bad: [240, 115, 111] };
function readTokens() {
  if (typeof getComputedStyle !== "function") return FALLBACK;
  try {
    const cs = getComputedStyle(document.documentElement);
    return {
      accent: toRgb(cs.getPropertyValue("--app-accent"), FALLBACK.accent),
      accent2: toRgb(cs.getPropertyValue("--app-accent-2"), FALLBACK.accent2),
      ink: toRgb(cs.getPropertyValue("--color-base-content"), FALLBACK.ink),
      bad: toRgb(cs.getPropertyValue("--color-error"), FALLBACK.bad),
    };
  } catch { return FALLBACK; }
}
const reduceMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export function HeroAura({ alive = 0.6 } = {}) {
  const acc = useRef([0.85, 0.71, 0.29]);
  useEffect(() => {
    const read = () => { acc.current = readTokens().accent.map((c) => c / 255); };
    read();
    if (typeof MutationObserver !== "function") return;
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const id = setInterval(read, 1000);
    return () => { mo.disconnect(); clearInterval(id); };
  }, []);
  const ink = () => [acc.current[0], acc.current[1], acc.current[2], 1];
  const vary = () => [alive, 0, 0, 0];
  return html`<${GlStage} shader=${new URL("hero-aura.frag", import.meta.url)} seed=${0.42}
    zClass="z-0" ink=${ink} vary=${vary} />`;
}

const rgba = (c, a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

export function DeviceConstellation({ devices, t }) {
  const wrap = useRef();
  const cv = useRef();
  const st = useRef({ raf: 0, dead: false, tok: null, dpr: 1, w: 0, h: 0 }).current;

  useEffect(() => {
    const canvas = cv.current, box = wrap.current;
    if (!canvas || !box) return;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    let g0; try { g0 = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 1, 1) : null; } catch { g0 = null; }
    if (!g0 || typeof g0.addColorStop !== "function") return;
    st.dead = false; st.tok = readTokens();
    const still = reduceMotion();

    const measure = () => {
      const r = box.getBoundingClientRect();
      st.dpr = Math.min(2, window.devicePixelRatio || 1);
      st.w = Math.max(1, r.width); st.h = Math.max(1, r.height);
      canvas.width = Math.round(st.w * st.dpr); canvas.height = Math.round(st.h * st.dpr);
    };
    measure();

    const list = () => (devices && devices.length ? devices : ROSTER.map((d) => ({ ...d, state: STATE.ABSENT })));

    const draw = (ts) => {
      if (st.dead) return;
      const T0 = still ? 0 : ts / 1000;
      const { accent, accent2, ink, bad } = st.tok;
      const w = st.w, h = st.h, dpr = st.dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h * 0.52;
      const R = Math.min(w, h) * 0.34;
      const items = list();
      const n = items.length;
      const spin = still ? -Math.PI / 2 : -Math.PI / 2 + T0 * 0.12;
      const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(T0 * (2 * Math.PI) / 5);

      items.forEach((d, i) => {
        const a = spin + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        const on = d.state === STATE.CONNECTED || d.state === STATE.ACTIVE;
        const pres = d.state === STATE.PRESENT;
        if (!on && !pres) return;
        const g = ctx.createLinearGradient(cx, cy, x, y);
        g.addColorStop(0, rgba(on ? accent2 : accent, on ? 0.55 : 0.18));
        g.addColorStop(1, rgba(on ? accent2 : accent, on ? 0.12 : 0.05));
        ctx.strokeStyle = g; ctx.lineWidth = on ? 1.5 : 1;
        ctx.setLineDash(pres ? [2, 4] : d.state === STATE.ACTIVE ? [6, 6] : []);
        ctx.lineDashOffset = d.state === STATE.ACTIVE && !still ? -T0 * 40 : 0;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      });
      ctx.setLineDash([]);

      const coreR = Math.max(10, Math.min(w, h) * 0.11);
      const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, coreR * (2.2 + pulse));
      glow.addColorStop(0, rgba(accent, 0.5)); glow.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, coreR * (2.2 + pulse), 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(accent, 0.85); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, 7); ctx.stroke();
      ctx.fillStyle = rgba(accent, 0.16); ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(ink, 0.9);
      ctx.font = `600 ${Math.round(coreR * 0.5)}px 'Geist Mono', ui-monospace, monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("OS", cx, cy);

      ctx.font = "600 10px 'Geist Mono', ui-monospace, monospace";
      items.forEach((d, i) => {
        const a = spin + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        const on = d.state === STATE.CONNECTED || d.state === STATE.ACTIVE;
        const err = d.state === STATE.ERROR;
        const pres = d.state === STATE.PRESENT;
        const col = err ? bad : on ? accent2 : accent;
        const alpha = on ? 1 : pres ? 0.65 : 0.3;
        if (on) {
          const gg = ctx.createRadialGradient(x, y, 1, x, y, 12);
          gg.addColorStop(0, rgba(accent2, 0.5)); gg.addColorStop(1, rgba(accent2, 0));
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7);
        if (on || err) { ctx.fillStyle = rgba(col, 1); ctx.fill(); }
        else { ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = rgba(col, 0.12); ctx.fill(); }
        const below = Math.sin(a) >= -0.2;
        ctx.fillStyle = rgba(ink, on ? 0.8 : 0.45);
        ctx.textAlign = "center"; ctx.textBaseline = below ? "top" : "bottom";
        ctx.fillText(d.short || d.name || d.id, x, y + (below ? 9 : -9));
      });

      if (!still) st.raf = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => { measure(); if (still) requestAnimationFrame(draw); });
    ro.observe(box);
    st.raf = requestAnimationFrame(draw);
    const onTheme = () => { st.tok = readTokens(); if (still) requestAnimationFrame(draw); };
    const mo = new MutationObserver(onTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    return () => { st.dead = true; cancelAnimationFrame(st.raf); ro.disconnect(); mo.disconnect(); };
  }, [devices]);

  const label = (devices || []).map((d) => `${d.name || d.id}: ${T(t, "dv_" + d.state)}`).join(", ");
  return html`<div ref=${wrap} data-hero class="relative w-full" style="height:clamp(8.5rem,32vw,11rem)">
    <canvas ref=${cv} class="block w-full h-full" aria-hidden="true"></canvas>
    <span class="sr-only">${label}</span>
  </div>`;
}
