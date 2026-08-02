extends Node2D
class_name SettlementView

## Draws a generated settlement and answers "what am I standing in front of?".
## Buildings are drawn as solid footprints with a doorway marker; the NPC
## stands at the door. Purely presentational — services live in ServiceMenu.

const TILE := PlanetWorld.TILE_SIZE

var layout: Dictionary = {}
var _doors: Array = []   ## [{ "pos": Vector2, "entry": Dictionary }]


func setup(settlement_layout: Dictionary) -> void:
	layout = settlement_layout
	_doors.clear()
	if layout.is_empty():
		return
	for entry in layout["buildings"]:
		var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var footprint := Vector2i(int(entry["footprint"][0]), int(entry["footprint"][1]))
		# Door sits centred on the building's south face — the side the player
		# naturally approaches from when walking in off the map.
		_doors.append({
			"pos": Vector2((float(cell.x) + float(footprint.x) * 0.5) * TILE,
				(float(cell.y) + float(footprint.y) + 0.5) * TILE),
			"entry": entry,
		})
	queue_redraw()


func center() -> Vector2:
	if layout.is_empty():
		return Vector2.ZERO
	return Vector2(float(layout["origin"][0]), float(layout["origin"][1])) * TILE


## Nearest building door within `radius`, or {} if the player is not at a door.
func building_at(world_position: Vector2, radius: float = 46.0) -> Dictionary:
	var best := {}
	var best_distance := radius
	for door in _doors:
		var d: float = (door["pos"] as Vector2).distance_to(world_position)
		if d < best_distance:
			best_distance = d
			best = door["entry"]
	return best


func _draw() -> void:
	if layout.is_empty():
		return

	# Plaza: the open ground everything grew around.
	var origin := center()
	draw_circle(origin, SettlementGenerator.PLAZA_RADIUS * TILE, Color(0.52, 0.48, 0.42, 0.85))

	for entry in layout["buildings"]:
		var definition := SettlementGenerator.get_building(entry["building_id"])
		var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var footprint := Vector2i(int(entry["footprint"][0]), int(entry["footprint"][1]))
		var rect := Rect2(cell.x * TILE, cell.y * TILE,
			footprint.x * TILE, footprint.y * TILE)
		var c: Array = definition.get("color", [0.5, 0.5, 0.5])
		draw_rect(rect, Color(c[0], c[1], c[2]), true)
		draw_rect(rect, Color(0.12, 0.09, 0.07), false, 2.0)
		# Roof ridge, so buildings read as buildings at a glance.
		draw_line(Vector2(rect.position.x, rect.get_center().y),
			Vector2(rect.end.x, rect.get_center().y), Color(0.15, 0.12, 0.10, 0.6), 2.0)

	for door in _doors:
		var pos: Vector2 = door["pos"]
		draw_rect(Rect2(pos.x - TILE * 0.4, pos.y - TILE * 0.5,
			TILE * 0.8, TILE * 0.5), Color(0.18, 0.13, 0.10), true)
		# The NPC standing at the door.
		draw_circle(pos + Vector2(0, TILE * 0.8), TILE * 0.35, Color(0.90, 0.80, 0.65))
		draw_arc(pos + Vector2(0, TILE * 0.8), TILE * 0.35, 0.0, TAU, 10,
			Color(0.25, 0.18, 0.12), 1.5, true)
