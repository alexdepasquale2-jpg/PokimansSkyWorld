extends Control
class_name DescentView

## A bloodline, drawn.
##
## THE GAME IS NAMED FOR THIS AND DID NOT KEEP ONE. `LineageRecordResource` held
## a flat `member_uids` list and a `max_generation` integer, so a lineage knew how
## many people it had and how deep it ran and nothing at all about its shape —
## while every creature has carried `identity.parent_uids` since Phase 1 and
## `BreedingSystem` has filled it in on every conception. The parentage existed
## on the individuals and was discarded the moment it reached the record whose
## whole job is remembering them.
##
## Now that clans grow on their own, that record fills up in ordinary play, and
## this is the screen where a player finds out what they have actually built:
## which pairings took, whose line went nowhere, how many generations back the
## founder is, and who is left.
##
## LAYOUT: generations as rows, oldest at the top; a node per person; a line from
## each parent down to each child. Not a strict binary tree — two parents, and a
## founder pair recurs — so this is a layered graph drawing, and children are
## placed under the mean of their parents' positions to keep the lines short.
##
## THE DEAD ARE DRAWN. That is the point of a lineage: an ancestor who died is
## not deleted from the family, they are the reason the family exists. They are
## hollow rather than filled, and greyed rather than removed.

signal picked(uid: String)

const NODE_R := 7.0
const ROW_H := 62
const MIN_GAP := 34.0
const TOP := 22

const LIVING := Color(0.62, 0.92, 0.72)
const DEAD := Color(0.46, 0.50, 0.58)
const FOUNDER := Color(0.95, 0.85, 0.50)
const LINK := Color(0.34, 0.38, 0.46)
const LINK_LIVE := Color(0.45, 0.62, 0.55)

## uid -> { entry, pos }
var _nodes: Dictionary = {}
var _generations: int = 0
var _founder: String = ""
var _selected: String = ""
var _hovered: String = ""


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(420, 240)


## Takes `LineageRecordResource.descent` plus the record's founder uid.
func set_descent(descent: Dictionary, founder_uid: String = "") -> void:
	_nodes.clear()
	_founder = founder_uid
	_generations = 0
	if descent.is_empty():
		queue_redraw()
		return

	# Bucket by generation. Sorting each row by birth tick keeps siblings in the
	# order they arrived, which is the order a player watched them arrive in.
	var rows: Dictionary = {}
	for uid in descent:
		var entry: Dictionary = descent[uid]
		var generation := int(entry.get("generation", 0))
		if not rows.has(generation):
			rows[generation] = []
		(rows[generation] as Array).append(String(uid))
		_generations = maxi(_generations, generation)

	var widest := 0
	for generation in rows:
		var row: Array = rows[generation]
		row.sort_custom(func(a, b):
			return int(descent[a].get("born", 0)) < int(descent[b].get("born", 0)))
		widest = maxi(widest, row.size())

	var width := maxf(custom_minimum_size.x, float(widest) * MIN_GAP + 40.0)
	var ordered: Array = rows.keys()
	ordered.sort()
	for generation in ordered:
		var row: Array = rows[generation]
		var step := width / float(row.size() + 1)
		for i in row.size():
			var uid: String = row[i]
			_nodes[uid] = {
				"entry": descent[uid],
				"pos": Vector2(step * float(i + 1),
					TOP + float(generation) * ROW_H),
			}

	_settle_toward_parents()
	custom_minimum_size = Vector2(width, TOP + float(_generations + 1) * ROW_H)
	queue_redraw()


## Slide each child toward the midpoint of its parents, without letting siblings
## collide. Two passes is enough to take most of the crossing out of the lines
## and it keeps the layout stable between refreshes, which a force-directed pass
## would not.
func _settle_toward_parents() -> void:
	for _pass in 2:
		var by_row: Dictionary = {}
		for uid in _nodes:
			var generation := int((_nodes[uid]["entry"] as Dictionary).get("generation", 0))
			if not by_row.has(generation):
				by_row[generation] = []
			(by_row[generation] as Array).append(String(uid))

		for generation in by_row:
			var row: Array = by_row[generation]
			row.sort_custom(func(a, b):
				return float(_nodes[a]["pos"].x) < float(_nodes[b]["pos"].x))
			for uid in row:
				var parents: Array = (_nodes[uid]["entry"] as Dictionary).get("parents", [])
				var sum := 0.0
				var seen := 0
				for parent in parents:
					if _nodes.has(String(parent)):
						sum += float(_nodes[String(parent)]["pos"].x)
						seen += 1
				if seen > 0:
					var pos: Vector2 = _nodes[uid]["pos"]
					_nodes[uid]["pos"] = Vector2(
						lerpf(pos.x, sum / float(seen), 0.6), pos.y)
			# Push apart anything that ended up on top of something else.
			for i in range(1, row.size()):
				var left: Vector2 = _nodes[row[i - 1]]["pos"]
				var here: Vector2 = _nodes[row[i]]["pos"]
				if here.x - left.x < MIN_GAP:
					_nodes[row[i]]["pos"] = Vector2(left.x + MIN_GAP, here.y)


func select(uid: String) -> void:
	_selected = uid
	queue_redraw()


func selected() -> String:
	return _selected


func node_count() -> int:
	return _nodes.size()


func generations() -> int:
	return _generations + 1 if not _nodes.is_empty() else 0


## Lines that will actually be drawn — a parent outside the record (pruned, or a
## founder from before this line existed) has no node to draw from.
func link_count() -> int:
	var n := 0
	for uid in _nodes:
		for parent in (_nodes[uid]["entry"] as Dictionary).get("parents", []):
			if _nodes.has(String(parent)):
				n += 1
	return n


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		var was := _hovered
		_hovered = _at(event.position)
		if was != _hovered:
			queue_redraw()
	elif event is InputEventMouseButton and event.pressed \
			and event.button_index == MOUSE_BUTTON_LEFT:
		var hit := _at(event.position)
		if not hit.is_empty():
			select(hit)
			picked.emit(hit)


func _at(point: Vector2) -> String:
	for uid in _nodes:
		if point.distance_to(_nodes[uid]["pos"]) <= NODE_R + 7.0:
			return String(uid)
	return ""


func _draw() -> void:
	if _nodes.is_empty():
		draw_string(ThemeDB.fallback_font, Vector2(16, 40),
			"No bloodline yet — nobody has been born into this line.",
			HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.55, 0.60, 0.70))
		return

	var font := ThemeDB.fallback_font
	for generation in _generations + 1:
		var y := TOP + float(generation) * ROW_H
		draw_line(Vector2(0, y - 20.0), Vector2(size.x, y - 20.0),
			Color(0.18, 0.20, 0.26), 1.0)
		draw_string(font, Vector2(4, y - 24.0),
			"founders" if generation == 0 else "generation %d" % generation,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(0.42, 0.46, 0.54))

	for uid in _nodes:
		var node: Dictionary = _nodes[uid]
		var alive := int((node["entry"] as Dictionary).get("died", -1)) < 0
		for parent in (node["entry"] as Dictionary).get("parents", []):
			var key := String(parent)
			if not _nodes.has(key):
				continue
			_draw_link(_nodes[key]["pos"], node["pos"], alive)

	for uid in _nodes:
		_draw_person(font, String(uid), _nodes[uid])


## Down out of the parent, across, and down into the child — so two parents of
## the same child meet on a shared rail instead of crossing at an angle.
func _draw_link(from: Vector2, to: Vector2, child_alive: bool) -> void:
	var colour := LINK_LIVE if child_alive else LINK
	var lane := to.y - ROW_H * 0.42
	draw_line(from, Vector2(from.x, lane), colour, 1.0, true)
	draw_line(Vector2(from.x, lane), Vector2(to.x, lane), colour, 1.0, true)
	draw_line(Vector2(to.x, lane), to, colour, 1.0, true)


func _draw_person(font: Font, uid: String, node: Dictionary) -> void:
	var entry: Dictionary = node["entry"]
	var pos: Vector2 = node["pos"]
	var alive := int(entry.get("died", -1)) < 0
	var colour := FOUNDER if uid == _founder else (LIVING if alive else DEAD)

	if uid == _selected or uid == _hovered:
		draw_circle(pos, NODE_R + 5.0, Color(1, 1, 1, 0.14))

	if alive:
		draw_circle(pos, NODE_R, colour)
	else:
		# Hollow, not absent. An ancestor who died is the reason the rest exist.
		draw_arc(pos, NODE_R, 0.0, TAU, 22, colour, 1.6, true)

	var name := String(entry.get("name", ""))
	if name.is_empty():
		name = "unnamed"
	draw_string(font, pos + Vector2(-MIN_GAP * 0.5, NODE_R + 12.0), name,
		HORIZONTAL_ALIGNMENT_CENTER, MIN_GAP, 10,
		Color(colour.r, colour.g, colour.b, 0.9 if alive else 0.65))
