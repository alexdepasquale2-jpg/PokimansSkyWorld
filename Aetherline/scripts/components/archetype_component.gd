extends CreatureComponent
class_name ArchetypeComponent

## Tracks the creature's progress toward every archetype it could become, and
## records the one it did.
##
## Conditions are tested against the creature's own ExperienceComponent, not
## against global tallies. That matters for more than performance: a creature's
## archetype must be readable from the creature alone, so that an animal left
## behind on another world for nine years — or reloaded from a save into a
## fresh session — still knows what it became and why.

@export var state: ArchetypeStateResource

## How often to re-evaluate, in ticks. Crystallization is a slow, meaningful
## event — polling it every frame for every creature would be pure waste.
@export var evaluation_interval: int = 120

var _next_evaluation_tick: int = 0


func _on_setup() -> void:
	if state == null:
		state = ArchetypeStateResource.new()


# --- Evaluation ---------------------------------------------------------------

## Metrics the archetype conditions are tested against.
func _metrics() -> Dictionary:
	if creature == null or creature.experience == null:
		return {}
	return creature.experience.metrics()


func maybe_evaluate() -> void:
	if SimulationBudget.current_tick < _next_evaluation_tick:
		return
	_next_evaluation_tick = SimulationBudget.current_tick + evaluation_interval
	evaluate()


## Recompute progress for every archetype, crystallize what qualifies, and
## shatter what has failed. Safe to call directly from tests.
func evaluate() -> void:
	if creature == null or GenomeDB.archetypes.is_empty():
		return
	var metrics := _metrics()
	var uid: StringName = creature.identity.uid

	for archetype_id in GenomeDB.archetypes:
		var definition: ArchetypeDefinitionResource = GenomeDB.archetypes[archetype_id]

		if state.is_crystallized(archetype_id):
			if definition.shatter_progress(metrics) >= 1.0:
				_shatter(definition)
			continue

		var progress := definition.evaluate_progress(metrics)
		var previous := state.get_progress(archetype_id)
		if not is_equal_approx(progress, previous):
			var stage_changed := state.set_progress(archetype_id, progress)
			EventBus.archetype_progress_changed.emit(uid, StringName(archetype_id), progress)
			if stage_changed:
				EventBus.archetype_stage_changed.emit(
					uid, StringName(archetype_id), int(state.stage_of(archetype_id)))

		if progress >= 1.0 and definition.required_conditions_met(metrics) \
				and _prerequisites_met(definition, metrics):
			crystallize(definition)


## Non-experience gates: age, generation, required allele tags.
func _prerequisites_met(definition: ArchetypeDefinitionResource, _metrics_dict: Dictionary) -> bool:
	var pre := definition.prerequisites
	if pre.is_empty():
		return true
	if pre.has("min_age_days") and creature.stats.age_days < float(pre["min_age_days"]):
		return false
	if pre.has("min_generation") and creature.identity.generation < int(pre["min_generation"]):
		return false
	# Gate on EXPRESSED phenotype, not merely on carrying an allele. An Oracle
	# that only carries the aether gene silently is not an Oracle — the whole
	# point of a recessive gate is that carriers show nothing.
	if pre.has("requires_trait"):
		var minimum := float(pre.get("min_trait_value", 0.5))
		if creature.stats.trait_value(String(pre["requires_trait"])) < minimum:
			return false
	if pre.has("requires_tag"):
		var wanted := StringName(pre["requires_tag"])
		var found := false
		for locus_id in creature.genetics.genome.locus_ids():
			if creature.genetics.genome.has_allele_tag(locus_id, wanted):
				found = true
				break
		if not found:
			return false
	return true


# --- Crystallization ----------------------------------------------------------

func crystallize(definition: ArchetypeDefinitionResource) -> bool:
	# Exclusivity is what makes an archetype an identity rather than a buff:
	# one per group, and the group is already taken or it is not.
	var group := String(definition.exclusivity_group)
	if not group.is_empty() and not state.crystallized_in_group(group).is_empty():
		return false
	for conflict in definition.conflicts_with:
		if state.is_crystallized(conflict):
			return false

	var uid: StringName = creature.identity.uid
	var tick := SimulationBudget.current_tick
	state.crystallize(definition.id, group, tick, definition.granted_abilities)
	creature.stats.mark_dirty()

	# A crystallized archetype is permanently story-relevant, so it must stop
	# competing with anonymous wildlife for simulation budget.
	SimulationBudget.set_priority(uid, 1.0)

	EventBus.archetype_crystallized.emit(uid, definition.id, tick)

	var lineage := StoryDirector.get_lineage(creature.identity.lineage_id)
	if lineage != null:
		lineage.note_archetype(String(definition.id))
		lineage.add_event(tick, PlanetManager.active_planet_id, String(uid),
			"archetype", "%s became %s." % [
				creature.identity.display_name(), definition.display_name], 0.9)

	StoryDirector.fire_event({
		"kind": "archetype_crystallized_" + String(definition.id),
		# Never suppressed. The global per-kind cooldown exists to stop
		# situational beats repeating; becoming something is once in a
		# creature's life and must always be told.
		"cooldown_ticks": 0,
		"severity": 0.8,
		"uid": String(uid),
		"tags": definition.narrative_tags.map(func(t): return String(t)),
		"text": definition.crystallization_text if not definition.crystallization_text.is_empty()
			else "{name} has become {archetype}.",
	}, {
		"name": creature.identity.display_name(),
		"archetype": definition.display_name,
		"planet": PlanetManager.active_planet_id,
	})
	return true


func _shatter(definition: ArchetypeDefinitionResource) -> void:
	var uid: StringName = creature.identity.uid
	state.shatter(definition.id, definition.exclusivity_group, definition.granted_abilities)
	creature.stats.mark_dirty()
	EventBus.archetype_shattered.emit(uid, definition.id, SimulationBudget.current_tick)


# --- Applying to expression ---------------------------------------------------

## Permanent trait modifiers from crystallized archetypes. Applied last, after
## genetics and epigenetics, because becoming something is meant to override
## what you were born and raised as.
func apply_to(traits: Dictionary) -> Dictionary:
	var out := traits.duplicate()
	for archetype_id in state.active_archetypes():
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		if definition == null:
			continue
		for trait_key in definition.trait_modifiers:
			var mod: Dictionary = definition.trait_modifiers[trait_key]
			var current := float(out.get(String(trait_key), 0.0))
			current = (current + float(mod.get("add", 0.0))) * float(mod.get("mul", 1.0))
			out[String(trait_key)] = current
	return out


## Utility-AI weight multipliers contributed by crystallized archetypes.
func ai_bias() -> Dictionary:
	var bias: Dictionary = {}
	for archetype_id in state.active_archetypes():
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		if definition == null:
			continue
		for key in definition.ai_bias:
			bias[String(key)] = float(bias.get(String(key), 1.0)) * float(definition.ai_bias[key])
	return bias


func has_ability(ability_id) -> bool:
	return state.granted_abilities.has(String(ability_id))


# --- Readout ------------------------------------------------------------------

func describe() -> Array[String]:
	if GenomeDB.archetypes.is_empty():
		return ["  (no archetype catalog loaded — Phase 2)"]
	var lines: Array[String] = []
	for archetype_id in state.active_archetypes():
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		lines.append("  ** %s **" % (definition.display_name if definition != null else archetype_id))
	for archetype_id in state.progress:
		if state.is_crystallized(archetype_id):
			continue
		var p := state.get_progress(archetype_id)
		if p <= 0.0:
			continue
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		lines.append("  %-18s %3.0f%%  (%s)" % [
			definition.display_name if definition != null else archetype_id,
			p * 100.0,
			AetherTypes.enum_to_key(AetherTypes.ArchetypeStage, state.stage_of(archetype_id)).to_lower(),
		])
	for archetype_id in state.shattered:
		lines.append("  ~~ %s (shattered) ~~" % archetype_id)

	# What the nearest archetype is still waiting on. Without this the progress
	# number is a mystery, and "readable depth" means the player can see the
	# road, not just the odometer.
	var closest := _closest_candidate()
	if closest != null:
		var metrics := _metrics()
		lines.append("")
		lines.append("  nearest: %s — still needs" % closest.display_name)
		for requirement in closest.remaining_requirements(metrics).slice(0, 4):
			lines.append("    %-28s %6.0f / %.0f %s%s" % [
				requirement["metric"], requirement["have"], requirement["need"],
				requirement["comparator"],
				"  (required)" if requirement["required"] else ""])

	return lines if not lines.is_empty() else ["  (nothing stirring yet)"]


## The uncrystallized archetype this creature is furthest along toward.
func _closest_candidate() -> ArchetypeDefinitionResource:
	var best: ArchetypeDefinitionResource = null
	var best_progress := 0.0
	for archetype_id in state.progress:
		if state.is_crystallized(archetype_id):
			continue
		var value := state.get_progress(archetype_id)
		if value > best_progress:
			best_progress = value
			best = GenomeDB.get_archetype(archetype_id)
	return best


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {"state": state.to_dict() if state != null else {}}


func from_dict(d: Dictionary) -> void:
	var s: Dictionary = d.get("state", {})
	state = ArchetypeStateResource.from_dict(s) if not s.is_empty() \
		else ArchetypeStateResource.new()
