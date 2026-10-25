extends Sprite2D
class_name ImpactEffect

## One-shot shader-driven shockwave at a hit location. Self-frees after tween.

const SHADER := preload("res://shaders/impact_ring.gdshader")
const DURATION := 0.4

static var _white_texture: ImageTexture


static func _get_texture() -> ImageTexture:
	if _white_texture == null:
		var img := Image.create(4, 4, false, Image.FORMAT_RGBA8)
		img.fill(Color.WHITE)
		_white_texture = ImageTexture.create_from_image(img)
	return _white_texture


static func spawn(parent: Node, at: Vector2, color: Color = Color(1.0, 0.9, 0.3),
		size: float = 48.0) -> void:
	var fx := ImpactEffect.new()
	fx.texture = _get_texture()
	fx.global_position = at
	fx.scale = Vector2.ONE * (size / 4.0)
	fx.z_index = 40
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("ring_color", Vector3(color.r, color.g, color.b))
	fx.material = mat
	parent.add_child(fx)

	var tween := fx.create_tween()
	tween.tween_method(func(p): mat.set_shader_parameter("progress", p),
		0.0, 1.0, DURATION).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_callback(fx.queue_free)
