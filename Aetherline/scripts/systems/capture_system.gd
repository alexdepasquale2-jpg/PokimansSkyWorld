extends RefCounted
class_name CaptureSystem

## Bringing a creature into the colony, in or out of combat.

## Post-combat capture: easier on a weakened, docile, trainable target.
static func attempt_capture(capturer: Creature, target: Creature,
		rng: RandomNumberGenerator) -> bool:
	var chance := clampf(
		0.3 + (1.0 - target.stats.hp_fraction()) * 0.4
		- target.stats.trait_value(&"aggression") * 0.3
		+ target.stats.trait_value(&"trainability") * 0.3, 0.05, 0.95)
	return _resolve(target, rng, chance, "captured")


## Non-combat recruitment: the recruiter's husbandry against the target's own
## sociability and trainability. No fight required.
static func attempt_recruit(recruiter: Creature, target: Creature,
		rng: RandomNumberGenerator) -> bool:
	var chance := clampf(
		0.2 + recruiter.stats.trait_value(&"husbandry") * 0.3
		+ target.stats.trait_value(&"sociability") * 0.25
		+ target.stats.trait_value(&"trainability") * 0.25, 0.05, 0.9)
	return _resolve(target, rng, chance, "recruited")


static func _resolve(target: Creature, rng: RandomNumberGenerator,
		chance: float, kind: String) -> bool:
	if rng.randf() >= chance:
		return false
	target.identity.origin_kind = kind
	target.experience.log_event(kind, 1.0)
	EventBus.creature_joined_colony.emit(target.identity.uid, kind)
	var lineage := StoryDirector.ensure_lineage(target.identity.lineage_id)
	lineage.add_event(SimulationBudget.current_tick, PlanetManager.active_planet_id,
		String(target.identity.uid), kind, "%s was %s." % [target.display_name(), kind], 0.4)
	return true
