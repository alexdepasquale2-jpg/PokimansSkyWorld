extends RefCounted
class_name StakesSelfTest

## Can this game be lost?
##
## Until now the honest answer was no, in three compounding ways: neglect could
## not kill (needs drained health to zero and nothing checked it), there was no
## extinction condition, and there was no goal to fall short of. A player could
## do everything right or nothing at all and the game responded identically.
##
## THE ASSERTION THIS SUITE EXISTS FOR is the one at the bottom of
## `_test_decline_costs_understanding`: a clan that loses people must lose things
## it had worked out. That is where the stakes stop being a number and start
## touching the simulation — and it was previously unreachable, because member
## count could only ever rise. If it regresses, the neuronal tree quietly becomes
## a ratchet again and half of what makes this game interesting is decorative.

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
	_rng.seed = 20260808

	_test_neglect_kills(parent)
	_test_the_tough_collapse_first(parent)
	_test_decline_costs_understanding()
	_test_the_boundary_counts_the_living(parent)
	_test_extinction()
	_test_triumph()
	_test_arc_persistence()

	NeuronalTree.reset()
	CultureRegistry.reset()
	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Death -----------------------------------------------------------------------

func _test_neglect_kills(parent: Node) -> void:
	var creature := _spawn(parent)
	var died: Array[String] = []
	var handler := func(uid: StringName, cause: String, _tick: int):
		died.append(cause)
	EventBus.creature_died.connect(handler)

	_check("death: a creature starts alive", not creature.needs.is_dead())

	# Starve it. Nothing feeds it, nothing heals it.
	var guard := 0
	while not creature.needs.is_dead() and guard < 400:
		guard += 1
		creature.needs.tick(1.0)

	_check("death: neglect eventually kills (%d days)" % guard, creature.needs.is_dead())
	_check("death: and it is reported as starvation",
		died.size() >= 1 and died[0] == "starvation")
	_note("in-game days from full health to death by neglect", float(guard))

	# Death fires exactly once. StoryDirector, the culture router and the arc all
	# listen; none of them survive hearing it twice.
	var before := died.size()
	for _i in 20:
		creature.needs.tick(1.0)
	_check("death: and is announced exactly once", died.size() == before)

	# A dead creature stops participating entirely.
	var travelled_before: float = creature.stats.age_days
	creature.tick_days(5.0)
	_check("death: the dead do not go on living",
		is_equal_approx(creature.stats.age_days, travelled_before))

	EventBus.creature_died.disconnect(handler)
	creature.queue_free()


## Death must behave the way combat already made it behave, or the game has two
## different rules for dying depending on what killed you.
func _test_the_tough_collapse_first(parent: Node) -> void:
	var creature := _spawn(parent)
	creature.stats.age_days = creature.stats.stat("max_age_days") * 0.5   # prime of life
	creature.needs.health = 0.0
	creature.needs.hunger = 0.0

	creature.needs.tick(0.1)
	_check("death: a healthy adult collapses before it dies",
		creature.stats.downed and not creature.needs.is_dead())

	# Still nobody comes.
	var guard := 0
	while not creature.needs.is_dead() and guard < 50:
		guard += 1
		creature.needs.tick(1.0)
	_check("death: and dies if nobody helps it back up", creature.needs.is_dead())
	creature.queue_free()

	# The fragile do not get the grace period.
	var infant := _spawn(parent)
	infant.stats.age_days = 0.0
	infant.needs.health = 0.0
	infant.needs.hunger = 0.0
	infant.needs.tick(0.1)
	_check("death: the very young and the very old die outright",
		infant.needs.is_dead() or not infant.stats.is_fragile())
	infant.queue_free()


# --- The point of it all -----------------------------------------------------------

## A clan that loses people loses what it had worked out.
##
## This is the assertion the whole suite is for. It was impossible to reach
## before neglect could kill, because support only ever rose.
func _test_decline_costs_understanding() -> void:
	NeuronalTree.reset()
	var tree := NeuronalTree.for_clan("clan_decline")
	tree.energy = 1000.0
	for id in ["neu_grip", "neu_listen", "neu_balance", "neu_grooming"]:
		tree.reinforce(id)

	# A strong clan carries all of it.
	var strong := tree.advance_generation(40.0)
	_check("stakes: a strong clan keeps everything it worked out",
		(strong["lost"] as Array).is_empty())

	# The same clan, thinned by death, cannot.
	tree.energy = 1000.0
	for id in NeuronalTree.ids():
		if tree.can_reinforce(id):
			tree.reinforce(id)
	var pending_before := tree.pending.size()
	var thinned := tree.advance_generation(2.0)

	_check("stakes: a clan thinned by death loses what it cannot support "
		+ "(%d pending, %d lost)" % [pending_before, (thinned["lost"] as Array).size()],
		not (thinned["lost"] as Array).is_empty())
	_note("understandings lost by a clan of two", float((thinned["lost"] as Array).size()))

	stats.append("  a clan of two could hold %d of %d things it had worked out"
		% [(thinned["locked"] as Array).size(), pending_before])


## The number the player is warned with must be the number the boundary uses.
##
## `_test_decline_costs_understanding` above proves the TREE can lose things when
## it is told the clan is small. It says nothing about whether the game ever
## tells it that, and the honest answer in play was no: the boundary took its
## support from `culture.member_count`, which `note_birth` only increments. Births
## raised it, deaths never lowered it, so support climbed forever and nothing was
## ever lost — while the Understandings screen counted the party and the HUD
## counted the party plus settlers and both promised a loss that could not come.
##
## Driven through `CultureRegistry.note_birth`, the one call site the game uses,
## with real creatures registered with the simulation. A test that reached past
## it into `NeuronalTree.advance_generation` would be testing the thing that was
## never broken.
func _test_the_boundary_counts_the_living(parent: Node) -> void:
	NeuronalTree.reset()
	CultureRegistry.reset(20260811)
	CultureRegistry.install(20260811)
	var culture := CultureRegistry.ensure("clan_counted", "The Counted")
	culture.ensure_nets()

	var clan: Array[Creature] = []
	for _i in 8:
		var c := CreatureFactory.spawn_random(parent, _rng, {"culture_id": "clan_counted"})
		c.stats.initialize_vitals()
		clan.append(c)

	_check("living: the registry counts everyone in the clan (%d)"
		% CultureRegistry.living_members("clan_counted"),
		CultureRegistry.living_members("clan_counted") == 8)

	# Births raise the cumulative record. They must not be what support is read
	# from — that was the bug.
	var recorded_before := culture.member_count
	for _i in 5:
		culture.note_birth(culture.generation)
	_check("living: births raise the record but not the count of the living",
		culture.member_count == recorded_before + 5
			and CultureRegistry.living_members("clan_counted") == 8)

	# Bank more than a thinned clan could carry. Only the root of each branch is
	# reachable before anything has locked, which is four — comfortably more than
	# two survivors can hold, which is the case this test is about.
	var tree := NeuronalTree.for_clan("clan_counted")
	tree.energy = 100000.0
	for id in NeuronalTree.ids():
		if tree.can_reinforce(id):
			tree.reinforce(id)
	var pending_before := tree.pending.size()
	_check("living: the clan has more provisional than two of them could hold",
		pending_before > int(floor(2.0 / NeuronalTree.SUPPORT_PER_PENDING)))

	# Now kill most of them, the way neglect does.
	for i in range(6):
		var c := clan[i]
		var guard := 0
		while not c.needs.is_dead() and guard < 400:
			guard += 1
			c.needs.tick(1.0)
	var survivors := CultureRegistry.living_members("clan_counted")
	_check("living: death lowers it (%d left of 8)" % survivors, survivors == 2)

	# And the boundary, reached the way the game reaches it, must act on that.
	# Appended into, never reassigned: a GDScript lambda captures locals by value,
	# so `lost_ids = ids` inside the handler would leave this array empty and the
	# assertion below would quietly pass on nothing.
	var lost_ids: Array = []
	var handler := func(_clan: String, ids: Array): lost_ids.append_array(ids)
	EventBus.neurons_lost.connect(handler)
	CultureRegistry.note_birth("clan_counted", culture.generation + 1)
	EventBus.neurons_lost.disconnect(handler)

	_check("living: a generation turning over on a clan of two costs them "
		+ "understandings (%d of %d lost)" % [lost_ids.size(), pending_before],
		not lost_ids.is_empty())
	_check("living: and it is the boundary the game actually calls that does it",
		tree.pending.is_empty() and tree.locked.size() < pending_before)
	stats.append("  a clan cut from eight to two kept %d of %d understandings"
		% [tree.locked.size(), pending_before])

	for c in clan:
		c.queue_free()
	NeuronalTree.reset()
	CultureRegistry.reset()


# --- Extinction ---------------------------------------------------------------------

func _test_extinction() -> void:
	NeuronalTree.reset()
	CultureRegistry.reset(20260808)
	var arc := CampaignArc.new("clan_doomed")
	var ended: Array[Dictionary] = []
	var handler := func(_clan: String, outcome: int, chronicle: Dictionary):
		ended.append({"outcome": outcome, "chronicle": chronicle})
	EventBus.campaign_ended.connect(handler)

	# A campaign that has not begun must not immediately register extinction.
	_check("extinction: an empty campaign has not been lost",
		arc.evaluate(0) == CampaignArc.Outcome.UNRESOLVED and not arc.is_resolved())

	arc.evaluate(6)
	_check("extinction: a living clan is unresolved", not arc.is_resolved())
	_check("extinction: and its strength is remembered", arc.peak_members == 6)

	var warned: Array[int] = []
	var warn_handler := func(_clan: String, living: int): warned.append(living)
	EventBus.lineage_imperilled.connect(warn_handler)
	arc.evaluate(1)
	_check("extinction: a clan down to its last is warned once", warned.size() == 1)
	arc.evaluate(1)
	_check("extinction: and not nagged every frame", warned.size() == 1)
	EventBus.lineage_imperilled.disconnect(warn_handler)

	arc.note_death()
	_check("extinction: the last death ends the run",
		arc.evaluate(0) == CampaignArc.Outcome.EXTINCTION)
	_check("extinction: and it is announced", ended.size() == 1)
	_check("extinction: exactly once — a resolved run stays resolved",
		arc.evaluate(0) == CampaignArc.Outcome.UNRESOLVED and ended.size() == 1)

	var lines := LoreVoice.ending_lines(
		CampaignArc.Outcome.EXTINCTION, arc.chronicle())
	_check("extinction: the ending says what they were, not a score",
		not lines.is_empty() and not "\n".join(lines).contains("%"))
	stats.append("  ending: %s" % lines[0].replace("[b]", "").replace("[/b]", ""))

	EventBus.campaign_ended.disconnect(handler)


# --- Triumph ---------------------------------------------------------------------------

func _test_triumph() -> void:
	NeuronalTree.reset()
	var arc := CampaignArc.new("clan_bound")
	var tree := NeuronalTree.for_clan("clan_bound")

	_check("triumph: a new clan is a long way off",
		arc.leaps_remaining() == CampaignArc.EVOLUTION_LEAPS_TO_WIN
			and arc.progress() < 0.2)

	# Walk the tree until the ambition is met.
	var guard := 0
	while arc.leaps_taken() < CampaignArc.EVOLUTION_LEAPS_TO_WIN and guard < 200:
		guard += 1
		tree.energy = 100000.0
		for id in NeuronalTree.ids():
			if tree.can_reinforce(id):
				tree.reinforce(id)
		tree.advance_generation(1000.0)
		if tree.leap_ready():
			tree.take_leap()

	_note("neurons locked climbing to the ambition", float(tree.locked_count()))
	_check("triumph: the ambition is reachable (%d leaps)" % arc.leaps_taken(),
		arc.leaps_taken() >= CampaignArc.EVOLUTION_LEAPS_TO_WIN)
	_check("triumph: progress moved with it", arc.progress() >= 1.0)
	_check("triumph: crossing enough leaps wins the run",
		arc.evaluate(10) == CampaignArc.Outcome.TRIUMPH)

	# Winning outranks losing: a run already carried across is not undone.
	_check("triumph: and cannot then be lost",
		arc.evaluate(0) == CampaignArc.Outcome.UNRESOLVED
			and arc.outcome == CampaignArc.Outcome.TRIUMPH)

	var lines := LoreVoice.ending_lines(CampaignArc.Outcome.TRIUMPH, arc.chronicle())
	_check("triumph: the ending names what they understood",
		"\n".join(lines).to_lower().contains("understood"))
	_note("leaps needed to carry the bloodline", float(CampaignArc.EVOLUTION_LEAPS_TO_WIN))


# --- Persistence --------------------------------------------------------------------------

func _test_arc_persistence() -> void:
	var arc := CampaignArc.new("clan_saved")
	arc.evaluate(5)
	arc.note_death()
	arc.note_death()

	var round_tripped: Variant = JSON.parse_string(JSON.stringify(arc.to_dict()))
	_check("persistence: the arc survives JSON", round_tripped != null)
	var restored := CampaignArc.from_dict(round_tripped)
	_check("persistence: deaths survive", restored.deaths == 2)
	_check("persistence: the clan's high-water strength survives",
		restored.peak_members == 5)
	_check("persistence: an unresolved run reloads unresolved", not restored.is_resolved())

	# And a finished run must stay finished across a reload, or a player could
	# reload their way out of extinction.
	arc.evaluate(0)
	var finished := CampaignArc.from_dict(
		JSON.parse_string(JSON.stringify(arc.to_dict())))
	_check("persistence: a lost run cannot be reloaded back into life",
		finished.is_resolved() and finished.outcome == CampaignArc.Outcome.EXTINCTION)


# --- Harness ---------------------------------------------------------------------------------

func _spawn(parent: Node) -> Creature:
	var creature := CreatureFactory.spawn_random(parent, _rng, {"culture_id": "clan_stakes"})
	creature.stats.initialize_vitals()
	return creature


func _note(label: String, observed: float) -> void:
	stats.append("  %-52s %9.2f" % [label, observed])


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
