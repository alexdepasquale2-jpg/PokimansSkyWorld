extends Button
class_name FxButton

## Button with a shader plate: sheen on hover, press scale, and accent rim.
## Drop-in replacement for Button — same .text, same .pressed signal.

const SHADER := preload("res://shaders/ui_button_sheen.gdshader")

var _material: ShaderMaterial
var _backdrop: ColorRect
var _accent: Color = Color(0.35, 0.78, 1.0)
var _hover_tween: Tween
var _press_tween: Tween


func _init(accent: Color = Color(0.35, 0.78, 1.0)) -> void:
	_accent = accent
	_material = ShaderMaterial.new()
	_material.shader = SHADER
	_material.set_shader_parameter("accent_color", Vector3(accent.r, accent.g, accent.b))
	_material.set_shader_parameter("base_color", Vector3(0.10, 0.14, 0.22))
	_material.set_shader_parameter("hover", 0.0)
	_material.set_shader_parameter("press", 0.0)

	_backdrop = ColorRect.new()
	_backdrop.material = _material
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_backdrop.show_behind_parent = true

	add_theme_color_override("font_color", Color(0.90, 0.93, 0.97))
	add_theme_color_override("font_hover_color", Color(1.0, 1.0, 1.0))
	add_theme_color_override("font_pressed_color", Color(0.85, 0.92, 1.0))
	add_theme_color_override("font_disabled_color", Color(0.45, 0.48, 0.55))
	add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.65))
	add_theme_constant_override("outline_size", 2)
	add_theme_font_size_override("font_size", 16)
	add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	add_theme_stylebox_override("hover", StyleBoxEmpty.new())
	add_theme_stylebox_override("pressed", StyleBoxEmpty.new())
	add_theme_stylebox_override("disabled", StyleBoxEmpty.new())
	add_theme_stylebox_override("focus", StyleBoxEmpty.new())


func _ready() -> void:
	add_child(_backdrop)
	move_child(_backdrop, 0)
	pivot_offset = size * 0.5
	resized.connect(func(): pivot_offset = size * 0.5)
	mouse_entered.connect(_on_hover.bind(true))
	mouse_exited.connect(_on_hover.bind(false))
	button_down.connect(_on_press)
	button_up.connect(_on_release)
	if disabled:
		modulate = Color(0.7, 0.72, 0.78, 0.85)


func set_accent(color: Color) -> void:
	_accent = color
	if _material != null:
		_material.set_shader_parameter("accent_color", Vector3(color.r, color.g, color.b))


func _on_hover(entering: bool) -> void:
	if disabled or _material == null:
		return
	if _hover_tween != null and _hover_tween.is_valid():
		_hover_tween.kill()
	_hover_tween = create_tween()
	var target := 1.0 if entering else 0.0
	_hover_tween.tween_method(
		func(v: float): _material.set_shader_parameter("hover", v),
		float(_material.get_shader_parameter("hover")),
		target,
		0.16 if entering else 0.22
	).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	if entering:
		var scale_tween := create_tween()
		scale_tween.tween_property(self, "scale", Vector2.ONE * 1.025, 0.12) \
			.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		var scale_tween := create_tween()
		scale_tween.tween_property(self, "scale", Vector2.ONE, 0.14)


func _on_press() -> void:
	if disabled or _material == null:
		return
	if _press_tween != null and _press_tween.is_valid():
		_press_tween.kill()
	_press_tween = create_tween()
	_press_tween.set_parallel(true)
	_press_tween.tween_property(self, "scale", Vector2.ONE * 0.96, 0.05)
	_press_tween.tween_method(
		func(v: float): _material.set_shader_parameter("press", v),
		0.0, 1.0, 0.05)


func _on_release() -> void:
	if _material == null:
		return
	if _press_tween != null and _press_tween.is_valid():
		_press_tween.kill()
	_press_tween = create_tween()
	_press_tween.set_parallel(true)
	_press_tween.tween_property(self, "scale", Vector2.ONE, 0.14) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	_press_tween.tween_method(
		func(v: float): _material.set_shader_parameter("press", v),
		float(_material.get_shader_parameter("press")), 0.0, 0.12)
