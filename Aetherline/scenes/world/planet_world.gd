extends Node2D
class_name PlanetWorld

## Streamed surface of the active planet.
## Generation is queued and drained with process_stream_budget() so a load-radius
## walk never materializes 25 chunks in one hitch (120fps path).

const TILE_SIZE: int = 8
const LOAD_RADIUS: int = 2
const UNLOAD_RADIUS: int = 4
const GEN_PER_FRAME: int = 1

var planet: PlanetSeedResource
var summary: PlanetSummaryResource
var loaded_chunks: Dictionary = {}
var focus: Vector2 = Vector2.ZERO
var chunks_generated: int = 0

var _gen_queue: Array[Vector2i] = []
var _queued_keys: Dictionary = {}
var last_gen_ms: float = 0.0


func setup(planet_seed: PlanetSeedResource, planet_summary: PlanetSummaryResource) -> void:
	planet = planet_seed
	summary = planet_summary
	PlanetGenerator.derive(planet)
	update_streaming()
	process_stream_budget(1)


func chunk_at(world_position: Vector2) -> Vector2i:
	var tile := (world_position / float(TILE_SIZE)).floor()
	return Vector2i(floori(tile.x / ChunkGenerator.CHUNK_SIZE),
		floori(tile.y / ChunkGenerator.CHUNK_SIZE))


func update_streaming() -> void:
	if planet == null:
		return
	var centre := chunk_at(focus)
	for dy in range(-LOAD_RADIUS, LOAD_RADIUS + 1):
		for dx in range(-LOAD_RADIUS, LOAD_RADIUS + 1):
			_queue_chunk(centre + Vector2i(dx, dy))
	for key in loaded_chunks.keys():
		var coord: Vector2i = loaded_chunks[key]["coord"]
		if maxi(absi(coord.x - centre.x), absi(coord.y - centre.y)) > UNLOAD_RADIUS:
			loaded_chunks.erase(key)
			EventBus.planet_chunk_unloaded.emit(planet.planet_id, coord)
	for i in range(_gen_queue.size() - 1, -1, -1):
		var c: Vector2i = _gen_queue[i]
		if maxi(absi(c.x - centre.x), absi(c.y - centre.y)) > LOAD_RADIUS:
			_queued_keys.erase("%d,%d" % [c.x, c.y])
			_gen_queue.remove_at(i)


func _queue_chunk(coord: Vector2i) -> void:
	var key := "%d,%d" % [coord.x, coord.y]
	if loaded_chunks.has(key) or _queued_keys.has(key):
		return
	_queued_keys[key] = true
	_gen_queue.append(coord)


func process_stream_budget(max_count: int = GEN_PER_FRAME) -> int:
	if planet == null or _gen_queue.is_empty():
		return 0
	var centre := chunk_at(focus)
	_gen_queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		return maxi(absi(a.x - centre.x), absi(a.y - centre.y)) \
			< maxi(absi(b.x - centre.x), absi(b.y - centre.y))
	)
	var n: int = 0
	while n < max_count and not _gen_queue.is_empty():
		var coord: Vector2i = _gen_queue.pop_front()
		var key := "%d,%d" % [coord.x, coord.y]
		_queued_keys.erase(key)
		if loaded_chunks.has(key):
			continue
		if maxi(absi(coord.x - centre.x), absi(coord.y - centre.y)) > LOAD_RADIUS:
			continue
		var t0 := Time.get_ticks_usec()
		var chunk := ChunkGenerator.generate(planet, coord)
		_apply_overrides(chunk)
		loaded_chunks[key] = chunk
		chunks_generated += 1
		last_gen_ms = float(Time.get_ticks_usec() - t0) / 1000.0
		EventBus.planet_chunk_loaded.emit(planet.planet_id, coord)
		n += 1
	return n


func pending_count() -> int:
	return _gen_queue.size()


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


func ecology_at(world_position: Vector2) -> Dictionary:
	var coord := chunk_at(world_position)
	var chunk: Variant = loaded_chunks.get("%d,%d" % [coord.x, coord.y])
	if chunk == null:
		return Ecology.empty()
	return chunk.get("ecology", Ecology.empty())


func resident_biomes() -> Array:
	var seen := {}
	for key in loaded_chunks:
		for id in (loaded_chunks[key]["biomes"] as PackedStringArray):
			seen[id] = true
	return seen.keys()


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
	return "%s: %d chunks resident (%d generated, %d pending), biomes: %s" % [
		planet.display_name if planet != null else "<none>",
		loaded_chunks.size(), chunks_generated, _gen_queue.size(),
		", ".join(resident_biomes())]
