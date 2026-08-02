extends Control
class_name MainMenu

## Entry point. Also the only place that decides whether a campaign is being
## created or resumed — the world scene assumes one already exists.
##
## Visually: a live starfield shader behind everything, the title on a glow
## panel, and every button an FxButton — this is the player's first five
## seconds with the game, so it is the one screen that most needs to not look
## like a debug harness.

const SLOT := "campaign"

var _status: Label
var _title_glow: FxPanel


func _ready() -> void:
	_build_ui()


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var backdrop := ColorRect.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	var star_material := ShaderMaterial.new()
	star_material.shader = preload("res://shaders/ui_starfield.gdshader")
	backdrop.material = star_material
	add_child(backdrop)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	center.add_child(box)

	_title_glow = FxPanel.new(Color(0.55, 0.8, 1.0))
	box.add_child(_title_glow)
	var title_margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		title_margin.add_theme_constant_override("margin_" + side, 22)
	_title_glow.add_child(title_margin)
	var title_box := VBoxContainer.new()
	title_margin.add_child(title_box)

	var title := Label.new()
	title.text = "AETHERLINE"
	title.add_theme_font_size_override("font_size", 48)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title_box.add_child(title)

	var tagline := Label.new()
	tagline.text = "Carry a bloodline across an infinite scatter of worlds."
	tagline.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tagline.add_theme_color_override("font_color", Color(0.72, 0.78, 0.85))
	title_box.add_child(tagline)

	box.add_child(HSeparator.new())

	_add_button(box, "New Campaign", _new_campaign, Color(0.4, 0.85, 0.55))
	var continue_button := _add_button(box, "Continue", _continue_campaign)
	continue_button.disabled = not SaveSystem.has_slot(SLOT)

	box.add_child(HSeparator.new())
	_add_button(box, "Lineages", func():
		get_tree().change_scene_to_file("res://scenes/ui/lineage_panel.tscn"))
	_add_button(box, "Genome Lab", func():
		get_tree().change_scene_to_file("res://scenes/ui/genome_lab.tscn"))
	_add_button(box, "Run Self-Tests", func():
		get_tree().change_scene_to_file("res://scenes/ui/bootstrap.tscn"))
	_add_button(box, "Quit", func(): get_tree().quit(), Color(0.85, 0.4, 0.4))

	_status = Label.new()
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.add_theme_color_override("font_color", Color(0.7, 0.8, 0.7))
	box.add_child(_status)

	if SaveSystem.has_slot(SLOT):
		_status.text = "Saved campaign found."
		_title_glow.flash(1.2)


func _add_button(parent: Node, text: String, handler: Callable,
		accent: Color = Color(0.35, 0.75, 1.0)) -> FxButton:
	var b := FxButton.new(accent)
	b.text = text
	b.custom_minimum_size = Vector2(280, 40)
	b.pressed.connect(handler)
	parent.add_child(b)
	return b


func _new_campaign() -> void:
	# A flag rather than a parameter, because change_scene_to_file cannot pass
	# arguments and the world scene needs to know which path it is on.
	Engine.set_meta("aetherline_new_campaign", true)
	get_tree().change_scene_to_file("res://scenes/world/overworld.tscn")


func _continue_campaign() -> void:
	Engine.set_meta("aetherline_new_campaign", false)
	get_tree().change_scene_to_file("res://scenes/world/overworld.tscn")
