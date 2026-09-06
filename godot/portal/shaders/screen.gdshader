// SCREEN — the picture (the dye) onto the screen, through the surface the material chooses:
//   mode 0  as is
//   mode 1  TIME — time displacement / slit-scan: each pixel takes its moment from the ring of the last 16
//           frames (Slots, a 4×4 atlas), the moment chosen by its luminance (p.x = how far back, frames)
//   mode 2  GLASS — liquid glass (after Loop_Box's Liquid Glass, CC0): the picture refracted along the fluid's
//           velocity gradient, chromatic split on the fast edges (p.x = refraction px, p.y = chroma)
//   mode 3  SORT — pseudo pixel sorting (after Ahopness, CC0): columns melt where the tone passes a threshold
//           (p.x = threshold, p.y = amount)
shader_type canvas_item;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D tex : filter_linear;          // the dye (or the look)
uniform sampler2D slots_tex : filter_linear;    // 4×4 ring of past frames
uniform sampler2D vel_tex : filter_linear;      // VelOut
uniform sampler2D motion_tex : filter_linear;
uniform vec2 size = vec2(1080.0, 2340.0);
uniform vec2 fluid_size = vec2(270.0, 585.0);
uniform int slot = 0;                           // the newest slot
uniform int mode = 0;
uniform vec4 p = vec4(0.0);
uniform float amount = 1.0;

vec3 slot_at(int i, vec2 uv) {
	int k = ((i % 16) + 16) % 16;
	vec2 o = vec2(float(k % 4), float(k / 4)) * 0.25;
	return texture(slots_tex, o + uv * 0.25).rgb;
}

void fragment() {
	vec3 live = texture(tex, UV).rgb;
	vec3 out_rgb = live;
	if (mode == 1) {
		float back = luma(live) * p.x;             // frames back, by tone
		int i0 = int(floor(back));
		float f = fract(back);
		vec3 a = slot_at(slot - i0, UV), b = slot_at(slot - i0 - 1, UV);
		out_rgb = mix(a, b, f);
	} else if (mode == 2) {
		vec2 t = 1.0 / fluid_size;
		vec2 v = texture(vel_tex, UV).xy;
		vec2 gx = texture(vel_tex, UV + vec2(t.x, 0.0)).xy - texture(vel_tex, UV - vec2(t.x, 0.0)).xy;
		vec2 gy = texture(vel_tex, UV + vec2(0.0, t.y)).xy - texture(vel_tex, UV - vec2(0.0, t.y)).xy;
		vec2 n = vec2(gx.x + gx.y, gy.x + gy.y) + v * 0.2;     // the surface's slope
		vec2 off = n * p.x / size;
		float chroma = p.y * length(n);
		out_rgb = vec3(texture(tex, clamp_uv(UV + off * (1.0 + chroma))).r, texture(tex, clamp_uv(UV + off)).g, texture(tex, clamp_uv(UV + off * (1.0 - chroma))).b);
		float rim = clamp(length(n) * 0.5, 0.0, 1.0);
		out_rgb += rim * 0.15;
	} else if (mode == 3) {
		float l = luma(live);
		float mask = smoothstep(p.x - 0.1, p.x + 0.1, l);
		float turb = hash21(vec2(floor(UV.x * size.x), 7.0));
		vec2 uv = vec2(UV.x, UV.y + p.y * mask * turb * 0.5);
		out_rgb = uv.y > 1.0 ? texture(tex, vec2(UV.x, 1.0 - p.x * 0.5)).rgb : texture(tex, uv).rgb;
	}
	COLOR = vec4(mix(live, out_rgb, amount), 1.0);
}
