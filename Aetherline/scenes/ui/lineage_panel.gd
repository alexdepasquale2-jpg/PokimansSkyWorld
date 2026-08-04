extends Control
class_name LineagePanel

## The campaign's memory, made browsable: every bloodline the player has ever
## had, ranked by legacy, with its founder, its reach, its archetypes, and the
## moments that defined it.

var _list: ItemList
var _detail: RichTextLabel
var _total: Label
var _records: Array = []
var _descent: DescentView
var _person: Label
var _selected_record: LineageRecordResource = null


func _ready() -> void:
	_build_ui()
	refresh()


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var backdrop := ColorRect.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	var star_material := ShaderMaterial.new()
	star_material.shader = preload("res://shaders/ui_starfield.gdshader")
	star_material.set_shader_parameter("tint", Vector3(0.03, 0.04, 0.07))
	star_material.set_shader_parameter("speed", 0.02)
	backdrop.material = star_material
	add_child(backdrop)

	# Inset from the screen edge — the header read "Lin ages: 4" against it.
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 18)
	add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	margin.add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	_total = Label.new()
	_total.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_total)
	_person = Label.new()
	_person.add_theme_font_size_override("font_size", 12)
	_person.add_theme_color_override("font_color", Color(0.80, 0.86, 0.94))
	_person.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_person)

	var back := FxButton.new(Color(0.6, 0.6, 0.68))
	back.text = "Back"
	back.custom_minimum_size = Vector2(100, 32)
	back.pressed.connect(func(): get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn"))
	header.add_child(back)

	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	_list = ItemList.new()
	_list.custom_minimum_size.x = 300
	_list.size_flags_horizontal = Control.SIZE_FILL
	_list.item_selected.connect(_on_selected)
	split.add_child(_list)

	# A VBox, not a VSplitContainer. Rendering this showed the split handing the
	# tree a twenty-pixel strip and the detail pane everything else, so the
	# bloodline was drawn into a slot too short to see it in.
	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	split.add_child(right)

	# The bloodline itself, drawn, above the numbers about it. This screen has
	# ranked lineages by legacy score since Phase 6 and never once showed the
	# player the shape of one.
	var tree_scroll := ScrollContainer.new()
	tree_scroll.custom_minimum_size = Vector2(0, 340)
	tree_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tree_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(tree_scroll)
	_descent = DescentView.new()
	_descent.picked.connect(_on_person_picked)
	tree_scroll.add_child(_descent)

	var scroll := ScrollContainer.new()
	split_detail_host(right, scroll)
	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_detail)


## The detail pane has to be told to take the space it is given. Without this
## the right-hand side of the screen collapsed to its minimum width and the
## bloodline was drawn into a strip about a hundred and eighty pixels across,
## with most of the line off the edge of it.
func split_detail_host(host: Node, scroll: Control) -> void:
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	host.add_child(scroll)


## Clicking somebody in the tree says who they were, without leaving the line.
func _on_person_picked(uid: String) -> void:
	if _selected_record == null:
		return
	var entry: Dictionary = _selected_record.descent.get(uid, {})
	if entry.is_empty():
		return
	var alive := int(entry.get("died", -1)) < 0
	var name := String(entry.get("name", "Someone"))
	# From the recorded NAMES, not from looking both parents up here: the siring
	# parent usually belongs to another bloodline and has no node in this record.
	var names: Array = entry.get("parent_names", [])
	var sired := ""
	if names.size() >= 2:
		sired = "  Born to %s and %s." % [names[0], names[1]]
	elif int(entry.get("generation", 0)) == 0:
		sired = "  One of the first. Nobody here came before them."
	_person.text = "[b]%s[/b] — %s%s" % [
		name,
		"still alive" if alive else "died %s" % LoreVoice.humanise(
			String(entry.get("cause", "somehow"))).to_lower(),
		sired]


func refresh() -> void:
	var total := LegacyScore.recompute_all()
	_records = LegacyScore.ranked()
	_total.text = "Lineages: %d     Total legacy: %.0f" % [_records.size(), total]
	_list.clear()
	for record in _records:
		_list.add_item("%-22s %7.0f%s" % [
			record.display_name, record.legacy_score,
			"  (extinct)" if record.is_extinct() else ""])
	if not _records.is_empty():
		_list.select(0)
		_on_selected(0)
	else:
		_detail.text = "[i]No lineages yet. Breed something.[/i]"


func _on_selected(index: int) -> void:
	if index < 0 or index >= _records.size():
		return
	var record: LineageRecordResource = _records[index]
	_selected_record = record
	_descent.set_descent(record.descent, record.founder_uid)
	_person.text = "Click anyone in the line."
	var lines: Array[String] = []

	lines.append("=== %s ===" % record.display_name)
	lines.append("  founder      %s" % record.founder_name)
	lines.append("  founded      tick %d on %s" % [
		record.founding_tick,
		record.founding_planet_name if not record.founding_planet_name.is_empty()
			else record.founding_planet_id])
	lines.append("  generations  %d" % record.max_generation)
	lines.append("  members      %d ever, %d living" % [
		record.member_uids.size(), record.living_uids.size()])
	lines.append("  worlds       %s" % (", ".join(record.planets_inhabited)
		if not record.planets_inhabited.is_empty() else "none recorded"))

	if not record.archetype_history.is_empty():
		lines.append("")
		lines.append("-- ARCHETYPES PRODUCED --")
		for id in record.archetype_history:
			var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(id)
			lines.append("  %-20s x%d" % [
				definition.display_name if definition != null else id,
				record.archetype_history[id]])

	if not record.entrenched_marks.is_empty():
		lines.append("")
		lines.append("-- INHERITED TRAITS --")
		lines.append("  (marks that survived multiple generations — engineered, not accidental)")
		for id in record.entrenched_marks:
			var mark := GenomeDB.get_epi_template(id)
			lines.append("  %-24s depth %d" % [
				mark.display_name if mark != null else id, record.entrenched_marks[id]])

	lines.append("")
	lines.append("-- LEGACY %0.f --" % record.legacy_score)
	lines.append_array(LegacyScore.breakdown(record))

	if not record.notable_events.is_empty():
		lines.append("")
		lines.append("-- CHRONICLE --")
		var recent: Array = record.notable_events.slice(
			maxi(0, record.notable_events.size() - 25))
		for event in recent:
			lines.append("  [%d] %s" % [event["tick"], event["text"]])

	_detail.text = "[code]%s[/code]" % "\n".join(lines)
