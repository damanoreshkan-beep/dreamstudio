// The camera on the screen. The feed arrives as the phone gives it: on Android an NV12 pair (a Y plane and an
// interleaved CbCr plane — "many cameras supply YCbCr images which need to be converted in a shader", the
// CameraTexture docs), on a desktop an RGB image. `mode` says which; `rotate` (quarter turns, from the feed's own
// transform) turns the sensor into the portrait screen; `mirror` flips the front camera. The maths follows the
// Android camera author's sample (shiena/GodotCameraFeedSample): Android delivers VIDEO range (Y 16–235,
// CbCr 16–240) and BT.709 — full range with BT.601 painted it wrong.
shader_type canvas_item;

uniform sampler2D y_tex : filter_linear;
uniform sampler2D cbcr_tex : filter_linear;
uniform sampler2D rgb_tex : filter_linear;
uniform int mode = 0;          // 0 = nothing yet, 1 = rgb, 2 = y + cbcr
uniform int rotate = 0;        // quarter turns clockwise the picture needs
uniform int mirror = 0;
uniform int video_range = 1;   // 1 = Y 16–235 / CbCr 16–240 (Android), 0 = full
uniform vec4 tint : source_color = vec4(1.0);

vec2 turn(vec2 uv, int q) {
	if (q == 1) return vec2(uv.y, 1.0 - uv.x);
	if (q == 2) return vec2(1.0 - uv.x, 1.0 - uv.y);
	if (q == 3) return vec2(1.0 - uv.y, uv.x);
	return uv;
}

void fragment() {
	vec2 uv = turn(UV, rotate);
	if (mirror == 1) uv.x = 1.0 - uv.x;
	uv = clamp(uv, vec2(0.0), vec2(1.0));
	vec3 c = vec3(0.04);
	if (mode == 1) {
		c = texture(rgb_tex, uv).rgb;
	} else if (mode == 2) {
		float y = texture(y_tex, uv).r;
		vec2 cbcr = texture(cbcr_tex, uv).rg;
		vec3 ycc;
		if (video_range == 1) {
			ycc.r = (y - 16.0 / 255.0) * (255.0 / 219.0);
			ycc.gb = (cbcr - 16.0 / 255.0) * (255.0 / 224.0) - vec2(0.5);
		} else {
			ycc.r = y;
			ycc.gb = cbcr - vec2(0.5);
		}
		c = mat3(vec3(1.0, 1.0, 1.0), vec3(0.0, -0.18732, 1.8556), vec3(1.57481, -0.46813, 0.0)) * ycc;
	}
	COLOR = vec4(clamp(c, 0.0, 1.0), 1.0) * tint;
}
