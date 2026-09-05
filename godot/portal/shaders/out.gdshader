// OUT — the loop over the camera: add for the luminous materials, multiply for the drawing ones, normal for the
// light theme's pale ground. The camera itself is drawn AS IS underneath (the node below this one).
shader_type canvas_item;
render_mode blend_premul_alpha;

uniform sampler2D loop_tex : filter_linear;
uniform int mode = 0;          // 0 add, 1 multiply, 2 normal
uniform sampler2D screen_tex : hint_screen_texture, filter_linear;

void fragment() {
	vec4 l = texture(loop_tex, UV);      // premultiplied: rgb = material·w, a = w
	vec3 under = texture(screen_tex, SCREEN_UV).rgb;
	vec3 out_rgb;
	if (mode == 0) out_rgb = under + l.rgb;                                   // add
	else if (mode == 1) out_rgb = under * mix(vec3(1.0), l.rgb / max(l.a, 1e-4), l.a);   // multiply by the material where it is
	else out_rgb = under * (1.0 - l.a) + l.rgb;                               // normal (over)
	COLOR = vec4(clamp(out_rgb, 0.0, 1.0), 1.0);
}
