extends RefCounted
class_name ActionEffects

## A shared, data-driven effect layer for game actions and upgrades.
## New actions only need to add a definition here; the visuals and feedback
## hooks stay centralized instead of being hard-coded into each system.

static func apply(target: Node, action_id: String, payload: Dictionary = {}) -> void:
	var definition := action_definition(action_id)
	if definition.is_empty():
		return
	if target == null:
		return
	if definition.get("screen_flash", false):
		_flash_screen(target, definition)
	if definition.get("sprite_flash", false):
		_flash_sprite(target, definition)
	if definition.get("label_text", "").is_empty() == false:
		_emit_label(target, definition, payload)
	if definition.get("sound", "").is_empty() == false:
		_emit_sound(target, definition)


static func action_definition(action_id: String) -> Dictionary:
	var catalog: Dictionary = {
		"scan": {
			"screen_flash": true,
			"sprite_flash": true,
			"label_text": "scanned",
			"color": Color(0.45, 0.75, 1.0),
			"intensity": 0.28,
			"pulse_speed": 2.8,
		},
		"catch": {
			"screen_flash": true,
			"sprite_flash": true,
			"label_text": "caught",
			"color": Color(0.9, 0.8, 0.35),
			"intensity": 0.4,
			"pulse_speed": 4.2,
		},
		"fight": {
			"screen_flash": true,
			"sprite_flash": true,
			"label_text": "struck",
			"color": Color(1.0, 0.35, 0.28),
			"intensity": 0.36,
			"pulse_speed": 3.6,
		},
		"harvest": {
			"screen_flash": true,
			"sprite_flash": true,
			"label_text": "harvested",
			"color": Color(0.7, 0.95, 0.45),
			"intensity": 0.3,
			"pulse_speed": 2.4,
		},
		"upgrade": {
			"screen_flash": true,
			"sprite_flash": true,
			"label_text": "upgraded",
			"color": Color(0.3, 0.95, 0.68),
			"intensity": 0.5,
			"pulse_speed": 4.8,
		},
		"sell": {
			"screen_flash": true,
			"sprite_flash": true,
			"label_text": "sold",
			"color": Color(0.95, 0.7, 0.25),
			"intensity": 0.34,
			"pulse_speed": 3.0,
		},
		"rest": {
			"screen_flash": true,
			"sprite_flash": false,
			"label_text": "rested",
			"color": Color(0.66, 0.82, 1.0),
			"intensity": 0.24,
			"pulse_speed": 2.0,
		},
	}
	return catalog.get(action_id, {})


static func _flash_screen(target: Node, definition: Dictionary) -> void:
	var root := target.get_tree().current_scene if target.get_tree() != null else null
	if root == null:
		return
	var layer := CanvasLayer.new()
	layer.layer = 100
	root.add_child(layer)
	var rect := ColorRect.new()
	rect.color = definition.get("color", Color.WHITE)
	rect.modulate = Color(1, 1, 1, 0.0)
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(rect)
	var tween := rect.create_tween()
	tween.tween_property(rect, "modulate", Color(1, 1, 1, 0.12), 0.08)
	tween.tween_property(rect, "modulate", Color(1, 1, 1, 0.0), 0.22)
	tween.tween_callback(func(): rect.queue_free(); layer.queue_free())


static func _flash_sprite(target: Node, definition: Dictionary) -> void:
	if target == null or not target.has_method("get_material"):
		return
	var material: ShaderMaterial = target.get_material()
	if material == null:
		material = ShaderMaterial.new()
		material.shader = preload("res://shaders/action_flash.gdshader")
		target.set_material(material)
	var shader: ShaderMaterial = material
	if shader == null:
		return
	shader.set_shader_parameter("flash_color", Vector3(
		definition.get("color", Color.WHITE).r,
		definition.get("color", Color.WHITE).g,
		definition.get("color", Color.WHITE).b))
	shader.set_shader_parameter("intensity", float(definition.get("intensity", 0.3)))
	shader.set_shader_parameter("pulse_speed", float(definition.get("pulse_speed", 3.0)))
	var tween := target.create_tween()
	tween.tween_method(func(v): shader.set_shader_parameter("intensity", v),
		float(definition.get("intensity", 0.3)), 0.0, 0.24)


static func _emit_label(target: Node, definition: Dictionary, payload: Dictionary) -> void:
	if target == null:
		return
	var label := Label.new()
	label.text = String(payload.get("name", "")) if not payload.is_empty() else String(definition.get("label_text", ""))
	label.modulate = Color(1, 1, 1, 0.0)
	label.add_theme_color_override("font_color", definition.get("color", Color.WHITE))
	label.add_theme_font_size_override("font_size", 18)
	var parent := target if target is Control else target.get_parent()
	if parent is Control:
		parent.add_child(label)
		label.position = Vector2(0, -28)
		var tween := label.create_tween()
		tween.tween_property(label, "modulate", Color(1, 1, 1, 1.0), 0.12)
		tween.tween_property(label, "position", Vector2(0, -52), 0.5)
		tween.tween_property(label, "modulate", Color(1, 1, 1, 0.0), 0.18)
		tween.tween_callback(func(): label.queue_free())


static func _emit_sound(target: Node, definition: Dictionary) -> void:
	# Sound effects are intentionally disabled in this build: no asset files are
	# available, and the gameplay feedback is already provided visually.
	return
