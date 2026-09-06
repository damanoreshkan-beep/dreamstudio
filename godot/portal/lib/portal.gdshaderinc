// The portal's shader library — the pieces every pass shares. TD's TOPs, written once.
//   turn / cam_luma / cam_rgb   the camera's own planes (Y + CbCr on Android, RGB on a desktop) read in SENSOR
//                               space through the screen's turn — the trace and the styles read the sensor
//                               straight, so the same code runs the screen and a still at the sensor's size
//   sobel · tone_band           Edge TOP · Level TOP
//   ycc_to_rgb                  video range + BT.709 (what Android delivers)
//   material_at                 the material sampled at an atomic tile, phase-shifted
//   hash21 · vnoise · fbm ·     the noise family: a warp field for the echo (smoke, veil, ferro), grain, glitch
//   warp_field · bayer4         (the styles are adapted from CC0 shaders on godotshaders.com — see
//                               docs/research/portal-godot.md §7 for the sources)
//   kuwahara_l · halftone_m ·   the looks: oil (Kuwahara on luminance), dots/lines, posterize + dither,
//   posterize_l · glitch_uv     glitch slices

vec2 turn(vec2 uv, int q, int mirror) {
	vec2 r = uv;
	if (q == 1) r = vec2(uv.y, 1.0 - uv.x);
	else if (q == 2) r = vec2(1.0 - uv.x, 1.0 - uv.y);
	else if (q == 3) r = vec2(1.0 - uv.y, uv.x);
	if (mirror == 1) r.x = 1.0 - r.x;
	return clamp(r, vec2(0.0), vec2(1.0));
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 ycc_to_rgb(float y, vec2 cbcr, float video_range) {
	vec3 ycc;
	if (video_range > 0.5) {
		ycc.r = (y - 16.0 / 255.0) * (255.0 / 219.0);
		ycc.gb = (cbcr - 16.0 / 255.0) * (255.0 / 224.0) - vec2(0.5);
	} else {
		ycc.r = y;
		ycc.gb = cbcr - vec2(0.5);
	}
	return clamp(mat3(vec3(1.0, 1.0, 1.0), vec3(0.0, -0.18732, 1.8556), vec3(1.57481, -0.46813, 0.0)) * ycc, 0.0, 1.0);
}

// luminance at a SENSOR uv `s`: mode 1 = rgb feed, 2 = the Y plane
float sensor_luma(sampler2D y_tex, sampler2D rgb_tex, int mode, vec2 s) {
	if (mode == 2) return texture(y_tex, s).r;
	if (mode == 1) return luma(texture(rgb_tex, s).rgb);
	return 0.0;
}

// colour at a SENSOR uv
vec3 sensor_rgb(sampler2D y_tex, sampler2D cbcr_tex, sampler2D rgb_tex, int mode, vec2 s, float video_range) {
	if (mode == 2) return ycc_to_rgb(texture(y_tex, s).r, texture(cbcr_tex, s).rg, video_range);
	if (mode == 1) return texture(rgb_tex, s).rgb;
	return vec3(0.04);
}

// the camera's luminance at a SCREEN uv
float cam_luma(sampler2D y_tex, sampler2D rgb_tex, int mode, vec2 uv, int q, int mirror) {
	return sensor_luma(y_tex, rgb_tex, mode, turn(uv, q, mirror));
}

// Sobel gradient magnitude of the camera's luminance at uv, sampling `step_px` screen texels away
float sobel(sampler2D y_tex, sampler2D rgb_tex, int mode, vec2 uv, vec2 texel, float step_px, int q, int mirror) {
	vec2 t = texel * step_px;
	#define L(d) cam_luma(y_tex, rgb_tex, mode, uv + (d), q, mirror)
	float tl = L(vec2(-t.x, -t.y)), tc = L(vec2(0.0, -t.y)), tr = L(vec2(t.x, -t.y));
	float ml = L(vec2(-t.x, 0.0)),                            mr = L(vec2(t.x, 0.0));
	float bl = L(vec2(-t.x, t.y)),  bc = L(vec2(0.0, t.y)),  br = L(vec2(t.x, t.y));
	#undef L
	float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
	float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
	return length(vec2(gx, gy));
}

// how much of the material the tone takes: `on_light` = the lights instead of the shadows; band = where it fades in
float tone_band(float l, float on_light, vec2 band) {
	float tone = mix(1.0 - l, l, on_light);
	return smoothstep(band.x, band.y, tone);
}

// the material at screen px `p`, one tile = `period` px, shifted by `phase` (0..1 of a tile)
vec3 material_at(sampler2D mat, vec2 p, float period, vec2 phase, float invert) {
	vec3 m = texture(mat, fract(p / period + phase)).rgb;
	return mix(m, 1.0 - m, invert);
}

// ---- noise -----------------------------------------------------------------------------------------------

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float v = 0.0, a = 0.5;
	for (int i = 0; i < 4; i++) {
		v += a * vnoise(p);
		p = p * 2.03 + vec2(17.1, 9.7);
		a *= 0.5;
	}
	return v;
}

// a slowly breathing 2-D field in -0.5..0.5 — the smoke's own wind
vec2 warp_field(vec2 uv, float t, float scale) {
	return vec2(fbm(uv * scale + vec2(t * 0.11, -t * 0.07)), fbm(uv * scale + vec2(-t * 0.09, t * 0.13) + vec2(31.7))) - vec2(0.5);
}

// the 4×4 ordered-dither threshold at px `p`, 0..1
float bayer4(vec2 p) {
	ivec2 q = ivec2(mod(p, 4.0));
	int lo = 2 * ((q.x ^ q.y) & 1) + (q.y & 1);
	int hi = 2 * (((q.x >> 1) ^ (q.y >> 1)) & 1) + ((q.y >> 1) & 1);
	return (float(4 * lo + hi) + 0.5) / 16.0;
}

// ---- the looks (CC0 originals on godotshaders.com; rewritten on the sensor's luminance) ---------------------

// Kuwahara (innerdev, CC0): the quadrant with the least variance paints the pixel — oil, wash, glaze
float kuwahara_l(sampler2D y_tex, sampler2D rgb_tex, int mode, vec2 s, vec2 texel, int radius) {
	float best = sensor_luma(y_tex, rgb_tex, mode, s);
	float best_var = 1e9;
	for (int k = 0; k < 4; k++) {
		vec2 sgn = vec2(k == 1 || k == 2 ? 1.0 : -1.0, k >= 2 ? 1.0 : -1.0);
		float m = 0.0, v = 0.0, n = 0.0;
		for (int j = 0; j <= radius; j++) {
			for (int i = 0; i <= radius; i++) {
				float l = sensor_luma(y_tex, rgb_tex, mode, s + vec2(float(i), float(j)) * sgn * texel);
				m += l; v += l * l; n += 1.0;
			}
		}
		m /= n; v = abs(v / n - m * m);
		if (v < best_var) { best_var = v; best = m; }
	}
	return best;
}

// halftone (after the CC0 monotone halftone): 1 where a dot (or a line) of the tone sits at screen px `p`
float halftone_m(float l, vec2 p, float cell, float lines) {
	if (lines > 0.5) {
		float d = abs(fract((p.x + p.y) / cell) - 0.5) * 2.0;   // 45° hatching
		return smoothstep(l - 0.08, l + 0.08, 1.0 - d);
	}
	vec2 g = p / cell;
	float d = length(fract(g) - 0.5) * 2.0;
	float r = (1.0 - l);
	return smoothstep(r + 0.12, r - 0.12, d);
}

// posterize with ordered dither: `levels` steps of tone
float posterize_l(float l, float levels, float dither, vec2 p) {
	return floor(l * levels + (bayer4(p) - 0.5) * dither) / max(levels - 1.0, 1.0);
}

// glitch (after Ayzzi_Dev, CC0): row slices thrown sideways in bursts; returns the shifted uv and the burst
vec3 glitch_uv(vec2 uv, float t, float chance, float slices) {
	float burst = step(1.0 - chance, hash21(vec2(floor(t * 7.0), 3.1)));
	float slice_id = floor(uv.y * slices + hash21(vec2(floor(t), 1.7)));
	float r = hash21(vec2(slice_id, floor(t * 7.0)));
	float mask = step(0.5, r) * burst;
	uv.x += (r - 0.5) * 0.25 * mask;
	return vec3(uv, burst);
}
