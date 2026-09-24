// DreamStudio store — THE SKY, production (2026-09-24, owner: "долой прототипи · роби продакшн · 21st first").
//
// The browse view is a night sky made of the apps themselves: every star is the app's own luminous icon —
// the 256² light-on-black art that IS its identity (docs/research/luminous-icons.md) — placed in a
// constellation with its category, connected by fading cyan lines, breathing when newborn, burning larger
// when featured. Pan by drag, pinch or wheel to zoom, tap a star to open the app's page (the store's
// history-backed Sheet). At the fitted scale a star is a small glowing mark; as you come closer it resolves
// into the app's art and its name. Category is said by CLUSTER and LABEL, never by a tenth colour: the
// palette is the theme's own --app-accent (amber) and --app-accent-2 (cyan) on the theme's ground.
//
// What was taken from 21st (search: "constellation star map navigation"): Constellation Grid's spring-mass
// physics — every node has an anchor, a velocity, Hooke's restoring force and damping, dt-normalised so a
// 120 Hz phone and a 60 Hz one feel the same, and a touch sends a gentle shockwave through the nearby stars;
// Constellation Field's pointer-reactive drift and distance-faded connections. What was NOT taken: their
// anonymous decorative nodes — here every node is a real app, and the field is the product, not a backdrop.
//
// It is a block in the flow (head.html sizes it to the viewport between the head row and the tab bar —
// measured, not guessed) and it does not run in the browser-free gate: that headless has no real 2D
// context, and the accessible [data-app] list beside it is what the gate and a screen reader read.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const REDUCE = !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// #rrggbb → relative luminance 0…1 (unparseable counts as dark), and #rrggbb + alpha → rgba()
const hex = (c) => { c = c.trim(); if (c[0] !== "#") return null; const n = c.length === 4 ? c.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : c; return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)]; };
const lum = (c) => { const p = hex(c); return p ? (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255 : 0; };
const rgba = (c, a) => { const p = hex(c); return p ? `rgba(${p[0]},${p[1]},${p[2]},${a})` : `rgba(255,255,255,${a})`; };

/**
 * Props: apps (manifest rows), cats (ordered ids), catLabel(id), nameOf(app), isNewborn(app),
 * isFeatured(app), iconUrl(app) → url | null, onOpen(app).
 */
export function Sky({ apps, cats, catLabel, nameOf, isNewborn, isFeatured, iconUrl, onOpen }) {
  const wrap = useRef(null), cvRef = useRef(null);
  const camRef = useRef({ x: 0, y: 0, s: 0.14, ts: 0.14 });

  useEffect(() => {
    const cv = cvRef.current, box = wrap.current;
    if (!cv || !box || typeof cv.getContext !== "function" || !globalThis.requestAnimationFrame) return;
    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx || !ctx.createRadialGradient || !ctx.createRadialGradient(0, 0, 0, 0, 0, 1)) return;   // the gate's stub context
    const cam = camRef.current;
    const css = getComputedStyle(document.documentElement);
    const tok = (n, f) => (css.getPropertyValue(n).trim() || f);
    let VW = 0, VH = 0, DPR = 1, raf = 0, fitS = 0.14, SMIN = 0.1, SMAX = 1, fitted = false, frames = 0;

    // ── the constellations: a ring in the box's own proportion, one cluster per category ──
    const R = 1180;
    const aspect = box.clientWidth > 0 ? clamp(box.clientHeight / box.clientWidth, 0.72, 1.6) : 0.72;
    const centres = {};
    cats.forEach((c, i) => { const a = (i / cats.length) * Math.PI * 2 - Math.PI / 2, w = (hash(c) % 100) / 100 * 0.15; centres[c] = { x: Math.cos(a + w) * R, y: Math.sin(a + w) * R * aspect }; });
    // a cluster's spread grows with √(its size): seventeen tools in the radius that fits four games overlap
    const count = {}; for (const a of apps) count[a.category] = (count[a.category] || 0) + 1;
    const stars = apps.map((app, i) => {
      const r = rng(hash(app.id)), c = centres[app.category] || { x: 0, y: 0 };
      const spread = clamp(Math.sqrt((count[app.category] || 1) / 7), 1, 1.9);
      const ang = r() * Math.PI * 2, rad = (70 + Math.sqrt(r()) * 280) * spread;
      const ft = isFeatured(app), nb = isNewborn(app);
      const s = { app, i, ax: c.x + Math.cos(ang) * rad, ay: c.y + Math.sin(ang) * rad * 0.9, x: 0, y: 0, vx: 0, vy: 0, ph: r() * Math.PI * 2, ft, nb, base: ft ? 13 : 8.5, img: null, ok: false };
      s.x = s.ax; s.y = s.ay;
      const u = iconUrl(app);
      if (u) { const im = new Image(); im.decoding = "async"; im.onload = () => { s.img = im; s.ok = true; }; im.src = u; }
      return s;
    });
    const chains = cats.map((c) => {
      const ct = centres[c], g = stars.filter((s) => s.app.category === c);
      g.sort((a, b) => Math.atan2(a.ay - ct.y, a.ax - ct.x) - Math.atan2(b.ay - ct.y, b.ax - ct.x));
      const rMax = g.reduce((m, s) => Math.max(m, Math.hypot(s.ax - ct.x, s.ay - ct.y)), 0), len = Math.hypot(ct.x, ct.y) || 1;
      return { c, ct, g, rMax, dir: { x: ct.x / len, y: ct.y / len } };
    });
    const ext = stars.reduce((e, s) => ({ x0: Math.min(e.x0, s.ax), x1: Math.max(e.x1, s.ax), y0: Math.min(e.y0, s.ay), y1: Math.max(e.y1, s.ay) }), { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });

    const resize = () => {
      DPR = Math.min(globalThis.devicePixelRatio || 1, 2); VW = box.clientWidth; VH = box.clientHeight;
      cv.width = VW * DPR; cv.height = VH * DPR; cv.style.width = VW + "px"; cv.style.height = VH + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      // fit the real extent, reserving 72px a side for the outward labels and 40px top/bottom
      const fit = Math.min((VW - 144) / (ext.x1 - ext.x0), (VH - 80) / (ext.y1 - ext.y0));
      fitS = fit; SMIN = fit * 0.75; SMAX = fit * 6;
      if (!fitted && VW > 0 && VH > 0) { cam.s = cam.ts = fit; cam.x = (ext.x0 + ext.x1) / 2; cam.y = (ext.y0 + ext.y1) / 2; fitted = true; }
    };
    const toScreen = (wx, wy) => [(wx - cam.x) * cam.s + VW / 2, (wy - cam.y) * cam.s + VH / 2];
    const toWorld = (px, py) => [(px - VW / 2) / cam.s + cam.x, (py - VH / 2) / cam.s + cam.y];

    // ── physics (Constellation Grid, MIT): spring to anchor, damping, a touch shockwave, dt-normalised ──
    const K = 14, DAMP = 0.86;
    const touch = { x: -1e9, y: -1e9, until: 0 };   // world coords; a press leaves a ripple for 400 ms
    const born = performance.now();
    let last = born;

    const draw = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const t = (now - born) / 1000;
      cam.s += (cam.ts - cam.s) * 0.12;
      if (++frames % 30 === 0) box.dataset.frames = String(frames);
      const ink = tok("--color-base-content", "#fff"), amber = tok("--app-accent", "#ffb020"), cyan = tok("--app-accent-2", "#35e0e8"), bg = tok("--color-base-100", "#000");
      const dark = lum(bg) < 0.5, haloK = dark ? 1 : 0.32;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);

      // integrate: idle drift is a slow breath around the anchor; a press pushes nearby stars away
      const pressing = now < touch.until;
      for (const s of stars) {
        const drift = REDUCE ? 0 : 6;
        const hx = s.ax + Math.sin(t * 0.35 + s.ph) * drift - s.x, hy = s.ay + Math.cos(t * 0.29 + s.ph) * drift - s.y;
        s.vx += hx * K * dt; s.vy += hy * K * dt;
        if (pressing) { const dx = s.x - touch.x, dy = s.y - touch.y, d = Math.hypot(dx, dy), reach = 220 / cam.s * fitS * 6; if (d > 0 && d < reach) { const f = (1 - d / reach) * 900 * dt; s.vx += dx / d * f; s.vy += dy / d * f; } }
        s.vx *= DAMP; s.vy *= DAMP; s.x += s.vx * dt * 60; s.y += s.vy * dt * 60;
      }

      // entrance: stars resolve over the first 700 ms, staggered by index (skipped under reduced motion)
      const reveal = (s) => REDUCE ? 1 : clamp((t - s.i * 0.006) / 0.7, 0, 1);

      // constellation lines, fading as you come close (they are for orientation, not for reading)
      const lineA = clamp((fitS * 3 - cam.s) / (fitS * 2), 0, 1) * (dark ? 0.28 : 0.22);
      if (lineA > 0.01) {
        ctx.strokeStyle = rgba(cyan, lineA); ctx.lineWidth = 1;
        for (const { g } of chains) { if (g.length < 2) continue; ctx.beginPath(); for (let i = 0; i < g.length; i++) { const [x, y] = toScreen(g[i].x, g[i].y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } const [fx, fy] = toScreen(g[0].x, g[0].y); ctx.lineTo(fx, fy); ctx.stroke(); }
      }

      // category labels, outward past each constellation's reach, knocked out in the ground colour
      if (cam.s < fitS * 3) {
        const a = clamp((fitS * 3 - cam.s) / fitS, 0, 1);
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "500 12px ui-monospace, monospace";
        ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = rgba(bg, 0.85 * a); ctx.fillStyle = rgba(ink, 0.5 * a);
        for (const { c, ct, rMax, dir } of chains) { const [x, y] = toScreen(ct.x + dir.x * (rMax + 16 / cam.s), ct.y + dir.y * (rMax + 16 / cam.s)); if (x > -80 && x < VW + 80 && y > -40 && y < VH + 40) { const txt = catLabel(c).toUpperCase(); ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y); } }
      }

      // stars: the app's own art, sized in screen px, growing as you approach; a glow dot until it loads
      const zoomK = clamp(Math.sqrt(cam.s / fitS), 1, 2.2);   // ×1 at the fit, ×2.2 fully in
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      const names = [];   // drawn in a second pass, so a later tile never covers an earlier star's name
      for (const s of stars) {
        const [x, y] = toScreen(s.x, s.y);
        if (x < -60 || x > VW + 60 || y < -60 || y > VH + 60) continue;
        const rv = reveal(s); if (rv <= 0) continue;
        const size = s.base * zoomK * (0.6 + 0.4 * rv), tw = REDUCE ? 1 : 0.85 + 0.15 * Math.sin(t * 1.3 + s.ph);
        // newborn: a slow breathing ring in amber
        if (s.nb && !REDUCE) { const p = 0.5 + 0.5 * Math.sin(t * 1.3 + s.ph); ctx.beginPath(); ctx.arc(x, y, size * (1.9 + p * 0.9), 0, 7); ctx.strokeStyle = amber; ctx.globalAlpha = 0.16 * (1 - p * 0.6) * haloK * rv; ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1; }
        // halo: amber for featured, cyan otherwise, damped on paper
        const hr = size * 2.6, halo = ctx.createRadialGradient(x, y, 0, x, y, hr);
        halo.addColorStop(0, s.ft ? amber : cyan); halo.addColorStop(1, rgba(bg, 0));
        ctx.globalAlpha = (s.ft ? 0.5 : 0.3) * tw * haloK * rv; ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill();
        ctx.globalAlpha = rv;
        if (s.ok) {
          // the icon is light on its own black ground; a rounded clip keeps the farm's tile shape
          const d = size * 2, r = d * 0.22; ctx.save(); ctx.beginPath(); ctx.roundRect(x - size, y - size, d, d, r); ctx.clip(); ctx.drawImage(s.img, x - size, y - size, d, d); ctx.restore();
        } else {
          const core = ctx.createRadialGradient(x, y, 0, x, y, size * 0.9); core.addColorStop(0, ink); core.addColorStop(0.55, ink); core.addColorStop(1, rgba(ink, 0));
          ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, size * 0.9, 0, 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
        // names: featured always; everyone once you are 2.5× past the fit
        const showName = s.ft || cam.s > fitS * 2.5;
        if (showName) { const a = (s.ft ? 1 : clamp((cam.s - fitS * 2.5) / fitS, 0, 1)) * rv; if (a > 0.03) names.push([nameOf(s.app), x, y + size + 5, a]); }
      }
      if (names.length) {
        ctx.font = "12px -apple-system, system-ui, sans-serif"; ctx.lineJoin = "round"; ctx.lineWidth = 3;
        for (const [txt, x, ny, a] of names) { ctx.strokeStyle = rgba(bg, 0.8 * a); ctx.strokeText(txt, x, ny); ctx.fillStyle = rgba(ink, 0.88 * a); ctx.fillText(txt, x, ny); }
      }
      raf = requestAnimationFrame(draw);
    };

    // ── interaction: pan, pinch, wheel, tap (with a ripple) ──
    const pts = new Map(); let moved = 0, downT = 0, pinchD = 0, panx = 0, pany = 0;
    const rectXY = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const zoomAt = (px, py, f) => { const ns = clamp(cam.ts * f, SMIN, SMAX); const [wx, wy] = toWorld(px, py); cam.ts = ns; cam.s = ns; cam.x = wx - (px - VW / 2) / ns; cam.y = wy - (py - VH / 2) / ns; };
    const pick = (px, py) => { let best = null, bd = 1e9; for (const s of stars) { const [x, y] = toScreen(s.x, s.y); const d = Math.hypot(x - px, y - py), hit = Math.max(22, s.base * 2.2); if (d < hit && d < bd) { bd = d; best = s; } } return best; };
    const onDown = (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = rectXY(e); pts.set(e.pointerId, { x, y }); if (pts.size === 1) { moved = 0; downT = performance.now(); panx = x; pany = y; [touch.x, touch.y] = toWorld(x, y); touch.until = performance.now() + 400; } if (pts.size === 2) { const p = [...pts.values()]; pinchD = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); } };
    const onMove = (e) => { if (!pts.has(e.pointerId)) return; const [x, y] = rectXY(e); pts.set(e.pointerId, { x, y }); const p = [...pts.values()]; if (pts.size === 1) { const dx = x - panx, dy = y - pany; panx = x; pany = y; moved += Math.abs(dx) + Math.abs(dy); cam.x -= dx / cam.s; cam.y -= dy / cam.s; } else if (pts.size === 2) { const nd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); if (pinchD) zoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, nd / pinchD); pinchD = nd; moved += 20; } };
    const onUp = (e) => { if (pts.size === 1 && moved < 8 && performance.now() - downT < 350) { const [x, y] = rectXY(e); const s = pick(x, y); if (s) onOpen(s.app); } pts.delete(e.pointerId); if (pts.size < 2) pinchD = 0; };
    const onWheel = (e) => { e.preventDefault(); const [x, y] = rectXY(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0015)); };

    resize();
    const ro = new ResizeObserver(resize); ro.observe(box);
    cv.addEventListener("pointerdown", onDown); cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp); cv.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); pinchD = 0; });
    cv.addEventListener("wheel", onWheel, { passive: false });
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [apps]);

  return html`<div ref=${wrap} class="ms-sky"><canvas ref=${cvRef} class="ms-sky-canvas" aria-hidden="true"></canvas></div>`;
}
