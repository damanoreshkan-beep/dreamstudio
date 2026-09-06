// LOOK — the camera through the material's own eye, straight from the sensor's planes. `style` 0 leaves the
// picture exactly as the phone gives it (owner: the camera's own picture is never spoilt); the other styles are
// CC0 shaders from godotshaders.com re-drawn on the sensor's luminance so chroma stays the camera's:
//   1 oil (Kuwahara, p.x = radius)      2 halftone (p.x = cell px, p.y = 1 for lines)
//   3 posterize (p.x levels, p.y dither) 4 chromatic split (p.x = strength)
//   5 glitch (p.x = chance)              6 grain + pixel (p.x = grain, p.y = block px)
//   7 scanlines (p.x = period px, p.y = darkness)
// `amount` mixes the style over the plain picture. Rendered into the Look viewport (screen or sensor size).
shader_type canvas_item;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D y_tex : filter_linear;
uniform sampler2D cbcr_tex : filter_linear;
uniform sampler2D rgb_tex : filter_linear;
uniform int mode = 0;
uniform int rotate = 0;
uniform int mirror = 0;
uniform float video_range = 1.0;
uniform vec2 size = vec2(1080.0, 2340.0);
uniform int style = 0;
uniform float amount = 1.0;
uniform vec4 p = vec4(0.0);

// paint a new luminance over the camera's colour, keeping its chroma
vec3 relit(vec3 rgb, float l_old, float l_new) {
	return clamp(rgb * (l_new / max(l_old, 0.02)), 0.0, 1.0);
}

void fragment() {
	vec2 uv = UV;
	float burst = 0.0;
	if (style == 5) {
		vec3 g = glitch_uv(uv, TIME, p.x, 14.0);
		uv = g.xy; burst = g.z;
	}
	if (style == 6 && p.y > 1.0) uv = (floor(UV * size / p.y) + 0.5) * p.y / size;
	vec2 s = turn(uv, rotate, mirror);
	vec3 rgb = sensor_rgb(y_tex, cbcr_tex, rgb_tex, mode, s, video_range);
	float l = luma(rgb);
	vec3 out_rgb = rgb;
	vec2 px = UV * size;
	if (style == 1) {
		vec2 texel = 1.0 / vec2(textureSize(y_tex, 0));
		if (mode == 1) texel = 1.0 / vec2(textureSize(rgb_tex, 0));
		out_rgb = relit(rgb, l, kuwahara_l(y_tex, rgb_tex, mode, s, texel, int(p.x)));
	} else if (style == 2) {
		out_rgb = relit(rgb, l, 1.0 - halftone_m(l, px, max(p.x, 2.0), p.y));
	} else if (style == 3) {
		out_rgb = relit(rgb, l, posterize_l(l, max(p.x, 2.0), p.y, px));
	} else if (style == 4) {
		vec2 d = (UV - 0.5) * p.x;
		float r = sensor_rgb(y_tex, cbcr_tex, rgb_tex, mode, turn(clamp(UV + d, 0.0, 1.0), rotate, mirror), video_range).r;
		float b = sensor_rgb(y_tex, cbcr_tex, rgb_tex, mode, turn(clamp(UV - d, 0.0, 1.0), rotate, mirror), video_range).b;
		out_rgb = vec3(r, rgb.g, b);
	} else if (style == 5) {
		float r = sensor_rgb(y_tex, cbcr_tex, rgb_tex, mode, turn(clamp(uv + vec2(0.012 * burst, 0.0), 0.0, 1.0), rotate, mirror), video_range).r;
		float b = sensor_rgb(y_tex, cbcr_tex, rgb_tex, mode, turn(clamp(uv - vec2(0.012 * burst, 0.0), 0.0, 1.0), rotate, mirror), video_range).b;
		out_rgb = vec3(r, rgb.g, b);
		float scan = step(0.92, hash21(vec2(floor(px.y / 3.0), floor(TIME * 10.0))));
		out_rgb *= 1.0 - scan * 0.5 * burst;
	} else if (style == 6) {
		out_rgb = clamp(rgb + (hash21(px + fract(TIME) * 100.0) - 0.5) * p.x, 0.0, 1.0);
	} else if (style == 7) {
		float line = 0.5 + 0.5 * sin(px.y / max(p.x, 1.0) * 6.2831853);
		out_rgb = rgb * (1.0 - line * p.y);
	}
	COLOR = vec4(mix(rgb, out_rgb, amount), 1.0);
}
