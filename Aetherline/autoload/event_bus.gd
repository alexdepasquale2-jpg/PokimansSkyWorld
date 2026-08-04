extends Node
## EventBus — the single global signal hub.
##
## WHY: Aetherline's systems are deliberately decoupled. The climate system must
## be able to say "this creature was exposed to hard cold" without knowing that
## the epigenetics system, the story director, the archetype tracker and three
## UI panels all care. Everything of narrative or cross-system consequence goes
## through here.
##
## RULES
##  1. Signals carry plain data (ids, dicts, numbers) or node references — never
##     ownership. A listener must never assume it can keep a reference alive.
##  2. Every signal that the StoryDirector should be able to narrate must carry
##     enough context to write a sentence: who, where, when, how much.
##  3. Do NOT emit high-frequency per-frame chatter here. Per-frame work belongs
##     inside components. This bus is for events, not updates.
##
## Naming convention: <subject>_<past_tense_verb>.

# --- Lifecycle ---------------------------------------------------------------

## A creature entity finished spawning and is fully initialised.
signal creature_spawned(uid: StringName, creature: Node)
## A creature was removed from the active scene (death, jump, archival).
signal creature_despawned(uid: StringName, reason: String)
signal creature_born(child_uid: StringName, parent_a_uid: StringName, parent_b_uid: StringName)
signal creature_died(uid: StringName, cause: String, tick: int)
## Emitted when a creature is captured or recruited into the player's colony.
signal creature_joined_colony(uid: StringName, origin_kind: String)


# --- Genetics & epigenetics ---------------------------------------------------

## A point mutation landed. `locus_id` changed from `old_allele` to `new_allele`.
signal mutation_occurred(uid: StringName, locus_id: StringName, old_allele: StringName, new_allele: StringName)
## A new epigenetic mark was acquired (not merely reinforced).
signal epigenetic_mark_gained(uid: StringName, definition_id: StringName, source: int)
## An existing mark was reinforced; `strength` is the new value.
signal epigenetic_mark_reinforced(uid: StringName, definition_id: StringName, strength: float)
## A mark faded away entirely.
signal epigenetic_mark_lost(uid: StringName, definition_id: StringName)
## A mark crossed into a child at conception — the moment a habit becomes heredity.
signal epigenetic_mark_inherited(child_uid: StringName, definition_id: StringName, depth: int)
## Breeding produced offspring (or failed — `child_uid` empty, `note` explains).
signal breeding_resolved(parent_a_uid: StringName, parent_b_uid: StringName, child_uid: StringName, note: String)


# --- Archetypes ---------------------------------------------------------------

signal archetype_progress_changed(uid: StringName, archetype_id: StringName, progress: float)
signal archetype_stage_changed(uid: StringName, archetype_id: StringName, stage: int)
signal archetype_crystallized(uid: StringName, archetype_id: StringName, tick: int)
signal archetype_shattered(uid: StringName, archetype_id: StringName, tick: int)


# --- Experience & drama hooks -------------------------------------------------

## The universal "something happened to this creature" firehose that the
## ArchetypeComponent and StoryDirector both read.
## `kind` is an ExperienceLog metric key; `payload` carries context.
signal experience_logged(uid: StringName, kind: String, amount: float, payload: Dictionary)

## StoryDirector output. `event` is a fully-formed narrative event dict.
signal story_event_fired(event: Dictionary)
## Something the player should be told about, ranked by `severity` 0..1.
signal notification_raised(text: String, severity: float, uid: StringName)


# --- Culture -------------------------------------------------------------------
#
# All three are event-shaped and rate-limited at the emitter. RULE 3 above is the
# reason the learning update itself emits NOTHING: gradients are applied several
# times a second at population scale, and a bus carrying that would be a bus
# nobody could read. What crosses here is only "the clan changed its mind",
# which is a thing worth narrating.

## A drive's clan-wide strength moved materially. Throttled: at most once per
## CultureRewardRouter.SHIFT_INTERVAL applies, and only past a real threshold.
signal culture_shifted(culture_id: String, drive_id: String, delta: float)
## A generation consolidated. `retained` is the measured correlation between the
## clan's policy before and after — how much of the old people survived.
signal culture_generation_advanced(culture_id: String, generation: int, retained: float)
## A clan split off from another and took a copy of its culture with it.
signal culture_forked(parent_culture_id: String, child_culture_id: String, reason: String)


# --- The neuronal tree ---------------------------------------------------------
#
# Discrete, chosen inheritance, as against the culture signals above which report
# learning nobody decided on. All four are events a player acts on or grieves
# over, so all four belong on the bus.

## A neuron was reinforced. Provisional until a generation turns over.
signal neuron_reinforced(clan_id: String, neuron_id: String)
## A generation carried these into the lineage permanently.
signal neurons_locked(clan_id: String, neuron_ids: Array)
## And could not carry these. The clan had worked them out and lost them.
signal neurons_lost(clan_id: String, neuron_ids: Array)
## The clan crossed the gap.
signal evolution_leap(clan_id: String, leap: int, locked_neurons: int)


# --- World & travel -----------------------------------------------------------

signal planet_generated(planet_id: String, seed: int)
signal planet_landed(planet_id: String)
signal planet_departed(planet_id: String, left_behind_uids: Array)
signal planet_chunk_loaded(planet_id: String, chunk_coord: Vector2i)
signal planet_chunk_unloaded(planet_id: String, chunk_coord: Vector2i)
## Ambient environmental pressure tick — the hook the epigenetics system uses.
signal environment_pressure_applied(planet_id: String, pressures: Dictionary, days: float)


# --- Colony, combat, work -----------------------------------------------------

signal combat_started(participants: Array)
signal combat_ended(winner_uids: Array, loser_uids: Array)
signal creature_damaged(uid: StringName, amount: float, source_uid: StringName)
signal creature_protected_ally(protector_uid: StringName, protected_uid: StringName)
signal work_completed(uid: StringName, work_kind: String, amount: float)
signal need_critical(uid: StringName, need_key: String, value: float)


# --- Meta ---------------------------------------------------------------------

signal game_tick(tick: int)
signal day_passed(day: int)
signal save_started(slot: String)
signal save_completed(slot: String, success: bool, note: String)
signal load_completed(slot: String, success: bool, note: String)
## Emitted by SimulationBudget when a creature changes LOD band.
signal sim_lod_changed(uid: StringName, lod: int)


# --- Debug tap ---------------------------------------------------------------

## When true, every emission routed through `emit_debug` is printed. Individual
## signals are still direct-emitted for speed; this is an opt-in trace channel
## used by test scenes.
var trace_enabled: bool = false
var _trace: Array[String] = []
const TRACE_CAP: int = 500


## Helper for systems that want their emission recorded in the debug trace.
## Usage: EventBus.trace("mutation", {...}) alongside the real signal emit.
func trace(label: String, payload: Dictionary = {}) -> void:
	if not trace_enabled:
		return
	_trace.append("[%d] %s %s" % [Time.get_ticks_msec(), label, str(payload)])
	if _trace.size() > TRACE_CAP:
		_trace = _trace.slice(_trace.size() - TRACE_CAP)
	print("EventBus/", label, " ", payload)


func get_trace() -> Array[String]:
	return _trace.duplicate()


func clear_trace() -> void:
	_trace.clear()
