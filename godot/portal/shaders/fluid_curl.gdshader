// FLUID · curl (PavelDoGreat, MIT — curlShader), reads VelOut; read by next frame's velocity step
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D vel_tex : filter_linear;
uniform vec2 size = vec2(270.0, 585.0);

void fragment() {
	vec2 texel = 1.0 / size;
	float L = texture(vel_tex, UV - vec2(texel.x, 0.0)).y;
	float R = texture(vel_tex, UV + vec2(texel.x, 0.0)).y;
	float T = texture(vel_tex, UV + vec2(0.0, texel.y)).x;
	float B = texture(vel_tex, UV - vec2(0.0, texel.y)).x;
	float vorticity = R - L - T + B;
	COLOR = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
