// FLUID · one Jacobi iteration of the pressure (PavelDoGreat, MIT — pressureShader). Four of these viewports
// are chained per frame; the first reads the last frame's result faded by `warm` (the original's clear step,
// PRESSURE 0.8).
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D pressure_tex : filter_linear;
uniform sampler2D div_tex : filter_linear;
uniform vec2 size = vec2(270.0, 585.0);
uniform float warm = 1.0;

void fragment() {
	vec2 texel = 1.0 / size;
	float L = texture(pressure_tex, UV - vec2(texel.x, 0.0)).x;
	float R = texture(pressure_tex, UV + vec2(texel.x, 0.0)).x;
	float T = texture(pressure_tex, UV + vec2(0.0, texel.y)).x;
	float B = texture(pressure_tex, UV - vec2(0.0, texel.y)).x;
	float divergence = texture(div_tex, UV).x;
	float pressure = (warm * (L + R + B + T) - divergence) * 0.25;
	COLOR = vec4(pressure, 0.0, 0.0, 1.0);
}
