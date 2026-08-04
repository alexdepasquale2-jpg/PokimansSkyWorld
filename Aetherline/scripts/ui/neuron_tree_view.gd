extends Control
class_name NeuronTreeView

## The neuronal tree, drawn as a tree.
##
## WHAT THIS REPLACES. The Understandings screen listed 24 neurons in an
## `ItemList` with unicode marks and monospace padding — `● Precision Grip   12`
## — under `── Perception ──` separators. Everything the catalog actually says
## about SHAPE was thrown away: four branches, four tiers, and a real graph of
## prerequisites. A player could see what each thing cost and not see that buying
## Listening is what opens Scent Memory and Night Eyes, or that the branch they
## have been feeding runs three deep and the one they have ignored runs four.
##
## Planning is the only strategic decision this game asks for. You cannot plan
## against a list.
##
## LAYOUT: a column per branch, one understanding per row, indented by tier, with
## an elbow drawn from each prerequisite down to what it opens. Indentation gives
## depth at a glance and the elbows give the actual dependencies — chosen over a
## free-floating node graph because at 200px of column width a graph would need
## the names hidden behind hover, and a screen you have to interrogate is the
## thing being fixed.
##
## COLOUR CARRIES STATE and nothing else carries it, so the legend is four
## colours long: held, provisional, out of reach, and lost. Affordability is a
## ring, not a fifth colour — it changes minute to minute and colour should not.

signal picked(neuron_id: String)

const COLUMN_W := 196
const ROW_H := 26
const INDENT := 16
const DOT := 5.0
const HEADER_H := 26
const NAME_SIZE := 11

const HELD := Color(0.55, 0.93, 0.62)
const PROVISIONAL := Color(1.0, 0.84, 0.40)
const LOST := Color(0.86, 0.44, 0.44)
const OPEN := Color(0.88, 0.91, 0.96)
const SHUT := Color(0.40, 0.43, 0.50)
const EDGE := Color(0.32, 0.36, 0.44)
const EDGE_LIVE := Color(0.55, 0.62, 0.74)

const BRANCH_COLOURS := {
	"perception": Color(0.45, 0.72, 1.0),
	"intelligence": Color(1.0, 0.78, 0.42),
	"communication": Color(0.62, 0.92, 0.60),
	"motricity": Color(0.92, 0.55, 0.78),
}

## id -> { row: Dictionary, pos: Vector2, branch: String }
var _nodes: Dictionary = {}
var _branches: Array[String] = []
var _selected: String = ""
var _hovered: String = ""
var _pulse: float = 0.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	custom_minimum_size = Vector2(COLUMN_W * 4, 320)


## Takes `NeuronalTree.survey()` verbatim.
func set_survey(rows: Array) -> void:
	_nodes.clear()
	_branches.clear()

	var by_branch: Dictionary = {}
	for entry in rows:
		var branch := String(entry.get("branch", ""))
		if not by_branch.has(branch):
			by_branch[branch] = []
			_branches.append(branch)
		(by_branch[branch] as Array).append(entry)

	var tallest := 0
	for i in _branches.size():
		var branch: String = _branches[i]
		var list: Array = by_branch[branch]
		# Tier first so a column reads top-to-bottom as "what came before what",
		# then cost so siblings are cheapest-first — the same order the
		# generational boundary keeps them in when a clan is too thin to hold
		# them all. The screen and the rule agree about which is the ambitious one.
		list.sort_custom(func(a, b):
			if int(a["tier"]) != int(b["tier"]):
				return int(a["tier"]) < int(b["tier"])
			return float(a["cost"]) < float(b["cost"]))
		for j in list.size():
			var entry: Dictionary = list[j]
			_nodes[String(entry["id"])] = {
				"row": entry,
				"branch": branch,
				"pos": Vector2(
					i * COLUMN_W + 14 + int(entry["tier"]) * INDENT,
					HEADER_H + j * ROW_H + ROW_H * 0.5),
			}
		tallest = maxi(tallest, list.size())

	custom_minimum_size = Vector2(
		maxi(1, _branches.size()) * COLUMN_W, HEADER_H + tallest * ROW_H + 10)
	queue_redraw()


func select(neuron_id: String) -> void:
	_selected = neuron_id
	queue_redraw()


func selected() -> String:
	return _selected


## First thing worth pointing at: something affordable if there is one, else
## anything at all, so the detail pane is never empty on open.
func select_first_interesting() -> String:
	var fallback := ""
	for id in _nodes:
		var row: Dictionary = _nodes[id]["row"]
		if fallback.is_empty():
			fallback = String(id)
		if bool(row.get("affordable", false)):
			select(String(id))
			return _selected
	select(fallback)
	return _selected


func node_count() -> int:
	return _nodes.size()


func edge_count() -> int:
	var n := 0
	for id in _nodes:
		for prerequisite in (_nodes[id]["row"] as Dictionary).get("prerequisites", []):
			if _nodes.has(String(prerequisite)):
				n += 1
	return n


func position_of(neuron_id: String) -> Vector2:
	return _nodes[neuron_id]["pos"] if _nodes.has(neuron_id) else Vector2.ZERO


# --- Input -----------------------------------------------------------------------

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


## Hit-tested against the whole ROW, not the dot. A five-pixel disc is not a
## click target, and the name beside it is what the player is actually aiming at.
func _at(point: Vector2) -> String:
	for id in _nodes:
		var pos: Vector2 = _nodes[id]["pos"]
		var column := int(pos.x / COLUMN_W)
		var box := Rect2(column * COLUMN_W + 4, pos.y - ROW_H * 0.5,
			COLUMN_W - 8, ROW_H)
		if box.has_point(point):
			return String(id)
	return ""


func _process(delta: float) -> void:
	# Only what the clan could take right now breathes, on the same principle as
	# the HUD's vitals: if everything moves, motion has stopped meaning anything.
	_pulse += delta * 2.2
	queue_redraw()


# --- Drawing ---------------------------------------------------------------------

func _draw() -> void:
	var font := ThemeDB.fallback_font
	for i in _branches.size():
		var branch: String = _branches[i]
		var tint: Color = BRANCH_COLOURS.get(branch, Color.WHITE)
		draw_string(font, Vector2(i * COLUMN_W + 12, 16),
			branch.capitalize(), HORIZONTAL_ALIGNMENT_LEFT, -1, 12,
			Color(tint.r, tint.g, tint.b, 0.85))
		if i > 0:
			draw_line(Vector2(i * COLUMN_W, HEADER_H - 6),
				Vector2(i * COLUMN_W, size.y - 4), Color(0.20, 0.23, 0.29), 1.0)

	# Edges under nodes, so a dependency never occludes the thing it points at.
	for id in _nodes:
		var node: Dictionary = _nodes[id]
		var row: Dictionary = node["row"]
		for prerequisite in row.get("prerequisites", []):
			var key := String(prerequisite)
			if not _nodes.has(key):
				continue
			_draw_elbow(_nodes[key]["pos"], node["pos"],
				String((_nodes[key]["row"] as Dictionary)["state"]) == "locked")

	for id in _nodes:
		_draw_node(font, String(id), _nodes[id])


## An elbow rather than a straight line: down the parent's indent, then across.
## Straight diagonals across a column of 11px text turn into hatching.
##
## CROSS-BRANCH LINKS ARE DRAWN DIFFERENTLY, and rendering the screen is what
## made that necessary. A few understandings depend on something in another
## branch, and running the same solid elbow to them drew a horizontal rule
## straight through every row in between — the tree looked struck out. Those now
## run faint, and along the gap between rows rather than through one.
func _draw_elbow(from: Vector2, to: Vector2, satisfied: bool) -> void:
	var colour := EDGE_LIVE if satisfied else EDGE
	var same_column := int(from.x / COLUMN_W) == int(to.x / COLUMN_W)
	if same_column:
		var knee := Vector2(from.x, to.y)
		draw_line(from, knee, colour, 1.0, true)
		draw_line(knee, to, colour, 1.0, true)
		return

	# Faint, and along the seam above the target row, so it reads as "this comes
	# from somewhere else" without competing with the branch it crosses.
	var faint := Color(colour.r, colour.g, colour.b, 0.28)
	var lane := to.y - ROW_H * 0.5 + 2.0
	draw_line(from, Vector2(from.x, lane), faint, 1.0, true)
	draw_line(Vector2(from.x, lane), Vector2(to.x, lane), faint, 1.0, true)
	draw_line(Vector2(to.x, lane), to, faint, 1.0, true)


func _draw_node(font: Font, id: String, node: Dictionary) -> void:
	var row: Dictionary = node["row"]
	var pos: Vector2 = node["pos"]
	var state := String(row["state"])
	var colour := _state_colour(state)

	if id == _selected or id == _hovered:
		var column := int(pos.x / COLUMN_W)
		draw_rect(Rect2(column * COLUMN_W + 4, pos.y - ROW_H * 0.5,
			COLUMN_W - 8, ROW_H),
			Color(1, 1, 1, 0.10 if id == _hovered and id != _selected else 0.16))

	match state:
		"locked":
			draw_circle(pos, DOT, colour)
		"pending":
			# Provisional: a filled dot inside an open ring. It is yours and it
			# is not yours, and that is the entire mechanic.
			draw_circle(pos, DOT * 0.55, colour)
			draw_arc(pos, DOT + 1.5, 0.0, TAU, 20, colour, 1.2, true)
		"forgotten":
			draw_line(pos + Vector2(-DOT, -DOT), pos + Vector2(DOT, DOT), colour, 1.6, true)
			draw_line(pos + Vector2(-DOT, DOT), pos + Vector2(DOT, -DOT), colour, 1.6, true)
		_:
			draw_arc(pos, DOT, 0.0, TAU, 20, colour, 1.4, true)

	# Affordable right now: a halo, not a colour. Affordability changes minute to
	# minute and colour is carrying state, which does not.
	if bool(row.get("affordable", false)):
		var beat := 0.35 + 0.35 * (0.5 + 0.5 * sin(_pulse))
		draw_arc(pos, DOT + 4.0, 0.0, TAU, 24,
			Color(colour.r, colour.g, colour.b, beat), 1.6, true)

	var text_colour := colour if state != "available" else (
		OPEN if bool(row.get("affordable", false)) else SHUT)
	draw_string(font, pos + Vector2(DOT + 8.0, 4.0), String(row["name"]),
		HORIZONTAL_ALIGNMENT_LEFT, COLUMN_W - 70, NAME_SIZE, text_colour)

	# Cost only where it is a live question. Printing it against something
	# already held is noise on 24 rows.
	if state == "available":
		draw_string(font, Vector2(int(pos.x / COLUMN_W) * COLUMN_W + COLUMN_W - 34,
			pos.y + 4.0), str(int(row["cost"])), HORIZONTAL_ALIGNMENT_RIGHT, 28,
			NAME_SIZE, Color(text_colour.r, text_colour.g, text_colour.b, 0.75))


static func _state_colour(state: String) -> Color:
	match state:
		"locked": return HELD
		"pending": return PROVISIONAL
		"forgotten": return LOST
		"available": return OPEN
		_: return SHUT
