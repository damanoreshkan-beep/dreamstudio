# The portal's stage — the picture as a MEDIUM WITH PHYSICS the person disturbs (docs/research/portal-art.md),
# on TD's nodes as Godot has them (every SubViewport = one pass per frame; a chain in tree order = several):
#   Camera      Godot's own camera demo as a node (camera.gd)
#   LookView    the camera through the material's eye (look.gdshader)
#   MotionA/B   ping-pong ¼: R luminance · G energy · BA OPTICAL FLOW (keeffEoghan)
#   Vel→Div→P1..P4→VelOut→Curl   the FLUID (PavelDoGreat), ¼, chained per frame; the flow is its splat
#   DyeA/B      ping-pong ½: the camera as a liquid (advected picture)
#   RD1..RD4    Gray–Scott growth, ½, four steps per frame, seeded by contours × motion
#   Slots       a 4×4 ring of the last 16 looks (time)
#   LoopA/B     Feedback TOP: Echo (the last frame carried by the fluid) under Fresh (the trace by the material)
#   Cam         the dye through the surface (screen.gdshader: as is / time / glass / sort)
#   Out         the loop over the picture
#   Still       a save at the sensor's largest format (StillLook / StillLoop / Still)
# Every preset rate is per 1/30 s and converted with the real dt. The page (a transparent WebView) speaks through
# the shell's MsPortal singleton — signals in (set / input / save / stop), methods out (state / savedFile).
extends Control

const TEX_PX := 1024.0          # the material textures' side
const REF_W := 1080.0           # the width every px number in the presets is written for
const BASE_FPS := 30.0          # the frame the presets' rates are written for
const PREVIEW_W := 1280         # the live view's format: the widest under this — the screen needs no more

var portal = null
var params := {}                # every set() key/value the page handed over
var preset := {}                # the tuned graph of the current material
var mat_tex: Texture2D = null
var phase := Vector2.ZERO
var beat := 0.0
var flip_a := true              # which ping-pong viewport renders this frame
var slot := 0                   # the newest time slot
var quarter := 0
var mirror := 0
var saving := false
var previewing := false         # the one-time move from the demo's format 0 to the preview format

@onready var cam: PortalCamera = $Camera
@onready var look: ShaderMaterial = $LookView/Pass.material
@onready var motion_a: ShaderMaterial = $MotionA/Pass.material
@onready var motion_b: ShaderMaterial = $MotionB/Pass.material
@onready var vel: ShaderMaterial = $Vel/Pass.material
@onready var div: ShaderMaterial = $Div/Pass.material
@onready var pressures: Array = [$P1/Pass.material, $P2/Pass.material, $P3/Pass.material, $P4/Pass.material]
@onready var velout: ShaderMaterial = $VelOut/Pass.material
@onready var curl: ShaderMaterial = $Curl/Pass.material
@onready var dye_a: ShaderMaterial = $DyeA/Pass.material
@onready var dye_b: ShaderMaterial = $DyeB/Pass.material
@onready var rds: Array = [$RD1/Pass.material, $RD2/Pass.material, $RD3/Pass.material, $RD4/Pass.material]
@onready var slot_pass: ColorRect = $Slots/Pass
@onready var trace: ShaderMaterial = $LoopA/Fresh.material
@onready var still_trace: ShaderMaterial = $StillLoop/Fresh.material
@onready var echo_a: ShaderMaterial = $LoopA/Echo.material
@onready var echo_b: ShaderMaterial = $LoopB/Echo.material
@onready var screen: ShaderMaterial = $Cam.material
@onready var screen_still: ShaderMaterial = $Still/Cam.material
@onready var out: ShaderMaterial = $Out.material

func _ready() -> void:
	if Engine.has_singleton("MsPortal"):
		portal = Engine.get_singleton("MsPortal")
		portal.connect("set", _on_set)
		portal.connect("input", _on_input)
		portal.connect("save", _on_save)
		portal.connect("stop", _on_stop)
	_bind_textures()
	# the graph's wires (docs/research/portal-art.md §3) — each reads a viewport rendered before it in the
	# tree (this frame) or after it (last frame)
	motion_a.set_shader_parameter("prev_tex", $MotionB.get_texture())
	motion_b.set_shader_parameter("prev_tex", $MotionA.get_texture())
	vel.set_shader_parameter("vel_tex", $VelOut.get_texture())
	vel.set_shader_parameter("curl_tex", $Curl.get_texture())
	div.set_shader_parameter("vel_tex", $Vel.get_texture())
	var pvs: Array = [$P1, $P2, $P3, $P4]
	for i in 4:
		pressures[i].set_shader_parameter("div_tex", $Div.get_texture())
		pressures[i].set_shader_parameter("pressure_tex", (pvs[i - 1] if i > 0 else $P4).get_texture())
		pressures[i].set_shader_parameter("warm", 1.0 if i > 0 else 0.8)
	velout.set_shader_parameter("vel_tex", $Vel.get_texture())
	velout.set_shader_parameter("pressure_tex", $P4.get_texture())
	curl.set_shader_parameter("vel_tex", $VelOut.get_texture())
	for m in [dye_a, dye_b]:
		m.set_shader_parameter("look_tex", $LookView.get_texture())
		m.set_shader_parameter("vel_tex", $VelOut.get_texture())
	dye_a.set_shader_parameter("prev_tex", $DyeB.get_texture())
	dye_b.set_shader_parameter("prev_tex", $DyeA.get_texture())
	var rvs: Array = [$RD1, $RD2, $RD3, $RD4]
	for i in 4:
		rds[i].set_shader_parameter("prev_tex", (rvs[i - 1] if i > 0 else $RD4).get_texture())
	slot_pass.material.set_shader_parameter("tex", $LookView.get_texture())
	slot_pass.material.set_shader_parameter("mode", 0)
	echo_a.set_shader_parameter("prev_tex", $LoopB.get_texture())
	echo_b.set_shader_parameter("prev_tex", $LoopA.get_texture())
	for m in [echo_a, echo_b]: m.set_shader_parameter("vel_tex", $VelOut.get_texture())
	for m in [trace, still_trace]: m.set_shader_parameter("rd_tex", $RD4.get_texture())
	for m in [screen, screen_still]:
		m.set_shader_parameter("slots_tex", $Slots.get_texture())
		m.set_shader_parameter("vel_tex", $VelOut.get_texture())
	screen_still.set_shader_parameter("tex", $StillLook.get_texture())
	$Still/Out.material = out.duplicate()
	get_viewport().size_changed.connect(_layout)
	_layout()
	_apply()
	cam.bound.connect(_on_bound)
	cam.note.connect(func(text: String): _report({"state": "running", "detail": text}))
	cam.want_position = _wanted_position()
	cam.start()
	_report({"state": "running", "width": int(size.x), "height": int(size.y)})

# every material that reads the sensor's planes
func _sensor_materials() -> Array:
	return [look, trace, still_trace, motion_a, motion_b] + rds

# the demo's four CameraTextures into every sensor material — again on every bind: a CameraTexture's RID is
# the feed's texture at the moment the parameter is set (a placeholder before the feed is bound)
func _bind_textures() -> void:
	for m in _sensor_materials():
		m.set_shader_parameter("rgb_texture", cam.rgb_texture)
		m.set_shader_parameter("y_texture", cam.y_texture)
		m.set_shader_parameter("cbcr_texture", cam.cbcr_texture)
		m.set_shader_parameter("ycbcr_texture", cam.ycbcr_texture)

# the viewports: the look and the slots at the screen's own pixels, the loops at `detail` (2 = the screen,
# 1 = half), the dye and the growth at half the loop, the motion and the fluid at a quarter
func _layout() -> void:
	var s := Vector2i(get_viewport().get_visible_rect().size)
	var d: float = float(preset.get("detail", 2))
	var ls := Vector2i(maxi(1, int(s.x * d / 2.0)), maxi(1, int(s.y * d / 2.0)))
	var hs := Vector2i(maxi(1, ls.x / 2), maxi(1, ls.y / 2))
	var fs := Vector2i(maxi(1, ls.x / 4), maxi(1, ls.y / 4))
	_size_vp($LookView, s)
	_size_vp($Slots, s)
	slot_pass.size = Vector2(s) / 4.0
	for vp in [$LoopA, $LoopB]: _size_vp(vp, ls)
	for vp in [$DyeA, $DyeB, $RD1, $RD2, $RD3, $RD4]: _size_vp(vp, hs)
	for vp in [$MotionA, $MotionB, $Vel, $Div, $P1, $P2, $P3, $P4, $VelOut, $Curl]: _size_vp(vp, fs)
	look.set_shader_parameter("size", Vector2(s))
	trace.set_shader_parameter("size", Vector2(ls))
	for m in [motion_a, motion_b, vel, div, velout, curl] + pressures: m.set_shader_parameter("size", Vector2(fs))
	for m in rds: m.set_shader_parameter("size", Vector2(hs))
	for m in [echo_a, echo_b, dye_a, dye_b, screen, screen_still]: m.set_shader_parameter("fluid_size", Vector2(fs))
	for m in [echo_a, echo_b]: m.set_shader_parameter("size", Vector2(ls))
	screen.set_shader_parameter("size", Vector2(s))
	_tile()

func _size_vp(vp: SubViewport, s: Vector2i) -> void:
	vp.size = s
	for child in vp.get_children():
		if child != slot_pass: child.size = Vector2(s)

func _tile() -> void:
	var vs := Vector2($LoopA.size)
	trace.set_shader_parameter("period", _period(vs.x))

func _period(width: float) -> float:
	return float(preset.get("lines", {}).get("scale", 0.25)) * TEX_PX * width / REF_W

func _process(dt: float) -> void:
	if saving: return
	var k: float = dt * BASE_FPS          # this frame in the presets' frames
	var li: Dictionary = preset.get("lines", {})
	var ec: Dictionary = preset.get("echo", {})
	# the tile drifts (px/s in the reference width) — a shimmer, never a film
	var sp: Array = li.get("speed", [0, 0])
	var vs := Vector2($LoopA.size)
	var period: float = float(trace.get_shader_parameter("period"))
	phase += Vector2(float(sp[0]), float(sp[1])) * float(li.get("tempo", 1.0)) * dt * (vs.x / REF_W) / period
	phase = Vector2(fposmod(phase.x, 1.0), fposmod(phase.y, 1.0))
	trace.set_shader_parameter("phase", phase)
	# this frame's rates
	var fl: Array = ec.get("flow", [0, 0])
	for m in [echo_a, echo_b]:
		m.set_shader_parameter("dt", k)
		m.set_shader_parameter("decay", pow(float(ec.get("decay", 0.9)), k))
		m.set_shader_parameter("zoom", pow(float(ec.get("zoom", 1.0)), k))
		m.set_shader_parameter("rot", float(ec.get("rot", 0.0)) * k)
		m.set_shader_parameter("flow", Vector2(float(fl[0]), float(fl[1])) * (vs.x / REF_W))
	vel.set_shader_parameter("dt", k)
	for m in [dye_a, dye_b]: m.set_shader_parameter("dt", k)
	# the ping-pongs: one of each pair renders this frame, reading the other's last
	var mv: SubViewport = $MotionA if flip_a else $MotionB
	var dv: SubViewport = $DyeA if flip_a else $DyeB
	var lv: SubViewport = $LoopA if flip_a else $LoopB
	for v in [mv, dv, lv]: v.render_target_update_mode = SubViewport.UPDATE_ONCE
	var mt := mv.get_texture()
	for m in [trace, still_trace, vel, screen, screen_still] + rds: m.set_shader_parameter("motion_tex", mt)
	screen.set_shader_parameter("tex", dv.get_texture())
	out.set_shader_parameter("loop_tex", lv.get_texture())
	flip_a = not flip_a
	# the growth: four steps a frame, only while a preset grows
	var growing := float(preset.get("rd", {}).get("seed", 0.0)) > 0.0
	for v in [$RD1, $RD2, $RD3, $RD4]: v.render_target_update_mode = SubViewport.UPDATE_ONCE if growing else SubViewport.UPDATE_DISABLED
	# the ring of time: this frame's look into the next slot
	slot = (slot + 1) % 16
	slot_pass.position = Vector2(float(slot % 4), float(slot / 4)) * (Vector2($Slots.size) / 4.0)
	for m in [screen, screen_still]: m.set_shader_parameter("slot", slot)
	beat += dt
	if beat >= 1.0:
		beat = 0.0
		var live := cam.camera_feed != null and cam.camera_feed.feed_is_active
		_report({"state": "running", "fps": Engine.get_frames_per_second(), "width": int(size.x), "height": int(size.y), "camera": live, "frames": cam.frames})

# ---- the preset ------------------------------------------------------------------------------------------

func _apply() -> void:
	var id: String = str(params.get("preset", "lum"))
	var light: bool = bool(params.get("light", false))
	var knobs = params.get("knobs", {})
	preset = Presets.tuned(id, light, knobs if typeof(knobs) == TYPE_DICTIONARY else {})
	var tex_id: String = str(preset.get("tex", ""))
	# no texture (Просто) = a plain white line: the material is light itself
	mat_tex = load("res://tex/%s.webp" % tex_id) if tex_id != "" else ImageTexture.create_from_image(_white())
	var lk: Dictionary = preset.get("look", {})
	var sc: Dictionary = preset.get("screen", {})
	var fd: Dictionary = preset.get("fluid", {})
	var dy: Dictionary = preset.get("dye", {})
	var rd: Dictionary = preset.get("rd", {})
	var e: Dictionary = preset.get("edge", {})
	var li: Dictionary = preset.get("lines", {})
	var sh: Dictionary = preset.get("shade", {})
	var ec: Dictionary = preset.get("echo", {})
	var mo: Dictionary = preset.get("motion", {})
	look.set_shader_parameter("style", int(lk.get("style", 0)))
	look.set_shader_parameter("amount", float(lk.get("amount", 1.0)))
	look.set_shader_parameter("p", _v4(lk.get("p", [0, 0, 0, 0])))
	for m in [screen, screen_still]:
		m.set_shader_parameter("mode", int(sc.get("mode", 0)))
		m.set_shader_parameter("amount", float(sc.get("amount", 1.0)))
		m.set_shader_parameter("p", _v4(sc.get("p", [0, 0, 0, 0])))
	vel.set_shader_parameter("curl", float(fd.get("curl", 30.0)))
	vel.set_shader_parameter("force", float(fd.get("force", 8.0)))
	vel.set_shader_parameter("dissipation", float(fd.get("dissipation", 0.2)))
	for m in [echo_a, echo_b]:
		m.set_shader_parameter("carry", float(fd.get("carry", 1.0)))
		m.set_shader_parameter("warp", float(ec.get("warp", 0.0)))
	for m in [dye_a, dye_b]: m.set_shader_parameter("hold", float(dy.get("hold", 0.0)))
	for m in rds:
		m.set_shader_parameter("feed", float(rd.get("feed", 0.055)))
		m.set_shader_parameter("kill", float(rd.get("kill", 0.062)))
		m.set_shader_parameter("dA", float(rd.get("dA", 1.0)))
		m.set_shader_parameter("dB", float(rd.get("dB", 0.5)))
		m.set_shader_parameter("seed", float(rd.get("seed", 0.0)))
	for m in [trace, still_trace]:
		m.set_shader_parameter("mat_tex", mat_tex)
		m.set_shader_parameter("strength", float(e.get("strength", 2.0)))
		m.set_shader_parameter("step_px", float(e.get("step", 1.0)))
		m.set_shader_parameter("floor_v", float(e.get("floor", 0.15)))
		m.set_shader_parameter("invert", 1.0 if int(li.get("invert", 0)) == 1 else 0.0)
		m.set_shader_parameter("shimmer", float(li.get("shimmer", 0.0)))
		m.set_shader_parameter("shade", float(sh.get("amount", 0.0)))
		m.set_shader_parameter("shade_on_light", 1.0 if str(sh.get("on", "dark")) == "light" else 0.0)
		var band: Array = sh.get("band", [0.35, 0.75])
		m.set_shader_parameter("shade_band", Vector2(float(band[0]), float(band[1])))
		m.set_shader_parameter("motion_gain", float(mo.get("lift", 0.0)))
		m.set_shader_parameter("rd_gain", float(rd.get("gain", 0.0)))
		m.set_shader_parameter("alpha", float(li.get("alpha", 0.7)))
	for m in [motion_a, motion_b]:
		m.set_shader_parameter("gain", float(mo.get("gain", 6.0)))
		m.set_shader_parameter("decay", float(mo.get("decay", 0.9)))
	var blend: String = str(li.get("blend", "add"))
	var mode := 0 if blend == "add" else (1 if blend == "multiply" else 2)
	out.set_shader_parameter("mode", mode)
	($Still/Out.material as ShaderMaterial).set_shader_parameter("mode", mode)
	_layout()

static func _v4(a: Array) -> Vector4:
	return Vector4(float(a[0]), float(a[1]), float(a[2]), float(a[3]))

# ---- the camera (the demo's node) --------------------------------------------------------------------------

func _wanted_position() -> CameraFeed.FeedPosition:
	return CameraFeed.FeedPosition.FEED_FRONT if str(params.get("facing", "environment")) == "user" else CameraFeed.FeedPosition.FEED_BACK

# the widest format under PREVIEW_W for the live view; the demo's own default (0) when there is none
func _preview_format(formats: Array) -> int:
	var best := 0
	var best_w := 0
	for i in formats.size():
		var w := int(formats[i].get("width", 0))
		if w <= PREVIEW_W and w > best_w:
			best = i
			best_w = w
	return best

# the largest format the sensor offers — the still is saved at its full size, whatever that is; the one bound
# is the GPU's own (a texture side it cannot allocate), never a number of ours
func _largest_format(formats: Array) -> int:
	var best := -1
	var best_px := 0
	var side := 16384
	var rd := RenderingServer.get_rendering_device()
	if rd != null: side = rd.limit_get(RenderingDevice.LIMIT_MAX_TEXTURE_SIZE_2D)
	for i in formats.size():
		var w := int(formats[i].get("width", 0))
		var h := int(formats[i].get("height", 0))
		if w * h > best_px and maxi(w, h) <= side:
			best = i
			best_px = w * h
	return best

# the demo's first frame: what it wrote into its shader goes into every material that reads the sensor
func _on_bound(info: Dictionary) -> void:
	quarter = int(round(float(info.rotation) / (PI / 2.0))) % 4
	if quarter < 0: quarter += 4
	mirror = 1 if bool(info.mirror) else 0
	_bind_textures()
	for m in _sensor_materials():
		m.set_shader_parameter("mode", int(info.mode))
		m.set_shader_parameter("rotate", quarter)
		m.set_shader_parameter("mirror", mirror)
	look.set_shader_parameter("color_range", int(info.color_range))
	var sz: Vector2 = info.size
	_report({"state": "running", "detail": "camera bound: %s type %d mode %d range %d rot %d plane %dx%d format %d of %d" % [str(info.name), int(info.datatype), int(info.mode), int(info.color_range), quarter, int(sz.x), int(sz.y), int(info.format), int(info.formats)]})
	# the demo starts on format 0; the live view wants the preview format — one selection, like a tap on its list
	var preview := _preview_format(cam.formats())
	if not saving and not previewing and int(info.format) != preview:
		previewing = true
		await cam.select_format(preview)
		previewing = false

# ---- the page's words -----------------------------------------------------------------------------------

func _on_set(key: String, json: String) -> void:
	var v = JSON.parse_string(json)
	if v == null: v = json
	params[key] = v
	match key:
		"facing":
			if not saving: cam.select_position(_wanted_position())
		"mark":
			$Mark.visible = bool(v)
		"preset", "light", "knobs":
			_apply()

func _on_input(json: String) -> void:
	var g = JSON.parse_string(json)
	if typeof(g) != TYPE_DICTIONARY: return
	_report({"state": "running", "detail": "input " + str(g.get("type", ""))})

# ---- the save, at the sensor's full size ------------------------------------------------------------------

func _on_save(name: String) -> void:
	if saving or previewing or portal == null or cam.camera_feed == null: return
	var formats := cam.formats()
	var preview := _preview_format(formats)
	var big := _largest_format(formats)
	var f: Dictionary = formats[big] if big >= 0 else {}
	var w := int(f.get("width", 0))
	var h := int(f.get("height", 0))
	if w <= 0 or h <= 0:
		_report({"state": "running", "detail": "save: no format"})
		return
	saving = true
	# the sensor at its largest — the demo's format selection, then its second frame
	await cam.select_format(big)
	if not await _frames(2, 4.0):
		await cam.select_format(preview)
		saving = false
		_report({"state": "running", "detail": "save: no frame at %dx%d" % [w, h]})
		return
	# portrait canvas when the sensor is turned
	var cs := Vector2i(h, w) if quarter % 2 == 1 else Vector2i(w, h)
	for vp in [$StillLook, $StillLoop, $Still]: _size_vp(vp, cs)
	look.set_shader_parameter("size", Vector2(cs))
	screen_still.set_shader_parameter("size", Vector2(cs))
	still_trace.set_shader_parameter("size", Vector2(cs))
	still_trace.set_shader_parameter("period", _period(cs.x))
	still_trace.set_shader_parameter("phase", phase)
	($Still/Out.material as ShaderMaterial).set_shader_parameter("loop_tex", $StillLoop.get_texture())
	$StillLook.render_target_update_mode = SubViewport.UPDATE_ONCE
	$StillLoop.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	$Still.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	var img: Image = $Still.get_texture().get_image()
	look.set_shader_parameter("size", Vector2($LookView.size))
	var dir := "user://saves"
	DirAccess.make_dir_recursive_absolute(dir)
	var path := "%s/%s" % [dir, name]
	var err: int = img.save_png(path)
	# the sensor back to the live size
	await cam.select_format(preview)
	saving = false
	if err != OK:
		_report({"state": "running", "detail": "save: png %d" % err})
		return
	_report({"state": "running", "detail": "saved %dx%d" % [img.get_width(), img.get_height()]})
	portal.savedFile(name, ProjectSettings.globalize_path(path))

func _on_stop() -> void:
	cam.stop()
	CameraServer.monitoring_feeds = false
	_report({"state": "stopped"})

# true once `n` more camera frames arrived, false after `timeout` seconds without them
func _frames(n: int, timeout: float) -> bool:
	var want := cam.frames + n
	var t := 0.0
	while cam.frames < want and t < timeout:
		await get_tree().process_frame
		t += get_process_delta_time()
	return cam.frames >= want

static func _white() -> Image:
	var im := Image.create(4, 4, false, Image.FORMAT_RGB8)
	im.fill(Color.WHITE)
	return im

func _report(o: Dictionary) -> void:
	if portal != null:
		portal.state(JSON.stringify(o))
