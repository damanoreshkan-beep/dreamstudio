# The presets — DATA, the twelve materials the web portal knows (apps/portal/presets.js), for the engine, as
# PHYSICS (docs/research/portal-art.md): what the person's motion does to the picture.
#   tex     the material texture (res://tex/<id>.webp)
#   look    the camera through the material's eye (look.gdshader: style, amount, p) — CC0 looks
#   screen  the surface the picture comes through (screen.gdshader: 0 as is · 1 time · 2 glass · 3 sort; p, amount)
#   fluid   the fluid the motion drives (PavelDoGreat): curl, force (flow → velocity), dissipation, carry (of trails)
#   dye     the camera as a liquid: hold (0 = as is, 0.9 = the picture smears along every movement)
#   rd      Gray–Scott growth on the contours: feed, kill, seed (contours × motion → B), gain (material on B)
#   edge / lines / shade / echo / motion  the trace, the tile and its drift, the tone hatching, the feedback
#   (decay per 1/30 s), the motion energy (gain, decay, lift)
# Every rate is per 1/30 s; the stage converts with the real dt. The page's knobs ({path: value}) are laid over
# by path — `tuned()` mirrors presets.js, so the page's knob paths land here too.
class_name Presets

const LIGHT := { "lines": { "blend": "normal" } }

const OFF_RD := { "feed": 0.055, "kill": 0.062, "seed": 0.0, "gain": 0.0, "dA": 1.0, "dB": 0.5 }

const DATA := {
	# СЯЙВО — light as a dye in the fluid: the network rides the vortices your hands leave
	"lum": { "tex": "lum", "look": { "style": 0, "amount": 1.0, "p": [0, 0, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 30.0, "force": 8.0, "dissipation": 0.3, "carry": 1.0 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 2.2, "step": 1.0, "floor": 0.12 },
		"lines": { "alpha": 0.6, "scale": 0.18, "speed": [10, -6], "tempo": 1.0, "shimmer": 0.15, "blend": "add" },
		"shade": { "amount": 0.35, "on": "light", "band": [0.72, 1.0] },
		"echo": { "decay": 0.94, "zoom": 1.002, "rot": 0.0, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 6.0, "decay": 0.9, "lift": 2.5 },
		"light": { "lines": { "alpha": 0.7 } } },
	# ПАПІР — a drawing on paper: posterised tone, hatching, a short memory
	"paper": { "tex": "paper", "look": { "style": 3, "amount": 0.8, "p": [6, 0.6, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 5.0, "force": 3.0, "dissipation": 1.0, "carry": 0.5 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 2.6, "step": 1.5, "floor": 0.2 },
		"lines": { "alpha": 0.9, "scale": 0.16, "speed": [0, 0], "tempo": 1.0, "shimmer": 0.05, "blend": "multiply", "invert": 1 },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.3, 0.8] },
		"echo": { "decay": 0.6, "zoom": 1.0, "rot": 0.0, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 5.0, "decay": 0.85, "lift": 1.5 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.95, "invert": 1 } } },
	# ТУШ — ink on wet paper: oil wash, and the growth of mitosis on the contours
	"ink": { "tex": "ink", "look": { "style": 1, "amount": 1.0, "p": [3, 0, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 10.0, "force": 5.0, "dissipation": 0.6, "carry": 0.8 }, "dye": { "hold": 0.0 },
		"rd": { "feed": 0.0367, "kill": 0.0649, "seed": 0.6, "gain": 0.8, "dA": 1.0, "dB": 0.5 },
		"edge": { "strength": 2.6, "step": 1.2, "floor": 0.15 },
		"lines": { "alpha": 0.95, "scale": 0.12, "speed": [3, 2], "tempo": 1.0, "shimmer": 0.1, "blend": "multiply" },
		"shade": { "amount": 0.6, "on": "dark", "band": [0.25, 0.7] },
		"echo": { "decay": 0.8, "zoom": 1.002, "rot": 0.0, "flow": [0, 2], "warp": 0.0 },
		"motion": { "gain": 6.0, "decay": 0.88, "lift": 2.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 1.0 } } },
	# РТУТЬ — liquid glass: the fluid refracts the picture, chroma splits on the fast edges
	"mercury": { "tex": "mercury", "look": { "style": 0, "amount": 1.0, "p": [0, 0, 0, 0] },
		"screen": { "mode": 2, "p": [40.0, 0.6, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 35.0, "force": 10.0, "dissipation": 0.25, "carry": 1.0 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 2.0, "step": 1.0, "floor": 0.12 },
		"lines": { "alpha": 0.5, "scale": 0.16, "speed": [15, 10], "tempo": 1.0, "shimmer": 0.3, "blend": "add" },
		"shade": { "amount": 0.4, "on": "light", "band": [0.7, 1.0] },
		"echo": { "decay": 0.9, "zoom": 1.004, "rot": 0.002, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 7.0, "decay": 0.9, "lift": 3.0 },
		"light": {} },
	# ДИМ — smoke in the fluid: the trails are the smoke, rising, curling off what moves
	"smoke": { "tex": "smoke", "look": { "style": 0, "amount": 1.0, "p": [0, 0, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 20.0, "force": 12.0, "dissipation": 0.1, "carry": 1.0 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 1.6, "step": 2.0, "floor": 0.1 },
		"lines": { "alpha": 0.7, "scale": 0.3, "speed": [5, -12], "tempo": 1.0, "shimmer": 0.4, "blend": "add" },
		"shade": { "amount": 0.5, "on": "dark", "band": [0.2, 0.7] },
		"echo": { "decay": 0.97, "zoom": 1.006, "rot": 0.0, "flow": [0, -2], "warp": 6.0 },
		"motion": { "gain": 8.0, "decay": 0.95, "lift": 4.0 },
		"light": {} },
	# НИТКА — hatching threads
	"thread": { "tex": "thread", "look": { "style": 2, "amount": 0.9, "p": [5, 1, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 5.0, "force": 3.0, "dissipation": 1.0, "carry": 0.5 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 2.4, "step": 1.0, "floor": 0.18 },
		"lines": { "alpha": 1.0, "scale": 0.1, "speed": [6, 0], "tempo": 1.0, "shimmer": 0.05, "blend": "multiply", "invert": 1 },
		"shade": { "amount": 0.9, "on": "dark", "band": [0.15, 0.85] },
		"echo": { "decay": 0.55, "zoom": 1.0, "rot": 0.0, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 5.0, "decay": 0.85, "lift": 1.5 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.95, "invert": 1 } } },
	# ПЛАТА — the signal breaks: pixel sorting where the tone passes, glitch bursts, a horizontal current
	"circuit": { "tex": "circuit", "look": { "style": 5, "amount": 1.0, "p": [0.25, 0, 0, 0] },
		"screen": { "mode": 3, "p": [0.7, 0.5, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 0.0, "force": 6.0, "dissipation": 0.8, "carry": 1.0 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 2.4, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.85, "scale": 0.2, "speed": [20, 0], "tempo": 1.0, "shimmer": 0.0, "blend": "add" },
		"shade": { "amount": 0.5, "on": "dark", "band": [0.2, 0.6] },
		"echo": { "decay": 0.8, "zoom": 1.0, "rot": 0.0, "flow": [6, 0], "warp": 0.0 },
		"motion": { "gain": 6.0, "decay": 0.9, "lift": 2.5 },
		"light": {} },
	# ЗАВІСА — liquid time: every pixel takes its moment from the last 16 frames by its tone
	"veil": { "tex": "veil", "look": { "style": 6, "amount": 1.0, "p": [0.08, 1, 0, 0] },
		"screen": { "mode": 1, "p": [15.0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 10.0, "force": 6.0, "dissipation": 0.4, "carry": 1.0 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 1.8, "step": 1.5, "floor": 0.12 },
		"lines": { "alpha": 0.6, "scale": 0.3, "speed": [-10, 5], "tempo": 1.0, "shimmer": 0.35, "blend": "add" },
		"shade": { "amount": 0.4, "on": "light", "band": [0.4, 0.9] },
		"echo": { "decay": 0.95, "zoom": 1.004, "rot": 0.002, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 6.0, "decay": 0.93, "lift": 3.0 },
		"light": {} },
	# ФЕРОФЛЮЇД — coral spikes grow on what moves (Gray–Scott), the fluid pulls them
	"ferro": { "tex": "ferro", "look": { "style": 3, "amount": 0.6, "p": [3, 0.2, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 15.0, "force": 6.0, "dissipation": 0.5, "carry": 1.0 }, "dye": { "hold": 0.0 },
		"rd": { "feed": 0.055, "kill": 0.062, "seed": 0.8, "gain": 1.0, "dA": 1.0, "dB": 0.5 },
		"edge": { "strength": 2.2, "step": 1.0, "floor": 0.14 },
		"lines": { "alpha": 0.9, "scale": 0.2, "speed": [8, 8], "tempo": 1.0, "shimmer": 0.2, "blend": "add" },
		"shade": { "amount": 0.4, "on": "dark", "band": [0.15, 0.6] },
		"echo": { "decay": 0.9, "zoom": 1.01, "rot": 0.0, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 8.0, "decay": 0.92, "lift": 4.0 },
		"light": {} },
	# ПОРЦЕЛЯНА — glaze
	"porcelain": { "tex": "porcelain", "look": { "style": 1, "amount": 0.8, "p": [2, 0, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 5.0, "force": 3.0, "dissipation": 1.0, "carry": 0.5 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 2.0, "step": 1.2, "floor": 0.16 },
		"lines": { "alpha": 0.85, "scale": 0.16, "speed": [0, 0], "tempo": 1.0, "shimmer": 0.05, "blend": "add" },
		"shade": { "amount": 0.5, "on": "light", "band": [0.55, 0.95] },
		"echo": { "decay": 0.6, "zoom": 1.0, "rot": 0.0, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 6.0, "decay": 0.88, "lift": 2.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.9, "invert": 1 } } },
	# ПІСОК — grain
	"sand": { "tex": "sand", "look": { "style": 6, "amount": 1.0, "p": [0.35, 2, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 5.0, "force": 4.0, "dissipation": 0.8, "carry": 0.7 }, "dye": { "hold": 0.0 }, "rd": OFF_RD,
		"edge": { "strength": 2.2, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.9, "scale": 0.12, "speed": [10, 0], "tempo": 1.0, "shimmer": 0.1, "blend": "multiply" },
		"shade": { "amount": 0.7, "on": "dark", "band": [0.2, 0.75] },
		"echo": { "decay": 0.7, "zoom": 1.002, "rot": 0.0, "flow": [1, 0], "warp": 0.0 },
		"motion": { "gain": 6.0, "decay": 0.88, "lift": 2.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.9 } } },
	# ПРОСТО — the camera itself as a liquid: no material, the picture smears along every movement and settles
	"plain": { "tex": "", "look": { "style": 0, "amount": 1.0, "p": [0, 0, 0, 0] },
		"screen": { "mode": 0, "p": [0, 0, 0, 0], "amount": 1.0 },
		"fluid": { "curl": 25.0, "force": 10.0, "dissipation": 0.3, "carry": 1.0 }, "dye": { "hold": 0.92 }, "rd": OFF_RD,
		"edge": { "strength": 2.0, "step": 1.0, "floor": 0.15 },
		"lines": { "alpha": 0.0, "scale": 0.25, "speed": [0, 0], "tempo": 1.0, "shimmer": 0.0, "blend": "add" },
		"shade": { "amount": 0.0, "on": "dark", "band": [0.3, 0.8] },
		"echo": { "decay": 0.8, "zoom": 1.0, "rot": 0.0, "flow": [0, 0], "warp": 0.0 },
		"motion": { "gain": 6.0, "decay": 0.9, "lift": 0.0 },
		"light": { "lines": { "blend": "multiply", "alpha": 0.0 } } },
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
