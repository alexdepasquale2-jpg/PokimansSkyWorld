extends Node2D
class_name SettlementView

## Renders a grown village: plaza, paths, landmarks, buildings with character.
## NPCs are living Creatures owned by SettlementRuntime — not drawn here.

const TILE := PlanetWorld.TILE_SIZE

var layout: Dictionary = {}
var _doors: Array = []


func setup(settlement_layout: Dictionary) -> void:
	layout = settlement_layout
	_doors.clear()
	if layout.is_empty():
		return
	for entry in layout.get("buildings", []):
		var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var footprint := Vector2i(int(entry["footprint"][0]), int(entry["footprint"][1]))
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

	var origin := center()
	var plaza_r := SettlementGenerator.PLAZA_RADIUS * TILE
	var ethos := String(layout.get("ethos", "wanderer"))
	var earth := _earth_color(ethos)

	# Soft village footprint.
	draw_circle(origin, plaza_r * 2.4, Color(earth.r, earth.g, earth.b, 0.18))
	# Paths first so buildings sit on top.
	for path in layout.get("paths", []):
		if path is Array and path.size() >= 4:
			var a := Vector2(float(path[0]), float(path[1])) * TILE
			var b := Vector2(float(path[2]), float(path[3])) * TILE
			draw_line(a, b, Color(0.42, 0.36, 0.28, 0.55), 5.0, true)
			draw_line(a, b, Color(0.55, 0.48, 0.38, 0.4), 2.2, true)

	# Plaza packed earth + rings.
	draw_circle(origin, plaza_r * 1.2, Color(earth.r * 0.7, earth.g * 0.7, earth.b * 0.65, 0.4))
	draw_circle(origin, plaza_r, Color(earth.r, earth.g, earth.b, 0.9))
	draw_circle(origin, plaza_r * 0.7, Color(earth.r * 1.08, earth.g * 1.05, earth.b * 0.95, 0.55))
	draw_arc(origin, plaza_r * 0.92, 0.0, TAU, 32, Color(0.28, 0.22, 0.16, 0.45), 2.0, true)

	# Landmarks (hearth, well, totems…).
	for mark in layout.get("landmarks", []):
		_draw_landmark(mark)

	for entry in layout.get("buildings", []):
		_draw_building(entry)

	# Door frames only — keepers stand as live creatures.
	for door in _doors:
		var pos: Vector2 = door["pos"]
		draw_rect(Rect2(pos.x - TILE * 0.42, pos.y - TILE * 0.5,
			TILE * 0.84, TILE * 0.48), Color(0.14, 0.10, 0.07), true)
		draw_rect(Rect2(pos.x - TILE * 0.26, pos.y - TILE * 0.38,
			TILE * 0.52, TILE * 0.32), Color(0.55, 0.38, 0.18, 0.7), true)

	# Name plate near plaza.
	# (Drawn as small marker — text would need Label node; keep visual only.)
	draw_arc(origin, plaza_r * 1.35, 0.0, TAU, 40, Color(0.9, 0.75, 0.35, 0.15), 1.5, true)


func _earth_color(ethos: String) -> Color:
	match ethos:
		"tender":
			return Color(0.48, 0.52, 0.34)
		"wary":
			return Color(0.48, 0.42, 0.36)
		"maker":
			return Color(0.50, 0.44, 0.38)
		"herder":
			return Color(0.52, 0.48, 0.32)
		"keeper":
			return Color(0.46, 0.42, 0.50)
		"scavenger":
			return Color(0.44, 0.40, 0.36)
		_:
			return Color(0.52, 0.46, 0.38)


func _draw_landmark(mark: Dictionary) -> void:
	var cell: Array = mark.get("cell", [0, 0])
	var p := Vector2(float(cell[0]), float(cell[1])) * TILE + Vector2(TILE, TILE) * 0.5
	match String(mark.get("kind", "")):
		"hearth":
			draw_circle(p, TILE * 0.85, Color(0.38, 0.32, 0.26))
			draw_circle(p, TILE * 0.45, Color(0.90, 0.45, 0.15, 0.85))
			draw_circle(p + Vector2(-1, -1), TILE * 0.18, Color(1.0, 0.85, 0.35, 0.7))
		"well":
			draw_circle(p, TILE * 0.7, Color(0.35, 0.38, 0.42))
			draw_circle(p, TILE * 0.4, Color(0.25, 0.45, 0.58, 0.9))
			draw_arc(p, TILE * 0.7, 0.0, TAU, 14, Color(0.2, 0.18, 0.15), 1.5, true)
		"totem":
			draw_rect(Rect2(p.x - 2, p.y - 12, 4, 16), Color(0.45, 0.32, 0.55), true)
			draw_circle(p + Vector2(0, -14), 3.5, Color(0.7, 0.5, 0.9, 0.8))
		"watch_post":
			draw_rect(Rect2(p.x - 2, p.y - 14, 4, 18), Color(0.4, 0.36, 0.3), true)
			draw_rect(Rect2(p.x - 6, p.y - 16, 12, 4), Color(0.48, 0.42, 0.34), true)
		"garden_bed":
			draw_rect(Rect2(p.x - 10, p.y - 6, 20, 12), Color(0.32, 0.42, 0.22), true)
			for i in 4:
				draw_circle(p + Vector2(-6 + i * 4.0, sin(float(i)) * 2.0), 1.6,
					Color(0.45, 0.7, 0.3))
		"anvil":
			draw_rect(Rect2(p.x - 5, p.y - 2, 10, 5), Color(0.35, 0.35, 0.38), true)
			draw_rect(Rect2(p.x - 2, p.y - 6, 4, 5), Color(0.45, 0.45, 0.48), true)
		"pen_fence":
			draw_arc(p, TILE * 1.1, 0.0, TAU, 12, Color(0.4, 0.32, 0.22, 0.7), 1.5, true)
		"stall":
			draw_rect(Rect2(p.x - 8, p.y - 4, 16, 8), Color(0.55, 0.42, 0.28, 0.8), true)
		"scrap_pile":
			draw_circle(p, 5, Color(0.5, 0.45, 0.4))
			draw_circle(p + Vector2(3, -2), 3, Color(0.6, 0.5, 0.35))
		"marker_stone":
			draw_colored_polygon(PackedVector2Array([
				p + Vector2(-3, 3), p + Vector2(0, -6), p + Vector2(4, 3),
			]), Color(0.5, 0.48, 0.45))
		_:
			draw_circle(p, 3, Color(0.5, 0.5, 0.45, 0.6))


func _draw_building(entry: Dictionary) -> void:
	var definition := SettlementGenerator.get_building(entry["building_id"])
	var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
	var footprint := Vector2i(int(entry["footprint"][0]), int(entry["footprint"][1]))
	var rect := Rect2(cell.x * TILE, cell.y * TILE,
		footprint.x * TILE, footprint.y * TILE)
	var c: Array = definition.get("color", [0.5, 0.5, 0.5])
	var base := Color(c[0], c[1], c[2])
	var shadow := base.darkened(0.45)
	var roof_kind := String(entry.get("roof", definition.get("roof", "gable")))
	var timber := Color(0.20, 0.14, 0.10)

	draw_rect(Rect2(rect.position + Vector2(2.5, 3.0), rect.size), Color(0, 0, 0, 0.28), true)
	draw_rect(rect, base, true)
	draw_rect(Rect2(rect.position.x, rect.position.y, 2.0, rect.size.y),
		base.lightened(0.15), true)
	draw_rect(Rect2(rect.end.x - 2.0, rect.position.y, 2.0, rect.size.y),
		shadow, true)

	_draw_roof(rect, roof_kind, base)

	# Windows / interior glow by building type.
	var bid := String(entry["building_id"])
	var wx := rect.position.x + rect.size.x * 0.22
	var wy := rect.position.y + rect.size.y * 0.48
	var glow := Color(1.0, 0.85, 0.35, 0.75)
	if bid == "bld_shrine":
		glow = Color(0.75, 0.55, 1.0, 0.8)
	elif bid == "bld_infirmary":
		glow = Color(0.85, 0.95, 1.0, 0.7)
	elif bid == "bld_garden":
		# Open plot — plant rows instead of windows.
		for i in 3:
			draw_line(
				Vector2(rect.position.x + 3, rect.position.y + 4 + i * 5),
				Vector2(rect.end.x - 3, rect.position.y + 4 + i * 5),
				Color(0.28, 0.48, 0.22), 1.5, true)
		draw_rect(rect, timber, false, 1.4)
		return

	draw_rect(Rect2(wx, wy, 3.2, 3.2), glow, true)
	if rect.size.x > TILE * 2.5:
		draw_rect(Rect2(rect.position.x + rect.size.x * 0.62, wy, 3.2, 3.2),
			glow.darkened(0.1), true)
	draw_rect(rect, timber, false, 1.6)

	# Role chimney / smoke for dwellings and halls.
	if bid in ["bld_dwelling", "bld_hall", "bld_nursery"]:
		var cx := rect.position.x + rect.size.x * 0.75
		var cy := rect.position.y - 2
		draw_rect(Rect2(cx, cy - 5, 3, 7), Color(0.35, 0.3, 0.28), true)


func _draw_roof(rect: Rect2, kind: String, base: Color) -> void:
	var roof := base.lightened(0.1).lerp(Color(0.55, 0.28, 0.18), 0.35)
	var timber := Color(0.18, 0.12, 0.09)
	match kind:
		"tower":
			draw_rect(Rect2(rect.position.x + rect.size.x * 0.25, rect.position.y - 10,
				rect.size.x * 0.5, 12), roof, true)
			draw_rect(Rect2(rect.position.x + rect.size.x * 0.35, rect.position.y - 16,
				rect.size.x * 0.3, 7), timber, true)
		"dome":
			draw_circle(Vector2(rect.get_center().x, rect.position.y + 2),
				rect.size.x * 0.42, roof)
		"longhouse":
			draw_rect(Rect2(rect.position.x - 2, rect.position.y - 4,
				rect.size.x + 4, rect.size.y * 0.28 + 4), roof, true)
			draw_line(Vector2(rect.position.x, rect.position.y + rect.size.y * 0.2),
				Vector2(rect.end.x, rect.position.y + rect.size.y * 0.2), timber, 1.5, true)
		"thatch":
			draw_colored_polygon(PackedVector2Array([
				Vector2(rect.position.x - 2, rect.position.y + 4),
				Vector2(rect.get_center().x, rect.position.y - 8),
				Vector2(rect.end.x + 2, rect.position.y + 4),
			]), Color(0.55, 0.48, 0.28))
		"shed":
			draw_colored_polygon(PackedVector2Array([
				Vector2(rect.position.x, rect.position.y + 2),
				Vector2(rect.position.x, rect.position.y - 4),
				Vector2(rect.end.x, rect.position.y + 2),
			]), roof)
		"flat":
			draw_rect(Rect2(rect.position.x - 1, rect.position.y - 2,
				rect.size.x + 2, 5), roof.darkened(0.1), true)
		"open":
			pass
		_:  # gable / hip
			draw_rect(Rect2(rect.position.x - 1, rect.position.y - 3,
				rect.size.x + 2, rect.size.y * 0.32 + 3), roof, true)
			draw_line(Vector2(rect.position.x, rect.position.y + rect.size.y * 0.26),
				Vector2(rect.end.x, rect.position.y + rect.size.y * 0.26),
				timber, 1.4, true)
