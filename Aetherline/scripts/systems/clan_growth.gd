extends Node
class_name ClanGrowth

## A clan that is looked after grows.
##
## THE GAP THIS FILLS. `BreedingSystem` has been complete since Phase 1 — meiosis,
## linkage, epigenetic crossing, lethal recessives, maternal-line cytoplasm — and
## in play it was reachable from exactly one place: paying for "the stalls" at a
## settlement service menu, which breeds every eligible pair in your party at
## once. A lineage game in which the lineage only continues when you buy
## offspring at a market.
##
## That is not only thematically wrong, it is load-bearing. Support at a
## generational boundary is LIVING MEMBERS, and a clan can hold
## `floor(living / SUPPORT_PER_PENDING)` provisional understandings through it.
## A clan that cannot grow can never hold more than it holds today, so the ceiling
## on everything the neuronal tree does was fixed at character creation and could
## only ever fall as people died.
##
## SO BIRTHS HAPPEN AT THE GENERATIONAL BOUNDARY, which is the moment the clan
## turns over anyway, and they are earned: the clan has to be fed, healthy and
## not already at its ceiling. A neglected clan shrinks, a tended one grows, and
## the thing that grows is the number of understandings it can carry.
##
## OWNED BY ITS OWN NODE rather than folded into CultureTicker, whose contract is
## driving decisions at each tier's cadence, or CultureRegistry, which is static
## and has no scene to put a child in. One node, one concern, the same shape as
## the reward router beside it.

## Living members below which nobody is thinking about children. Two is the
## floor: it takes two, and a clan of exactly two that loses one is finished.
const MIN_PARENTS: int = 2

## The clan stops growing here. Not a technical limit — a simulation budget one,
## and a design one: a clan of twenty holds ten pending understandings, which is
## most of the catalog and takes the stakes out of the boundary.
const CLAN_SOFT_CAP: int = 14

## Both parents must be at least this fed and this healthy. The whole point is
## that growth is a reward for keeping people well.
const MIN_HUNGER: float = 0.45
const MIN_HEALTH: float = 0.6

## Fraction of `max_age_days` below which a creature is too young to parent.
const ADULT_AT: float = 0.15

var rng := RandomNumberGenerator.new()

## Where children are put. The overworld sets this to the node it spawns fauna
## into; without it there is nowhere for a creature to exist.
var nursery: Node = null

var births: int = 0
var refusals: int = 0

## Guards against the boundary re-entering itself.
##
## `BreedingSystem` calls `CultureRegistry.note_birth`, which can advance a
## generation, which emits `culture_generation_advanced`, which is what got us
## here. Without this a single boundary can breed a clan into the ceiling in one
## frame, and the recursion is not obvious from any one call site.
var _busy: bool = false


func _ready() -> void:
	if rng.seed == 0:
		rng.seed = hash("clan_growth") ^ int(PlanetManager.universe_seed)
	EventBus.culture_generation_advanced.connect(_on_generation_advanced)


func _exit_tree() -> void:
	if EventBus.culture_generation_advanced.is_connected(_on_generation_advanced):
		EventBus.culture_generation_advanced.disconnect(_on_generation_advanced)


func _on_generation_advanced(culture_id: String, _generation: int,
		_retained: float) -> void:
	attempt(culture_id)


## Try for one child. Returns the child, or null and a reason nobody was born.
##
## One, not a litter, whatever the parents' `litter_size` says: a boundary that
## can double a clan makes the support arithmetic meaningless, and the drama of
## the tree is in how tight that arithmetic is.
func attempt(culture_id: String) -> Creature:
	# The guard lives HERE, not on the signal handler, and that distinction cost a
	# failing test to find. `BreedingSystem.breed` calls `CultureRegistry.note_birth`
	# mid-call, which can advance a generation, which emits the signal this node
	# listens to, which lands back in this function — so a single direct call
	# produced two children and the handler's flag was never even set. Guarding
	# the re-entrant function rather than one of its entrances is the whole fix.
	if _busy:
		return null
	if nursery == null or not is_instance_valid(nursery):
		return null
	_busy = true
	var child := _attempt(culture_id)
	_busy = false
	return child


func _attempt(culture_id: String) -> Creature:
	var candidates := _fit_parents(culture_id)
	if candidates.size() < MIN_PARENTS:
		refusals += 1
		return null
	if CultureRegistry.living_members(culture_id) >= CLAN_SOFT_CAP:
		refusals += 1
		return null

	# The two healthiest fit adults. Not the two most bonded: relationships are
	# not guaranteed to exist on a clan that has never been in a settlement, and
	# a growth rule that silently does nothing on most worlds is worse than a
	# simple one.
	candidates.sort_custom(func(a, b): return _vigour(a) > _vigour(b))
	for i in candidates.size():
		for j in range(i + 1, candidates.size()):
			var result := BreedingSystem.breed(candidates[i], candidates[j],
				nursery, rng, {"litter_override": 1,
					"planet_id": PlanetManager.active_planet_id})
			if not bool(result["success"]) or result["child"] == null:
				continue
			var child: Creature = result["child"]
			_settle(child, candidates[i])
			births += 1
			return child

	refusals += 1
	return null


## Put the child somewhere it can be seen, counted and simulated.
##
## Registering with SimulationBudget is what makes it count toward the clan at
## the NEXT boundary — `CultureRegistry.living_members` reads that registry, so a
## child nobody registered is a child the support arithmetic never hears about.
func _settle(child: Creature, near: Creature) -> void:
	if is_instance_valid(near):
		child.position = near.position + Vector2(
			rng.randf_range(-28.0, 28.0), rng.randf_range(-28.0, 28.0))
	child.home_planet_id = PlanetManager.active_planet_id
	child.stats.initialize_vitals()
	SimulationBudget.register_creature(child.identity.uid, child,
		PlanetManager.active_planet_id)


func _fit_parents(culture_id: String) -> Array[Creature]:
	var out: Array[Creature] = []
	for uid in SimulationBudget.uids():
		var node := SimulationBudget.node_for(StringName(uid))
		if node == null or not is_instance_valid(node):
			continue
		var creature := node as Creature
		if creature == null or creature.identity == null:
			continue
		if CultureRegistry.culture_for(creature).culture_id != culture_id:
			continue
		if not _fit(creature):
			continue
		out.append(creature)
	return out


## Fed, whole, grown, and not on the floor. Every one of these is a thing the
## player can affect, which is what makes growth a reward rather than a timer.
func _fit(creature: Creature) -> bool:
	if creature.needs == null or creature.needs.is_dead():
		return false
	if creature.stats == null or creature.stats.downed:
		return false
	if creature.needs.hunger < MIN_HUNGER or creature.needs.health < MIN_HEALTH:
		return false
	var lifespan: float = maxf(1.0, creature.stats.stat("max_age_days"))
	if creature.stats.age_days < lifespan * ADULT_AT:
		return false
	return not creature.stats.is_elderly()


func _vigour(creature: Creature) -> float:
	return creature.needs.health + creature.needs.hunger \
		+ creature.stats.hp_fraction()


func debug_summary() -> String:
	return "ClanGrowth: %d born, %d boundaries passed over" % [births, refusals]
