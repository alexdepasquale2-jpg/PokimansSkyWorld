extends Control
class_name ShipView

## Orbit. The between-worlds screen where planetside effort becomes permanent
## capability — and where the next jump is chosen.
##
## Deliberately the only route between planets: every departure passes through
## here, so the loop is always "go down, come back richer, see what opened up".

signal jump_requested(planet_id: String)
signal returned_to_surface()

var session: GameSession
var ship: ShipSystem

var _salvage_label: Label
var _module_list: VBoxContainer
var _detail: RichTextLabel
var _tabs: TabContainer
var _achievements: RichTextLabel
var _dex: RichTextLabel
var _star_map: StarMap
var _frame: FxPanel


func open(game_session: GameSession) -> void:
	session = game_session
	ship = game_session.ship
	visible = true
	var before := 0
	for entry in ship.achievement_progress():
		if entry["done"]:
			before += 1
	_refresh()
	var after := 0
	for entry in ship.achievement_progress():
		if entry["done"]:
			after += 1
	if after > before:
		_frame.set_rim_color(Color(1.0, 0.85, 0.35))
		_frame.flash(1.4)
	else:
		_frame.set_rim_color(Color(0.4, 0.7, 1.0))


func _ready() -> void:
	_build_ui()
	visible = false


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var backdrop := ColorRect.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	var star_material := ShaderMaterial.new()
	star_material.shader = preload("res://shaders/ui_starfield.gdshader")
	star_material.set_shader_parameter("tint", Vector3(0.03, 0.04, 0.08))
	star_material.set_shader_parameter("speed", 0.03)
	backdrop.material = star_material
	add_child(backdrop)

	var panel := FxPanel.new(Color(0.4, 0.7, 1.0))
	_frame = panel
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(panel)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 6)
	panel.add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	var title := Label.new()
	title.text = "THE SHIP"
	title.add_theme_font_size_override("font_size", 28)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	_salvage_label = Label.new()
	_salvage_label.add_theme_font_size_override("font_size", 20)
	_salvage_label.add_theme_color_override("font_color", Color(0.7, 0.9, 1.0))
	header.add_child(_salvage_label)

	var subtitle := Label.new()
	subtitle.text = "Last vessel out of %s." % ShipSystem.HOME_PLANET
	subtitle.add_theme_color_override("font_color", Color(0.65, 0.65, 0.72))
	root.add_child(subtitle)

	_tabs = TabContainer.new()
	_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(_tabs)

	# --- Upgrades tab ---
	var upgrades := HSplitContainer.new()
	upgrades.name = "Upgrades"
	_tabs.add_child(upgrades)
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size.x = 420
	upgrades.add_child(scroll)
	_module_list = VBoxContainer.new()
	_module_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_module_list)
	var detail_scroll := ScrollContainer.new()
	upgrades.add_child(detail_scroll)
	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.add_child(_detail)

	# --- Achievements tab ---
	var ach_scroll := ScrollContainer.new()
	ach_scroll.name = "Record"
	_tabs.add_child(ach_scroll)
	_achievements = RichTextLabel.new()
	_achievements.bbcode_enabled = true
	_achievements.fit_content = true
	_achievements.scroll_active = false
	_achievements.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ach_scroll.add_child(_achievements)

	# --- Aetherdex tab ---
	var dex_scroll := ScrollContainer.new()
	dex_scroll.name = "Aetherdex"
	_tabs.add_child(dex_scroll)
	_dex = RichTextLabel.new()
	_dex.bbcode_enabled = true
	_dex.fit_content = true
	_dex.scroll_active = false
	_dex.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dex_scroll.add_child(_dex)

	# --- Navigation tab ---
	var nav := VBoxContainer.new()
	nav.name = "Navigation"
	_tabs.add_child(nav)
	_star_map = StarMap.new()
	_star_map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_star_map.destination_chosen.connect(func(planet_id):
		visible = false
		jump_requested.emit(planet_id))
	nav.add_child(_star_map)

	var footer := HBoxContainer.new()
	root.add_child(footer)
	var back := FxButton.new(Color(0.9, 0.65, 0.35))
	back.text = "Return to the surface"
	back.custom_minimum_size = Vector2(220, 36)
	back.pressed.connect(func():
		visible = false
		returned_to_surface.emit())
	footer.add_child(back)


func _refresh() -> void:
	_salvage_label.text = "%.0f salvage" % ship.salvage
	_refresh_modules()
	_refresh_achievements()
	_refresh_dex()
	_star_map.max_candidates = ship.jump_candidates()
	_star_map.scan_depth = ship.scan_depth()
	_star_map.open(PlanetManager.summaries.keys())


func _refresh_modules() -> void:
	for child in _module_list.get_children():
		child.queue_free()

	var by_category := {}
	for module_id in ShipSystem.modules:
		var category := String(ShipSystem.modules[module_id].get("category", "Other"))
		if not by_category.has(category):
			by_category[category] = []
		by_category[category].append(module_id)

	for category in by_category:
		var header := Label.new()
		header.text = category.to_upper()
		header.add_theme_color_override("font_color", Color(0.6, 0.75, 0.85))
		_module_list.add_child(header)

		for module_id in by_category[category]:
			var definition: Dictionary = ShipSystem.modules[module_id]
			var level := ship.level_of(module_id)
			var maxed := level >= ship.max_level(module_id)
			var cost := ship.cost_of(module_id)

			var row := HBoxContainer.new()
			_module_list.add_child(row)

			var accent := Color(0.4, 0.85, 0.55) if not maxed and ship.can_upgrade(module_id) \
				else Color(0.45, 0.48, 0.55)
			var button := FxButton.new(accent)
			button.text = "%s  [%d/%d]%s" % [definition["display_name"], level,
				ship.max_level(module_id),
				"" if maxed else "   %.0f" % cost]
			button.custom_minimum_size = Vector2(330, 34)
			button.disabled = maxed or not ship.can_upgrade(module_id)
			button.pressed.connect(func():
				if ship.upgrade(module_id):
					ship.apply_biology_bonuses()
					session.stock.carry_capacity = ship.carry_capacity()
					_frame.flash(0.8)
					_refresh()
					_show_detail(module_id))
			row.add_child(button)

			var info := FxButton.new(Color(0.5, 0.6, 0.8))
			info.text = "?"
			info.custom_minimum_size = Vector2(28, 34)
			info.pressed.connect(func(): _show_detail(module_id))
			row.add_child(info)


func _show_detail(module_id: String) -> void:
	var definition: Dictionary = ShipSystem.modules[module_id]
	var level := ship.level_of(module_id)
	var lines: Array[String] = []
	lines.append("[b]%s[/b]  —  level %d of %d" % [definition["display_name"],
		level, ship.max_level(module_id)])
	lines.append("[i]%s[/i]" % definition["description"])
	lines.append("")
	lines.append("Current state: %s" % ship.flavor_for(module_id))
	lines.append("")
	lines.append("Each level grants:")
	for key in (definition.get("per_level", {}) as Dictionary):
		lines.append("  %-22s +%s" % [key, definition["per_level"][key]])
	lines.append("")
	lines.append("[b]What the ship currently permits[/b]")
	lines.append("  jump candidates      %d" % ship.jump_candidates())
	lines.append("  survey depth         %d / 5" % ship.scan_depth())
	lines.append("  creature insight     %d / 4" % ship.reveal_depth())
	lines.append("  fauna richness       %.0f%%" % (ship.fauna_depth() * 100.0))
	lines.append("  hold capacity        %.0f" % ship.carry_capacity())
	lines.append("  colony berths        %d" % ship.colony_cap())
	lines.append("  left-behind safety   %.0f%%" % (ship.abandonment_protection() * 100.0))
	_detail.text = "\n".join(lines)


func _refresh_dex() -> void:
	var discovery: DiscoverySystem = session.discovery
	var totals := discovery.totals()
	var lines: Array[String] = []
	lines.append("[b]%d species  ·  %d tamed  ·  %d resources  ·  %d worlds[/b]\n" % [
		totals["species"], totals["tamed"], totals["resources"], totals["planets"]])

	if discovery.species.is_empty():
		lines.append("[i]Nothing catalogued yet. Press Q on the surface to sweep.[/i]")
	for key in discovery.species:
		var entry: Dictionary = discovery.species[key]
		var traits: Dictionary = entry.get("traits", {})
		lines.append("[color=#ffd98a]%s[/color]%s" % [entry["name"],
			"   [color=#7fdc8f]TAMED[/color]" if entry.get("tamed", false) else ""])
		lines.append("[color=#9a9aa5]  first seen on %s  ·  %d sighting(s)[/color]"
			% [entry["discovered_on"], entry["sightings"]])
		var stat_bits: Array[String] = []
		for stat_key in ["size", "mass", "attack_power", "armor", "speed"]:
			if traits.has(stat_key):
				stat_bits.append("%s %.2f" % [stat_key, traits[stat_key]])
		lines.append("  " + "  ·  ".join(stat_bits))
		# Deeper sensor readings only appear once the ship can take them.
		if traits.has("hidden_carriers"):
			lines.append("  [color=#9fc7ff]carries %d hidden recessive(s)[/color]"
				% int(traits["hidden_carriers"]))
		if traits.has("becoming") and not String(traits["becoming"]).is_empty():
			lines.append("  [color=#c9a7ff]becoming: %s[/color]" % traits["becoming"])
		lines.append("")

	if not discovery.resources.is_empty():
		lines.append("\n[b]MATERIALS[/b]")
		for res_id in discovery.resources:
			lines.append("  %-16s first found on %s" % [res_id,
				discovery.resources[res_id]["first_planet"]])

	if not discovery.planets.is_empty():
		lines.append("\n[b]WORLDS[/b]")
		for planet_id in discovery.planets:
			var p: Dictionary = discovery.planets[planet_id]
			lines.append("  %-16s %d species%s" % [p["name"], p["species_found"],
				"   [fully surveyed]" if p.get("fully_surveyed", false) else ""])

	_dex.text = "\n".join(lines)


func _refresh_achievements() -> void:
	var lines: Array[String] = []
	var done := 0
	var entries := ship.achievement_progress()
	for entry in entries:
		if entry["done"]:
			done += 1
	lines.append("[b]%d of %d[/b]\n" % [done, entries.size()])
	for entry in entries:
		if entry["done"]:
			lines.append("[color=#7fdc8f]✓ %-22s[/color] %s" % [
				entry["name"], entry["description"]])
		else:
			lines.append("[color=#8a8a95]  %-22s %s  (%.0f / %.0f)  %s[/color]" % [
				entry["name"], entry["description"],
				entry["have"], entry["need"], entry["reward"]])
	_achievements.text = "\n".join(lines)
