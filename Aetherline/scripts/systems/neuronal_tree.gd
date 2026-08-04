extends RefCounted
class_name NeuronalTree

## What the lineage has worked out, and whether it survives the people who
## worked it out.
##
## THIS IS THE ANCESTORS LOOP, and it is a different thing from the two
## progression systems already here. Colony research spends resources and the
## ship spends salvage; both are the player getting richer. This one is not a
## currency at all. Neuronal energy is only ever produced by DOING SOMETHING FOR
## THE FIRST TIME, and what it buys is provisional until a generation turns over
## and decides whether to keep it.
##
##   discover  →  energy  →  reinforce a neuron  →  it is PENDING
##   a generation turns over  →  supported neurons LOCK, unsupported ones are LOST
##   enough locked neurons  →  an evolution leap
##
## WHY PENDING MATTERS, and why it is the whole mechanic rather than a tax. A
## clan that scatters, or that loses its elders, or that spends everything on one
## branch and cannot support it, watches what it learned die with the generation
## that learned it. Progress here is not a ratchet. It is a thing you can lose,
## and losing it is the story.
##
## HOW IT DIFFERS FROM THE CULTURAL NETWORK, which also learns and also inherits.
## The network learns CONTINUOUSLY and IMPLICITLY from outcomes — nobody chooses
## it and nobody can see it happening. The tree is DISCRETE and CHOSEN: the
## player spends, on purpose, and can point at what they bought. One is what the
## clan has picked up; the other is what it has decided to become. They inherit
## through the same generational boundary and they are not the same thing.
##
## OWNED PER CLAN, keyed the same way cultures are, so a colony left behind on
## another world keeps its own tree and can lose neurons the clan that flew away
## keeps — see CultureRegistry.fork.

const CATALOG_FILE := "res://data/neurons/neurons.json"

## Neurons a clan must hold, locked, before it can take an evolution leap.
const LEAP_THRESHOLD: int = 6

## Living members a clan needs at a generation change to hold on to what it
## learned. Below this, pending neurons are lost: there is nobody left who was
## there when it was worked out.
const SUPPORT_PER_PENDING: float = 2.0

## Energy for doing something never done before. The only source that scales.
const DISCOVERY_ENERGY: float = 6.0

## Energy for coming through something that should have killed you. Ancestors
## calls this dopamine; the point is that fear overcome is worth more than
## safety, and a clan that never risks anything never advances.
const FEAR_ENERGY: float = 4.0

## Experience kinds that count as facing something down rather than merely
## surviving it. Kept as a set so the reward catalog and this stay independent.
const FEARFUL_KINDS := {
	"near_death_survived": true, "threat_foreseen": true, "combat_win": true,
	"anomaly_investigated": true, "hazards_endured": true, "trauma_events": true,
}

static var catalog: Dictionary = {}
static var _order: Array[String] = []

var clan_id: String = ""
var energy: float = 0.0
var lifetime_energy: float = 0.0

## neuron_id -> true. Reinforced this generation and not yet inherited.
var pending: Dictionary = {}
## neuron_id -> true. Survived a generation change. Permanent.
var locked: Dictionary = {}
## Neurons that were reinforced and then lost at a generation change, kept so the
## game can say what a clan used to know.
var forgotten: Dictionary = {}

var leaps: int = 0
## Locked count as of the last crossing. A leap demands understanding acquired
## SINCE the last one, not a cumulative total — otherwise a clan that banked the
## whole tree could cross three times in an afternoon and the long haul the
## fantasy is built on collapses into a shopping trip.
var locked_at_last_leap: int = 0
## Discovery kinds this clan has already been paid for, so the same first time
## cannot be sold twice.
var known_firsts: Dictionary = {}


static func load_catalog() -> void:
	if not catalog.is_empty():
		return
	if not FileAccess.file_exists(CATALOG_FILE):
		push_warning("NeuronalTree: catalog missing at %s" % CATALOG_FILE)
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CATALOG_FILE))
	if typeof(parsed) != TYPE_ARRAY:
		push_warning("NeuronalTree: catalog is not a JSON array")
		return
	for entry in parsed:
		var id := String((entry as Dictionary).get("id", ""))
		if id.is_empty():
			continue
		catalog[id] = (entry as Dictionary).duplicate(true)
		_order.append(id)


static func definition(neuron_id) -> Dictionary:
	load_catalog()
	return catalog.get(String(neuron_id), {})


static func ids() -> Array[String]:
	load_catalog()
	return _order.duplicate()


# --- Registry ---------------------------------------------------------------------
#
# One tree per clan, keyed exactly as cultures are, and static for the same
# reason CultureRegistry is: this is a place, not a process. It never ticks and
# never listens; the router pushes discoveries into it and the menu reads it.

static var _trees: Dictionary = {}
static var _installed: bool = false


static func install() -> void:
	if _installed:
		return
	_installed = true
	SaveSystem.register_provider("neurons",
		func(): return save_section(),
		func(section): load_section(section))


## The tree for a clan, minted on first touch.
static func for_clan(id: String) -> NeuronalTree:
	install()
	var key := id if not id.is_empty() else "culture_default"
	if not _trees.has(key):
		_trees[key] = NeuronalTree.new(key)
	return _trees[key]


static func for_creature(creature: Node) -> NeuronalTree:
	return for_clan(CultureRegistry.culture_for(creature).culture_id)


static func all_trees() -> Array:
	return _trees.values()


static func clan_ids() -> Array:
	return _trees.keys()


## A clan splitting takes what it knows with it — locked neurons are the
## lineage's, and both halves keep them. Pending work does not survive the
## parting: whoever was in the middle of working it out is on the other ship.
static func fork(parent_id: String, child_id: String) -> NeuronalTree:
	var parent: NeuronalTree = _trees.get(parent_id)
	var child := for_clan(child_id)
	if parent == null or parent == child:
		return child
	for id in parent.locked:
		child.locked[String(id)] = true
	child.leaps = parent.leaps
	for kind in parent.known_firsts:
		child.known_firsts[String(kind)] = true
	return child


static func reset() -> void:
	_trees.clear()


static func save_section() -> Dictionary:
	var out: Dictionary = {}
	for id in _trees:
		out[id] = (_trees[id] as NeuronalTree).to_dict()
	return {"trees": out}


static func load_section(section: Dictionary) -> void:
	_trees.clear()
	for id in section.get("trees", {}):
		_trees[String(id)] = NeuronalTree.from_dict(section["trees"][id])


static func registry_summary() -> String:
	var locked_total := 0
	var leaps_total := 0
	for tree in _trees.values():
		locked_total += (tree as NeuronalTree).locked.size()
		leaps_total = maxi(leaps_total, (tree as NeuronalTree).leaps)
	return "NeuronalTree: %d clan(s), %d neurons locked, deepest leap %d" % [
		_trees.size(), locked_total, leaps_total]


func _init(id: String = "") -> void:
	clan_id = id
	load_catalog()


# --- Earning ------------------------------------------------------------------------

## Something happened to somebody in this clan. Pays only the first time.
##
## Reuses ExperienceComponent's `first_seen`, which has recorded the tick of every
## first-ever occurrence since Phase 1 and is already serialized — the discovery
## substrate was built long before there was anything to spend it on.
##
## Has this clan ever done this before? Read-only, and deliberately separate from
## `observe`, which is destructive — a caller that wants to announce a discovery
## has to ask BEFORE the discovery is recorded, and there is no way to ask after.
func has_discovered(kind: String) -> bool:
	return known_firsts.has(kind)


## Returns the energy granted, so a caller can celebrate it.
func observe(kind: String, is_first_for_creature: bool) -> float:
	var gained := 0.0

	# A first for the CLAN, not merely for the creature. The second animal to
	# work out what a stone is for has learned something; the clan has not.
	if is_first_for_creature and not known_firsts.has(kind):
		known_firsts[kind] = true
		gained += DISCOVERY_ENERGY

	if FEARFUL_KINDS.has(kind):
		gained += FEAR_ENERGY

	if gained > 0.0:
		energy += gained
		lifetime_energy += gained
	return gained


# --- Spending -------------------------------------------------------------------------

func is_locked(neuron_id) -> bool:
	return locked.has(String(neuron_id))


func is_pending(neuron_id) -> bool:
	return pending.has(String(neuron_id))


func is_held(neuron_id) -> bool:
	return is_locked(neuron_id) or is_pending(neuron_id)


## Prerequisites must be LOCKED, not merely pending.
##
## You cannot build on something the lineage has not yet committed to — that is
## what stops a player buying a whole branch in one generation and keeping it by
## accident, and it is why the tree is a tree rather than a shopping list.
func prerequisites_met(neuron_id) -> bool:
	var definition_dict := definition(neuron_id)
	if definition_dict.is_empty():
		return false
	for required in definition_dict.get("prerequisites", []):
		if not is_locked(required):
			return false
	return true


func cost_of(neuron_id) -> float:
	var definition_dict := definition(neuron_id)
	return float(definition_dict.get("cost", 0.0)) if not definition_dict.is_empty() else INF


func can_reinforce(neuron_id) -> bool:
	if definition(neuron_id).is_empty() or is_held(neuron_id):
		return false
	return prerequisites_met(neuron_id) and energy >= cost_of(neuron_id)


## Everything this clan could commit to right now. "Is there anything to do?" is
## the question the HUD and the event feed both need answered, and asking it by
## walking the catalog at every call site is how the two end up disagreeing.
func affordable_ids() -> Array[String]:
	var out: Array[String] = []
	for id in ids():
		if can_reinforce(id):
			out.append(id)
	return out


func reinforce(neuron_id) -> bool:
	if not can_reinforce(neuron_id):
		return false
	var key := String(neuron_id)
	energy -= cost_of(key)
	pending[key] = true
	EventBus.neuron_reinforced.emit(clan_id, key)
	return true


# --- The generational boundary -----------------------------------------------------------

## A generation has turned over. Decide what the lineage keeps.
##
## `support` is the clan's living strength — how many of them there are to carry
## it. Each pending neuron needs SUPPORT_PER_PENDING behind it; a clan that
## reinforced more than it can hold loses the excess, cheapest first, because the
## elaborate thing is what goes when there are not enough people to keep it
## alive.
##
## Returns { "locked": [ids], "lost": [ids] }.
func advance_generation(support: float) -> Dictionary:
	var outcome := {"locked": [], "lost": []}
	if pending.is_empty():
		return outcome

	var holdable: int = int(floor(support / SUPPORT_PER_PENDING))
	var candidates: Array[String] = []
	for id in pending:
		candidates.append(String(id))
	# Cheapest first: the simple things survive a bad generation and the
	# ambitious ones do not, which is both the right game feel and the right
	# story.
	candidates.sort_custom(func(a, b): return cost_of(a) < cost_of(b))

	for i in candidates.size():
		var id: String = candidates[i]
		if i < holdable:
			locked[id] = true
			forgotten.erase(id)
			(outcome["locked"] as Array).append(id)
		else:
			forgotten[id] = true
			(outcome["lost"] as Array).append(id)

	pending.clear()
	if not (outcome["lost"] as Array).is_empty():
		EventBus.neurons_lost.emit(clan_id, outcome["lost"])
	if not (outcome["locked"] as Array).is_empty():
		EventBus.neurons_locked.emit(clan_id, outcome["locked"])
	return outcome


# --- Evolution leaps ------------------------------------------------------------------------

func locked_count() -> int:
	return locked.size()


## Understandings locked since the last crossing.
func understandings_since_leap() -> int:
	return maxi(0, locked_count() - locked_at_last_leap)


func leap_ready() -> bool:
	return understandings_since_leap() >= LEAP_THRESHOLD


func neurons_until_leap() -> int:
	return maxi(0, LEAP_THRESHOLD - understandings_since_leap())


## Cross the gap. Everything locked is carried; everything pending is not, because
## a leap is measured in tens of thousands of years and nobody alive remembers
## what was merely being tried.
func take_leap() -> bool:
	if not leap_ready():
		return false
	leaps += 1
	# Consume exactly the threshold, not everything on hand. Resetting to the
	# current count discarded any surplus, so a clan that prepared thoroughly
	# before crossing was punished for it — and with a finite catalog it made the
	# later leaps unreachable outright. Surplus understanding carries forward.
	locked_at_last_leap += LEAP_THRESHOLD
	for id in pending:
		forgotten[String(id)] = true
	pending.clear()
	# The far side is a harder place, and the clan arrives with nothing banked.
	energy = 0.0
	EventBus.evolution_leap.emit(clan_id, leaps, locked_count())
	return true


# --- Effects ---------------------------------------------------------------------------------

## Trait modifiers from every LOCKED neuron.
##
## Applied after archetypes in the phenotype pipeline, on the same reasoning:
## genetics is what the creature was born, epigenetics what its life made of it,
## archetype what it became, and this is what its whole LINEAGE worked out. The
## broadest inheritance is applied last.
##
## Pending neurons deliberately do nothing. A thing the clan is still trying is
## not yet a thing the clan is.
func apply_to(traits: Dictionary) -> Dictionary:
	var out := traits.duplicate()
	for neuron_id in locked:
		var modifiers: Dictionary = definition(neuron_id).get("traits", {})
		for trait_key in modifiers:
			out[String(trait_key)] = float(out.get(String(trait_key), 0.0)) \
				+ float(modifiers[trait_key])
	return out


## Multiplicative drive biases from every locked neuron, in the shape
## AIController's gate layer already consumes from archetypes.
func drive_bias() -> Dictionary:
	var bias: Dictionary = {}
	for neuron_id in locked:
		var drives: Dictionary = definition(neuron_id).get("drives", {})
		for drive_id in drives:
			bias[String(drive_id)] = float(bias.get(String(drive_id), 1.0)) \
				* float(drives[drive_id])
	return bias


# --- Readout -----------------------------------------------------------------------------------

## Every neuron with its current standing, for the menu.
func survey() -> Array:
	var out: Array = []
	for id in ids():
		var definition_dict := definition(id)
		var state := "locked" if is_locked(id) else (
			"pending" if is_pending(id) else (
			"forgotten" if forgotten.has(id) else (
			"available" if prerequisites_met(id) else "closed")))
		out.append({
			"id": id,
			"name": definition_dict.get("display_name", id),
			"branch": definition_dict.get("branch", ""),
			"tier": int(definition_dict.get("tier", 0)),
			"cost": cost_of(id),
			"state": state,
			"affordable": state == "available" and energy >= cost_of(id),
			"description": definition_dict.get("description", ""),
		})
	return out


func branches() -> Array[String]:
	var seen: Array[String] = []
	for id in ids():
		var branch := String(definition(id).get("branch", ""))
		if not branch.is_empty() and not seen.has(branch):
			seen.append(branch)
	return seen


func debug_summary() -> String:
	return "%s: %d locked, %d pending, %d forgotten · %.0f energy · %d leap(s)" % [
		clan_id, locked.size(), pending.size(), forgotten.size(), energy, leaps]


# --- Serialization -----------------------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"clan_id": clan_id,
		"energy": energy,
		"lifetime_energy": lifetime_energy,
		"pending": pending.keys(),
		"locked": locked.keys(),
		"forgotten": forgotten.keys(),
		"leaps": leaps,
		"locked_at_last_leap": locked_at_last_leap,
		"known_firsts": known_firsts.keys(),
	}


static func from_dict(d: Dictionary) -> NeuronalTree:
	var tree := NeuronalTree.new(String(d.get("clan_id", "")))
	tree.energy = float(d.get("energy", 0.0))
	tree.lifetime_energy = float(d.get("lifetime_energy", 0.0))
	tree.leaps = int(d.get("leaps", 0))
	tree.locked_at_last_leap = int(d.get("locked_at_last_leap", 0))
	for id in d.get("pending", []):
		tree.pending[String(id)] = true
	for id in d.get("locked", []):
		tree.locked[String(id)] = true
	for id in d.get("forgotten", []):
		tree.forgotten[String(id)] = true
	for kind in d.get("known_firsts", []):
		tree.known_firsts[String(kind)] = true
	return tree
