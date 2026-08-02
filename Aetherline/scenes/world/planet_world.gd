extends Node2D
class_name PlanetWorld

## The streamed surface of the active planet.
##
## Holds only the chunks near the focus point. Chunks are regenerated from the
## seed on demand and thrown away when they leave the radius — the only thing
## that survives unloading is the player's own edits, which live in the
## PlanetSummaryResource, not here.

const TILE_SIZE: int = 8
const LOAD_RADIUS: int = 2      ## Chunks kept around the focus (5x5 = 25).
const UNLOAD_RADIUS: int = 4    ## Hysteresis, so walking a border does not thrash.

var planet: PlanetSeedResource
var summary: PlanetSummaryResource

## coord (as "x,y") -> chunk dictionary from ChunkGenerator.
var loaded_chunks: Dictionary = {}

## What the streamer centres on — the player, or the camera.
var focus: Vector2 = Vector2.ZERO

var chunks_generated: int = 0


func setup(planet_seed: PlanetSeedResource, planet_summary: PlanetSummaryResource) -> void:
	planet = planet_seed
	summary = planet_summary
	PlanetGenerator.derive(planet)
	update_streaming()


func chunk_at(world_position: Vector2) -> Vector2i:
	var tile := (world_position / float(TILE_SIZE)).floor()
	return Vector2i(floori(tile.x / ChunkGenerator.CHUNK_SIZE),
		floori(tile.y / ChunkGenerator.CHUNK_SIZE))


## Load what should be near, drop what has drifted far. Called when the focus
## moves, not every frame.
func update_streaming() -> void:
	if planet == null:
		return
	var centre := chunk_at(focus)

	for dy in range(-LOAD_RADIUS, LOAD_RADIUS + 1):
		for dx in range(-LOAD_RADIUS, LOAD_RADIUS + 1):
			_ensure_chunk(centre + Vector2i(dx, dy))

	for key in loaded_chunks.keys():
		var coord: Vector2i = loaded_chunks[key]["coord"]
		if maxi(absi(coord.x - centre.x), absi(coord.y - centre.y)) > UNLOAD_RADIUS:
			loaded_chunks.erase(key)
			EventBus.planet_chunk_unloaded.emit(planet.planet_id, coord)


func _ensure_chunk(coord: Vector2i) -> void:
	var key := "%d,%d" % [coord.x, coord.y]
	if loaded_chunks.has(key):
		return
	var chunk := ChunkGenerator.generate(planet, coord)
	_apply_overrides(chunk)
	loaded_chunks[key] = chunk
	chunks_generated += 1
	EventBus.planet_chunk_loaded.emit(planet.planet_id, coord)


## Re-apply the player's permanent terrain edits over freshly generated ground.
## This is the whole seed-plus-delta model in four lines: the world is rebuilt
## from nothing, then the parts the player changed are painted back on.
func _apply_overrides(chunk: Dictionary) -> void:
	if summary == null or summary.terrain_overrides.is_empty():
		return
	var origin: Vector2i = chunk["coord"] * ChunkGenerator.CHUNK_SIZE
	var biome_ids: PackedStringArray = chunk["biomes"]
	for y in ChunkGenerator.CHUNK_SIZE:
		for x in ChunkGenerator.CHUNK_SIZE:
			var world_key := "%d,%d" % [origin.x + x, origin.y + y]
			if summary.terrain_overrides.has(world_key):
				biome_ids[y * ChunkGenerator.CHUNK_SIZE + x] = \
					String(summary.terrain_overrides[world_key])


func set_focus(world_position: Vector2) -> void:
	var before := chunk_at(focus)
	focus = world_position
	if chunk_at(focus) != before:
		update_streaming()


# --- Queries ------------------------------------------------------------------

## Biome id at a world position, or "" if that chunk is not resident.
func biome_at(world_position: Vector2) -> String:
	var coord := chunk_at(world_position)
	var chunk: Variant = loaded_chunks.get("%d,%d" % [coord.x, coord.y])
	if chunk == null:
		return ""
	var tile := (world_position / float(TILE_SIZE)).floor()
	var local_x := int(tile.x) - coord.x * ChunkGenerator.CHUNK_SIZE
	var local_y := int(tile.y) - coord.y * ChunkGenerator.CHUNK_SIZE
	return String((chunk["biomes"] as PackedStringArray)[
		local_y * ChunkGenerator.CHUNK_SIZE + local_x])


## Every distinct biome currently on the ground near the player. Feeds discovery
## and the localised environmental pressure below.
func resident_biomes() -> Array:
	var seen := {}
	for key in loaded_chunks:
		for id in (loaded_chunks[key]["biomes"] as PackedStringArray):
			seen[id] = true
	return seen.keys()


## Apply a day's environmental pressure. Planet-wide pressure comes from the
## seed; the biomes actually underfoot add their own, so living in the ash
## wastes of a temperate world still marks a bloodline.
func apply_daily_pressure(days: float = 1.0) -> void:
	if planet == null:
		return
	var pressures := planet.epigenetic_pressures.duplicate()
	var local := biome_at(focus)
	if not local.is_empty():
		for key in (PlanetGenerator.get_biome(local).get("pressures", {}) as Dictionary):
			pressures[key] = maxf(float(pressures.get(key, 0.0)),
				float(PlanetGenerator.get_biome(local)["pressures"][key]))
		if summary != null:
			summary.mark_discovered(local)
	if not pressures.is_empty():
		EventBus.environment_pressure_applied.emit(planet.planet_id, pressures, days)


func debug_summary() -> String:
	return "%s: %d chunks resident (%d generated), biomes here: %s" % [
		planet.display_name if planet != null else "<none>",
		loaded_chunks.size(), chunks_generated,
		", ".join(resident_biomes())]
