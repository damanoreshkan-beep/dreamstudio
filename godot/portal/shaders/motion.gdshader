// MOTION — where and how the picture moves. A small ping-pong viewport (HDR) keeps:
//   R = the luminance now      G = a decaying energy of |now − last|      BA = the OPTICAL FLOW (px/frame)
// The flow is keeffEoghan/glsl-optical-flow (MIT; after ofxFlowTools): the gradient-based flow between the
// last frame's luminance (R of the other viewport) and this one — what pushes the fluid.
shader_type canvas_item;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D rgb_texture : filter_linear;
uniform sampler2D y_texture : filter_linear;
uniform sampler2D ycbcr_texture : filter_linear;
uniform int mode : hint_range(0, 2) = 0;
uniform int rotate = 0;
uniform int mirror = 0;
uniform sampler2D prev_tex : filter_linear;
uniform vec2 size = vec2(270.0, 585.0);
uniform float gain = 6.0;      // difference → energy
uniform float decay = 0.9;     // energy kept per frame
uniform float flow_offset = 1.0;   // the flow's sample distance, px
uniform float flow_lambda = 0.01;  // the flow's regularisation (the original: 0.01)
uniform float flow_gain = 1.0;

#define LUMA(u) cam_luma(rgb_texture, y_texture, ycbcr_texture, mode, (u), rotate, mirror)

// keeffEoghan's opticalFlow, on luminance: `next` is the camera now, `past` is the last frame's R
vec2 optical_flow(vec2 uv, vec2 off) {
	vec2 ox = vec2(off.x, 0.0), oy = vec2(0.0, off.y);
	float grad_x = (LUMA(uv + ox) - LUMA(uv - ox)) + (texture(prev_tex, uv + ox).r - texture(prev_tex, uv - ox).r);
	float grad_y = (LUMA(uv + oy) - LUMA(uv - oy)) + (texture(prev_tex, uv + oy).r - texture(prev_tex, uv - oy).r);
	float grad_mag = sqrt(grad_x * grad_x + grad_y * grad_y + flow_lambda);
	float diff = LUMA(uv) - texture(prev_tex, uv).r;
	return vec2(diff * (grad_x / grad_mag), diff * (grad_y / grad_mag));
}

void fragment() {
	float l = LUMA(UV);
	vec4 prev = texture(prev_tex, UV);
	float e = clamp(abs(l - prev.r) * gain, 0.0, 1.0);
	vec2 flow = optical_flow(UV, flow_offset / size) * flow_gain;
	COLOR = vec4(l, max(e, prev.g * decay), flow);
}
