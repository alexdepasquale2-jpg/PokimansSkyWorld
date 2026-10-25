extends Control
class_name LandfallCard

## Arrival beat: name, climate, and what is still unknown.
## Cinematic fade + instrument plate — the Odyssey "you have arrived" moment.

const HOLD := 3.8
const SCRIPT_PATH := "res://scenes/ui/landfall_card.gd"
const ACCENT := Color(0.45, 0.82, 1.0)


static func show_for(parent: Node, planet: PlanetSeedResource,
		discovery: DiscoverySystem, first_visit: bool) -> void:
	if parent == null or planet == null:
		return
	var layer := CanvasLayer.new()
	layer.layer = 8
	parent.add_child(layer)

	var script: GDScript = load(SCRIPT_PATH) as GDScript
	var card: Control = script.new() as Control
	card.set_anchors_preset(Control.PRESET_FULL_RECT)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(card)

	# Soft full-screen dim.
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0.02, 0.04, 0.08, 0.35)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(dim)

	var panel := FxPanel.new(ACCENT if first_visit else Color(0.55, 0.7, 0.85), 0.55)
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(680, 0)
	panel.position = Vector2(-340, -160)
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.add_child(panel)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 28)
	panel.add_child(margin)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	margin.add_child(box)

	var eyebrow := Label.new()
	eyebrow.text = "LANDFALL" if first_visit else "RETURNING TO"
	eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow.add_theme_font_size_override("font_size", 14)
	eyebrow.add_theme_color_override("font_color",
		Color(1.0, 0.82, 0.4) if first_visit else Color(0.55, 0.75, 0.9))
	box.add_child(eyebrow)

	var name_label := Label.new()
	name_label.text = planet.display_name.to_upper()
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.add_theme_font_size_override("font_size", 52)
	name_label.add_theme_color_override("font_color", Color(0.95, 0.97, 1.0))
	name_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	name_label.add_theme_constant_override("outline_size", 8)
	box.add_child(name_label)

	var facts := Label.new()
	facts.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	facts.add_theme_color_override("font_color", Color(0.82, 0.88, 0.94))
	facts.add_theme_font_size_override("font_size", 15)
	facts.text = "%s-class star   ·   %.0f°C   ·   %.2f g   ·   habitability %.0f%%" % [
		planet.star_class, planet.mean_temperature_c,
		planet.surface_gravity_g, planet.habitability * 100.0]
	box.add_child(facts)

	var lure := Label.new()
	lure.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lure.add_theme_font_size_override("font_size", 18)
	lure.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4))
	var known := 0
	if discovery != null:
		known = int((discovery.planets.get(planet.planet_id, {}) as Dictionary)
			.get("species_found", 0))
	var expected := maxi(1, planet.fauna_species_count)
	if first_visit:
		lure.text = "%d lifeforms detected · none catalogued" % expected
	elif known >= expected:
		lure.text = "fully catalogued — the world still remembers you"
	else:
		lure.text = "%d of %d lifeforms catalogued" % [known, expected]
	box.add_child(lure)

	var biomes := Label.new()
	biomes.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	biomes.add_theme_color_override("font_color", Color(0.58, 0.72, 0.62))
	biomes.add_theme_font_size_override("font_size", 13)
	var names: Array[String] = []
	for id in planet.biome_weights:
		names.append(String(PlanetGenerator.get_biome(id).get("display_name", id)))
	biomes.text = " · ".join(names)
	box.add_child(biomes)

	if first_visit and not planet.epigenetic_pressures.is_empty():
		var pressure := Label.new()
		pressure.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		pressure.add_theme_font_size_override("font_size", 12)
		pressure.add_theme_color_override("font_color", Color(0.78, 0.62, 0.95))
		var top_key := ""
		var top_v := 0.0
		for key in planet.epigenetic_pressures:
			if float(planet.epigenetic_pressures[key]) > top_v:
				top_v = float(planet.epigenetic_pressures[key])
				top_key = String(key)
		var mark := GenomeDB.get_epi_template(top_key)
		var mark_name := mark.display_name if mark != null else top_key
		pressure.text = "This world will press: %s" % mark_name
		box.add_child(pressure)

	card.modulate.a = 0.0
	panel.position.y += 28
	var tween := card.create_tween()
	tween.set_parallel(true)
	tween.tween_property(card, "modulate:a", 1.0, 0.55)
	tween.tween_property(panel, "position:y", panel.position.y - 28, 1.0) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.chain().tween_interval(HOLD)
	tween.chain().tween_property(card, "modulate:a", 0.0, 0.9)
	tween.chain().tween_callback(layer.queue_free)

	if panel.has_method("flash"):
		panel.call_deferred("flash", 1.2)
