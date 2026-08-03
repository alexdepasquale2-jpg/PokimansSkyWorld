extends RefCounted
class_name CultureNet

## The numerical core of the shared cultural brain: a small multi-layer
## perceptron with an online REINFORCE-with-baseline update.
##
## SCOPE DISCIPLINE: this file knows nothing about Aetherline. No Node, no
## autoload, no creature, no EventBus — only PackedFloat32Array and
## RandomNumberGenerator. That is deliberate and load-bearing. It is what lets
## the whole numerical half of the system be tested before a creature exists,
## and it is what makes assumption #1 (GDScript only) reversible: if this ever
## needs to become C# or ONNX, exactly one file moves and no caller changes.
##
## The public surface is six methods — forward, policy, accumulate, apply,
## to_blob, from_blob. Nothing else should be reached for from gameplay code.
##
## WHAT MAKES THIS A *CULTURE* RATHER THAN AN AGENT: one instance is shared by
## every creature in a clan. Each of them queries the same weights and each of
## them writes gradients back into the same weights. A thing learned by four
## individuals is therefore, mechanically and immediately, known to all of them.
## That is the entire "hundredth monkey" claim, and it is a property of the
## sharing rather than of the network.
##
## DETERMINISM RULE — READ BEFORE OPTIMISING. Every draw goes through a passed-in
## seeded RNG, and the arithmetic is deterministic only as long as loop order is
## stable and nothing is ever parallelised. GDScript reads a float32 element as a
## double, computes in double, and narrows on write; reordering an accumulation
## changes the last bits and will break every fixed-seed test in the suite for no
## visible reason. Do not reorder these loops.

## Leaky slope for the hidden activations.
##
## Plain ReLU is the obvious choice and the wrong one here. A dead unit in an
## ordinary RL net is recoverable because training restarts from fresh weights;
## this network is *never* re-initialised — it is the clan's brain for the life
## of the campaign, across every generation. A unit that dies in year one is
## capacity permanently lost to every creature that will ever be born into that
## clan. The slope costs one comparison per unit.
const LEAKY: float = 0.01

## Global L2 norm the accumulated gradient is clipped to before it is applied.
## The single most important stability lever in the system: one large advantage
## (a death, -3.0) times one large gradient would otherwise move every weight in
## the clan's brain in a single step.
const GRAD_CLIP: float = 1.0

## Hard bound on any individual weight. A backstop, not a mechanism — if it ever
## bites, the learning rate is wrong, and `clamp_events` says so out loud.
const WEIGHT_LIMIT: float = 8.0

## Strength of the elastic pull of `live` weights back toward the inherited
## `locked` ones, applied on every batch. This is the whole answer to
## catastrophic forgetting, and it is three lines: a clan that trains hard on a
## warm world drifts, but never all the way free of what six generations before
## it knew. Continuous, rather than only correcting at a generation boundary.
const ANCHOR_STRENGTH: float = 0.0001

## Coefficient on the entropy bonus. Keeps the policy from saturating into a
## single drive — see CultureSelfTest's collapse assertions.
const ENTROPY_BONUS: float = 0.01

## Applies between known-good snapshots. A NaN in a shared brain destroys every
## creature in the clan at once and would be discovered days later, so the cost
## of one array copy per 64 batches is not worth arguing about.
const SNAPSHOT_INTERVAL: int = 64

# --- Shape --------------------------------------------------------------------

var in_size: int = 0
var h1_size: int = 0
var h2_size: int = 0
var out_size: int = 0

# --- Parameters ---------------------------------------------------------------
# Flat, row-major (`w[out * in_size + in]`), one PackedFloat32Array per layer.
# Flat rather than an Array of PackedFloat32Array because the latter costs a
# Variant unbox per row, and the inner loop runs ~1,700 times per decision.

var w0 := PackedFloat32Array()
var b0 := PackedFloat32Array()
var w1 := PackedFloat32Array()
var b1 := PackedFloat32Array()
var w2 := PackedFloat32Array()
var b2 := PackedFloat32Array()

# --- Gradient accumulators ----------------------------------------------------
# Allocated once and reused. In GDScript allocation dominates arithmetic: a
# forward pass that allocates its own output costs more than one that does
# seventeen hundred multiply-adds into a buffer it already owns.

var _gw0 := PackedFloat32Array()
var _gb0 := PackedFloat32Array()
var _gw1 := PackedFloat32Array()
var _gb1 := PackedFloat32Array()
var _gw2 := PackedFloat32Array()
var _gb2 := PackedFloat32Array()
var _batch: int = 0

# --- Forward scratch ----------------------------------------------------------

var _a1 := PackedFloat32Array()
var _a2 := PackedFloat32Array()
var _logits := PackedFloat32Array()
var _probs := PackedFloat32Array()

# --- Rollback snapshot --------------------------------------------------------

var _snapshot: PackedFloat32Array = PackedFloat32Array()
var _applies_since_snapshot: int = 0

# --- Telemetry ----------------------------------------------------------------

## Total gradient applications over this net's life. Drives temperature
## annealing and is shown in the lab.
var applies: int = 0
## Times the hard weight clamp actually bit. Non-zero means the learning rate
## needs looking at.
var clamp_events: int = 0
## Times a non-finite weight was caught and rolled back. Should always be zero.
var rollbacks: int = 0
## L2 norm of the last applied update, per layer. The drift chart reads this.
var last_update_norm: float = 0.0
## Number of forward passes performed. The tier tests assert against this.
var forwards: int = 0


func _init(input_size: int = 32, hidden1: int = 32, hidden2: int = 16,
		output_size: int = 12) -> void:
	in_size = input_size
	h1_size = hidden1
	h2_size = hidden2
	out_size = output_size
	_allocate()


func _allocate() -> void:
	w0.resize(h1_size * in_size);  b0.resize(h1_size)
	w1.resize(h2_size * h1_size);  b1.resize(h2_size)
	w2.resize(out_size * h2_size); b2.resize(out_size)

	_gw0.resize(w0.size()); _gb0.resize(b0.size())
	_gw1.resize(w1.size()); _gb1.resize(b1.size())
	_gw2.resize(w2.size()); _gb2.resize(b2.size())

	_a1.resize(h1_size)
	_a2.resize(h2_size)
	_logits.resize(out_size)
	_probs.resize(out_size)


## Total learnable parameters. Quoted in the README, so it is computed rather
## than remembered.
func parameter_count() -> int:
	return w0.size() + b0.size() + w1.size() + b1.size() + w2.size() + b2.size()


# --- Initialisation -----------------------------------------------------------

## He-style initialisation, scaled per fan-in, drawn from `rng`.
##
## `dead_inputs` names the perception slots that carry no signal yet (Stage 2
## fills them). Their entire incoming weight column is initialised to EXACTLY
## zero rather than randomly, and this is not a micro-optimisation — it is the
## only reason a Stage 2 slot activation is survivable.
##
## The gradient into a zero input is already zero, so training can never corrupt
## those columns. The hazard runs the other way: with random init those weights
## sit at their birth values for however many hours a clan trains, and the moment
## the slot starts carrying real numbers it injects pure noise into a culture
## that had learned something. Zero-init means the network is bit-identically
## unchanged at the instant a slot goes live, and then learns the new input from
## scratch, which is what a new sense should feel like anyway.
func initialize(rng: RandomNumberGenerator, dead_inputs: Array = []) -> void:
	var dead := {}
	for slot in dead_inputs:
		dead[int(slot)] = true

	var scale0 := sqrt(2.0 / float(maxi(1, in_size)))
	for o in h1_size:
		for i in in_size:
			w0[o * in_size + i] = 0.0 if dead.has(i) else rng.randfn(0.0, scale0)
	for i in h1_size:
		b0[i] = 0.0

	var scale1 := sqrt(2.0 / float(maxi(1, h1_size)))
	for o in h2_size:
		for i in h1_size:
			w1[o * h1_size + i] = rng.randfn(0.0, scale1)
	for i in h2_size:
		b1[i] = 0.0

	# The output layer starts small so a fresh clan begins near a uniform policy
	# — with no opinion — instead of an arbitrary strong one it then has to
	# unlearn. The self-test asserts the uniform start explicitly.
	var scale2 := sqrt(1.0 / float(maxi(1, h2_size))) * 0.1
	for o in out_size:
		for i in h2_size:
			w2[o * h2_size + i] = rng.randfn(0.0, scale2)
	for i in out_size:
		b2[i] = 0.0

	_take_snapshot()


## Copy every parameter from `other`. Used for the live/locked split and for
## "reset live to locked" in the lab.
func copy_from(other: CultureNet) -> bool:
	if not same_shape_as(other):
		return false
	w0 = other.w0.duplicate(); b0 = other.b0.duplicate()
	w1 = other.w1.duplicate(); b1 = other.b1.duplicate()
	w2 = other.w2.duplicate(); b2 = other.b2.duplicate()
	_take_snapshot()
	return true


func same_shape_as(other: CultureNet) -> bool:
	return other != null and other.in_size == in_size and other.h1_size == h1_size \
		and other.h2_size == h2_size and other.out_size == out_size


func duplicate_net() -> CultureNet:
	var copy := CultureNet.new(in_size, h1_size, h2_size, out_size)
	copy.copy_from(self)
	return copy


# --- Forward ------------------------------------------------------------------

## Run the network. Returns raw drive logits — deliberately unsquashed, because
## arbitration adds its gates in log space and the softmax happens in `policy`.
##
## The returned array is the reused internal buffer. Callers that need to keep it
## (the eligibility trace does) must duplicate it.
func forward(x: PackedFloat32Array) -> PackedFloat32Array:
	forwards += 1

	for o in h1_size:
		var sum: float = b0[o]
		var row: int = o * in_size
		for i in in_size:
			sum += w0[row + i] * x[i]
		_a1[o] = sum if sum > 0.0 else sum * LEAKY

	for o in h2_size:
		var sum: float = b1[o]
		var row: int = o * h1_size
		for i in h1_size:
			sum += w1[row + i] * _a1[i]
		_a2[o] = sum if sum > 0.0 else sum * LEAKY

	for o in out_size:
		var sum: float = b2[o]
		var row: int = o * h2_size
		for i in h2_size:
			sum += w2[row + i] * _a2[i]
		_logits[o] = sum

	return _logits


## Softmax over logits plus additive gate biases, at `temperature`.
##
## THE KEY IDENTITY OF THE WHOLE DESIGN: arbitration modifiers are multiplicative
## on utility (that is what `archetype.ai_bias()` has always meant), and a
## multiplicative factor is an additive term in log space. So the authored gates
## fold into the softmax *exactly*, as `log(gate)`, and because they do not depend
## on the weights the REINFORCE gradient stays the clean, cheap form
## `onehot(a) - p`. That is what lets the network be scored on the action the
## creature actually took while the designer keeps a hard floor under it.
##
## Stability: the max is subtracted before exp, so a large logit cannot overflow.
func policy(logits: PackedFloat32Array, gate_logits: PackedFloat32Array,
		temperature: float = 1.0) -> PackedFloat32Array:
	var t: float = maxf(temperature, 0.0001)
	var best: float = -INF
	for i in out_size:
		var v: float = (logits[i] + (gate_logits[i] if i < gate_logits.size() else 0.0)) / t
		_probs[i] = v
		if v > best:
			best = v

	var total: float = 0.0
	for i in out_size:
		var e: float = exp(_probs[i] - best)
		_probs[i] = e
		total += e

	if total <= 0.0 or not is_finite(total):
		# Unreachable given the max-subtraction above, but a policy that returns
		# garbage would surface as creatures behaving randomly, which is very
		# hard to attribute after the fact. Fail loudly toward uniform instead.
		push_warning("CultureNet.policy: degenerate softmax; falling back to uniform.")
		for i in out_size:
			_probs[i] = 1.0 / float(out_size)
		return _probs

	for i in out_size:
		_probs[i] /= total
	return _probs


## Sample an action index from a probability vector using a seeded RNG.
static func sample(probs: PackedFloat32Array, rng: RandomNumberGenerator) -> int:
	var roll: float = rng.randf()
	var cumulative: float = 0.0
	for i in probs.size():
		cumulative += probs[i]
		if roll <= cumulative:
			return i
	return probs.size() - 1


static func argmax(probs: PackedFloat32Array) -> int:
	var best: int = 0
	var best_value: float = -INF
	for i in probs.size():
		if probs[i] > best_value:
			best_value = probs[i]
			best = i
	return best


## Shannon entropy of a distribution, in nats. The collapse detector: a culture
## whose entropy is falling toward zero is on its way to doing one thing forever.
static func entropy(probs: PackedFloat32Array) -> float:
	var h: float = 0.0
	for i in probs.size():
		var p: float = probs[i]
		if p > 0.0:
			h -= p * log(p)
	return h


static func max_entropy(n: int) -> float:
	return log(float(maxi(n, 1)))


# --- Learning -----------------------------------------------------------------

## Accumulate one experience into the pending gradient batch.
##
## `probs` must be the policy the creature ACTUALLY ACTED ON, gates included —
## not a fresh forward pass. Re-deriving it here would score the network on a
## decision nobody made, which is the classic way a policy-gradient
## implementation ends up training on a counterfactual and looking like it works.
##
## Sign convention: gradients accumulate in the ASCENT direction of the objective
## `J = log pi(a) * advantage + beta * H(pi)`, and `apply` moves weights along
## them. Stated because a sign error here is invisible — it trains perfectly well
## toward exactly the wrong behaviour.
func accumulate(x: PackedFloat32Array, action: int, advantage: float,
		probs: PackedFloat32Array) -> void:
	if action < 0 or action >= out_size or x.size() != in_size:
		return

	# The hidden activations must correspond to THIS input. Recomputed rather
	# than trusting whatever the last forward left behind, because the trace
	# replays experiences out of order and a stale cache would be silent.
	_forward_hidden(x)

	var h: float = entropy(probs)
	var dz := PackedFloat32Array()
	dz.resize(out_size)
	for i in out_size:
		var p: float = probs[i]
		var policy_term: float = ((1.0 if i == action else 0.0) - p) * advantage
		# d/dz_i of H(pi) = -p_i * (log p_i + H).
		var entropy_term: float = -p * (log(maxf(p, 1e-9)) + h) if ENTROPY_BONUS > 0.0 else 0.0
		dz[i] = policy_term + ENTROPY_BONUS * entropy_term

	# Output layer.
	var d_a2 := PackedFloat32Array()
	d_a2.resize(h2_size)
	for o in out_size:
		var g: float = dz[o]
		if g == 0.0:
			continue
		var row: int = o * h2_size
		_gb2[o] += g
		for i in h2_size:
			_gw2[row + i] += g * _a2[i]
	for i in h2_size:
		var sum: float = 0.0
		for o in out_size:
			sum += w2[o * h2_size + i] * dz[o]
		# Leaky ReLU derivative. The activation preserves the sign of its
		# pre-activation, so the post-activation is enough to recover the mask.
		d_a2[i] = sum * (1.0 if _a2[i] > 0.0 else LEAKY)

	# Second hidden layer.
	var d_a1 := PackedFloat32Array()
	d_a1.resize(h1_size)
	for o in h2_size:
		var g: float = d_a2[o]
		var row: int = o * h1_size
		_gb1[o] += g
		for i in h1_size:
			_gw1[row + i] += g * _a1[i]
	for i in h1_size:
		var sum: float = 0.0
		for o in h2_size:
			sum += w1[o * h1_size + i] * d_a2[o]
		d_a1[i] = sum * (1.0 if _a1[i] > 0.0 else LEAKY)

	# First hidden layer. Note `x[i]` here: a zero input contributes exactly
	# zero to its incoming weights, which is why dead perception slots are inert.
	for o in h1_size:
		var g: float = d_a1[o]
		var row: int = o * in_size
		_gb0[o] += g
		for i in in_size:
			_gw0[row + i] += g * x[i]

	_batch += 1


## Fills the hidden activations only. Used by `accumulate`; does not count as a
## forward pass for budget accounting, because no decision came out of it.
func _forward_hidden(x: PackedFloat32Array) -> void:
	for o in h1_size:
		var sum: float = b0[o]
		var row: int = o * in_size
		for i in in_size:
			sum += w0[row + i] * x[i]
		_a1[o] = sum if sum > 0.0 else sum * LEAKY
	for o in h2_size:
		var sum: float = b1[o]
		var row: int = o * h1_size
		for i in h1_size:
			sum += w1[row + i] * _a1[i]
		_a2[o] = sum if sum > 0.0 else sum * LEAKY


func pending_batch() -> int:
	return _batch


## Apply the accumulated batch. `anchor` is the inherited `locked` net that the
## live weights are elastically pulled toward; pass null to skip that.
##
## Order matters and each step earns its place — see the constants at the top.
func apply(learning_rate: float, anchor: CultureNet = null) -> bool:
	if _batch <= 0:
		return false

	var inv := 1.0 / float(_batch)

	# Global L2 norm across every gradient, then clip.
	var sq: float = 0.0
	for v in _gw0: sq += v * v
	for v in _gb0: sq += v * v
	for v in _gw1: sq += v * v
	for v in _gb1: sq += v * v
	for v in _gw2: sq += v * v
	for v in _gb2: sq += v * v
	var norm := sqrt(sq) * inv
	var step := learning_rate * inv
	if norm > GRAD_CLIP and norm > 0.0:
		step *= GRAD_CLIP / norm
	last_update_norm = norm

	var use_anchor: bool = anchor != null and anchor.same_shape_as(self)
	_step_layer(w0, _gw0, step, anchor.w0 if use_anchor else PackedFloat32Array())
	_step_layer(b0, _gb0, step, anchor.b0 if use_anchor else PackedFloat32Array())
	_step_layer(w1, _gw1, step, anchor.w1 if use_anchor else PackedFloat32Array())
	_step_layer(b1, _gb1, step, anchor.b1 if use_anchor else PackedFloat32Array())
	_step_layer(w2, _gw2, step, anchor.w2 if use_anchor else PackedFloat32Array())
	_step_layer(b2, _gb2, step, anchor.b2 if use_anchor else PackedFloat32Array())

	_clear_gradients()
	applies += 1
	_applies_since_snapshot += 1

	if not _is_finite():
		_restore_snapshot()
		rollbacks += 1
		push_error("CultureNet: non-finite weights after update; rolled back to last snapshot. "
			+ "Learning rate is almost certainly too high.")
		return false

	if _applies_since_snapshot >= SNAPSHOT_INTERVAL:
		_take_snapshot()
	return true


func _step_layer(param: PackedFloat32Array, grad: PackedFloat32Array, step: float,
		anchor: PackedFloat32Array) -> void:
	var has_anchor := anchor.size() == param.size()
	for i in param.size():
		var v: float = param[i] + grad[i] * step
		if has_anchor:
			v += (anchor[i] - v) * ANCHOR_STRENGTH
		if v > WEIGHT_LIMIT:
			v = WEIGHT_LIMIT
			clamp_events += 1
		elif v < -WEIGHT_LIMIT:
			v = -WEIGHT_LIMIT
			clamp_events += 1
		param[i] = v


func _clear_gradients() -> void:
	_gw0.fill(0.0); _gb0.fill(0.0)
	_gw1.fill(0.0); _gb1.fill(0.0)
	_gw2.fill(0.0); _gb2.fill(0.0)
	_batch = 0


## Discard the pending batch without applying it.
func drop_batch() -> void:
	_clear_gradients()


# --- Integrity ----------------------------------------------------------------

func _is_finite() -> bool:
	# Sampling the sums rather than every element: a NaN anywhere in a layer
	# poisons its sum, and this runs on every batch.
	for arr in [w0, b0, w1, b1, w2, b2]:
		var sum: float = 0.0
		for v in arr:
			sum += v
		if not is_finite(sum):
			return false
	return true


func _take_snapshot() -> void:
	_snapshot = _flatten()
	_applies_since_snapshot = 0


func _restore_snapshot() -> void:
	if _snapshot.size() == parameter_count():
		_unflatten(_snapshot)
	_applies_since_snapshot = 0


# --- Serialization ------------------------------------------------------------

func _flatten() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(parameter_count())
	var at := 0
	for arr in [w0, b0, w1, b1, w2, b2]:
		for i in arr.size():
			out[at] = arr[i]
			at += 1
	return out


func _unflatten(flat: PackedFloat32Array) -> bool:
	if flat.size() != parameter_count():
		return false
	var at := 0
	for arr in [w0, b0, w1, b1, w2, b2]:
		for i in arr.size():
			arr[i] = flat[at]
			at += 1
	return true


## Base64 of the raw float32 bytes.
##
## Not JSON numbers: ~1,800 floats would be ~45 KB of text per network instead of
## ~9 KB, and — the part that actually matters — it would be LOSSY. Godot's JSON
## parser returns every number as a double and `stringify` shortens floats, so a
## save/load would quietly change the clan's behaviour. This repo has already
## paid for one float-through-text precision bug (see AetherTypes' i64 helpers);
## this is the same lesson applied before it costs anything.
##
## Deliberately NOT quantised to float16. The entire test suite is built on exact
## round trips. If save size ever becomes a real problem, compress the section —
## SaveSystem's header already says that is where compression goes.
func to_blob() -> String:
	return Marshalls.raw_to_base64(_flatten().to_byte_array())


func from_blob(blob: String) -> bool:
	var bytes := Marshalls.base64_to_raw(blob)
	if bytes.is_empty():
		return false
	var flat := bytes.to_float32_array()
	return _unflatten(flat)


func arch() -> PackedInt32Array:
	return PackedInt32Array([in_size, h1_size, h2_size, out_size])


# --- Growth -------------------------------------------------------------------

## Grow the input layer, keeping every learned weight and zero-filling the new
## columns. This is how a Stage 2 perception slot comes online without costing a
## clan its memory.
##
## Safe precisely BECAUSE dead slots were zero-initialised: the grown network is
## bit-identical on the inputs it already had. Same append-only discipline the
## genome schema and the AetherTypes enums run on.
func grow_inputs(new_in_size: int) -> bool:
	if new_in_size < in_size:
		return false
	if new_in_size == in_size:
		return true
	var grown := PackedFloat32Array()
	grown.resize(h1_size * new_in_size)
	for o in h1_size:
		for i in in_size:
			grown[o * new_in_size + i] = w0[o * in_size + i]
	w0 = grown
	in_size = new_in_size
	_gw0.resize(w0.size()); _gw0.fill(0.0)
	_take_snapshot()
	return true


## Grow the output layer. A newly appended drive starts with a zero logit, so it
## receives a fair share of probability and carries no learned preference either
## way — which is the honest starting position for a behaviour the clan has never
## had the option to perform.
func grow_outputs(new_out_size: int) -> bool:
	if new_out_size < out_size:
		return false
	if new_out_size == out_size:
		return true
	var grown_w := PackedFloat32Array()
	grown_w.resize(new_out_size * h2_size)
	var grown_b := PackedFloat32Array()
	grown_b.resize(new_out_size)
	for o in out_size:
		grown_b[o] = b2[o]
		for i in h2_size:
			grown_w[o * h2_size + i] = w2[o * h2_size + i]
	w2 = grown_w
	b2 = grown_b
	out_size = new_out_size
	_gw2.resize(w2.size()); _gw2.fill(0.0)
	_gb2.resize(b2.size()); _gb2.fill(0.0)
	_logits.resize(out_size)
	_probs.resize(out_size)
	_take_snapshot()
	return true


# --- Authoring ----------------------------------------------------------------

## Set the output bias for one drive directly. This is the designer's lever: the
## biases are the only interpretable parameters in the network, so seeding them
## ("this clan is timid") cannot make the network internally strange the way
## hand-writing a weight matrix would.
func set_output_bias(index: int, value: float) -> void:
	if index >= 0 and index < out_size:
		b2[index] = clampf(value, -WEIGHT_LIMIT, WEIGHT_LIMIT)


func output_bias(index: int) -> float:
	return b2[index] if index >= 0 and index < out_size else 0.0


## Mean absolute difference from another net, per parameter. The drift chart's
## y-axis, and how the generation test measures that inheritance moved something.
func mean_abs_difference(other: CultureNet) -> float:
	if not same_shape_as(other):
		return -1.0
	var mine := _flatten()
	var theirs := other._flatten()
	var total: float = 0.0
	for i in mine.size():
		total += absf(mine[i] - theirs[i])
	return total / float(maxi(1, mine.size()))


## Per-layer L2 norms, for the drift chart's three lines.
func layer_norms() -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(3)
	var layers := [w0, w1, w2]
	for l in 3:
		var sq: float = 0.0
		for v in layers[l]:
			sq += v * v
		out[l] = sqrt(sq)
	return out


func debug_summary() -> String:
	return "%d-%d-%d-%d (%d params) · %d applies · %d clamps · %d rollbacks" % [
		in_size, h1_size, h2_size, out_size, parameter_count(),
		applies, clamp_events, rollbacks,
	]
