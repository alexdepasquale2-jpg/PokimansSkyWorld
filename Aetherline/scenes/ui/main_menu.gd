extends Control
class_name MainMenu

## Cinematic entry: living starfield, instrument-plate title, Fx buttons.
## Decides whether a campaign is created or resumed via Engine meta.

const SLOT := "campaign"
const ACCENT := Color(0.42, 0.82, 1.0)
const ACCENT_WARM := Color(1.0, 0.78, 0.38)

var _status: Label
var _title: Label
var _tagline: Label


func _ready() -> void:
	_build_ui()
	_play_intro()


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var backdrop := ColorRect.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	var star_path := "res://shaders/ui_starfield.gdshader"
	if ResourceLoader.exists(star_path):
		var star_material := ShaderMaterial.new()
		star_material.shader = load(star_path)
		star_material.set_shader_parameter("speed", 0.05)
		star_material.set_shader_parameter("nebula_strength", 0.95)
		backdrop.material = star_material
	else:
		backdrop.color = Color(0.03, 0.045, 0.09)
	add_child(backdrop)

	# Soft bottom gradient so the button stack sits in warmer light.
	var floor_glow := ColorRect.new()
	floor_glow.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	floor_glow.offset_top = -280
	floor_glow.color = Color(0.08, 0.12, 0.22, 0.0)
	floor_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(floor_glow)
	var floor_mat := ShaderMaterial.new()
	if ResourceLoader.exists("res://shaders/ui_panel_ripple.gdshader"):
		floor_mat.shader = load("res://shaders/ui_panel_ripple.gdshader")
		floor_mat.set_shader_parameter("accent_color", Vector3(0.25, 0.45, 0.85))
		floor_mat.set_shader_parameter("intensity", 0.55)
		floor_mat.set_shader_parameter("speed", 0.6)
		floor_glow.material = floor_mat
		floor_glow.color = Color(1, 1, 1, 1)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	center.add_child(box)

	var title_panel := FxPanel.new(ACCENT, 0.72)
	title_panel.custom_minimum_size = Vector2(560, 0)
	box.add_child(title_panel)

	var title_margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		title_margin.add_theme_constant_override("margin_" + side, 28)
	title_panel.add_child(title_margin)

	var title_box := VBoxContainer.new()
	title_box.add_theme_constant_override("separation", 6)
	title_margin.add_child(title_box)

	var eyebrow := Label.new()
	eyebrow.text = "LINEAGE  ·  EXODUS  ·  LEGACY"
	eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow.add_theme_font_size_override("font_size", 12)
	eyebrow.add_theme_color_override("font_color", Color(0.55, 0.78, 0.95, 0.9))
	title_box.add_child(eyebrow)

	_title = Label.new()
	_title.text = "AETHERLINE"
	_title.add_theme_font_size_override("font_size", 56)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.add_theme_color_override("font_color", Color(0.95, 0.97, 1.0))
	_title.add_theme_color_override("font_outline_color", Color(0.1, 0.25, 0.45, 0.85))
	_title.add_theme_constant_override("outline_size", 6)
	title_box.add_child(_title)

	_tagline = Label.new()
	_tagline.text = "Carry a bloodline across an infinite scatter of worlds."
	_tagline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_tagline.add_theme_font_size_override("font_size", 15)
	_tagline.add_theme_color_override("font_color", Color(0.72, 0.80, 0.90))
	title_box.add_child(_tagline)

	var sub := Label.new()
	sub.text = "Scan. Survive. Breed. Remember."
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 13)
	sub.add_theme_color_override("font_color", ACCENT_WARM)
	title_box.add_child(sub)

	var sep := HSeparator.new()
	sep.modulate = Color(1, 1, 1, 0.25)
	box.add_child(sep)

	_add_button(box, "New Campaign", ACCENT, _new_campaign)
	var continue_button := _add_button(box, "Continue", ACCENT, _continue_campaign)
	continue_button.disabled = not SaveSystem.has_slot(SLOT)
	if continue_button.disabled:
		continue_button.modulate = Color(0.65, 0.68, 0.75, 0.7)

	var lab_sep := HSeparator.new()
	lab_sep.modulate = Color(1, 1, 1, 0.15)
	box.add_child(lab_sep)

	_add_button(box, "Genome Lab", Color(0.55, 0.85, 0.65), func():
		get_tree().change_scene_to_file("res://scenes/ui/genome_lab.tscn"))
	_add_button(box, "Run Self-Tests", Color(0.7, 0.7, 0.85), func():
		get_tree().change_scene_to_file("res://scenes/ui/bootstrap.tscn"))
	_add_button(box, "Quit", Color(0.9, 0.45, 0.4), func(): get_tree().quit())

	_status = Label.new()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_font_size_override("font_size", 13)
	_status.add_theme_color_override("font_color", Color(0.65, 0.82, 0.72))
	box.add_child(_status)

	if SaveSystem.has_slot(SLOT):
		_status.text = "A bloodline waits in cryo. Continue when ready."
	else:
		_status.text = "No save yet — the first generation begins with you."

	# Version / mode whisper.
	var version := Label.new()
	version.text = "ODYSSEY BUILD  ·  PROCEDURAL WORLDS  ·  CULTURE MEMORY"
	version.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	version.offset_top = -36
	version.offset_bottom = -12
	version.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	version.add_theme_font_size_override("font_size", 11)
	version.add_theme_color_override("font_color", Color(0.4, 0.5, 0.62, 0.75))
	version.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(version)


func _play_intro() -> void:
	modulate.a = 0.0
	if _title != null:
		_title.modulate.a = 0.0
	if _tagline != null:
		_tagline.modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 0.55)
	if _title != null:
		tween.parallel().tween_property(_title, "modulate:a", 1.0, 0.9) \
			.set_delay(0.15)
	if _tagline != null:
		tween.parallel().tween_property(_tagline, "modulate:a", 1.0, 1.0) \
			.set_delay(0.35)


func _add_button(parent: Node, text: String, accent: Color, handler: Callable) -> Button:
	var b := FxButton.new(accent)
	b.text = text
	b.custom_minimum_size = Vector2(320, 44)
	b.pressed.connect(handler)
	parent.add_child(b)
	return b


func _new_campaign() -> void:
	Engine.set_meta("aetherline_new_campaign", true)
	get_tree().change_scene_to_file("res://scenes/world/overworld.tscn")


func _continue_campaign() -> void:
	Engine.set_meta("aetherline_new_campaign", false)
	get_tree().change_scene_to_file("res://scenes/world/overworld.tscn")
