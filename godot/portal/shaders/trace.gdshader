// TRACE — the camera's contours (Edge) and its tones (Level) drawn by the material (Composite), premultiplied:
// where nothing is traced nothing is added, so the loop's ground stays transparent and trails live. It reads
// the SENSOR's luminance (the demo's planes) through the same turn the camera surface uses — so the same shader
// traces the screen at screen resolution and a still at the sensor's, nothing in between is resampled.
// Motion energy (motion.gdshader) lifts the line where the picture moves; a shimmer breathes the tile.
shader_type canvas_item;
render_mode blend_premul_alpha;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D rgb_texture : filter_linear;
uniform sampler2D y_texture : filter_linear;
uniform sampler2D ycbcr_texture : filter_linear;
uniform int mode : hint_range(0, 2) = 0;
uniform int rotate = 0;
uniform int mirror = 0;
uniform sampler2D mat_tex : filter_linear, repeat_enable;
uniform sampler2D motion_tex : filter_linear;
uniform vec2 size = vec2(1080.0, 2340.0);        // this pass's canvas, px
uniform float strength = 2.2;                    // Sobel gain
uniform float step_px = 1.0;                     // sample distance, px of this canvas
uniform float floor_v = 0.12;                    // below this, no line
uniform float period = 256.0;                    // the tile, px of this canvas
uniform vec2 phase = vec2(0.0);                  // the tile's shift, 0..1 (the scroll)
uniform float shimmer = 0.0;                     // the tile breathes: 0..1 of a tile
uniform float invert = 0.0;
uniform float shade = 0.0;                       // tone hatching amount
uniform float shade_on_light = 0.0;
uniform vec2 shade_band = vec2(0.35, 0.75);
uniform float motion_gain = 0.0;                 // the line lifts where the picture moves
uniform sampler2D rd_tex : filter_linear;        // reaction-diffusion: G = B, the growth
uniform float rd_gain = 0.0;                     // the material grows where B is
uniform float alpha = 0.7;                       // into the loop

void fragment() {
	vec2 texel = 1.0 / size;
	float e = smoothstep(floor_v, 1.0, sobel(rgb_texture, y_texture, ycbcr_texture, mode, UV, texel, step_px, rotate, mirror) * strength);
	float l = cam_luma(rgb_texture, y_texture, ycbcr_texture, mode, UV, rotate, mirror);
	float m = texture(motion_tex, UV).g;
	float g = smoothstep(0.15, 0.4, texture(rd_tex, UV).g) * rd_gain;
	float w = clamp(e + shade * tone_band(l, shade_on_light, shade_band) + g, 0.0, 1.0) * alpha * (1.0 + motion_gain * m);
	vec2 ph = phase + shimmer * warp_field(UV, TIME, 3.0) * 0.5;
	vec3 mat = material_at(mat_tex, UV * size, period, ph, invert);
	w = clamp(w, 0.0, 1.0);
	COLOR = vec4(mat * w, w);
}
