extends RefCounted
class_name CultureSelfTest

## Phase 4 validation: a behaviour discovered by a few individuals spreads to the
## whole clan.
##
## That sentence is the Phase 4 deliverable, so `_test_hundredth_monkey` runs it
## exactly as written rather than testing the pieces and hoping they compose —
## the same discipline ArchetypeSelfTest applies to the Guardian arc.
##
## THE CONTROL ARM IS THE MOST IMPORTANT ASSERTION IN THIS FILE. Showing that
## naive creatures grow more likely to migrate proves nothing on its own: drift,
## a shifting baseline or a bug in the measurement would all produce it. The same
## scenario is therefore run a second time with every creature on its OWN
## network, and the naive ones must NOT move. The difference between those two
## runs is the entire claim.

## Creatures in the clan scenario, and how many of them ever meet the cold snap.
const CLAN_SIZE: int = 20
const DISCOVERERS: int = 4
## Reward cycles each discoverer runs.
const DISCOVERY_STEPS: int = 300

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()

## Measurements worth a human reading, printed by the harness.
var stats: Array[String] = []

var _router: CultureRewardRouter = null
var _parent: Node = null


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	stats.clear()
	_rng.seed = 20260803
	_parent = parent

	_router = CultureRewardRouter.new()
	parent.add_child(_router)

	_test_kernel_math()
	_test_gradient_against_numeric()
	_test_dead_input_discipline()
	_test_catalogs()
	_test_arbitration()
	_test_authored_floor()
	# Persistence and inheritance are asserted inside the hundredth-monkey run,
	# against a culture that has genuinely learned something rather than a
	# freshly seeded one — a save/load test on an untrained network would pass
	# for the wrong reason.
	_test_hundredth_monkey()
	_test_save_file()
	_test_separation()
	_test_stability()
	_test_tiers()
	_test_rate_limiting()

	_router.queue_free()
	_router = null
	CultureRegistry.reset()

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- A. The kernel is actually doing arithmetic -------------------------------

func _test_kernel_math() -> void:
	var net := CultureNet.new(8, 6, 4, 5)
	var zero_gates := PackedFloat32Array()
	zero_gates.resize(5)
	var x := PackedFloat32Array([0.4, -0.2, 1.0, 0.0, 0.7, 0.1, -0.5, 1.0])

	# An untrained net must have no opinion. If a fresh clan starts anywhere but
	# uniform, everything measured later is measured against a bias nobody chose.
	var flat := net.policy(net.forward(x), zero_gates).duplicate()
	var uniform_error := 0.0
	for i in 5:
		uniform_error = maxf(uniform_error, absf(flat[i] - 0.2))
	_check("kernel: an unlearned network has no opinion (uniform policy)", uniform_error < 1e-5)

	var total := 0.0
	for i in 5:
		total += flat[i]
	_check_near("kernel: policy sums to 1", total, 1.0, 1e-5)

	net.initialize(_rng)
	# Shift invariance is a property of the max-subtraction, so it is tested
	# rather than assumed: without it a large logit overflows to NaN in silence.
	var a := net.policy(net.forward(x), PackedFloat32Array([0.0, 0, 0, 0, 0])).duplicate()
	var b := net.policy(net.forward(x), PackedFloat32Array([7.0, 7, 7, 7, 7])).duplicate()
	var shift_error := 0.0
	for i in 5:
		shift_error = maxf(shift_error, absf(a[i] - b[i]))
	_check("kernel: softmax is invariant to a constant added to every logit",
		shift_error < 1e-5)

	var extreme := net.policy(PackedFloat32Array([900.0, -900.0, 0.0, 50.0, -50.0]),
		zero_gates).duplicate()
	var extreme_sum := 0.0
	for i in 5:
		extreme_sum += extreme[i]
	_check("kernel: logits of +/-900 stay finite", is_finite(extreme_sum))
	_check_near("kernel: and still sum to 1", extreme_sum, 1.0, 1e-4)

	# One update in the direction of an action must raise that action.
	var before := net.policy(net.forward(x), zero_gates).duplicate()
	for _i in 40:
		var probs := net.policy(net.forward(x), zero_gates).duplicate()
		net.accumulate(x, 2, 1.0, probs)
	net.apply(0.05)
	var after := net.policy(net.forward(x), zero_gates).duplicate()
	_check("kernel: rewarding an action raises it", after[2] > before[2])
	var others_fell := true
	for i in 5:
		if i != 2 and after[i] >= before[i]:
			others_fell = false
	_check("kernel: and lowers every alternative", others_fell)

	# Entropy is the collapse detector, so it has to be right.
	_check_near("kernel: entropy of a uniform 5-way policy is log(5)",
		CultureNet.entropy(flat), log(5.0), 1e-4)
	_check("kernel: entropy of a certain policy is 0",
		CultureNet.entropy(PackedFloat32Array([1.0, 0, 0, 0, 0])) < 1e-6)


## The assertion that separates "this learns" from "this random-walks".
##
## Backprop written by hand is wrong far more often than it looks wrong: a policy
## with a sign error or a dropped term still trains, still moves, and still
## produces plausible-looking behaviour. Comparing the analytic gradient against a
## central finite difference is cheap and is the only thing that actually settles it.
func _test_gradient_against_numeric() -> void:
	var net := CultureNet.new(6, 5, 4, 3)
	net.initialize(_rng)

	var x := PackedFloat32Array([0.3, -0.7, 1.0, 0.0, 0.55, 1.0])
	var gates := PackedFloat32Array([0.2, -0.4, 0.1])
	var action := 1
	var advantage := 1.0

	net.drop_batch()
	var probs := net.policy(net.forward(x), gates).duplicate()
	net.accumulate(x, action, advantage, probs)
	var analytic := {
		"w2": net._gw2.duplicate(), "w1": net._gw1.duplicate(),
		"w0": net._gw0.duplicate(), "b2": net._gb2.duplicate(),
	}
	net.drop_batch()

	var objective := func() -> float:
		var p := net.policy(net.forward(x), gates)
		return log(maxf(p[action], 1e-12)) * advantage \
			+ CultureNet.ENTROPY_BONUS * CultureNet.entropy(p)

	var eps := 1e-4
	var worst := 0.0
	for pair in [["w2", net.w2], ["w1", net.w1], ["w0", net.w0], ["b2", net.b2]]:
		var params: PackedFloat32Array = pair[1]
		var expected: PackedFloat32Array = analytic[pair[0]]
		for k in mini(8, params.size()):
			var idx: int = (k * 7 + 1) % params.size()
			var original: float = params[idx]
			params[idx] = original + eps
			var up: float = objective.call()
			params[idx] = original - eps
			var down: float = objective.call()
			params[idx] = original
			var numeric: float = (up - down) / (2.0 * eps)
			worst = maxf(worst, absf(numeric - expected[idx]) / maxf(1.0, absf(numeric)))

	_check("kernel: analytic gradient matches a numeric one in every layer",
		worst < 1e-3)
	_note("worst relative gradient error (float32 storage)", worst)

	# Clipping and rollback are what stop one bad reward destroying a clan.
	var wild := CultureNet.new(6, 5, 4, 3)
	wild.initialize(_rng)
	var wild_probs := wild.policy(wild.forward(x), gates).duplicate()
	wild.accumulate(x, 0, 5000.0, wild_probs)
	wild.apply(1.0)
	_check("kernel: an enormous advantage is clipped, not obeyed",
		wild.layer_norms()[2] < 1e6 and wild.rollbacks == 0)

	var poisoned := CultureNet.new(6, 5, 4, 3)
	poisoned.initialize(_rng)
	var known_good := poisoned.to_blob()
	poisoned.accumulate(x, 0, NAN, poisoned.policy(poisoned.forward(x), gates).duplicate())
	poisoned.apply(0.05)
	_check("kernel: a NaN update is caught and rolled back", poisoned.rollbacks == 1)
	_check("kernel: and the rollback restored the last known-good weights",
		poisoned.to_blob() == known_good)


# --- B. Dead-input discipline --------------------------------------------------

func _test_dead_input_discipline() -> void:
	_check("perception: the layout is the width the network expects",
		Perception.SLOT_NAMES.size() == Perception.SLOT_COUNT)

	var seen := {}
	var duplicates := false
	for name in Perception.SLOT_NAMES:
		if seen.has(name):
			duplicates = true
		seen[name] = true
	_check("perception: no slot name appears twice", not duplicates)

	# If the network can see the simulation, it learns the simulation. This is
	# cheap to enforce now and effectively impossible to unwind later.
	var forbidden := ["lod", "uid", "tick", "sim_lod", "camera", "distance_to_player",
		"is_visible", "on_screen"]
	var leaked := ""
	for name in Perception.SLOT_NAMES:
		if forbidden.has(name):
			leaked = name
	_check("perception: carries nothing the animal could not itself perceive (%s)"
		% ("clean" if leaked.is_empty() else leaked), leaked.is_empty())

	var net := CultureNet.new(Perception.SLOT_COUNT, 8, 6, 4)
	net.initialize(_rng, Perception.DEAD_SLOTS)

	var columns_zero := true
	for slot in Perception.DEAD_SLOTS:
		for o in 8:
			if net.w0[o * Perception.SLOT_COUNT + int(slot)] != 0.0:
				columns_zero = false
	_check("perception: every Stage-2 slot's weight column is exactly zero",
		columns_zero)

	# The property that makes activating a slot in Stage 2 survivable: a clan
	# that has trained for hours must be bit-identically unaffected at the moment
	# the new sense switches on.
	var gates := PackedFloat32Array()
	gates.resize(4)
	var quiet := Perception.blank()
	var baseline := net.policy(net.forward(quiet), gates).duplicate()
	var loud := quiet.duplicate()
	for slot in Perception.DEAD_SLOTS:
		loud[int(slot)] = 1.0
	var lit := net.policy(net.forward(loud), gates).duplicate()
	var difference := 0.0
	for i in 4:
		difference = maxf(difference, absf(baseline[i] - lit[i]))
	_check("perception: lighting up every dead slot changes the policy not at all",
		difference == 0.0)

	# And growth preserves it in the other direction.
	var narrow := CultureNet.new(28, 8, 6, 4)
	narrow.initialize(_rng)
	var short_input := PackedFloat32Array()
	short_input.resize(28)
	for i in 28:
		short_input[i] = float(i % 5) * 0.2
	var pre := narrow.policy(narrow.forward(short_input), gates).duplicate()
	narrow.grow_inputs(32)
	var long_input := PackedFloat32Array()
	long_input.resize(32)
	for i in 28:
		long_input[i] = short_input[i]
	var post := narrow.policy(narrow.forward(long_input), gates).duplicate()
	var growth_error := 0.0
	for i in 4:
		growth_error = maxf(growth_error, absf(pre[i] - post[i]))
	_check("perception: widening 28 -> 32 inputs leaves old behaviour identical",
		growth_error == 0.0)


# --- C. Catalogs ---------------------------------------------------------------

func _test_catalogs() -> void:
	_check("catalog: 8-12 drives defined", GenomeDB.drive_count() >= 8
		and GenomeDB.drive_count() <= 12)
	_check("catalog: reward table is populated", GenomeDB.rewards.size() >= 12)
	_check("catalog: pretrained priors exist for authoring",
		GenomeDB.culture_priors.size() >= 4)
	_check("catalog: culture catalogs cross-reference cleanly",
		GenomeDB.validate_catalog().is_empty())

	# A drive whose state is unreachable is a network output nothing can act on:
	# it would train, drift, and never be visible.
	var unmapped: Array[String] = []
	for i in GenomeDB.drive_count():
		var drive := GenomeDB.get_drive(GenomeDB.drive_id_at(i))
		if not AIController.State.has(String(drive.get("state", ""))):
			unmapped.append(GenomeDB.drive_id_at(i))
	_check("catalog: every drive maps to a real action", unmapped.is_empty())

	# And the reverse: an action no drive votes for can never be chosen.
	var voted := {}
	for i in GenomeDB.drive_count():
		voted[String(GenomeDB.get_drive(GenomeDB.drive_id_at(i)).get("state", ""))] = true
	var orphan_states: Array[String] = []
	for state_name in AIController.State:
		if not voted.has(String(state_name)):
			orphan_states.append(String(state_name))
	_check("catalog: every action is reachable from some drive", orphan_states.is_empty())

	var negative := 0
	for kind in GenomeDB.rewards:
		if float((GenomeDB.rewards[kind] as Dictionary).get("reward", 0.0)) < 0.0:
			negative += 1
	_check("catalog: the world can punish as well as pay (%d negative rewards)"
		% negative, negative >= 5)


# --- D. Arbitration ------------------------------------------------------------

func _test_arbitration() -> void:
	CultureRegistry.reset(1234)
	var creature := _spawn("clan_arbitration")
	var ai: AIController = creature.ai

	creature.needs.hunger = 0.9
	creature.needs.energy = 0.9
	ai.decide_from(Perception.compose(creature), false)
	_check("arbitration: every action is scored and explainable",
		ai.last_scores().size() == GenomeDB.drive_count())
	_check("arbitration: the readout explains the choice in three columns",
		ai.last_explanation().size() == GenomeDB.drive_count())

	var explain: Dictionary = ai.last_explanation()
	var sample: Dictionary = explain[explain.keys()[0]]
	_check("arbitration: final logit is exactly learned + gates",
		is_equal_approx(float(sample["final"]), float(sample["logit"]) + float(sample["gate"])))

	# Determinism at zero temperature is what makes any of this testable.
	ai.decide_from(Perception.compose(creature), false)
	var first := ai.state
	for _i in 5:
		ai.decide_from(Perception.compose(creature), false)
	_check("arbitration: exploitation is deterministic", ai.state == first)

	# The archetype contract, preserved verbatim from Phase 2: bias multiplies,
	# it does not override. A multiplicative 3.0 is exactly log(3) in logit space.
	var gates_before := ai.gate_logits().duplicate()
	var guardian := GenomeDB.get_archetype("arch_guardian")
	if guardian != null:
		creature.archetype.crystallize(guardian)
		var gates_after := ai.gate_logits().duplicate()
		var protect_index := GenomeDB.drive_index("protectiveness")
		var expected := log(float(guardian.ai_bias.get("protect", 1.0)))
		_check_near("arbitration: an archetype bias of x%.1f shifts the logit by log(x)"
			% float(guardian.ai_bias.get("protect", 1.0)),
			gates_after[protect_index] - gates_before[protect_index], expected, 0.01)

		# Before Phase 4 there was no PROTECT action and "protect" fell through
		# to FIGHT, so a Guardian was biased toward fighting. It is not now.
		var fight_index := GenomeDB.drive_index("aggression")
		_check("arbitration: Guardian biases toward protecting, not fighting",
			gates_after[protect_index] - gates_before[protect_index]
				> gates_after[fight_index] - gates_before[fight_index])

	_despawn([creature])


## The designer's floor is not negotiable.
##
## The network is pinned as hard against SEEK_FOOD as the weight clamp allows,
## and the creature is starving. It seeks food. If this ever fails, the authored
## utility terms have stopped being a floor and become a suggestion, and the
## game has lost the ability to guarantee anything about its own creatures.
func _test_authored_floor() -> void:
	CultureRegistry.reset(99)
	var creature := _spawn("clan_floor")
	var culture := CultureRegistry.culture_for(creature)
	culture.ensure_nets()

	var food_index := GenomeDB.drive_index("foraging_priority")
	for i in culture.live.out_size:
		culture.live.set_output_bias(i, 4.0 if i != food_index else -5.0)

	creature.needs.hunger = 0.02
	creature.needs.energy = 1.0
	creature.needs.health = 1.0
	creature.ai.decide_from(Perception.compose(creature), false)
	_check("authored floor: a starving animal seeks food however the clan votes",
		creature.ai.state == AIController.State.SEEK_FOOD)

	# And with the need met, the learned policy is free to win again.
	creature.needs.hunger = 1.0
	creature.ai.decide_from(Perception.compose(creature), false)
	_check("authored floor: and stops insisting once the need is met",
		creature.ai.state != AIController.State.SEEK_FOOD)

	# Learning can be switched off entirely for a scripted clan.
	culture.learning_rate = 0.0
	var frozen := culture.live.to_blob()
	for _i in 60:
		creature.ai.decide_from(Perception.compose(creature), true)
		_router.route_creature(creature, "forage_success", 1.0, 400)
	culture.maybe_apply(true)
	_check("authored control: learning_rate 0 leaves the weights byte-identical",
		culture.live.to_blob() == frozen)

	_despawn([creature])


# --- E. THE HUNDREDTH MONKEY ---------------------------------------------------

## "A behaviour discovered by a few individuals spreads to the whole clan."
##
## Twenty creatures share one culture. A synthetic condition — the cold snap —
## rewards MIGRATE and punishes everything else. Only four of the twenty ever
## meet it. The other sixteen are then measured on a condition they have never
## experienced and a behaviour they have never been rewarded for.
func _test_hundredth_monkey() -> void:
	var cold_snap := _cold_snap()
	var neutral := _neutral()

	var shared := _run_discovery("clan_shared", true, cold_snap)
	var control := _run_discovery("control", false, cold_snap)

	# 1. The clan starts with no opinion worth speaking of.
	_note("naive migrate probability before discovery", shared["before"])
	_note("naive migrate probability after discovery", shared["after"])
	_note("control (no shared network) before", control["before"])
	_note("control (no shared network) after", control["after"])

	# 2. The four who lived it learned it.
	_check("hundredth monkey: the four who met the cold snap learned to migrate "
		+ "(%.3f -> %.3f)" % [shared["discoverer_before"], shared["discoverer_after"]],
		shared["discoverer_after"] > shared["discoverer_before"] + 0.15)

	# 3. THE CLAIM. Sixteen creatures that never experienced the cold snap, and
	# were never rewarded for migrating, now migrate when they meet it.
	var spread: float = shared["after"] - shared["before"]
	_check("hundredth monkey: the sixteen who never met it know it anyway "
		+ "(+%.3f)" % spread, spread > 0.10)

	# 4. THE CONTROL. Same scenario, same seed, same events — but every creature
	# on its own network. Without this the assertion above proves nothing.
	var control_spread: float = control["after"] - control["before"]
	_check("hundredth monkey: with private networks the naive learn nothing "
		+ "(%+.3f)" % control_spread, absf(control_spread) < 0.04)
	_check("hundredth monkey: sharing is what transmits it, not drift",
		spread > control_spread + 0.08)

	# 5. Specificity. The clan learned a response to a CONDITION, not a new
	# obsession. If migration rose everywhere, one drive has eaten the network.
	var neutral_shift: float = shared["neutral_after"] - shared["neutral_before"]
	_note("migrate probability shift in an unrelated situation", neutral_shift)
	_check("hundredth monkey: the lesson is tied to the cold snap, not general "
		+ "(%+.3f elsewhere)" % neutral_shift, neutral_shift < spread * 0.6)

	stats.append("  adoption among the naive:  %s" % shared["curve"])


## Runs the scenario. `shared` decides whether the clan has one brain or twenty.
func _run_discovery(prefix: String, shared: bool, cold_snap: PackedFloat32Array) -> Dictionary:
	CultureRegistry.reset(20260803)
	var neutral := _neutral()
	var creatures: Array[Creature] = []
	for i in CLAN_SIZE:
		# The only difference between the two arms: one culture id, or twenty.
		var culture_id := prefix if shared else "%s_%d" % [prefix, i]
		creatures.append(_spawn(culture_id))

	var discoverers := creatures.slice(0, DISCOVERERS)
	var naive := creatures.slice(DISCOVERERS)
	var migrate := AIController.State.MIGRATE

	var out := {
		"before": _mean_probability(naive, cold_snap, migrate),
		"neutral_before": _mean_probability(naive, neutral, migrate),
		"discoverer_before": _mean_probability(discoverers, cold_snap, migrate),
	}

	var curve: Array[String] = ["%.3f" % out["before"]]
	var checkpoint: int = DISCOVERY_STEPS / 3
	for step in DISCOVERY_STEPS:
		for creature in discoverers:
			var ai: AIController = creature.ai
			ai.decide_from(cold_snap, true)
			if ai.state == migrate:
				_router.route_creature(creature, "forage_success", 1.0, 400)
			else:
				_router.route_creature(creature, "hazards_endured", -1.0, 400)
			# One reward, one decision: the trace is cleared so credit is
			# unambiguous. The decay path itself is exercised in _test_tiers.
			ai.clear_trace()
		SimulationBudget.current_tick += 30
		if (step + 1) % checkpoint == 0:
			curve.append("%.3f" % _mean_probability(naive, cold_snap, migrate))

	for creature in creatures:
		CultureRegistry.culture_for(creature).maybe_apply(true)

	out["after"] = _mean_probability(naive, cold_snap, migrate)
	out["neutral_after"] = _mean_probability(naive, neutral, migrate)
	out["discoverer_after"] = _mean_probability(discoverers, cold_snap, migrate)
	out["curve"] = " -> ".join(curve)

	if shared:
		_test_inheritance_and_save(creatures, naive, cold_snap, out["after"], out["before"])

	_despawn(creatures)
	return out


## Bolted onto the shared run rather than rebuilt, so inheritance and persistence
## are tested against a culture that has genuinely learned something rather than
## a freshly seeded one.
func _test_inheritance_and_save(creatures: Array, naive: Array,
		cold_snap: PackedFloat32Array, learned: float, before: float) -> void:
	var culture := CultureRegistry.culture_for(creatures[0])
	var migrate := AIController.State.MIGRATE
	var baseline := 1.0 / float(GenomeDB.drive_count())

	# Persistence, through real JSON, exactly as a campaign would.
	var section := CultureRegistry.save_section()
	var round_tripped: Variant = JSON.parse_string(JSON.stringify(section))
	_check("persistence: the culture section survives JSON", round_tripped != null)
	var blob_before := culture.live.to_blob()
	var seed_before := culture.rng_seed

	CultureRegistry.load_section(round_tripped)
	var reloaded := CultureRegistry.get_culture(culture.culture_id)
	_check("persistence: weights reload bit-for-bit",
		reloaded != null and reloaded.live.to_blob() == blob_before)
	_check("persistence: the 64-bit culture seed survives the JSON double trap",
		reloaded != null and reloaded.rng_seed == seed_before)
	_check("persistence: what the clan learned survives a save and load",
		absf(_mean_probability(naive, cold_snap, migrate) - learned) < 0.02)

	# Inheritance.
	var live_before := reloaded.live.to_blob()
	var retained := reloaded.advance_generation()
	_check("inheritance: the generation counter advanced", reloaded.generation == 1)
	_check("inheritance: consolidation reported how much of the clan survived "
		+ "(r=%.3f)" % retained, retained > 0.8)
	_check("inheritance: drift made the next generation genuinely different",
		reloaded.live.to_blob() != live_before)

	# MEASURED IN LOG-ODDS, NOT IN PROBABILITY. Consolidation blends weights,
	# which blends LOGITS linearly; probability is the exponential of that, so
	# "75% inherited" never means "75% of the probability survives". Asserting on
	# probability would be asserting against the wrong model and would have to be
	# retuned by hand every time the lever moved. In log-odds the relationship is
	# linear, and the expectation follows inheritance_fraction directly.
	var after_advance := _mean_probability(naive, cold_snap, migrate)
	var learned_gain: float = _log_odds(learned) - _log_odds(before)
	var kept_gain: float = _log_odds(after_advance) - _log_odds(before)
	var ratio: float = kept_gain / maxf(learned_gain, 1e-6)
	# The 0.7 is headroom for the drift deliberately added at consolidation.
	var expected_ratio: float = reloaded.inheritance_fraction * 0.7

	_note("migrate probability after the generation advanced", after_advance)
	_note("fraction of the learned preference inherited (log-odds)", ratio)
	_check("inheritance: the lesson outlived the generation that learned it "
		+ "(%.3f -> %.3f, %.0f%% of the preference kept)"
		% [learned, after_advance, ratio * 100.0], ratio > expected_ratio)
	_check("inheritance: and it is still far above where the clan started",
		after_advance > baseline * 2.0)


# --- F. Persistence through a real campaign save --------------------------------

## The section round trip is tested above; this tests the WIRING.
##
## CultureRegistry is a static class with no `_ready`, and SaveSystem only calls
## providers that registered before the load ran. That is the one genuine hazard
## in the "static class rather than autoload" decision, so it is asserted against
## a real file on disk rather than reasoned about — the same standard
## CreatureSelfTest holds its genome round trip to.
func _test_save_file() -> void:
	CultureRegistry.reset(20260803)
	CultureRegistry.install(20260803)

	var creature := _spawn("clan_ondisk")
	var culture := CultureRegistry.culture_for(creature)
	culture.ensure_nets()
	for _i in 60:
		creature.ai.decide_from(_neutral(), true)
		_router.route_creature(creature, "forage_success", 1.0, 400)
		creature.ai.clear_trace()
	culture.maybe_apply(true)

	var blob := culture.live.to_blob()
	var applies := culture.live.applies
	var seed_value := culture.rng_seed
	_check("save file: the clan learned something worth saving", applies > 0)

	var slot := "__culture_selftest"
	_check("save file: the campaign saved", SaveSystem.save_game(slot))

	var text := FileAccess.get_file_as_string(SaveSystem.slot_path(slot))
	var doc: Variant = JSON.parse_string(text)
	var sections: Dictionary = (doc as Dictionary).get("sections", {}) if doc != null else {}
	_check("save file: the provider contributed a 'cultures' section",
		sections.has("cultures"))

	# Save growth is a real risk for a campaign that visits hundreds of worlds,
	# so the cost of a culture is measured rather than estimated.
	var section_bytes := JSON.stringify(sections.get("cultures", {})).length()
	_note("bytes on disk per stored culture",
		float(section_bytes) / float(maxi(1, CultureRegistry.count())))
	_check("save file: a culture costs well under 64 KB on disk",
		float(section_bytes) / float(maxi(1, CultureRegistry.count())) < 65536.0)

	CultureRegistry.reset(20260803)
	CultureRegistry.install(20260803)
	_check("save file: the campaign loaded", SaveSystem.load_game(slot))

	var restored := CultureRegistry.get_culture("clan_ondisk")
	_check("save file: the culture came back", restored != null)
	if restored != null:
		_check("save file: weights are bit-identical across a real save and load",
			restored.live.to_blob() == blob)
		_check("save file: the 64-bit seed survived the round trip",
			restored.rng_seed == seed_value)
		_check("save file: the clan's history came with it",
			restored.live.applies == applies)

	SaveSystem.delete_slot(slot)
	DirAccess.remove_absolute(SaveSystem.slot_path(slot) + ".bak")
	_despawn([creature])


# --- G. Separation: a colony left behind becomes its own people -----------------

## The other half of the transmission claim.
##
## The hundredth-monkey test proves a discovery spreads to everyone who shares a
## brain. This proves the boundary of that: people who STOP sharing a brain stop
## sharing discoveries, and a colony left on a rock for years greets you with its
## own opinions rather than a recording of yours.
##
## Until this existed, `drift` — the whole mechanism for two clans becoming two
## peoples — had nothing to act on, because a culture could only ever be one
## shared brain per clan and departure never split it.
func _test_separation() -> void:
	CultureRegistry.reset(20260805)
	CultureRegistry.install(20260805)

	var parent := CultureRegistry.ensure("clan_home", "The Home Clan")
	parent.ensure_nets()
	parent.member_count = 10
	var founding_blob := parent.live.to_blob()

	var child := CultureRegistry.fork("clan_home", "clan_home@rock", "left_behind")
	_check("separation: forking produces a new culture", child != null
		and child.culture_id == "clan_home@rock")
	_check("separation: the castaways leave knowing exactly what the clan knew",
		child.live.to_blob() == founding_blob)
	_check("separation: and they inherit its history, not its membership",
		child.generation == parent.generation and child.member_count == 0)
	_check("separation: forking the same split twice does not found a third people",
		CultureRegistry.fork("clan_home", "clan_home@rock") == child)
	_check("separation: forking an unknown parent does not invent one",
		CultureRegistry.fork("clan_that_never_was", "orphan").culture_id == "orphan")

	# Now the years pass with nobody watching.
	var generations := child.age_unattended(CultureResource.GENERATION_DAYS * 3.0)
	_check("separation: three hundred days is a generation, so nine hundred is three",
		generations == 3)
	_check("separation: and the clan you come back to is not the one you left",
		child.live.to_blob() != founding_blob)
	_check("separation: while the people who flew away are unchanged",
		parent.live.to_blob() == founding_blob)

	var apart := child.live.mean_abs_difference(parent.live)
	_note("how far apart the two halves drifted, per weight", apart)
	_check("separation: they are measurably different peoples now", apart > 0.0)
	# Different, not unrecognisable — they are still cousins.
	_check("separation: but still recognisably from the same stock", apart < 0.5)

	# An absence long enough to be geological must not run drift forever.
	var abandoned := CultureRegistry.fork("clan_home", "clan_home@deep", "left_behind")
	var capped := abandoned.age_unattended(CultureResource.GENERATION_DAYS * 500.0)
	_check("separation: an absence beyond memory is capped rather than run to noise",
		capped == CultureResource.MAX_UNATTENDED_GENERATIONS)

	# Coming back within a season changes nothing — you were not gone long enough.
	var brief := CultureRegistry.fork("clan_home", "clan_home@brief", "left_behind")
	var brief_blob := brief.live.to_blob()
	_check("separation: a short absence turns no generations",
		brief.age_unattended(CultureResource.GENERATION_DAYS * 0.5) == 0)
	_check("separation: and leaves the culture untouched",
		brief.live.to_blob() == brief_blob)

	# Reunion. The larger group dominates, but does not erase the smaller.
	parent.member_count = 30
	child.member_count = 10
	var before_merge := parent.live.to_blob()
	_check("separation: two peoples can be brought back together",
		CultureRegistry.merge("clan_home", "clan_home@rock"))
	_check("separation: and the reunion changes the ones who stayed home",
		parent.live.to_blob() != before_merge)
	_check("separation: the merged clan counts everybody",
		parent.member_count == 40)
	_check("separation: merging a culture into itself is refused",
		not CultureRegistry.merge("clan_home", "clan_home"))

	# Forked cultures are real cultures: they have to survive a save.
	var section := CultureRegistry.save_section()
	var round_tripped: Variant = JSON.parse_string(JSON.stringify(section))
	CultureRegistry.load_section(round_tripped)
	var reloaded := CultureRegistry.get_culture("clan_home@deep")
	_check("separation: a colony's own culture survives the campaign save",
		reloaded != null and reloaded.live.to_blob() == abandoned.live.to_blob())

	CultureRegistry.reset()


# --- H. Stability --------------------------------------------------------------

## Five thousand contradictory rewards must leave a network that is still a
## network: finite, and still capable of an opinion other than its favourite.
func _test_stability() -> void:
	var net := CultureNet.new(Perception.SLOT_COUNT, 32, 16, GenomeDB.drive_count())
	net.initialize(_rng, Perception.DEAD_SLOTS)
	var gates := PackedFloat32Array()
	gates.resize(net.out_size)
	var x := Perception.blank()
	for i in 20:
		x[i] = _rng.randf()

	for step in 5000:
		var probs := net.policy(net.forward(x), gates).duplicate()
		var action := CultureNet.sample(probs, _rng)
		# Adversarial: the reward flips sign on a schedule that correlates with
		# nothing, so there is no policy that satisfies it.
		net.accumulate(x, action, 3.0 if step % 3 == 0 else -3.0, probs)
		if step % 16 == 15:
			net.apply(0.05)

	var final := net.policy(net.forward(x), gates).duplicate()
	var total := 0.0
	for i in final.size():
		total += final[i]
	_check("stability: 5000 contradictory updates leave every weight finite",
		is_finite(total) and net.rollbacks == 0)

	var h := CultureNet.entropy(final)
	var ceiling := CultureNet.max_entropy(net.out_size)
	_note("policy entropy after adversarial training (max %.3f)" % ceiling, h)
	_check("stability: the policy did not collapse onto one drive "
		+ "(H=%.2f of %.2f)" % [h, ceiling], h > ceiling * 0.5)
	_check("stability: the weight clamp was not needed", net.clamp_events == 0)

	_note("gradient applications survived", float(net.applies))


# --- H. Tiers and routing ------------------------------------------------------

func _test_tiers() -> void:
	CultureRegistry.reset(7)
	var creature := _spawn("clan_tiers")
	var culture := CultureRegistry.culture_for(creature)
	culture.ensure_nets()
	var uid := creature.identity.uid

	# Tier 3 must cost nothing per creature: the band shares one cached policy.
	culture.refresh_mean_policy(true)
	var forwards_before := culture.live.forwards
	for _i in 50:
		creature.ai.decide_abstract()
	_check("tiers: an ABSTRACT creature runs no forward pass of its own",
		culture.live.forwards == forwards_before)
	_check("tiers: and still ends up doing something", creature.ai.state >= 0)

	# A distant creature's outcome still teaches the clan.
	SimulationBudget.set_lod(uid, AetherTypes.SimLOD.ABSTRACT)
	creature.ai.clear_trace()
	var applies_before := culture.live.pending_batch()
	_router.route_creature(creature, "hazards_endured", -1.0, 600)
	_check("tiers: an ABSTRACT death still teaches the clan",
		culture.live.pending_batch() > applies_before)

	# A frozen one does not exist as far as learning is concerned.
	SimulationBudget.set_lod(uid, AetherTypes.SimLOD.FROZEN)
	var frozen_batch := culture.live.pending_batch()
	_router.route_creature(creature, "hazards_endured", -1.0, 600)
	_check("tiers: a FROZEN creature neither decides nor teaches",
		culture.live.pending_batch() == frozen_batch)

	# Eligibility decay: credit should fall off roughly geometrically with age.
	SimulationBudget.set_lod(uid, AetherTypes.SimLOD.FULL)
	creature.ai.clear_trace()
	culture.live.drop_batch()
	var window := 400
	for k in 4:
		creature.ai.decide_from(_neutral(), true)
		SimulationBudget.current_tick += window
	_router.route_creature(creature, "forage_success", 1.0, window)
	_check("tiers: the eligibility trace credits several past decisions",
		culture.live.pending_batch() >= 3)

	_despawn([creature])


func _test_rate_limiting() -> void:
	CultureRegistry.reset(11)
	var creature := _spawn("clan_quota")
	var culture := CultureRegistry.culture_for(creature)
	_router.reset_diagnostics()

	# forage_success caps at 12/day. Farming it past that must stop paying —
	# the cheapest and most effective answer to reward hacking.
	var cap := float(GenomeDB.get_reward("forage_success").get("max_per_day", 0.0))
	_check("rate limiting: the catalog declares a daily cap", cap > 0.0)
	for _i in 40:
		creature.ai.decide_from(_neutral(), true)
		creature.experience.log_event("forage_success", 1.0)
	var tallied := float(culture.reward_tally.get("forage_success", 0.0))
	var per_unit := float(GenomeDB.get_reward("forage_success").get("reward", 0.0))
	_check("rate limiting: 40 attempts pay for at most %d (%.1f banked)"
		% [int(cap), tallied], tallied <= cap * per_unit + 0.001)
	_check("rate limiting: and the router noticed it was being farmed",
		_router.rewards_capped > 0)

	# An event with no catalog entry is history, not a lesson.
	var before := culture.reward_tally.size()
	creature.experience.log_event("something_the_catalog_never_heard_of", 5.0)
	_check("rate limiting: an uncatalogued event teaches nothing",
		culture.reward_tally.size() == before)

	_despawn([creature])


# --- Scenario helpers ----------------------------------------------------------

## The cold snap: freezing, hungry, exhausted, alone. A situation, expressed the
## only way this system understands situations.
func _cold_snap() -> PackedFloat32Array:
	var v := Perception.blank()
	v[Perception.slot_index("thermal_comfort")] = 0.0
	v[Perception.slot_index("hunger")] = 0.1
	v[Perception.slot_index("energy")] = 0.2
	v[Perception.slot_index("health")] = 0.5
	v[Perception.slot_index("mood")] = 0.1
	v[Perception.slot_index("hunger_critical")] = 1.0
	v[Perception.slot_index("lifetime_hardship")] = 0.8
	return v


## A fed, warm, healthy afternoon. Used to prove the lesson is tied to the cold
## snap rather than being a new general enthusiasm for leaving.
func _neutral() -> PackedFloat32Array:
	var v := Perception.blank()
	v[Perception.slot_index("thermal_comfort")] = 1.0
	v[Perception.slot_index("hunger")] = 0.9
	v[Perception.slot_index("energy")] = 0.9
	v[Perception.slot_index("health")] = 1.0
	v[Perception.slot_index("mood")] = 0.8
	return v


## Mean probability these creatures assign to `target_state` in `situation`.
##
## Measured through the full arbitration path — network plus gates — because that
## is what actually decides behaviour. Measuring the raw logits would report what
## the network believes rather than what the clan would do.
func _mean_probability(creatures: Array, situation: PackedFloat32Array,
		target_state: int) -> float:
	if creatures.is_empty():
		return 0.0
	var total := 0.0
	for creature in creatures:
		var ai: AIController = creature.ai
		var culture := CultureRegistry.culture_for(creature)
		culture.ensure_nets()
		var probs := culture.live.policy(
			culture.live.forward(situation), ai.gate_logits(), 1.0).duplicate()
		for i in probs.size():
			var drive := GenomeDB.get_drive(GenomeDB.drive_id_at(i))
			if AetherTypes.key_to_enum(AIController.State,
					String(drive.get("state", "")), -1) == target_state:
				total += probs[i]
	return total / float(creatures.size())


## Log-odds. The space in which a blend of weights is a blend of preferences.
static func _log_odds(p: float) -> float:
	var clamped := clampf(p, 1e-6, 1.0 - 1e-6)
	return log(clamped / (1.0 - clamped))


func _spawn(culture_id: String) -> Creature:
	return CreatureFactory.spawn_random(_parent, _rng, {"culture_id": culture_id})


func _despawn(creatures: Array) -> void:
	for creature in creatures:
		if is_instance_valid(creature):
			creature.queue_free()


# --- Harness -------------------------------------------------------------------

func _note(label: String, observed: float) -> void:
	stats.append("  %-52s %7.3f" % [label, observed])


func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)


func _check_near(label: String, observed: float, expected: float, tolerance: float) -> void:
	var ok := absf(observed - expected) <= tolerance
	_check("%s  (%.3f vs %.3f +/- %.3f)" % [label, observed, expected, tolerance], ok)
