extends Node2D
class_name ResourceNode

## A harvestable deposit standing in the world. What a chunk yields is decided
## by its biome's `resources` table and the planet's abundance multipliers, so
## a world's economy follows from its generation rather than being sprinkled on
## top — a timber world genuinely has forests, an ashland genuinely has sulfur.

const COLORS := {
	"timber": Color(0.35, 0.55, 0.25), "forage": Color(0.55, 0.75, 0.35),
	"ore_ferrite": Color(0.55, 0.45, 0.40), "silica": Color(0.75, 0.78, 0.85),
	"reed": Color(0.45, 0.62, 0.50), "grain": Color(0.80, 0.72, 0.35),
	"sulfur": Color(0.85, 0.75, 0.25), "ice": Color(0.75, 0.88, 0.95),
}

var resource_id: String = "timber"
var remaining: float = 40.0
var node_key: String = ""


func setup(res_id: String, amount: float, key: String) -> void:
	resource_id = res_id
	remaining = amount
	node_key = key
	queue_redraw()


func _draw() -> void:
	if remaining <= 0.0:
		return
	var color: Color = COLORS.get(resource_id, Color(0.7, 0.7, 0.7))
	# Size reads as remaining yield, so a picked-over node is visibly spent.
	var radius := 5.0 + clampf(remaining / 8.0, 0.0, 7.0)
	draw_circle(Vector2.ZERO, radius, color)
	draw_arc(Vector2.ZERO, radius, 0.0, TAU, 14, color.darkened(0.5), 1.5, true)


## Harvest with a specific creature; its forage/haul aptitude decides the yield
## per swing, which is what makes work genes economically real.
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


## Deterministic per-chunk deposits. Same chunk always yields the same nodes,
## so harvesting is a persistent decision rather than a respawning treadmill —
## depletion is tracked in the planet summary by `node_key`.
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

		# Respect what the player already took out of this deposit.
		var fraction := float(summary.resource_depletion.get(key, 1.0)) if summary != null else 1.0
		var amount := 20.0 * maxf(0.2, richness) * fraction
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
