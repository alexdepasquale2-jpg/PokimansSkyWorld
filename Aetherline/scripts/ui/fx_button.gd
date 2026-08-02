extends Button
class_name FxButton

## A Button with a shader sheen that sweeps in on hover and a light scale pop
## on press — the tactile feedback every clickable thing in the GUI should
## have. Behaves exactly like Button otherwise (same .text, same .pressed
## signal), so existing code that builds a Button can switch constructors and
## nothing else changes.

const SHADER := preload("res://shaders/ui_button_sheen.gdshader")

var _material: ShaderMaterial
var _backdrop: ColorRect


func _init(accent: Color = Color(0.35, 0.75, 1.0)) -> void:
	_material = ShaderMaterial.new()
	_material.shader = SHADER
	_material.set_shader_parameter("accent_color", Vector3(accent.r, accent.g, accent.b))

	_backdrop = ColorRect.new()
	_backdrop.material = _material
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_backdrop.show_behind_parent = true

	add_theme_color_override("font_color", Color(0.92, 0.94, 0.97))
	add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	add_theme_stylebox_override("hover", StyleBoxEmpty.new())
	add_theme_stylebox_override("pressed", StyleBoxEmpty.new())
	add_theme_stylebox_override("disabled", StyleBoxEmpty.new())


func _ready() -> void:
	add_child(_backdrop)
	move_child(_backdrop, 0)
	pivot_offset = size * 0.5
	resized.connect(func(): pivot_offset = size * 0.5)
	mouse_entered.connect(_on_hover.bind(true))
	mouse_exited.connect(_on_hover.bind(false))
	button_down.connect(_on_press)
	button_up.connect(_on_release)


func _on_hover(entering: bool) -> void:
	if disabled:
		return
	var tween := create_tween()
	tween.tween_method(func(v): _material.set_shader_parameter("hover", v),
		float(_material.get_shader_parameter("hover")), 1.0 if entering else 0.0, 0.18)


func _on_press() -> void:
	if disabled:
		return
	var tween := create_tween()
	tween.tween_property(self, "scale", Vector2.ONE * 0.95, 0.06)


func _on_release() -> void:
	var tween := create_tween()
	tween.tween_property(self, "scale", Vector2.ONE, 0.12) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
