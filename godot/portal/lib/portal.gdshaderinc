// The portal's shader library — the pieces every pass shares. TD's TOPs, written once.
//   sensor_rgb / sensor_luma    the camera's planes, read the way Godot's own camera demo reads them
//                               (ycbcr_to_rgb.gdshader: mode 0 RGB · 1 YCbCr separate · 2 YCbCr interleaved,
//                               color_range 0 full · 1 video, BT.709) — in SENSOR space
//   turn / cam_luma             the screen's quarter turns and the front camera's mirror over that
//   sobel · tone_band           Edge TOP · Level TOP
//   material_at                 the material sampled at an atomic tile, phase-shifted
//   hash21 · vnoise · fbm ·     the noise family: a warp field for the echo (smoke, veil, ferro), grain, glitch
//   warp_field · bayer4         (the styles are adapted from CC0 shaders on godotshaders.com — see
//                               docs/research/portal-godot.md §7 for the sources)
//   kuwahara_l · halftone_m ·   the looks: oil (Kuwahara on luminance), dots/lines, posterize + dither,
//   posterize_l · glitch_uv     glitch slices

vec2 clamp_uv(vec2 uv) {
	return clamp(uv, vec2(0.0), vec2(1.0));
}

// the demo's normalize_ycbcr: Full Range Y 0–255 / CbCr 0–255, Video Range Y 16–235 / CbCr 16–240
vec3 normalize_ycbcr(float y, vec2 cbcr, int color_range) {
	vec3 result;
	if (color_range == 1) {
		result.r = (y - 16.0 / 255.0) * (255.0 / 219.0);
		result.gb = (cbcr - 16.0 / 255.0) * (255.0 / 224.0) - vec2(0.5);
	} else {
		result.r = y;
		result.gb = cbcr - vec2(0.5);
	}
	return result;
}

// the demo's YCbCr → sRGB, BT.709
vec3 ycbcr_to_srgb(vec3 color) {
	return clamp(mat3(vec3(1.00000, 1.00000, 1.00000), vec3(0.00000, -0.18732, 1.85560), vec3(1.57481, -0.46813, 0.00000)) * color, 0.0, 1.0);
}

// the demo's fragment, at a SENSOR uv `s`: the colour the camera delivers
vec3 sensor_rgb(sampler2D rgb_texture, sampler2D y_texture, sampler2D cbcr_texture, sampler2D ycbcr_texture, int mode, int color_range, vec2 s) {
	vec2 base_uv = clamp_uv(s);
	if (mode == 1) {
		float y = texture(y_texture, base_uv).r;
		vec2 cbcr = texture(cbcr_texture, base_uv).rg;
		return ycbcr_to_srgb(normalize_ycbcr(y, cbcr, color_range));
	} else if (mode == 2) {
		vec2 texel = 1.0 / vec2(textureSize(ycbcr_texture, 0));
		vec2 parity = floor(mod(s / texel, 2.0));
		vec2 UV_u = s - parity * vec2(1.0, 0.0) * texel;
		vec2 UV_v = s + (vec2(1.0, 0.0) - parity) * vec2(1.0, 0.0) * texel;
		float y = texture(ycbcr_texture, base_uv).r;
		vec2 cbcr = vec2(texture(ycbcr_texture, clamp_uv(UV_u)).g, texture(ycbcr_texture, clamp_uv(UV_v)).g);
		return ycbcr_to_srgb(normalize_ycbcr(y, cbcr, color_range));
	}
	return texture(rgb_texture, base_uv).rgb;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// luminance at a SENSOR uv — the Y plane straight when the feed has one
float sensor_luma(sampler2D rgb_texture, sampler2D y_texture, sampler2D ycbcr_texture, int mode, vec2 s) {
	vec2 base_uv = clamp_uv(s);
	if (mode == 1) return texture(y_texture, base_uv).r;
	if (mode == 2) return texture(ycbcr_texture, base_uv).r;
	return luma(texture(rgb_texture, base_uv).rgb);
}

// quarter turns of a screen uv into the sensor, plus the front camera's mirror
vec2 turn(vec2 uv, int q, int mirror) {
	vec2 r = uv;
	if (q == 1) r = vec2(uv.y, 1.0 - uv.x);
	else if (q == 2) r = vec2(1.0 - uv.x, 1.0 - uv.y);
	else if (q == 3) r = vec2(1.0 - uv.y, uv.x);
	if (mirror == 1) r.x = 1.0 - r.x;
	return clamp_uv(r);
}

// the camera's luminance at a SCREEN uv
float cam_luma(sampler2D rgb_texture, sampler2D y_texture, sampler2D ycbcr_texture, int mode, vec2 uv, int q, int mirror) {
	return sensor_luma(rgb_texture, y_texture, ycbcr_texture, mode, turn(uv, q, mirror));
}

// Sobel gradient magnitude of the camera's luminance at uv, sampling `step_px` screen texels away
float sobel(sampler2D rgb_texture, sampler2D y_texture, sampler2D ycbcr_texture, int mode, vec2 uv, vec2 texel, float step_px, int q, int mirror) {
	vec2 t = texel * step_px;
	#define L(d) cam_luma(rgb_texture, y_texture, ycbcr_texture, mode, uv + (d), q, mirror)
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
float kuwahara_l(sampler2D rgb_texture, sampler2D y_texture, sampler2D ycbcr_texture, int mode, vec2 s, vec2 texel, int radius) {
	float best = sensor_luma(rgb_texture, y_texture, ycbcr_texture, mode, s);
	float best_var = 1e9;
	for (int k = 0; k < 4; k++) {
		vec2 sgn = vec2(k == 1 || k == 2 ? 1.0 : -1.0, k >= 2 ? 1.0 : -1.0);
		float m = 0.0, v = 0.0, n = 0.0;
		for (int j = 0; j <= radius; j++) {
			for (int i = 0; i <= radius; i++) {
				float l = sensor_luma(rgb_texture, y_texture, ycbcr_texture, mode, s + vec2(float(i), float(j)) * sgn * texel);
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
