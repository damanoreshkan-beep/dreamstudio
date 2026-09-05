// ECHO — TD's Feedback TOP: the last loop frame, faded, zoomed about the centre, turned — drawn UNDER the new
// trace inside the loop viewport. Premultiplied like everything in the loop.
shader_type canvas_item;
render_mode blend_premul_alpha;

uniform sampler2D prev_tex : filter_linear;
uniform float decay = 0.9;
uniform float zoom = 1.0;      // per frame
uniform float rot = 0.0;       // radians per frame

void fragment() {
	vec2 c = UV - 0.5;
	float s = sin(rot), k = cos(rot);
	c = mat2(vec2(k, -s), vec2(s, k)) * c / zoom;
	vec2 uv = c + 0.5;
	vec4 p = texture(prev_tex, uv);
	float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
	COLOR = p * decay * inside;
}
