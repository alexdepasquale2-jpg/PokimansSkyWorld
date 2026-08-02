extends Node
## StoryDirector — the emergent drama engine.
##
## It does not author plots. It watches the simulation, remembers what mattered,
## and fires events that *reference the actual creatures involved by name and by
## history*. Pillar 2 of the project lives or dies here.
##
## MEMORY MODEL (two tiers, deliberately)
##  - Short-term: a bounded ring of everything recent. Cheap, noisy, used to
##    detect patterns ("this creature has been mauled three times this week").
##  - Long-term: a curated, weighted set of moments that defined a creature, a
##    lineage or a world. Survives compaction, feeds callbacks years later
##    ("the world where Vess lost her sight").
##
## Phase 0 wires the memory, the observation intake and the firing interface.
## Phase 2 adds real archetype-aware event templates; Phase 5 adds the full
## generator that reads planetary conditions and player behaviour.

const SHORT_TERM_CAP: int = 400
const LONG_TERM_CAP: int = 2000

## Minimum weight for a short-term observation to be promoted to long-term.
const PROMOTION_THRESHOLD: float = 0.6

## Recent observations. Each: { tick, kind, uid, amount, payload, weight }
var short_term: Array = []

## Curated history. Same shape plus "text" once narrated.
var long_term: Array = []

## uid -> aggregate counters the director uses to spot patterns without
## rescanning memory: { "combat_wins": 12.0, "protect_ally": 3.0, ... }
var creature_tallies: Dictionary = {}

## Lineage records, keyed by lineage_id. The director owns these because they
## are narrative memory, not simulation state.
var lineages: Dictionary = {}

## Fired events awaiting player acknowledgement, newest last.
var pending_events: Array = []

## Global suppression window so the player is not buried: kind -> last tick fired.
var _last_fired: Dictionary = {}
@export var min_ticks_between_same_kind: int = 600

## Data-driven event templates, id -> template dictionary. Loaded from
## res://data/events/. Kept as plain dictionaries rather than a Resource class
## because the shape is still moving and JSON round-trips it for free.
var templates: Dictionary = {}

## uid -> Array[template_id] already fired, for `once_per_creature` templates.
## This is what stops the game announcing the same milestone about the same
## animal every time it is re-evaluated.
var _fired_for_creature: Dictionary = {}

var enabled: bool = true

const EVENTS_DIR := "res://data/events/"


func _ready() -> void:
	_load_templates()
	# The director listens rather than being called. Any system that emits on
	# the bus automatically feeds the story layer, which is what keeps drama
	# emergent instead of scripted.
	EventBus.experience_logged.connect(_on_experience_logged)
	EventBus.creature_died.connect(_on_creature_died)
	EventBus.archetype_crystallized.connect(_on_archetype_crystallized)
	EventBus.archetype_shattered.connect(_on_archetype_shattered)
	EventBus.mutation_occurred.connect(_on_mutation)
	EventBus.epigenetic_mark_inherited.connect(_on_mark_inherited)


# --- Template loading ---------------------------------------------------------

func _load_templates() -> void:
	templates.clear()
	var dir := DirAccess.open(EVENTS_DIR)
	if dir == null:
		return
	var files := dir.get_files()
	files.sort()
	for file_name in files:
		if not file_name.ends_with(".json"):
			continue
		var parsed: Variant = JSON.parse_string(
			FileAccess.get_file_as_string(EVENTS_DIR + file_name))
		if typeof(parsed) != TYPE_ARRAY:
			push_warning("StoryDirector: %s is not a JSON array" % file_name)
			continue
		for entry in parsed:
			if typeof(entry) == TYPE_DICTIONARY and entry.has("id"):
				templates[String(entry["id"])] = entry


# --- Evaluation ---------------------------------------------------------------

## Test every template against one creature and fire whatever matches.
## Returns the events fired. This is the entry point the simulation calls on a
## slow cadence — it reads state, it does not need to be told what happened.
func evaluate_creature(creature: Node) -> Array:
	if not enabled or creature == null or creature.experience == null:
		return []
	var fired: Array = []
	var metrics: Dictionary = creature.experience.metrics()
	var uid := String(creature.identity.uid)

	for template_id in templates:
		var template: Dictionary = templates[template_id]
		if (template.get("tags", []) as Array).has("colony"):
			continue  # colony-scope templates only fire via evaluate_colony
		if bool(template.get("once_per_creature", true)) \
				and _already_fired(uid, template_id):
			continue
		if not _template_matches(template, creature, metrics):
			continue
		var event := fire_event(template, _context_for(creature, metrics), creature)
		if not event.is_empty():
			_mark_fired(uid, template_id)
			fired.append(event)
	return fired


func _template_matches(template: Dictionary, creature: Node, metrics: Dictionary) -> bool:
	# Archetype gates: "only say this about a crystallized Guardian".
	if template.has("requires_archetype"):
		var wanted := String(template["requires_archetype"])
		var stage := String(template.get("requires_stage", "CRYSTALLIZED"))
		var actual := AetherTypes.enum_to_key(
			AetherTypes.ArchetypeStage, creature.archetype.state.stage_of(wanted))
		if stage == "CRYSTALLIZED" and actual != "CRYSTALLIZED":
			return false
		if stage == "EMERGENT" and not (actual == "EMERGENT" or actual == "CRYSTALLIZED"):
			return false
	if template.has("requires_trait"):
		if creature.stats.trait_value(String(template["requires_trait"])) \
				< float(template.get("min_trait_value", 0.5)):
			return false
	if template.has("requires_mark"):
		if creature.epigenetics.profile.find_by_definition(
				StringName(template["requires_mark"])) == null:
			return false
	# Every listed condition must hold — story templates are all-or-nothing,
	# unlike archetypes, which accumulate.
	return ConditionEval.all_met(template.get("conditions", []), metrics)


func _already_fired(uid: String, template_id: String) -> bool:
	return (_fired_for_creature.get(uid, []) as Array).has(template_id)


func _mark_fired(uid: String, template_id: String) -> void:
	if not _fired_for_creature.has(uid):
		_fired_for_creature[uid] = []
	_fired_for_creature[uid].append(template_id)


## Placeholder values available to every template's text.
## Raw metrics are exposed under an `m.` prefix (`{m.protect_ally}`) so that a
## template can quote a real number without colliding with the named fields.
func _context_for(creature: Node, metrics: Dictionary = {}) -> Dictionary:
	var lineage := get_lineage(creature.identity.lineage_id)
	var archetype_name := "no particular calling"
	for archetype_id in creature.archetype.state.active_archetypes():
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		if definition != null:
			archetype_name = definition.display_name
			break
	var context := {
		"name": creature.display_name(),
		"plain_name": creature.identity.given_name,
		"planet": PlanetManager.active_planet_id,
		"birth_planet": creature.identity.birth_planet_name if not
			creature.identity.birth_planet_name.is_empty() else "wherever it came from",
		"lineage": lineage.display_name if lineage != null else String(creature.identity.lineage_id),
		"generation": creature.identity.generation,
		"archetype": archetype_name,
		"age_days": int(creature.stats.age_days),
	}
	for key in metrics:
		var value := float(metrics[key])
		# Whole numbers must print as "41", not "41.0" — story text with a
		# stray decimal point reads as a spreadsheet, not a chronicle.
		context["m." + String(key)] = int(value) if is_equal_approx(value, roundf(value)) \
			else "%.1f" % value
	return context


## Colony-wide beats — population, mood, research, the planet itself — rather
## than one creature's history. Reuses the same template files (anything
## tagged "colony") and the same suppression machinery, keyed by a synthetic
## per-planet id so a colony milestone fires once per world, not once per
## creature living on it.
func evaluate_colony(metrics: Dictionary, context: Dictionary = {}) -> Array:
	if not enabled:
		return []
	var fired: Array = []
	var colony_key := "colony:" + PlanetManager.active_planet_id
	for template_id in templates:
		var template: Dictionary = templates[template_id]
		if not (template.get("tags", []) as Array).has("colony"):
			continue
		if _already_fired(colony_key, template_id):
			continue
		if not ConditionEval.all_met(template.get("conditions", []), metrics):
			continue
		var filled := context.duplicate()
		for key in metrics:
			var value := float(metrics[key])
			filled["m." + String(key)] = int(value) if is_equal_approx(value, roundf(value)) \
				else "%.1f" % value
		var event := fire_event(template, filled)
		if not event.is_empty():
			_mark_fired(colony_key, template_id)
			fired.append(event)
	return fired


# --- Narration ----------------------------------------------------------------

## A one-line account of what this creature is known for, built from its own
## record rather than from a template. Used in event text and the debug readout.
##
## This is the smallest possible version of the thing the whole project is for:
## the game being able to say something true and specific about an animal the
## player has grown attached to.
func narrate_history(creature: Node) -> String:
	if creature == null or creature.experience == null:
		return ""
	var parts: Array[String] = []

	# Walk well past three and keep the first three that have English. Ranking
	# is by raw magnitude, so an untranslatable counter like distance_travelled
	# (60000) outranks a meaningful one like protect_ally (30) and would
	# otherwise silently eat a slot, leaving a one-clause history.
	for entry in creature.experience.defining_experiences(12):
		if parts.size() >= 3:
			break
		var phrase := _phrase_for(String(entry["kind"]), float(entry["amount"]))
		if not phrase.is_empty():
			parts.append(phrase)

	var marks: Array = creature.epigenetics.profile.marks
	if not marks.is_empty():
		var deepest: EpigeneticMarkResource = marks[0]
		for mark in marks:
			if mark.strength > deepest.strength:
				deepest = mark
		parts.append("carries the mark of %s" % deepest.display_name.to_lower())

	if parts.is_empty():
		return "%s has no history worth the telling yet." % creature.display_name()
	return "%s: %s." % [creature.display_name(), ", ".join(parts)]


## Turns a raw metric into English. Unmapped metrics are skipped rather than
## printed raw — "protect_ally 41" in a story beat would break the spell.
func _phrase_for(kind: String, amount: float) -> String:
	var count := int(amount)
	match kind:
		"protect_ally": return "%d times between the herd and the dark" % count
		"damage_absorbed_for_ally": return "%d wounds taken for others" % count
		"kill": return "%d kills" % count
		"combat_win": return "%d fights won" % count
		"combat_loss": return "%d fights lost" % count
		"near_death_survived": return "%d brushes with death" % count
		"offspring_sired": return "%d young" % count
		"offspring_survived": return "%d young that lived" % count
		"planets_visited": return "%d worlds walked" % count
		"creature_calmed": return "%d frightened animals settled" % count
		"track_success": return "%d trails followed to their end" % count
		"trauma_events": return "%d things it will not forget" % count
		"days_starving": return "%d days without food" % count
		"anomaly_investigated": return "%d strange things approached rather than avoided" % count
		_: return ""


# --- Observation --------------------------------------------------------------

## Record something that happened. `weight` is the director's own estimate of
## narrative significance, 0..1; anything above PROMOTION_THRESHOLD is kept
## forever.
func observe(kind: String, uid: StringName, amount: float = 1.0,
		payload: Dictionary = {}, weight: float = 0.1) -> void:
	if not enabled:
		return
	var entry := {
		"tick": SimulationBudget.current_tick,
		"kind": kind,
		"uid": String(uid),
		"amount": amount,
		"payload": payload.duplicate(),
		"weight": weight,
	}
	short_term.append(entry)
	if short_term.size() > SHORT_TERM_CAP:
		short_term = short_term.slice(short_term.size() - SHORT_TERM_CAP)

	var key := String(uid)
	if not creature_tallies.has(key):
		creature_tallies[key] = {}
	creature_tallies[key][kind] = float(creature_tallies[key].get(kind, 0.0)) + amount

	if weight >= PROMOTION_THRESHOLD:
		_promote(entry)


func _promote(entry: Dictionary) -> void:
	long_term.append(entry.duplicate(true))
	if long_term.size() > LONG_TERM_CAP:
		# Drop the least significant, not the oldest: age is not the same thing
		# as irrelevance, and old founding moments must outlive recent noise.
		long_term.sort_custom(func(a, b): return float(a["weight"]) > float(b["weight"]))
		long_term = long_term.slice(0, LONG_TERM_CAP)
		long_term.sort_custom(func(a, b): return int(a["tick"]) < int(b["tick"]))


# --- Queries the event templates read ----------------------------------------

func tally(uid: StringName, kind: String) -> float:
	return float(creature_tallies.get(String(uid), {}).get(kind, 0.0))


func tallies_for(uid: StringName) -> Dictionary:
	return creature_tallies.get(String(uid), {}).duplicate()


## Recent entries, optionally filtered. Used to spot bursts and streaks.
func recent(kind: String = "", uid: StringName = &"", within_ticks: int = 0) -> Array:
	var cutoff := SimulationBudget.current_tick - within_ticks
	return short_term.filter(func(e):
		if kind != "" and e["kind"] != kind:
			return false
		if String(uid) != "" and e["uid"] != String(uid):
			return false
		if within_ticks > 0 and int(e["tick"]) < cutoff:
			return false
		return true)


## Everything the director has permanently remembered about one creature —
## the raw material for "you have been through a lot together" moments.
func history_of(uid: StringName) -> Array:
	return long_term.filter(func(e): return e["uid"] == String(uid))


# --- Lineage memory -----------------------------------------------------------

func get_lineage(lineage_id) -> LineageRecordResource:
	return lineages.get(String(lineage_id))


func ensure_lineage(lineage_id, display_name: String = "") -> LineageRecordResource:
	var key := String(lineage_id)
	if lineages.has(key):
		return lineages[key]
	var rec := LineageRecordResource.new()
	rec.lineage_id = StringName(key)
	rec.display_name = display_name if not display_name.is_empty() else key
	rec.founding_tick = SimulationBudget.current_tick
	rec.founding_planet_id = PlanetManager.active_planet_id
	lineages[key] = rec
	return rec


# --- Firing -------------------------------------------------------------------

## Build and fire a narrative event. `template` is a dict:
##   { "kind": String, "severity": float, "text": String, "uid": StringName,
##     "tags": Array }
## Text may contain {name}, {planet}, {lineage} placeholders, filled from
## `context`. Returns false if suppressed by the cooldown.
## Returns the fired event, or {} if it was suppressed by cooldown.
func fire_event(template: Dictionary, context: Dictionary = {},
		creature: Node = null) -> Dictionary:
	if not enabled:
		return {}
	var kind := String(template.get("kind", template.get("id", "generic")))
	var now := SimulationBudget.current_tick
	# Per-template cooldown, falling back to the global floor. A once-in-a-
	# lifetime beat and a routine one should not share a suppression window.
	var cooldown := int(template.get("cooldown_ticks", min_ticks_between_same_kind))
	if int(_last_fired.get(kind, -999999)) + cooldown > now:
		return {}
	_last_fired[kind] = now

	var filled_context := context.duplicate()
	if creature != null and not filled_context.has("history"):
		filled_context["history"] = narrate_history(creature)

	var event := template.duplicate(true)
	event["tick"] = now
	event["planet_id"] = PlanetManager.active_planet_id
	# Templates describe a situation, not a subject — the subject is whoever
	# the template was evaluated against. Without stamping it here the event
	# lands in memory attributed to nobody, and `history_of` never finds it.
	if creature != null and not event.has("uid"):
		event["uid"] = String(creature.identity.uid)
	event["text"] = _fill(String(template.get("text", "")), filled_context)

	pending_events.append(event)
	EventBus.story_event_fired.emit(event)
	EventBus.notification_raised.emit(
		String(event["text"]), float(event.get("severity", 0.3)),
		StringName(event.get("uid", "")))

	_promote({
		"tick": now, "kind": kind, "uid": String(event.get("uid", "")),
		"amount": 1.0, "payload": filled_context.duplicate(),
		"weight": maxf(PROMOTION_THRESHOLD, float(event.get("severity", 0.5))),
	})
	return event


func _fill(text: String, context: Dictionary) -> String:
	var out := text
	for key in context:
		out = out.replace("{%s}" % key, str(context[key]))
	return out


func take_pending_events() -> Array:
	var out := pending_events.duplicate(true)
	pending_events.clear()
	return out


# --- Bus listeners ------------------------------------------------------------
# Weights here are first-pass estimates; Phase 2 tunes them against real play.

func _on_experience_logged(uid: StringName, kind: String, amount: float, payload: Dictionary) -> void:
	observe(kind, uid, amount, payload, 0.1)


func _on_creature_died(uid: StringName, cause: String, tick: int) -> void:
	observe("death", uid, 1.0, {"cause": cause, "tick": tick}, 0.9)


func _on_archetype_crystallized(uid: StringName, archetype_id: StringName, tick: int) -> void:
	observe("archetype_crystallized", uid, 1.0, {"archetype": String(archetype_id)}, 0.95)


func _on_archetype_shattered(uid: StringName, archetype_id: StringName, tick: int) -> void:
	observe("archetype_shattered", uid, 1.0, {"archetype": String(archetype_id)}, 1.0)


func _on_mutation(uid: StringName, locus_id: StringName, old_allele: StringName, new_allele: StringName) -> void:
	observe("mutation", uid, 1.0,
		{"locus": String(locus_id), "from": String(old_allele), "to": String(new_allele)}, 0.4)


func _on_mark_inherited(child_uid: StringName, definition_id: StringName, depth: int) -> void:
	# Depth is the payoff signal: a mark that has survived several generations
	# has stopped being an accident and become a family trait.
	observe("mark_inherited", child_uid, 1.0,
		{"mark": String(definition_id), "depth": depth},
		0.3 if depth < 3 else 0.8)


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	var lin := {}
	for id in lineages:
		lin[id] = (lineages[id] as LineageRecordResource).to_dict()
	return {
		# Short-term memory is intentionally NOT saved: it is noise that exists
		# to detect bursts within a session, and reloading it would resurrect
		# stale patterns. Long-term memory is the part that must persist.
		"long_term": long_term.duplicate(true),
		"creature_tallies": creature_tallies.duplicate(true),
		"lineages": lin,
		"last_fired": _last_fired.duplicate(true),
		# Must persist: without it, loading a save would re-announce every
		# milestone the player has already been told about.
		"fired_for_creature": _fired_for_creature.duplicate(true),
	}


func from_dict(d: Dictionary) -> void:
	short_term.clear()
	pending_events.clear()
	long_term = d.get("long_term", []).duplicate(true)
	creature_tallies = d.get("creature_tallies", {}).duplicate(true)
	_last_fired = d.get("last_fired", {}).duplicate(true)
	_fired_for_creature = d.get("fired_for_creature", {}).duplicate(true)
	lineages.clear()
	for id in d.get("lineages", {}):
		lineages[String(id)] = LineageRecordResource.from_dict(d["lineages"][id])


func debug_summary() -> String:
	return "StoryDirector: %d templates, %d short-term, %d long-term, %d tracked, %d lineages" % [
		templates.size(), short_term.size(), long_term.size(),
		creature_tallies.size(), lineages.size(),
	]
