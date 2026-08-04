extends Control
class_name PartyPanel

## Party roster with instrument-plate chrome. Full genetics stay in Genome Lab;
## this is the in-field glance that keeps the Odyssey loop moving.

const ACCENT := Color(0.55, 0.85, 0.95)

var session: GameSession
var _list: ItemList
var _detail: Label
var _title: Label
var _panel: FxPanel


func _ready() -> void:
	_build()
	visible = false


func open(game_session: GameSession, _owner_scene: Node = null) -> void:
	session = game_session
	visible = true
	_refresh()
	if _panel != null:
		_panel.flash(0.45)
	modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 0.18)


func close() -> void:
	visible = false


func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.05, 0.62)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and ev.pressed:
			close())
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	_panel = FxPanel.new(ACCENT, 0.9)
	_panel.custom_minimum_size = Vector2(460, 400)
	center.add_child(_panel)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	_panel.add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	_title = Label.new()
	_title.text = "BLOODLINE  ·  PARTY"
	_title.add_theme_font_size_override("font_size", 22)
	_title.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0))
	_title.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_title.add_theme_constant_override("outline_size", 3)
	root.add_child(_title)

	var sub := Label.new()
	sub.text = "Those who walk with you shape the culture. The rest wait on the ship."
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 12)
	sub.add_theme_color_override("font_color", Color(0.65, 0.72, 0.82))
	root.add_child(sub)

	_list = ItemList.new()
	_list.custom_minimum_size = Vector2(0, 210)
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.add_theme_color_override("font_color", Color(0.88, 0.9, 0.95))
	_list.add_theme_color_override("font_selected_color", Color(0.45, 0.95, 1.0))
	_list.item_selected.connect(_on_selected)
	root.add_child(_list)

	_detail = Label.new()
	_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_detail.add_theme_color_override("font_color", Color(0.75, 0.82, 0.90))
	_detail.add_theme_font_size_override("font_size", 13)
	root.add_child(_detail)

	var close_btn := FxButton.new(Color(0.7, 0.5, 0.5))
	close_btn.text = "Close  (P / Esc)"
	close_btn.custom_minimum_size = Vector2(0, 40)
	close_btn.pressed.connect(close)
	root.add_child(close_btn)


func _refresh() -> void:
	if session == null or _list == null:
		return
	_list.clear()
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		var hp_frac := c.stats.hp_fraction() if c.stats != null else 0.0
		var bars := int(round(hp_frac * 10.0))
		var bar := "█".repeat(bars) + "░".repeat(10 - bars)
		var down := "  · DOWNED" if c.stats != null and c.stats.downed else ""
		var human := " · human" if c.identity != null and c.identity.is_human else ""
		_list.add_item("%s   [%s]  %d/%d%s%s" % [
			c.display_name(), bar,
			int(c.stats.hp) if c.stats else 0,
			int(c.stats.max_hp()) if c.stats else 0,
			down, human])
		var idx := _list.item_count - 1
		if c.stats != null and c.stats.downed:
			_list.set_item_custom_fg_color(idx, Color(1.0, 0.45, 0.4))
		elif hp_frac < 0.35:
			_list.set_item_custom_fg_color(idx, Color(1.0, 0.75, 0.4))
		else:
			_list.set_item_custom_fg_color(idx, Color(0.7, 0.95, 0.8))
	if not session.party.active.is_empty():
		_list.select(0)
		_on_selected(0)
	else:
		_detail.text = "No party members. Catch, gift, or breed a companion."
	var stored_n := session.party.stored.size()
	if stored_n > 0:
		_detail.text = (_detail.text + "\n%d resting on the ship." % stored_n).strip_edges()


func _on_selected(index: int) -> void:
	if session == null or index < 0 or index >= session.party.active.size():
		return
	var c: Creature = session.party.active[index]
	if not is_instance_valid(c):
		return
	var d := c.stats.derived() if c.stats != null else {}
	var ph := c.stats.phenotype() if c.stats != null else {}
	var arch := ""
	if c.archetype != null and c.archetype.state != null and c.archetype.state.has_any_archetype():
		for archetype_id in c.archetype.state.progress:
			if c.archetype.state.is_crystallized(archetype_id):
				var def: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
				arch = " · %s" % (def.display_name if def != null else String(archetype_id))
				break
	_detail.text = "%s · size %.1f · atk %.1f · def %.1f · spd %.0f%s" % [
		c.display_name(),
		float(ph.get("size", 1.0)),
		float(d.get("attack_power", 0.0)),
		float(d.get("defense", 0.0)),
		float(d.get("move_speed", 0.0)),
		arch]
