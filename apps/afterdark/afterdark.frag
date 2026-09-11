#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// afterdark — the rave stage (GLSL ES 3.00, mounted by /_rt/glstage.js). A DARK-COMMITTED night scene:
// haze, sweeping laser beams, a strobe and crowd silhouettes on near-black, with a chroma-keyed dancer
// composited over it and driven by the stream's beat. THEME-INDEPENDENT: a rave is dark by nature (the DOM
// controls are dark-glass), so `env.x` (the theme channel) is deliberately IGNORED — the stage never lightens.
//
//   vary.x  pulse       0..1  the kick — strobe, bloom, the dancer's squash/jump/glow
//   vary.y  dancePhase  s     integrated groove phase (bob/sway/tilt sines)
//   vary.z  scenePhase  s     integrated scene drift (beams sweep, haze flows)
//   vary.w  girlFade    0..1  cross-fade when the dancer is swapped (0 = no dancer)
//   ink.xy  parallax          tilt vector (DeviceOrientation / pointer / auto), displaces the sprite by depth
//   cam                       the dancer sprite (unit 1, full-res RGBA, real alpha from the depth matte)
//   camAspect x=w/h, y=bound  the sprite aspect + a flag (1 once a frame is bound)
//   tex2                      the dancer's DEPTH map (unit 2), near=white — parallax displacement
//   tex2Aspect x=w/h, y=bound
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform sampler2D cam; uniform vec2 camAspect;
uniform sampler2D tex2; uniform vec2 tex2Aspect;

const float TAU = 6.2831853;
const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
// the rave palette, on near-black
const vec3 STROBE = vec3(1.00, 0.24, 0.71);   // #FF3EB5 magenta
const vec3 LASER  = vec3(0.22, 1.00, 0.42);   // #39FF6A green
const vec3 SODIUM = vec3(0.96, 0.73, 0.26);   // #F5B942 haze
const vec3 BG_TOP = vec3(0.039, 0.020, 0.063);// #0A0510-ish
const vec3 BG_BOT = vec3(0.008, 0.004, 0.014);

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0 - uv.y;             // top-down, like the DOM
  float aspect = res.x/max(res.y, 1.0);
  vec2 p = (uv-0.5)*vec2(aspect, 1.0);                          // p-unit = frame height, centred
  float pulse = clamp(vary.x, 0.0, 1.0);
  float dph = vary.y, sph = vary.z;
  float girl = clamp(vary.w, 0.0, 1.0);

  // ── the night: a vertical gradient with a faint radial glow where the dancer stands ────────────────
  vec3 col = mix(BG_BOT, BG_TOP, smoothstep(1.0, 0.0, uv.y));
  float haze = fbm(vec2(p.x*1.3, p.y*1.8 - sph*0.25) + seed*5.0);
  col += SODIUM * (0.030 + 0.05*haze) * smoothstep(1.0, 0.15, uv.y) * (0.6 + 0.5*haze);

  // ── laser beams: thin additive rays from above centre, sweeping on scenePhase, pulsing on the kick ──
  vec2 src = vec2(0.0, -0.62);                                  // origin above the top edge
  vec2 dir = p - src;
  float ang = atan(dir.x, dir.y);                              // 0 = straight down
  float rad = length(dir);
  float beams = 0.0;
  for (int i = 0; i < 5; i++){
    float fi = float(i);
    float a = (fi - 2.0) * 0.30 + sin(sph*0.8 + fi*1.7) * 0.28;// spread + sweep
    float w = 0.014 + 0.004*sin(sph + fi);
    float b = smoothstep(w, 0.0, abs(ang - a));
    b *= smoothstep(1.5, 0.15, rad);                           // fade with distance
    beams += b * (0.5 + 0.9*pulse);
  }
  vec3 beamCol = mix(LASER, STROBE, 0.5 + 0.5*sin(sph*0.5));
  col += beamCol * beams * 0.42;

  // ── crowd silhouettes along the bottom (heads bobbing on the beat) ─────────────────────────────────
  float horizon = 0.9;
  if (uv.y > horizon){
    float x = uv.x*aspect*7.0;
    float heads = 0.0;
    for (int i = 0; i < 3; i++){
      float o = float(i)*2.13;
      float hx = x + o;
      float top = horizon + 0.055 - 0.018*abs(sin(hx)) - 0.010*pulse*sin(hx*1.3 + dph*3.0);
      heads = max(heads, step(top, uv.y) * (0.6 + 0.4*hash(vec2(floor(hx), o))));
    }
    col = mix(col, BG_BOT*0.5, heads*0.9);                     // dark bodies against the light floor haze
  }

  // ── bloom behind the dancer on the kick ────────────────────────────────────────────────────────────
  float d2 = length((p - vec2(0.0, 0.05))*vec2(1.1, 0.9));
  col += STROBE * pulse * exp(-d2*d2*5.0) * 0.30 * girl;

  // ── the dancer: sprite anchored feet-at-bottom-centre, beat-driven procedural dance + depth parallax ─
  if (camAspect.y > 0.5 && girl > 0.001){
    float sA = max(camAspect.x, 1e-3);                         // sprite w/h
    float gh = 0.86;                                           // dancer height, fraction of screen
    float gw = gh * sA / aspect;                               // width in screen-uv
    // procedural dance, anchored at the FEET (bottom-centre): volume-conserving squash/stretch on the kick
    float bob  = sin(dph*TAU)*0.009;
    float sway = sin(dph*TAU*0.5)*0.013;
    float tilt = sin(dph*TAU*0.5)*0.045;
    float jump = pulse*0.030;
    float sX = 1.0 + pulse*0.09;
    float sY = 1.0 - pulse*0.09;
    float sc = 1.0 + pulse*0.05;
    vec2 feet = vec2(0.5 + sway, 0.992 - bob - jump);
    vec2 rel = uv - feet;
    float cs = cos(-tilt), sn = sin(-tilt);
    rel = mat2(cs, -sn, sn, cs) * rel;
    vec2 sUV;
    sUV.x = rel.x / (gw*sc*sX) + 0.5;
    sUV.y = rel.y / (gh*sc*sY) + 1.0;                          // feet at sUV.y=1, head near 0
    if (sUV.x > 0.001 && sUV.x < 0.999 && sUV.y > 0.001 && sUV.y < 0.999){
      float dep = (tex2Aspect.y > 0.5) ? texture(tex2, sUV).r : 0.5;
      vec2 pUV = sUV + ink.xy * (dep - 0.35) * 0.05;           // near parts (white) shift more on tilt
      pUV = clamp(pUV, 0.0005, 0.9995);
      vec4 spr = texture(cam, pUV);
      float a = spr.a * girl;
      // spill suppression: on the fringe, pull any magenta cast toward its own luma so no pink halo survives
      float sp = clamp(spr.r - max(spr.g, spr.b), 0.0, 1.0);
      vec3 srgb = mix(spr.rgb, vec3(luma(spr.rgb)), sp * (1.0 - a) * 0.8);
      // a faint accent rim so the lasers seem to catch her edge on the kick
      float edge = smoothstep(0.35, 0.0, a) * step(0.02, a);
      col = mix(col, srgb, a);
      col += beamCol * edge * pulse * 0.25;
    }
  }

  // ── strobe: a subtle full-frame flash on the hardest kicks (kept low so glass controls stay legible) ─
  col += vec3(1.0) * smoothstep(0.7, 1.0, pulse) * 0.10;

  // vignette + dither
  float vig = 1.0 - 0.35*smoothstep(0.5, 1.25, length(p*vec2(0.8, 1.0)));
  col *= vig;
  col += (hash(gl_FragCoord.xy + fract(time)) - 0.5) * (1.5/255.0);
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
