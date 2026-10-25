extends RefCounted
class_name PlayerWalker

## Top-down movement for the player avatar. No physics body yet — pure
## kinematic walk so a human can feel streaming and biome placement.
## phase3on had this as a Node2D; this branch splits visual (PlayerAvatar)
## from movement (static helper) so Overworld owns the loop.

const BASE_SPEED := 140.0


static func move(body: Node2D, world: PlanetWorld, delta: float) -> void:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if dir.length_squared() < 0.01:
		return
	var cost := 1.0
	if world != null:
		var biome_id := world.biome_at(body.global_position)
		var b := PlanetGenerator.get_biome(biome_id)
		if not b.is_empty():
			cost = float(b.get("move_cost", 1.0))
	body.position += dir.normalized() * (BASE_SPEED / maxf(cost, 0.25)) * delta
