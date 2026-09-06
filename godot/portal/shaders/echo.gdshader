// ECHO — TD's Feedback TOP carried by the FLUID: the last loop frame advected along the fluid's velocity
// (PavelDoGreat's advection of the dye, MIT), faded, zoomed about the centre, turned, plus an optional wind
// (the warp field). Drawn UNDER the new trace inside the loop viewport. Premultiplied like everything in the loop.
shader_type canvas_item;
render_mode blend_premul_alpha;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D prev_tex : filter_linear;
uniform sampler2D vel_tex : filter_linear;    // VelOut, px of the fluid grid per frame
uniform vec2 size = vec2(1080.0, 2340.0);
uniform vec2 fluid_size = vec2(270.0, 585.0);
uniform float dt = 1.0;
uniform float decay = 0.9;      // per frame (the script converts the preset's per-second value)
uniform float zoom = 1.0;       // per frame
uniform float rot = 0.0;        // radians per frame
uniform vec2 flow = vec2(0.0);  // px per frame, a constant wind
uniform float warp = 0.0;       // px, the breathing field's reach
uniform float carry = 1.0;      // how much of the fluid carries the trails

void fragment() {
	vec2 c = UV - 0.5;
	float s = sin(rot), k = cos(rot);
	c = mat2(vec2(k, -s), vec2(s, k)) * c / zoom;
	vec2 uv = c + 0.5;
	vec2 v = texture(vel_tex, UV).xy * carry;                       // fluid px/frame → loop uv
	vec2 push = v / fluid_size + (flow + warp * warp_field(UV, TIME, 2.5) * 2.0) / size;
	uv -= push * dt;
	vec4 p = texture(prev_tex, uv);
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	COLOR = p * decay * inside;
}
