// MOTION — where the picture moves (TD: Cache TOP + Composite difference). A small ping-pong viewport keeps the
// last luminance in R and a decaying energy of |now − last| in G; the trace glows and the echo smears where the
// energy is: the material lives on what moves, and rests where the room rests.
shader_type canvas_item;
#include "res://lib/portal.gdshaderinc"

uniform sampler2D y_tex : filter_linear;
uniform sampler2D rgb_tex : filter_linear;
uniform int mode = 0;
uniform int rotate = 0;
uniform int mirror = 0;
uniform sampler2D prev_tex : filter_linear;
uniform float gain = 6.0;      // difference → energy
uniform float decay = 0.9;     // energy kept per frame

void fragment() {
	float l = cam_luma(y_tex, rgb_tex, mode, UV, rotate, mirror);
	vec2 prev = texture(prev_tex, UV).rg;
	float e = clamp(abs(l - prev.r) * gain, 0.0, 1.0);
	COLOR = vec4(l, max(e, prev.g * decay), 0.0, 1.0);
}
