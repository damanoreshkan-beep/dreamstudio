# THE CAMERA — Godot's own camera feed demo (godot-demo-projects misc/camera_feed = shiena/godot-camerafeed-demo,
# camerafeed.gd, MIT), function for function and name for name, with the list widgets replaced by two values
# (`want_position`, `format_index`) and the preview material replaced by a `bound` signal that carries what the
# demo wrote into its shader (mode, color_range, the textures' size, the feed's rotation and mirror).
# Nothing of the dance is ours: permission → monitoring → feed → format (empty options) → one frame → start →
# textures on the first frame. Enrichments are marked "portal:".
extends Node
class_name PortalCamera

const CAMERA_DEACTIVATION_DELAY := 0.1

enum ShaderMode { RGB = 0, YCBCR_SEP = 1, YCBCR = 2 }
enum ColorRange { FULL = 0, VIDEO = 1 }

signal bound(info: Dictionary)      # portal: what the demo's _setup_textures + _update_scene_transform decided
signal frame                        # portal: every frame_changed
signal note(text: String)           # portal: what the demo printed

var camera_feed: CameraFeed
var _initialized := false
var _cached_formats: Array = []
var _last_feed_transform: Transform2D
var _texture_initialized := false

# portal: the two "lists" as values
var want_position := CameraFeed.FeedPosition.FEED_BACK
var format_index := 0

# portal: the demo's four CameraTextures lived in its material; here they are the node's
var rgb_texture := CameraTexture.new()
var y_texture := CameraTexture.new()
var cbcr_texture := CameraTexture.new()
var ycbcr_texture := CameraTexture.new()
var frames := 0


func start() -> void:   # the demo's _ready
	if OS.get_name() == "Android":
		var granted := await _request_camera_permission()
		if not granted:
			note.emit("camera: permission denied")
			return

	_reload_camera_list()
	_initialized = true


func _reload_camera_list() -> void:
	if CameraServer.is_monitoring_feeds:
		CameraServer.monitoring_feeds = false
		await get_tree().process_frame

	if not CameraServer.camera_feeds_updated.is_connected(_on_camera_feeds_updated):
		CameraServer.camera_feeds_updated.connect(_on_camera_feeds_updated, ConnectFlags.CONNECT_DEFERRED)

	CameraServer.monitoring_feeds = true


func _on_camera_feeds_updated() -> void:
	var feeds := CameraServer.feeds()

	if feeds.is_empty():
		note.emit("camera: no cameras found")
		return

	_on_camera_list_item_selected(_index_of_position(feeds))


# portal: the list's selection = the first feed at the wanted position, else the first feed
func _index_of_position(feeds: Array) -> int:
	for i in feeds.size():
		if feeds[i].get_position() == want_position:
			return i
	return 0


func _on_camera_list_item_selected(index: int) -> void:
	var camera_feeds := CameraServer.feeds()
	if index < 0 or index >= camera_feeds.size():
		return

	if camera_feed and camera_feed.feed_is_active:
		camera_feed.feed_is_active = false
		await get_tree().create_timer(CAMERA_DEACTIVATION_DELAY).timeout
	if camera_feed and camera_feed.format_changed.is_connected(_on_camera_format_changed):
		camera_feed.format_changed.disconnect(_on_camera_format_changed)

	camera_feed = camera_feeds[index]
	if not camera_feed.format_changed.is_connected(_on_camera_format_changed):
		camera_feed.format_changed.connect(_on_camera_format_changed, ConnectFlags.CONNECT_DEFERRED)
	_cached_formats = []
	await _update_format_list()


func _update_format_list() -> void:
	if not camera_feed:
		return

	_cached_formats = camera_feed.get_formats()
	if _cached_formats.is_empty():
		_cached_formats = [{}]
		await get_tree().process_frame
		_start_camera_feed()
		return

	await _on_format_list_item_selected(clampi(format_index, 0, _cached_formats.size() - 1))


func _refresh_format_list() -> void:
	if not camera_feed:
		return

	var updated_formats := camera_feed.get_formats()
	if updated_formats.is_empty():
		_cached_formats = [{}]
		return

	_cached_formats = updated_formats
	_texture_initialized = false


func _on_camera_format_changed() -> void:
	if not camera_feed:
		return
	_refresh_format_list()


func _on_format_list_item_selected(index: int) -> void:
	if not camera_feed:
		return

	format_index = index
	if camera_feed.feed_is_active:
		camera_feed.feed_is_active = false
		await get_tree().create_timer(CAMERA_DEACTIVATION_DELAY).timeout

	camera_feed.set_format(index, {})

	await get_tree().process_frame
	_start_camera_feed()


func _start_camera_feed() -> void:
	if not camera_feed:
		return

	_texture_initialized = false
	_last_feed_transform = Transform2D()

	if not camera_feed.frame_changed.is_connected(_on_frame_changed):
		camera_feed.frame_changed.connect(_on_frame_changed)

	camera_feed.feed_is_active = true


# portal: the demo's list — select another feed (facing) or another format (the save) from outside
func select_position(position: CameraFeed.FeedPosition) -> void:
	want_position = position
	var feeds := CameraServer.feeds()
	if feeds.is_empty():
		return
	await _on_camera_list_item_selected(_index_of_position(feeds))


func select_format(index: int) -> void:
	await _on_format_list_item_selected(index)


func formats() -> Array:
	return _cached_formats


func stop() -> void:   # the demo's stop button
	if camera_feed and camera_feed.feed_is_active:
		camera_feed.feed_is_active = false
		_texture_initialized = false


func _update_scene_transform() -> void:
	if not camera_feed or not camera_feed.feed_is_active:
		return
	if _cached_formats.is_empty():
		return

	var is_front_camera := camera_feed.get_position() == CameraFeed.FeedPosition.FEED_FRONT
	var feed_rotation := camera_feed.feed_transform.get_rotation()
	bound.emit(_info(feed_rotation, is_front_camera))


func _get_selected_format_size() -> Vector2:
	if format_index < 0 or format_index >= _cached_formats.size():
		return Vector2.ZERO

	var format: Dictionary = _cached_formats[format_index]
	var width: int = format.get("width", 0)
	var height: int = format.get("height", 0)
	if width <= 0 or height <= 0:
		return Vector2.ZERO
	return Vector2(width, height)


func _get_color_range(format: Dictionary) -> int:
	var color_range_str: String = format.get("color_range", "")
	if color_range_str == "full":
		return ColorRange.FULL
	if color_range_str == "video":
		return ColorRange.VIDEO

	var os_name := OS.get_name()
	match os_name:
		"Android":
			return ColorRange.VIDEO
		"Windows":
			return ColorRange.VIDEO
		"Linux":
			return ColorRange.FULL
		"macOS":
			return ColorRange.FULL
		"iOS":
			return ColorRange.FULL
		_:
			return ColorRange.FULL


func _on_frame_changed() -> void:
	if not camera_feed or not camera_feed.feed_is_active:
		return
	if _cached_formats.is_empty():
		return

	frames += 1
	if not _texture_initialized:
		_setup_textures()
		_update_scene_transform()

	var current_transform := camera_feed.feed_transform
	if current_transform != _last_feed_transform:
		_last_feed_transform = current_transform
		_update_scene_transform()
	frame.emit()


# what the demo's shader was told: mode, color_range, the textures — and the size it measured
var _mode := -1
var _texture_size := Vector2.ZERO
var _color_range := ColorRange.FULL

func _setup_textures() -> void:
	rgb_texture.which_feed = CameraServer.FeedImage.FEED_RGBA_IMAGE
	y_texture.which_feed = CameraServer.FeedImage.FEED_Y_IMAGE
	cbcr_texture.which_feed = CameraServer.FeedImage.FEED_CBCR_IMAGE
	ycbcr_texture.which_feed = CameraServer.FeedImage.FEED_YCBCR_IMAGE

	var datatype := camera_feed.get_datatype() as CameraFeed.FeedDataType
	var texture_size := Vector2.ZERO

	match datatype:
		CameraFeed.FeedDataType.FEED_RGB:
			rgb_texture.camera_feed_id = camera_feed.get_id()
			_mode = ShaderMode.RGB
			texture_size = rgb_texture.get_size()
		CameraFeed.FeedDataType.FEED_YCBCR_SEP:
			y_texture.camera_feed_id = camera_feed.get_id()
			cbcr_texture.camera_feed_id = camera_feed.get_id()
			_mode = ShaderMode.YCBCR_SEP
			texture_size = y_texture.get_size()
		CameraFeed.FeedDataType.FEED_YCBCR:
			ycbcr_texture.camera_feed_id = camera_feed.get_id()
			_mode = ShaderMode.YCBCR
			texture_size = ycbcr_texture.get_size()
		_:
			note.emit("camera: skip formats that are not supported (datatype %d)" % datatype)
			return

	if format_index >= 0 and format_index < _cached_formats.size():
		_color_range = _get_color_range(_cached_formats[format_index])

	var preview_size := texture_size
	if preview_size.round().x <= 0 or preview_size.round().y <= 0:
		preview_size = _get_selected_format_size()
	if preview_size.round().x <= 0 or preview_size.round().y <= 0:
		return
	_texture_size = preview_size

	_texture_initialized = true


func _info(feed_rotation: float, is_front_camera: bool) -> Dictionary:
	return {
		"mode": _mode, "color_range": _color_range, "size": _texture_size,
		"rotation": feed_rotation, "mirror": is_front_camera,
		"name": camera_feed.get_name(), "datatype": camera_feed.get_datatype(),
		"format": format_index, "formats": _cached_formats.size(),
	}


func _request_camera_permission() -> bool:
	const CAMERA_PERMISSION := "android.permission.CAMERA"

	if CAMERA_PERMISSION in OS.get_granted_permissions():
		return true

	var already_granted := OS.request_permission("CAMERA")
	if already_granted:
		return true

	while true:
		var result = await get_tree().on_request_permissions_result
		if result[0] == CAMERA_PERMISSION:
			return result[1]

	return false


func _exit_tree() -> void:
	if camera_feed and camera_feed.format_changed.is_connected(_on_camera_format_changed):
		camera_feed.format_changed.disconnect(_on_camera_format_changed)
	if camera_feed and camera_feed.feed_is_active:
		camera_feed.feed_is_active = false
