extends Node2D
class_name ChunkView

## Baked terrain texture (1 pixel/tile) + sparse site/structure overlays.
## Multi-pass bake: elevation shading, biome blends, moisture sheen, micro
## detail — steady-state cost is still one textured quad per chunk.

const TILE_SIZE := PlanetWorld.TILE_SIZE
const CHUNK_SIZE := ChunkGenerator.CHUNK_SIZE
const TEX_SIZE := CHUNK_SIZE

const BIOME_DEPTH := {
	"biome_ice_waste": {
		"hi": [0.95, 0.98, 1.0], "lo": [0.52, 0.62, 0.78],
		"accent": [0.85, 0.92, 1.0], "detail": 3, "wet": 0.1,
	},
	"biome_tundra": {
		"hi": [0.72, 0.76, 0.68], "lo": [0.36, 0.40, 0.38],
		"accent": [0.55, 0.62, 0.48], "detail": 0, "wet": 0.15,
	},
	"biome_taiga": {
		"hi": [0.30, 0.50, 0.34], "lo": [0.10, 0.22, 0.14],
		"accent": [0.18, 0.38, 0.22], "detail": 1, "wet": 0.25,
	},
	"biome_grassland": {
		"hi": [0.72, 0.80, 0.38], "lo": [0.32, 0.40, 0.16],
		"accent": [0.58, 0.70, 0.28], "detail": 2, "wet": 0.2,
	},
	"biome_forest": {
		"hi": [0.26, 0.56, 0.28], "lo": [0.06, 0.18, 0.08],
		"accent": [0.14, 0.40, 0.16], "detail": 1, "wet": 0.35,
	},
	"biome_wetland": {
		"hi": [0.36, 0.54, 0.48], "lo": [0.12, 0.26, 0.26],
		"accent": [0.28, 0.48, 0.50], "detail": 5, "wet": 0.85,
	},
	"biome_desert": {
		"hi": [0.94, 0.84, 0.55], "lo": [0.52, 0.40, 0.20],
		"accent": [0.88, 0.70, 0.38], "detail": 6, "wet": 0.0,
	},
	"biome_savanna": {
		"hi": [0.84, 0.76, 0.40], "lo": [0.46, 0.40, 0.16],
		"accent": [0.70, 0.58, 0.28], "detail": 2, "wet": 0.1,
	},
	"biome_jungle": {
		"hi": [0.20, 0.54, 0.24], "lo": [0.04, 0.16, 0.06],
		"accent": [0.12, 0.42, 0.18], "detail": 1, "wet": 0.55,
	},
	"biome_ashland": {
		"hi": [0.46, 0.38, 0.36], "lo": [0.14, 0.10, 0.10],
		"accent": [0.70, 0.32, 0.18], "detail": 4, "wet": 0.05,
	},
	"biome_barrens": {
		"hi": [0.58, 0.54, 0.48], "lo": [0.26, 0.24, 0.22],
		"accent": [0.48, 0.44, 0.40], "detail": 0, "wet": 0.05,
	},
	"biome_shallows": {
		"hi": [0.48, 0.74, 0.90], "lo": [0.10, 0.30, 0.46],
		"accent": [0.65, 0.88, 0.95], "detail": 5, "wet": 1.0,
	},
}

var chunk: Dictionary
var _texture: ImageTexture
var _bake_ms: float = 0.0


func set_chunk(data: Dictionary) -> void:
	chunk = data
	position = Vector2(data["coord"]) * CHUNK_SIZE * TILE_SIZE
	_bake_texture()
	queue_redraw()


func get_bake_ms() -> float:
	return _bake_ms


func _bake_texture() -> void:
	if chunk.is_empty():
		_texture = null
		return
	var t0 := Time.get_ticks_usec()
	var ids: PackedStringArray = chunk["biomes"]
	var elevation: PackedFloat32Array = chunk["elevation"]
	var moisture: PackedFloat32Array = chunk.get("moisture", PackedFloat32Array())
	var has_moist := moisture.size() == ids.size()
	var coord: Vector2i = chunk["coord"]
	var world_seed := int(coord.x) * 73856093 ^ int(coord.y) * 19349663
	var palette: Dictionary = {}
	for i in ids.size():
		var bid := String(ids[i])
		if not palette.has(bid):
			palette[bid] = _palette_for(bid)
	var bytes := PackedByteArray()
	bytes.resize(TEX_SIZE * TEX_SIZE * 3)
	var bi := 0
	for y in CHUNK_SIZE:
		var row := y * CHUNK_SIZE
		for x in CHUNK_SIZE:
			var i := row + x
			var bid := String(ids[i])
			var pal: Dictionary = palette[bid]
			var elev := elevation[i]
			var moist := moisture[i] if has_moist else float(pal.get("wet", 0.0))
			var t := clampf(0.48 + elev * 0.62, 0.0, 1.0)
			var lo: Color = pal["lo"]
			var hi: Color = pal["hi"]
			var accent: Color = pal["accent"]
			var r := lerpf(lo.r, hi.r, t)
			var g := lerpf(lo.g, hi.g, t)
			var b := lerpf(lo.b, hi.b, t)

			# Moisture sheen — wet ground reads cooler / darker.
			if moist > 0.35:
				var wet_k := clampf((moist - 0.35) * 0.7, 0.0, 0.45)
				r = lerpf(r, accent.r * 0.7, wet_k * 0.35)
				g = lerpf(g, accent.g * 0.85, wet_k * 0.35)
				b = lerpf(b, clampf(accent.b + 0.1, 0.0, 1.0), wet_k * 0.55)
				r *= 1.0 - wet_k * 0.12
				g *= 1.0 - wet_k * 0.08

			var h := _hash_u(world_seed + i * 2654435761)
			var grain := (float(h & 255) / 255.0) * 0.10 - 0.05
			r = clampf(r + grain, 0.0, 1.0)
			g = clampf(g + grain * 0.88, 0.0, 1.0)
			b = clampf(b + grain * 0.72, 0.0, 1.0)

			# Slope lighting (E-W + N-S) for readable ridges.
			if x < CHUNK_SIZE - 1:
				var slope_x := elev - elevation[i + 1]
				if slope_x > 0.015:
					var s := clampf(slope_x * 0.28, 0.0, 0.16)
					r = clampf(r + s, 0.0, 1.0)
					g = clampf(g + s, 0.0, 1.0)
					b = clampf(b + s * 0.9, 0.0, 1.0)
				elif slope_x < -0.015:
					var s2 := clampf(-slope_x * 0.32, 0.0, 0.18)
					r = clampf(r - s2, 0.0, 1.0)
					g = clampf(g - s2, 0.0, 1.0)
					b = clampf(b - s2 * 0.85, 0.0, 1.0)
			if y < CHUNK_SIZE - 1:
				var slope_y := elev - elevation[i + CHUNK_SIZE]
				if slope_y > 0.02:
					var sy := clampf(slope_y * 0.12, 0.0, 0.08)
					r = clampf(r + sy * 0.6, 0.0, 1.0)
					g = clampf(g + sy * 0.6, 0.0, 1.0)
					b = clampf(b + sy * 0.5, 0.0, 1.0)
				elif slope_y < -0.02:
					var sy2 := clampf(-slope_y * 0.18, 0.0, 0.12)
					r = clampf(r - sy2, 0.0, 1.0)
					g = clampf(g - sy2, 0.0, 1.0)
					b = clampf(b - sy2, 0.0, 1.0)

			# Soft biome edges.
			if x > 0 and String(ids[i - 1]) != bid:
				r *= 0.90
				g *= 0.90
				b *= 0.90
			if y > 0 and String(ids[i - CHUNK_SIZE]) != bid:
				r *= 0.92
				g *= 0.92
				b *= 0.92

			# High ridges bleach toward rock / snow by temperature-ish biome.
			if elev > 0.35:
				var peak := clampf((elev - 0.35) * 1.4, 0.0, 0.55)
				if int(pal["detail"]) == 3 or bid == "biome_ice_waste":
					r = lerpf(r, 0.95, peak)
					g = lerpf(g, 0.97, peak)
					b = lerpf(b, 1.0, peak)
				else:
					r = lerpf(r, 0.55, peak * 0.6)
					g = lerpf(g, 0.52, peak * 0.6)
					b = lerpf(b, 0.48, peak * 0.6)

			# Low bowls darken (valleys / water basins).
			if elev < -0.15:
				var bowl := clampf((-elev - 0.15) * 1.2, 0.0, 0.5)
				r = lerpf(r, lo.r * 0.7, bowl)
				g = lerpf(g, lo.g * 0.75, bowl)
				b = lerpf(b, clampf(lo.b + 0.08, 0.0, 1.0), bowl)

			var dh := float((h >> 8) & 255) / 255.0
			var dh2 := float((h >> 16) & 255) / 255.0
			match int(pal["detail"]):
				1:  # canopy / tree stipple
					if dh > 0.40:
						var dens := 0.45 + 0.2 * dh2
						r = lerpf(r, 0.08, dens)
						g = lerpf(g, 0.32, dens)
						b = lerpf(b, 0.12, dens)
					if dh2 > 0.82:
						r = lerpf(r, 0.18, 0.35)
						g = lerpf(g, 0.48, 0.35)
						b = lerpf(b, 0.20, 0.35)
				2:  # grass tufts / scrub
					if dh > 0.52:
						r = lerpf(r, 0.48, 0.30)
						g = lerpf(g, 0.60, 0.30)
						b = lerpf(b, 0.22, 0.30)
					if dh2 > 0.88:
						r = lerpf(r, 0.62, 0.25)
						g = lerpf(g, 0.55, 0.25)
						b = lerpf(b, 0.28, 0.25)
				3:  # ice sparkle
					if dh > 0.70:
						r = clampf(r + 0.18, 0.0, 1.0)
						g = clampf(g + 0.18, 0.0, 1.0)
						b = clampf(b + 0.20, 0.0, 1.0)
					if dh2 > 0.92:
						r = clampf(r + 0.12, 0.0, 1.0)
						g = clampf(g + 0.14, 0.0, 1.0)
						b = 1.0
				4:  # ember / ash
					if dh > 0.74:
						r = lerpf(r, 0.95, 0.38)
						g = lerpf(g, 0.32, 0.38)
						b = lerpf(b, 0.10, 0.38)
					if dh2 > 0.9:
						r = lerpf(r, 0.25, 0.4)
						g = lerpf(g, 0.22, 0.4)
						b = lerpf(b, 0.22, 0.4)
				5:  # water shimmer / reed
					r = lerpf(r, 0.50, 0.16)
					g = lerpf(g, 0.82, 0.16)
					b = lerpf(b, 0.95, 0.16)
					if dh > 0.6:
						r = clampf(r + 0.08, 0.0, 1.0)
						g = clampf(g + 0.10, 0.0, 1.0)
						b = clampf(b + 0.12, 0.0, 1.0)
					if dh2 > 0.85:
						r = lerpf(r, 0.25, 0.25)
						g = lerpf(g, 0.45, 0.25)
						b = lerpf(b, 0.32, 0.25)
				6:  # dune ripples
					if dh > 0.58:
						r = clampf(r + 0.08, 0.0, 1.0)
						g = clampf(g + 0.05, 0.0, 1.0)
						b = clampf(b + 0.02, 0.0, 1.0)
					# Subtle ripple bands from hash.
					if int((h >> 4) & 7) == 0:
						r = clampf(r + 0.05, 0.0, 1.0)
						g = clampf(g + 0.04, 0.0, 1.0)

			bytes[bi] = int(r * 255.0)
			bytes[bi + 1] = int(g * 255.0)
			bytes[bi + 2] = int(b * 255.0)
			bi += 3
	var img := Image.create_from_data(TEX_SIZE, TEX_SIZE, false, Image.FORMAT_RGB8, bytes)
	if _texture == null:
		_texture = ImageTexture.create_from_image(img)
	else:
		_texture.update(img)
	_bake_ms = float(Time.get_ticks_usec() - t0) / 1000.0


func _palette_for(biome_id: String) -> Dictionary:
	var depth: Dictionary = BIOME_DEPTH.get(biome_id, {})
	if depth.is_empty():
		var biome := PlanetGenerator.get_biome(biome_id)
		var c: Array = biome.get("color", [0.5, 0.5, 0.5])
		return {
			"lo": Color(c[0] * 0.70, c[1] * 0.70, c[2] * 0.70),
			"hi": Color(minf(c[0] * 1.10, 1.0), minf(c[1] * 1.10, 1.0), minf(c[2] * 1.10, 1.0)),
			"accent": Color(c[0], c[1], c[2]),
			"detail": 0,
			"wet": 0.0,
		}
	var la: Array = depth["lo"]
	var ha: Array = depth["hi"]
	var aa: Array = depth.get("accent", ha)
	return {
		"lo": Color(la[0], la[1], la[2]),
		"hi": Color(ha[0], ha[1], ha[2]),
		"accent": Color(aa[0], aa[1], aa[2]),
		"detail": int(depth.get("detail", 0)),
		"wet": float(depth.get("wet", 0.0)),
	}


func _draw() -> void:
	if chunk.is_empty():
		return
	var world_px := float(CHUNK_SIZE * TILE_SIZE)
	if _texture != null:
		draw_texture_rect(_texture, Rect2(0, 0, world_px, world_px), false)
	for feat in chunk.get("features", []):
		_draw_feature(feat)
	for site in chunk.get("sites", []):
		_draw_site(site)
	_draw_structures()


func _draw_feature(feat: Dictionary) -> void:
	var cell: Array = feat.get("cell", [0, 0])
	var centre := Vector2(float(cell[0]), float(cell[1])) * TILE_SIZE \
		+ Vector2(TILE_SIZE, TILE_SIZE) * 0.5
	match String(feat.get("kind", "")):
		"rock":
			draw_circle(centre + Vector2(1, 1.5), 3.2, Color(0, 0, 0, 0.25))
			draw_colored_polygon(PackedVector2Array([
				centre + Vector2(-4, 2), centre + Vector2(0, -4), centre + Vector2(5, 2),
			]), Color(0.42, 0.40, 0.38))
			draw_colored_polygon(PackedVector2Array([
				centre + Vector2(-2, 1), centre + Vector2(0, -2), centre + Vector2(2, 1),
			]), Color(0.55, 0.52, 0.48))
		"bone":
			draw_line(centre + Vector2(-3, 0), centre + Vector2(3, 1), Color(0.85, 0.82, 0.72, 0.75), 1.5, true)
			draw_circle(centre + Vector2(-3, 0), 1.2, Color(0.9, 0.88, 0.8, 0.8))
		"pool":
			draw_circle(centre, TILE_SIZE * 1.1, Color(0.25, 0.55, 0.72, 0.45))
			draw_circle(centre, TILE_SIZE * 0.7, Color(0.40, 0.72, 0.88, 0.55))
			draw_circle(centre + Vector2(-1, -1), TILE_SIZE * 0.25, Color(0.75, 0.92, 1.0, 0.4))


func _draw_site(site: Dictionary) -> void:
	var cell: Array = site["cell"]
	var centre := Vector2(cell[0], cell[1]) * TILE_SIZE + Vector2(TILE_SIZE, TILE_SIZE) * 0.5
	match String(site["kind"]):
		"ruin":
			draw_circle(centre + Vector2(1.5, 2.0), TILE_SIZE * 1.1, Color(0, 0, 0, 0.28))
			# Broken wall mass.
			draw_rect(Rect2(centre.x - 6, centre.y - 4, 12, 9), Color(0.38, 0.34, 0.30), true)
			draw_rect(Rect2(centre.x - 4, centre.y - 8, 5, 5), Color(0.46, 0.40, 0.34), true)
			draw_rect(Rect2(centre.x + 1, centre.y - 6, 4, 3), Color(0.40, 0.36, 0.30), true)
			# Arch gap.
			draw_rect(Rect2(centre.x - 2, centre.y - 1, 3, 5), Color(0.22, 0.20, 0.18), true)
			draw_circle(centre + Vector2(-3, 2), 1.3, Color(0.90, 0.75, 0.30, 0.9))
		"anomaly":
			draw_circle(centre, TILE_SIZE * 1.2, Color(0.72, 0.18, 0.92, 0.18))
			draw_circle(centre, TILE_SIZE * 0.7, Color(0.88, 0.32, 1.0, 0.40))
			draw_circle(centre, TILE_SIZE * 0.32, Color(1.0, 0.78, 1.0, 0.88))
			draw_arc(centre, TILE_SIZE * 0.95, 0.0, TAU, 16, Color(0.9, 0.4, 1.0, 0.55), 1.2, true)
		"lookout":
			draw_circle(centre + Vector2(0.5, 1), 4.0, Color(0, 0, 0, 0.22))
			draw_colored_polygon(PackedVector2Array([
				centre + Vector2(-5, 3), centre + Vector2(0, -7), centre + Vector2(5, 3),
			]), Color(0.48, 0.46, 0.42))
			draw_rect(Rect2(centre.x - 1.5, centre.y - 9, 3, 4), Color(0.55, 0.52, 0.45), true)
			draw_circle(centre + Vector2(0, -10), 1.5, Color(0.95, 0.85, 0.45, 0.9))
		_:
			draw_circle(centre, TILE_SIZE * 0.4, Color(0.8, 0.8, 0.8, 0.5))


func _draw_structures() -> void:
	var summary := PlanetManager.active_summary()
	if summary == null:
		return
	var origin: Vector2i = chunk["coord"] * CHUNK_SIZE
	for entry in summary.structures:
		var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var local := cell - origin
		if local.x < -4 or local.y < -4 or local.x > CHUNK_SIZE or local.y > CHUNK_SIZE:
			continue
		var fp_x := 2
		var fp_y := 2
		if entry is Dictionary and entry.has("state") and entry["state"] is Dictionary:
			var state: Dictionary = entry["state"]
			if state.has("footprint"):
				fp_x = int(state["footprint"][0]) if state["footprint"] is Array else 2
				fp_y = int(state["footprint"][1]) if state["footprint"] is Array else 2
		var ox := float(local.x * TILE_SIZE)
		var oy := float(local.y * TILE_SIZE)
		var w := float(fp_x * TILE_SIZE)
		var h := float(fp_y * TILE_SIZE)
		draw_rect(Rect2(ox + 2, oy + 3, w, h), Color(0, 0, 0, 0.30), true)
		draw_rect(Rect2(ox, oy, w, h), Color(0.46, 0.34, 0.22, 0.96), true)
		draw_rect(Rect2(ox, oy, w, h * 0.36), Color(0.58, 0.28, 0.18, 0.95), true)
		draw_rect(Rect2(ox + w * 0.35, oy + h * 0.55, w * 0.28, h * 0.4), Color(0.22, 0.16, 0.12), true)


func _hash_u(n: int) -> int:
	var x := n * 1103515245 + 12345
	return (x >> 16) ^ x
