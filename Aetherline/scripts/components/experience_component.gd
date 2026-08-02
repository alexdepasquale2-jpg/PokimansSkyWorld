extends CreatureComponent
class_name ExperienceComponent

## What has happened to this creature, and how much of it.
##
## This is the substrate the whole emergent layer stands on. Archetypes
## crystallize by reading it; the StoryDirector narrates from it. Without a
## per-creature record, "the one who kept getting between the herd and the
## dark" is not a thing the game can know — only a thing the player noticed.
##
## THREE KINDS OF MEMORY, deliberately separate:
##   counters  — cumulative totals ("protected an ally 41 times")
##   extremes  — the worst/most it ever endured ("survived -60C")
##   episodes  — a bounded recent log, for detecting bursts and streaks
##
## Counters and extremes are cheap and permanent. Episodes are capped, because
## a creature that lives three hundred days must not carry three hundred days
## of detail — but the counters it feeds never forget.

## Recent episodes retained. Enough to spot "three maulings this week"; far
## short of a diary.
const EPISODE_CAP: int = 120

## metric -> cumulative total.
@export var counters: Dictionary = {}

## metric -> most extreme value recorded. Stored under their own key names
## (e.g. "coldest_endured"), so authors must not collide them with counters.
@export var extremes: Dictionary = {}

## metric -> tick of first occurrence. Lets the story layer say "for the first
## time in its life" and mean it.
@export var first_seen: Dictionary = {}

## Bounded recent log: { "tick": int, "kind": String, "amount": float,
##                       "payload": Dictionary }
@export var episodes: Array = []


# --- Recording ----------------------------------------------------------------

## Record something happening. Named `log_event` because `log` is a built-in.
## Everything of consequence a creature does should pass through here — this is
## the single funnel into both the archetype system and the story layer.
func log_event(kind: String, amount: float = 1.0, payload: Dictionary = {}) -> void:
	var tick := SimulationBudget.current_tick
	counters[kind] = float(counters.get(kind, 0.0)) + amount
	if not first_seen.has(kind):
		first_seen[kind] = tick

	episodes.append({"tick": tick, "kind": kind, "amount": amount,
		"payload": payload.duplicate()})
	if episodes.size() > EPISODE_CAP:
		episodes = episodes.slice(episodes.size() - EPISODE_CAP)

	var uid: StringName = creature.identity.uid if creature != null else &""
	EventBus.experience_logged.emit(uid, kind, amount, payload)


## Record a high-water mark. Only keeps the value if it beats what is there,
## which is what makes "the coldest night it ever survived" a stable fact
## rather than the most recent one.
func record_extreme(kind: String, value: float) -> void:
	if not extremes.has(kind) or value > float(extremes[kind]):
		extremes[kind] = value
		if not first_seen.has(kind):
			first_seen[kind] = SimulationBudget.current_tick


## Convenience for extremes measured downward (lowest temperature, lowest
## health survived). Stored as magnitude so conditions stay ">=" comparisons.
func record_extreme_low(kind: String, value: float) -> void:
	record_extreme(kind, -value)


# --- Queries ------------------------------------------------------------------

func count(kind: String) -> float:
	return float(counters.get(kind, 0.0))


func extreme(kind: String) -> float:
	return float(extremes.get(kind, 0.0))


func has_ever(kind: String) -> bool:
	return counters.has(kind) or extremes.has(kind)


func when_first(kind: String) -> int:
	return int(first_seen.get(kind, -1))


func recent(kind: String = "", within_ticks: int = 0) -> Array:
	var cutoff := SimulationBudget.current_tick - within_ticks
	return episodes.filter(func(e):
		if kind != "" and String(e["kind"]) != kind:
			return false
		if within_ticks > 0 and int(e["tick"]) < cutoff:
			return false
		return true)


## Total of a metric within a recent window — the "three maulings this week"
## query the story layer leans on.
func recent_total(kind: String, within_ticks: int) -> float:
	var total := 0.0
	for episode in recent(kind, within_ticks):
		total += float(episode["amount"])
	return total


## The flat metric dictionary archetype conditions and story templates are
## tested against. Merges counters, extremes, and a few facts that live on
## other components so that conditions can be written uniformly.
func metrics() -> Dictionary:
	var out := counters.duplicate()
	for key in extremes:
		out[key] = extremes[key]
	if creature != null:
		out["age_days"] = creature.stats.age_days if creature.stats != null else 0.0
		out["generation"] = float(creature.identity.generation)
		out["epithet_count"] = float(creature.identity.epithets.size())
		var lineage := StoryDirector.get_lineage(creature.identity.lineage_id)
		if lineage != null:
			out["lineage_planets"] = float(lineage.planets_inhabited.size())
	return out


## The handful of things that most define this creature, for story text and
## the debug readout. Sorted by magnitude, so it reads as "what it is known for".
func defining_experiences(limit: int = 5) -> Array:
	var entries: Array = []
	for key in counters:
		entries.append({"kind": key, "amount": float(counters[key])})
	entries.sort_custom(func(a, b): return float(a["amount"]) > float(b["amount"]))
	return entries.slice(0, limit)


# --- Readout ------------------------------------------------------------------

func describe() -> Array[String]:
	if counters.is_empty() and extremes.is_empty():
		return ["  (nothing has happened to this creature yet)"]
	var lines: Array[String] = []
	var keys := counters.keys()
	keys.sort()
	for key in keys:
		lines.append("  %-30s %8.1f" % [key, counters[key]])
	if not extremes.is_empty():
		lines.append("  -- extremes --")
		var extreme_keys := extremes.keys()
		extreme_keys.sort()
		for key in extreme_keys:
			lines.append("  %-30s %8.2f" % [key, extremes[key]])
	return lines


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"counters": counters.duplicate(),
		"extremes": extremes.duplicate(),
		"first_seen": first_seen.duplicate(),
		"episodes": episodes.duplicate(true),
	}


func from_dict(d: Dictionary) -> void:
	counters = d.get("counters", {}).duplicate()
	extremes = d.get("extremes", {}).duplicate()
	first_seen = d.get("first_seen", {}).duplicate()
	episodes = d.get("episodes", []).duplicate(true)
