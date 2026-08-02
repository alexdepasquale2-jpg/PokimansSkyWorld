extends Control
class_name StarMap

## Choosing where to go. The point is that the choice is INFORMED but not
## complete: you always know a candidate world's star and rough habitability
## from orbit, but its biomes, hazards and fauna only become known by landing.
## Scanning trades time for certainty.

signal destination_chosen(planet_id: String)
signal cancelled()

## Set by ShipView from the ship's survey array — a better scanner finds more
## places worth going.
var max_candidates: int = 3

## Set by ShipView from the ship's scan depth: 0 orbit-only .. 5 everything.
## This is the main way upgrading the ship literally reveals more of the game.
var scan_depth: int = 0

var _list: ItemList
var _detail: RichTextLabel
var _candidates: Array[PlanetSeedResource] = []


func open(known_visited: Array) -> void:
	visible = true
	_build_candidates(known_visited)
	_refresh()


func _ready() -> void:
	_build_ui()


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(panel)

	var root := VBoxContainer.new()
	panel.add_child(root)

	var title := Label.new()
	title.text = "Jump Destinations"
	title.add_theme_font_size_override("font_size", 24)
	root.add_child(title)

	var hint := Label.new()
	hint.text = "Everything not carried is left behind on the current world."
	root.add_child(hint)

	var split := HSplitContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(split)

	_list = ItemList.new()
	_list.custom_minimum_size.x = 320
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

	var buttons := HBoxContainer.new()
	root.add_child(buttons)
	var go := FxButton.new(Color(0.4, 0.85, 0.55))
	go.text = "Jump"
	go.custom_minimum_size = Vector2(120, 34)
	go.pressed.connect(_confirm)
	buttons.add_child(go)
	var cancel := FxButton.new(Color(0.6, 0.6, 0.68))
	cancel.text = "Cancel"
	cancel.custom_minimum_size = Vector2(120, 34)
	cancel.pressed.connect(func():
		visible = false
		cancelled.emit())
	buttons.add_child(cancel)


## Offers a mix of fresh, unvisited worlds and anywhere the player has already
## been — going back is always an option, and often the interesting one.
func _build_candidates(known_visited: Array) -> void:
	_candidates.clear()
	for planet_id in known_visited:
		var known := PlanetManager.get_planet(planet_id)
		if known != null:
			_candidates.append(known)
	while _candidates.size() < max_candidates + known_visited.size():
		var fresh := PlanetManager.create_planet()
		PlanetGenerator.derive(fresh)
		_candidates.append(fresh)


func _refresh() -> void:
	_list.clear()
	for planet in _candidates:
		var summary := PlanetManager.get_summary(planet.planet_id)
		var seen: bool = summary != null and summary.visited
		_list.add_item("%s  %s  %s" % [
			planet.display_name.rpad(12),
			("hab %.0f%%" % (planet.habitability * 100.0)).rpad(10),
			"visited" if seen else "unexplored"])
	if not _candidates.is_empty():
		_list.select(0)
		_on_selected(0)


func _on_selected(index: int) -> void:
	if index < 0 or index >= _candidates.size():
		return
	var planet := _candidates[index]
	var summary := PlanetManager.get_summary(planet.planet_id)
	var visited: bool = summary != null and summary.visited

	var lines: Array[String] = []
	lines.append("=== %s ===" % planet.display_name)
	lines.append("  star            %s   luminosity %.2f" % [planet.star_class, planet.star_luminosity])
	lines.append("  gravity         %.2f g" % planet.surface_gravity_g)
	lines.append("  mean temp       %.0f C" % planet.mean_temperature_c)
	lines.append("  atmosphere      %.2f bar" % planet.atmosphere_density)
	lines.append("  habitability    %.0f%%" % (planet.habitability * 100.0))
	lines.append("")

	if visited:
		lines.append("-- SURVEYED --")
		lines.append("  biomes          %s" % ", ".join(summary.discovered_biomes))
		lines.append("  hazards known   %s" % (", ".join(summary.known_hazards)
			if not summary.known_hazards.is_empty() else "none recorded"))
		lines.append("  residents       %d left behind" % summary.resident_count())
		lines.append("  structures      %d" % summary.structures.size())
		if not summary.notable_events.is_empty():
			lines.append("")
			lines.append("-- WHAT HAPPENED HERE --")
			for event in summary.notable_events.slice(maxi(0, summary.notable_events.size() - 8)):
				lines.append("  %s" % event["text"])
	else:
		# What an unexplored world will tell you is gated on the Survey Array.
		# Upgrading the ship literally reveals more of the game.
		lines.append("-- UNEXPLORED --  (survey array level %d)" % scan_depth)
		if scan_depth < 1:
			lines.append("  Mass and orbit only. Everything else is a gamble.")
		if scan_depth >= 1:
			lines.append("  atmosphere      %.2f bar, %.0f%% oxygen" % [
				planet.atmosphere_density,
				float(planet.atmosphere_composition.get("o2", 0.0)) * 100.0])
		if scan_depth >= 2:
			var biomes: Array = planet.biome_weights.keys().map(func(id):
				return String(PlanetGenerator.get_biome(id).get("display_name", id)))
			lines.append("  biomes          %s" % ", ".join(biomes))
		else:
			lines.append("  biomes          [upgrade Survey Array to resolve]")
		if scan_depth >= 3:
			lines.append("  hazards         %s" % (", ".join(planet.hazard_profile.keys())
				if not planet.hazard_profile.is_empty() else "none detected"))
		else:
			lines.append("  hazards         [upgrade Survey Array to resolve]")
		if scan_depth >= 4:
			lines.append("  native life     ~%d species, divergence %.0f%%" % [
				planet.fauna_species_count, planet.fauna_divergence * 100.0])
		else:
			lines.append("  native life     [upgrade Survey Array to resolve]")
		if scan_depth >= 5:
			lines.append("  ruins/anomalies %.0f%% / %.0f%%" % [
				planet.ruin_density * 100.0, planet.anomaly_density * 100.0])

		lines.append("")
		lines.append("  expected pressure on your lineages:")
		if planet.epigenetic_pressures.is_empty():
			lines.append("    (none detectable)")
		for key in planet.epigenetic_pressures:
			var mark := GenomeDB.get_epi_template(key)
			lines.append("    %-24s %.0f%%" % [
				mark.display_name if mark != null else key,
				float(planet.epigenetic_pressures[key]) * 100.0])

	_detail.text = "[code]%s[/code]" % "\n".join(lines)


func _confirm() -> void:
	var index := _list.get_selected_items()
	if index.is_empty():
		return
	visible = false
	destination_chosen.emit(_candidates[index[0]].planet_id)
