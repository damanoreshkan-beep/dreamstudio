// FLUID · velocity step — PavelDoGreat/WebGL-Fluid-Simulation (MIT), the three passes that touch the velocity
// before projection, fused into one (each Godot viewport is one pass per frame): vorticity confinement from
// last frame's curl, the splat from the optical flow where the picture moves, then self-advection with
// dissipation. Units: px of this grid per frame. Reads VelOut (last frame) and Curl (last frame).
shader_type canvas_item;
render_mode blend_disabled;

uniform sampler2D vel_tex : filter_linear;      // VelOut, last frame
uniform sampler2D curl_tex : filter_linear;     // Curl, last frame
uniform sampler2D motion_tex : filter_linear;   // Motion: G energy, BA flow
uniform vec2 size = vec2(270.0, 585.0);
uniform float dt = 1.0;                         // this frame in the presets' frames (dt·30)
uniform float curl = 30.0;                      // the original's CURL
uniform float dissipation = 0.2;                // the original's VELOCITY_DISSIPATION (per second-ish)
uniform float force = 8.0;                      // the flow → velocity gain (the original's splat force)

void fragment() {
	vec2 texel = 1.0 / size;
	vec2 uv = UV;
	vec2 L = uv - vec2(texel.x, 0.0), R = uv + vec2(texel.x, 0.0), T = uv + vec2(0.0, texel.y), B = uv - vec2(0.0, texel.y);
	// vorticity (the original's vorticityShader)
	float cL = texture(curl_tex, L).x, cR = texture(curl_tex, R).x, cT = texture(curl_tex, T).x, cB = texture(curl_tex, B).x;
	float cC = texture(curl_tex, uv).x;
	vec2 f = 0.5 * vec2(abs(cT) - abs(cB), abs(cR) - abs(cL));
	f /= length(f) + 0.0001;
	f *= curl * cC;
	f.y *= -1.0;
	vec2 velocity = texture(vel_tex, uv).xy + f * dt * 0.01;
	// the splat (the original adds a gaussian at the pointer; here the flow itself, where the picture moves)
	vec4 m = texture(motion_tex, uv);
	velocity += m.ba * force * m.g * dt;
	// advection (the original's advectionShader, on the velocity itself)
	vec2 coord = uv - dt * velocity * texel;
	vec2 adv = texture(vel_tex, coord).xy;
	float decay = 1.0 + dissipation * dt * 0.033;
	velocity = mix(adv, velocity, 0.5) / decay;
	velocity = clamp(velocity, vec2(-100.0), vec2(100.0));
	COLOR = vec4(velocity, 0.0, 1.0);
}
