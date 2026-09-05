// The camera on the screen. The feed arrives as the phone gives it: on Android an NV12 pair (a Y plane and an
// interleaved CbCr plane — "many cameras supply YCbCr images which need to be converted in a shader", the
// CameraTexture docs), on a desktop an RGB image. `mode` says which; `rotate` turns the landscape sensor into the
// portrait screen; `mirror` flips the front camera. BT.601, full range — the phone's own preview maths.
shader_type canvas_item;

uniform sampler2D y_tex : filter_linear;
uniform sampler2D cbcr_tex : filter_linear;
uniform sampler2D rgb_tex : filter_linear;
uniform int mode = 0;      // 0 = nothing yet, 1 = rgb, 2 = y + cbcr
uniform int rotate = 1;    // 1 = the sensor is landscape, the screen is portrait
uniform int mirror = 0;
uniform vec4 tint : source_color = vec4(1.0);

void fragment() {
	vec2 uv = UV;
	if (rotate == 1) uv = vec2(UV.y, 1.0 - UV.x);
	if (mirror == 1) uv.x = 1.0 - uv.x;
	vec3 c = vec3(0.04);
	if (mode == 1) {
		c = texture(rgb_tex, uv).rgb;
	} else if (mode == 2) {
		float y = texture(y_tex, uv).r;
		vec2 cbcr = texture(cbcr_tex, uv).rg - 0.5;
		c = vec3(y + 1.402 * cbcr.y, y - 0.344136 * cbcr.x - 0.714136 * cbcr.y, y + 1.772 * cbcr.x);
	}
	COLOR = vec4(clamp(c, 0.0, 1.0), 1.0) * tint;
}
