import { decode } from "npm:@jsquash/png@3.0.1";

const GLOW = 30, CORE = 110, STRIDE = 2;
export function measure({ width: w, height: h, data }) {
  const lum = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const corner = (x, y) => { let m = 0; for (let dy = 0; dy < 16; dy++) for (let dx = 0; dx < 16; dx++) m = Math.max(m, lum(((y + dy) * w + x + dx) * 4)); return Math.round(m); };
  const corners = [corner(0, 0), corner(w - 16, 0), corner(0, h - 16), corner(w - 16, h - 16)];
  const g = { x0: w, x1: -1, y0: h, y1: -1 }, c = { x0: w, x1: -1, y0: h, y1: -1 };
  const grow = (b, x, y) => { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; };
  for (let y = 0; y < h; y += STRIDE) for (let x = 0; x < w; x += STRIDE) {
    const l = lum((y * w + x) * 4);
    if (l > GLOW) grow(g, x, y);
    if (l > CORE) grow(c, x, y);
  }
  const cx = (c.x0 + c.x1) / 2 - w / 2, cy = (c.y0 + c.y1) / 2 - h / 2;
  const widthPct = Math.round(100 * Math.max(c.x1 - c.x0, c.y1 - c.y0) / w);
  const floor = Math.max(0, g.y1 - c.y1);
  const black = Math.max(...corners) <= 13, sized = widthPct >= 60 && widthPct <= 92, centred = Math.abs(cx) <= 30 && Math.abs(cy) <= 30;
  return { w, h, corners, core: [c.x0, c.y0, c.x1, c.y1], glow: [g.x0, g.y0, g.x1, g.y1], widthPct, cx: Math.round(cx), cy: Math.round(cy), floor, black, sized, centred, ok: black && sized && centred };
}

if (import.meta.main) {
  let bad = 0;
  for (const f of Deno.args) {
    const m = measure(await decode((await Deno.readFile(f)).buffer));
    if (!m.ok) bad++;
    console.log(`${m.ok ? "OK" : "NO"}  ${f}  ${m.w}x${m.h}  corners ${m.corners.join("/")}${m.black ? "" : " NOT-BLACK"}  core ${m.widthPct}%${m.sized ? "" : " OFF-SIZE"}  centre ${m.cx >= 0 ? "+" : ""}${m.cx},${m.cy >= 0 ? "+" : ""}${m.cy}px${m.centred ? "" : " OFF-CENTRE"}  floor ${m.floor}px${m.floor > 60 ? " FLOOR" : ""}`);
  }
  Deno.exit(bad ? 1 : 0);
}
