#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// poholos — the field of who is within earshot (GLSL ES 3.00, mounted by /_rt/glstage.js).
//
// It shows PRESENCE and IDENTITY, never place. The bridge gives a peer exactly `{peerID, nick}` — no
// hops, no RSSI, no timestamp — so a radar with range rings would be invented data. Each node sits at a
// STABLE point derived from the hash of its peerID: the same person is always the same point, and the
// point means nothing about distance or direction. The copy says so on screen.
//
//   vary.x  presence  0..1  eased peerCount/6 — how inhabited the field is
//   vary.y  scan      s     sweep phase, INTEGRATED in JS (never time*energy: that jerks the whole field)
//   vary.z  pulse     0..1  decaying energy of the last event — a ripple
//   vary.w  alone     0..1  1 = nobody here; carries the field from "searching" to "inhabited"
//   ink.rgb           the app accent in display space
//   env.x   light     0..1  the runtime's theme channel (eased on toggle)
//
// AMPLITUDE BUDGET, in DISPLAY space: dark base -> clamped to [0.10, 0.32], light base -> [0.64, 0.97].
// persona measured >= 4.5:1 for base-content at these clamps, and the room's strings sit over this field.
// Move the clamps and you move a contrast floor.
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;

// the kit's moving set (core 1.2.49): xy = the point from the peerID hash, z = 1 when the slot is live,
// w = the node's own phase. The array size is compiled in, so it is 8 whatever pointCount says.
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
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  float r = length(uv);

  float presence = clamp(vary.x, 0.0, 1.0);
  float scan = vary.y;
  float pulse = clamp(vary.z, 0.0, 1.0);
  float alone = clamp(vary.w, 0.0, 1.0);

  // ---- the sweep: rings travelling outward, TWO of them half a period apart so one is always on screen —
  // a single ring spends most of its life past the edge and the field reads as fog between passes.
  float period = mix(3.0, 4.6, presence);
  float ring = 0.0;
  for (int k = 0; k < 2; k++) {
    float ringR = fract(scan / period + float(k) * 0.5) * 1.3;
    float band = 1.0 - smoothstep(0.0, 0.028, abs(r - ringR));   // thin: a line, not a haze
    band *= 1.0 - smoothstep(0.10, 1.20, ringR);                 // born at the centre, spent at the edge
    ring += band;
  }
  ring *= mix(0.55, 1.0, alone);

  // ---- the ground: fine domain-warped fbm. It is TEXTURE, not subject — at the low frequencies this
  // started with, the whole screen became one slow blob and the sweep drowned in it.
  vec2 w = vec2(fbm(uv * 4.5 + vec2(0.0, time * 0.05) + seed),
                fbm(uv * 4.5 - vec2(time * 0.04, 0.0) - seed));
  float ground = fbm(uv * 7.0 + w * 0.5);

  // ---- the nodes: one stable well per peer, breathing on its own phase
  float wells = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= pointCount) break;
    vec4 n = points[i];
    float d = length(uv - n.xy);
    float breathe = 0.5 + 0.5 * sin(time * 1.1 + n.w * 6.2831);
    float core = 1.0 - smoothstep(0.0, 0.085 + 0.02 * breathe, d);
    float halo = 1.0 - smoothstep(0.0, 0.42, d);
    wells += n.z * (core * 0.9 + halo * halo * 0.30);
  }
  wells = clamp(wells, 0.0, 1.6);

  // ---- the event ripple: one expanding ring from the middle when something happened
  float pr = (1.0 - pulse) * 0.9;
  float ripple = (1.0 - smoothstep(0.0, 0.07, abs(r - pr))) * pulse;

  // The sweep is the app WORKING, so it has to read as a line, not a haze: it carries more than the ground
  // and the ground stays a texture under it. A vignette that reached 0.75 pulled the top of the screen to
  // near-black, and the chrome's islands are opaque black — measured rgb(0,0,0) — so they vanished into it.
  // The field must stay a surface the glass can sit ON.
  // Only what MEANS something is bright: the sweep (the radio listening), the wells (who is here), the
  // ripple (something happened). The ground is a whisper under them — a field where everything glows is a
  // field that says nothing, and the glass chrome sits on its own layer above, so it needs no help here.
  float energy = ground * (0.09 + 0.07 * presence) + ring * 0.95 + wells * 0.85 + ripple * 0.80;
  energy *= 1.0 - smoothstep(0.55, 1.45, r) * 0.35;

  // ---- display space, then the clamp that protects the text over it
  float light = clamp(env.x, 0.0, 1.0);
  vec3 base = mix(vec3(0.055, 0.05, 0.07), vec3(0.955, 0.95, 0.94), light);
  vec3 col = base + ink.rgb * energy * mix(0.85, 0.55, light);

  float lo = mix(0.10, 0.64, light);
  float hi = mix(0.32, 0.97, light);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float want = clamp(lum, lo, hi);
  col *= lum > 0.0001 ? want / lum : 1.0;

  o = vec4(col, 1.0);
}
