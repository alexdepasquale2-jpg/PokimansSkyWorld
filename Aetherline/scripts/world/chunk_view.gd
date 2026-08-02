extends Node2D
class_name ChunkView

## Draws one generated chunk as coloured tiles, from PlanetGenerator's biome
## catalog colours. Pure visualisation — no gameplay data lives here.

const TILE_SIZE := PlanetWorld.TILE_SIZE
const CHUNK_SIZE := ChunkGenerator.CHUNK_SIZE

var chunk: Dictionary


func set_chunk(data: Dictionary) -> void:
	chunk = data
	position = Vector2(data["coord"]) * CHUNK_SIZE * TILE_SIZE
	queue_redraw()


func _draw() -> void:
	if chunk.is_empty():
		return
	var ids: PackedStringArray = chunk["biomes"]
	var elevation: PackedFloat32Array = chunk["elevation"]
	for y in CHUNK_SIZE:
		for x in CHUNK_SIZE:
			var i := y * CHUNK_SIZE + x
			var biome := PlanetGenerator.get_biome(ids[i])
			var c: Array = biome.get("color", [0.5, 0.5, 0.5])
			var shade := 1.0 + elevation[i] * 0.25
			draw_rect(Rect2(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE),
				Color(c[0] * shade, c[1] * shade, c[2] * shade), true)

	for site in chunk.get("sites", []):
		var cell: Array = site["cell"]
		var col: Color = Color.GOLD if site["kind"] == "ruin" else Color.MAGENTA
		draw_circle(Vector2(cell[0], cell[1]) * TILE_SIZE + Vector2(TILE_SIZE, TILE_SIZE) * 0.5,
			TILE_SIZE * 0.8, col)

	_draw_structures()


## Player-built structures whose footprint falls inside this chunk. Read live
## from the summary so a newly placed building appears without regenerating.
func _draw_structures() -> void:
	var summary := PlanetManager.active_summary()
	if summary == null:
		return
	var origin: Vector2i = chunk["coord"] * CHUNK_SIZE
	for entry in summary.structures:
		var structure := BaseBuilder.get_structure(entry["structure_id"])
		if structure == null:
			continue
		var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var local := cell - origin
		if local.x < -4 or local.y < -4 or local.x > CHUNK_SIZE or local.y > CHUNK_SIZE:
			continue
		var rect := Rect2(local.x * TILE_SIZE, local.y * TILE_SIZE,
			structure.footprint.x * TILE_SIZE, structure.footprint.y * TILE_SIZE)
		draw_rect(rect, Color(0.45, 0.32, 0.20, 0.95), true)
		draw_rect(rect, Color(0.15, 0.10, 0.06), false, 2.0)
