// ECHO — TD's Feedback TOP: the last loop frame, faded, zoomed about the centre, turned, pushed by the flow and
// bent by a breathing warp field — drawn UNDER the new trace inside the loop viewport. Where the picture moves
// (motion energy) the push grows: the trails smear off what moves. Premultiplied like everything in the loop.
shader_type canvas_item;
render_mode blend_premul_alpha;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D prev_tex : filter_linear;
uniform sampler2D motion_tex : filter_linear;
uniform vec2 size = vec2(1080.0, 2340.0);
uniform float decay = 0.9;      // per frame (the script converts the preset's per-second value)
uniform float zoom = 1.0;       // per frame
uniform float rot = 0.0;        // radians per frame
uniform vec2 flow = vec2(0.0);  // px per frame
uniform float warp = 0.0;       // px, the field's reach
uniform float motion_push = 0.0;

void fragment() {
	vec2 c = UV - 0.5;
	float s = sin(rot), k = cos(rot);
	c = mat2(vec2(k, -s), vec2(s, k)) * c / zoom;
	vec2 uv = c + 0.5;
	float m = texture(motion_tex, UV).g;
	vec2 push = flow + warp * warp_field(UV, TIME, 2.5) * 2.0;
	uv -= push * (1.0 + motion_push * m) / size;
	vec4 p = texture(prev_tex, uv);
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	COLOR = p * decay * inside;
}
