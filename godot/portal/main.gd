# The portal's stage, phase 1: the camera through Godot's CameraServer, on the screen, under the page.
# The page (the portal's web view on a transparent WebView above) is the UI; it reaches this scene through the
# shell's MsPortal singleton — signals in (set / input / save / stop), methods out (state / saved).
# The camera dance follows the Android camera author's sample (shiena/GodotCameraFeedSample): monitor feeds,
# pick one, set a FORMAT while it is inactive, activate, and bind the textures on the FIRST FRAME — the feed's
# datatype, size and transform are only known then.
extends Control

var portal = null            # the MsPortal plugin singleton, when the shell provides one
var feed: CameraFeed = null
var y_tex := CameraTexture.new()
var cbcr_tex := CameraTexture.new()
var rgb_tex := CameraTexture.new()
var params := {}             # every set() key/value the page handed over
var beat := 0.0
var bound := false           # textures bound to the running feed
var frames := 0

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
	CameraServer.camera_feeds_updated.connect(_on_feeds_updated, CONNECT_DEFERRED)
	# 4.5+: feeds are enumerated only while monitored — the camera stays untouched until then
	CameraServer.monitoring_feeds = true
	_report({"state": "running", "width": int(size.x), "height": int(size.y)})

func _process(dt: float) -> void:
	beat += dt
	if beat >= 1.0:
		beat = 0.0
		_report({"state": "running", "fps": Engine.get_frames_per_second(), "width": int(size.x), "height": int(size.y), "camera": feed != null and feed.feed_is_active, "frames": frames})

# ---- the camera ----------------------------------------------------------------------------------------

func _on_feeds_updated() -> void:
	if feed == null: _pick_feed()

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
	if feed != null and feed != f:
		feed.feed_is_active = false
		if feed.frame_changed.is_connected(_on_frame): feed.frame_changed.disconnect(_on_frame)
	feed = f
	bound = false
	frames = 0
	# the largest format under 1280 px wide; NV12 as two planes (Y + CbCr) — what the phone gives anyway
	var best := -1
	var best_w := 0
	for i in feed.formats.size():
		var w := int(feed.formats[i].get("width", 0))
		if w <= 1280 and w > best_w:
			best = i
			best_w = w
	if best < 0 and feed.formats.size() > 0: best = 0
	if best >= 0: feed.set_format(best, {"output": "separate"})
	if not feed.frame_changed.is_connected(_on_frame):
		feed.frame_changed.connect(_on_frame)
	feed.feed_is_active = true

func _on_frame() -> void:
	frames += 1
	if not bound: _bind()

func _bind() -> void:
	if feed == null: return
	var id := feed.get_id()
	var mat: ShaderMaterial = $Cam.material
	match feed.get_datatype():
		CameraFeed.FEED_RGB:
			rgb_tex.camera_feed_id = id
			mat.set_shader_parameter("rgb_tex", rgb_tex)
			mat.set_shader_parameter("mode", 1)
		CameraFeed.FEED_YCBCR_SEP, CameraFeed.FEED_YCBCR:
			y_tex.camera_feed_id = id
			cbcr_tex.camera_feed_id = id
			mat.set_shader_parameter("y_tex", y_tex)
			mat.set_shader_parameter("cbcr_tex", cbcr_tex)
			mat.set_shader_parameter("mode", 2)
		_:
			mat.set_shader_parameter("mode", 0)
	# the sensor's own transform says how the picture must turn to stand up; Android delivers video range
	var quarter := int(round(feed.feed_transform.get_rotation() / (PI / 2.0))) % 4
	if quarter < 0: quarter += 4
	mat.set_shader_parameter("rotate", quarter)
	mat.set_shader_parameter("video_range", 1 if OS.get_name() == "Android" else 0)
	mat.set_shader_parameter("mirror", 1 if feed.get_position() == CameraFeed.FEED_FRONT else 0)
	bound = true
	_report({"state": "running", "detail": "camera bound: %s type %d rot %d size %s" % [feed.get_name(), feed.get_datatype(), quarter, str(y_tex.get_size() if feed.get_datatype() != CameraFeed.FEED_RGB else rgb_tex.get_size())]})

# ---- the page's words -----------------------------------------------------------------------------------

func _on_set(key: String, json: String) -> void:
	var v = JSON.parse_string(json)
	if v == null: v = json
	params[key] = v
	match key:
		"facing":
			feed = null
			_pick_feed()
		"tint":
			($Cam.material as ShaderMaterial).set_shader_parameter("tint", Color(str(v)))
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
