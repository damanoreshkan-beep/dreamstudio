# The portal's stage — the material as a property of the picture, on TD's nodes as Godot has them:
#   LookView   the camera through the material's eye (look.gdshader: as is, oil, halftone, posterize, chromatic,
#              glitch, grain, scanlines — CC0 originals from godotshaders.com on the sensor's own planes)
#   Cam        that picture on the screen, as is (blit)
#   MotionA/B  Cache + difference: where the picture moves (a small ping-pong; energy decays)
#   LoopA/B    Feedback TOP: two SubViewports ping-pong; the one rendered this frame holds Echo (the other's last
#              frame, faded, zoomed, turned, pushed by the flow and the warp field, smeared where it moves) under
#              Fresh (the trace of the sensor's luminance, drawn by the material, lifted where it moves)
#   Out        the loop over the camera — add / multiply / normal by preset and theme
#   Still      a save: the feed switched to its LARGEST format, look + trace re-run at the sensor's own size,
#              composited, written to user:// and handed to the shell as a file (owner: "4 мегапікселі — не ок")
# Every preset number that is a rate is written per 1/30 s (the web portal's frame) and converted with the real
# dt each frame, so the trails and the drift look the same at 60 fps and on old hardware.
# The page (a transparent WebView above) is the UI; it speaks through the shell's MsPortal singleton — signals in
# (set / input / save / stop), methods out (state / savedFile). The camera dance is the camera author's own
# (shiena/GodotCameraFeedSample): format before activating, textures bound on the first frame — and a format
# switch waits for the device to close before it asks for the next (the S25 froze on a switch that did not).
extends Control

const TEX_PX := 1024.0          # the material textures' side
const REF_W := 1080.0           # the width every px number in the presets is written for
const BASE_FPS := 30.0          # the frame the presets' rates are written for

var portal = null
var feed: CameraFeed = null
var y_tex := CameraTexture.new()
var cbcr_tex := CameraTexture.new()
var rgb_tex := CameraTexture.new()
var params := {}                # every set() key/value the page handed over
var preset := {}                # the tuned graph of the current material
var mat_tex: Texture2D = null
var phase := Vector2.ZERO
var beat := 0.0
var bound := false
var frames := 0
var flip_a := true              # which loop / motion viewport renders this frame
var quarter := 0
var mirror := 0
var saving := false
var switching := false

@onready var look: ShaderMaterial = $LookView/Look.material
@onready var blit: ShaderMaterial = $Cam.material
@onready var blit_still: ShaderMaterial = $Still/Cam.material
@onready var motion_a: ShaderMaterial = $MotionA/Motion.material
@onready var motion_b: ShaderMaterial = $MotionB/Motion.material
@onready var trace: ShaderMaterial = $LoopA/Fresh.material
@onready var still_trace: ShaderMaterial = $StillLoop/Fresh.material
@onready var echo_a: ShaderMaterial = $LoopA/Echo.material
@onready var echo_b: ShaderMaterial = $LoopB/Echo.material
@onready var out: ShaderMaterial = $Out.material

func _ready() -> void:
	if Engine.has_singleton("MsPortal"):
		portal = Engine.get_singleton("MsPortal")
		portal.connect("set", _on_set)
		portal.connect("input", _on_input)
		portal.connect("save", _on_save)
		portal.connect("stop", _on_stop)
	y_tex.which_feed = CameraServer.FeedImage.FEED_Y_IMAGE
	cbcr_tex.which_feed = CameraServer.FeedImage.FEED_CBCR_IMAGE
	rgb_tex.which_feed = CameraServer.FeedImage.FEED_RGBA_IMAGE
	for m in _sensor_materials():
		m.set_shader_parameter("y_tex", y_tex)
		m.set_shader_parameter("cbcr_tex", cbcr_tex)
		m.set_shader_parameter("rgb_tex", rgb_tex)
	blit.set_shader_parameter("tex", $LookView.get_texture())
	blit_still.set_shader_parameter("tex", $StillLook.get_texture())
	echo_a.set_shader_parameter("prev_tex", $LoopB.get_texture())
	echo_b.set_shader_parameter("prev_tex", $LoopA.get_texture())
	motion_a.set_shader_parameter("prev_tex", $MotionB.get_texture())
	motion_b.set_shader_parameter("prev_tex", $MotionA.get_texture())
	$Still/Out.material = out.duplicate()
	get_viewport().size_changed.connect(_layout)
	_layout()
	_apply()
	CameraServer.camera_feeds_updated.connect(_on_feeds_updated, CONNECT_DEFERRED)
	CameraServer.monitoring_feeds = true
	_report({"state": "running", "width": int(size.x), "height": int(size.y)})

# every material that reads the sensor's planes
func _sensor_materials() -> Array:
	return [look, trace, still_trace, motion_a, motion_b]

# the viewports: the look at the screen's own pixels (the camera is never downsampled), the loops at `detail`
# (2 = the screen, 1 = half — old hardware), the motion at a quarter of the loop
func _layout() -> void:
	var s := Vector2i(get_viewport().get_visible_rect().size)
	var d: float = float(preset.get("detail", 2))
	var ls := Vector2i(maxi(1, int(s.x * d / 2.0)), maxi(1, int(s.y * d / 2.0)))
	var ms := Vector2i(maxi(1, ls.x / 4), maxi(1, ls.y / 4))
	_size_vp($LookView, s)
	for vp in [$LoopA, $LoopB]: _size_vp(vp, ls)
	for vp in [$MotionA, $MotionB]: _size_vp(vp, ms)
	look.set_shader_parameter("size", Vector2(s))
	trace.set_shader_parameter("size", Vector2(ls))
	for m in [echo_a, echo_b]: m.set_shader_parameter("size", Vector2(ls))
	_tile()

func _size_vp(vp: SubViewport, s: Vector2i) -> void:
	vp.size = s
	for child in vp.get_children(): child.size = Vector2(s)

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
	# the echo's rates for THIS frame
	var fl: Array = ec.get("flow", [0, 0])
	for m in [echo_a, echo_b]:
		m.set_shader_parameter("decay", pow(float(ec.get("decay", 0.9)), k))
		m.set_shader_parameter("zoom", pow(float(ec.get("zoom", 1.0)), k))
		m.set_shader_parameter("rot", float(ec.get("rot", 0.0)) * k)
		m.set_shader_parameter("flow", Vector2(float(fl[0]), float(fl[1])) * k * (vs.x / REF_W))
	# the ping-pong: one motion and one loop viewport render this frame, reading the other's last
	var mv: SubViewport = $MotionA if flip_a else $MotionB
	var lv: SubViewport = $LoopA if flip_a else $LoopB
	mv.render_target_update_mode = SubViewport.UPDATE_ONCE
	lv.render_target_update_mode = SubViewport.UPDATE_ONCE
	var mt := mv.get_texture()
	trace.set_shader_parameter("motion_tex", mt)
	still_trace.set_shader_parameter("motion_tex", mt)
	(echo_a if flip_a else echo_b).set_shader_parameter("motion_tex", mt)
	out.set_shader_parameter("loop_tex", lv.get_texture())
	flip_a = not flip_a
	beat += dt
	if beat >= 1.0:
		beat = 0.0
		_report({"state": "running", "fps": Engine.get_frames_per_second(), "width": int(size.x), "height": int(size.y), "camera": feed != null and feed.feed_is_active, "frames": frames})

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
	var e: Dictionary = preset.get("edge", {})
	var li: Dictionary = preset.get("lines", {})
	var sh: Dictionary = preset.get("shade", {})
	var ec: Dictionary = preset.get("echo", {})
	var mo: Dictionary = preset.get("motion", {})
	var lp: Array = lk.get("p", [0, 0, 0, 0])
	look.set_shader_parameter("style", int(lk.get("style", 0)))
	look.set_shader_parameter("amount", float(lk.get("amount", 1.0)))
	look.set_shader_parameter("p", Vector4(float(lp[0]), float(lp[1]), float(lp[2]), float(lp[3])))
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
		m.set_shader_parameter("alpha", float(li.get("alpha", 0.7)))
	for m in [echo_a, echo_b]:
		m.set_shader_parameter("warp", float(ec.get("warp", 0.0)))
		m.set_shader_parameter("motion_push", float(ec.get("motion_push", 0.0)))
	for m in [motion_a, motion_b]:
		m.set_shader_parameter("gain", float(mo.get("gain", 6.0)))
		m.set_shader_parameter("decay", float(mo.get("decay", 0.9)))
	var blend: String = str(li.get("blend", "add"))
	var mode := 0 if blend == "add" else (1 if blend == "multiply" else 2)
	out.set_shader_parameter("mode", mode)
	($Still/Out.material as ShaderMaterial).set_shader_parameter("mode", mode)
	_layout()

# ---- the camera ----------------------------------------------------------------------------------------

func _on_feeds_updated() -> void:
	if feed == null: _pick_feed()

func _pick_feed() -> void:
	var want := CameraFeed.FEED_FRONT if str(params.get("facing", "environment")) == "user" else CameraFeed.FEED_BACK
	var best: CameraFeed = null
	for f in CameraServer.feeds():
		if best == null or f.get_position() == want: best = f
		if f.get_position() == want: break
	if best == null: return
	_switch(best, _preview_format(best))

# the largest format under 1280 px wide for the live view — the screen needs no more, the sensor is spared
func _preview_format(f: CameraFeed) -> int:
	var best := -1
	var best_w := 0
	for i in f.formats.size():
		var w := int(f.formats[i].get("width", 0))
		if w <= 1280 and w > best_w:
			best = i
			best_w = w
	return best if best >= 0 else (0 if f.formats.size() > 0 else -1)

# the largest format the sensor offers — the still is saved at its full size, whatever that is; the one bound
# is the GPU's own (a texture side it cannot allocate), never a number of ours
func _largest_format(f: CameraFeed) -> int:
	var best := -1
	var best_px := 0
	var side := 16384
	var rd := RenderingServer.get_rendering_device()
	if rd != null: side = rd.limit_get(RenderingDevice.LIMIT_MAX_TEXTURE_SIZE_2D)
	for i in f.formats.size():
		var w := int(f.formats[i].get("width", 0))
		var h := int(f.formats[i].get("height", 0))
		var px := w * h
		if px > best_px and maxi(w, h) <= side:
			best = i
			best_px = px
	return best

# put feed `f` on format `fmt`: stop what runs, let the device close, set the format, start, wait for a frame;
# one retry with a longer breath — a switch that does not wait leaves the last frame frozen on the screen
func _switch(f: CameraFeed, fmt: int) -> bool:
	if switching: return false
	switching = true
	var ok := false
	for attempt in 2:
		if feed != null:
			if feed.feed_is_active: feed.feed_is_active = false
			if feed != f and feed.frame_changed.is_connected(_on_frame): feed.frame_changed.disconnect(_on_frame)
			await get_tree().create_timer(0.3 + 0.4 * attempt).timeout
		feed = f
		bound = false
		if fmt >= 0: feed.set_format(fmt, {"output": "separate"})
		if not feed.frame_changed.is_connected(_on_frame):
			feed.frame_changed.connect(_on_frame)
		feed.feed_is_active = true
		ok = await _frames(1, 3.0)
		if ok: break
		_report({"state": "running", "detail": "camera: no frame on format %d (try %d)" % [fmt, attempt + 1]})
	switching = false
	return ok

func _on_frame() -> void:
	frames += 1
	if not bound: _bind()

func _bind() -> void:
	if feed == null: return
	var id := feed.get_id()
	var mode := 0
	match feed.get_datatype():
		CameraFeed.FEED_RGB:
			rgb_tex.camera_feed_id = id
			mode = 1
		CameraFeed.FEED_YCBCR_SEP, CameraFeed.FEED_YCBCR:
			y_tex.camera_feed_id = id
			cbcr_tex.camera_feed_id = id
			mode = 2
	quarter = int(round(feed.feed_transform.get_rotation() / (PI / 2.0))) % 4
	if quarter < 0: quarter += 4
	mirror = 1 if feed.get_position() == CameraFeed.FEED_FRONT else 0
	for m in _sensor_materials():
		m.set_shader_parameter("mode", mode)
		m.set_shader_parameter("rotate", quarter)
		m.set_shader_parameter("mirror", mirror)
	look.set_shader_parameter("video_range", 1.0 if OS.get_name() == "Android" else 0.0)
	bound = true
	var sz: Vector2 = y_tex.get_size() if mode == 2 else rgb_tex.get_size()
	_report({"state": "running", "detail": "camera bound: %s type %d rot %d plane %dx%d of %d formats" % [feed.get_name(), feed.get_datatype(), quarter, int(sz.x), int(sz.y), feed.formats.size()]})

# ---- the page's words -----------------------------------------------------------------------------------

func _on_set(key: String, json: String) -> void:
	var v = JSON.parse_string(json)
	if v == null: v = json
	params[key] = v
	match key:
		"facing":
			_pick_feed()
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
	if saving or switching or feed == null or portal == null: return
	saving = true
	var live := feed
	var preview := _preview_format(live)
	var big := _largest_format(live)
	var f: Dictionary = live.formats[big] if big >= 0 else {}
	var w := int(f.get("width", 0))
	var h := int(f.get("height", 0))
	if w <= 0 or h <= 0:
		saving = false
		_report({"state": "running", "detail": "save: no format"})
		return
	# the sensor at its largest
	if not await _switch(live, big):
		await _switch(live, preview)
		saving = false
		_report({"state": "running", "detail": "save: no frame at %dx%d" % [w, h]})
		return
	await _frames(1, 2.0)
	# portrait canvas when the sensor is turned
	var cs := Vector2i(h, w) if quarter % 2 == 1 else Vector2i(w, h)
	for vp in [$StillLook, $StillLoop, $Still]: _size_vp(vp, cs)
	look.set_shader_parameter("size", Vector2(cs))
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
	await _switch(live, preview)
	saving = false
	if err != OK:
		_report({"state": "running", "detail": "save: png %d" % err})
		return
	_report({"state": "running", "detail": "saved %dx%d" % [img.get_width(), img.get_height()]})
	portal.savedFile(name, ProjectSettings.globalize_path(path))

func _on_stop() -> void:
	if feed != null:
		feed.feed_is_active = false
	CameraServer.monitoring_feeds = false
	_report({"state": "stopped"})

# true once `n` more camera frames arrived, false after `timeout` seconds without them
func _frames(n: int, timeout: float) -> bool:
	var want := frames + n
	var t := 0.0
	while frames < want and t < timeout:
		await get_tree().process_frame
		t += get_process_delta_time()
	return frames >= want

static func _white() -> Image:
	var im := Image.create(4, 4, false, Image.FORMAT_RGB8)
	im.fill(Color.WHITE)
	return im

func _report(o: Dictionary) -> void:
	if portal != null:
		portal.state(JSON.stringify(o))
