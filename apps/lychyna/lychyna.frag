#version 300 es
// (#version stays on line 1: ANGLE refuses a directive that is not the first line, comments or not.)
// lychyna — the camera in our materials (GLSL ES 3.00, mounted by /_rt/glstage.js with `cam`).
//
// ONE shader, ELEVEN looks. The camera frame is `cam` (full resolution, core ≥ 1.2.31) and every material is a
// different reading of the same three primitives — luma, a Sobel gradient, fbm — so the strip switches with a
// uniform, never a program rebuild. The order is rt/styles.js's, which is mirage's card order:
//   0 lum · 1 smoke · 2 chrome · 3 paper · 4 thread · 5 ink · 6 circuit · 7 veil · 8 ferro · 9 porcelain · 10 sand
//
//   vary.x  busy     0..1  the keeper is being painted — the material breathes
//   vary.y  arrival  0..1  the keeper landed — a bloom that settles (the host eases it down)
//   vary.z  material 0..1  index / 10
//   vary.w  mirror   0|1   the front camera — flip x, the way every mirror does
//   ink     the app accent (mark colour: the arrival bloom, nothing typed)
//   camAspect.y == 0 → no frame yet: a quiet dark field, not a grey square
//
// Judged on vps/frag.sh --cam --sheet 4x3 --vz (2026-09-05). Two numbers decide the whole look: the Sobel
// texel is 3 camera pixels (2 read JPEG grain and sensor noise as filaments) and the luma it reads is a 5-tap
// blur at that radius; the wide gradient (8 px) is the bloom and every material that shades a surface uses
// it for the normal — a normal from the fine gradient speckles. The recipes are tabled in RESEARCH.md.
precision highp float;
out vec4 o;
uniform vec2 res; uniform float time; uniform float seed;
uniform vec4 ink; uniform vec4 vary; uniform vec4 env;
uniform sampler2D cam; uniform vec2 camAspect;

const mat2 R = mat2(0.86, 0.51, -0.51, 0.86);
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p=R*p*2.0+vec2(1.7,9.2); a*=0.5; } return s; }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }

// object-fit cover of the camera into the screen; y is top-down on both sides (rows upload top-first)
vec2 cover(vec2 uv){
  float asp = res.x/max(res.y, 1.0), ca = max(camAspect.x, 1e-3);
  vec2 c = uv - 0.5;
  if (ca > asp) c.x *= asp/ca; else c.y *= ca/asp;
  c += 0.5;
  if (vary.w > 0.5) c.x = 1.0 - c.x;
  return c;
}
vec3 pick(vec2 p){ return texture(cam, clamp(p, 0.0, 1.0)).rgb; }
float lum(vec2 p){ return luma(pick(p)); }
// luma smoothed by a 5-tap cross of radius `r` (in cam uv): the grain goes, the edges stay
float lumS(vec2 p, vec2 r){ return (lum(p)*2.0 + lum(p+vec2(r.x,0)) + lum(p-vec2(r.x,0)) + lum(p+vec2(0,r.y)) + lum(p-vec2(0,r.y)))/6.0; }
// Sobel on smoothed luma, texel `t`
vec2 sobel(vec2 p, vec2 t){
  vec2 h = t*0.5;
  float l00=lumS(p+t*vec2(-1,-1),h), l10=lumS(p+t*vec2(0,-1),h), l20=lumS(p+t*vec2(1,-1),h);
  float l01=lumS(p+t*vec2(-1, 0),h),                            l21=lumS(p+t*vec2(1, 0),h);
  float l02=lumS(p+t*vec2(-1, 1),h), l12=lumS(p+t*vec2(0, 1),h), l22=lumS(p+t*vec2(1, 1),h);
  return vec2((l20+2.0*l21+l22)-(l00+2.0*l01+l02), (l02+2.0*l12+l22)-(l00+2.0*l10+l20));
}
// a screen point (px, GL origin) → the camera uv it shows
vec2 camAt(vec2 frag){ vec2 uv = frag/res; uv.y = 1.0 - uv.y; return cover(uv); }

void main(){
  vec2 uv = gl_FragCoord.xy/res; uv.y = 1.0 - uv.y;
  float asp = res.x/max(res.y, 1.0);
  int m = int(floor(vary.z*10.0 + 0.5));
  vec3 col;

  if (camAspect.y < 0.5) {
    // no frame yet: a dark field breathing in the accent, so the prime screen sits on something alive
    vec2 q = vec2(uv.x*asp, uv.y);
    col = vec3(0.008) + ink.rgb*0.07*fbm(q*2.2 + time*0.05 + seed);
    o = vec4(col, 1.0); return;
  }

  vec2 p = cover(uv);
  vec3 c = pick(p); float l = luma(c);
  vec2 ts = vec2(textureSize(cam, 0));
  vec2 tx = 3.0/ts, tw = 8.0/ts;
  // a nine-tap mean of the frame = the exposure: a night street and a bright window both land their forms in
  // the material's mid band (measured: the same shader on a dusk photo was 90 % black without it)
  float meanL = 0.0;
  for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) meanL += lumS(vec2(0.2 + 0.3*float(i), 0.2 + 0.3*float(j)), tw);
  float gain = clamp(0.42/max(meanL/9.0, 0.02), 1.0, 2.8);
  float ls = clamp(lumS(p, tx)*gain, 0.0, 1.0);            // the smoothed, exposed luma every tone map reads
  vec2 g = sobel(p, tx); float e = length(g);              // fine: lines
  vec2 gW = sobel(p, tw); float eW = length(gW);           // wide: bloom and every surface normal
  float rad = length((uv-0.5)*vec2(asp, 1.0));             // 0 centre → ~0.7 corner (portrait)

  if (m == 0) {          // ── lum: the luminous plexus — filaments on the black void ───────────────────
    float f = smoothstep(0.14, 0.50, e);
    float fw = smoothstep(0.10, 0.60, eW);
    float node = smoothstep(0.04, 0.14, abs(g.x)*abs(g.y));
    node *= 0.75 + 0.25*sin(time*3.0 + hash(floor(p*160.0))*6.28);
    vec3 amber = vec3(0.98, 0.74, 0.32), cyan = vec3(0.35, 0.95, 1.0);
    float outer = smoothstep(0.25, 0.55, rad) * step(0.35, hash(floor(p*90.0)));
    col = c*0.04 + amber*(f*0.9 + fw*0.35) + mix(amber, cyan, outer)*node*1.5;
  } else if (m == 1) {   // ── smoke: white smoke frozen mid-swirl in a black void, one hard side light ──
    vec2 w = p + 0.045*(vec2(fbm(p*2.0 + time*0.05 + seed), fbm(p*2.0 + 7.1 - time*0.04)) - 0.5);
    float s = pow(smoothstep(0.22, 0.95, clamp(lumS(w, tx)*gain, 0.0, 1.0)), 1.5);
    vec3 n = normalize(vec3(-gW*2.5, 0.7)); vec3 L = normalize(vec3(-0.8, -0.4, 0.5));
    float shade = 0.5 + 0.5*max(dot(n, L), 0.0);
    float wisp = 0.62 + 0.6*fbm(p*12.0 + w*4.0 + time*0.08);
    float vig = 1.0 - 0.85*smoothstep(0.30, 0.78, rad);
    col = vec3(0.01) + vec3(0.97, 0.95, 0.92)*s*shade*wisp*vig;
  } else if (m == 2) {   // ── chrome: liquid mirror under a studio softbox ─────────────────────────────
    vec3 n = normalize(vec3(-gW*3.5, 1.0));
    float ny = n.y*0.5 + 0.5;                              // 0.5 = a flat face
    float envv = 0.22 + 0.75*smoothstep(0.56, 0.62, ny)*(1.0 - smoothstep(0.74, 0.80, ny))
               + 0.35*smoothstep(0.36, 0.40, ny)*(1.0 - smoothstep(0.44, 0.47, ny))
               - 0.18*smoothstep(0.45, 0.30, ny) + 0.12*n.x;
    envv = clamp(envv*(0.55 + 0.6*ls), 0.0, 1.0);
    col = mix(vec3(0.015, 0.015, 0.02), vec3(0.86, 0.92, 1.0), envv);
  } else if (m == 3) {   // ── paper: six cut layers under a raking light from the upper left ───────────
    float Lq = floor(ls*6.0)/6.0;
    vec2 lt = normalize(vec2(-1.0, -1.0));
    float sh  = smoothstep(0.0, 0.17, floor(clamp(lumS(p + lt*tx*2.0, tx)*gain, 0.0, 1.0)*6.0)/6.0 - Lq);
    float sh2 = smoothstep(0.0, 0.17, floor(clamp(lumS(p + lt*tx*6.0, tx)*gain, 0.0, 1.0)*6.0)/6.0 - Lq);
    float sh3 = smoothstep(0.0, 0.17, floor(clamp(lumS(p + lt*tx*12.0, tx)*gain, 0.0, 1.0)*6.0)/6.0 - Lq);
    col = vec3(0.90 + 0.10*Lq) * vec3(1.0, 0.99, 0.965) * (1.0 - 0.42*sh - 0.16*sh2 - 0.07*sh3);
  } else if (m == 4) {   // ── thread: one silk stitch per cell on dark linen ───────────────────────────
    // cross-stitch: one X per cell (~17 px on the reference device), the cell's colour saturated, a sheen
    // along each leg; a 7-px cell read as a halftone screen, not embroidery (judged 2026-09-05)
    float sc = res.x/46.0;
    vec2 q = gl_FragCoord.xy/sc; vec2 id = floor(q); vec2 f = fract(q) - 0.5;
    vec3 cc = pick(camAt((id + 0.5)*sc)); float lc = clamp(luma(cc)*gain, 0.0, 1.0);
    float legA = 1.0 - smoothstep(0.09, 0.20, abs(f.x - f.y)*0.707);
    float legB = 1.0 - smoothstep(0.09, 0.20, abs(f.x + f.y)*0.707);
    float ends = smoothstep(0.5, 0.40, max(abs(f.x), abs(f.y)));
    float stitch = max(legA, legB*0.92)*ends;
    vec3 sat = clamp(mix(vec3(lc), cc*gain, 1.6), 0.0, 1.0);
    float sheen = (legA*pow(1.0 - min(abs(f.x + f.y)*1.4, 1.0), 5.0) + legB*pow(1.0 - min(abs(f.x - f.y)*1.4, 1.0), 5.0))*0.35;
    vec3 linen = vec3(0.07, 0.058, 0.046) * (0.85 + 0.15*sin(gl_FragCoord.x*1.6)*sin(gl_FragCoord.y*1.6));
    float on = smoothstep(0.06, 0.14, lc);
    col = mix(linen, sat*(0.8 + 0.5*lc) + sheen, stitch*on);
  } else if (m == 5) {   // ── ink: black and vermilion blooming in water, white backlight ──────────────
    vec2 w = p + 0.035*(vec2(fbm(p*3.0 + seed), fbm(p*3.0 + 3.3)) - 0.5);
    vec3 cw = pick(w); float d = 1.0 - clamp(lumS(w, tx)*gain, 0.0, 1.0);
    float grainy = fbm(p*26.0 + seed) - 0.5;
    float dense = smoothstep(0.62, 0.80, d + 0.10*grainy);
    float wash  = smoothstep(0.34, 0.60, d + 0.22*grainy);
    float wm = smoothstep(0.06, 0.30, cw.r - cw.b);
    vec3 inkc = mix(vec3(0.03, 0.02, 0.03), vec3(0.78, 0.16, 0.08), wm);
    col = vec3(0.965, 0.96, 0.95);
    col = mix(col, mix(col, inkc, 0.45), wash);
    col = mix(col, inkc, dense);
    col *= 1.0 - 0.35*smoothstep(0.2, 0.6, e);
  } else if (m == 6) {   // ── circuit: gold traces and pads on a matte board ───────────────────────────
    float G = res.x/40.0;
    vec2 gq = gl_FragCoord.xy/G; vec2 gf = fract(gq);
    float grid = smoothstep(0.03, 0.0, min(gf.x, gf.y))*0.04;
    float ang = atan(gW.y, gW.x);
    float trace = smoothstep(0.16, 0.42, eW) * (0.3 + 0.7*smoothstep(0.5, 1.0, abs(cos(ang*4.0))));
    vec2 cellP = camAt((floor(gq) + 0.5)*G);
    float busy = length(sobel(cellP, tw));
    float pad = smoothstep(0.13, 0.09, length(gf - 0.5)) * smoothstep(0.10, 0.25, busy) * step(0.35, lumS(cellP, tx));
    vec3 gold = vec3(0.92, 0.76, 0.36);
    col = vec3(0.02, 0.03, 0.025) + grid + ls*0.10*vec3(0.9, 0.55, 0.25) + gold*(trace*0.95 + pad*0.9);
  } else if (m == 7) {   // ── veil: an aurora curtain over a night sky, long exposure ──────────────────
    vec3 night = vec3(0.015, 0.02, 0.05);
    float star = step(0.9985, hash(floor(gl_FragCoord.xy/1.5))) * (0.6 + 0.4*sin(time*2.0 + hash(floor(gl_FragCoord.xy))*6.28));
    float lv = clamp((ls + (lumS(p + vec2(0.0, tx.y*5.0), tx) + lumS(p - vec2(0.0, tx.y*5.0), tx))*gain)/3.0, 0.0, 1.0);
    float curtain = pow(lv, 1.3) * (0.35 + 0.75*fbm(vec2(p.x*60.0, p.y*2.0 - time*0.15)));
    vec3 hue = mix(vec3(0.35, 0.95, 0.55), vec3(0.55, 0.30, 0.95), smoothstep(0.30, 0.85, lv));
    col = night + star*0.8 + hue*curtain*1.15;
  } else if (m == 8) {   // ── ferro: glossy black liquid with magnetic spikes, one rim light ───────────
    // cones of black liquid (~13 px apart on the reference device) raised by the light: their analytic normal
    // joins the picture's; a 4-px spike grid read as a dot screen (judged 2026-09-05)
    float sc = res.x/60.0;
    vec2 sq = gl_FragCoord.xy/sc; sq.x += 0.5*mod(floor(sq.y), 2.0);   // staggered rows: a lattice, not a screen
    vec2 f = fract(sq) - 0.5;
    float lp = pow(ls, 0.7) * (0.45 + 0.75*fbm(floor(sq)*0.35 + seed));   // uneven heights break the grid
    float d = length(f)*2.2;
    float cone = pow(max(1.0 - d, 0.0), 1.2)*lp;
    vec2 dir = f/max(length(f), 1e-4);
    vec3 n = normalize(vec3(-gW*2.0 + dir*cone*3.0*step(0.02, lp), 1.0));
    vec3 L = normalize(vec3(0.6, -0.5, 0.55)); vec3 V = vec3(0.0, 0.0, 1.0);
    float rim = pow(1.0 - n.z, 2.5);
    float spec = pow(max(dot(reflect(-L, n), V), 0.0), 24.0);
    float tip = smoothstep(0.35, 0.0, d)*lp;
    float fill = max(dot(n, normalize(vec3(-0.7, 0.2, 0.4))), 0.0);
    col = vec3(0.01, 0.01, 0.015) + ls*0.05 + vec3(0.73, 0.69, 0.94)*(rim*0.8 + tip*0.5) + vec3(0.30, 0.24, 0.55)*fill*0.3*lp + vec3(0.92, 0.9, 1.0)*spec*(0.3 + 0.7*lp);
  } else if (m == 9) {   // ── porcelain: warm light through a thin backlit relief ──────────────────────
    vec3 warm = vec3(1.0, 0.86, 0.66);
    vec3 n = normalize(vec3(-gW*3.0, 0.8)); vec3 Lb = normalize(vec3(0.3, -0.4, 0.85));
    float emb = 0.7 + 0.55*dot(n, Lb);
    float glow = clamp((ls + (lumS(p + tx*vec2(4.0, 0.0), tx) + lumS(p - tx*vec2(4.0, 0.0), tx) + lumS(p + tx*vec2(0.0, 4.0), tx) + lumS(p - tx*vec2(0.0, 4.0), tx))*gain)/5.0, 0.0, 1.0);
    col = warm*pow(ls, 0.8)*emb + warm*glow*0.3;
    col *= 1.0 - 0.45*smoothstep(0.15, 0.5, e);
    col *= 1.0 - 0.75*smoothstep(0.40, 0.90, rad);
    col += vec3(0.01, 0.008, 0.006);
  } else {               // ── sand: lines incised in wet sand under a low sun from the right ───────────
    vec3 sand = vec3(0.24, 0.17, 0.11) * (0.94 + 0.06*hash(gl_FragCoord.xy));
    float gr = smoothstep(0.12, 0.42, e);
    vec2 sun = normalize(vec2(1.0, 0.35));
    vec2 gn = g/max(e, 1e-4);
    float rim = gr*smoothstep(0.0, 0.3, dot(gn, sun));
    float wall = gr*smoothstep(0.0, 0.3, -dot(gn, sun));
    float longSh = smoothstep(0.08, 0.30, abs(clamp(lumS(p + sun*tx*5.0, tx)*gain, 0.0, 1.0) - ls))*0.5;
    col = sand*(1.0 - 0.45*gr - 0.35*wall - longSh*0.6 + 0.18*ls) + vec3(1.0, 0.78, 0.45)*rim*0.5;
    col *= 0.82 + 0.36*uv.x;
    col += vec3(0.9, 0.88, 0.82)*smoothstep(0.012, 0.0, abs(uv.y - 0.04 - 0.05*fbm(vec2(uv.x*4.0, time*0.1))))*0.14;
  }

  // the keeper's two moments: breathing while the pods paint, a bloom when the picture lands
  col *= 1.0 + vary.x*0.06*sin(time*2.5);
  col = mix(col, ink.rgb, vary.y*0.35);
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
