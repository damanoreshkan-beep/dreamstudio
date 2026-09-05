# The presets — DATA, the same twelve materials the web portal knows (apps/portal/presets.js), for the engine.
# A preset names its texture (res://tex/<id>.webp), the trace (edge), the material's tile and drift (lines), the
# tone hatching (shade), the feedback (echo), the blend of the loop over the camera, and light-theme overrides.
# The page's knobs ({path: value}) are laid over the mode's numbers by path — `tuned()` mirrors presets.js.
class_name Presets

const LIGHT := { "lines": { "blend": "normal" } }

const DATA := {
	"lum": { "tex": "lum", "edge": { "strength": 2.2, "step": 1.0, "floor": 0.12 },
		"lines": { "alpha": 0.6, "scale": 0.18, "speed": [6, -4], "blend": "add" },
		"shade": { "amount": 0.35, "on": "light", "band": [0.72, 1.0] },
		"echo": { "decay": 0.86, "zoom": 1.006, "rot": 0.002 }, "light": { "lines": { "alpha": 0.7 } } },
	"paper": { "tex": "paper", "edge": { "strength": 2.6, "step": 1.5, "floor": 0.2 },
		"lines": { "alpha": 0.9, "scale": 0.16, "speed": [0, 0], "blend": "multiply", "invert": 1 },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.3, 0.8] },
		"echo": { "decay": 0.5, "zoom": 1.0, "rot": 0.0 }, "light": { "lines": { "blend": "multiply", "alpha": 0.95, "invert": 1 } } },
	"ink": { "tex": "ink", "edge": { "strength": 2.6, "step": 1.2, "floor": 0.15 },
		"lines": { "alpha": 0.95, "scale": 0.12, "speed": [2, 1], "blend": "multiply" },
		"shade": { "amount": 0.75, "on": "dark", "band": [0.25, 0.7] },
		"echo": { "decay": 0.7, "zoom": 1.004, "rot": -0.001 }, "light": { "lines": { "blend": "multiply", "alpha": 1.0 } } },
	"mercury": { "tex": "mercury", "edge": { "strength": 2.0, "step": 1.0, "floor": 0.12 },
		"lines": { "alpha": 0.55, "scale": 0.16, "speed": [8, 5], "blend": "add" },
		"shade": { "amount": 0.45, "on": "light", "band": [0.7, 1.0] },
		"echo": { "decay": 0.8, "zoom": 1.0, "rot": 0.0 }, "light": {} },
	"smoke": { "tex": "smoke", "edge": { "strength": 1.6, "step": 2.0, "floor": 0.1 },
		"lines": { "alpha": 0.7, "scale": 0.3, "speed": [3, -8], "blend": "add" },
		"shade": { "amount": 0.5, "on": "dark", "band": [0.2, 0.7] },
		"echo": { "decay": 0.93, "zoom": 1.012, "rot": 0.0 }, "light": {} },
	"thread": { "tex": "thread", "edge": { "strength": 2.4, "step": 1.0, "floor": 0.18 },
		"lines": { "alpha": 1.0, "scale": 0.1, "speed": [4, 0], "blend": "multiply", "invert": 1 },
		"shade": { "amount": 0.9, "on": "dark", "band": [0.15, 0.85] },
		"echo": { "decay": 0.6, "zoom": 1.0, "rot": 0.0 }, "light": { "lines": { "blend": "multiply", "alpha": 0.95, "invert": 1 } } },
	"circuit": { "tex": "circuit", "edge": { "strength": 2.4, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.85, "scale": 0.2, "speed": [12, 0], "blend": "add" },
		"shade": { "amount": 0.5, "on": "dark", "band": [0.2, 0.6] },
		"echo": { "decay": 0.75, "zoom": 1.0, "rot": 0.0 }, "light": {} },
	"veil": { "tex": "veil", "edge": { "strength": 1.8, "step": 1.5, "floor": 0.12 },
		"lines": { "alpha": 0.7, "scale": 0.3, "speed": [-6, 3], "blend": "add" },
		"shade": { "amount": 0.5, "on": "light", "band": [0.4, 0.9] },
		"echo": { "decay": 0.9, "zoom": 1.008, "rot": 0.003 }, "light": {} },
	"ferro": { "tex": "ferro", "edge": { "strength": 2.2, "step": 1.0, "floor": 0.14 },
		"lines": { "alpha": 0.9, "scale": 0.2, "speed": [5, 5], "blend": "add" },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.15, 0.6] },
		"echo": { "decay": 0.85, "zoom": 1.015, "rot": 0.0 }, "light": {} },
	"porcelain": { "tex": "porcelain", "edge": { "strength": 2.0, "step": 1.2, "floor": 0.16 },
		"lines": { "alpha": 0.85, "scale": 0.16, "speed": [0, 0], "blend": "add" },
		"shade": { "amount": 0.5, "on": "light", "band": [0.55, 0.95] },
		"echo": { "decay": 0.55, "zoom": 1.0, "rot": 0.0 }, "light": { "lines": { "blend": "multiply", "alpha": 0.9, "invert": 1 } } },
	"sand": { "tex": "sand", "edge": { "strength": 2.2, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.9, "scale": 0.12, "speed": [6, 0], "blend": "multiply" },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.2, 0.75] },
		"echo": { "decay": 0.7, "zoom": 1.002, "rot": 0.0 }, "light": { "lines": { "blend": "multiply", "alpha": 0.9 } } },
	"plain": { "tex": "", "edge": { "strength": 2.0, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.75, "scale": 0.25, "speed": [0, 0], "blend": "add" },
		"shade": { "amount": 0.0, "on": "dark", "band": [0.3, 0.8] },
		"echo": { "decay": 0.8, "zoom": 1.006, "rot": 0.0 }, "light": { "lines": { "blend": "multiply", "alpha": 0.8, "invert": 1 } } },
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
