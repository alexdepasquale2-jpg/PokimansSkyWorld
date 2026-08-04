extends Control
class_name StarMap

## Visual jump map: clickable star systems, survey-gated intel, commit jump.
## Orbit data is free; biomes/fauna/hazards unlock with Survey Array depth.

signal destination_chosen(planet_id: String)
signal cancelled()

const ACCENT := Color(0.42, 0.78, 1.0)
const WARM := Color(1.0, 0.78, 0.4)
const MAP_SIZE := Vector2(720, 420)

var max_candidates: int = 3
var scan_depth: int = 0
var active_planet_id: String = ""

var _list: ItemList
var _detail: RichTextLabel
var _map_canvas: Control
var _map_draw: Node2D
var _salvage_hint: Label
var _title: Label
var _jump_btn: Button
var _candidates: Array[PlanetSeedResource] = []
var _positions: Array[Vector2] = []
var _selected: int = 0
var _star_buttons: Array = []


func open(known_visited: Array) -> void:
	visible = true
	active_planet_id = PlanetManager.active_planet_id
	_build_candidates(known_visited)
	_layout_stars()
	_refresh()
	modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 0.22)


func _ready() -> void:
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
		sm.set_shader_parameter("speed", 0.028)
		sm.set_shader_parameter("nebula_strength", 0.7)
		sm.set_shader_parameter("tint", Vector3(0.015, 0.02, 0.05))
		dim.material = sm
		dim.color = Color(1, 1, 1, 1)
	else:
		dim.color = Color(0.02, 0.03, 0.06, 0.9)
	add_child(dim)

	var panel := FxPanel.new(ACCENT, 0.9)
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 48
	panel.offset_top = 36
	panel.offset_right = -48
	panel.offset_bottom = -36
	add_child(panel)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	panel.add_child(margin)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	margin.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 16)
	root.add_child(header)

	var head_text := VBoxContainer.new()
	head_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(head_text)

	_title = Label.new()
	_title.text = "STAR MAP  ·  JUMP NAVIGATION"
	_title.add_theme_font_size_override("font_size", 24)
	_title.add_theme_color_override("font_color", Color(0.92, 0.95, 1.0))
	_title.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	_title.add_theme_constant_override("outline_size", 3)
	head_text.add_child(_title)

	var hint := Label.new()
	hint.text = "Click a star to inspect. Party travels with you — everything else stays behind."
	hint.add_theme_color_override("font_color", Color(0.68, 0.74, 0.85))
	hint.add_theme_font_size_override("font_size", 12)
	head_text.add_child(hint)

	_salvage_hint = Label.new()
	_salvage_hint.add_theme_color_override("font_color", WARM)
	_salvage_hint.add_theme_font_size_override("font_size", 13)
	header.add_child(_salvage_hint)

	# Map + side list
	var body := HBoxContainer.new()
	body.add_theme_constant_override("separation", 12)
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(body)

	var map_panel := FxPanel.new(Color(0.3, 0.55, 0.9), 0.55)
	map_panel.custom_minimum_size = MAP_SIZE
	map_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(map_panel)

	_map_canvas = Control.new()
	_map_canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	_map_canvas.mouse_filter = Control.MOUSE_FILTER_PASS
	map_panel.add_child(_map_canvas)

	_map_draw = Node2D.new()
	_map_draw.draw.connect(_draw_map_links)
	_map_canvas.add_child(_map_draw)

	var side := VBoxContainer.new()
	side.custom_minimum_size.x = 340
	side.add_theme_constant_override("separation", 8)
	body.add_child(side)

	var list_label := Label.new()
	list_label.text = "DESTINATIONS"
	list_label.add_theme_font_size_override("font_size", 12)
	list_label.add_theme_color_override("font_color", Color(0.55, 0.75, 0.95))
	side.add_child(list_label)

	_list = ItemList.new()
	_list.custom_minimum_size = Vector2(0, 140)
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_list.add_theme_color_override("font_color", Color(0.85, 0.88, 0.95))
	_list.add_theme_color_override("font_selected_color", Color(0.4, 0.95, 1.0))
	_list.item_selected.connect(_on_selected)
	side.add_child(_list)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.custom_minimum_size.y = 160
	side.add_child(scroll)
	_detail = RichTextLabel.new()
	_detail.bbcode_enabled = true
	_detail.fit_content = true
	_detail.scroll_active = false
	_detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_detail.custom_minimum_size = Vector2(300, 140)
	_detail.add_theme_color_override("default_color", Color(0.82, 0.86, 0.92))
	scroll.add_child(_detail)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 12)
	buttons.alignment = BoxContainer.ALIGNMENT_END
	root.add_child(buttons)

	_jump_btn = FxButton.new(WARM)
	_jump_btn.text = "Jump"
	_jump_btn.custom_minimum_size = Vector2(160, 42)
	_jump_btn.pressed.connect(_confirm)
	buttons.add_child(_jump_btn)

	var cancel := FxButton.new(Color(0.75, 0.45, 0.45))
	cancel.text = "Cancel  (Esc / J)"
	cancel.custom_minimum_size = Vector2(180, 42)
	cancel.pressed.connect(func():
		visible = false
		cancelled.emit())
	buttons.add_child(cancel)


func _build_candidates(known_visited: Array) -> void:
	_candidates.clear()
	# Always include current world first if known.
	if not active_planet_id.is_empty():
		var here := PlanetManager.get_planet(active_planet_id)
		if here != null:
			_candidates.append(here)
	for planet_id in known_visited:
		var pid := String(planet_id)
		if pid == active_planet_id:
			continue
		var known := PlanetManager.get_planet(pid)
		if known != null:
			_candidates.append(known)
	var need := max_candidates + maxi(0, known_visited.size())
	# Fresh unexplored targets.
	var safety := 0
	while _candidates.size() < need and safety < 40:
		safety += 1
		var fresh := PlanetManager.create_planet()
		PlanetGenerator.derive(fresh)
		_candidates.append(fresh)


func _layout_stars() -> void:
	_positions.clear()
	for child in _star_buttons:
		if is_instance_valid(child):
			child.queue_free()
	_star_buttons.clear()

	var rng := RandomNumberGenerator.new()
	rng.seed = int(PlanetManager.universe_seed) ^ hash("starmap_layout")
	var placed: Array[Vector2] = []
	for i in _candidates.size():
		var pos := Vector2.ZERO
		for _attempt in 24:
			pos = Vector2(rng.randf_range(48, MAP_SIZE.x - 48),
				rng.randf_range(40, MAP_SIZE.y - 40))
			var ok := true
			for p in placed:
				if p.distance_to(pos) < 54.0:
					ok = false
					break
			if ok:
				break
		placed.append(pos)
		_positions.append(pos)

		var planet := _candidates[i]
		var btn := Button.new()
		btn.flat = true
		btn.focus_mode = Control.FOCUS_NONE
		btn.custom_minimum_size = Vector2(28, 28)
		btn.position = pos - Vector2(14, 14)
		btn.tooltip_text = planet.display_name
		btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var tint := _climate_color(planet)
		var is_here := planet.planet_id == active_planet_id
		var style := StyleBoxFlat.new()
		style.bg_color = Color(tint.r, tint.g, tint.b, 0.95)
		style.set_corner_radius_all(14 if is_here else 10)
		style.border_color = Color(1, 1, 1, 0.85 if is_here else 0.35)
		style.set_border_width_all(2 if is_here else 1)
		btn.add_theme_stylebox_override("normal", style)
		var style_h := style.duplicate() as StyleBoxFlat
		style_h.bg_color = tint.lightened(0.25)
		btn.add_theme_stylebox_override("hover", style_h)
		btn.add_theme_stylebox_override("pressed", style_h)
		btn.pressed.connect(_on_selected.bind(i))
		_map_canvas.add_child(btn)
		_star_buttons.append(btn)

		var tag := Label.new()
		tag.text = planet.display_name
		tag.add_theme_font_size_override("font_size", 10)
		tag.add_theme_color_override("font_color", Color(0.85, 0.9, 1.0, 0.9))
		tag.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
		tag.add_theme_constant_override("outline_size", 2)
		tag.position = pos + Vector2(-20, 16)
		tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_map_canvas.add_child(tag)
		_star_buttons.append(tag)

	if _map_draw != null:
		_map_draw.queue_redraw()


func _draw_map_links() -> void:
	if _positions.size() < 2:
		return
	# Soft links from current world to candidates.
	var origin_i := 0
	for i in _candidates.size():
		if _candidates[i].planet_id == active_planet_id:
			origin_i = i
			break
	var origin := _positions[origin_i] if origin_i < _positions.size() else _positions[0]
	for i in _positions.size():
		if i == origin_i:
			continue
		var col := Color(0.35, 0.65, 1.0, 0.22)
		if i == _selected:
			col = Color(1.0, 0.85, 0.4, 0.55)
		_map_draw.draw_line(origin, _positions[i], col, 1.5 if i == _selected else 1.0, true)
	# Selection ring
	if _selected >= 0 and _selected < _positions.size():
		_map_draw.draw_arc(_positions[_selected], 18.0, 0.0, TAU, 24,
			Color(1.0, 0.9, 0.4, 0.7), 2.0, true)


func _refresh() -> void:
	_list.clear()
	for i in _candidates.size():
		var planet := _candidates[i]
		var summary := PlanetManager.get_summary(planet.planet_id)
		var seen: bool = summary != null and summary.visited
		var here := planet.planet_id == active_planet_id
		var tag := "HERE" if here else ("visited" if seen else "unexplored")
		_list.add_item("%s   hab %.0f%%   %s" % [
			planet.display_name.rpad(14),
			planet.habitability * 100.0,
			tag])
		var idx := _list.item_count - 1
		if here:
			_list.set_item_custom_fg_color(idx, Color(0.55, 0.95, 1.0))
		elif planet.habitability > 0.55:
			_list.set_item_custom_fg_color(idx, Color(0.55, 0.95, 0.65))
		elif planet.habitability > 0.3:
			_list.set_item_custom_fg_color(idx, Color(0.95, 0.88, 0.45))
		else:
			_list.set_item_custom_fg_color(idx, Color(0.95, 0.55, 0.5))

	_salvage_hint.text = "Survey depth %d/5  ·  %d candidates" % [scan_depth, _candidates.size()]
	if not _candidates.is_empty():
		var pick := clampi(_selected, 0, _candidates.size() - 1)
		_list.select(pick)
		_on_selected(pick)


func _on_selected(index: int) -> void:
	if index < 0 or index >= _candidates.size():
		return
	_selected = index
	if _map_draw != null:
		_map_draw.queue_redraw()

	var planet := _candidates[index]
	var summary := PlanetManager.get_summary(planet.planet_id)
	var visited: bool = summary != null and summary.visited
	var here := planet.planet_id == active_planet_id

	if _jump_btn != null:
		_jump_btn.disabled = here
		_jump_btn.text = "Already here" if here else "Jump to %s" % planet.display_name

	var lines: Array[String] = []
	lines.append("[b][color=#9fd4ff]%s[/color][/b]%s" % [
		planet.display_name, "  [color=#66ccff](current)[/color]" if here else ""])
	lines.append("[color=#8899aa]%s-class · L=%.2f · orbit %.2f AU · moons %d[/color]" % [
		planet.star_class, planet.star_luminosity, planet.orbital_radius_au, planet.moon_count])
	lines.append("")
	lines.append("  gravity         [b]%.2f g[/b]" % planet.surface_gravity_g)
	lines.append("  mean temp       [b]%.0f °C[/b]  (±%.0f)" % [
		planet.mean_temperature_c, planet.temperature_variance])
	lines.append("  atmosphere      [b]%.2f bar[/b]  ·  hydro [b]%.0f%%[/b]" % [
		planet.atmosphere_density, planet.hydrosphere_fraction * 100.0])
	lines.append("  habitability    [b]%.0f%%[/b]" % (planet.habitability * 100.0))
	lines.append("")

	if visited and summary != null:
		lines.append("[color=#ffd070]— SURVEYED —[/color]")
		lines.append("  biomes          %s" % ", ".join(summary.discovered_biomes))
		lines.append("  residents       %d left behind" % summary.resident_count())
	else:
		lines.append("[color=#7ab0d0]— UNEXPLORED —[/color]  survey array %d" % scan_depth)
		if scan_depth < 1:
			lines.append("  [i]Mass and orbit only. Jump is a gamble.[/i]")
		if scan_depth >= 2:
			var biomes: Array = planet.biome_weights.keys().map(func(id):
				return String(PlanetGenerator.get_biome(id).get("display_name", id)))
			lines.append("  biomes          %s" % ", ".join(biomes))
		else:
			lines.append("  biomes          [color=#666][upgrade Survey Array][/color]")
		if scan_depth >= 3:
			var hazards: Array = planet.hazard_profile.keys()
			lines.append("  hazards         %s" % (", ".join(hazards) if not hazards.is_empty() else "none detected"))
		if scan_depth >= 4:
			lines.append("  native life     ~%d spp · divergence %.0f%%" % [
				planet.fauna_species_count, planet.fauna_divergence * 100.0])
		else:
			lines.append("  native life     [color=#666][upgrade Survey Array][/color]")

	lines.append("")
	lines.append("[color=#c8a0ff]Lineage pressure on arrival:[/color]")
	if planet.epigenetic_pressures.is_empty():
		lines.append("    (none detectable)")
	for key in planet.epigenetic_pressures:
		var mark := GenomeDB.get_epi_template(key)
		lines.append("    %-22s %.0f%%" % [
			mark.display_name if mark != null else key,
			float(planet.epigenetic_pressures[key]) * 100.0])

	_detail.text = "\n".join(lines)


func _climate_color(planet: PlanetSeedResource) -> Color:
	var t := planet.mean_temperature_c
	var h := planet.hydrosphere_fraction
	if t < -10.0:
		return Color(0.55, 0.75, 0.95)
	if t > 35.0:
		return Color(0.95, 0.55, 0.28)
	if h > 0.6:
		return Color(0.25, 0.55, 0.75)
	if planet.habitability > 0.5:
		return Color(0.35, 0.72, 0.42)
	return Color(0.55, 0.48, 0.38)


func _confirm() -> void:
	if _selected < 0 or _selected >= _candidates.size():
		return
	var planet := _candidates[_selected]
	if planet.planet_id == active_planet_id:
		return
	visible = false
	destination_chosen.emit(planet.planet_id)
