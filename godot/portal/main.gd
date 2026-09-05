# The portal's stage, phase 1: the camera through Godot's CameraServer, on the screen, under the page.
# The page (the portal's web view on a transparent WebView above) is the UI; it reaches this scene through the
# shell's MsPortal singleton — signals in (set / input / save / stop), methods out (state / saved).
extends Control

var portal = null            # the MsPortal plugin singleton, when the shell provides one
var feed: CameraFeed = null
var y_tex := CameraTexture.new()
var cbcr_tex := CameraTexture.new()
var rgb_tex := CameraTexture.new()
var params := {}             # every set() key/value the page handed over
var beat := 0.0

func _ready() -> void:
	if Engine.has_singleton("MsPortal"):
		portal = Engine.get_singleton("MsPortal")
		portal.connect("set", _on_set)
		portal.connect("input", _on_input)
		portal.connect("save", _on_save)
		portal.connect("stop", _on_stop)
	CameraServer.camera_feed_added.connect(_on_feed_added)
	CameraServer.camera_feed_removed.connect(_on_feed_removed)
	# 4.5+: feeds are enumerated only while monitored — the camera stays untouched until then
	CameraServer.monitoring_feeds = true
	_pick_feed()
	_report({"state": "running", "width": int(size.x), "height": int(size.y)})

func _process(dt: float) -> void:
	beat += dt
	if beat >= 1.0:
		beat = 0.0
		_report({"state": "running", "fps": Engine.get_frames_per_second(), "width": int(size.x), "height": int(size.y), "camera": feed != null and feed.feed_is_active})

# ---- the camera ----------------------------------------------------------------------------------------

func _on_feed_added(_id: int) -> void:
	if feed == null: _pick_feed()

func _on_feed_removed(id: int) -> void:
	if feed != null and feed.get_id() == id:
		feed = null
		_set_mode(0)

func _pick_feed() -> void:
	var want := CameraFeed.FEED_FRONT if params.get("facing", "environment") == "user" else CameraFeed.FEED_BACK
	var best: CameraFeed = null
	for f in CameraServer.feeds():
		if best == null or f.get_position() == want: best = f
		if f.get_position() == want: break
	if best == null: return
	_use(best)

func _use(f: CameraFeed) -> void:
	if feed == f and feed.feed_is_active: return   # already on it — a format cannot be set on an active feed
	if feed != null and feed != f: feed.feed_is_active = false
	feed = f
	if not feed.format_changed.is_connected(_on_format_changed):
		feed.format_changed.connect(_on_format_changed)
	# 4.5+: a feed must be given a FORMAT before it activates ("format needs to be set before activating",
	# measured on apk-see) — the largest one under 1280 px wide, its planes delivered separately (Y + CbCr)
	var best := -1
	var best_w := 0
	for i in feed.formats.size():
		var w := int(feed.formats[i].get("width", 0))
		if w <= 1280 and w > best_w:
			best = i
			best_w = w
	if best < 0 and feed.formats.size() > 0: best = 0
	if best >= 0: feed.set_format(best, {"output": "separate"})
	feed.feed_is_active = true
	_bind()

func _on_format_changed() -> void:
	_bind()

func _bind() -> void:
	if feed == null: return
	var id := feed.get_id()
	var mat: ShaderMaterial = $Cam.material
	match feed.get_datatype():
		CameraFeed.FEED_RGB:
			rgb_tex.camera_feed_id = id
			rgb_tex.which_feed = CameraServer.FEED_RGBA_IMAGE
			mat.set_shader_parameter("rgb_tex", rgb_tex)
			_set_mode(1)
		CameraFeed.FEED_YCBCR_SEP, CameraFeed.FEED_YCBCR:
			y_tex.camera_feed_id = id
			y_tex.which_feed = CameraServer.FEED_Y_IMAGE
			cbcr_tex.camera_feed_id = id
			cbcr_tex.which_feed = CameraServer.FEED_CBCR_IMAGE
			mat.set_shader_parameter("y_tex", y_tex)
			mat.set_shader_parameter("cbcr_tex", cbcr_tex)
			_set_mode(2)
		_:
			_set_mode(0)
	mat.set_shader_parameter("mirror", 1 if feed.get_position() == CameraFeed.FEED_FRONT else 0)

func _set_mode(m: int) -> void:
	($Cam.material as ShaderMaterial).set_shader_parameter("mode", m)

# ---- the page's words -----------------------------------------------------------------------------------

func _on_set(key: String, json: String) -> void:
	var v = JSON.parse_string(json)
	if v == null: v = json
	params[key] = v
	match key:
		"facing":
			_pick_feed()
		"tint":
			($Cam.material as ShaderMaterial).set_shader_parameter("tint", Color(str(v)))
		"rotate":
			($Cam.material as ShaderMaterial).set_shader_parameter("rotate", int(v))
		"mark":
			$Mark.visible = bool(v)

func _on_input(json: String) -> void:
	var g = JSON.parse_string(json)
	if typeof(g) != TYPE_DICTIONARY: return
	# phase 1 acknowledges the gesture; focus and zoom arrive with the camera controls of a later phase
	_report({"state": "running", "detail": "input " + str(g.get("type", ""))})

func _on_save(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var png := img.save_png_to_buffer()
	if portal != null:
		portal.saved(name, Marshalls.raw_to_base64(png))

func _on_stop() -> void:
	if feed != null:
		feed.feed_is_active = false
	CameraServer.monitoring_feeds = false
	_report({"state": "stopped"})

func _report(o: Dictionary) -> void:
	if portal != null:
		portal.state(JSON.stringify(o))
