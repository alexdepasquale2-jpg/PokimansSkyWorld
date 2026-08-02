extends CreatureComponent
class_name EpigeneticsComponent

## Owns the creature's EpigeneticProfileResource and applies it on top of the
## base genetic expression.
##
## This component is the reason the game has memory in its bodies. The genome
## says what the animal could be; this says what forty days in the ash wastes,
## two winters of short rations and one very bad night actually made of it.

## Days of exposure needed before a mark counts as another "episode" for
## reinforcement purposes. Without this, a creature standing in the cold gains
## a lifetime of hardening in an afternoon.
const EXPOSURE_EPISODE_DAYS: float = 1.0

## How heritable a mark can become through lived exposure alone. Deliberately
## well short of certain: life can predispose a bloodline, but only research
## should be able to make an acquired trait reliably heritable.
const BASE_HERITABILITY_CEILING: float = 0.6

## Raised by research (Phase 5). This is the intended route from "this animal
## was changed by its life" to "this bloodline is changed" — and it is a
## campaign-wide condition, hence static.
static var research_heritability_bonus: float = 0.0

@export var profile: EpigeneticProfileResource

## definition_id -> accumulated exposure days not yet converted to an episode.
var _exposure_accumulator: Dictionary = {}


func _on_setup() -> void:
	if profile == null:
		profile = EpigeneticProfileResource.new()
	# Planetary pressure is broadcast, not addressed — the climate system has
	# no idea which creatures are listening, which is the whole point.
	EventBus.environment_pressure_applied.connect(_on_environment_pressure)


func _exit_tree() -> void:
	if EventBus.environment_pressure_applied.is_connected(_on_environment_pressure):
		EventBus.environment_pressure_applied.disconnect(_on_environment_pressure)


# --- Genetic modulation of the epigenetic system ------------------------------
#
# The genome has opinions about how writable this animal is. Two genes govern
# it, pulling opposite ways:
#   epigenetic_plasticity  — how readily expression is rewritten at all
#   stress_resilience      — how much the world can do before it leaves a mark
#
# Both read from BASE genetic expression, never the resolved phenotype. That is
# deliberate: if plasticity read the phenotype, marks would modify the rate at
# which marks form, and a labile animal would run away with itself.

## Multiplier on how fast marks form and deepen for this creature.
func formation_multiplier() -> float:
	if creature == null or creature.genetics == null:
		return 1.0
	var base: Dictionary = creature.genetics.express_base()
	var plasticity := maxf(0.05, float(base.get("epigenetic_plasticity", 1.0)))
	var resilience := maxf(0.2, float(base.get("stress_resilience", 1.0)))
	return clampf(plasticity / resilience, 0.1, 4.0)


## The most heritable a mark on this creature can become through lived
## experience. Research raises the ceiling campaign-wide; nothing raises it
## to certainty.
func heritability_ceiling() -> float:
	return clampf(BASE_HERITABILITY_CEILING + research_heritability_bonus, 0.0, 0.95)


# --- Acquiring marks ----------------------------------------------------------

## Apply (or reinforce) a mark by catalog id. Returns the live mark, or null if
## the definition is unknown.
func apply_mark(definition_id, amount: float = 0.15,
		force_distinct: bool = false) -> EpigeneticMarkResource:
	var template := GenomeDB.instantiate_mark(definition_id)
	if template == null:
		push_warning("EpigeneticsComponent: unknown mark '%s'" % definition_id)
		return null

	var uid: StringName = creature.identity.uid if creature != null else &""
	template.origin_planet_id = PlanetManager.active_planet_id
	template.origin_tick = SimulationBudget.current_tick

	var existed := profile.find_by_definition(StringName(String(definition_id))) != null
	var mark := profile.apply(
		template, amount * formation_multiplier(), force_distinct, heritability_ceiling())
	_invalidate()

	if existed and not force_distinct:
		EventBus.epigenetic_mark_reinforced.emit(uid, mark.definition_id, mark.strength)
	else:
		EventBus.epigenetic_mark_gained.emit(uid, mark.definition_id, int(mark.source))
	return mark


## Accept an already-built mark — used at conception for inherited marks, where
## depth and attenuation have already been decided by the parent's profile.
func adopt_inherited_mark(mark: EpigeneticMarkResource) -> void:
	var adopted := profile.apply(mark, mark.strength, true)
	_invalidate()
	var uid: StringName = creature.identity.uid if creature != null else &""
	EventBus.epigenetic_mark_inherited.emit(uid, adopted.definition_id, adopted.inherited_depth)


# --- Ongoing pressure ---------------------------------------------------------

## Ambient planetary pressure. `pressures` is { definition_id -> intensity 0..1 }
## and `days` is elapsed in-game days — which lets a dormant creature on another
## world integrate a decade of pressure in one call instead of ten thousand.
func _on_environment_pressure(planet_id: String, pressures: Dictionary, days: float) -> void:
	if creature == null or creature.home_planet_id != planet_id:
		return
	apply_pressures(pressures, days)


func apply_pressures(pressures: Dictionary, days: float) -> void:
	for definition_id in pressures:
		var intensity := float(pressures[definition_id])
		if intensity <= 0.0:
			continue
		var key := String(definition_id)
		var accumulated := float(_exposure_accumulator.get(key, 0.0)) + days * intensity
		# Only whole episodes count, so a mark's exposure_count stays a
		# meaningful "how many times has this happened to you" number rather
		# than a frame counter.
		var episodes := int(accumulated / EXPOSURE_EPISODE_DAYS)
		_exposure_accumulator[key] = accumulated - float(episodes) * EXPOSURE_EPISODE_DAYS
		for i in mini(episodes, 20):  # cap per call so a long absence cannot spike
			apply_mark(key, 0.08 * intensity)


## Passive fade. Driven by the day tick for active creatures, and integrated in
## one step for dormant ones.
func decay(days: float) -> void:
	var before := profile.marks.size()
	profile.decay_all(days)
	if profile.marks.size() != before:
		_invalidate()


# --- Applying to expression ---------------------------------------------------

## Overlay the profile onto a base trait dictionary. Returns a NEW dictionary;
## the caller's base expression is never mutated, because Genetics caches it.
func apply_to(base_traits: Dictionary) -> Dictionary:
	var out := base_traits.duplicate()

	for entry in profile.marks:
		var mark: EpigeneticMarkResource = entry
		var trait_key := String(mark.target_trait)
		if trait_key.is_empty():
			continue  # locus-targeted marks are resolved inside Genetics (Phase 1)
		var current := float(out.get(trait_key, 0.0))
		var magnitude := mark.effective_magnitude()

		match mark.effect:
			AetherTypes.EpiEffect.ADD:
				out[trait_key] = current + magnitude
			AetherTypes.EpiEffect.MULTIPLY:
				out[trait_key] = current * (1.0 + magnitude)
			AetherTypes.EpiEffect.SILENCE:
				# Pull toward the species baseline, not toward zero: a silenced
				# trait becomes unremarkable, not absent.
				var baseline := GenomeDB.trait_baseline(trait_key)
				out[trait_key] = lerpf(current, baseline, clampf(magnitude, 0.0, 1.0))
			AetherTypes.EpiEffect.ENHANCE:
				# Push away from baseline — makes an already-extreme animal
				# more extreme, which is how prodigies and monsters happen.
				var base := GenomeDB.trait_baseline(trait_key)
				out[trait_key] = base + (current - base) * (1.0 + magnitude)
			AetherTypes.EpiEffect.UNLOCK:
				pass  # ability gating, handled by StatsComponent in Phase 4

	return out


func _invalidate() -> void:
	if creature != null and creature.stats != null:
		creature.stats.mark_dirty()


# --- Readout ------------------------------------------------------------------

func describe() -> Array[String]:
	if profile == null or profile.marks.is_empty():
		return ["  (no epigenetic marks — an unwritten life)"]
	var lines: Array[String] = []
	for line in profile.summarize():
		lines.append("  " + line)
	return lines


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"profile": profile.to_dict() if profile != null else {},
		"exposure": _exposure_accumulator.duplicate(),
	}


func from_dict(d: Dictionary) -> void:
	var p: Dictionary = d.get("profile", {})
	profile = EpigeneticProfileResource.from_dict(p) if not p.is_empty() \
		else EpigeneticProfileResource.new()
	_exposure_accumulator = d.get("exposure", {}).duplicate()
