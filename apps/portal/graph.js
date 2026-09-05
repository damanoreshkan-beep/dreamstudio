// The portal GRAPH — TouchDesigner's TOP network on PixiJS's ready machinery, assembled from data (presets.js).
// Owner, 2026-09-05, on the cuts before this one: "при переміщені камери текстури не цепляються до обʼєктів …
// виглядає як фільтр звичайний поверх", "якість камери не порти ні в якому разі", "дрібні текстурочки атомні, а
// не великі поверх усього", "фурмули математики алгоритми мають працювати … на старому желізі бездоганно".
// So the material is a PROPERTY OF THE SURFACE, not a film on the screen:
//   FLOW    (TD Optical Flow TOP)  — Lucas–Kanade between the last two frames of the camera at 1/4 resolution:
//                                    where every patch of the picture MOVED, in pixels per frame
//   ANCHOR  (TD Feedback + Remap)   — a map of the material's tile PHASE at every pixel, advected by the flow each
//                                    frame: the phase travels WITH the scene, so the grain is nailed to the wall,
//                                    the face, the cup — when the hand moves, the material moves with the object
//   TRACE   (TD Edge + Slope + Lookup) — Sobel contours AND tone hatching (the material fills the shadows, or the
//                                    lights, by luminance), both sampling the material at the anchored phase, at an
//                                    ATOMIC tile (a quarter of the texture per 256 px, or finer)
//   ECHO    (TD Feedback TOP)       — the last loop frame, advected by the same flow (the trail follows the
//                                    scene), faded, zoomed, turned, under the new trace
//   BASE + OVER                     — the camera AS IS, at the renderer's resolution, nothing on it; the loop added
//                                    (or multiplied) over it; the post chain on top
// Costs, per frame: one low-res copy (luma), one low-res flow (54 reads at 1/16 of the pixels), one full copy into
// camRT, the anchor advect (2 reads), the trace (~12 reads), the echo advect (1 read), the loop composite —
// about 4 full passes at the preset's `detail` resolution + the stage. Every custom filter renders at the target's
// resolution ('inherit'), never above it. Rules learnt on the see pod: no screen/add layer inside a feedback loop
// (the new input is `normal` at an alpha over a transparent ground); a mask Graphics not consumed is a white
// rect; `Filter.from` needs the vertex named; all full-frame sprites sit at (0,0) w×h so every filter's
// vTextureCoord is the same screen UV and one RT can sample another at it.
const FILTER_VERT = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition( void ) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord( void ) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

// FLOW — Lucas–Kanade, 3×3 window, on the low-res luma pair; the flow is in LOW-RES px per frame, encoded
// 0.5 ± f/(2·uMax) in RG, smoothed against the previous flow (a half each) so a jitter never becomes a tear
const FLOW_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uPrevLuma;
uniform sampler2D uPrevFlow;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uMax;
float L(sampler2D s, vec2 uv) { vec3 c = texture(s, clamp(uv, uInputClamp.xy, uInputClamp.zw)).rgb; return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 t = uInputSize.zw;
  float sxx = 0.0, sxy = 0.0, syy = 0.0, sxt = 0.0, syt = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 q = vTextureCoord + vec2(float(i), float(j)) * t;
    float ix = (L(uTexture, q + vec2(t.x, 0.0)) - L(uTexture, q - vec2(t.x, 0.0))) * 0.5;
    float iy = (L(uTexture, q + vec2(0.0, t.y)) - L(uTexture, q - vec2(0.0, t.y))) * 0.5;
    float it = L(uTexture, q) - L(uPrevLuma, q);
    sxx += ix * ix; sxy += ix * iy; syy += iy * iy; sxt += ix * it; syt += iy * it;
  }
  float det = sxx * syy - sxy * sxy;
  vec2 f = vec2(0.0);
  if (det > 1e-6) f = vec2(-(syy * sxt - sxy * syt), -(sxx * syt - sxy * sxt)) / det;
  f = clamp(f, vec2(-uMax), vec2(uMax));
  vec2 pf = (texture(uPrevFlow, vTextureCoord).xy - 0.5) * 2.0 * uMax;
  f = mix(pf, f, 0.5);
  finalColor = vec4(f / (2.0 * uMax) + 0.5, 0.0, 1.0);
}`;

// ANCHOR — the material's tile phase at every pixel: what was at (p − flow) last frame, shifted by the flow in
// tile units, plus the preset's slow drift; the phase wraps (fract) so 8 bits hold it to a pixel of a 256-px tile
const ANCHOR_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uFlow;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uMax;
uniform float uFlowScale;
uniform float uPeriod;
uniform vec2 uDrift;
void main() {
  vec2 f = (texture(uFlow, vTextureCoord).xy - 0.5) * 2.0 * uMax * uFlowScale;   // px of this pass
  vec2 src = clamp(vTextureCoord - f * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  vec2 a = texture(uTexture, src).xy;
  finalColor = vec4(fract(a - f / uPeriod + uDrift), 0.0, 1.0);
}`;

// TRACE — Sobel contours + tone hatching, the material sampled at (screen / period + anchored phase): the grain
// belongs to the point of the scene under it; premultiplied alpha = how much material is here
const TRACE_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uMatTexture;
uniform sampler2D uAnchor;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uStrength;
uniform float uStep;
uniform float uFloor;
uniform float uPeriod;
uniform float uInvert;
uniform float uShade;
uniform float uShadeOn;
uniform vec2 uShadeBand;
float lum(vec2 d) {
  vec2 uv = clamp(vTextureCoord + d, uInputClamp.xy, uInputClamp.zw);
  vec3 c = texture(uTexture, uv).rgb;
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 t = uInputSize.zw * uStep;
  float tl = lum(vec2(-t.x, -t.y)), tc = lum(vec2(0.0, -t.y)), tr = lum(vec2(t.x, -t.y));
  float ml = lum(vec2(-t.x, 0.0)),  cc = lum(vec2(0.0)),        mr = lum(vec2(t.x, 0.0));
  float bl = lum(vec2(-t.x, t.y)),  bc = lum(vec2(0.0, t.y)),  br = lum(vec2(t.x, t.y));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  float e = smoothstep(uFloor, 1.0, length(vec2(gx, gy)) * uStrength);
  float tone = mix(1.0 - cc, cc, uShadeOn);                       // the shadows (0) or the lights (1) take the material
  float shade = uShade * smoothstep(uShadeBand.x, uShadeBand.y, tone);
  float w = clamp(e + shade, 0.0, 1.0);
  vec2 a = texture(uAnchor, vTextureCoord).xy;
  vec3 m = texture(uMatTexture, fract(vTextureCoord * uInputSize.xy / uPeriod + a)).rgb;
  m = mix(m, 1.0 - m, uInvert);   // TD Level → invert: a pale material draws DARK lines on the light theme
  finalColor = vec4(m * w, w);
}`;

// ECHO — the last loop frame advected by the flow: what was at (p − flow) is what the trail should show at p
const ECHO_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uFlow;
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform float uMax;
uniform float uFlowScale;
void main() {
  vec2 f = (texture(uFlow, vTextureCoord).xy - 0.5) * 2.0 * uMax * uFlowScale;
  finalColor = texture(uTexture, clamp(vTextureCoord - f * uInputSize.zw, uInputClamp.xy, uInputClamp.zw));
}`;

const FLOW_RES = 0.25;   // the flow pass at a quarter of the CSS resolution — enough for a hand's motion, 1/16 of the pixels
const FLOW_MAX = 6;      // low-res px per frame the flow may report (24 CSS px per frame ≈ a fast pan)

export async function createGraph(P, app, opts = {}) {
  const loadTex = opts.loadTex || ((url) => P.Assets.load(url));
  const out = new P.Container();                   // on the stage; the post chain applies here
  // BASE: the camera as it is
  const base = new P.Sprite(P.Texture.EMPTY); base.anchor.set(0.5);
  const drain = new P.ColorMatrixFilter();
  // the camera copied into full-frame RTs: camRT at the pass resolution, lumaRT (pair) at the flow's
  const camSrc = new P.Sprite(P.Texture.EMPTY); camSrc.anchor.set(0.5);
  const white = P.Texture.WHITE.source;
  const mk = (frag, resources) => P.Filter.from({ gl: { vertex: FILTER_VERT, fragment: frag }, resources, resolution: "inherit" });
  const f32 = (v) => ({ value: v, type: "f32" });
  const v2 = (x, y) => ({ value: new P.Point(x, y), type: "vec2<f32>" });
  // FLOW pass: a sprite of the current luma, filtered against the previous luma and the previous flow
  const flowSpr = new P.Sprite(P.Texture.EMPTY);
  const flow = mk(FLOW_FRAG, { flowU: { uMax: f32(FLOW_MAX) }, uPrevLuma: white, uPrevLumaSampler: white.style, uPrevFlow: white, uPrevFlowSampler: white.style });
  flowSpr.filters = [flow];
  // ANCHOR pass: a sprite of the previous anchor, advected
  const anchorSpr = new P.Sprite(P.Texture.EMPTY);
  const anchor = mk(ANCHOR_FRAG, { anchorU: { uMax: f32(FLOW_MAX), uFlowScale: f32(4), uPeriod: f32(256), uDrift: v2(0, 0) }, uFlow: white, uFlowSampler: white.style });
  anchorSpr.filters = [anchor];
  // TRACE pass: a sprite of camRT, traced and hatched with the anchored material
  const traced = new P.Sprite(P.Texture.EMPTY);
  const trace = mk(TRACE_FRAG, {
    traceU: { uStrength: f32(2), uStep: f32(1), uFloor: f32(0.15), uPeriod: f32(256), uInvert: f32(0), uShade: f32(0), uShadeOn: f32(0), uShadeBand: v2(0.35, 0.75) },
    uMatTexture: white, uMatSampler: white.style, uAnchor: white, uAnchorSampler: white.style,
  });
  traced.filters = [trace];
  // LOOP pass: the echo (advected, faded, zoomed, turned) under the fresh trace
  const loop = new P.Container();
  const echo = new P.Sprite(P.Texture.EMPTY); echo.anchor.set(0.5);
  const echoF = mk(ECHO_FRAG, { echoU: { uMax: f32(FLOW_MAX), uFlowScale: f32(4) }, uFlow: white, uFlowSampler: white.style });
  const fresh = new P.Sprite(P.Texture.EMPTY);
  loop.addChild(echo, fresh);
  // OUT: base, the loop over it
  const view = new P.Sprite(P.Texture.EMPTY); view.blendMode = "add";
  out.addChild(base, view);
  const textures = new Map(), blank = new P.Container();
  let rt = null, size = { w: 0, h: 0, r: 1 }, flip = 0, mirror = false, preset = null, time = 0, running = false;
  const drift = { x: 0, y: 0 };

  const W = () => app.screen.width, H = () => app.screen.height;
  const ensure = () => {
    const w = W(), h = H(), r = Math.min(preset?.detail || 1, app.renderer.resolution);
    if (size.w === w && size.h === h && size.r === r && rt) return;
    size = { w, h, r };
    if (rt) for (const t of Object.values(rt).flat()) t.destroy(true);
    const R = (res) => P.RenderTexture.create({ width: w, height: h, resolution: res });
    rt = { cam: R(r), luma: [R(FLOW_RES), R(FLOW_RES)], flow: [R(FLOW_RES), R(FLOW_RES)], anchor: [R(r), R(r)], lines: R(r), loop: [R(r), R(r)] };
    flip = 0; running = false;
    // every full-frame RT is w×h in CSS units whatever its resolution: its sprite needs no scale, only (0,0)
    for (const s of [flowSpr, anchorSpr, traced, fresh, view]) s.position.set(0, 0);
    echo.position.set(w / 2, h / 2); echo.filters = [echoF];
    const fs = r / FLOW_RES;   // low-res flow px → px of a detail-res pass
    anchor.resources.anchorU.uniforms.uFlowScale = fs; echoF.resources.echoU.uniforms.uFlowScale = fs;
    fitCam();
  };
  const fitCam = () => {
    const tw = base.texture.width, th = base.texture.height, w = W(), h = H();
    if (!(tw > 1 && th > 1)) return;
    const k = Math.max(w / tw, h / th);
    for (const s of [base, camSrc]) { s.scale.set(k * (mirror ? -1 : 1), k); s.position.set(w / 2, h / 2); }
  };
  const tex = async (name) => {
    if (!name) return null;
    if (!textures.has(name)) textures.set(name, loadTex(name));
    return textures.get(name);
  };
  const bind = (filter, name, src) => { filter.resources[name] = src; filter.resources[`${name}Sampler`] = src.style; };
  const period = (p, src) => Math.max(8, src.width * (p.lines?.scale || 0.25));

  return {
    out,
    /** The picture: a video or still texture, mirrored for the front camera. */
    setSource(texture, mirrored) { base.texture = texture; camSrc.texture = texture; mirror = !!mirrored; fitCam(); },
    /** Apply a preset's graph (`tex`, `edge`, `lines`, `shade`, `echo`, `base`) — the post chain is the caller's. */
    async setPreset(p, textureUrlOf) {
      preset = p;
      const t = p.tex ? await tex(textureUrlOf(p.tex)) : null;
      if (preset !== p) return;   // a newer preset landed while the texture loaded
      const src = t ? t.source : white, per = period(p, src);
      const u = trace.resources.traceU.uniforms;
      u.uStrength = p.edge?.strength ?? 2; u.uStep = p.edge?.step ?? 1; u.uFloor = p.edge?.floor ?? 0.15;
      u.uPeriod = per; u.uInvert = p.lines?.invert ? 1 : 0;
      u.uShade = p.shade?.amount ?? 0; u.uShadeOn = p.shade?.on === "light" ? 1 : 0;
      u.uShadeBand.set(p.shade?.band?.[0] ?? 0.35, p.shade?.band?.[1] ?? 0.75);
      bind(trace, "uMatTexture", src);
      anchor.resources.anchorU.uniforms.uPeriod = per;
      fresh.alpha = p.lines?.alpha ?? 0.7;
      echo.visible = !!p.echo;
      base.tint = p.base?.dim != null ? Math.round(p.base.dim * 255) * 0x010101 : (p.base?.tint ?? 0xffffff);
      drain.reset(); if (p.base?.sat) drain.saturate(p.base.sat, false);
      base.filters = p.base?.sat ? [drain] : null;
      view.blendMode = p.lines?.blend || "add";
      running = false;   // the loop's memory belongs to the old material: restart it on the next frame
    },
    /** One frame: copy, flow, anchor, trace, echo, loop, show. */
    tick(dt) {
      ensure();
      const p = preset; if (!p || !(base.texture.width > 1)) return;
      time += dt;
      const R = rt, cur = flip, prev = 1 - flip, render = (container, target, clearColor) => app.renderer.render({ container, target, clear: true, clearColor });
      // the camera into its frames
      render(camSrc, R.cam); render(camSrc, R.luma[cur]);
      if (!running) {   // a fresh start: last = now, no flow (0.5 grey IS zero), phase 0, empty trail
        render(camSrc, R.luma[prev]);
        render(blank, R.flow[prev], [0.5, 0.5, 0, 1]); render(blank, R.anchor[prev], [0, 0, 0, 1]); render(blank, R.loop[prev], [0, 0, 0, 0]);
        running = true;
      }
      // FLOW
      flowSpr.texture = R.luma[cur]; bind(flow, "uPrevLuma", R.luma[prev].source); bind(flow, "uPrevFlow", R.flow[prev].source);
      render(flowSpr, R.flow[cur]);
      // ANCHOR
      const k = p.lines?.tempo ?? 1, sp = p.lines?.speed || [0, 0], per = anchor.resources.anchorU.uniforms.uPeriod;
      drift.x = sp[0] * k * dt / per; drift.y = sp[1] * k * dt / per;
      anchor.resources.anchorU.uniforms.uDrift.set(drift.x, drift.y);
      anchorSpr.texture = R.anchor[prev]; bind(anchor, "uFlow", R.flow[cur].source);
      render(anchorSpr, R.anchor[cur]);
      // TRACE
      traced.texture = R.cam; bind(trace, "uAnchor", R.anchor[cur].source);
      if (p.lines?.breathe) fresh.alpha = (p.lines.alpha ?? 0.7) * (1 + p.lines.breathe * Math.sin(time * (p.lines.rate || 0.8)));
      render(traced, R.lines);
      fresh.texture = R.lines;
      // ECHO + LOOP
      if (p.echo) {
        echo.texture = R.loop[prev]; bind(echoF, "uFlow", R.flow[cur].source);
        echo.alpha = p.echo.decay ?? 0.9;
        const z = p.echo.zoom ?? 1; echo.scale.set(z, z);
        echo.rotation = p.echo.rot ?? 0;
      }
      render(loop, R.loop[cur]);
      view.texture = R.loop[cur];
      flip = prev;
    },
    destroy() {
      if (rt) for (const t of Object.values(rt).flat()) t.destroy(true);
      out.destroy({ children: true }); loop.destroy({ children: true });
      for (const s of [camSrc, flowSpr, anchorSpr, traced]) s.destroy();
    },
  };
}
