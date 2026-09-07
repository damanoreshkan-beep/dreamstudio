#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// poholos — the field of who is within earshot (GLSL ES 3.00, mounted by /_rt/glstage.js).
//
// It shows PRESENCE and IDENTITY, never place. The bridge gives a peer exactly `{peerID, nick}` — no
// hops, no RSSI, no timestamp — so a radar with range rings would be invented data. Each node sits at a
// STABLE point derived from the hash of its peerID: the same person is always the same point, and the
// point means nothing about distance or direction.
//
//   vary.x  presence  0..1  eased peerCount/6 — how inhabited the field is
//   vary.y  scan      s     sweep phase, INTEGRATED in JS (never time*energy: that jerks the whole field)
//   vary.z  pulse     0..1  decaying energy of the last event — a ripple
//   vary.w  alone     0..1  1 = nobody here; carries the field from "searching" to "inhabited"
//   ink.rgb           the app accent in display space
//   env.x   light     0..1  the runtime's theme channel (eased on toggle)
//
// THE LANGUAGE: hairlines. A sweep is a 1-px line with a short afterglow, a node is a point inside a thin
// ring, the ground is grain. Nothing is a blob. In the dark theme the lines are light on black; in the
// light theme they are INK on paper — the field darkens, because a lighter-than-paper line does not exist.
//
// AMPLITUDE BUDGET, in DISPLAY space: dark base -> clamped to [0.10, 0.32], light base -> [0.64, 0.97].
// persona measured >= 4.5:1 for base-content at these clamps, and the room's strings sit over this field.
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;

// the kit's moving set (core 1.2.49). SLOT 0 IS ME — the origin the sweep and the ripple leave from, with
// z = 0 so it is never drawn as a well. Slots 1.. are the neighbours: xy = the point the page laid out
// (in viewport uv, the same pixels its chip stands on), z = 1, w = the node's own phase. The array size
// is compiled in, so it is 8 whatever pointCount says.
uniform vec4 points[8];
uniform float pointCount;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

// a hairline of width `w` (in uv units) around distance 0, with a soft glow `g` wide behind it
float line(float d, float w, float g) {
  float core = 1.0 - smoothstep(0.0, w, abs(d));
  float glow = (1.0 - smoothstep(0.0, g, abs(d))) * 0.22;
  return core + glow;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  vec2 me = pointCount > 0.0 ? points[0].xy : vec2(0.0);
  float r = length(uv - me);                   // every radius is measured from ME, where the chip says "ти"
  float px = 1.0 / min(res.x, res.y);          // one device pixel in uv units — hairlines are drawn in these

  float presence = clamp(vary.x, 0.0, 1.0);
  float scan = vary.y;
  float pulse = clamp(vary.z, 0.0, 1.0);
  float alone = clamp(vary.w, 0.0, 1.0);

  // ---- the sweep: two hairline rings half a period apart, each with a short afterglow on its inside
  // (the side it came from). Thin means a LINE; the afterglow is what makes it read as travelling.
  float period = mix(3.2, 4.8, presence);
  float ring = 0.0;
  for (int k = 0; k < 2; k++) {
    float ringR = fract(scan / period + float(k) * 0.5) * 1.3;
    float d = r - ringR;
    float core = 1.0 - smoothstep(0.0, 1.4 * px, abs(d));
    float trail = (1.0 - smoothstep(0.0, 0.10, -d)) * step(d, 0.0) * 0.20;   // only inside the ring
    trail *= smoothstep(0.08, 0.30, ringR);                                   // a newborn ring has no wake yet — else it reads as a disc
    float life = 1.0 - smoothstep(0.10, 1.20, ringR);                         // born at the centre, spent at the edge
    ring += (core + trail) * life;
  }
  ring *= mix(0.6, 1.0, alone);

  // ---- the ground: fine grain, barely there, so the black is never dead
  vec2 w = vec2(fbm(uv * 5.0 + vec2(0.0, time * 0.04) + seed),
                fbm(uv * 5.0 - vec2(time * 0.03, 0.0) - seed));
  float ground = fbm(uv * 9.0 + w * 0.4);

  // ---- the nodes: a point, a thin presence ring that breathes, and a wide faint halo
  float wells = 0.0;
  for (int i = 1; i < 8; i++) {                 // from 1: slot 0 is me
    if (float(i) >= pointCount) break;
    vec4 n = points[i];
    float d = length(uv - n.xy);
    float breathe = 0.5 + 0.5 * sin(time * 0.9 + n.w * 6.2831);
    float dot_ = 1.0 - smoothstep(0.0, 2.2 * px, d - 0.010);
    float ringR = 0.055 + 0.012 * breathe;
    float pring = line(d - ringR, 1.2 * px, 0.02) * 0.9;
    float halo = pow(1.0 - smoothstep(0.0, 0.34, d), 2.0) * 0.28;
    wells += n.z * (dot_ + pring + halo);
  }
  wells = clamp(wells, 0.0, 1.8);

  // ---- the event ripple: one hairline ring leaving the centre when something happened
  float pr = (1.0 - pulse) * 0.95;
  float ripple = line(r - pr, 1.4 * px, 0.05) * pulse;

  float energy = ground * (0.06 + 0.05 * presence) + ring * 0.95 + wells * 0.9 + ripple * 0.85;
  energy *= 1.0 - smoothstep(0.60, 1.45, r) * 0.30;
  energy = clamp(energy, 0.0, 1.4);

  // ---- display space. Dark: light lines on black. Light: ink on paper — the field DARKENS.
  float light = clamp(env.x, 0.0, 1.0);
  vec3 baseDark = vec3(0.055, 0.05, 0.07);
  vec3 basePaper = vec3(0.960, 0.952, 0.938);
  vec3 onDark = baseDark + ink.rgb * energy * 0.85;
  vec3 inkDeep = ink.rgb * vec3(0.62, 0.50, 0.30);          // the accent driven towards a deep amber ink
  vec3 onPaper = basePaper - (basePaper - inkDeep) * energy * 0.75;
  vec3 col = mix(onDark, onPaper, light);

  float lo = mix(0.10, 0.64, light);
  float hi = mix(0.32, 0.97, light);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float want = clamp(lum, lo, hi);
  col *= lum > 0.0001 ? want / lum : 1.0;

  o = vec4(col, 1.0);
}
