extends Resource
class_name CultureResource

## One clan's culture: the weights it has learned, what it inherited, and the
## running statistics that keep learning stable.
##
## TWO NETWORKS, NOT ONE.
##   locked — the inherited baseline. What the clan *is*.
##   live   — the currently-learning copy. What this generation is *becoming*.
##
## Every decision reads `live`. Every update writes `live`, with a continuous
## elastic pull back toward `locked` (CultureNet.ANCHOR_STRENGTH). At a
## generation advance, `locked` moves a configurable fraction of the way toward
## `live`, picks up a little drift, and `live` restarts from it.
##
## That split is the same balance lever chromosome length is. Aetherline already
## makes `chr_thermal` short so a hard-won survival adaptation inherits as a unit,
## and `chr_temperament` long so a bloodline does not have one personality;
## `inheritance_fraction` is the cultural equivalent. Low makes a conservative
## clan that forgets slowly. High makes a plastic one that reinvents itself every
## generation and can lose what its grandparents died learning.

const SCHEMA_VERSION: int = 1

## Recent drift samples retained for the lab's chart. Bounded for the same reason
## ExperienceComponent caps episodes at 120: a campaign runs for generations, and
## no debug chart is worth an unbounded array in every save.
const DRIFT_HISTORY_CAP: int = 120

## Experiences accumulated before a gradient is applied.
##
## Batching cuts gradient variance roughly fourfold, gives the reward baseline a
## real sample to work from, and keeps the weight write off any creature's
## decision path.
const BATCH_SIZE: int = 16

## EMA rate for the reward baseline and its spread.
const BASELINE_RATE: float = 0.01

## Floor on the reward standard deviation used to normalise advantage, so an
## early run of identical rewards cannot divide by ~0.
const MIN_STD: float = 0.25

## How often the ABSTRACT band's shared policy is recomputed, in ticks.
const MEAN_POLICY_INTERVAL: int = 300

@export var schema_version: int = SCHEMA_VERSION
@export var culture_id: String = ""
@export var display_name: String = ""

## 64-bit. Goes through AetherTypes.i64_to_json on the way to disk — a seed that
## shifts by 8 across a save/load gives the culture a different drift trajectory
## forever, and it would present to a player as "my clan's personality changed
## when I reloaded", which is unattributable. Same trap the planet seeds hit.
@export var rng_seed: int = 0

@export var learning_rate: float = 0.05

## How far `locked` moves toward `live` when a generation consolidates.
##
## The balance lever. Low makes a conservative clan that forgets slowly and
## learns slowly; high makes a plastic one that reinvents itself every
## generation and can lose what its grandparents died learning. 0.75 keeps most
## of a generation's discoveries while leaving a real pull back toward what the
## clan already was.
@export var inheritance_fraction: float = 0.75

## Noise added to `locked` at each generation advance, as a FRACTION of each
## layer's own scale. What makes two clans, separated on two worlds from
## identical weights, become different peoples rather than copies.
@export var drift: float = 0.05

@export var temperature_start: float = 1.2
@export var temperature_min: float = 0.6
## Applies over which temperature anneals from start to min. A young clan
## experiments; an old one has convictions.
@export var temperature_anneal: float = 4000.0

@export var generation: int = 0
@export var member_count: int = 0
## Highest generation ever born into this culture. Consolidation triggers off it.
@export var high_water_generation: int = 0

## Running reward statistics. Baseline subtraction is not optional: without it
## every positive reward pushes every taken action up, and the policy walks
## instead of learning.
@export var reward_baseline: float = 0.0
@export var reward_variance: float = 1.0

## kind -> cumulative reward contributed. The reward-hacking detector: one kind
## swallowing the ledger is what an exploit looks like from here.
@export var reward_tally: Dictionary = {}

var live: CultureNet = null
var locked: CultureNet = null

var _rng := RandomNumberGenerator.new()

## Bounded samples of { applies, norms, entropy, drift } for the lab's chart.
var drift_history: Array = []

## Mean perception across the clan, maintained by the ticker. The ABSTRACT band
## acts on the policy this produces, so a distant herd still reflects what the
## clan knows without anybody running a forward pass for it.
var mean_perception: PackedFloat32Array = PackedFloat32Array()
var mean_policy: PackedFloat32Array = PackedFloat32Array()
var _mean_policy_tick: int = -1_000_000


static func create(id: String, world_seed: int, name_hint: String = "") -> CultureResource:
	var c := CultureResource.new()
	c.culture_id = id
	c.display_name = name_hint if not name_hint.is_empty() else id
	# Named-stream seeding, the same idiom PlanetSeedResource.rng_for uses, so
	# that changing one culture's algorithm cannot shift another's trajectory.
	c.rng_seed = world_seed ^ hash("culture:" + id)
	c._rng.seed = c.rng_seed
	c.ensure_nets()
	return c


## Build the networks if they are missing, sized from the drive catalog.
func ensure_nets() -> void:
	var outputs: int = maxi(1, GenomeDB.drive_count())
	if live == null:
		live = CultureNet.new(Perception.SLOT_COUNT, 32, 16, outputs)
		live.initialize(_rng, Perception.DEAD_SLOTS)
	if locked == null:
		locked = live.duplicate_net()
	if mean_perception.size() != Perception.SLOT_COUNT:
		mean_perception = Perception.blank()


func rng() -> RandomNumberGenerator:
	return _rng


# --- Policy -------------------------------------------------------------------

## Exploration temperature, annealed by experience.
##
## Sampling rather than argmax is what makes discovery possible at all: a
## deterministic policy can never take the action it has not yet learned is good,
## which would make the whole hundredth-monkey claim unfalsifiable. Set to 0 for
## a scripted clan that does not improvise.
func temperature() -> float:
	if live == null:
		return temperature_start
	var t: float = float(live.applies) / maxf(1.0, temperature_anneal)
	return lerpf(temperature_start, temperature_min, clampf(t, 0.0, 1.0))


## Cached policy over the clan's mean perception. One forward pass serves the
## entire ABSTRACT band for MEAN_POLICY_INTERVAL ticks.
func refresh_mean_policy(force: bool = false) -> void:
	ensure_nets()
	if not force and SimulationBudget.current_tick - _mean_policy_tick < MEAN_POLICY_INTERVAL:
		return
	_mean_policy_tick = SimulationBudget.current_tick
	var zero_gates := PackedFloat32Array()
	zero_gates.resize(live.out_size)
	mean_policy = live.policy(live.forward(mean_perception), zero_gates, temperature()).duplicate()


## Fold one creature's perception into the running clan mean.
func note_perception(v: PackedFloat32Array, weight: float = 0.02) -> void:
	if v.size() != mean_perception.size():
		return
	for i in v.size():
		mean_perception[i] = lerpf(mean_perception[i], v[i], weight)


# --- Learning -----------------------------------------------------------------

## Normalise a raw reward into an advantage, and fold it into the baseline.
func advantage(reward: float) -> float:
	var centred := reward - reward_baseline
	reward_baseline += (reward - reward_baseline) * BASELINE_RATE
	reward_variance += (centred * centred - reward_variance) * BASELINE_RATE
	return centred / maxf(sqrt(maxf(reward_variance, 0.0)), MIN_STD)


func note_reward(kind: String, value: float) -> void:
	reward_tally[kind] = float(reward_tally.get(kind, 0.0)) + value


## Apply the pending gradient batch if it is full (or if `force`).
func maybe_apply(force: bool = false) -> bool:
	ensure_nets()
	if live.pending_batch() <= 0:
		return false
	# A clan with a learning rate of zero does not learn — and that has to mean
	# its weights do not move AT ALL, not merely that the gradient term is zero.
	# The elastic anchor would otherwise still drag live toward locked, so a
	# "scripted" clan would quietly change anyway.
	if learning_rate <= 0.0:
		live.drop_batch()
		return false
	if not force and live.pending_batch() < BATCH_SIZE:
		return false
	var applied := live.apply(learning_rate, locked)
	if applied:
		sample_drift()
	return applied


## Record one point on the drift chart. Entropy is here as much as the norms are:
## a culture whose policy entropy is sliding toward zero is collapsing into a
## single drive, and that is visible here long before it is visible in play.
func sample_drift() -> void:
	if live.applies % 25 != 0:
		return
	var norms := live.layer_norms()
	refresh_mean_policy(true)
	drift_history.append({
		"applies": live.applies,
		"n0": norms[0], "n1": norms[1], "n2": norms[2],
		"entropy": CultureNet.entropy(mean_policy),
		"from_locked": live.mean_abs_difference(locked),
	})
	if drift_history.size() > DRIFT_HISTORY_CAP:
		drift_history = drift_history.slice(drift_history.size() - DRIFT_HISTORY_CAP)


# --- Generations --------------------------------------------------------------

## Consolidate what this generation learned into what the clan is.
##
## Returns the retained correlation between the pre- and post-advance mean
## policies — a real measured number, not a constant, so the lab and the story
## layer can both say how much of the old clan survived.
func advance_generation() -> float:
	ensure_nets()
	live.drop_batch()
	refresh_mean_policy(true)
	var before := mean_policy.duplicate()

	var blend := clampf(inheritance_fraction, 0.0, 1.0)
	_blend_into_locked(blend)
	_apply_drift()
	live.copy_from(locked)

	generation += 1
	refresh_mean_policy(true)
	var retained := _correlation(before, mean_policy)
	EventBus.culture_generation_advanced.emit(culture_id, generation, retained)
	return retained


func _blend_into_locked(blend: float) -> void:
	_blend_array(locked.w0, live.w0, blend); _blend_array(locked.b0, live.b0, blend)
	_blend_array(locked.w1, live.w1, blend); _blend_array(locked.b1, live.b1, blend)
	_blend_array(locked.w2, live.w2, blend); _blend_array(locked.b2, live.b2, blend)


## Blend one whole network toward another, in place. `share` is how much of
## `source` ends up in `target`. Exposed because merging two clans needs exactly
## this and should not re-derive it.
static func blend_nets(target: CultureNet, source: CultureNet, share: float) -> void:
	if target == null or source == null or not target.same_shape_as(source):
		return
	var s := clampf(share, 0.0, 1.0)
	_blend_array(target.w0, source.w0, s); _blend_array(target.b0, source.b0, s)
	_blend_array(target.w1, source.w1, s); _blend_array(target.b1, source.b1, s)
	_blend_array(target.w2, source.w2, s); _blend_array(target.b2, source.b2, s)


static func _blend_array(target: PackedFloat32Array, source: PackedFloat32Array,
		blend: float) -> void:
	if target.size() != source.size():
		return
	for i in target.size():
		target[i] = target[i] * (1.0 - blend) + source[i] * blend


## Cultural drift, applied RELATIVE to each layer's own scale.
##
## Absolute noise would be wildly uneven: the output layer initialises around
## 0.025 while the first hidden layer initialises around 0.25, so one fixed
## sigma is a rounding error in one place and a lobotomy in another. Scaling by
## each layer's RMS makes `drift` mean the same thing everywhere — "this
## generation remembers it about 5% differently" — which is what drift is for.
func _apply_drift() -> void:
	if drift <= 0.0:
		return
	for arr in [locked.w0, locked.b0, locked.w1, locked.b1, locked.w2, locked.b2]:
		if arr.is_empty():
			continue
		var sq := 0.0
		for v in arr:
			sq += v * v
		var rms := sqrt(sq / float(arr.size()))
		if rms <= 0.0:
			continue
		for i in arr.size():
			arr[i] += _rng.randfn(0.0, drift * rms)


static func _correlation(a: PackedFloat32Array, b: PackedFloat32Array) -> float:
	if a.size() != b.size() or a.is_empty():
		return 0.0
	var n := float(a.size())
	var mean_a := 0.0
	var mean_b := 0.0
	for i in a.size():
		mean_a += a[i]
		mean_b += b[i]
	mean_a /= n
	mean_b /= n
	var cov := 0.0
	var var_a := 0.0
	var var_b := 0.0
	for i in a.size():
		var da := a[i] - mean_a
		var db := b[i] - mean_b
		cov += da * db
		var_a += da * da
		var_b += db * db
	var denom := sqrt(var_a * var_b)
	return 1.0 if denom <= 0.0 else clampf(cov / denom, -1.0, 1.0)


## In-game days a generation takes to turn over, for a clan nobody is watching.
##
## Matches the species' default `max_age_days` (300 x lifespan baseline 1.0), so
## a colony left alone for three hundred days has genuinely replaced itself once.
const GENERATION_DAYS: float = 300.0

## Beyond this many unattended generations, a culture is drifting rather than
## living. Left uncapped, a two-thousand-day absence would run seven consecutive
## drift passes over weights nobody is correcting, and the clan you come back to
## would be noise rather than a people who changed.
const MAX_UNATTENDED_GENERATIONS: int = 6


## Age this culture through a stretch of time in which nobody was simulated.
##
## The counterpart to PlanetManager._catch_up, which ages the bodies: this ages
## what they believe. Nothing is learned — learning needs lived experience, and
## there was none — but generations turn over, and each one carries `drift`. That
## is what makes a colony you left for nine years greet you with its own accent
## instead of your own opinions read back to you.
##
## Returns how many generations passed.
func age_unattended(days: float) -> int:
	if days <= 0.0:
		return 0
	ensure_nets()
	var generations: int = mini(
		int(days / GENERATION_DAYS), MAX_UNATTENDED_GENERATIONS)
	for _i in generations:
		advance_generation()
	return generations


func note_birth(child_generation: int) -> void:
	member_count += 1
	high_water_generation = maxi(high_water_generation, child_generation)


## Whether the clan has outlived the culture it inherited. The emergent trigger
## for consolidation — a generation advance is something a clan does by living
## long enough, not something a system schedules.
func generation_advance_due() -> bool:
	return high_water_generation > generation


# --- Authoring ----------------------------------------------------------------

## Seed the output biases from a named prior.
##
## Only the biases, never the weight matrices. The biases are the sole
## interpretable parameters in the network, so "this clan is timid" is one
## authored line that cannot make the network internally strange the way
## hand-writing a matrix would. This is the designer's lever the design document
## asks for.
func seed_prior(prior_id: String) -> bool:
	ensure_nets()
	var prior := GenomeDB.get_culture_prior(prior_id)
	if prior.is_empty():
		return false
	for i in live.out_size:
		live.set_output_bias(i, 0.0)
	var biases: Dictionary = prior.get("biases", {})
	for drive_id in biases:
		var index := GenomeDB.drive_index(String(drive_id))
		if index >= 0:
			live.set_output_bias(index, float(biases[drive_id]))
	locked.copy_from(live)
	return true


## Discard everything this generation learned and return to the inherited state.
func reset_live_to_locked() -> void:
	ensure_nets()
	live.drop_batch()
	live.copy_from(locked)
	refresh_mean_policy(true)


# --- Readout ------------------------------------------------------------------

func describe() -> Array[String]:
	ensure_nets()
	refresh_mean_policy()
	var lines: Array[String] = []
	lines.append("  %s · generation %d · %d members" % [display_name, generation, member_count])
	lines.append("  net: %s" % live.debug_summary())
	lines.append("  temperature %.2f · lr %.3f · inherit %.0f%% · drift %.3f" % [
		temperature(), learning_rate, inheritance_fraction * 100.0, drift])
	lines.append("  reward baseline %+.3f (sd %.3f) · policy entropy %.3f / %.3f" % [
		reward_baseline, sqrt(maxf(reward_variance, 0.0)),
		CultureNet.entropy(mean_policy), CultureNet.max_entropy(live.out_size)])
	lines.append("  drift from inherited: %.5f per weight" % live.mean_abs_difference(locked))
	return lines


## The clan's current disposition, strongest drive first.
func drive_report() -> Array:
	ensure_nets()
	refresh_mean_policy()
	var out: Array = []
	for i in live.out_size:
		out.append({
			"drive": GenomeDB.drive_id_at(i),
			"p": mean_policy[i] if i < mean_policy.size() else 0.0,
			"bias": live.output_bias(i),
		})
	out.sort_custom(func(a, b): return float(a["p"]) > float(b["p"]))
	return out


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	ensure_nets()
	return {
		"schema_version": SCHEMA_VERSION,
		"culture_id": culture_id,
		"display_name": display_name,
		"rng_seed": AetherTypes.i64_to_json(rng_seed),
		"rng_state": AetherTypes.i64_to_json(int(_rng.state)),
		"learning_rate": learning_rate,
		"inheritance_fraction": inheritance_fraction,
		"drift": drift,
		"temperature_start": temperature_start,
		"temperature_min": temperature_min,
		"temperature_anneal": temperature_anneal,
		"generation": generation,
		"member_count": member_count,
		"high_water_generation": high_water_generation,
		"reward_baseline": reward_baseline,
		"reward_variance": reward_variance,
		"reward_tally": reward_tally.duplicate(),
		"applies": live.applies,
		# The network itself.
		"arch": [live.in_size, live.h1_size, live.h2_size, live.out_size],
		"layout_version": Perception.LAYOUT_VERSION,
		"live": live.to_blob(),
		"locked": locked.to_blob(),
		# Derived and deliberately absent: drift_history, mean_perception,
		# mean_policy, and every eligibility trace. Assumption #11.
	}


static func from_dict(d: Dictionary) -> CultureResource:
	var c := CultureResource.new()
	c.culture_id = String(d.get("culture_id", ""))
	c.display_name = String(d.get("display_name", c.culture_id))
	c.rng_seed = AetherTypes.i64_from_json(d.get("rng_seed", "0"))
	c._rng.seed = c.rng_seed
	var state := AetherTypes.i64_from_json(d.get("rng_state", "0"))
	if state != 0:
		c._rng.state = state
	c.learning_rate = float(d.get("learning_rate", 0.05))
	c.inheritance_fraction = float(d.get("inheritance_fraction", 0.6))
	c.drift = float(d.get("drift", 0.01))
	c.temperature_start = float(d.get("temperature_start", 1.2))
	c.temperature_min = float(d.get("temperature_min", 0.6))
	c.temperature_anneal = float(d.get("temperature_anneal", 4000.0))
	c.generation = int(d.get("generation", 0))
	c.member_count = int(d.get("member_count", 0))
	c.high_water_generation = int(d.get("high_water_generation", 0))
	c.reward_baseline = float(d.get("reward_baseline", 0.0))
	c.reward_variance = float(d.get("reward_variance", 1.0))
	c.reward_tally = d.get("reward_tally", {}).duplicate()

	c._restore_nets(d)
	c.live.applies = int(d.get("applies", 0))
	return c


## Rebuild the networks from a save, reconciling any architecture change.
##
## THE RULE: never silently reinterpret weights across a shape change. Layer-0
## columns are indexed by perception slot and layer-2 rows by drive; a matrix
## reshaped underneath them maps everything a clan learned onto the wrong inputs
## and produces a culture that is subtly wrong rather than loudly broken — which
## the README names as this project's worst failure mode.
func _restore_nets(d: Dictionary) -> void:
	var expected_outputs: int = maxi(1, GenomeDB.drive_count())
	var stored: Array = d.get("arch", [])
	if stored.size() != 4:
		ensure_nets()
		push_warning("CultureResource '%s': save carries no architecture; reseeded." % culture_id)
		return

	var in_size := int(stored[0])
	var h1 := int(stored[1])
	var h2 := int(stored[2])
	var out_size := int(stored[3])

	# Hidden geometry is the one thing that cannot be reconciled: there is no
	# correspondence between an old hidden unit and a new one.
	if h1 != 32 or h2 != 16:
		ensure_nets()
		push_warning(("CultureResource '%s': hidden layers changed (%d-%d, expected 32-16). "
			+ "The clan's learned weights could not be carried forward and were reseeded; "
			+ "its history and generation count are kept.") % [culture_id, h1, h2])
		return

	live = CultureNet.new(in_size, h1, h2, out_size)
	locked = CultureNet.new(in_size, h1, h2, out_size)
	var ok_live := live.from_blob(String(d.get("live", "")))
	var ok_locked := locked.from_blob(String(d.get("locked", "")))
	if not ok_live or not ok_locked:
		live = null
		locked = null
		ensure_nets()
		push_warning("CultureResource '%s': weight blob failed to decode; reseeded." % culture_id)
		return

	# Growth is safe in both directions, and only in the growing direction.
	# Appended perception slots were zero-initialised, so the widened net is
	# bit-identical on the inputs it already had; an appended drive starts at
	# logit zero, which is the honest position for a behaviour the clan has never
	# had the option to perform.
	if in_size < Perception.SLOT_COUNT:
		live.grow_inputs(Perception.SLOT_COUNT)
		locked.grow_inputs(Perception.SLOT_COUNT)
	if out_size < expected_outputs:
		live.grow_outputs(expected_outputs)
		locked.grow_outputs(expected_outputs)

	if live.in_size != Perception.SLOT_COUNT or live.out_size != expected_outputs:
		push_warning(("CultureResource '%s': save is newer than this build "
			+ "(%d inputs / %d drives against %d / %d); loaded as-is.") % [
			culture_id, live.in_size, live.out_size,
			Perception.SLOT_COUNT, expected_outputs])

	if mean_perception.size() != live.in_size:
		mean_perception = Perception.blank()
