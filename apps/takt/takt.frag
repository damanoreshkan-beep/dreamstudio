#version 300 es
// takt — the field under the play button (GLSL ES 3.00, mounted by /_rt/glstage.js). Five families, one
// shown at a time, the next dissolving in as blocks on the beat grid (rt/takt.js decides when).
//   vary.x pulse 0..1 (kick envelope) · vary.y beat phase · vary.z bar phase · vary.w A→B dissolve 0..1
//   ink.x family A · ink.y family B · ink.z drive 0..1 (slow energy) · ink.w flash 0..1 (decays after a drop)
//   points[0] A look: scale, warp, sym, quant · points[1] A palette: hue, spread, sat, contrast
//   points[2]/[3] the same for B · points[4]: zoom, spin, phrase 0..1, bar 0..7 · points[5].x: beat count
//   env.x the runtime's theme lightness 0..1
// RULE: smoothstep(lo, hi, x) only with lo < hi — a reversed pair is undefined in GLSL ES (SwiftShader inverts it).
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform vec4 points[8]; uniform float pointCount;
const float TAU = 6.2831853;
const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
vec2 hash2(vec2 p){ float h = hash(p); return vec2(h, hash(p + h + 7.1)); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float fbm3(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
vec3 hsv(float h, float s, float v){ vec3 k = abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0))*6.0 - 3.0); return v*mix(vec3(1.0), clamp(k - 1.0, 0.0, 1.0), s); }
// Two neon hues per look (P: hue, spread, sat, contrast): the value walks from the first to the second.
vec3 pal(float t, vec4 P){ vec3 a = hsv(P.x, P.z, 1.0), b = hsv(P.x + 0.25 + P.y, P.z, 1.0); return mix(a, b, smoothstep(0.3, 0.9, t)); }
float quant(float v, float n){ return floor(v*n + 0.5)/n; }
vec2 fold(vec2 p, float n){ float seg = TAU/n; float a = atan(p.y, p.x); a = mod(a, seg); a = abs(a - seg*0.5); return length(p)*vec2(cos(a), sin(a)); }

// Each family answers with a value 0..1 that the palette turns into colour.
float field(int f, vec2 p, vec4 L, float zoom, float spin, float flick, float beat, float bar, float pulse){
  float s = L.x, w = L.y, n = L.z, q = L.w;
  if (f == 0) {                                                   // FLOW: warped ribbons drifting a quarter-frame per beat
    vec2 d = vec2(zoom*0.35, -zoom*0.2);
    float a = fbm3(p*s + d);
    float b = fbm3(p*s*1.7 + w*2.0*(a-0.5) - d*0.7);
    float v = fbm(p*s + w*3.0*(b-0.5) + d*0.3);
    float vein = 1.0 - abs(2.0*v - 1.0);                          // the ridges of the field light up as filaments
    return vein*vein*vein*0.9 + v*0.1;
  }
  if (f == 1) {                                                   // CELLS: every second beat a new set of cells is lit
    vec2 g = p*(1.5 + s) + vec2(zoom*0.12, 0.0);
    vec2 i = floor(g), fr = fract(g); float d1 = 8.0, d2 = 8.0; vec2 id = i;
    for (int y=-1;y<=1;y++) for (int x=-1;x<=1;x++) {
      vec2 c = vec2(float(x), float(y)); vec2 h = hash2(i + c); h = 0.5 + 0.4*sin(zoom*0.6 + TAU*h);
      float d = length(c + h - fr);
      if (d < d1) { d2 = d1; d1 = d; id = i + c; } else if (d < d2) { d2 = d; }
    }
    float on = step(0.55, hash(id + floor(flick*0.5)*0.37 + seed));
    float edge = 1.0 - smoothstep(0.0, 0.06 + 0.04*w, d2 - d1);
    return clamp(on*(0.72 + 0.25*pulse)*(1.0 - 0.3*d1) + edge*0.95, 0.0, 1.0);
  }
  if (f == 2) {                                                   // LATTICE: posterised cells; odd rows step one cell per beat
    float cells = 5.0 + s*2.5;
    vec2 g = p*cells;
    float row = floor(g.y);
    float odd = mod(row, 2.0);
    float shift = floor(flick) + smoothstep(0.0, 0.2, beat);
    g.x += (odd*2.0 - 1.0)*shift;
    vec2 c = floor(g);
    float n = mix(noise(c*0.41 + vec2(bar*0.2, zoom*0.02)), hash(c + bar + seed), 0.5);
    float lvl = quant(clamp((n - 0.25)*2.2, 0.0, 1.0), q);
    float blink = step(0.82, hash(c + floor(flick) + seed));     // a few cells flash white on every beat
    float v = max(0.35 + 0.6*lvl, blink*(1.0 - 0.6*beat));
    float inner = smoothstep(0.0, 0.12, min(fract(g.x), fract(g.y))) * smoothstep(0.0, 0.12, min(1.0 - fract(g.x), 1.0 - fract(g.y)));
    return v*(0.1 + 0.9*inner)*(0.85 + 0.15*pulse);
  }
  if (f == 3) {                                                   // KALEIDO: n-fold mirror of a warped field, turning with the bars
    vec2 k = fold(p, n);
    float ang = spin; k = mat2(cos(ang), sin(ang), -sin(ang), cos(ang))*k;
    float a = fbm3(k*s*1.5 + zoom*0.2);
    float v = clamp((fbm(k*s*2.0 + w*2.5*(a-0.5) - zoom*0.15) - 0.25)*2.2, 0.0, 1.0);
    return quant(v, q + 2.0);
  }
  float r = length(p) + 1e-3; float a = atan(p.y, p.x);         // TUNNEL: n spokes, rings rushing in on the beat
  vec2 t = vec2(a/TAU*n, 0.5/r + zoom*0.7);
  float ring = quant(fract(t.y*s*0.5), q);
  float spoke = 0.5 + 0.5*cos(t.x*TAU + zoom*0.25);
  float grain = noise(t*vec2(1.0, 3.0));
  float v = ring*(0.55 + 0.3*spoke) + grain*0.25*spoke;
  return v*smoothstep(0.0, 0.22, r);
}

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0-uv.y;
  float aspect = res.x/res.y;
  vec2 p = (uv-0.5)*vec2(aspect,1.0);
  float pulse = vary.x, beat = vary.y, dis = vary.w;
  float light = env.x, drive = ink.z, flash = ink.w;
  vec4 LA = points[0], PA = points[1], LB = points[2], PB = points[3];
  float zoom = points[4].x, spin = points[4].y, phrase = points[4].z, bar = points[4].w, flick = points[5].x;
  p *= 1.0 - 0.06*pulse;                                          // the kick pulls the field in
  int fa = int(ink.x + 0.5), fb = int(ink.y + 0.5);
  float v = field(fa, p, LA, zoom, spin, flick, beat, bar, pulse);
  vec4 P = PA;
  if (dis > 0.001) {                                              // the next family arrives as blocks, in a random order
    float vb = field(fb, p, LB, zoom, spin, flick, beat, bar, pulse);
    float block = step(hash(floor(p*vec2(14.0, 14.0)) + seed), dis);
    v = mix(v, vb, block); P = mix(PA, PB, block);
  }
  vec3 hue = pal(v + phrase*0.05, P);                            // the hue rides the value; the value is the light
  float l = smoothstep(0.2, 0.85, v); l *= l;
  float core = pow(v, 6.0)*0.7;
  float gain = (0.75 + 0.25*drive)*(0.9 + 0.25*pulse);
  vec3 neon = (hue*l + mix(hue, vec3(1.0), 0.6)*core)*gain + flash*0.9;   // dark theme: neon on black, white-hot cores
  vec3 paper = mix(vec3(0.95), hue*0.45, (l + core*0.5)*gain);    // light theme: the same field as ink on paper
  vec3 col = mix(neon, paper, light);
  col += (hash(gl_FragCoord.xy) - 0.5)/255.0;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
