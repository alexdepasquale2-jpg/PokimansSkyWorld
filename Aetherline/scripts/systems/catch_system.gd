extends RefCounted
class_name CatchSystem

## Throwing for a wild creature.
##
## Odds are readable on purpose ΓÇö the player should be able to look at a target
## and know roughly whether it is worth a throw. Three inputs, all visible:
##   how hurt it is   (the main lever ΓÇö this is what combat is FOR)
##   how wild it is   (aggression resists, trainability accepts)
##   how rare it is   (a creature with rare genes fights the catch harder)
##
## No items, no ball tiers. The ship's bio-sensor is the only multiplier, so
## catching gets better as a reward for upgrading rather than for shopping.

const BASE_CHANCE := 0.12
const MIN_CHANCE := 0.03
const MAX_CHANCE := 0.95


## 0..1 odds of this throw landing. Exposed so the HUD can show it BEFORE the
## player commits ΓÇö hidden catch rates just make people spam the button.
static func chance_for(target: Creature, ship: ShipSystem) -> float:
	var hurt := 1.0 - target.stats.hp_fraction()
	# Weakening is worth far more than anything else, so fighting first is
	# always the right read.
	var chance := BASE_CHANCE + hurt * hurt * 0.68

	chance -= target.stats.trait_value(&"aggression") * 0.18
	chance += target.stats.trait_value(&"trainability") * 0.14
	chance += target.stats.trait_value(&"sociability") * 0.06

	# A downed creature is nearly a guaranteed catch ΓÇö the payoff for winning.
	if target.stats.downed:
		chance += 0.35

	# Rarity resists. Uses the same hidden-carrier count the Aetherdex reads,
	# so "this one is special" and "this one is hard to catch" are the same fact.
	var rare := float(PhenotypeResolver.hidden_carriers(target.genetics.genome).size())
	chance -= clampf(rare * 0.02, 0.0, 0.18)

	if ship != null:
		chance += float(ship.reveal_depth()) * 0.04

	return clampf(chance, MIN_CHANCE, MAX_CHANCE)


## Attempts the throw. Returns { "caught": bool, "chance": float }.
static func attempt(target: Creature, ship: ShipSystem,
		rng: RandomNumberGenerator) -> Dictionary:
	var chance := chance_for(target, ship)
	var caught := rng.randf() < chance
	if caught:
		target.identity.origin_kind = "caught"
		target.stats.revive(0.6)
		target.combat.engaged = false
		target.experience.log_event("caught", 1.0)
		EventBus.creature_joined_colony.emit(target.identity.uid, "caught")
	return {"caught": caught, "chance": chance}


## Plain-language read of the odds, for the HUD prompt.
static func describe_chance(chance: float) -> String:
	if chance >= 0.75:
		return "almost certain"
	if chance >= 0.5:
		return "good"
	if chance >= 0.3:
		return "even"
	if chance >= 0.15:
		return "poor"
	return "hopeless"
