extends Sprite2D
class_name ScanEffect

## Scanner sweep + discovery tags. The most-repeated verb in the game — it
## has to feel good the four-hundredth time.

const SHADER := preload("res://shaders/scan_pulse.gdshader")
const DURATION := 0.95

static var _texture: ImageTexture


static func _white() -> ImageTexture:
	if _texture == null:
		var img := Image.create(4, 4, false, Image.FORMAT_RGBA8)
		img.fill(Color.WHITE)
		_texture = ImageTexture.create_from_image(img)
	return _texture


static func sweep(parent: Node, at: Vector2, radius: float,
		color: Color = Color(0.45, 0.85, 1.0)) -> void:
	var fx := ScanEffect.new()
	fx.texture = _white()
	fx.global_position = at
	fx.scale = Vector2.ONE * (radius * 2.0 / 4.0)
	fx.z_index = 50
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("sweep_color", Vector3(color.r, color.g, color.b))
	fx.material = mat
	parent.add_child(fx)

	var tween := fx.create_tween()
	tween.tween_method(func(p): mat.set_shader_parameter("progress", p),
		0.0, 1.0, DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_callback(fx.queue_free)


static func tag(parent: Node, at: Vector2, text: String, is_new: bool) -> void:
	var label := Label.new()
	label.text = ("✦ NEW  " + text) if is_new else text
	label.add_theme_font_size_override("font_size", 18 if is_new else 13)
	label.add_theme_color_override("font_color",
		Color(1.0, 0.88, 0.35) if is_new else Color(0.62, 0.88, 1.0))
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	label.add_theme_constant_override("outline_size", 4)
	label.global_position = at + Vector2(-48, -30)
	label.z_index = 100
	label.pivot_offset = Vector2(40, 8)
	label.scale = Vector2.ONE * (0.5 if is_new else 0.85)
	parent.add_child(label)

	var tween := label.create_tween()
	tween.set_parallel(true)
	tween.tween_property(label, "global_position:y",
		label.global_position.y - (56.0 if is_new else 34.0), 1.45) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	if is_new:
		tween.tween_property(label, "scale", Vector2.ONE * 1.3, 0.18) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tween.chain().tween_property(label, "scale", Vector2.ONE, 0.22)
	else:
		tween.tween_property(label, "scale", Vector2.ONE, 0.12)
	tween.tween_property(label, "modulate:a", 0.0, 0.95).set_delay(0.55)
	tween.chain().tween_callback(label.queue_free)
