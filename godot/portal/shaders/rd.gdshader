// RD — Gray–Scott reaction-diffusion (Karl Sims, karlsims.com/rd.html: the equations and the Laplacian weights),
// one step per viewport, four viewports chained per frame. R = A, G = B. B is seeded by the camera's contours
// where the picture moves: the growth lives on the person and starves where nothing happens.
shader_type canvas_item;
render_mode blend_disabled;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D prev_tex : filter_linear;     // the step before
uniform sampler2D motion_tex : filter_linear;   // G = energy
uniform sampler2D rgb_texture : filter_linear;
uniform sampler2D y_texture : filter_linear;
uniform sampler2D ycbcr_texture : filter_linear;
uniform int mode : hint_range(0, 2) = 0;
uniform int rotate = 0;
uniform int mirror = 0;
uniform vec2 size = vec2(540.0, 1170.0);
uniform float feed = 0.055;
uniform float kill = 0.062;
uniform float dA = 1.0;
uniform float dB = 0.5;
uniform float dt = 1.0;
uniform float seed = 0.0;       // contours × energy → B
uniform float seed_floor = 0.15;

void fragment() {
	vec2 t = 1.0 / size;
	vec2 c = texture(prev_tex, UV).rg;
	vec2 lap = c * -1.0
		+ texture(prev_tex, UV + vec2(0.0, t.y)).rg * 0.2 + texture(prev_tex, UV - vec2(0.0, t.y)).rg * 0.2
		+ texture(prev_tex, UV + vec2(t.x, 0.0)).rg * 0.2 + texture(prev_tex, UV - vec2(t.x, 0.0)).rg * 0.2
		+ texture(prev_tex, UV + t).rg * 0.05 + texture(prev_tex, UV - t).rg * 0.05
		+ texture(prev_tex, UV + vec2(t.x, -t.y)).rg * 0.05 + texture(prev_tex, UV + vec2(-t.x, t.y)).rg * 0.05;
	float a = c.r, b = c.g;
	float abb = a * b * b;
	float na = a + (dA * lap.r - abb + feed * (1.0 - a)) * dt;
	float nb = b + (dB * lap.g + abb - (kill + feed) * b) * dt;
	if (seed > 0.0) {
		float e = smoothstep(seed_floor, 1.0, sobel(rgb_texture, y_texture, ycbcr_texture, mode, UV, t, 1.0, rotate, mirror) * 2.0);
		nb += e * texture(motion_tex, UV).g * seed * dt;
	}
	COLOR = vec4(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);
}
