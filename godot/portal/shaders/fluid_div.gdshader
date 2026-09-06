// FLUID · divergence (PavelDoGreat, MIT — divergenceShader), reads Vel
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D vel_tex : filter_linear;
uniform vec2 size = vec2(270.0, 585.0);

void fragment() {
	vec2 texel = 1.0 / size;
	vec2 vL = UV - vec2(texel.x, 0.0), vR = UV + vec2(texel.x, 0.0), vT = UV + vec2(0.0, texel.y), vB = UV - vec2(0.0, texel.y);
	float L = texture(vel_tex, vL).x;
	float R = texture(vel_tex, vR).x;
	float T = texture(vel_tex, vT).y;
	float B = texture(vel_tex, vB).y;
	vec2 C = texture(vel_tex, UV).xy;
	if (vL.x < 0.0) { L = -C.x; }
	if (vR.x > 1.0) { R = -C.x; }
	if (vT.y > 1.0) { T = -C.y; }
	if (vB.y < 0.0) { B = -C.y; }
	float div = 0.5 * (R - L + T - B);
	COLOR = vec4(div, 0.0, 0.0, 1.0);
}
