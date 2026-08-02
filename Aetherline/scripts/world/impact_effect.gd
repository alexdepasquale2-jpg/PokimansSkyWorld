extends Sprite2D
class_name ImpactEffect

## One-shot shader-driven shockwave, spawned at a hit location. Runs its own
## tween then frees itself — nothing else needs to track its lifetime.

const SHADER := preload("res://shaders/impact_ring.gdshader")
const DURATION := 0.35

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
	var mat := ShaderMaterial.new()
	mat.shader = SHADER
	mat.set_shader_parameter("ring_color", Vector3(color.r, color.g, color.b))
	fx.material = mat
	parent.add_child(fx)

	var tween := fx.create_tween()
	tween.tween_method(func(p): mat.set_shader_parameter("progress", p), 0.0, 1.0, DURATION)
	tween.tween_callback(fx.queue_free)
