#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// afterdark — the rave stage (GLSL ES 3.00, mounted by /_rt/glstage.js). A DARK-COMMITTED night scene:
// haze, moving-head laser beams, projector cones, a strobe and crowd silhouettes on near-black, driven by
// the stream's beat CLOCK (not just its loudness). THEME-INDEPENDENT: a rave is dark by nature (the DOM
// controls are dark-glass), so `env.x` (the theme channel) is deliberately IGNORED — the stage never lightens.
// The 3D girls dance on a Three.js canvas OVER this field; the reactive dancefloor grid lives there too.
//
//   vary.x  pulse       0..1  the kick transient — strobe, bloom, beam punch
//   vary.y  dancePhase  beats integrated groove phase (follows the locked tempo)
//   vary.z  scenePhase  s     integrated scene drift (beams sweep, haze flows)
//   vary.w  strobe      0..1  how hard the beat may STROBE the room (clock confidence × drive; 0 on idle)
//   ink.xy  parallax          tilt vector (DeviceOrientation / pointer / auto), shifts the fixtures by depth
//   ink.z   beatPhase   0..1  ANTICIPATED beat phase (0 = on the beat) — beam brightness, cone snap
//   ink.w   barPhase    0..1  ANTICIPATED bar phase — the downbeat slam, colour cycling
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;

const float TAU = 6.2831853;
const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
// the rave palette, on near-black: cool beams (magenta/violet/green) in warm sodium haze — a club, not a gamer RGB
const vec3 STROBE = vec3(1.00, 0.24, 0.71);   // #FF3EB5 magenta
const vec3 LASER  = vec3(0.22, 1.00, 0.42);   // #39FF6A green
const vec3 VIOLET = vec3(0.55, 0.36, 0.96);   // #8B5CF6 bridge
const vec3 SODIUM = vec3(0.96, 0.73, 0.26);   // #F5B942 haze
const vec3 BG_TOP = vec3(0.039, 0.020, 0.063);// #0A0510-ish
const vec3 BG_BOT = vec3(0.008, 0.004, 0.014);

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
// capsule SDF (iq): distance from p to the segment a–b
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0); return length(pa-ba*h); }
// the discrete brand ramp, cycled on the bar: magenta → violet → green → gold
vec3 ravePalette(float t){
  float k = fract(t)*4.0; int i = int(floor(k)); float f = smoothstep(0.0, 1.0, fract(k));
  vec3 a = i==0 ? STROBE : i==1 ? VIOLET : i==2 ? LASER : SODIUM;
  vec3 b = i==0 ? VIOLET : i==1 ? LASER : i==2 ? SODIUM : STROBE;
  return mix(a, b, f);
}
// interleaved-gradient noise (Jimenez): an animated dither that kills OLED banding on the near-black
float ign(vec2 p){ return fract(52.9829189*fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0 - uv.y;             // top-down, like the DOM
  float aspect = res.x/max(res.y, 1.0);
  vec2 p = (uv-0.5)*vec2(aspect, 1.0);                          // p-unit = frame height, centred
  float pulse = clamp(vary.x, 0.0, 1.0);
  float dph = vary.y, sph = vary.z;
  float strobeAmt = clamp(vary.w, 0.0, 1.0);
  float beatPh = fract(ink.z), barPh = fract(ink.w);
  // the clock's envelopes: a sharp beat, a slower bar (the downbeat slam); the kick transient rides on top
  float beatEnv = exp(-beatPh*5.0);
  float barEnv  = exp(-barPh*3.0);
  float hit  = max(pulse, beatEnv*0.85);
  float slam = max(pulse, barEnv);

  // ── the night: a vertical gradient + sodium haze flowing down (warm, so the cool beams read as beams) ────
  vec3 col = mix(BG_BOT, BG_TOP, smoothstep(1.0, 0.0, uv.y));
  float haze = fbm(vec2(p.x*1.3, p.y*1.8 - sph*0.25) + seed*5.0);
  col += SODIUM * (0.030 + 0.05*haze) * smoothstep(1.0, 0.15, uv.y) * (0.6 + 0.5*haze);

  // ── moving-head lasers: 6 capsule beams from discrete fixtures on a top rail, pattern by scene (fan /
  //    cross / cone), brightness on the beat, haze-coupled (a beam is only visible IN the haze) ─────────────
  vec2 par = ink.xy * 0.04;                                      // the rail shifts with the parallax (it is far)
  float pattern = floor(mod(sph*0.1, 3.0));                     // 0 fan · 1 cross · 2 cone — changes every ~30 s
  vec3 beams = vec3(0.0);
  for (int i = 0; i < 6; i++){
    float fi = float(i);
    float x0 = (fi - 2.5) * 0.24;                                // the fixture's place on the rail
    vec2 src = vec2(x0 + par.x, -0.56 + par.y);
    float base = pattern < 0.5 ? (fi - 2.5)*0.22 : pattern < 1.5 ? -(fi - 2.5)*0.34 : (fi - 2.5)*0.06;
    float ang = base + sin(sph*0.9 + fi*1.7)*0.30 + sin(dph*TAU*0.125 + fi)*0.08;   // sweep + a slow bar wobble
    vec2 dir = vec2(sin(ang), cos(ang));
    vec2 dst = src + dir*2.2;
    float d = sdSeg(p, src, dst);
    float w = 0.0035 + 0.002*sin(sph + fi);
    float core = smoothstep(w*2.0, 0.0, d);
    float glow = 0.008 + 0.008*hit;
    float g = glow*glow/(glow*glow + d*d);
    float along = clamp(dot(p - src, dir)/2.2, 0.0, 1.0);
    float fade = 1.0 - smoothstep(0.35, 1.0, along);            // dies into the far haze
    float bright = (0.35 + 1.3*hit) * fade * (0.45 + 0.9*haze);
    vec3 c = ravePalette(barPh*0.25 + fi*0.11 + floor(sph*0.1)*0.25);
    beams += c * (core*1.2 + g) * bright;
  }
  col += beams * 0.40;

  // ── projector cones: 3 soft wedges from the rail, sweeping, SNAPPING on the downbeat (react = slam) ──────
  vec3 cones = vec3(0.0);
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    vec2 src = vec2((fi - 1.0)*0.55 + par.x, -0.60 + par.y);
    vec2 d = p - src;
    float a = atan(d.x, d.y);                                    // 0 = straight down
    float snap = floor(barPh*4.0 + fi);                         // the axis jumps once a beat, holds in between
    float axis = (fi - 1.0)*0.35 + sin(sph*0.35 + fi*2.1)*0.22 + (fract(snap*0.618)-0.5)*0.3;
    float hw = 0.10 + 0.04*slam;
    float wedge = smoothstep(hw, hw*0.15, abs(a - axis));
    float rad = length(d);
    wedge *= smoothstep(1.4, 0.15, rad) * smoothstep(0.0, 0.25, rad);
    float react = 0.06 + 0.9*slam + 0.5*pulse;
    // a localised strobe on the hardest kicks
    react += smoothstep(0.85, 1.0, pulse) * 0.6 * step(0.5, hash(vec2(fi, floor(time*8.0))));
    cones += ravePalette(barPh*0.25 + 0.5 + fi*0.2) * wedge * react * (0.5 + 0.7*haze);
  }
  col += cones * 0.14;

  // ── crowd silhouettes along the bottom (heads bobbing on the beat) ─────────────────────────────────
  float horizon = 0.9;
  if (uv.y > horizon){
    float x = uv.x*aspect*7.0;
    float heads = 0.0;
    for (int i = 0; i < 3; i++){
      float oo = float(i)*2.13;
      float hx = x + oo;
      float top = horizon + 0.055 - 0.018*abs(sin(hx)) - 0.012*beatEnv*sin(hx*1.3 + dph*TAU*0.5);
      heads = max(heads, step(top, uv.y) * (0.6 + 0.4*hash(vec2(floor(hx), oo))));
    }
    col = mix(col, BG_BOT*0.5, heads*0.9);                     // dark bodies against the light floor haze
  }

  // ── bloom behind the dancers on the kick ───────────────────────────────────────────────────────────
  float d2 = length((p - vec2(0.0, 0.05))*vec2(1.1, 0.9));
  col += ravePalette(barPh*0.25) * hit * exp(-d2*d2*5.0) * 0.26;

  // ── the room in time: a blackout dip before the downbeat, a white STROBE on the beat as the passage
  //    drives (clock-gated by vary.w), plus the old subtle flash on the hardest kicks. Kept low enough that
  //    the glass controls stay legible; the 3D rig over this field does the hard chase. ─────────────────
  float dip = 1.0 - 0.45*strobeAmt*smoothstep(0.86, 1.0, barPh);
  col *= dip;
  col += vec3(1.0) * exp(-beatPh*16.0) * strobeAmt * 0.22;
  col += vec3(1.0) * smoothstep(0.7, 1.0, pulse) * 0.10;

  // highlight soft-knee ABOVE 0.6 only: additive peaks bend instead of washing out the 3D girls + the
  // dark-glass DOM, while the near-black stays black (a curve on the darks turned the club pale)
  col = mix(col, 0.6 + 0.4*(1.0 - exp(-(col - 0.6)/0.4)), step(0.6, col));
  // vignette + animated IGN dither (~2/255)
  float vig = 1.0 - 0.35*smoothstep(0.5, 1.25, length(p*vec2(0.8, 1.0)));
  col *= vig;
  col += (ign(gl_FragCoord.xy + fract(time)*64.0) - 0.5) * (2.0/255.0);
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
