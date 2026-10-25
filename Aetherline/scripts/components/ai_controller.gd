extends CreatureComponent
class_name AIController

## Decides what the creature does with itself.
##
## PHASE 4. What Phase 0 left here was a decision *seam* with a working utility
## loop behind it, so that Phase 4 could extend a running system instead of
## starting from a stub. This is that extension, and the seam held: the utility
## terms it shipped with are still here, unchanged, doing the same job. What is
## new is that a learned, clan-shared policy now decides everything the authored
## floor does not insist on.
##
## THE DECISION, END TO END:
##
##   perception  ->  shared cultural network  ->  drive logits
##                                                     +
##                          authored gates (needs x phenotype x archetype)
##                                                     =
##                                  softmax  ->  sampled action
##
## THE IDENTITY THAT MAKES IT WORK: arbitration modifiers have always been
## multiplicative on utility, and a multiplicative factor is an additive term in
## log space. So the gates fold into the softmax exactly, as log(gate), and
## because they do not depend on the weights the policy gradient stays the clean
## `onehot(a) - p`. That single fact buys three things at once — the archetype
## system's existing semantics survive untouched, the network is scored on the
## action the creature actually took, and every term stays separately printable.
##
## THE AUTHORED FLOOR IS NOT NEGOTIABLE. The need terms are a floor under the
## network, not a suggestion to it. A starving animal seeks food no matter what
## the clan has learned. CultureSelfTest pins the network's SEEK_FOOD logit to -5
## against a hunger of 0.02 and asserts SEEK_FOOD still wins.
##
## The invariant this file has carried since Phase 0 still holds: the AI reads
## the RESOLVED PHENOTYPE, never the raw genome. A creature bred placid and
## traumatised into aggression behaves as the traumatised animal it is.

## Actions. APPEND ONLY — never reorder, never remove.
##
## The first six shipped in Phase 0 and keep their indices. `to_dict` serializes
## the enum *name* rather than the integer, so this list is survivable either way,
## but the append-only rule from AetherTypes applies here as much as anywhere:
## the drive catalog maps to these by name, and a reorder would silently repoint
## every drive a clan ever learned.
enum State {
	IDLE, WANDER, SEEK_FOOD, REST, FLEE, FIGHT,
	PROTECT, SOCIALIZE, FORAGE, MIGRATE, PLAY, USE_TOOL,
}

## Decisions kept for credit assignment. Enough to reach back through the delay
## between an action and the outcome that judges it; far short of a memoir.
const TRACE_CAP: int = 8

## Gates are clamped before their log is taken. A zero bias must mean "almost
## never", not negative infinity.
const GATE_FLOOR: float = 0.02
const GATE_CEILING: float = 50.0

@export var state: State = State.IDLE

## Ticks between decisions. Deliberately coarse: creatures that re-decide every
## frame look twitchy and cost a fortune at population scale.
@export var decision_interval: int = 30

var _next_decision_tick: int = 0

## state -> final probability. Same shape it has always had, so the existing
## debug readout keeps working unchanged.
var _last_scores: Dictionary = {}
## state -> { logit, gate, final, p }. The three-column explanation, deliberately
## the same grammar StatsComponent uses for bred / lived / final.
var _last_explain: Dictionary = {}

## Eligibility trace: { tick, action, input, probs }. Derived state, never
## serialized (assumption #11) — a reloaded creature has no pending credit.
var _trace: Array = []

## Per-creature RNG, so two identical animals in identical situations do not
## make identical choices, and so a replay reproduces both.
var _rng := RandomNumberGenerator.new()
var _decision_index: int = 0


func _on_setup() -> void:
	_reseed()


func _reseed() -> void:
	var base: int = 0
	if creature != null and creature.identity != null:
		base = int(creature.identity.appearance_seed) ^ hash(String(creature.identity.uid))
	_rng.seed = base


func culture() -> CultureResource:
	return CultureRegistry.culture_for(creature)


# --- Decision -----------------------------------------------------------------

func maybe_decide() -> void:
	if SimulationBudget.current_tick < _next_decision_tick:
		return
	_next_decision_tick = SimulationBudget.current_tick + decision_interval
	decide()


## Tier 1. Full perception, sampled action, contributes to learning.
func decide() -> void:
	if creature == null:
		return
	var perception: PackedFloat32Array = _sense_full()
	decide_from(perception,true)


## Tier 2. Coarse perception carried forward from the last full sensing, and the
## most likely action rather than a sampled one — a creature nobody is looking at
## should not be spending the clan's exploration budget.
func decide_coarse() -> void:
	if creature == null:
		return
	var component: PerceptionComponent = creature.perception
	var perception: PackedFloat32Array = component.sense_coarse() if component != null \
		else Perception.blank()
	decide_from(perception,false)


## Tier 3. No forward pass at all: sample the culture's cached mean policy.
##
## One forward pass serves the entire ABSTRACT band for MEAN_POLICY_INTERVAL
## ticks, which is what lets a distant herd still visibly reflect what the clan
## has learned without anybody paying for it per creature.
func decide_abstract() -> void:
	if creature == null:
		return
	var c := culture()
	c.refresh_mean_policy()
	if c.mean_policy.is_empty():
		return
	var index := CultureNet.sample(c.mean_policy, _rng)
	var chosen := _state_for_drive_index(index)
	if chosen >= 0:
		state = chosen


## Decide from a supplied perception rather than a sensed one.
##
## Public because it is the injection point: the self-tests drive the real
## decision path through it rather than a parallel copy of it, and Stage 2 will
## hand it a vector composed from world queries instead of internal state.
func decide_from(perception: PackedFloat32Array, explore: bool) -> void:
	var c := culture()
	c.ensure_nets()

	var logits: PackedFloat32Array = c.live.forward(perception)
	var gates: PackedFloat32Array = gate_logits()
	var probs: PackedFloat32Array = c.live.policy(
		logits, gates, c.temperature() if explore else 0.0001).duplicate()

	var index: int = CultureNet.sample(probs, _rng) if explore else CultureNet.argmax(probs)
	var chosen := _state_for_drive_index(index)

	_record_explanation(logits, gates, probs)

	# An imperative overrides the policy outright, and when it does, this
	# decision teaches the clan NOTHING — no trace entry is pushed. The creature
	# did not choose; it was compelled. Crediting the policy for an action it did
	# not select would train it on a counterfactual, which is exactly how a
	# policy-gradient implementation ends up confidently learning the wrong thing.
	var forced := _imperative()
	if forced >= 0:
		state = forced
		_decision_index += 1
		return

	if explore:
		_push_trace(perception, index, probs)
		c.note_perception(perception)
	_decision_index += 1

	if chosen >= 0 and chosen != state:
		state = chosen


## Needs that have gone critical are IMPERATIVES, not preferences.
##
## THE GATES ALONE ARE NOT A FLOOR. They are additive in logit space, so a
## sufficiently confident network can always outvote them — a softmax cannot
## express "always". For ordinary pressure that is correct and is the whole point
## of the design: the clan's learning should be able to overcome mild hunger to
## finish a hunt. For an animal that is actually dying it is not. A clan must not
## be able to learn its way into starving to death, and no amount of cultural
## confidence should be able to talk a creature out of eating.
##
## Deliberately the narrowest override that achieves that: two needs, only once
## they are past NeedsComponent.CRITICAL_THRESHOLD — the same line that already
## fires `need_critical` on the bus — and the network still chooses freely among
## everything else, every other tick of the creature's life.
func _imperative() -> int:
	var needs: NeedsComponent = creature.needs
	if needs == null:
		return -1
	if needs.hunger <= NeedsComponent.CRITICAL_THRESHOLD:
		return State.SEEK_FOOD
	if needs.energy <= NeedsComponent.CRITICAL_THRESHOLD:
		return State.REST
	return -1


func _sense_full() -> PackedFloat32Array:
	var component: PerceptionComponent = creature.perception
	return component.sense() if component != null else Perception.compose(creature)


# --- Arbitration --------------------------------------------------------------

## The authored gates, in log space, indexed by DRIVE (network output order).
##
## gate = need pressure x innate phenotype prior x archetype bias
##
## Every one of these three was already in the codebase in some form. The need
## terms are the Phase 0 utility scores, kept verbatim. The phenotype prior is
## what the genome already says this animal is inclined toward — which is where
## nature meets culture: the genome sets the innate prior, the network sets the
## learned one, and the same drive can be strong in an animal for either reason.
func gate_logits() -> PackedFloat32Array:
	var count: int = maxi(1, GenomeDB.drive_count())
	var out := PackedFloat32Array()
	out.resize(count)

	var needs: NeedsComponent = creature.needs
	var traits: Dictionary = creature.stats.phenotype() if creature.stats != null else {}
	var bias: Dictionary = creature.archetype.ai_bias() if creature.archetype != null else {}
	# Locked neurons bias the same gate layer, but keyed by DRIVE rather than by
	# action — a neuron is a fact about cognition, not about one behaviour — so it
	# is looked up separately below and multiplied in alongside the archetype.
	var neuron_bias: Dictionary = NeuronalTree.for_creature(creature).drive_bias()
	var need_scores := _need_scores(needs, traits)

	for i in count:
		var drive_id := GenomeDB.drive_id_at(i)
		var drive: Dictionary = GenomeDB.get_drive(drive_id)
		var state_name := String(drive.get("state", ""))
		var as_state: int = AetherTypes.key_to_enum(State, state_name, -1)

		var gate: float = 1.0
		if as_state >= 0 and need_scores.has(as_state):
			gate *= maxf(float(need_scores[as_state]), 0.05)

		# Innate predisposition, as a deviation from the species norm. The
		# genome catalog already carries a trait for every drive in the roster.
		var innate := String(drive.get("innate_trait", ""))
		if not innate.is_empty():
			var polarity := float(drive.get("innate_polarity", 1.0))
			var deviation := float(traits.get(innate, GenomeDB.trait_baseline(innate))) \
				- GenomeDB.trait_baseline(innate)
			gate *= exp(clampf(deviation * polarity * 0.5, -2.0, 2.0))

		# Crystallized archetypes bias the weights rather than overriding the
		# choice, so a Guardian is still an animal with needs, not a script.
		if as_state >= 0:
			var key := _key_for_state(as_state)
			if bias.has(key):
				gate *= float(bias[key])

		# What the lineage has understood. Multiplies with the archetype rather
		# than replacing it: a Guardian in a clan that has worked out Alarm Call
		# is more protective than either fact alone would make it.
		if neuron_bias.has(drive_id):
			gate *= float(neuron_bias[drive_id])

		out[i] = log(clampf(gate, GATE_FLOOR, GATE_CEILING))
	return out


## The Phase 0 utility terms, unchanged in spirit and extended to the six new
## actions. This is the designer's floor: whatever the clan has learned, an
## animal that is starving is not curious.
func _need_scores(needs: NeedsComponent, traits: Dictionary) -> Dictionary:
	var hunger: float = needs.hunger if needs != null else 1.0
	var energy: float = needs.energy if needs != null else 1.0
	var health: float = needs.health if needs != null else 1.0
	var mood: float = needs.mood if needs != null else 0.7

	return {
		# Unmet needs dominate.
		State.SEEK_FOOD: (1.0 - hunger) * 1.2 + 0.1,
		State.REST: (1.0 - energy) * 0.9 + 0.1,
		# Temperament decides what it does with the time it has left over.
		State.WANDER: 0.25 + float(traits.get("agility", 1.0)) * 0.15,
		State.IDLE: 0.2 + float(traits.get("sociability", 0.5)) * 0.1,
		State.FIGHT: float(traits.get("aggression", 0.5)) * 0.3 + 0.05,
		State.FLEE: (1.0 - float(traits.get("aggression", 0.5))) * 0.1 + 0.05,
		# Phase 4 additions, same shape: a floor proportional to whether the
		# action is currently a reasonable thing for any animal to be doing.
		State.PROTECT: 0.15 + float(traits.get("empathy", 0.5)) * 0.2,
		State.SOCIALIZE: 0.1 + mood * 0.3,
		# Gathering for the clan is what a fed animal does with its surplus.
		State.FORAGE: 0.1 + hunger * 0.35,
		State.MIGRATE: 0.05 + (1.0 - health) * 0.15 + (1.0 - hunger) * 0.2,
		# Play is the first thing a stressed clan loses.
		State.PLAY: 0.05 + minf(energy, mood) * 0.3,
		State.USE_TOOL: 0.1 + float(traits.get("dexterity", 0.5)) * 0.25,
	}


## Archetype `ai_bias` keys, which are authored strings.
##
## NOTE — behaviour change, deliberate. Before Phase 4 there was no PROTECT
## action, so "protect" fell through to FIGHT and arch_guardian's
## {"protect": 3.0} biased a Guardian toward *fighting*. It now biases toward
## protecting, which is what the catalog always meant.
func _key_for_state(as_state: int) -> String:
	match as_state:
		State.SEEK_FOOD: return "seek_food"
		State.REST: return "rest"
		State.WANDER: return "wander"
		State.IDLE: return "idle"
		State.FIGHT: return "fight"
		State.FLEE: return "flee"
		State.PROTECT: return "protect"
		State.SOCIALIZE: return "socialize"
		State.FORAGE: return "forage"
		State.MIGRATE: return "migrate"
		State.PLAY: return "play"
		State.USE_TOOL: return "use_tool"
		_: return ""


func _state_for_drive_index(index: int) -> int:
	var drive := GenomeDB.get_drive(GenomeDB.drive_id_at(index))
	if drive.is_empty():
		return -1
	return AetherTypes.key_to_enum(State, String(drive.get("state", "")), -1)


# --- Credit assignment --------------------------------------------------------

func _push_trace(perception: PackedFloat32Array, action: int,
		probs: PackedFloat32Array) -> void:
	_trace.append({
		"tick": SimulationBudget.current_tick,
		"action": action,
		"input": perception.duplicate(),
		"probs": probs.duplicate(),
	})
	if _trace.size() > TRACE_CAP:
		_trace = _trace.slice(_trace.size() - TRACE_CAP)


func trace() -> Array:
	return _trace


func clear_trace() -> void:
	_trace.clear()


# --- Readout ------------------------------------------------------------------

func _record_explanation(logits: PackedFloat32Array, gates: PackedFloat32Array,
		probs: PackedFloat32Array) -> void:
	_last_scores.clear()
	_last_explain.clear()
	for i in probs.size():
		var as_state := _state_for_drive_index(i)
		if as_state < 0:
			continue
		_last_scores[as_state] = probs[i]
		_last_explain[as_state] = {
			"drive": GenomeDB.drive_id_at(i),
			"logit": logits[i],
			"gate": gates[i],
			"final": logits[i] + gates[i],
			"p": probs[i],
		}


func state_name() -> String:
	return AetherTypes.enum_to_key(State, state)


func last_scores() -> Dictionary:
	return _last_scores


func last_explanation() -> Dictionary:
	return _last_explain


func describe() -> Array[String]:
	var lines: Array[String] = ["  state: %s" % state_name().to_lower()]
	if _last_scores.is_empty():
		return lines

	var ranked: Array = _last_explain.keys()
	ranked.sort_custom(func(a, b):
		return float(_last_explain[a]["p"]) > float(_last_explain[b]["p"]))

	var parts: Array[String] = []
	for key in ranked:
		parts.append("%s %.2f" % [
			AetherTypes.enum_to_key(State, key).to_lower(), _last_scores[key]])
	lines.append("  weighing: " + ",  ".join(parts))

	# Why, in three columns: what the clan has learned, what this animal's body
	# and history insist on, and where that leaves it. A learned policy is only
	# acceptable in this codebase if it stays as inspectable as the genome.
	lines.append("  %-12s %8s %8s %8s %7s" % ["drive", "learned", "gates", "final", "p"])
	for key in ranked.slice(0, 4):
		var e: Dictionary = _last_explain[key]
		lines.append("  %-12s %+8.2f %+8.2f %+8.2f %7.3f" % [
			String(e["drive"]).substr(0, 12), e["logit"], e["gate"], e["final"], e["p"]])
	return lines


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	# The enum name, not the integer — reordering State must not turn every
	# resting creature in every save into a fleeing one.
	#
	# The trace, the logits and the explanation are all derived and are all
	# absent on purpose (assumption #11). The culture's weights are the state
	# that matters here, and they are saved once per clan, not once per animal.
	return {"state": AetherTypes.enum_to_key(State, state)}


func from_dict(d: Dictionary) -> void:
	state = AetherTypes.key_to_enum(State, String(d.get("state", "IDLE")), State.IDLE)


func post_load() -> void:
	_reseed()
	_trace.clear()
