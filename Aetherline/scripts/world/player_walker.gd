extends Node2D
class_name PlayerWalker

## Minimal top-down avatar for walking a generated world by hand. No physics
## body yet (Phase 4 owns real movement/collision) — this is purely so a human
## can look at streaming and biome placement instead of reading numbers.

const SPEED := 220.0

var world: PlanetWorld


func _draw() -> void:
	draw_circle(Vector2.ZERO, 6.0, Color.WHITE)
	draw_arc(Vector2.ZERO, 6.0, 0.0, TAU, 16, Color.BLACK, 2.0, true)


func _ready() -> void:
	queue_redraw()


func _process(delta: float) -> void:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if dir != Vector2.ZERO:
		# Terrain slows travel: a swamp or ashfall costs more stride per step.
		var cost := 1.0
		if world != null:
			var biome := PlanetGenerator.get_biome(world.biome_at(position))
			cost = float(biome.get("move_cost", 1.0))
		position += dir.normalized() * (SPEED / maxf(0.5, cost)) * delta
		if world != null:
			world.set_focus(position)
