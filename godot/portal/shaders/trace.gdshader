// TRACE — the camera's contours (Edge) and its tones (Level) drawn by the material (Composite), premultiplied:
// where nothing is traced nothing is added, so the loop's ground stays transparent and trails live. It reads
// the SENSOR's luminance (the Y plane) through the same turn the camera surface uses — so the same shader
// traces the screen at screen resolution and a still at the sensor's, nothing in between is resampled.
shader_type canvas_item;
render_mode blend_premul_alpha;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D y_tex : filter_linear;
uniform sampler2D rgb_tex : filter_linear;
uniform int mode = 0;                            // 0 nothing yet, 1 rgb feed, 2 Y plane
uniform int rotate = 0;
uniform int mirror = 0;
uniform sampler2D mat_tex : filter_linear, repeat_enable;
uniform vec2 size = vec2(1080.0, 2340.0);        // this pass's canvas, px
uniform float strength = 2.2;                    // Sobel gain
uniform float step_px = 1.0;                     // sample distance, px of this canvas
uniform float floor_v = 0.12;                    // below this, no line
uniform float period = 256.0;                    // the tile, px of this canvas
uniform vec2 phase = vec2(0.0);                  // the tile's shift, 0..1 (the scroll)
uniform float invert = 0.0;
uniform float shade = 0.0;                       // tone hatching amount
uniform float shade_on_light = 0.0;
uniform vec2 shade_band = vec2(0.35, 0.75);
uniform float alpha = 0.7;                       // into the loop

void fragment() {
	vec2 texel = 1.0 / size;
	float e = smoothstep(floor_v, 1.0, sobel(y_tex, rgb_tex, mode, UV, texel, step_px, rotate, mirror) * strength);
	float l = cam_luma(y_tex, rgb_tex, mode, UV, rotate, mirror);
	float w = clamp(e + shade * tone_band(l, shade_on_light, shade_band), 0.0, 1.0) * alpha;
	vec3 m = material_at(mat_tex, UV * size, period, phase, invert);
	COLOR = vec4(m * w, w);
}
