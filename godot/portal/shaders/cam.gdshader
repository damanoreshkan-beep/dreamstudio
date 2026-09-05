// The camera on a surface. The feed arrives as the phone gives it — on Android an NV12 pair (Y + CbCr planes,
// video range, BT.709 — the camera author's sample), on a desktop RGB. `rotate` = quarter turns from the feed's
// own transform, `mirror` for the front camera. Drawn as is: the picture is never dimmed here (owner).
shader_type canvas_item;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D y_tex : filter_linear;
uniform sampler2D cbcr_tex : filter_linear;
uniform sampler2D rgb_tex : filter_linear;
uniform int mode = 0;          // 0 = nothing yet, 1 = rgb, 2 = y + cbcr
uniform int rotate = 0;
uniform int mirror = 0;
uniform float video_range = 1.0;

void fragment() {
	vec2 uv = turn(UV, rotate, mirror);
	vec3 c = vec3(0.04);
	if (mode == 1) c = texture(rgb_tex, uv).rgb;
	else if (mode == 2) c = ycc_to_rgb(texture(y_tex, uv).r, texture(cbcr_tex, uv).rg, video_range);
	COLOR = vec4(c, 1.0);
}
