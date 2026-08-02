extends RefCounted
class_name ArchetypeSelfTest

## Phase 2 validation: a creature that repeatedly protects others progresses
## toward Guardian, crystallizes, and the StoryDirector says something true and
## specific about it.
##
## That sentence is the Phase 2 deliverable verbatim, so the headline test
## (`_test_guardian_scenario`) runs it exactly as written rather than testing
## the pieces and hoping they compose.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()

## Narrative output produced during the run, for the harness to print. This is
## the part a human should actually read.
var chronicle: Array[String] = []


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	chronicle.clear()
	_rng.seed = 20260802

	_test_catalog()
	_test_experience_log(parent)
	_test_condition_eval()
	_test_guardian_scenario(parent)
	_test_exclusivity(parent)
	_test_shattering(parent)
	_test_prerequisites(parent)
	_test_story_templates(parent)
	_test_persistence(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Catalog ------------------------------------------------------------------

func _test_catalog() -> void:
	_check("catalog: 8-12 archetypes defined",
		GenomeDB.archetypes.size() >= 8 and GenomeDB.archetypes.size() <= 12)
	_check("catalog: archetype catalog cross-references cleanly",
		GenomeDB.validate_catalog().is_empty())
	_check("catalog: story templates loaded", StoryDirector.templates.size() >= 6)

	for required in ["arch_guardian", "arch_wanderer", "arch_progenitor",
			"arch_apex", "arch_broken", "arch_oracle"]:
		_check("catalog: %s defined" % required, GenomeDB.get_archetype(required) != null)

	# Every archetype must be reachable and describable, or it is dead content.
	var problems: Array[String] = []
	for archetype_id in GenomeDB.archetypes:
		var definition: ArchetypeDefinitionResource = GenomeDB.archetypes[archetype_id]
		if definition.crystallization_text.is_empty():
			problems.append("%s has no crystallization text" % archetype_id)
		if definition.granted_abilities.is_empty():
			problems.append("%s grants nothing" % archetype_id)
		if definition.trait_modifiers.is_empty() and definition.ai_bias.is_empty():
			problems.append("%s changes nothing about the creature" % archetype_id)
		for condition in definition.conditions:
			if not condition.has("metric") or not condition.has("threshold"):
				problems.append("%s has a malformed condition" % archetype_id)
			# Age is a gate, never an achievement. As a weighted condition it
			# would give every elderly animal phantom progress toward every
			# archetype, which makes the progress number meaningless.
			if String(condition.get("metric", "")) == "age_days":
				problems.append("%s scores age_days as progress; age belongs in prerequisites"
					% archetype_id)
	_check("catalog: every archetype is complete and consequential", problems.is_empty())
	for problem in problems:
		_lines.append("         " + problem)


# --- Experience log -----------------------------------------------------------

func _test_experience_log(parent: Node) -> void:
	var creature := _spawn(parent)
	var log_component := creature.experience

	var heard := {"count": 0}
	var listener := func(_uid, _kind, _amount, _payload): heard["count"] += 1
	EventBus.experience_logged.connect(listener)

	for i in 5:
		log_component.log_event("protect_ally", 1.0, {"ally": "someone"})
	log_component.log_event("damage_taken", 12.5)
	EventBus.experience_logged.disconnect(listener)

	_check("experience: counters accumulate", log_component.count("protect_ally") == 5.0)
	_check("experience: non-integer amounts accumulate",
		is_equal_approx(log_component.count("damage_taken"), 12.5))
	_check("experience: unrecorded metrics read zero", log_component.count("never") == 0.0)
	_check("experience: every entry announced on the bus", int(heard["count"]) == 6)
	_check("experience: first occurrence timestamped",
		log_component.when_first("protect_ally") >= 0)
	_check("experience: episodes retained", log_component.recent("protect_ally").size() == 5)

	# Extremes keep the high-water mark, not the latest value.
	log_component.record_extreme("coldest_endured", 30.0)
	log_component.record_extreme("coldest_endured", 12.0)
	_check("experience: extremes keep the high-water mark",
		is_equal_approx(log_component.extreme("coldest_endured"), 30.0))
	log_component.record_extreme("coldest_endured", 48.0)
	_check("experience: extremes update when beaten",
		is_equal_approx(log_component.extreme("coldest_endured"), 48.0))

	# The episode log is bounded; the counters it feeds are not.
	for i in ExperienceComponent.EPISODE_CAP + 60:
		log_component.log_event("noise")
	_check("experience: episode log is capped",
		log_component.episodes.size() == ExperienceComponent.EPISODE_CAP)
	_check("experience: counters outlive pruned episodes",
		log_component.count("noise") == float(ExperienceComponent.EPISODE_CAP + 60))

	var metrics := log_component.metrics()
	_check("experience: metrics merge counters and extremes",
		metrics.has("protect_ally") and metrics.has("coldest_endured"))
	_check("experience: metrics include facts from other components",
		metrics.has("age_days") and metrics.has("generation"))

	var defining := log_component.defining_experiences(2)
	_check("experience: defining experiences are ranked by magnitude",
		defining.size() == 2 and String(defining[0]["kind"]) == "noise")

	creature.free()


# --- Condition evaluation -----------------------------------------------------

func _test_condition_eval() -> void:
	var metrics := {"protect_ally": 12.0, "kill": 0.0}

	_check("conditions: '>=' gives partial credit",
		is_equal_approx(ConditionEval.fraction(
			{"metric": "protect_ally", "comparator": ">=", "threshold": 24.0}, metrics), 0.5))
	_check("conditions: '>=' caps at fully met",
		is_equal_approx(ConditionEval.fraction(
			{"metric": "protect_ally", "comparator": ">=", "threshold": 6.0}, metrics), 1.0))
	_check("conditions: '<=' is pass/fail",
		ConditionEval.met({"metric": "kill", "comparator": "<=", "threshold": 3.0}, metrics))
	_check("conditions: '<=' fails when exceeded",
		not ConditionEval.met(
			{"metric": "protect_ally", "comparator": "<=", "threshold": 3.0}, metrics))
	_check("conditions: missing metrics read as zero",
		ConditionEval.met({"metric": "absent", "comparator": "<=", "threshold": 1.0}, metrics))

	var conditions := [
		{"metric": "protect_ally", "comparator": ">=", "threshold": 24.0, "weight": 3.0, "required": true},
		{"metric": "kill", "comparator": "<=", "threshold": 3.0, "weight": 1.0},
	]
	_check("conditions: weighted progress is weighted",
		is_equal_approx(ConditionEval.progress(conditions, metrics), (3.0 * 0.5 + 1.0) / 4.0))
	_check("conditions: required gating blocks on the unmet one",
		not ConditionEval.required_met(conditions, metrics))
	_check("conditions: unmet list surfaces the gap",
		ConditionEval.unmet(conditions, metrics).size() == 1)


# --- THE PHASE 2 DELIVERABLE --------------------------------------------------

func _test_guardian_scenario(parent: Node) -> void:
	# "A creature that repeatedly protects others begins progressing toward
	#  Guardian. When it crystallizes, the StoryDirector fires a meaningful
	#  event about it."
	var vess := _spawn(parent, "Vess")
	vess.stats.age(45.0)

	var events: Array = []
	var listener := func(event): events.append(event)
	EventBus.story_event_fired.connect(listener)
	var crystallizations: Array = []
	var crystal_listener := func(uid, archetype_id, tick):
		crystallizations.append({"uid": uid, "archetype": archetype_id, "tick": tick})
	EventBus.archetype_crystallized.connect(crystal_listener)

	# It starts as nothing in particular.
	vess.archetype.evaluate()
	_check("guardian: starts with no archetype", not vess.archetype.state.has_any_archetype())
	_check("guardian: starts at zero progress",
		is_zero_approx(vess.archetype.state.get_progress(&"arch_guardian")))

	# It begins doing the thing.
	var progress_trace: Array[float] = []
	for episode in 30:
		vess.experience.log_event("protect_ally")
		vess.experience.log_event("damage_absorbed_for_ally", 6.0)
		vess.archetype.evaluate()
		# Evaluate the story layer as it goes, not just at the end — the point
		# is that the foreshadowing beat arrives BEFORE the crystallization,
		# which is only observable if the layer is polled while it happens.
		if episode % 5 == 0:
			StoryDirector.evaluate_creature(vess)
		progress_trace.append(vess.archetype.state.get_progress(&"arch_guardian"))

	# Progress must rise monotonically, not jump at the end.
	var monotonic := true
	for i in range(1, progress_trace.size()):
		if progress_trace[i] < progress_trace[i - 1] - 0.0001:
			monotonic = false
	_check("guardian: progress rises steadily as it protects", monotonic)
	_check("guardian: progress was visible before crystallizing",
		progress_trace[10] > 0.2 and progress_trace[10] < 1.0)
	_check("guardian: reached crystallization",
		vess.archetype.state.is_crystallized(&"arch_guardian"))

	# Crystallization must have consequences, not just a label.
	_check("guardian: abilities granted", vess.archetype.has_ability(&"ability_intercept"))
	_check("guardian: AI is biased toward protecting",
		float(vess.archetype.ai_bias().get("protect", 1.0)) > 1.5)
	var without := vess.stats.lived_traits()
	var with_archetype := vess.stats.phenotype()
	_check("guardian: phenotype changed by the archetype",
		float(with_archetype.get("armor", 0.0)) > float(without.get("armor", 0.0)))
	_check("guardian: crystallization announced on the bus", crystallizations.size() == 1)
	_check("guardian: simulation priority raised for a story-relevant creature",
		SimulationBudget.has_creature(vess.identity.uid))

	# And the StoryDirector must have said something about it, by name.
	var named_events := events.filter(
		func(e): return String(e.get("text", "")).contains("Vess"))
	_check("guardian: a story event fired naming the creature", not named_events.is_empty())

	# The lineage must remember.
	var lineage := StoryDirector.get_lineage(vess.identity.lineage_id)
	_check("guardian: lineage recorded the archetype",
		lineage != null and int(lineage.archetype_history.get("arch_guardian", 0)) == 1)
	_check("guardian: lineage recorded a notable event",
		lineage != null and lineage.notable_events.any(
			func(e): return String(e["kind"]) == "archetype"))

	# Now the story layer's own templates, reading state rather than being told.
	StoryDirector.evaluate_creature(vess)
	EventBus.story_event_fired.disconnect(listener)
	EventBus.archetype_crystallized.disconnect(crystal_listener)

	_check("guardian: history narration is specific",
		StoryDirector.narrate_history(vess).contains("between the herd and the dark"))

	for event in events:
		chronicle.append("  · " + String(event.get("text", "")))
	chronicle.append("  · " + StoryDirector.narrate_history(vess))

	vess.free()


# --- Exclusivity --------------------------------------------------------------

func _test_exclusivity(parent: Node) -> void:
	var creature := _spawn(parent)
	creature.stats.age(90.0)

	# Qualify for Guardian AND Wanderer, which conflict.
	for i in 30:
		creature.experience.log_event("protect_ally")
		creature.experience.log_event("damage_absorbed_for_ally", 6.0)
	creature.experience.log_event("planets_visited", 8.0)
	creature.experience.log_event("distance_travelled", 60000.0)
	creature.experience.log_event("biomes_entered", 20.0)
	creature.archetype.evaluate()

	var crystallized := creature.archetype.state.active_archetypes()
	_check("exclusivity: only one core archetype crystallizes", crystallized.size() == 1)
	_check("exclusivity: conflicting archetypes cannot both land",
		not (creature.archetype.state.is_crystallized(&"arch_guardian")
			and creature.archetype.state.is_crystallized(&"arch_wanderer")))

	# A different exclusivity group may co-exist: a Guardian can also be Broken.
	for i in 12:
		creature.experience.log_event("trauma_events")
	for i in 12:
		creature.experience.log_event("combat_loss")
	creature.experience.log_event("isolation_days", 40.0)
	creature.archetype.evaluate()
	_check("exclusivity: a separate group can crystallize alongside",
		creature.archetype.state.is_crystallized(&"arch_broken"))
	_check("exclusivity: the core archetype is untouched by the second group",
		creature.archetype.state.active_archetypes().size() == 2)

	chronicle.append("  · %s" % StoryDirector.narrate_history(creature))
	creature.free()


# --- Shattering ---------------------------------------------------------------

func _test_shattering(parent: Node) -> void:
	var creature := _spawn(parent, "Torr")
	creature.stats.age(60.0)
	for i in 30:
		creature.experience.log_event("protect_ally")
		creature.experience.log_event("damage_absorbed_for_ally", 6.0)
	creature.archetype.evaluate()
	_check("shatter: Guardian crystallized first",
		creature.archetype.state.is_crystallized(&"arch_guardian"))

	var shattered: Array = []
	var listener := func(uid, archetype_id, tick): shattered.append(archetype_id)
	EventBus.archetype_shattered.connect(listener)

	# It fails, repeatedly, at the one thing it was for.
	for i in 4:
		creature.experience.log_event("ally_died_under_protection")
	creature.archetype.evaluate()
	EventBus.archetype_shattered.disconnect(listener)

	_check("shatter: catastrophic failure breaks the archetype",
		not creature.archetype.state.is_crystallized(&"arch_guardian"))
	_check("shatter: announced on the bus", shattered.size() == 1)
	_check("shatter: abilities revoked",
		not creature.archetype.has_ability(&"ability_intercept"))
	_check("shatter: the group is freed for something else",
		creature.archetype.state.crystallized_in_group("core").is_empty())
	_check("shatter: the failure is remembered forever",
		creature.archetype.state.shattered.has("arch_guardian"))

	creature.free()


# --- Prerequisites ------------------------------------------------------------

func _test_prerequisites(parent: Node) -> void:
	# Age gate: the deeds are done, but the animal is too young to be defined.
	var young := _spawn(parent)
	young.stats.age_days = 5.0
	for i in 30:
		young.experience.log_event("protect_ally")
		young.experience.log_event("damage_absorbed_for_ally", 6.0)
	young.archetype.evaluate()
	_check("prerequisites: an underage creature cannot crystallize",
		not young.archetype.state.is_crystallized(&"arch_guardian"))
	_check("prerequisites: but its progress is still tracked",
		young.archetype.state.get_progress(&"arch_guardian") > 0.5)
	young.stats.age(60.0)
	young.archetype.evaluate()
	_check("prerequisites: crystallizes once old enough",
		young.archetype.state.is_crystallized(&"arch_guardian"))
	young.free()

	# Trait gate: Oracle demands genuine expressed aether sensitivity, not
	# merely carrying the recessive allele.
	var carrier := _spawn(parent)
	carrier.genetics.genome.set_pair(&"sens_exotic", "aether_attuned", "aether_deaf")
	carrier.genetics.mark_dirty()
	carrier.stats.age(70.0)
	for i in 15:
		carrier.experience.log_event("anomaly_investigated")
		carrier.experience.log_event("threat_foreseen")
	carrier.archetype.evaluate()
	_check("prerequisites: a silent carrier cannot become an Oracle",
		not carrier.archetype.state.is_crystallized(&"arch_oracle"))

	var attuned := _spawn(parent)
	attuned.genetics.genome.set_pair(&"sens_exotic", "aether_attuned", "aether_attuned")
	attuned.genetics.mark_dirty()
	attuned.stats.age(70.0)
	for i in 15:
		attuned.experience.log_event("anomaly_investigated")
		attuned.experience.log_event("threat_foreseen")
	attuned.archetype.evaluate()
	_check("prerequisites: an expressed Oracle qualifies",
		attuned.archetype.state.is_crystallized(&"arch_oracle"))

	chronicle.append("  · %s" % StoryDirector.narrate_history(attuned))
	carrier.free()
	attuned.free()


# --- Story templates ----------------------------------------------------------

func _test_story_templates(parent: Node) -> void:
	var creature := _spawn(parent, "Sable")
	creature.identity.generation = 7
	creature.stats.age(50.0)
	for i in 6:
		creature.experience.log_event("near_death_survived")

	var fired := StoryDirector.evaluate_creature(creature)
	_check("story: templates fire from state alone", not fired.is_empty())

	var texts := ""
	for event in fired:
		texts += String(event.get("text", "")) + " "
		chronicle.append("  · " + String(event.get("text", "")))
	_check("story: event text names the creature", texts.contains("Sable"))
	_check("story: placeholders are all resolved", not texts.contains("{"))

	# Templates marked once_per_creature must not repeat.
	var repeat := StoryDirector.evaluate_creature(creature)
	_check("story: once-per-creature templates do not repeat", repeat.is_empty())

	# A creature that has not earned an event must not receive one.
	var ordinary := _spawn(parent, "Nobody")
	_check("story: nothing fires for a creature with no history",
		StoryDirector.evaluate_creature(ordinary).is_empty())

	_check("story: fired events reached the long-term memory",
		not StoryDirector.history_of(creature.identity.uid).is_empty())

	creature.free()
	ordinary.free()


# --- Persistence --------------------------------------------------------------

func _test_persistence(parent: Node) -> void:
	var original := _spawn(parent, "Marn")
	original.stats.age(60.0)
	for i in 30:
		original.experience.log_event("protect_ally")
		original.experience.log_event("damage_absorbed_for_ally", 6.0)
	original.experience.record_extreme("coldest_endured", 41.0)
	original.archetype.evaluate()

	var snapshot: Variant = JSON.parse_string(
		JSON.stringify(CreatureFactory.serialize(original)))
	var clone := CreatureFactory.spawn_from_dict(parent, snapshot)

	_check("persistence: experience counters survive",
		clone.experience.count("protect_ally") == original.experience.count("protect_ally"))
	_check("persistence: extremes survive",
		is_equal_approx(clone.experience.extreme("coldest_endured"), 41.0))
	_check("persistence: episodes survive",
		clone.experience.episodes.size() == original.experience.episodes.size())
	_check("persistence: crystallized archetype survives",
		clone.archetype.state.is_crystallized(&"arch_guardian"))
	_check("persistence: granted abilities survive",
		clone.archetype.has_ability(&"ability_intercept"))
	_check("persistence: archetype trait modifiers still apply after reload",
		is_equal_approx(float(clone.stats.phenotype().get("armor", 0.0)),
			float(original.stats.phenotype().get("armor", 0.0))))
	_check("persistence: a reloaded creature re-evaluates without re-crystallizing",
		_stays_crystallized(clone))

	original.free()
	clone.free()


func _stays_crystallized(creature: Creature) -> bool:
	var before := creature.archetype.state.active_archetypes().size()
	creature.archetype.evaluate()
	return creature.archetype.state.active_archetypes().size() == before


# --- Helpers ------------------------------------------------------------------

func _spawn(parent: Node, name: String = "") -> Creature:
	var opts := {}
	if not name.is_empty():
		opts["name"] = name
	return CreatureFactory.spawn_random(parent, _rng, opts)


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
