extends Control
class_name ShipView

## Orbit bay: modules, inventory snapshot, achievements, and jump navigation.
## Every departure can pass through here so salvage becomes permanent capability.

signal jump_requested(planet_id: String)
signal open_star_map_requested()
signal open_inventory_requested()
signal returned_to_surface()

const ACCENT := Color(0.4, 0.85, 0.95)
const WARM := Color(1.0, 0.78, 0.4)
const SELL := Color(0.95, 0.65, 0.3)

var session: GameSession
var ship: ShipSystem

var _salvage_label: Label
var _module_list: VBoxContainer
var _detail: RichTextLabel
var _loop_summary: RichTextLabel
var _tab_modules: Button
var _tab_cargo: Button
var _tab_achievements: Button
var _content_host: Control
var _module_scroll: ScrollContainer
var _cargo_box: VBoxContainer
var _achieve_box: VBoxContainer
var _sell_mode_button: Button
var _panel: FxPanel

var _sell_mode := false
var _tab := "modules"


func open(game_session: GameSession) -> void:
	session = game_session
	ship = game_session.ship
	visible = true
	_refresh()
	if _panel != null:
		_panel.flash(0.45)
	modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 0.18)


func _ready() -> void:
	# Prefer full code UI — the packed scene is a stub scaffold.
	if get_child_count() > 0:
		for c in get_children():
			c.queue_free()
	_build_ui()
	visible = false


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	var star_path := "res://shaders/ui_starfield.gdshader"
	if ResourceLoader.exists(star_path):
		var sm := ShaderMaterial.new()
		sm.shader = load(star_path)
		sm.set_shader_parameter("speed", 0.02)
		sm.set_shader_parameter("nebula_strength", 0.4)
		dim.material = sm
		dim.color = Color(1, 1, 1, 1)
	else:
		dim.color = Color(0.02, 0.04, 0.08, 0.85)
	add_child(dim)

	_panel = FxPanel.new(ACCENT, 0.92)
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_panel.offset_left = 56
	_panel.offset_top = 40
	_panel.offset_right = -56
	_panel.offset_bottom = -40
	add_child(_panel)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	_panel.add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	root.add_child(header)

	var title_box := VBoxContainer.new()
	title_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_box)

	var title := Label.new()
	title.text = "SHIP BAY  ·  ORBIT"
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color(0.92, 0.96, 1.0))
	title_box.add_child(title)

	var sub := Label.new()
	sub.text = "Spend salvage on modules. Load the hold. Jump when ready."
	sub.add_theme_font_size_override("font_size", 12)
	sub.add_theme_color_override("font_color", Color(0.65, 0.75, 0.85))
	title_box.add_child(sub)

	_salvage_label = Label.new()
	_salvage_label.add_theme_font_size_override("font_size", 20)
	_salvage_label.add_theme_color_override("font_color", WARM)
	header.add_child(_salvage_label)

	_loop_summary = RichTextLabel.new()
	_loop_summary.bbcode_enabled = true
	_loop_summary.fit_content = true
	_loop_summary.custom_minimum_size.y = 72
	_loop_summary.add_theme_color_override("default_color", Color(0.8, 0.86, 0.92))
	root.add_child(_loop_summary)

	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	root.add_child(tabs)
	_tab_modules = FxButton.new(ACCENT)
	_tab_modules.text = "Modules"
	_tab_modules.custom_minimum_size = Vector2(120, 34)
	_tab_modules.pressed.connect(func(): _set_tab("modules"))
	tabs.add_child(_tab_modules)
	_tab_cargo = FxButton.new(Color(0.55, 0.85, 0.55))
	_tab_cargo.text = "Cargo"
	_tab_cargo.custom_minimum_size = Vector2(120, 34)
	_tab_cargo.pressed.connect(func(): _set_tab("cargo"))
	tabs.add_child(_tab_cargo)
	_tab_achievements = FxButton.new(Color(0.85, 0.7, 0.45))
	_tab_achievements.text = "Achievements"
	_tab_achievements.custom_minimum_size = Vector2(140, 34)
	_tab_achievements.pressed.connect(func(): _set_tab("achievements"))
	tabs.add_child(_tab_achievements)

	_sell_mode_button = FxButton.new(SELL)
	_sell_mode_button.custom_minimum_size = Vector2(140, 34)
	_sell_mode_button.pressed.connect(_on_sell_mode_pressed)
	tabs.add_child(_sell_mode_button)

	var content := HSplitContainer.new()
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.custom_minimum_size.y = 280
	root.add_child(content)

	_content_host = Control.new()
	_content_host.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_content_host.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_content_host.custom_minimum_size.x = 380
	content.add_child(_content_host)

	_module_scroll = ScrollContainer.new()
	_module_scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	_content_host.add_child(_module_scroll)
	_module_list = VBoxContainer.new()
	_module_list.add_theme_constant_override("separation", 4)
	_module_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_module_scroll.add_child(_module_list)

	_cargo_box = VBoxContainer.new()
	_cargo_box.set_anchors_preset(Control.PRESET_FULL_RECT)
	_cargo_box.add_theme_constant_override("separation", 6)
	_cargo_box.visible = false
	_content_host.add_child(_cargo_box)

	_achieve_box = VBoxContainer.new()
	_achieve_box.set_anchors_preset(Control.PRESET_FULL_RECT)
	_achieve_box.add_theme_constant_override("separation", 4)
	_achieve_box.visible = false
	_content_host.add_child(_achieve_box)

	var detail_scroll := ScrollContainer.new()
	detail_scroll.custom_minimum_size.x = 340
	detail_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_child(detail_scroll)
	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.custom_minimum_size = Vector2(320, 260)
	_detail.add_theme_color_override("default_color", Color(0.82, 0.88, 0.94))
	detail_scroll.add_child(_detail)

	var footer := HBoxContainer.new()
	footer.add_theme_constant_override("separation", 10)
	footer.alignment = BoxContainer.ALIGNMENT_END
	root.add_child(footer)

	var inv := FxButton.new(Color(0.55, 0.85, 0.55))
	inv.text = "Full Inventory  (I)"
	inv.custom_minimum_size = Vector2(170, 40)
	inv.pressed.connect(func():
		open_inventory_requested.emit())
	footer.add_child(inv)

	var nav := FxButton.new(WARM)
	nav.text = "Star Map  (J)"
	nav.custom_minimum_size = Vector2(150, 40)
	nav.pressed.connect(_on_navigation_pressed)
	footer.add_child(nav)

	var ret := FxButton.new(Color(0.7, 0.5, 0.5))
	ret.text = "Return to Surface"
	ret.custom_minimum_size = Vector2(170, 40)
	ret.pressed.connect(_on_return_pressed)
	footer.add_child(ret)

	_update_sell_mode_label()


func _set_tab(tab: String) -> void:
	_tab = tab
	_module_scroll.visible = tab == "modules"
	_cargo_box.visible = tab == "cargo"
	_achieve_box.visible = tab == "achievements"
	_refresh()


func _on_return_pressed() -> void:
	visible = false
	returned_to_surface.emit()


func _on_navigation_pressed() -> void:
	if session == null:
		return
	visible = false
	open_star_map_requested.emit()


func _on_sell_mode_pressed() -> void:
	_sell_mode = not _sell_mode
	_update_sell_mode_label()
	_refresh()


func _refresh() -> void:
	if ship == null or session == null:
		return
	_salvage_label.text = "%.0f salvage" % ship.salvage
	_refresh_loop_summary()
	match _tab:
		"modules":
			_refresh_modules()
		"cargo":
			_refresh_cargo()
		"achievements":
			_refresh_achievements()
	_update_sell_mode_label()


func _refresh_modules() -> void:
	for child in _module_list.get_children():
		child.queue_free()

	var by_category := {}
	for module_id in ShipSystem.modules:
		var category := String(ShipSystem.modules[module_id].get("category", "Other"))
		if not by_category.has(category):
			by_category[category] = []
		by_category[category].append(module_id)

	var cats: Array = by_category.keys()
	cats.sort()
	for category in cats:
		var header := Label.new()
		header.text = String(category).to_upper()
		header.add_theme_color_override("font_color", Color(0.55, 0.75, 0.9))
		header.add_theme_font_size_override("font_size", 12)
		_module_list.add_child(header)

		for module_id in by_category[category]:
			var module_key := String(module_id)
			var definition: Dictionary = ShipSystem.modules[module_key]
			var level := ship.level_of(module_key)
			var maxed := level >= ship.max_level(module_key)
			var cost := ship.cost_of(module_key)

			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 6)
			_module_list.add_child(row)

			var accent := Color(0.4, 0.85, 0.55) if not maxed and ship.can_upgrade(module_key) \
				else (SELL if _sell_mode and level > 0 else Color(0.45, 0.48, 0.55))

			var button := FxButton.new(accent)
			button.custom_minimum_size = Vector2(300, 36)
			if _sell_mode:
				var refund := (ship.paid_cost(module_key) / maxf(1.0, float(level))) * 0.6 if level > 0 else 0.0
				button.text = "%s  sell L%d → +%.0f" % [definition["display_name"], level, refund]
				button.disabled = level <= 0
			else:
				button.text = "%s  [%d/%d]%s" % [
					definition["display_name"], level, ship.max_level(module_key),
					"" if maxed else "  ·  %.0f" % cost]
				button.disabled = maxed or not ship.can_upgrade(module_key)

			button.pressed.connect(_on_module_button_pressed.bind(module_key))
			row.add_child(button)

			var info := FxButton.new(Color(0.5, 0.6, 0.8))
			info.text = "?"
			info.custom_minimum_size = Vector2(36, 36)
			info.pressed.connect(_show_detail.bind(module_key))
			row.add_child(info)


func _on_module_button_pressed(module_key: String) -> void:
	var definition: Dictionary = ShipSystem.modules[module_key]
	if _sell_mode:
		if ship.sell(module_key):
			ship.apply_biology_bonuses()
			session.stock.carry_capacity = ship.carry_capacity()
			session.notice.emit("[b]%s[/b] sold back for salvage." % definition["display_name"])
			ActionEffects.apply(self, "sell", {"name": definition["display_name"]})
			_refresh()
			_show_detail(module_key)
	else:
		if ship.upgrade(module_key):
			ship.apply_biology_bonuses()
			session.stock.carry_capacity = ship.carry_capacity()
			session.notice.emit("[b]%s[/b] upgraded." % definition["display_name"])
			var action: String = ship.module_definition(module_key).get("action", "upgrade")
			ActionEffects.apply(self, action, {"name": definition["display_name"]})
			_refresh()
			_show_detail(module_key)


func _refresh_cargo() -> void:
	for child in _cargo_box.get_children():
		child.queue_free()

	var mass := session.stock.carried_mass()
	var cap := session.stock.carry_capacity
	var head := Label.new()
	head.text = "Hold  %.0f / %.0f mass" % [mass, cap]
	head.add_theme_font_size_override("font_size", 16)
	head.add_theme_color_override("font_color", Color(0.85, 0.95, 0.85))
	_cargo_box.add_child(head)

	var bar := ProgressBar.new()
	bar.max_value = maxf(1.0, cap)
	bar.value = mass
	bar.custom_minimum_size = Vector2(0, 18)
	bar.show_percentage = false
	_cargo_box.add_child(bar)

	var lines := session.stock.lines()
	if lines.is_empty():
		var empty := Label.new()
		empty.text = "Hold empty. Gather resources or open Full Inventory."
		empty.add_theme_color_override("font_color", Color(0.6, 0.65, 0.7))
		_cargo_box.add_child(empty)
	else:
		for entry in lines:
			var id := String(entry["id"])
			var row := Label.new()
			row.text = "%s   local %.0f · hold %.0f   (sell 10 = %.0f salvage)" % [
				Market.display_name(id),
				float(entry["local"]), float(entry["carried"]),
				Market.sell_value(id, 10.0, ship)]
			row.add_theme_font_size_override("font_size", 13)
			_cargo_box.add_child(row)

	var pack := FxButton.new(WARM)
	pack.text = "Auto-pack hold for jump"
	pack.custom_minimum_size = Vector2(0, 36)
	pack.pressed.connect(func():
		session.prepare_hold()
		session.notice.emit("Hold packed for departure.")
		_refresh())
	_cargo_box.add_child(pack)

	_detail.text = "[b]Cargo rules[/b]\n\nLocal goods stay on this world when you jump.\nThe hold travels with you, limited by Cargo Hold modules.\n\nSell goods at a Trade Post or in Inventory for salvage.\nSalvage buys ship modules that permanently open the game."


func _refresh_achievements() -> void:
	for child in _achieve_box.get_children():
		child.queue_free()
	for entry in ship.achievement_progress():
		var e: Dictionary = entry
		var row := Label.new()
		var done: bool = bool(e["done"])
		row.text = "%s  %s  %.0f/%.0f%s" % [
			"✓" if done else "·",
			e["name"],
			float(e["have"]), float(e["need"]),
			"  — " + String(e.get("reward", "")) if done else ""]
		row.add_theme_color_override("font_color",
			Color(0.55, 0.95, 0.65) if done else Color(0.75, 0.78, 0.85))
		row.tooltip_text = String(e.get("description", ""))
		_achieve_box.add_child(row)
	_detail.text = "[b]Lifetime achievements[/b]\n\nThey never decrease. Completing them pays salvage and marks the campaign."


func _refresh_loop_summary() -> void:
	var lines: Array[String] = []
	lines.append("[b]The loop[/b]  Scan · catch · harvest · sell · upgrade · jump")
	lines.append("[color=#9fc7ff]Ship permits[/color]  survey %d/5 · insight %d/4 · candidates %d · hold %.0f · berths %d" % [
		ship.scan_depth(), ship.reveal_depth(), ship.jump_candidates(),
		ship.carry_capacity(), ship.colony_cap()])
	var target := _next_upgrade_target()
	if target.is_empty():
		lines.append("[color=#7fdc8f]All modules maxed.[/color]")
	else:
		var definition: Dictionary = ShipSystem.modules[target]
		lines.append("[color=#ffd98a]Next:[/color] %s (%.0f salvage) — %s" % [
			definition["display_name"], ship.cost_of(target),
			"affordable" if ship.can_upgrade(target) else "need more salvage"])
	_loop_summary.text = "\n".join(lines)


func _update_sell_mode_label() -> void:
	if _sell_mode_button != null:
		_sell_mode_button.text = "Sell mode: ON" if _sell_mode else "Sell mode: off"


func _next_upgrade_target() -> String:
	var best_target := ""
	var best_score := -INF
	for module_id in ShipSystem.modules:
		if ship.level_of(module_id) >= ship.max_level(module_id):
			continue
		var definition: Dictionary = ShipSystem.modules[module_id]
		var score := 0.0
		var per_level: Dictionary = definition.get("per_level", {})
		if per_level.has("scan_depth"):
			score += 4.0 + float(per_level["scan_depth"])
		if per_level.has("reveal_depth"):
			score += 4.0 + float(per_level["reveal_depth"])
		if per_level.has("carry_capacity"):
			score += 2.5 + float(per_level["carry_capacity"]) / 100.0
		if per_level.has("colony_cap"):
			score += 2.0 + float(per_level["colony_cap"])
		if per_level.has("jump_range"):
			score += 1.5 + float(per_level["jump_range"])
		if definition.get("category", "") == "Navigation":
			score += 0.5
		if ship.level_of(module_id) == 0:
			score += 0.8
		if score > best_score:
			best_score = score
			best_target = String(module_id)
	return best_target


func _show_detail(module_id: String) -> void:
	var definition: Dictionary = ShipSystem.modules[module_id]
	var level := ship.level_of(module_id)
	var lines: Array[String] = []
	lines.append("[b]%s[/b] — level %d of %d" % [
		definition["display_name"], level, ship.max_level(module_id)])
	lines.append("[i]%s[/i]" % definition["description"])
	lines.append("")
	lines.append("Current: %s" % ship.flavor_for(module_id))
	lines.append("Invested: %.0f salvage  ·  next cost: %s" % [
		ship.paid_cost(module_id),
		"MAX" if level >= ship.max_level(module_id) else "%.0f" % ship.cost_of(module_id)])
	lines.append("")
	lines.append("Each level grants:")
	for key in (definition.get("per_level", {}) as Dictionary):
		lines.append("  %-22s +%s" % [key, definition["per_level"][key]])
	lines.append("")
	lines.append("[b]What the ship currently permits[/b]")
	lines.append("  jump candidates %d" % ship.jump_candidates())
	lines.append("  survey depth %d / 5" % ship.scan_depth())
	lines.append("  creature insight %d / 4" % ship.reveal_depth())
	lines.append("  fauna richness %.0f%%" % (ship.fauna_depth() * 100.0))
	lines.append("  hold capacity %.0f" % ship.carry_capacity())
	lines.append("  colony berths %d" % ship.colony_cap())
	lines.append("  trade rate bonus %.0f%%" % (ship.stat("trade_rates") * 100.0))
	lines.append("  left-behind safety %.0f%%" % (ship.abandonment_protection() * 100.0))
	_detail.text = "\n".join(lines)
