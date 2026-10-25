extends Control
class_name InventoryPanel

## Cargo management: local world stock vs ship hold, sell for salvage, load/unload.
## The hold capacity is the economic spine — you cannot take everything.

signal closed()
signal changed()

const ACCENT := Color(0.55, 0.85, 0.55)
const WARM := Color(1.0, 0.78, 0.4)

var session: GameSession
var _list: ItemList
var _detail: RichTextLabel
var _header: Label
var _lines: Array = []
var _selected: int = 0
var _panel: FxPanel


func _ready() -> void:
	_build()
	visible = false


func open(game_session: GameSession) -> void:
	session = game_session
	visible = true
	_refresh()
	if _panel != null:
		_panel.flash(0.4)
	modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 0.16)


func close() -> void:
	visible = false
	closed.emit()


func _build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.04, 0.03, 0.65)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and ev.pressed:
			close())
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	_panel = FxPanel.new(ACCENT, 0.92)
	_panel.custom_minimum_size = Vector2(720, 520)
	center.add_child(_panel)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	_panel.add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	_header = Label.new()
	_header.add_theme_font_size_override("font_size", 22)
	_header.add_theme_color_override("font_color", Color(0.9, 0.98, 0.9))
	root.add_child(_header)

	var sub := Label.new()
	sub.text = "Local stays on this world when you jump. The hold travels. Sell converts goods → salvage."
	sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	sub.add_theme_font_size_override("font_size", 12)
	sub.add_theme_color_override("font_color", Color(0.65, 0.78, 0.68))
	root.add_child(sub)

	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	_list = ItemList.new()
	_list.custom_minimum_size = Vector2(320, 280)
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.item_selected.connect(_on_selected)
	split.add_child(_list)

	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 8)
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	split.add_child(right)

	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.custom_minimum_size = Vector2(300, 160)
	_detail.add_theme_color_override("default_color", Color(0.85, 0.9, 0.88))
	right.add_child(_detail)

	var actions := VBoxContainer.new()
	actions.add_theme_constant_override("separation", 6)
	right.add_child(actions)

	_add_action(actions, "Load 10 → Hold", ACCENT, func(): _transfer(true, 10.0))
	_add_action(actions, "Load All → Hold", ACCENT, func(): _transfer(true, 99999.0))
	_add_action(actions, "Unload 10 → Local", Color(0.5, 0.7, 0.95), func(): _transfer(false, 10.0))
	_add_action(actions, "Unload All → Local", Color(0.5, 0.7, 0.95), func(): _transfer(false, 99999.0))
	_add_action(actions, "Sell 10 for Salvage", WARM, func(): _sell(10.0))
	_add_action(actions, "Sell All of This", WARM, func(): _sell(99999.0))
	_add_action(actions, "Auto-load Hold (prep jump)", Color(0.85, 0.7, 0.4), _auto_load)

	var footer := HBoxContainer.new()
	footer.alignment = BoxContainer.ALIGNMENT_END
	root.add_child(footer)
	var close_btn := FxButton.new(Color(0.7, 0.5, 0.5))
	close_btn.text = "Close  (I / Esc)"
	close_btn.custom_minimum_size = Vector2(180, 40)
	close_btn.pressed.connect(close)
	footer.add_child(close_btn)


func _add_action(parent: Node, text: String, accent: Color, handler: Callable) -> void:
	var b := FxButton.new(accent)
	b.text = text
	b.custom_minimum_size = Vector2(0, 34)
	b.pressed.connect(handler)
	parent.add_child(b)


func _refresh() -> void:
	if session == null or _list == null:
		return
	_lines = session.stock.lines()
	var mass := session.stock.carried_mass()
	var cap := session.stock.carry_capacity
	_header.text = "INVENTORY  ·  hold %.0f / %.0f  ·  salvage %.0f" % [
		mass, cap, session.ship.salvage]

	_list.clear()
	if _lines.is_empty():
		_list.add_item("(empty — gather resources or buy at a trade post)")
		_detail.text = "Nothing in stock. Harvest nodes with [E], or buy goods at a settlement."
		return
	for entry in _lines:
		var id := String(entry["id"])
		_list.add_item("%s   local %.0f · hold %.0f" % [
			Market.display_name(id).rpad(16),
			float(entry["local"]), float(entry["carried"])])
	var pick := clampi(_selected, 0, _lines.size() - 1)
	_list.select(pick)
	_on_selected(pick)


func _on_selected(index: int) -> void:
	if index < 0 or index >= _lines.size():
		return
	_selected = index
	var entry: Dictionary = _lines[index]
	var id := String(entry["id"])
	var sell10 := Market.sell_value(id, 10.0, session.ship)
	var buy10 := Market.buy_cost(id, 10.0, session.ship)
	var lines: Array[String] = []
	lines.append("[b]%s[/b]" % Market.display_name(id))
	lines.append("  local     %.1f" % float(entry["local"]))
	lines.append("  in hold   %.1f" % float(entry["carried"]))
	lines.append("  total     %.1f" % float(entry["total"]))
	lines.append("")
	lines.append("[color=#ffd070]Market[/color]")
	lines.append("  sell 10 → [b]%.1f salvage[/b]" % sell10)
	lines.append("  buy 10  ← [b]%.1f salvage[/b]" % buy10)
	lines.append("")
	lines.append("Hold room: %.0f" % maxf(0.0,
		session.stock.carry_capacity - session.stock.carried_mass()))
	_detail.text = "\n".join(lines)


func _current_id() -> String:
	if _selected < 0 or _selected >= _lines.size():
		return ""
	return String(_lines[_selected]["id"])


func _transfer(to_hold: bool, qty: float) -> void:
	var id := _current_id()
	if id.is_empty() or session == null:
		return
	var moved := 0.0
	if to_hold:
		moved = session.stock.load_for_travel(id, qty)
	else:
		moved = session.stock.unload_from_hold(id, qty)
	if moved <= 0.0:
		_detail.text = "[color=#ff8888]Could not move goods (empty pile or hold full).[/color]"
		return
	session.resources_changed.emit()
	changed.emit()
	_refresh()


func _sell(qty: float) -> void:
	var id := _current_id()
	if id.is_empty() or session == null:
		return
	var gained := Market.sell_from_stock(session.stock, id, qty, session.ship)
	if gained <= 0.0:
		_detail.text = "[color=#ff8888]Nothing to sell.[/color]"
		return
	session.resources_changed.emit()
	session.notice.emit("Sold %s for +%.0f salvage." % [Market.display_name(id), gained])
	changed.emit()
	_refresh()


func _auto_load() -> void:
	if session == null:
		return
	var manifest := session.prepare_hold()
	var n := 0
	for k in manifest:
		n += 1
	session.notice.emit("Hold packed: %d resource type(s)." % n)
	changed.emit()
	_refresh()
