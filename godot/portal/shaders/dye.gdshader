// DYE — the camera as a liquid (PavelDoGreat's dye advection, MIT, with the camera as the source): the last
// picture carried along the fluid, the live picture poured in at (1 − hold). hold 0 = the camera as is; 0.9 =
// the picture smears along every movement and settles back — datamosh without a codec. Ping-pong at half.
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D look_tex : filter_linear;   // LookView
uniform sampler2D prev_tex : filter_linear;   // the other dye viewport
uniform sampler2D vel_tex : filter_linear;    // VelOut
uniform vec2 fluid_size = vec2(270.0, 585.0);
uniform float dt = 1.0;
uniform float hold = 0.0;

void fragment() {
	vec3 live = texture(look_tex, UV).rgb;
	vec2 v = texture(vel_tex, UV).xy;
	vec2 uv = UV - dt * v / fluid_size;
	vec3 carried = texture(prev_tex, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
	float moving = clamp(length(v) * 2.0, 0.0, 1.0);
	// the picture holds where the fluid moves it, and is refreshed where it rests
	COLOR = vec4(mix(live, carried, hold * max(moving, 0.3)), 1.0);
}
