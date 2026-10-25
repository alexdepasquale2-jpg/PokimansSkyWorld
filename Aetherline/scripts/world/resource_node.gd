extends Node2D
class_name ResourceNode

## Harvestable deposit. Art is resource-specific so forage, ore, timber and
## ice read at a glance — the Odyssey survival loop of "I see what I need".

const COLORS := {
	"timber": Color(0.38, 0.55, 0.28), "forage": Color(0.55, 0.78, 0.35),
	"ore_ferrite": Color(0.58, 0.42, 0.36), "silica": Color(0.78, 0.80, 0.88),
	"reed": Color(0.42, 0.62, 0.48), "grain": Color(0.82, 0.74, 0.35),
	"sulfur": Color(0.88, 0.78, 0.22), "ice": Color(0.72, 0.88, 0.96),
}

var resource_id: String = "timber"
var remaining: float = 40.0
var node_key: String = ""
var _pulse_phase: float = 0.0


func setup(res_id: String, amount: float, key: String) -> void:
	resource_id = res_id
	remaining = amount
	node_key = key
	_pulse_phase = float(hash(key) % 100) * 0.1
	set_process(true)
	queue_redraw()


func _process(delta: float) -> void:
	if remaining <= 0.0:
		return
	_pulse_phase += delta
	# Sparse redraw for soft life — not every frame for every node.
	if Engine.get_process_frames() % 4 == int(hash(node_key) % 4):
		queue_redraw()


func _draw() -> void:
	if remaining <= 0.0:
		return
	var color: Color = COLORS.get(resource_id, Color(0.7, 0.7, 0.7))
	var radius := 5.0 + clampf(remaining / 8.0, 0.0, 7.0)
	var breath := 1.0 + sin(_pulse_phase * 2.0 + float(hash(node_key) % 7)) * 0.04
	radius *= breath

	draw_circle(Vector2(0.6, 1.2), radius * 0.95, Color(0, 0, 0, 0.22))

	match resource_id:
		"timber":
			_draw_timber(color, radius)
		"forage", "grain":
			_draw_bush(color, radius)
		"ore_ferrite", "silica", "sulfur":
			_draw_ore(color, radius)
		"ice":
			_draw_ice(color, radius)
		"reed":
			_draw_reed(color, radius)
		_:
			draw_circle(Vector2.ZERO, radius, color)
			draw_arc(Vector2.ZERO, radius, 0.0, TAU, 14, color.darkened(0.5), 1.5, true)


func _draw_timber(color: Color, radius: float) -> void:
	var trunk := color.darkened(0.25)
	draw_rect(Rect2(-2.0, -radius * 0.2, 4.0, radius * 1.1), trunk, true)
	draw_circle(Vector2(0, -radius * 0.45), radius * 0.7, color)
	draw_circle(Vector2(-radius * 0.35, -radius * 0.2), radius * 0.45, color.darkened(0.1))
	draw_circle(Vector2(radius * 0.3, -radius * 0.25), radius * 0.4, color.lightened(0.08))


func _draw_bush(color: Color, radius: float) -> void:
	draw_circle(Vector2.ZERO, radius, color)
	draw_circle(Vector2(-radius * 0.35, -radius * 0.15), radius * 0.55, color.lightened(0.1))
	draw_circle(Vector2(radius * 0.3, -radius * 0.1), radius * 0.5, color.darkened(0.08))
	# Berry / seed dots.
	var berry := Color(0.85, 0.35, 0.3) if resource_id == "forage" else Color(0.9, 0.8, 0.3)
	draw_circle(Vector2(-1.5, -1.0), 1.2, berry)
	draw_circle(Vector2(2.0, 0.5), 1.0, berry)
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 12, color.darkened(0.4), 1.2, true)


func _draw_ore(color: Color, radius: float) -> void:
	var pts := PackedVector2Array([
		Vector2(-radius * 0.8, radius * 0.3),
		Vector2(-radius * 0.3, -radius * 0.7),
		Vector2(radius * 0.5, -radius * 0.5),
		Vector2(radius * 0.85, radius * 0.2),
		Vector2(radius * 0.2, radius * 0.75),
		Vector2(-radius * 0.5, radius * 0.65),
	])
	draw_colored_polygon(pts, color)
	draw_colored_polygon(PackedVector2Array([
		pts[1], pts[2], (pts[1] + pts[2]) * 0.5 + Vector2(0, -1),
	]), color.lightened(0.25))
	if resource_id == "sulfur":
		draw_circle(Vector2(0, -1), 1.5, Color(1.0, 0.95, 0.4, 0.8))


func _draw_ice(color: Color, radius: float) -> void:
	draw_colored_polygon(PackedVector2Array([
		Vector2(0, -radius), Vector2(radius * 0.7, -radius * 0.2),
		Vector2(radius * 0.4, radius * 0.7), Vector2(-radius * 0.5, radius * 0.55),
		Vector2(-radius * 0.75, -radius * 0.15),
	]), color)
	draw_line(Vector2(0, -radius * 0.6), Vector2(radius * 0.3, radius * 0.2),
		Color(1, 1, 1, 0.55), 1.2, true)
	draw_circle(Vector2(-radius * 0.2, -radius * 0.2), 1.4, Color(1, 1, 1, 0.5))


func _draw_reed(color: Color, radius: float) -> void:
	for i in 5:
		var x := -radius * 0.5 + float(i) * radius * 0.25
		var h := radius * (0.7 + 0.35 * sin(float(i) * 1.7 + _pulse_phase))
		draw_line(Vector2(x, radius * 0.4), Vector2(x + 0.5, -h), color, 1.4, true)
		draw_circle(Vector2(x + 0.5, -h), 1.1, color.lightened(0.2))


func harvest(harvester: Creature, effort: float = 1.0) -> float:
	if remaining <= 0.0:
		return 0.0
	var aptitude := 1.0
	if harvester != null:
		var key := "forage" if resource_id in ["forage", "grain", "reed"] else "haul"
		aptitude = clampf(harvester.stats.trait_value(key), 0.3, 3.0)
	var taken := minf(remaining, 6.0 * effort * aptitude)
	remaining -= taken
	if harvester != null:
		harvester.experience.log_event(
			"forage_success" if resource_id in ["forage", "grain", "reed"] else "work_completed_haul",
			1.0)
		harvester.needs.energy = clampf(harvester.needs.energy - 0.01 * effort, 0.0, 1.0)
	queue_redraw()
	return taken


func depleted() -> bool:
	return remaining <= 0.0


static func spawn_for_chunk(parent: Node, planet: PlanetSeedResource, chunk: Dictionary,
		summary: PlanetSummaryResource) -> Array:
	var coord: Vector2i = chunk["coord"]
	var rng := RandomNumberGenerator.new()
	rng.seed = planet.seed ^ hash("res:%d,%d" % [coord.x, coord.y])
	var out: Array = []

	var count := rng.randi_range(1, 4)
	var biome_ids: PackedStringArray = chunk["biomes"]
	for i in count:
		var tile_x := rng.randi() % ChunkGenerator.CHUNK_SIZE
		var tile_y := rng.randi() % ChunkGenerator.CHUNK_SIZE
		var biome := PlanetGenerator.get_biome(
			biome_ids[tile_y * ChunkGenerator.CHUNK_SIZE + tile_x])
		var offerings: Dictionary = biome.get("resources", {})
		if offerings.is_empty():
			continue
		var res_id: String = String(offerings.keys()[rng.randi() % offerings.size()])
		var richness: float = float(offerings[res_id]) \
			* float(planet.resource_abundance.get(res_id, 1.0))
		var key := "%d,%d:%d" % [coord.x, coord.y, i]

		var fraction := float(summary.resource_depletion.get(key, 1.0)) if summary != null else 1.0
		var amount := 20.0 * maxf(0.2, richness) * fraction
		var eco: Dictionary = chunk.get("ecology", {})
		var res_axis := float(eco.get("resources", 0.5)) if not eco.is_empty() else 0.5
		amount *= Ecology.yield_mult(res_axis)
		if res_id in ["forage", "grain", "reed"]:
			var life_axis := float(eco.get("life", 0.5)) if not eco.is_empty() else 0.5
			if life_axis < Ecology.LIFE_SPAWN_FLOOR:
				continue
		if amount <= 0.5:
			continue

		var node := ResourceNode.new()
		node.setup(res_id, amount, key)
		node.position = Vector2(
			(coord.x * ChunkGenerator.CHUNK_SIZE + tile_x) * PlanetWorld.TILE_SIZE,
			(coord.y * ChunkGenerator.CHUNK_SIZE + tile_y) * PlanetWorld.TILE_SIZE)
		parent.add_child(node)
		out.append(node)
	return out
