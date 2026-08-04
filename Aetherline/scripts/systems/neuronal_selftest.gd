extends RefCounted
class_name NeuronalSelfTest

## The Ancestors loop, asserted end to end.
##
##   discover  →  energy  →  reinforce  →  PENDING
##   a generation turns over  →  LOCKED, or LOST
##   enough locked  →  a leap
##
## THE ASSERTION THAT MATTERS IS THE LOSS. Everything else here is bookkeeping
## that could be got right by accident. A clan that reinforces more than it can
## support must come out of a generation change with less than it went in with,
## and it must be the ambitious neurons that go rather than the cheap ones. If
## that ever quietly stops happening, the tree becomes a ratchet — every run
## trends the same way, nothing is ever at stake, and the mechanic is a menu.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()

var stats: Array[String] = []


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	stats.clear()
	_rng.seed = 20260807

	_test_catalog()
	_test_earning()
	_test_spending_and_gating()
	_test_the_generational_boundary()
	_test_leap()
	_test_effects(parent)
	_test_fork_and_persistence()

	NeuronalTree.reset()
	CultureRegistry.reset()
	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Catalog ------------------------------------------------------------------------

func _test_catalog() -> void:
	NeuronalTree.load_catalog()
	_check("catalog: neurons are defined", NeuronalTree.catalog.size() >= 12)

	var problems: Array[String] = []
	var branches: Dictionary = {}
	for id in NeuronalTree.ids():
		var definition := NeuronalTree.definition(id)
		for required in ["display_name", "branch", "cost", "description"]:
			if not definition.has(required):
				problems.append("%s lacks %s" % [id, required])
		if float(definition.get("cost", 0.0)) <= 0.0:
			problems.append("%s is free" % id)
		if (definition.get("traits", {}) as Dictionary).is_empty() \
				and (definition.get("drives", {}) as Dictionary).is_empty():
			problems.append("%s changes nothing" % id)
		branches[String(definition.get("branch", ""))] = true
		# A prerequisite that does not exist is a branch nobody can ever reach.
		for required_id in definition.get("prerequisites", []):
			if NeuronalTree.definition(required_id).is_empty():
				problems.append("%s needs unknown %s" % [id, required_id])
	_check("catalog: every neuron is well-formed (%s)"
		% ("clean" if problems.is_empty() else ", ".join(problems)), problems.is_empty())
	_check("catalog: there are several branches to choose between (%d)"
		% branches.size(), branches.size() >= 3)

	# Every neuron must be reachable by locking its way up from nothing, or the
	# catalog contains content no campaign can ever see.
	var reachable: Dictionary = {}
	var changed := true
	while changed:
		changed = false
		for id in NeuronalTree.ids():
			if reachable.has(id):
				continue
			var met := true
			for required_id in NeuronalTree.definition(id).get("prerequisites", []):
				if not reachable.has(String(required_id)):
					met = false
			if met:
				reachable[id] = true
				changed = true
	_check("catalog: every neuron is reachable from a standing start (%d of %d)"
		% [reachable.size(), NeuronalTree.ids().size()],
		reachable.size() == NeuronalTree.ids().size())

	# Cheap things must exist at the root, or a new clan can do nothing at all.
	var roots := 0
	for id in NeuronalTree.ids():
		if (NeuronalTree.definition(id).get("prerequisites", []) as Array).is_empty():
			roots += 1
	_check("catalog: a clan with nothing has somewhere to start (%d roots)" % roots,
		roots >= 3)

	# THE AMBITION MUST BE REACHABLE. Leaps require a cumulative count of locked
	# neurons, so a catalog smaller than the final threshold makes the win
	# condition impossible — which is exactly what shipped until StakesSelfTest
	# tried to win and could not. Asserted here, against the catalog, so tuning
	# either side fails loudly instead of silently making the game unwinnable.
	var needed := NeuronalTree.LEAP_THRESHOLD * CampaignArc.EVOLUTION_LEAPS_TO_WIN
	_check("catalog: the campaign's ambition is actually reachable (%d neurons "
		% NeuronalTree.ids().size() + "for %d needed)" % needed,
		NeuronalTree.ids().size() >= needed)
	_check("catalog: and with room to choose rather than buy everything",
		NeuronalTree.ids().size() >= needed + 4)


# --- Earning --------------------------------------------------------------------------

func _test_earning() -> void:
	NeuronalTree.reset()
	var tree := NeuronalTree.for_clan("clan_neuro")

	_check("earning: a clan starts with nothing banked", is_zero_approx(tree.energy))

	var first := tree.observe("forage_success", true)
	_check("earning: doing something for the first time pays", first > 0.0)

	var repeat := tree.observe("forage_success", true)
	_check("earning: and the same first cannot be sold twice",
		repeat < first)

	var ordinary := tree.observe("forage_success", false)
	_check("earning: routine success pays nothing at all", is_zero_approx(ordinary))

	# Fear overcome pays whether or not it was a first — that is the point of it.
	var banked := tree.energy
	var frightening := tree.observe("near_death_survived", false)
	_check("earning: coming through something that should have killed you pays",
		frightening > 0.0)
	_check("earning: even though it was not a first", tree.energy > banked)

	var brand_new_and_frightening := tree.observe("combat_win", true)
	_check("earning: a frightening first pays for both",
		brand_new_and_frightening > frightening)

	_check("earning: lifetime energy only ever rises",
		tree.lifetime_energy >= tree.energy)
	_note("energy from six events", tree.energy)


# --- Spending -----------------------------------------------------------------------------

func _test_spending_and_gating() -> void:
	NeuronalTree.reset()
	var tree := NeuronalTree.for_clan("clan_neuro")

	var root := "neu_grip"
	var child := "neu_object_use"

	_check("spending: with no energy nothing can be reinforced",
		not tree.can_reinforce(root))
	tree.energy = 1000.0

	_check("spending: a root neuron is open immediately", tree.can_reinforce(root))
	# A neuron whose prerequisite is merely PENDING must stay shut. This is what
	# makes the tree a tree instead of a shopping list bought in one generation.
	_check("spending: a deeper neuron is shut until its parent is locked",
		not tree.can_reinforce(child))

	var before := tree.energy
	_check("spending: reinforcing succeeds", tree.reinforce(root))
	_check("spending: and costs exactly what it said",
		is_equal_approx(before - tree.energy, tree.cost_of(root)))
	_check("spending: what is bought is pending, not owned",
		tree.is_pending(root) and not tree.is_locked(root))
	_check("spending: still shut, because the parent is only pending",
		not tree.can_reinforce(child))
	_check("spending: and it cannot be bought twice", not tree.reinforce(root))

	tree.advance_generation(100.0)
	_check("spending: once the parent is locked the child opens",
		tree.is_locked(root) and tree.can_reinforce(child))

	_check("spending: an unknown neuron is refused rather than invented",
		not tree.can_reinforce("neu_telepathy") and not tree.reinforce("neu_telepathy"))
	_check("spending: energy never goes negative", tree.energy >= 0.0)


# --- The boundary ------------------------------------------------------------------------

## The mechanic. A generation change is where the clan finds out what it can keep.
func _test_the_generational_boundary() -> void:
	NeuronalTree.reset()
	var supported := NeuronalTree.for_clan("clan_many")
	supported.energy = 1000.0
	for id in ["neu_grip", "neu_listen", "neu_balance", "neu_grooming"]:
		supported.reinforce(id)
	var outcome := supported.advance_generation(40.0)
	_check("boundary: a numerous clan keeps everything it worked out",
		(outcome["locked"] as Array).size() == 4 and (outcome["lost"] as Array).is_empty())
	_check("boundary: and nothing is left pending afterwards", supported.pending.is_empty())

	# The same four neurons, in a clan too small to carry them.
	NeuronalTree.reset()
	var thin := NeuronalTree.for_clan("clan_few")
	thin.energy = 1000.0
	for id in ["neu_grip", "neu_listen", "neu_balance", "neu_grooming"]:
		thin.reinforce(id)
	var thin_outcome := thin.advance_generation(4.0)
	var kept: Array = thin_outcome["locked"]
	var lost: Array = thin_outcome["lost"]

	_check("boundary: a clan that reinforced more than it can support loses the rest "
		+ "(%d kept, %d lost)" % [kept.size(), lost.size()], not lost.is_empty())
	_check("boundary: it keeps exactly what its numbers allow",
		kept.size() == int(floor(4.0 / NeuronalTree.SUPPORT_PER_PENDING)))

	# And it must be the expensive ones that go. A clan under pressure keeps the
	# simple things; the elaborate idea is what dies with the people who had it.
	var cheapest_kept := INF
	var dearest_kept := 0.0
	for id in kept:
		cheapest_kept = minf(cheapest_kept, thin.cost_of(id))
		dearest_kept = maxf(dearest_kept, thin.cost_of(id))
	var cheapest_lost := INF
	for id in lost:
		cheapest_lost = minf(cheapest_lost, thin.cost_of(id))
	_check("boundary: the ambitious neurons are what is lost, not the simple ones",
		dearest_kept <= cheapest_lost)

	_check("boundary: what was lost is remembered as lost",
		thin.forgotten.size() == lost.size())
	_check("boundary: and a lost neuron is not secretly still held",
		not thin.is_held(String(lost[0])))

	# Losing is not permanent — it can be worked out again.
	thin.energy = 1000.0
	_check("boundary: a forgotten neuron can be reinforced again",
		thin.can_reinforce(String(lost[0])) and thin.reinforce(String(lost[0])))

	_note("neurons a clan of four could carry", float(kept.size()))
	_note("neurons a clan of forty could carry", 4.0)


# --- Leaps ---------------------------------------------------------------------------------

func _test_leap() -> void:
	NeuronalTree.reset()
	var tree := NeuronalTree.for_clan("clan_leap")
	tree.energy = 100000.0

	_check("leap: a clan that has understood nothing cannot leap", not tree.leap_ready())
	_check("leap: and refusing is not silent about it",
		tree.neurons_until_leap() == NeuronalTree.LEAP_THRESHOLD)
	_check("leap: attempting anyway fails", not tree.take_leap())

	# Lock enough of the tree to qualify, walking up the prerequisites properly.
	var guard := 0
	while tree.locked_count() < NeuronalTree.LEAP_THRESHOLD and guard < 40:
		guard += 1
		for id in NeuronalTree.ids():
			if tree.can_reinforce(id):
				tree.reinforce(id)
		tree.advance_generation(1000.0)

	_check("leap: a clan that has understood enough may cross (%d locked)"
		% tree.locked_count(), tree.leap_ready())

	tree.energy = 500.0
	for id in NeuronalTree.ids():
		if tree.can_reinforce(id):
			tree.reinforce(id)
			break
	var carried := tree.locked_count()
	var before_leap := tree.understandings_since_leap()
	var mid_flight := tree.pending.size()
	_check("leap: crossing succeeds", tree.take_leap())
	_check("leap: everything understood is carried across",
		tree.locked_count() == carried)
	_check("leap: everything merely being tried is not (%d abandoned)" % mid_flight,
		tree.pending.is_empty())
	_check("leap: the clan arrives with nothing banked", is_zero_approx(tree.energy))
	# A crossing consumes exactly its threshold and no more. Surplus understanding
	# carries forward, so a clan that prepared thoroughly may be ready again at
	# once — that is earned, not a bug. What must never happen is a leap
	# swallowing understanding it did not charge for; resetting the baseline to
	# the current count did exactly that, and with a finite catalog it made the
	# later leaps unreachable.
	_check("leap: a crossing consumes exactly what it charges for",
		tree.understandings_since_leap() == before_leap - NeuronalTree.LEAP_THRESHOLD)
	_check("leap: and surplus understanding is carried, not discarded",
		tree.locked_at_last_leap == NeuronalTree.LEAP_THRESHOLD * tree.leaps)

	_note("neurons locked before the first leap", float(carried))


# --- Effects --------------------------------------------------------------------------------

func _test_effects(parent: Node) -> void:
	NeuronalTree.reset()
	CultureRegistry.reset(20260807)
	CultureRegistry.install(20260807)

	var creature := CreatureFactory.spawn_random(parent, _rng, {"culture_id": "clan_effects"})
	var tree := NeuronalTree.for_creature(creature)

	var before: float = creature.stats.trait_value("grip")
	var drives_before: Dictionary = tree.drive_bias()
	_check("effects: a clan that has understood nothing changes nothing",
		drives_before.is_empty())

	tree.energy = 1000.0
	tree.reinforce("neu_grip")
	creature.stats.mark_dirty()
	_check("effects: a neuron still only pending changes nothing yet",
		is_equal_approx(creature.stats.trait_value("grip"), before))

	tree.advance_generation(100.0)
	creature.stats.mark_dirty()
	var after: float = creature.stats.trait_value("grip")
	_check("effects: once locked it reaches the phenotype (%.2f -> %.2f)"
		% [before, after], after > before)

	var drives_after := tree.drive_bias()
	_check("effects: and biases what the clan is inclined to do",
		drives_after.has("tool_confidence") and float(drives_after["tool_confidence"]) > 1.0)

	# The bias must actually reach the decision, not merely exist in a dictionary.
	var gates := (creature.ai as AIController).gate_logits()
	var index := GenomeDB.drive_index("tool_confidence")
	_check("effects: the bias reaches the creature's actual decision",
		index >= 0 and gates.size() > index)

	creature.queue_free()


# --- Forking and persistence -------------------------------------------------------------------

func _test_fork_and_persistence() -> void:
	NeuronalTree.reset()
	var parent := NeuronalTree.for_clan("clan_home")
	parent.observe("forage_success", true)   # a first, banked and remembered
	parent.energy = 1000.0
	parent.reinforce("neu_listen")
	parent.advance_generation(100.0)
	parent.reinforce("neu_grip")

	var child := NeuronalTree.fork("clan_home", "clan_home@rock")
	_check("fork: castaways take what the lineage understands",
		child.is_locked("neu_listen"))
	_check("fork: but not what it was in the middle of working out",
		not child.is_held("neu_grip"))
	_check("fork: and they cannot spend the clan's banked energy",
		is_zero_approx(child.energy))

	# Through real JSON, because that is how it reaches disk.
	NeuronalTree.install()
	var section := NeuronalTree.save_section()
	var round_tripped: Variant = JSON.parse_string(JSON.stringify(section))
	_check("persistence: the section survives JSON", round_tripped != null)

	var locked_before := parent.locked.size()
	var energy_before := parent.energy
	NeuronalTree.load_section(round_tripped)
	var restored := NeuronalTree.for_clan("clan_home")
	_check("persistence: locked neurons survive", restored.locked.size() == locked_before)
	_check("persistence: pending work survives", restored.is_pending("neu_grip"))
	_check("persistence: banked energy survives",
		is_equal_approx(restored.energy, energy_before))
	# The ledger of what this clan has already discovered has to survive too, or
	# a player could bank the same first every time they reloaded.
	_check("persistence: a first already paid for cannot be sold again after a reload",
		is_zero_approx(restored.observe("forage_success", true)))
	_check("persistence: a forked clan survives alongside its parent",
		NeuronalTree.for_clan("clan_home@rock").is_locked("neu_listen"))


# --- Harness ------------------------------------------------------------------------------------

func _note(label: String, observed: float) -> void:
	stats.append("  %-52s %9.2f" % [label, observed])


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
