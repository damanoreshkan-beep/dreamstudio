# The presets — DATA, the same twelve materials the web portal knows (apps/portal/presets.js), for the engine.
# A preset names its texture (res://tex/<id>.webp), its LOOK (the camera through the material's eye — a CC0
# style from godotshaders.com, see look.gdshader: style, amount, p), the trace (edge), the material's tile and
# drift (lines: scale of a 1024 tile, speed px/s in a 1080-wide frame, shimmer), the tone hatching (shade), the
# feedback (echo: decay per 1/30 s, zoom and rot per 1/30 s, flow px per 1/30 s, warp px, motion_push), the
# motion energy (motion: gain, decay per frame, and how much it lifts the line), the blend of the loop over the
# camera, and light-theme overrides. The page's knobs ({path: value}) are laid over by path — `tuned()` mirrors
# presets.js, so the page's knob paths (lines.alpha, edge.strength, echo.decay, lines.tempo, …) land here too.
class_name Presets

const LIGHT := { "lines": { "blend": "normal" } }

const DATA := {
	"lum": { "tex": "lum", "look": { "style": 0, "amount": 1.0, "p": [0, 0, 0, 0] },
		"edge": { "strength": 2.2, "step": 1.0, "floor": 0.12 },
		"lines": { "alpha": 0.6, "scale": 0.18, "speed": [30, -20], "tempo": 1.0, "shimmer": 0.15, "blend": "add" },
		"shade": { "amount": 0.35, "on": "light", "band": [0.72, 1.0] },
		"echo": { "decay": 0.92, "zoom": 1.004, "rot": 0.002, "flow": [0, 0], "warp": 2.0, "motion_push": 3.0 },
		"motion": { "gain": 6.0, "decay": 0.9, "lift": 2.5 },
		"light": { "lines": { "alpha": 0.7 } } },
	"paper": { "tex": "paper", "look": { "style": 3, "amount": 0.8, "p": [6, 0.6, 0, 0] },
		"edge": { "strength": 2.6, "step": 1.5, "floor": 0.2 },
		"lines": { "alpha": 0.9, "scale": 0.16, "speed": [0, 0], "tempo": 1.0, "shimmer": 0.05, "blend": "multiply", "invert": 1 },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.3, 0.8] },
		"echo": { "decay": 0.6, "zoom": 1.0, "rot": 0.0, "flow": [0, 0], "warp": 0.0, "motion_push": 0.0 },
		"motion": { "gain": 5.0, "decay": 0.85, "lift": 1.5 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.95, "invert": 1 } } },
	"ink": { "tex": "ink", "look": { "style": 1, "amount": 1.0, "p": [3, 0, 0, 0] },
		"edge": { "strength": 2.6, "step": 1.2, "floor": 0.15 },
		"lines": { "alpha": 0.95, "scale": 0.12, "speed": [8, 4], "tempo": 1.0, "shimmer": 0.1, "blend": "multiply" },
		"shade": { "amount": 0.75, "on": "dark", "band": [0.25, 0.7] },
		"echo": { "decay": 0.75, "zoom": 1.004, "rot": -0.001, "flow": [0, 6], "warp": 5.0, "motion_push": 2.0 },
		"motion": { "gain": 6.0, "decay": 0.88, "lift": 2.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 1.0 } } },
	"mercury": { "tex": "mercury", "look": { "style": 4, "amount": 1.0, "p": [0.02, 0, 0, 0] },
		"edge": { "strength": 2.0, "step": 1.0, "floor": 0.12 },
		"lines": { "alpha": 0.55, "scale": 0.16, "speed": [40, 25], "tempo": 1.0, "shimmer": 0.3, "blend": "add" },
		"shade": { "amount": 0.45, "on": "light", "band": [0.7, 1.0] },
		"echo": { "decay": 0.85, "zoom": 1.01, "rot": 0.004, "flow": [0, 0], "warp": 4.0, "motion_push": 4.0 },
		"motion": { "gain": 7.0, "decay": 0.9, "lift": 3.0 },
		"light": {} },
	"smoke": { "tex": "smoke", "look": { "style": 0, "amount": 1.0, "p": [0, 0, 0, 0] },
		"edge": { "strength": 1.6, "step": 2.0, "floor": 0.1 },
		"lines": { "alpha": 0.7, "scale": 0.3, "speed": [15, -40], "tempo": 1.0, "shimmer": 0.4, "blend": "add" },
		"shade": { "amount": 0.5, "on": "dark", "band": [0.2, 0.7] },
		"echo": { "decay": 0.96, "zoom": 1.01, "rot": 0.0, "flow": [0, -3], "warp": 12.0, "motion_push": 5.0 },
		"motion": { "gain": 8.0, "decay": 0.95, "lift": 4.0 },
		"light": {} },
	"thread": { "tex": "thread", "look": { "style": 2, "amount": 0.9, "p": [5, 1, 0, 0] },
		"edge": { "strength": 2.4, "step": 1.0, "floor": 0.18 },
		"lines": { "alpha": 1.0, "scale": 0.1, "speed": [20, 0], "tempo": 1.0, "shimmer": 0.05, "blend": "multiply", "invert": 1 },
		"shade": { "amount": 0.9, "on": "dark", "band": [0.15, 0.85] },
		"echo": { "decay": 0.55, "zoom": 1.0, "rot": 0.0, "flow": [0, 0], "warp": 0.0, "motion_push": 0.0 },
		"motion": { "gain": 5.0, "decay": 0.85, "lift": 1.5 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.95, "invert": 1 } } },
	"circuit": { "tex": "circuit", "look": { "style": 5, "amount": 1.0, "p": [0.25, 0, 0, 0] },
		"edge": { "strength": 2.4, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.85, "scale": 0.2, "speed": [60, 0], "tempo": 1.0, "shimmer": 0.0, "blend": "add" },
		"shade": { "amount": 0.5, "on": "dark", "band": [0.2, 0.6] },
		"echo": { "decay": 0.8, "zoom": 1.0, "rot": 0.0, "flow": [6, 0], "warp": 0.0, "motion_push": 2.0 },
		"motion": { "gain": 6.0, "decay": 0.9, "lift": 2.5 },
		"light": {} },
	"veil": { "tex": "veil", "look": { "style": 6, "amount": 1.0, "p": [0.12, 1, 0, 0] },
		"edge": { "strength": 1.8, "step": 1.5, "floor": 0.12 },
		"lines": { "alpha": 0.7, "scale": 0.3, "speed": [-30, 15], "tempo": 1.0, "shimmer": 0.35, "blend": "add" },
		"shade": { "amount": 0.5, "on": "light", "band": [0.4, 0.9] },
		"echo": { "decay": 0.95, "zoom": 1.008, "rot": 0.003, "flow": [0, 0], "warp": 8.0, "motion_push": 3.0 },
		"motion": { "gain": 6.0, "decay": 0.93, "lift": 3.0 },
		"light": {} },
	"ferro": { "tex": "ferro", "look": { "style": 3, "amount": 0.7, "p": [3, 0.2, 0, 0] },
		"edge": { "strength": 2.2, "step": 1.0, "floor": 0.14 },
		"lines": { "alpha": 0.9, "scale": 0.2, "speed": [25, 25], "tempo": 1.0, "shimmer": 0.2, "blend": "add" },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.15, 0.6] },
		"echo": { "decay": 0.88, "zoom": 1.02, "rot": 0.0, "flow": [0, 0], "warp": 10.0, "motion_push": 6.0 },
		"motion": { "gain": 8.0, "decay": 0.92, "lift": 4.0 },
		"light": {} },
	"porcelain": { "tex": "porcelain", "look": { "style": 1, "amount": 0.8, "p": [2, 0, 0, 0] },
		"edge": { "strength": 2.0, "step": 1.2, "floor": 0.16 },
		"lines": { "alpha": 0.85, "scale": 0.16, "speed": [0, 0], "tempo": 1.0, "shimmer": 0.05, "blend": "add" },
		"shade": { "amount": 0.5, "on": "light", "band": [0.55, 0.95] },
		"echo": { "decay": 0.6, "zoom": 1.0, "rot": 0.0, "flow": [0, 0], "warp": 0.0, "motion_push": 1.0 },
		"motion": { "gain": 6.0, "decay": 0.88, "lift": 2.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.9, "invert": 1 } } },
	"sand": { "tex": "sand", "look": { "style": 6, "amount": 1.0, "p": [0.35, 2, 0, 0] },
		"edge": { "strength": 2.2, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.9, "scale": 0.12, "speed": [30, 0], "tempo": 1.0, "shimmer": 0.1, "blend": "multiply" },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.2, 0.75] },
		"echo": { "decay": 0.7, "zoom": 1.002, "rot": 0.0, "flow": [2, 1], "warp": 0.0, "motion_push": 1.0 },
		"motion": { "gain": 6.0, "decay": 0.88, "lift": 2.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.9 } } },
	"plain": { "tex": "", "look": { "style": 0, "amount": 1.0, "p": [0, 0, 0, 0] },
		"edge": { "strength": 2.0, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.75, "scale": 0.25, "speed": [0, 0], "tempo": 1.0, "shimmer": 0.0, "blend": "add" },
		"shade": { "amount": 0.0, "on": "dark", "band": [0.3, 0.8] },
		"echo": { "decay": 0.8, "zoom": 1.006, "rot": 0.0, "flow": [0, 0], "warp": 0.0, "motion_push": 2.0 },
		"motion": { "gain": 6.0, "decay": 0.9, "lift": 2.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.8, "invert": 1 } } },
}

static func _merge(base: Dictionary, over: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for k in over:
		if out.has(k) and typeof(out[k]) == TYPE_DICTIONARY and typeof(over[k]) == TYPE_DICTIONARY:
			out[k] = _merge(out[k], over[k])
		else:
			out[k] = over[k]
	return out

## The mode's numbers: LIGHT, then the preset's light overrides, over the preset.
static func graph_of(id: String, light: bool) -> Dictionary:
	var p: Dictionary = DATA.get(id, DATA["plain"])
	if not light: return p.duplicate(true)
	return _merge(_merge(p, LIGHT), p.get("light", {}))

## The mode's numbers with the person's knobs ({ "lines.alpha": 0.5, … }) laid over by path.
static func tuned(id: String, light: bool, knobs: Dictionary) -> Dictionary:
	var g := graph_of(id, light)
	for path in knobs:
		var ks: PackedStringArray = String(path).split(".")
		if ks.size() == 0 or ks[0] == "chain": continue
		var node: Dictionary = g
		for i in range(ks.size() - 1):
			if not node.has(ks[i]) or typeof(node[ks[i]]) != TYPE_DICTIONARY: node[ks[i]] = {}
			node = node[ks[i]]
		node[ks[ks.size() - 1]] = knobs[path]
	return g
