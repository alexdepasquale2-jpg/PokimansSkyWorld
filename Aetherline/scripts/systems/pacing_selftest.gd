extends RefCounted
class_name PacingSelfTest

## How long does this campaign actually take, and can it be finished?
##
## EVERY NUMBER IN THE PROGRESSION WAS INVENTED. Three evolution leaps to win.
## Six understandings per crossing. Two living members per pending neuron. A
## generation every forty gradient applications. Eight in-game days from full
## health to starvation. Not one of them came from watching a campaign run, and
## nothing in the project could watch one, because the suites drive systems
## directly — `StakesSelfTest` proves the ambition reachable by handing the tree
## a thousand support and unlimited energy, which tells you nothing about whether
## a player gets there.
##
## So this plays one forward. A competent clan, through the real router, real
## decisions, the real settlement generation rule and a spending policy a
## reasonable player would follow, for three in-game years. It reports what
## happened.
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
	_play(parent)
	_report()
	SimulationBudget.current_tick = restore_tick

	_teardown()
	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


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

		# The settlement's generation rule — the same call village life makes,
		# not a copy of it. Copying it is what let the level-vs-edge bug exist in
		# two places at once.
		if CultureRegistry.press_generation("clan_pacing"):
			_generations += 1
			_timeline.append("    day %4d  generation %d · %d locked · %d banked"
				% [day, _culture.generation, _tree.locked_count(), int(_tree.energy)])

		_spend_like_a_player(day)

	# A player who is on top of it: nobody goes hungry and nobody is worked into
	# the ground. Deliberately the optimistic arm — neglect is StakesSelfTest's
	# subject, and what is being measured here is how fast progression moves when
	# attrition is not eating it. A first pass fed half a day's hunger and rested
	# less than the daily drain, and five of six died inside a month; that says
	# something about the needs curve, but it was measuring the wrong thing.
	for c in _clan:
		if c.needs.is_dead():
			continue
		c.needs.tick(1.0)
		c.needs.feed(1.0)
		c.needs.rest(1.0)
		c.needs.heal(0.2)

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
	var living: Array[Creature] = []
	for c in _clan:
		if is_instance_valid(c) and not c.needs.is_dead():
			living.append(c)
	if living.is_empty():
		return null
	return living[_rng.randi() % living.size()]


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
	_note("gradient applications (a generation every %d)"
		% CultureRegistry.APPLIES_PER_GENERATION, float(_culture.live.applies))
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
	_note("living at the end", float(CultureRegistry.living_members("clan_pacing")))

	if not _timeline.is_empty():
		stats.append("")
		stats.append("  what happened:")
		var shown := _timeline.slice(0, 14)
		for line in shown:
			stats.append(line)
		if _timeline.size() > shown.size():
			stats.append("    … and %d more" % (_timeline.size() - shown.size()))


func _teardown() -> void:
	for c in _clan:
		if is_instance_valid(c):
			c.queue_free()
	_clan.clear()
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
