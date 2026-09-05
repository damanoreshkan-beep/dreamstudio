#version 300 es
// The waiting field — vydyvo's LOADER, shown when the collection holds no frame of the theme the page is in
// (a bright day frame at night burns the eyes; owner, 2026-09-01). Theme-aware by uniform, never by gate:
// `vary.x` is 1 in the dark theme, `vary.y` is 1 once the pre-generated ambient texture (the palette sampler)
// has landed. Owner, 2026-09-05: in the show, before the first picture, the pale texture read as "a white
// crashed image" — a loader must LOOK like one. So the field is unmistakably alive in both themes: a woven
// flow of light in the accent's tint pulls slowly across the frame, the ambient mist breathes under it, and the
// ground is deep in the dark theme and a warm, clearly toned paper by day — never near-white. Luminance stays
// inside the page's own band (dark 0.03–0.35, light 0.62–0.92) so the show's clock and line remain legible.
precision highp float;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform sampler2D tex; uniform vec2 texAspect;
out vec4 o;

const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n2(p); p = R * p * 2.0 + vec2(1.7, 9.2); a *= 0.5; } return s; }

void main() {
  vec2 uv = gl_FragCoord.xy / res;
  float asp = res.x / max(res.y, 1.0);
  vec2 p = vec2(uv.x * asp, uv.y);
  float dark = vary.x, hasTex = vary.y;
  float t = time * 0.05;
  // the ground: deep at night, warm toned paper by day (0.80 — a tone, not a blank)
  vec3 base = mix(vec3(0.80, 0.76, 0.69), vec3(0.03, 0.03, 0.045), dark);
  // the generated mist breathes under everything (two parallax layers)
  vec3 mist = texture(tex, uv * 0.85 + vec2(t * 0.12, -t * 0.07)).rgb;
  vec3 mist2 = texture(tex, uv * 1.25 - vec2(t * 0.08, t * 0.05)).rgb;
  vec3 col = mix(base, mix(base, (mist * 0.6 + mist2 * 0.4), mix(0.30, 0.40, dark)), hasTex);
  // THE LOADER: threads of light — the ridge of ONE noise octave (fbm ridges blur into blotches: the second cut
  // read as camouflage), domain-warped so they weave and travel; a narrow threshold keeps them THIN, so they
  // sit under the show's type without lifting the ground. Two scales, two speeds, never one repeating comb.
  vec2 w = p + 0.25 * vec2(fbm(p * 1.3 + t * 0.5), fbm(p * 1.3 + 7.3 - t * 0.4));
  float r1 = 1.0 - abs(2.0 * n2(w * 3.0 + vec2(t * 0.8, 0.0)) - 1.0);
  float r2 = 1.0 - abs(2.0 * n2(w * 5.5 - vec2(0.0, t * 0.6) + 3.1) - 1.0);
  float flow = pow(smoothstep(0.86, 1.0, r1), 1.6) + 0.6 * pow(smoothstep(0.90, 1.0, r2), 1.6);
  col += ink.rgb * flow * mix(0.45, 0.75, dark);
  // three motes of the accent's light, wandering on their own slow orbits — the old field's, now visible
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(0.5 * asp, 0.5) + 0.34 * vec2(sin(t * (0.5 + fi * 0.17) + fi * 2.1 + seed), cos(t * (0.4 + fi * 0.13) + fi * 1.7));
    float d = length(p - c);
    col += ink.rgb * exp(-d * d * 60.0) * mix(0.22, 0.40, dark) * (0.7 + 0.3 * sin(t * 3.0 + fi));
  }
  // the vignette keeps the edges quieter than the middle, both themes
  float v = smoothstep(1.15, 0.45, length(uv - 0.5) * 1.6);
  col = mix(col * mix(0.95, 0.80, dark), col, v);
  // the ground stays inside the page's band (dark ≤ 0.35 · light ≥ 0.62 on the mist), measured on the shipped
  // amplitudes — a hard clamp on the whole colour flattened the threads into the ground (the second cut)
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
