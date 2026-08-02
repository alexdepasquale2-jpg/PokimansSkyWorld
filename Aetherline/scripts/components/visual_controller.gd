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

const FX_SHADER := preload("res://shaders/creature_fx.gdshader")

## Node that actually draws. Kept separate from the component so the component
## can live in the same flat child list as every other component.
var canvas: Node2D = null
var _material: ShaderMaterial
var _flash_tween: Tween

var _base_color: Color = Color.WHITE
var _scale: float = 1.0
var _width: float = 1.0
var _outline: float = 0.0
var _fringe: float = 0.0
var _has_archetype: bool = false
var _limbs: int = 4
var _stability: float = 1.0
var _reach: float = 1.0
var _weapon: String = ""


func _on_setup() -> void:
	canvas = Node2D.new()
	canvas.name = "CreatureCanvas"
	canvas.draw.connect(_draw_creature)
	_material = ShaderMaterial.new()
	_material.shader = FX_SHADER
	canvas.material = _material
	creature.add_child(canvas)


## Per-hit flash, driven by a real tween rather than a manual per-frame
## decay — 0 -> full -> 0 in one short pulse.
func flash_hit(color: Color = Color.WHITE) -> void:
	if _material == null:
		return
	_material.set_shader_parameter("flash_color", Vector3(color.r, color.g, color.b))
	if _flash_tween != null and _flash_tween.is_valid():
		_flash_tween.kill()
	_flash_tween = canvas.create_tween()
	_flash_tween.tween_method(
		func(v): _material.set_shader_parameter("flash_amount", v), 0.85, 0.0, 0.25)
	if creature.audio != null:
		creature.audio.vocalize("hurt")


## Standing glow while a crystallized archetype is active.
func set_crystallized_glow(active: bool) -> void:
	if _material != null:
		_material.set_shader_parameter("glow_active", active)


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

	_limbs = int(round(clampf(float(t.get("limbs", 4.0)), 2.0, 8.0)))
	_stability = clampf(float(t.get("stability", 1.0)), 0.2, 2.0)
	_reach = clampf(float(t.get("reach", 1.0)), 0.4, 2.2)

	# Which natural weapon actually shows, read straight off the dominant
	# allele at the weapon locus.
	_weapon = ""
	if creature.genetics.genome.has_locus(&"comb_weapon"):
		var shown := PhenotypeResolver.dominant_allele_at(
			creature.genetics.genome, &"comb_weapon")
		if shown != null:
			for tag in shown.tags:
				if String(tag) in ["horns", "fangs", "talons"]:
					_weapon = String(tag)

	# Colour comes from PIGMENT, not aggression — the gene the player actually
	# breeds for recognisability, with temperament only tinting it. Saturated
	# on purpose: these should read as characters, not data points.
	var camouflage := clampf(float(t.get("camouflage", 0.0)), -0.5, 1.0)
	var display := clampf(float(t.get("display", 0.0)), 0.0, 1.2)
	var aggression := clampf(float(t.get("aggression", 0.5)), 0.0, 1.0)
	var hue := fposmod(0.36 - display * 0.42 + camouflage * 0.18, 1.0)
	_base_color = Color.from_hsv(hue,
		clampf(0.45 + display * 0.4 - camouflage * 0.2, 0.15, 0.95),
		clampf(0.90 - camouflage * 0.35, 0.35, 1.0))
	_base_color = _base_color.lerp(Color(0.85, 0.32, 0.28), aggression * 0.28)

	canvas.queue_redraw()


## Every creature is drawn from its own genes: body mass and posture set the
## silhouette, limb count sets the legs, the weapon gene sets what is on its
## face, pigment sets the colour. Two animals of the same species look alike;
## two of different species are distinguishable across the screen. That
## recognisability is the whole point — you should know your favourite animal
## on sight in a crowd of twelve.
func _draw_creature() -> void:
	var r := 11.0 * _scale
	var body := Vector2(r * clampf(_width, 0.55, 1.9), r)
	var dark := _base_color.darkened(0.45)

	# Shadow, so creatures sit on the ground instead of floating on it.
	canvas.draw_circle(Vector2(0, body.y * 0.72),
		body.x * 0.85, Color(0, 0, 0, 0.22))

	if _fringe > 0.0:
		canvas.draw_circle(Vector2.ZERO, r * (1.0 + 0.42 * _fringe),
			Color(0.94, 0.93, 0.88, 0.16 + 0.28 * _fringe))

	# Legs — actual count, so a hexapod reads as a hexapod.
	var legs := clampi(_limbs, 2, 8)
	for i in legs:
		var t := (float(i) / float(maxi(1, legs - 1))) - 0.5
		var foot := Vector2(t * body.x * 1.5, body.y * 0.95)
		canvas.draw_line(Vector2(t * body.x * 1.05, body.y * 0.35), foot, dark, 2.4)

	# Body: a rounded capsule wider than tall for a low-slung animal, taller
	# than wide for an upright one.
	var height := body.y * (1.55 - 0.45 * _stability)
	canvas.draw_circle(Vector2(0, -height * 0.05), body.x, _base_color)
	canvas.draw_circle(Vector2(0, -height * 0.42), body.x * 0.72, _base_color)

	# Head, offset forward by reach.
	var head := Vector2(body.x * 0.30 * _reach, -height * 0.62)
	canvas.draw_circle(head, body.x * 0.52, _base_color.lightened(0.08))

	# Natural weapon on the face — the Pokémon-ish read of "what is this thing".
	match _weapon:
		"horns":
			canvas.draw_line(head + Vector2(-body.x * 0.3, -body.x * 0.3),
				head + Vector2(-body.x * 0.62, -body.x * 0.95), dark, 2.6)
			canvas.draw_line(head + Vector2(body.x * 0.3, -body.x * 0.3),
				head + Vector2(body.x * 0.62, -body.x * 0.95), dark, 2.6)
		"fangs":
			canvas.draw_line(head + Vector2(-body.x * 0.18, body.x * 0.3),
				head + Vector2(-body.x * 0.1, body.x * 0.62), Color.WHITE, 2.0)
			canvas.draw_line(head + Vector2(body.x * 0.18, body.x * 0.3),
				head + Vector2(body.x * 0.1, body.x * 0.62), Color.WHITE, 2.0)
		"talons":
			for side in [-1.0, 1.0]:
				canvas.draw_line(Vector2(side * body.x * 0.8, body.y * 0.7),
					Vector2(side * body.x * 1.15, body.y * 1.0), Color(0.95, 0.95, 0.9), 1.8)

	# Eyes. Nothing sells "creature" like eyes.
	var eye := body.x * 0.15
	canvas.draw_circle(head + Vector2(-body.x * 0.2, -body.x * 0.05), eye, Color(0.08, 0.07, 0.1))
	canvas.draw_circle(head + Vector2(body.x * 0.2, -body.x * 0.05), eye, Color(0.08, 0.07, 0.1))

	if _outline > 0.0:
		canvas.draw_arc(Vector2(0, -height * 0.05), body.x + 1.0, 0.0, TAU, 28,
			Color(0.12, 0.11, 0.14), 1.0 + 2.6 * _outline, true)

	if _has_archetype:
		# Crystallization must be visible at a glance across a whole colony.
		canvas.draw_arc(Vector2.ZERO, body.x + 8.0, 0.0, TAU, 40,
			Color(1.0, 0.85, 0.4, 0.9), 2.0, true)


func describe() -> Array[String]:
	return ["  scale %.2f · width %.2f · outline %.2f · coat %.2f · hue %s%s" % [
		_scale, _width, _outline, _fringe, _base_color.to_html(false),
		" · crystallized" if _has_archetype else ""]]


func post_load() -> void:
	refresh()
	if creature.archetype != null:
		set_crystallized_glow(creature.archetype.state.has_any_archetype())
