extends Control
class_name LandfallCard

## The arrival beat. Fades in over the world, states where you are and what is
## unknown about it, then gets out of the way.
##
## Its whole job is to make the first ten seconds on a world feel like arriving
## somewhere rather than being teleported into a spreadsheet. It leads with the
## NAME and what is undiscovered, because those are the two things that make a
## player want to walk in a direction.

const HOLD := 3.4


static func show_for(parent: Node, planet: PlanetSeedResource,
		discovery: DiscoverySystem, first_visit: bool) -> void:
	var layer := CanvasLayer.new()
	layer.layer = 8
	parent.add_child(layer)

	var card := LandfallCard.new()
	card.set_anchors_preset(Control.PRESET_FULL_RECT)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(card)

	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.position = Vector2(-320, -140)
	box.custom_minimum_size = Vector2(640, 0)
	card.add_child(box)

	var eyebrow := Label.new()
	eyebrow.text = "LANDFALL" if first_visit else "RETURNING TO"
	eyebrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	eyebrow.add_theme_font_size_override("font_size", 14)
	eyebrow.add_theme_color_override("font_color", Color(0.55, 0.75, 0.9))
	box.add_child(eyebrow)

	var name_label := Label.new()
	name_label.text = planet.display_name.to_upper()
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.add_theme_font_size_override("font_size", 54)
	name_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	name_label.add_theme_constant_override("outline_size", 8)
	box.add_child(name_label)

	var facts := Label.new()
	facts.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	facts.add_theme_color_override("font_color", Color(0.85, 0.88, 0.9))
	facts.text = "%s-class star   ·   %.0f°C   ·   %.2f g   ·   habitability %.0f%%" % [
		planet.star_class, planet.mean_temperature_c,
		planet.surface_gravity_g, planet.habitability * 100.0]
	box.add_child(facts)

	# The hook: what is still unknown here.
	var lure := Label.new()
	lure.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lure.add_theme_font_size_override("font_size", 18)
	lure.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4))
	var known := int((discovery.planets.get(planet.planet_id, {}) as Dictionary)
		.get("species_found", 0))
	var expected := maxi(1, planet.fauna_species_count)
	if first_visit:
		lure.text = "%d lifeforms detected · none catalogued" % expected
	elif known >= expected:
		lure.text = "fully catalogued"
	else:
		lure.text = "%d of %d lifeforms catalogued" % [known, expected]
	box.add_child(lure)

	var biomes := Label.new()
	biomes.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	biomes.add_theme_color_override("font_color", Color(0.6, 0.7, 0.62))
	var names: Array[String] = []
	for id in planet.biome_weights:
		names.append(String(PlanetGenerator.get_biome(id).get("display_name", id)))
	biomes.text = ", ".join(names)
	box.add_child(biomes)

	# Fade in fast, hold, drift out. Never blocks input.
	card.modulate.a = 0.0
	box.position.y += 24
	var tween := card.create_tween()
	tween.set_parallel(true)
	tween.tween_property(card, "modulate:a", 1.0, 0.5)
	tween.tween_property(box, "position:y", box.position.y - 24, 0.9) \
		.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.chain().tween_interval(HOLD)
	tween.chain().tween_property(card, "modulate:a", 0.0, 0.8)
	tween.chain().tween_callback(layer.queue_free)
