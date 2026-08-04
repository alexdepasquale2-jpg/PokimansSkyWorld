extends Control
class_name PipRow

## A short countable ambition, drawn rather than written.
##
## The run is three evolution leaps long. "2/3 crossings" is a fraction a player
## has to read, parse and hold; three shapes, two of them filled, is a thing they
## already know at a glance and can feel getting closer. Small counts want pips —
## and this count is small ON PURPOSE, because the whole campaign is pitched at
## three, so the shape of the goal fits on screen without being a progress bar
## pretending to be precise.
##
## The next-up pip breathes. Not all of them: a row where everything moves says
## nothing, and the one thing worth pointing at is the one you are working on.

const PIP := 14
const GAP := 6

const FILLED := Color(0.95, 0.85, 0.50)
const NEXT := Color(0.65, 0.60, 0.40)
const EMPTY := Color(0.24, 0.26, 0.32)

var _total: int = 0
var _done: int = 0
var _pulse: float = 0.0


func _init(total: int = 3) -> void:
	_total = maxi(1, total)
	custom_minimum_size = Vector2(_total * PIP + (_total - 1) * GAP, PIP)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_progress(done: int, total: int = -1) -> void:
	if total > 0 and total != _total:
		_total = total
		custom_minimum_size = Vector2(_total * PIP + (_total - 1) * GAP, PIP)
	_done = clampi(done, 0, _total)
	queue_redraw()


func done() -> int:
	return _done


func total() -> int:
	return _total


func _process(delta: float) -> void:
	if _done >= _total:
		return
	_pulse += delta * 2.4
	queue_redraw()


func _draw() -> void:
	for i in _total:
		var centre := Vector2(i * (PIP + GAP) + PIP * 0.5, PIP * 0.5)
		var radius := PIP * 0.5 - 1.0
		if i < _done:
			draw_circle(centre, radius, FILLED)
		elif i == _done:
			# The one being worked toward. A ring rather than a disc, so "not yet"
			# is legible without colour alone carrying it.
			var beat := 0.55 + 0.45 * (0.5 + 0.5 * sin(_pulse))
			draw_arc(centre, radius, 0.0, TAU, 24,
				Color(NEXT.r, NEXT.g, NEXT.b, beat), 2.0, true)
		else:
			draw_arc(centre, radius, 0.0, TAU, 24, EMPTY, 1.5, true)
