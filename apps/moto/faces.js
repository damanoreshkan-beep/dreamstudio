import { html } from "htm/preact";

export const TOP = 240;
export const SKINS = [
  { id: "classic", key: "skinClassic", icon: "lucide:gauge" },
  { id: "sport", key: "skinSport", icon: "lucide:zap" },
  { id: "lcd", key: "skinLcd", icon: "lucide:hash" },
  { id: "hud", key: "skinHud", icon: "lucide:moon" },
];

const FROM = 135, SWEEP = 270;
const frac = (kmh) => Math.max(0, Math.min(1, (kmh || 0) / TOP));
const polar = (r, deg) => { const a = deg * Math.PI / 180; return [100 + r * Math.cos(a), 100 + r * Math.sin(a)]; };
const arc = (r, f0, f1) => {
  const [x0, y0] = polar(r, FROM + SWEEP * f0), [x1, y1] = polar(r, FROM + SWEEP * f1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${(f1 - f0) * SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const ACCENT = "color:var(--app-accent)";
const EASE = "duration-1000 ease-linear motion-reduce:transition-none";
const digits = (kmh) => (kmh == null ? "--" : String(Math.round(kmh)));
const ink = (over) => (over ? "text-error" : "");
const SVG = "w-full h-full block select-none";

function Classic({ kmh, limit, unit, over }) {
  const marks = [];
  for (let v = 0; v <= TOP; v += 10) {
    const major = v % 20 === 0, a = FROM + SWEEP * v / TOP;
    const [x0, y0] = polar(88, a), [x1, y1] = polar(major ? 76 : 82, a);
    marks.push(html`<line key=${`t${v}`} x1=${x0.toFixed(2)} y1=${y0.toFixed(2)} x2=${x1.toFixed(2)} y2=${y1.toFixed(2)} stroke="currentColor" stroke-width=${major ? 2 : 1} opacity=${major ? 0.9 : 0.45} stroke-linecap="round" />`);
    if (v % 40 === 0) {
      const [tx, ty] = polar(63, a);
      marks.push(html`<text key=${`n${v}`} x=${tx.toFixed(2)} y=${ty.toFixed(2)} font-size="11" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="currentColor" opacity="0.8">${v}</text>`);
    }
  }
  return html`<svg data-face="classic" viewBox="0 0 200 200" class=${SVG} role="img" aria-label=${`${digits(kmh)} ${unit}`}>
    <circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.2" />
    <circle cx="100" cy="100" r="93" fill="none" stroke="currentColor" stroke-width="0.75" opacity="0.1" />
    ${limit ? html`<path d=${arc(93, limit / TOP, 1)} fill="none" stroke="currentColor" class="text-error" stroke-width="3" stroke-linecap="round" />` : null}
    ${marks}
    <text x="100" y="163" font-size="26" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="currentColor" class=${`font-mono ${ink(over)}`}>${digits(kmh)}</text>
    <text x="100" y="181" font-size="8" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="currentColor" opacity="0.7" class="font-mono">${unit}</text>
    <g class=${`transition-transform ${EASE}`} style=${`transform-origin:100px 100px;transform:rotate(${(FROM + SWEEP * frac(kmh)).toFixed(2)}deg)`}>
      <line x1="82" y1="100" x2="180" y2="100" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
      <line x1="82" y1="100" x2="180" y2="100" stroke="currentColor" style=${ACCENT} stroke-width="2.5" stroke-linecap="round" />
    </g>
    <circle cx="100" cy="100" r="7" fill="currentColor" />
    <circle cx="100" cy="100" r="2.5" fill="currentColor" class="text-base-100" />
  </svg>`;
}

function Sport({ kmh, limit, unit, over }) {
  const ticks = [];
  for (let v = 0; v <= TOP; v += 20) {
    const a = FROM + SWEEP * v / TOP, [x0, y0] = polar(97, a), [x1, y1] = polar(93, a);
    ticks.push(html`<line key=${v} x1=${x0.toFixed(2)} y1=${y0.toFixed(2)} x2=${x1.toFixed(2)} y2=${y1.toFixed(2)} stroke="currentColor" stroke-width="1.5" opacity="0.5" />`);
  }
  return html`<svg data-face="sport" viewBox="0 0 200 200" class=${SVG} role="img" aria-label=${`${digits(kmh)} ${unit}`}>
    <path d=${arc(84, 0, 1)} fill="none" stroke="currentColor" stroke-width="12" opacity="0.12" />
    ${limit ? html`<path d=${arc(84, limit / TOP, 1)} fill="none" stroke="currentColor" class="text-error" stroke-width="12" opacity="0.4" />` : null}
    <path d=${arc(84, 0, 1)} pathLength="100" fill="none" stroke="currentColor" style=${ACCENT} stroke-width="12"
      stroke-dasharray="100" stroke-dashoffset=${(100 - frac(kmh) * 100).toFixed(2)} class=${`transition-[stroke-dashoffset] ${EASE}`} />
    ${ticks}
    <text x="100" y="100" font-size="62" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="currentColor" class=${`font-mono ${ink(over)}`}>${digits(kmh)}</text>
    <text x="100" y="140" font-size="11" font-weight="600" text-anchor="middle" dominant-baseline="central" fill="currentColor" opacity="0.7" class="font-mono">${unit}</text>
  </svg>`;
}

const W = 50, H = 84, K = 9, GAP = 1;
const hseg = (y) => { const x = K / 2 + GAP, w = W - K - 2 * GAP; return `${x + K / 2},${y} ${x + w - K / 2},${y} ${x + w},${y + K / 2} ${x + w - K / 2},${y + K} ${x + K / 2},${y + K} ${x},${y + K / 2}`; };
const vseg = (x, y) => { const h = H / 2 - K / 2 - 2 * GAP; return `${x + K / 2},${y} ${x + K},${y + K / 2} ${x + K},${y + h - K / 2} ${x + K / 2},${y + h} ${x},${y + h - K / 2} ${x},${y + K / 2}`; };
const SEG = {
  a: hseg(0), g: hseg((H - K) / 2), d: hseg(H - K),
  f: vseg(0, K / 2 + GAP), b: vseg(W - K, K / 2 + GAP), e: vseg(0, H / 2 + GAP), c: vseg(W - K, H / 2 + GAP),
};
const GLYPH = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g", " ": "" };

function Lcd({ kmh, limit, unit, over }) {
  const text = (kmh == null ? "--" : String(Math.round(kmh))).padStart(3, " ").slice(-3);
  const cells = Array.from({ length: 30 }, (_, i) => i * 8);
  return html`<svg data-face="lcd" viewBox="0 0 240 150" class=${SVG} role="img" aria-label=${`${digits(kmh)} ${unit}`}>
    ${cells.map((v, i) => {
      const lit = kmh != null && kmh > v, hot = limit && v >= limit;
      return html`<rect key=${v} x=${(14 + i * 7.1).toFixed(1)} y="14" width="5.6" height="14" rx="1" fill="currentColor" class=${hot ? "text-error" : ""} opacity=${lit ? 1 : hot ? 0.3 : 0.1} />`;
    })}
    ${[...text].map((ch, i) => html`<g key=${i} transform=${`translate(${31 + i * (W + 14)} 44)`} class=${ink(over)}>
      ${Object.entries(SEG).map(([id, pts]) => html`<polygon key=${id} points=${pts} fill="currentColor" opacity=${GLYPH[ch].includes(id) ? 1 : 0.07} />`)}
    </g>`)}
    <text x="226" y="142" font-size="10" font-weight="600" text-anchor="end" fill="currentColor" opacity="0.7" class="font-mono">${unit}</text>
  </svg>`;
}

function Hud({ kmh, limit, unit, over }) {
  return html`<svg data-face="hud" viewBox="0 0 240 150" class=${SVG} role="img" aria-label=${`${digits(kmh)} ${unit}`}>
    <text x="226" y="18" font-size="10" font-weight="600" text-anchor="end" fill="currentColor" opacity="0.6" class="font-mono">${unit}</text>
    <text x="120" y="72" font-size="104" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="currentColor" class=${`font-mono ${ink(over)}`}>${digits(kmh)}</text>
    <rect x="24" y="130" width="192" height="5" rx="2.5" fill="currentColor" opacity="0.18" />
    <rect x="24" y="130" width=${(192 * frac(kmh)).toFixed(1)} height="5" rx="2.5" fill="currentColor" class=${`transition-[width] ${EASE}`} />
    ${limit ? html`<rect x=${(23 + 192 * limit / TOP).toFixed(1)} y="125" width="2" height="15" fill="currentColor" class="text-error" />` : null}
  </svg>`;
}

export const FACES = { classic: Classic, sport: Sport, lcd: Lcd, hud: Hud };
