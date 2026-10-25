extends PanelContainer
class_name FxPanel

## Panel with an animated rim + soft fill. Drop-in for PanelContainer anywhere
## the UI should feel like a living instrument rather than a static box.

const SHADER := preload("res://shaders/ui_panel_glow.gdshader")

var _glow: ColorRect
var _material: ShaderMaterial
var _rim: Color = Color(0.35, 0.75, 1.0)


func _init(rim: Color = Color(0.35, 0.75, 1.0), fill_alpha: float = 0.82) -> void:
	_rim = rim
	_material = ShaderMaterial.new()
	_material.shader = SHADER
	_material.set_shader_parameter("rim_color", Vector3(rim.r, rim.g, rim.b))
	_material.set_shader_parameter("fill_color", Vector3(0.04, 0.06, 0.10))
	_material.set_shader_parameter("fill_alpha", fill_alpha)
	_material.set_shader_parameter("emphasis", 0.0)

	_glow = ColorRect.new()
	_glow.color = Color(0, 0, 0, 0)
	_glow.material = _material
	_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glow.set_anchors_preset(Control.PRESET_FULL_RECT)
	_glow.show_behind_parent = true

	# Kill default Godot panel chrome — the shader is the surface.
	add_theme_stylebox_override("panel", StyleBoxEmpty.new())


func _ready() -> void:
	add_child(_glow)
	move_child(_glow, 0)


## Briefly hikes the rim pulse — upgrades bought, saves completed, landfall.
func flash(duration: float = 0.7) -> void:
	if _material == null:
		return
	var tween := create_tween()
	tween.tween_method(func(v: float): _material.set_shader_parameter("emphasis", v),
		1.0, 0.0, duration).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func set_rim_color(color: Color) -> void:
	_rim = color
	if _material != null:
		_material.set_shader_parameter("rim_color", Vector3(color.r, color.g, color.b))


func set_fill_alpha(a: float) -> void:
	if _material != null:
		_material.set_shader_parameter("fill_alpha", a)
