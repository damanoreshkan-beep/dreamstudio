// FLUID · gradient subtract (PavelDoGreat, MIT — gradientSubtractShader): the projected velocity = VelOut
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D pressure_tex : filter_linear;
uniform sampler2D vel_tex : filter_linear;
uniform vec2 size = vec2(270.0, 585.0);

void fragment() {
	vec2 texel = 1.0 / size;
	float L = texture(pressure_tex, UV - vec2(texel.x, 0.0)).x;
	float R = texture(pressure_tex, UV + vec2(texel.x, 0.0)).x;
	float T = texture(pressure_tex, UV + vec2(0.0, texel.y)).x;
	float B = texture(pressure_tex, UV - vec2(0.0, texel.y)).x;
	vec2 velocity = texture(vel_tex, UV).xy;
	velocity.xy -= vec2(R - L, T - B);
	COLOR = vec4(velocity, 0.0, 1.0);
}
