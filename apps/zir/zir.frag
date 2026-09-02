#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// zir — the field (GLSL ES 3.00, mounted by /_rt/glstage.js).
//
// The identity is FOCUS: a lens breathing. The field is the picture's own palette gone soft, and a set of
// wide concentric focus rings that drift out from the middle and TIGHTEN while the pods work — the way a
// lens racks focus — then relax once the enlarged picture has landed. Nothing else moves much: the subject
// is the photo in the stage, the field only says "something is being resolved".
//
//   vary.x  busy     0..1  a job is running — the rings tighten and quicken, the grain lifts
//   vary.y  arrival  0..1  a picture just landed — a bloom that swells and settles (host eases it down)
//   vary.z  facet    0..1  fixed by the app (one mode) — rotates the palette's cross-mix
//   vary.w  ready    0..1  the palette texture is bound; fades the field in / cross-fades a swap
//   env.x   light    0..1  the runtime's theme channel (eased on toggle)
//
// AMPLITUDE BUDGET, in DISPLAY space — a CONTRACT carried from mirage/persona: dark base 0.165 clamped to
// [0.10, 0.32]; light base 0.93 to [0.64, 0.97]. Any string the app puts over the field stays AA.
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink;
uniform vec4 vary;   // x busy, y arrival, z facet, w ready
uniform vec4 env;    // x theme light 0..1
uniform sampler2D tex; uniform vec2 texAspect;

const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0 - uv.y;              // top-down, like the DOM
  float asp = res.x/max(res.y, 1.0);
  vec2 p = vec2(uv.x*asp, uv.y);                                 // square-ish units, so a ring is round
  float lite = clamp(env.x, 0.0, 1.0);
  float busy = clamp(vary.x, 0.0, 1.0);
  float arrive = clamp(vary.y, 0.0, 1.0);
  float facet = clamp(vary.z, 0.0, 1.0);
  float ready = clamp(vary.w, 0.0, 1.0);

  // ── the body: slow, wide, domain-warped — the picture gone soft ─────────────────────────────────────
  vec2 q = p*1.05 + vec2(seed*3.1, -time*0.012);
  float w1 = fbm(q);
  float w2 = fbm(q*1.6 + vec2(w1*0.9, -w1*0.6) + vec2(0.0, time*0.018));
  float body = fbm(q*0.8 + vec2(w2*1.1, w1*0.7));

  // ── the focus rings: concentric, drifting out, tightening under load ────────────────────────────────
  // Centred on the stage's picture (upper-middle), not the screen's: the island holds the bottom. The ring
  // pitch is in p-units (the frame HEIGHT), so at 384×832 ~7 rings show across the height; busy doubles
  // the pitch's speed and narrows each ring, which is what a lens racking focus looks like from the film.
  vec2 c = vec2(asp*0.5, 0.40);
  float d = length(p - c);
  float pitch = mix(0.16, 0.11, busy);
  float phase = d/pitch - time*(0.10 + 0.30*busy) + w1*0.35;
  float ring = 0.5 + 0.5*cos(6.2832*phase);
  ring = pow(ring, mix(1.6, 4.0, busy));                          // wide soft bands at rest, thin bright lines under load
  float reach = 1.0 - smoothstep(0.35, 1.05, d);                  // the rings live near the picture and fade at the edges
  float rings = (ring - 0.35) * reach * (0.55 + 0.45*busy);

  // ── the palette comes from the picture, never from a stock hue ───────────────────────────────────────
  vec2 tuv = clamp(vec2(0.35 + 0.30*body, 0.35 + 0.30*w2), 0.06, 0.94);
  vec3 c1 = texture(tex, tuv).rgb;
  vec3 c2 = texture(tex, clamp(vec2(1.0) - tuv, 0.06, 0.94)).rgb;
  float m = clamp(0.5 + 0.5*sin(6.283*(facet + 0.25*w1)), 0.0, 1.0);
  vec3 pal = mix(c1, c2, m);
  pal = mix(vec3(luma(pal)), pal, mix(0.34, 0.11, lite));          // a tint, not a reproduction
  vec3 neutral = mix(vec3(0.012, 0.012, 0.012), vec3(0.965, 0.957, 0.933), lite);   // the page's bases: #000 / #F6F4EE
  vec3 col = mix(neutral, pal, ready*0.85);

  // ── arrival: a bloom from the picture's centre that settles ──────────────────────────────────────────
  float bloom = arrive * exp(-d*d*(2.2 + 6.0*(1.0-arrive))) * 0.35;

  // ── grain: fine, lifting under load ──────────────────────────────────────────────────────────────────
  float grain = (hash(gl_FragCoord.xy + fract(time)*137.0) - 0.5) * (0.010 + 0.028*busy);

  // ── the amplitude contract ───────────────────────────────────────────────────────────────────────────
  float base = mix(0.165, 0.93, lite);
  float lo = mix(0.10, 0.64, lite), hi = mix(0.32, 0.97, lite);
  float shade = base
    + (body - 0.5)*mix(0.19, 0.17, lite)
    + rings*mix(0.10, 0.09, lite)
    + bloom + grain;
  float target = clamp(shade, lo, hi);
  float l = max(luma(col), 1e-3);
  col *= target / l;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
