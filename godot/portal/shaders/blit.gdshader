// BLIT — a viewport's picture onto a surface, as is.
shader_type canvas_item;

uniform sampler2D tex : filter_linear;

void fragment() {
	COLOR = vec4(texture(tex, UV).rgb, 1.0);
}
