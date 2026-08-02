extends CreatureComponent
class_name VisualController

## Renders the creature as a direct read of its phenotype.
##
## PHASE SCOPE: Phase 6 owns real art. What matters now is establishing the
## principle the project actually rides on — "genetics and archetypes must be
## visually readable". Everything drawn here is derived from a trait, nothing
## is decorative:
##     size        -> silhouette scale
##     mass        -> body width
##     armor       -> outline thickness
##     insulation  -> coat fringe
##     aggression  -> hue (cold blue to hot red)
##     archetype   -> crystallization ring
## Swapping in sprites later means replacing _draw, not rewiring the data path.

## Node that actually draws. Kept separate from the component so the component
## can live in the same flat child list as every other component.
var canvas: Node2D = null

var _base_color: Color = Color.WHITE
var _scale: float = 1.0
var _width: float = 1.0
var _outline: float = 0.0
var _fringe: float = 0.0
var _has_archetype: bool = false


func _on_setup() -> void:
	canvas = Node2D.new()
	canvas.name = "CreatureCanvas"
	canvas.draw.connect(_draw_creature)
	creature.add_child(canvas)


## Recompute the visual read from the current phenotype. Called on spawn, after
## load, and whenever something changes the creature meaningfully.
func refresh() -> void:
	if creature == null or canvas == null:
		return
	var t: Dictionary = creature.stats.phenotype()

	_scale = clampf(float(t.get("size", 1.0)), 0.25, 3.5)
	_width = clampf(float(t.get("mass", 1.0)), 0.2, 3.0)
	_outline = clampf(float(t.get("armor", 0.0)), 0.0, 1.5)
	_fringe = clampf(float(t.get("insulation", 0.0)), 0.0, 1.0)
	_has_archetype = creature.archetype != null and creature.archetype.state.has_any_archetype()

	var aggression := clampf(float(t.get("aggression", 0.5)), 0.0, 1.0)
	_base_color = Color(0.35, 0.55, 0.75).lerp(Color(0.8, 0.3, 0.25), aggression)

	canvas.queue_redraw()


func _draw_creature() -> void:
	var body_radius := 12.0 * _scale
	var body := Vector2(body_radius * _width, body_radius)

	if _fringe > 0.0:
		# Coat reads as a soft halo — thicker pelage, wider halo.
		canvas.draw_circle(Vector2.ZERO, body_radius * (1.0 + 0.35 * _fringe),
			Color(0.9, 0.9, 0.85, 0.18 + 0.25 * _fringe))

	canvas.draw_circle(Vector2.ZERO, body.x, _base_color)

	if _outline > 0.0:
		canvas.draw_arc(Vector2.ZERO, body.x + 1.0, 0.0, TAU, 32,
			Color(0.15, 0.15, 0.18), 1.0 + 2.5 * _outline, true)

	if _has_archetype:
		# Crystallization must be visible at a glance across a whole colony.
		canvas.draw_arc(Vector2.ZERO, body.x + 6.0, 0.0, TAU, 40,
			Color(1.0, 0.85, 0.4, 0.9), 2.0, true)


func describe() -> Array[String]:
	return ["  scale %.2f · width %.2f · outline %.2f · coat %.2f · hue %s%s" % [
		_scale, _width, _outline, _fringe, _base_color.to_html(false),
		" · crystallized" if _has_archetype else ""]]


func post_load() -> void:
	refresh()
