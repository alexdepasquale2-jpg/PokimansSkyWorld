extends PanelContainer
class_name FxPanel

## A PanelContainer with an animated shader rim behind its content. Drop-in
## replacement for PanelContainer anywhere in the GUI that should feel alive
## rather than static — swap the constructor and nothing else changes.

const SHADER := preload("res://shaders/ui_panel_glow.gdshader")

var _glow: ColorRect
var _material: ShaderMaterial


func _init(rim: Color = Color(0.35, 0.75, 1.0)) -> void:
	_material = ShaderMaterial.new()
	_material.shader = SHADER
	_material.set_shader_parameter("rim_color", Vector3(rim.r, rim.g, rim.b))

	_glow = ColorRect.new()
	_glow.color = Color(0, 0, 0, 0)
	_glow.material = _material
	_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glow.set_anchors_preset(Control.PRESET_FULL_RECT)


func _ready() -> void:
	add_child(_glow)
	move_child(_glow, 0)


## Briefly hikes the rim's pulse — call when something in the panel just
## changed and should catch the eye (an upgrade bought, a save completed).
func flash(duration: float = 0.6) -> void:
	if _material == null:
		return
	var tween := create_tween()
	tween.tween_method(func(v): _material.set_shader_parameter("emphasis", v),
		1.0, 0.0, duration)


func set_rim_color(color: Color) -> void:
	if _material != null:
		_material.set_shader_parameter("rim_color", Vector3(color.r, color.g, color.b))
