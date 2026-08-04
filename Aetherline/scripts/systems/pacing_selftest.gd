extends RefCounted
class_name PacingSelfTest

## How long does this campaign actually take, and can it be finished?
##
## EVERY NUMBER IN THE PROGRESSION WAS INVENTED. Three evolution leaps to win.
## Six understandings per crossing. Two living members per pending neuron. A
## generation every sixty days. Eight in-game days from full
## health to starvation. Not one of them came from watching a campaign run, and
## nothing in the project could watch one, because the suites drive systems
## directly — `StakesSelfTest` proves the ambition reachable by handing the tree
## a thousand support and unlimited energy, which tells you nothing about whether
## a player gets there.
##
## So this plays one forward. A competent clan, through the real router, real
## decisions, the real generational clock and a spending policy a reasonable
## player would follow, for three in-game years. It reports what happened.
##
## THE ASSERTIONS AND THE MEASUREMENTS ARE DIFFERENT THINGS and the split is
## deliberate. Asserted: the campaign is finishable, generations turn, nothing
## runs away. Those must hold whatever the tuning is, and if they break the game
## is broken rather than badly balanced. Measured and printed: how many days,
## how much was kept, how much was lost. Those are somebody's judgement call, and
## a test that asserted them would be freezing a guess into a requirement.
##
## TIME. One in-game day is 1200 ticks at 60Hz — twenty real seconds. Village
## life teaches every 2.8 real seconds, so roughly seven lessons a day. Three
## in-game years is about three hours of play, which is the scale the campaign
## is pitched at.

## Ticks per in-game day, from SimulationBudget. Hardcoded because a `const`
## cannot reference an autoload at parse time.
const TICKS_PER_DAY: int = 1200

## SettlementRuntime.LIFE_TICK is 2.8 real seconds against a 20-second day.
const LESSONS_PER_DAY: int = 7

## Three in-game years.
const SIM_DAYS: int = 1080

## What the player starts with and keeps alive.
const CLAN_SIZE: int = 6

## What village life actually teaches, from SettlementRuntime._village_life_lesson.
const LESSON_POOL: Array[String] = [
	"forage_success", "creature_calmed", "biomes_entered", "anomaly_investigated",
	"protect_ally", "threat_foreseen", "distance_travelled", "creature_tended",
]

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()

var stats: Array[String] = []

var _clan: Array[Creature] = []
var _router: CultureRewardRouter = null
var _growth: ClanGrowth = null
var _culture: CultureResource = null
var _tree: NeuronalTree = null
var _arc: CampaignArc = null
var _timeline: Array[String] = []
var _generations: int = 0
var _locked_total: int = 0
var _lost_total: int = 0
var _energy_earned: float = 0.0
var _leap_days: Array[int] = []


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	stats.clear()
	_rng.seed = 20260812

	var restore_tick := SimulationBudget.current_tick
	_test_both_clocks_agree(parent)
	_test_a_tended_clan_grows(parent)
	_play(parent)
	_report()
	_test_the_campaign_survives_a_reload()
	_test_the_panels_can_read_it(parent)
	SimulationBudget.current_tick = restore_tick

	_teardown()
	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- One clock -----------------------------------------------------------------------

## A clan ages at the same rate whether or not anybody is looking at it.
##
## It did not. An unwatched colony aged by DAYS, one generation per lifetime,
## which is what `age_unattended` is for. A watched one aged by GRADIENT
## THROUGHPUT, which came out at anywhere from 21 to 169 days depending on how
## converged the reward baseline happened to be. Leave a colony for three
## hundred days and it aged once; stay with it and it aged five times. Nothing
## caught it because the two paths were never compared.
##
## The second half of this — that a clan nobody is simulating does not age here
## at all — is the guard against the opposite mistake. Dormant colonists are
## still alive and still registered, so counting them as present would age their
## culture day by day AND hand it the whole absence again on return.
func _test_both_clocks_agree(parent: Node) -> void:
	NeuronalTree.reset()
	CultureRegistry.reset(20260813)
	CultureRegistry.install(20260813)

	var span := CultureResource.GENERATION_DAYS * 3.0
	var watched: Array[Creature] = []
	for _i in 2:
		var c := CreatureFactory.spawn_random(parent, _rng, {"culture_id": "clan_watched"})
		c.stats.initialize_vitals()
		watched.append(c)

	var absent := CultureRegistry.ensure("clan_absent", "The Left Behind")
	absent.ensure_nets()
	var dormant := CreatureFactory.spawn_random(parent, _rng,
		{"culture_id": "clan_absent"})
	dormant.stats.initialize_vitals()
	SimulationBudget.set_lod(dormant.identity.uid, AetherTypes.SimLOD.DORMANT)

	for _day in int(span):
		CultureRegistry.age_simulated(1.0)

	var here := CultureRegistry.get_culture("clan_watched")
	_check("clock: a watched clan ages three generations in three lifetimes (%d)"
		% here.generation, here.generation == 3)
	_check("clock: and a clan nobody is simulating does not age with it",
		absent.generation == 0)

	# The same span, handed over as an absence.
	var passed := absent.age_unattended(span)
	_check("clock: an absence buys exactly the same generations (%d)" % passed,
		passed == 3 and absent.generation == here.generation)

	for c in watched:
		c.queue_free()
	dormant.queue_free()
	NeuronalTree.reset()
	CultureRegistry.reset()


# --- Growth --------------------------------------------------------------------------

## A clan that is looked after grows; a starving one does not.
##
## The ceiling on everything the neuronal tree does is the number of living
## members — `floor(living / SUPPORT_PER_PENDING)` provisional understandings
## survive a boundary — and until now that number could only fall. `BreedingSystem`
## has been complete since Phase 1 and was reachable in play from exactly one
## place: paying for it at a settlement.
func _test_a_tended_clan_grows(parent: Node) -> void:
	NeuronalTree.reset()
	CultureRegistry.reset(20260814)
	CultureRegistry.install(20260814)

	var growth := ClanGrowth.new()
	growth.rng.seed = 20260814
	growth.nursery = parent
	parent.add_child(growth)

	var clan: Array[Creature] = []
	for _i in 4:
		var c := CreatureFactory.spawn_random(parent, _rng, {"culture_id": "clan_grown"})
		c.stats.initialize_vitals()
		# Fed, whole and grown — every condition the player controls.
		c.stats.age_days = c.stats.stat("max_age_days") * 0.4
		c.needs.feed(1.0)
		c.needs.heal(1.0)
		clan.append(c)

	var before := CultureRegistry.living_members("clan_grown")
	var child := growth.attempt("clan_grown")
	_check("growth: a fed, whole clan produces a child", child != null)
	_check("growth: and the support arithmetic counts them (%d -> %d)"
		% [before, CultureRegistry.living_members("clan_grown")],
		CultureRegistry.living_members("clan_grown") == before + 1)
	if child != null:
		_check("growth: the child belongs to its parents' clan",
			CultureRegistry.culture_for(child).culture_id == "clan_grown")
		_check("growth: and inherits what the lineage understands, not a fresh tree",
			NeuronalTree.for_creature(child) == NeuronalTree.for_clan("clan_grown"))

	# One at a time. A boundary that can double a clan makes the support
	# arithmetic meaningless, whatever the parents' litter_size says.
	_check("growth: exactly one, never a litter", growth.births == 1)

	# Starve them and it stops. This is the half that makes growth a reward
	# rather than a timer.
	for c in clan:
		c.needs.hunger = 0.1
	var refused_at := growth.births
	growth.attempt("clan_grown")
	_check("growth: a starving clan does not have children",
		growth.births == refused_at)

	for c in clan:
		c.needs.feed(1.0)
	# And it stops at the ceiling rather than filling the world.
	var guard := 0
	while growth.births < ClanGrowth.CLAN_SOFT_CAP + 4 and guard < 40:
		guard += 1
		var born := growth.attempt("clan_grown")
		if born != null:
			born.needs.feed(1.0)
			born.needs.heal(1.0)
			born.stats.age_days = born.stats.stat("max_age_days") * 0.4
	_check("growth: and stops at the clan's ceiling (%d living)"
		% CultureRegistry.living_members("clan_grown"),
		CultureRegistry.living_members("clan_grown") <= ClanGrowth.CLAN_SOFT_CAP)

	# THE RECURSION GUARD. Breeding calls note_birth, which can advance a
	# generation, which emits the signal this listens to. Unguarded, one boundary
	# breeds a clan into the ceiling in a single frame and the loop is invisible
	# from any one call site.
	var births_before := growth.births
	EventBus.culture_generation_advanced.emit("clan_grown", 1, 0.5)
	_check("growth: a boundary cannot re-enter itself",
		growth.births - births_before <= 1)

	growth.free()
	for c in clan:
		c.queue_free()
	NeuronalTree.reset()
	CultureRegistry.reset()


# --- The run ---------------------------------------------------------------------

func _play(parent: Node) -> void:
	NeuronalTree.reset()
	CultureRegistry.reset(20260812)
	CultureRegistry.install(20260812)

	_culture = CultureRegistry.ensure("clan_pacing", "The Measured")
	_culture.ensure_nets()
	_tree = NeuronalTree.for_clan("clan_pacing")
	_arc = CampaignArc.new("clan_pacing")

	_router = CultureRewardRouter.new()
	parent.add_child(_router)

	# The clan grows if it is looked after, which is the arc the whole support
	# arithmetic is built on: more living members, more understandings survive a
	# boundary. Measuring a campaign with a fixed clan measured a floor.
	_growth = ClanGrowth.new()
	_growth.rng.seed = 20260812
	_growth.nursery = parent
	parent.add_child(_growth)

	var energy_handler := func(_clan_id: String, _kind: String, gained: float, _first: bool):
		_energy_earned += gained
	var locked_handler := func(_clan_id: String, ids: Array): _locked_total += ids.size()
	var lost_handler := func(_clan_id: String, ids: Array): _lost_total += ids.size()
	EventBus.neuronal_energy_gained.connect(energy_handler)
	EventBus.neurons_locked.connect(locked_handler)
	EventBus.neurons_lost.connect(lost_handler)

	for _i in CLAN_SIZE:
		var c := CreatureFactory.spawn_random(parent, _rng, {"culture_id": "clan_pacing"})
		c.stats.initialize_vitals()
		_clan.append(c)

	for day in SIM_DAYS:
		_live_a_day(day)
		if _arc.leaps_taken() >= CampaignArc.EVOLUTION_LEAPS_TO_WIN:
			break

	EventBus.neuronal_energy_gained.disconnect(energy_handler)
	EventBus.neurons_locked.disconnect(locked_handler)
	EventBus.neurons_lost.disconnect(lost_handler)


func _live_a_day(day: int) -> void:
	for _lesson in LESSONS_PER_DAY:
		SimulationBudget.current_tick += TICKS_PER_DAY / LESSONS_PER_DAY
		var c := _someone_alive()
		if c == null:
			return

		# A decision, then something that happened. This order matters: the
		# router pays backward over the trace, so a reward with no decision
		# behind it teaches nothing, which is exactly how village life works.
		c.ai.decide_from(Perception.compose(c), true)
		var kind: String = LESSON_POOL[_rng.randi() % LESSON_POOL.size()]
		var amount := 0.35 + _rng.randf() * 0.4
		if kind == "distance_travelled":
			amount = 20.0 + _rng.randf() * 40.0
		c.experience.log_event(kind, amount)

		_spend_like_a_player(day)

	# A player who is on top of it: nobody goes hungry and nobody is worked into
	# the ground. Deliberately the optimistic arm — neglect is StakesSelfTest's
	# subject, and what is being measured here is how fast progression moves when
	# attrition is not eating it. A first pass fed half a day's hunger and rested
	# less than the daily drain, and five of six died inside a month; that says
	# something about the needs curve, but it was measuring the wrong thing.
	for c in _living_clan():
		# `tick_days` first, exactly as `Creature._on_day_passed` does it in play.
		# A first pass ticked only needs, so nobody in the clan ever got a day
		# older — and since ClanGrowth will not breed a creature younger than 15%
		# of its lifespan, that quietly meant a clan that could never have
		# children: 36 boundaries passed, 0 born, and the readout said "6 living"
		# at the end of three years without ever explaining why.
		c.tick_days(1.0)
		c.needs.tick(1.0)
		c.needs.feed(1.0)
		c.needs.rest(1.0)
		c.needs.heal(0.2)

	# The day the clan just lived, through CultureTicker's own call rather than a
	# copy of it. Copying the boundary rule is what let it be wrong in two places
	# at once, twice.
	CultureRegistry.age_simulated(1.0)
	if _culture.generation > _generations:
		_generations = _culture.generation
		_timeline.append("    day %4d  generation %d · %d locked · %d banked"
			% [day, _culture.generation, _tree.locked_count(), int(_tree.energy)])

	_arc.evaluate(CultureRegistry.living_members("clan_pacing"))


## The policy a reasonable player follows: buy what you can afford, cheapest
## first, and cross the moment the clan has earned it.
##
## Deliberately not an optimal policy. It never saves for an expensive branch and
## never holds back to protect what is pending, so it is a floor on what the
## campaign yields, not a ceiling.
func _spend_like_a_player(day: int) -> void:
	var affordable := _tree.affordable_ids()
	while not affordable.is_empty():
		var cheapest: String = affordable[0]
		for id in affordable:
			if _tree.cost_of(id) < _tree.cost_of(cheapest):
				cheapest = id
		if not _tree.reinforce(cheapest):
			break
		affordable = _tree.affordable_ids()

	if _tree.leap_ready() and _tree.take_leap():
		_leap_days.append(day)
		_timeline.append("    day %4d  EVOLUTION LEAP %d · %d understandings held"
			% [day, _tree.leaps, _tree.locked_count()])
		_arc.evaluate(CultureRegistry.living_members("clan_pacing"))


func _someone_alive() -> Creature:
	var living := _living_clan()
	if living.is_empty():
		return null
	return living[_rng.randi() % living.size()]


## Everyone in the clan, including anybody born into it since the run started —
## children are not in `_clan`, they arrive through ClanGrowth and register
## themselves, which is how the real game learns about them too.
func _living_clan() -> Array[Creature]:
	var living: Array[Creature] = []
	for uid in SimulationBudget.uids():
		var node := SimulationBudget.node_for(StringName(uid)) as Creature
		if node == null or not is_instance_valid(node) or node.identity == null:
			continue
		if CultureRegistry.culture_for(node).culture_id != "clan_pacing":
			continue
		if node.needs == null or node.needs.is_dead():
			continue
		living.append(node)
	return living


# --- What it cost ------------------------------------------------------------------

func _report() -> void:
	var days: int = SIM_DAYS if _leap_days.is_empty() \
		else _leap_days[_leap_days.size() - 1]
	var reinforced := _locked_total + _lost_total

	# --- Assertions: true whatever the tuning is ---

	_check("pacing: the clan learns something from village life (%d applies)"
		% _culture.live.applies, _culture.live.applies > 0)
	_check("pacing: generations turn on their own (%d in %d days)"
		% [_generations, SIM_DAYS], _generations > 0)
	_check("pacing: doing things earns understanding (%.0f energy)" % _energy_earned,
		_energy_earned > 0.0)
	_check("pacing: and understanding is committed to (%d reinforced)" % reinforced,
		reinforced > 0)

	# THE ONE THAT MATTERS. A campaign that cannot be finished by a competent
	# player inside its intended length is not badly balanced, it is broken —
	# and nothing before this suite could tell the difference, because the
	# stakes tests reach the ambition by handing the tree infinite support.
	_check("pacing: a competent clan can finish the campaign (%d/%d leaps in %d days)"
		% [_arc.leaps_taken(), CampaignArc.EVOLUTION_LEAPS_TO_WIN, days],
		_arc.leaps_taken() >= CampaignArc.EVOLUTION_LEAPS_TO_WIN)

	# And must not finish it by accident on the first afternoon.
	if not _leap_days.is_empty():
		_check("pacing: but not immediately (first crossing on day %d)" % _leap_days[0],
			_leap_days[0] >= 30)

	_check("pacing: nothing ran away", is_finite(_tree.energy)
		and _tree.locked_count() <= NeuronalTree.ids().size())

	# --- Measurements: somebody's judgement call, printed rather than asserted ---

	stats.append("  a competent clan of %d, three in-game years, no neglect:" % CLAN_SIZE)
	stats.append("")
	_note("in-game days to carry the bloodline across", float(days))
	_note("gradient applications the clan lived through", float(_culture.live.applies))
	_note("in-game days per generation", CultureResource.GENERATION_DAYS)
	_note("energy still banked, unspent", _tree.energy)
	_note("understandings the catalog offers", float(NeuronalTree.ids().size()))
	_note("real hours of play, at twenty seconds a day", float(days) * 20.0 / 3600.0)
	_note("generations that turned over", float(_generations))
	_note("neuronal energy earned in total", _energy_earned)
	_note("understandings locked into the lineage", float(_locked_total))
	_note("understandings lost at a boundary", float(_lost_total))
	if reinforced > 0:
		_note("share of what they worked out that survived",
			float(_locked_total) / float(reinforced))
	_note("children born into the clan", float(_growth.births))
	_note("attempts that produced nobody", float(_growth.refusals))
	_note("living at the end", float(CultureRegistry.living_members("clan_pacing")))

	if not _timeline.is_empty():
		stats.append("")
		stats.append("  what happened:")
		var shown := _timeline.slice(0, 14)
		for line in shown:
			stats.append(line)
		if _timeline.size() > shown.size():
			stats.append("    … and %d more" % (_timeline.size() - shown.size()))


# --- And then it was put down and picked up again ---------------------------------

## Everything above, through a real file and back.
##
## The individual sections are round-tripped by their own suites, against state
## those suites built a moment earlier. Nothing has ever saved a CAMPAIGN — six
## generations of drift, eighteen locked understandings, a handful the clan lost,
## an arc two crossings in — and the interesting failures live in the difference.
## A clan that reloads one generation younger, or a tree that comes back with its
## forgotten neurons merely absent rather than remembered, are both invisible to
## a test that saves a clean object.
func _test_the_campaign_survives_a_reload() -> void:
	var before := {
		"generation": _culture.generation,
		"applies": _culture.live.applies,
		"days_lived": _culture.days_lived,
		"watermark": _culture.days_at_last_generation,
		"locked": _tree.locked.size(),
		"forgotten": _tree.forgotten.size(),
		"leaps": _tree.leaps,
		"since_leap": _tree.understandings_since_leap(),
		"energy": _tree.energy,
		"weights": _culture.live.to_blob(),
	}

	var document := {
		"cultures": CultureRegistry.save_section(),
		"neurons": NeuronalTree.save_section(),
		"arc": _arc.to_dict(),
	}
	var path := "user://pacing_roundtrip.json"
	_check("reload: the campaign writes to a real file",
		SaveSystem.serialize_to_file(path, document))

	var restored: Dictionary = SaveSystem.deserialize_from_file(path)
	_check("reload: and reads back", not restored.is_empty())

	CultureRegistry.reset()
	NeuronalTree.reset()
	CultureRegistry.load_section(restored.get("cultures", {}))
	NeuronalTree.load_section(restored.get("neurons", {}))
	var culture := CultureRegistry.get_culture("clan_pacing")
	var tree := NeuronalTree.for_clan("clan_pacing")
	var arc := CampaignArc.from_dict(restored.get("arc", {}))

	_check("reload: the clan is the same age it was",
		culture != null and culture.generation == before["generation"])
	# The watermark is what stops the boundary re-firing on load. Without it a
	# reloaded clan sits on a multiple of the cadence and turns a generation
	# immediately, losing everything still provisional.
	_check("reload: and does not turn a generation just for being reloaded",
		is_equal_approx(culture.days_lived, before["days_lived"])
			and is_equal_approx(culture.days_at_last_generation, before["watermark"])
			and not CultureRegistry.press_generation("clan_pacing"))
	_check("reload: what it learned came back bit-for-bit",
		culture.live.to_blob() == before["weights"])
	_check("reload: and how much of it there was",
		culture.live.applies == before["applies"])

	_check("reload: every locked understanding survived (%d)" % before["locked"],
		tree.locked.size() == before["locked"])
	_check("reload: so did the memory of the ones it lost (%d)" % before["forgotten"],
		tree.forgotten.size() == before["forgotten"])
	_check("reload: the crossings it made stand",
		tree.leaps == before["leaps"]
			and tree.understandings_since_leap() == before["since_leap"])
	_check("reload: and it cannot bank its way back to a leap it already took",
		not tree.leap_ready() or before["since_leap"] >= NeuronalTree.LEAP_THRESHOLD)
	_check("reload: banked energy is not created or destroyed",
		is_equal_approx(tree.energy, before["energy"]))
	_check("reload: the run is still won",
		arc.leaps_taken() == _arc.leaps_taken() and arc.is_resolved() == _arc.is_resolved())

	# Restore the live objects so the panels below read the campaign, not a
	# half-loaded copy of it.
	_culture = culture
	_tree = tree
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


## The two screens, against a campaign rather than a fresh object.
##
## Every panel smoke test in the project opens on state built seconds earlier: no
## generations, nothing forgotten, no arc in flight. The assertions those tests
## make — no ids in the plain view, the stakes line warns when it should — have
## never met a clan with a history. This is the only place they do.
func _test_the_panels_can_read_it(parent: Node) -> void:
	var session := GameSession.new()
	parent.add_child(session)
	session.arc = _arc
	for c in _clan:
		if is_instance_valid(c) and not c.needs.is_dead():
			session.enroll(c)
			session.party.accept(c, session.ship)

	var people := PeoplePanel.new()
	parent.add_child(people)
	var people_problems := people.run_smoke_test(session)
	_check("panels: Your People reads a campaign (%s)"
		% ("clean" if people_problems.is_empty() else "; ".join(people_problems)),
		people_problems.is_empty())

	# The one thing a fresh clan cannot exercise: a lineage that has LOST things
	# has to be able to say so, and say so without naming an id.
	people.open(session)
	var prose: String = people._prose.text
	_check("panels: and says what the lineage came to understand",
		prose.contains("What they have understood"))
	if not _tree.forgotten.is_empty():
		_check("panels: including what it could not keep",
			prose.contains("lost:") or prose.contains("Once knew"))
	people.close_panel()
	people.queue_free()

	var neurons := NeuronPanel.new()
	parent.add_child(neurons)
	var neuron_problems := neurons.run_smoke_test(session)
	_check("panels: Understandings reads a campaign (%s)"
		% ("clean" if neuron_problems.is_empty() else "; ".join(neuron_problems)),
		neuron_problems.is_empty())
	neurons.queue_free()

	session.queue_free()


func _teardown() -> void:
	for c in _clan:
		if is_instance_valid(c):
			c.queue_free()
	_clan.clear()
	if _growth != null:
		_growth.free()
		_growth = null
	if _router != null:
		# Freed now, not queued: every suite runs in one frame, and a router that
		# outlives its suite doubles the rewards of every suite after it.
		_router.free()
		_router = null
	NeuronalTree.reset()
	CultureRegistry.reset()


func _note(label: String, observed: float) -> void:
	stats.append("  %-52s %9.2f" % [label, observed])


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
