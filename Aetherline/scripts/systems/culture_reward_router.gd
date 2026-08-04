extends Node
class_name CultureRewardRouter

## Turns things that happened into gradients.
##
## ONE NODE, ONE SET OF CONNECTIONS, FOR THE WHOLE GAME. Not one per creature:
## N creatures each connecting to `experience_logged` would make every event cost
## N dispatches, and the bus explicitly forbids that kind of traffic. Lookups go
## through SimulationBudget's uid registry, which exists for exactly this.
##
## THE PRIMARY CHANNEL IS `experience_logged`, and that is not a shortcut.
## ExperienceComponent.log_event is already documented as "the single funnel into
## both the archetype system and the story layer" — everything of consequence a
## creature does already passes through it. Hanging reward off the same funnel
## means the clan learns from precisely the events the game already considers
## meaningful, and it means a reward can never be earned by something that is not
## also, verifiably, part of that creature's history.
##
## CREDIT ASSIGNMENT IS THE HARD PART. An action and the outcome that judges it
## are separated by seconds or days: the tool was picked up long before the food
## it eventually opened. Rewards are therefore distributed BACKWARD over the
## creature's recent decisions with exponential decay — an eligibility trace.
## An action taken one decay-window ago receives half the credit; three windows
## ago, an eighth. Nothing else in the system needs to know about the delay.

## Decay per `decay_ticks` elapsed. 0.5 means one window halves the credit.
const TRACE_LAMBDA: float = 0.5

## Credit below which an experience is not worth a gradient.
const MIN_CREDIT: float = 0.01

## How much a tier's observations are trusted, by simulation fidelity. A NEAR
## creature's perception was coarse, so it must not teach as strongly as a full
## observation; an ABSTRACT one is a statistical fiction and teaches barely at all.
const TIER_WEIGHT := {
	AetherTypes.SimLOD.FULL: 1.0,
	AetherTypes.SimLOD.NEAR: 0.35,
	AetherTypes.SimLOD.ABSTRACT: 0.1,
}

## Applies between `culture_shifted` emissions, and the movement in a drive's
## clan-wide strength worth telling anyone about.
const SHIFT_INTERVAL: int = 200
const SHIFT_THRESHOLD: float = 0.05

## Social influence: an elder or an archetyped individual moves the culture more
## than an anonymous yearling does, which is the design document's rule and also
## simply how transmission works.
const ELDER_WEIGHT: float = 1.0
const CRYSTALLIZED_WEIGHT: float = 0.5

## uid -> { kind: { "day": int, "count": float } }. Backs the per-day caps that
## are the first and most effective line against reward farming.
var _quota: Dictionary = {}

## culture_id -> { "applies": int, "policy": PackedFloat32Array }
var _shift_watch: Dictionary = {}

## Diagnostics, surfaced in the lab.
var rewards_routed: int = 0
var rewards_capped: int = 0
var gradients_accumulated: int = 0


func _ready() -> void:
	EventBus.experience_logged.connect(_on_experience_logged)
	EventBus.need_critical.connect(_on_need_critical)
	EventBus.creature_died.connect(_on_creature_died)
	EventBus.creature_protected_ally.connect(_on_protected_ally)
	EventBus.work_completed.connect(_on_work_completed)
	EventBus.combat_ended.connect(_on_combat_ended)


func _exit_tree() -> void:
	for pair in [
		[EventBus.experience_logged, _on_experience_logged],
		[EventBus.need_critical, _on_need_critical],
		[EventBus.creature_died, _on_creature_died],
		[EventBus.creature_protected_ally, _on_protected_ally],
		[EventBus.work_completed, _on_work_completed],
		[EventBus.combat_ended, _on_combat_ended],
	]:
		if (pair[0] as Signal).is_connected(pair[1]):
			(pair[0] as Signal).disconnect(pair[1])


# --- Bus handlers -------------------------------------------------------------

func _on_experience_logged(uid: StringName, kind: String, amount: float,
		_payload: Dictionary) -> void:
	_feed_the_tree(uid, kind)
	var entry := GenomeDB.get_reward(kind)
	if entry.is_empty():
		return  # Recorded in the creature's history, but not something the clan learns from.
	var per_unit := float(entry.get("reward", 0.0))
	if is_zero_approx(per_unit):
		return
	var allowed := _allowance(uid, kind, amount, float(entry.get("max_per_day", 1e9)))
	if allowed <= 0.0:
		return
	route(uid, kind, per_unit * allowed, int(entry.get("decay_ticks", 600)))


func _on_need_critical(uid: StringName, need_key: String, _value: float) -> void:
	# A need bottoming out is a verdict on everything the creature has been doing
	# rather than an event in its own right, so it is routed directly rather than
	# through the catalog.
	route(uid, "need_critical_" + need_key, -0.8, 900)


func _on_creature_died(uid: StringName, cause: String, _tick: int) -> void:
	# The terminal negative, applied across the whole remaining trace with no
	# decay: everything this creature did recently led here.
	route(uid, "death_" + cause, -2.5, 1_000_000)
	_quota.erase(String(uid))


func _on_protected_ally(protector_uid: StringName, _protected_uid: StringName) -> void:
	route(protector_uid, "protect_ally", 0.9, 600)


func _on_work_completed(uid: StringName, work_kind: String, amount: float) -> void:
	route(uid, "work_" + work_kind, clampf(amount * 0.1, 0.0, 1.0), 700)


func _on_combat_ended(winner_uids: Array, loser_uids: Array) -> void:
	for uid in winner_uids:
		route(StringName(uid), "combat_win", 1.0, 500)
	for uid in loser_uids:
		route(StringName(uid), "combat_loss", -1.2, 700)


## Discovery pays the neuronal tree, separately from the reward that teaches the
## network.
##
## Two systems reading one event, and deliberately reading DIFFERENT things about
## it. The network cares how the outcome felt and how often; the tree cares only
## whether it had ever happened before. That is why "first" is decided from the
## creature's own `first_seen` — which has recorded exactly this since Phase 1 —
## rather than from anything the router keeps.
func _feed_the_tree(uid: StringName, kind: String) -> void:
	var node := SimulationBudget.node_for(uid)
	if node == null or not is_instance_valid(node):
		return
	var experience: ExperienceComponent = node.experience
	if experience == null:
		return
	# log_event has already recorded this one, so a genuine first shows up as a
	# first_seen tick equal to now.
	var first := experience.when_first(kind) == SimulationBudget.current_tick
	var tree := NeuronalTree.for_creature(node)
	# Asked before `observe`, which is what records it. Afterwards the answer is
	# always yes and the discovery is indistinguishable from a repeat.
	var novel := first and not tree.has_discovered(kind)
	var gained := tree.observe(kind, first)
	if gained > 0.0:
		EventBus.neuronal_energy_gained.emit(tree.clan_id, kind, gained, novel)


# --- Routing ------------------------------------------------------------------

## Distribute `reward` backward over one creature's recent decisions.
##
## Public because the culture lab teaches with it and the self-tests drive the
## whole learning path through it — a test that reached past this into the
## network would not be testing the thing the game runs.
func route(uid: StringName, kind: String, reward: float, decay_ticks: int) -> void:
	var node := SimulationBudget.node_for(uid)
	if node == null:
		return
	route_creature(node, kind, reward, decay_ticks)


func route_creature(creature: Node, kind: String, reward: float, decay_ticks: int) -> void:
	if creature == null or is_zero_approx(reward):
		return
	var ai: AIController = creature.ai
	if ai == null:
		return

	var lod := SimulationBudget.lod_of(creature.identity.uid)
	var tier: float = float(TIER_WEIGHT.get(lod, 0.0))
	if tier <= 0.0:
		return  # DORMANT and FROZEN creatures neither decide nor teach.

	var culture := CultureRegistry.culture_for(creature)
	culture.ensure_nets()
	culture.note_reward(kind, reward)
	rewards_routed += 1

	var influence := tier * _social_weight(creature)
	var advantage := culture.advantage(reward) * influence
	var now := SimulationBudget.current_tick
	var window: float = maxf(1.0, float(decay_ticks))

	var trace := ai.trace()
	if trace.is_empty():
		_route_abstract(culture, advantage)
	else:
		for entry in trace:
			var age := float(now - int(entry["tick"]))
			var credit: float = pow(TRACE_LAMBDA, age / window)
			if credit < MIN_CREDIT:
				continue
			culture.live.accumulate(entry["input"], int(entry["action"]),
				advantage * credit, entry["probs"])
			gradients_accumulated += 1

	if culture.maybe_apply():
		_watch_shift(culture)


## An ABSTRACT creature has no trace of its own — nobody ran a forward pass for
## it. Its outcome still teaches, against the clan's mean perception and the
## action the mean policy would have taken. That is what keeps a distant herd's
## deaths meaningful: the clan learns "those conditions killed people out there"
## without anybody simulating them.
func _route_abstract(culture: CultureResource, advantage: float) -> void:
	culture.refresh_mean_policy()
	if culture.mean_policy.is_empty():
		return
	culture.live.accumulate(culture.mean_perception,
		CultureNet.argmax(culture.mean_policy), advantage, culture.mean_policy)
	gradients_accumulated += 1


## Elders and archetyped individuals move the culture more.
func _social_weight(creature: Node) -> float:
	var weight := 1.0
	var stats: StatsComponent = creature.stats
	if stats != null:
		var max_age: float = maxf(1.0, stats.stat("max_age_days"))
		weight += ELDER_WEIGHT * clampf(stats.age_days / max_age, 0.0, 1.0)
	var archetype: ArchetypeComponent = creature.archetype
	if archetype != null and archetype.state != null \
			and not archetype.state.active_archetypes().is_empty():
		weight += CRYSTALLIZED_WEIGHT
	return weight


# --- Rate limiting ------------------------------------------------------------

## How much of `amount` is still within today's cap for this creature and kind.
##
## The cheapest and most effective answer to reward hacking: an exploit that
## farms one event stops paying after the cap, so the loop is not worth running.
func _allowance(uid: StringName, kind: String, amount: float, cap: float) -> float:
	if cap <= 0.0:
		return 0.0
	var key := String(uid)
	var day := SimulationBudget.current_day
	if not _quota.has(key):
		_quota[key] = {}
	var by_kind: Dictionary = _quota[key]
	var record: Dictionary = by_kind.get(kind, {"day": day, "count": 0.0})
	if int(record["day"]) != day:
		record = {"day": day, "count": 0.0}
	var remaining: float = cap - float(record["count"])
	if remaining <= 0.0:
		rewards_capped += 1
		by_kind[kind] = record
		return 0.0
	var granted: float = minf(amount, remaining)
	record["count"] = float(record["count"]) + granted
	by_kind[kind] = record
	if granted < amount:
		rewards_capped += 1
	return granted


# --- Shift reporting ----------------------------------------------------------

## Emit `culture_shifted` when a drive's clan-wide strength has genuinely moved,
## and no more often than SHIFT_INTERVAL applies.
##
## This is the throttle that lets the learning loop stay silent while the story
## layer still hears "the clan is growing bolder". The update itself emits
## nothing — see EventBus RULE 3.
func _watch_shift(culture: CultureResource) -> void:
	var watch: Dictionary = _shift_watch.get(culture.culture_id, {})
	var last_applies: int = int(watch.get("applies", -SHIFT_INTERVAL))
	if culture.live.applies - last_applies < SHIFT_INTERVAL:
		return

	culture.refresh_mean_policy(true)
	var now: PackedFloat32Array = culture.mean_policy.duplicate()
	var before: PackedFloat32Array = watch.get("policy", PackedFloat32Array())
	if before.size() == now.size():
		for i in now.size():
			var delta: float = now[i] - before[i]
			if absf(delta) >= SHIFT_THRESHOLD:
				EventBus.culture_shifted.emit(
					culture.culture_id, GenomeDB.drive_id_at(i), delta)
	_shift_watch[culture.culture_id] = {"applies": culture.live.applies, "policy": now}


func reset_diagnostics() -> void:
	_quota.clear()
	_shift_watch.clear()
	rewards_routed = 0
	rewards_capped = 0
	gradients_accumulated = 0


func debug_summary() -> String:
	return "CultureRewardRouter: %d routed, %d capped, %d gradients" % [
		rewards_routed, rewards_capped, gradients_accumulated]
