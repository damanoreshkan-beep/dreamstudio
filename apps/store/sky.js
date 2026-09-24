// DreamStudio store — the SKY (2026-09-24, owner: "небо з апок … роби на проді прямо"). The farm's launcher
// as a night sky instead of a grid: every app is a star on true black, clustered into a constellation by
// category, brighter when featured, breathing a slow amber ring when newborn. Pan by drag, zoom by wheel or
// pinch; tap a star to open the app's page (the store's existing history-backed Sheet). White cores carry the
// identity — light on black is the farm's whole design — so category is said by CLUSTER and LABEL, not by ten
// tints, which would break the amber+cyan discipline (rules/design.md). The accent is the theme's own
// --app-accent (amber) and --app-accent-2 (cyan), so the sky follows day/night like everything else.
//
// It is a FIXED overlay, not a flow element: the farm shell's tool-view sizing is not something this file can
// see rendered, and a fixed layer with generous insets is robust to that in a way a height:100% guess is not.
// The insets clear the header and the tab bar; tune them by the eye on a real phone.
//
// A visually-hidden list of real <button data-app> mirrors every star: it is the accessible, tab-order,
// screen-reader view of the same sky, it is what search filters, and it keeps the farm's `[data-app]`
// contract (and the e2e that reads it) meaningful over a canvas that a machine cannot see.
import { html } from "htm/preact";
import { useRef, useEffect } from "preact/hooks";

// stable per-id placement, so a star sits in the same corner of the sky every visit
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const REDUCE = !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/**
 * The sky component. Props:
 *   apps      — the manifest array (id, category, title…), already the store's `apps`
 *   cats      — ordered category ids (the store's CATS)
 *   catLabel  — (categoryId) => localized name
 *   nameOf    — (app) => localized name
 *   isNewborn — (app) => bool   isFeatured — (app) => bool
 *   onOpen    — (app) => void   (the store's tap(): page for undiscovered, launch for opened)
 */
export function Sky({ apps, cats, catLabel, nameOf, isNewborn, isFeatured, onOpen }) {
  const wrap = useRef(null);
  const cvRef = useRef(null);
  const camRef = useRef({ x: 0, y: 0, s: 0.62, ts: 0.62 });

  useEffect(() => {
    const cv = cvRef.current, box = wrap.current;
    // Headless (the browser-free preflight gate) has no canvas 2D context, no rAF, no devicePixelRatio: the
    // sky is a live-only affordance, so it simply does not run there. The accessible [data-app] mirror beside
    // it is what preflight actually sees, which is the point of having it.
    if (!cv || !box || typeof cv.getContext !== "function" || !globalThis.requestAnimationFrame) return;
    const ctx = cv.getContext("2d", { alpha: false });
    // The browser-free preflight gate hands back a stub 2D context that has no real gradient/measure API, so
    // probe one call: a stub returns undefined and the sky simply does not run there. A real canvas returns a
    // CanvasGradient. This is the check that matters — rAF and getContext both exist in that headless.
    if (!ctx || !ctx.createRadialGradient || !ctx.createRadialGradient(0, 0, 0, 0, 0, 1)) return;
    let VW = 0, VH = 0, DPR = 1, raf = 0;
    const cam = camRef.current;
    const SMIN = 0.34, SMAX = 2.6;

    // read the theme's accents once per frame (cheap) so the sky follows day/night
    const css = getComputedStyle(document.documentElement);
    const tok = (n, f) => (css.getPropertyValue(n).trim() || f);

    // ── build the constellations ──
    const R = 1180;
    const centres = {};
    cats.forEach((c, i) => {
      const a = (i / cats.length) * Math.PI * 2 - Math.PI / 2;
      const wob = (hash(c) % 100) / 100 * 0.15;
      centres[c] = { x: Math.cos(a + wob) * R, y: Math.sin(a + wob) * R * 0.72 };
    });
    const stars = apps.map((app) => {
      const r = rng(hash(app.id));
      const c = centres[app.category] || { x: 0, y: 0 };
      const ang = r() * Math.PI * 2, rad = 90 + Math.sqrt(r()) * 300, z = 0.45 + r() * 0.55;
      return { app, x: c.x + Math.cos(ang) * rad, y: c.y + Math.sin(ang) * rad * 0.9, z, tw: r() * Math.PI * 2, tws: 0.6 + r() * 1.4, base: (isFeatured(app) ? 3.4 : 2.05) * (0.7 + z * 0.6), nb: isNewborn(app), ft: isFeatured(app) };
    });
    const chains = cats.map((c) => {
      const ct = centres[c], g = stars.filter((s) => s.app.category === c);
      g.sort((a, b) => Math.atan2(a.y - ct.y, a.x - ct.x) - Math.atan2(b.y - ct.y, b.x - ct.x));
      return { c, ct, g };
    });

    const resize = () => {
      DPR = Math.min(globalThis.devicePixelRatio || 1, 2);
      VW = box.clientWidth; VH = box.clientHeight;
      cv.width = VW * DPR; cv.height = VH * DPR; cv.style.width = VW + "px"; cv.style.height = VH + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };
    const toScreen = (wx, wy) => [(wx - cam.x) * cam.s + VW / 2, (wy - cam.y) * cam.s + VH / 2];
    const t0 = performance.now();

    const draw = (now) => {
      const t = (now - t0) / 1000;
      cam.s += (cam.ts - cam.s) * 0.12;
      const ink = tok("--color-base-content", "#fff");
      const amber = tok("--app-accent", "#ffb020");
      const cyan = tok("--app-accent-2", "#35e0e8");
      const bg = tok("--color-base-100", "#000");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, VW, VH);

      // constellation lines — present when zoomed out, gone when close
      const lineA = Math.max(0, Math.min(1, 1.05 - cam.s)) * 0.28;
      if (lineA > 0.01) {
        ctx.strokeStyle = cyan; ctx.globalAlpha = lineA; ctx.lineWidth = 1;
        for (const { g } of chains) {
          if (g.length < 2) continue;
          ctx.beginPath();
          for (let i = 0; i < g.length; i++) { const [sx, sy] = toScreen(g[i].x, g[i].y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }
          const [fx, fy] = toScreen(g[0].x, g[0].y); ctx.lineTo(fx, fy); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // category names near their centroid, when zoomed out
      if (cam.s < 0.95) {
        const a = Math.min(1, (0.95 - cam.s) / 0.3);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "500 12px ui-monospace, monospace"; ctx.fillStyle = hexA(ink, 0.5 * a);
        for (const { c, ct } of chains) { const [sx, sy] = toScreen(ct.x, ct.y); if (sx > -80 && sx < VW + 80 && sy > -40 && sy < VH + 40) ctx.fillText(catLabel(c).toUpperCase(), sx, sy); }
      }
      // stars
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      for (const s of stars) {
        const [sx, sy] = toScreen(s.x, s.y); const rr = s.base * cam.s;
        if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
        const twk = REDUCE ? 1 : 0.78 + 0.22 * Math.sin(t * s.tws + s.tw);
        if (s.nb && !REDUCE) { const p = 0.5 + 0.5 * Math.sin(t * 1.3 + s.tw); ctx.beginPath(); ctx.arc(sx, sy, rr * (2.6 + p * 1.6), 0, 7); ctx.strokeStyle = amber; ctx.globalAlpha = 0.14 * (1 - p * 0.6); ctx.lineWidth = 1.2; ctx.stroke(); ctx.globalAlpha = 1; }
        const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 6);
        halo.addColorStop(0, s.ft ? amber : cyan); halo.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = (s.ft ? 0.5 : 0.3) * twk; ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(sx, sy, rr * 6, 0, 7); ctx.fill();
        ctx.globalAlpha = twk;
        const core = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr * 1.7);
        core.addColorStop(0, "#fff"); core.addColorStop(0.5, "#fff"); core.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = core; ctx.beginPath(); ctx.arc(sx, sy, rr * 1.7, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        const showName = s.ft || cam.s > 1.25;
        if (showName) { const a = s.ft ? Math.min(1, cam.s * 0.9) : Math.min(1, (cam.s - 1.25) / 0.5); if (a > 0.03) { ctx.font = "12px -apple-system, system-ui, sans-serif"; ctx.fillStyle = hexA(ink, 0.85 * a); ctx.fillText(nameOf(s.app), sx, sy + rr * 2 + 4); } }
      }
      raf = requestAnimationFrame(draw);
    };

    // ── interaction ──
    const pts = new Map(); let moved = 0, downT = 0, pinchD = 0, panx = 0, pany = 0;
    const zoomAt = (px, py, f) => { const ns = Math.max(SMIN, Math.min(SMAX, cam.ts * f)); const wx = (px - VW / 2) / cam.s + cam.x, wy = (py - VH / 2) / cam.s + cam.y; cam.ts = ns; cam.s = ns; cam.x = wx - (px - VW / 2) / ns; cam.y = wy - (py - VH / 2) / ns; };
    const rectXY = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pickNear = (px, py) => { let best = null, bd = 1e9; for (const s of stars) { const [sx, sy] = toScreen(s.x, s.y); const d = Math.hypot(sx - px, sy - py); const hit = Math.max(18, s.base * cam.s * 3); if (d < hit && d < bd) { bd = d; best = s; } } return best; };
    const onDown = (e) => { cv.setPointerCapture(e.pointerId); const [x, y] = rectXY(e); pts.set(e.pointerId, { x, y }); if (pts.size === 1) { moved = 0; downT = performance.now(); panx = x; pany = y; } if (pts.size === 2) { const p = [...pts.values()]; pinchD = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); } };
    const onMove = (e) => { if (!pts.has(e.pointerId)) return; const [x, y] = rectXY(e); pts.set(e.pointerId, { x, y }); const p = [...pts.values()]; if (pts.size === 1) { const dx = x - panx, dy = y - pany; panx = x; pany = y; moved += Math.abs(dx) + Math.abs(dy); cam.x -= dx / cam.s; cam.y -= dy / cam.s; } else if (pts.size === 2) { const nd = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); if (pinchD) zoomAt((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2, nd / pinchD); pinchD = nd; moved += 20; } };
    const onUp = (e) => { if (pts.size === 1 && moved < 8 && performance.now() - downT < 350) { const [x, y] = rectXY(e); const s = pickNear(x, y); if (s) onOpen(s.app); } pts.delete(e.pointerId); if (pts.size < 2) pinchD = 0; };
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

// #rrggbb + alpha → rgba(); tolerant of an already-rgb() token
function hexA(c, a) {
  c = c.trim();
  if (c[0] === "#" && (c.length === 7 || c.length === 4)) {
    const n = c.length === 4 ? c.replace(/#(.)(.)(.)/, "#$1$1$2$2$3$3") : c;
    const r = parseInt(n.slice(1, 3), 16), g = parseInt(n.slice(3, 5), 16), b = parseInt(n.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return `rgba(255,255,255,${a})`;
}
