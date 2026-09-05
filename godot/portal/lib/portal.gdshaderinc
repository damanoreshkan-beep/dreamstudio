// The portal's shader library — the pieces every pass shares. TD's TOPs, written once:
//   turn / cam_luma    the camera's own frame (Y plane, or RGB on a desktop) as the screen sees it — the trace
//                      reads the SENSOR's luminance straight from the feed: no RGB copy, full sensor resolution
//   sobel              Edge TOP: the contours of a luminance picture
//   tone_band          Level TOP: the shadows (or the lights) as a soft mask
//   ycc_to_rgb         the camera's own YCbCr → RGB (video range + BT.709, what Android delivers)
//   material_at        Composite: the material sampled at an atomic tile, phase-shifted (the scroll or the anchor)

// quarter turns of a uv, plus the front camera's mirror
vec2 turn(vec2 uv, int q, int mirror) {
	vec2 r = uv;
	if (q == 1) r = vec2(uv.y, 1.0 - uv.x);
	else if (q == 2) r = vec2(1.0 - uv.x, 1.0 - uv.y);
	else if (q == 3) r = vec2(1.0 - uv.y, uv.x);
	if (mirror == 1) r.x = 1.0 - r.x;
	return clamp(r, vec2(0.0), vec2(1.0));
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// the camera's luminance at a SCREEN uv: mode 1 = rgb feed, 2 = the Y plane
float cam_luma(sampler2D y_tex, sampler2D rgb_tex, int mode, vec2 uv, int q, int mirror) {
	vec2 s = turn(uv, q, mirror);
	if (mode == 2) return texture(y_tex, s).r;
	if (mode == 1) return luma(texture(rgb_tex, s).rgb);
	return 0.0;
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

// the material at screen px `p`, one tile = `period` px, shifted by `phase` (0..1 of a tile)
vec3 material_at(sampler2D mat, vec2 p, float period, vec2 phase, float invert) {
	vec3 m = texture(mat, fract(p / period + phase)).rgb;
	return mix(m, 1.0 - m, invert);
}
