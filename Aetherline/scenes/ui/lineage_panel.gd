extends Control
class_name LineagePanel

## The campaign's memory, made browsable: every bloodline the player has ever
## had, ranked by legacy, with its founder, its reach, its archetypes, and the
## moments that defined it.

var _list: ItemList
var _detail: RichTextLabel
var _total: Label
var _records: Array = []


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

	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	_total = Label.new()
	_total.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_total)
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
	_list.item_selected.connect(_on_selected)
	split.add_child(_list)

	var scroll := ScrollContainer.new()
	split.add_child(scroll)
	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_detail)


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
