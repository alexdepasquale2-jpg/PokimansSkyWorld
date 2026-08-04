extends Node2D

## Streamer + rich bake + fauna FPS harness.
const TARGET_FPS := 120
const WARMUP_S := 2.5

var world: PlanetWorld
var player: Node2D
var chunk_layer: Node2D
var chunk_views: Dictionary = {}
var _pending_chunks: Array = []
var _fps_min := 9999.0
var _fps_max := 0.0
var _elapsed := 0.0
var _log_timer := 0.0
var _duration := 5.0


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--bench-seconds="):
			_duration = float(a.get_slice("=", 1))
	RenderingServer.set_default_clear_color(Color(0.06, 0.07, 0.10))
	Engine.max_fps = TARGET_FPS
	CultureRegistry.install(int(PlanetManager.universe_seed))
	EventBus.planet_chunk_loaded.connect(_on_loaded)
	EventBus.planet_chunk_unloaded.connect(_on_unloaded)
	chunk_layer = Node2D.new()
	add_child(chunk_layer)
	var planet := PlanetManager.create_planet()
	PlanetManager.land(planet.planet_id)
	world = PlanetWorld.new()
	add_child(world)
	world.setup(PlanetManager.active_planet(), PlanetManager.active_summary())
	player = Node2D.new()
	add_child(player)
	var cam := Camera2D.new()
	cam.enabled = true
	cam.zoom = Vector2(1.65, 1.65)
	player.add_child(cam)
	var rng := RandomNumberGenerator.new()
	rng.seed = planet.seed
	for i in 8:
		var c = CreatureFactory.spawn_random(self, rng, {
			"origin_kind": "wild",
			"planet_id": planet.planet_id,
			"planet_name": planet.display_name,
		})
		var ang := rng.randf() * TAU
		c.position = Vector2(cos(ang), sin(ang)) * rng.randf_range(80.0, 500.0)
	world.set_focus(player.global_position)
	_drain()
	print("[perf] merged fps_bench ready")


func _process(delta: float) -> void:
	_drain()
	player.position += Vector2(
		cos(Time.get_ticks_msec() * 0.0004),
		sin(Time.get_ticks_msec() * 0.0003)) * 90.0 * delta
	world.set_focus(player.global_position)
	_elapsed += delta
	var fps := Engine.get_frames_per_second()
	if _elapsed >= WARMUP_S and fps > 1.0:
		_fps_min = minf(_fps_min, fps)
		_fps_max = maxf(_fps_max, fps)
	_log_timer += delta
	if _log_timer >= 0.5:
		_log_timer = 0.0
		print("[perf] fps=%.1f min=%.1f max=%.1f views=%d gen_q=%d" % [
			fps, _fps_min if _fps_min < 9000.0 else 0.0, _fps_max,
			chunk_views.size(), world.pending_count()])
	if _elapsed >= _duration:
		var ok := _fps_min >= float(TARGET_FPS) * 0.92 and _fps_min < 9000.0
		print("[perf] RESULT=%s steady_min=%.1f max=%.1f" % [
			"PASS" if ok else "FAIL",
			_fps_min if _fps_min < 9000.0 else 0.0, _fps_max])
		get_tree().quit(0 if ok else 1)


func _drain() -> void:
	# Gen OR bake per frame — never both.
	if world.pending_count() > 0:
		if world.process_stream_budget(1) > 0:
			return
	if _pending_chunks.is_empty():
		return
	var item: Dictionary = _pending_chunks.pop_front()
	var key: String = item["key"]
	if chunk_views.has(key) or not world.loaded_chunks.has(key):
		return
	var view := ChunkView.new()
	chunk_layer.add_child(view)
	view.set_chunk(item["data"])
	chunk_views[key] = view


func _on_loaded(planet_id: String, coord: Vector2i) -> void:
	if world == null or planet_id != world.planet.planet_id:
		return
	var key := "%d,%d" % [coord.x, coord.y]
	if chunk_views.has(key) or not world.loaded_chunks.has(key):
		return
	_pending_chunks.append({"key": key, "data": world.loaded_chunks[key]})


func _on_unloaded(planet_id: String, coord: Vector2i) -> void:
	if world == null or planet_id != world.planet.planet_id:
		return
	var key := "%d,%d" % [coord.x, coord.y]
	for i in range(_pending_chunks.size() - 1, -1, -1):
		if _pending_chunks[i]["key"] == key:
			_pending_chunks.remove_at(i)
	if chunk_views.has(key):
		chunk_views[key].queue_free()
		chunk_views.erase(key)
