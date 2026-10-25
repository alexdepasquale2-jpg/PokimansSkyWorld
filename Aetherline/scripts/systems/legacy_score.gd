extends RefCounted
class_name LegacyScore

## The closest thing Aetherline has to a score, for a game with no endgame.
##
## Deliberately NOT a power rating. It measures how much history a bloodline
## has accumulated — depth, reach, survival, drama — so that the "right" way to
## play is whatever produces a line worth telling stories about, not whatever
## produces the strongest animal.

const WEIGHTS := {
	"generations": 12.0,      ## Depth of the line.
	"members": 1.5,           ## Everyone ever born into it.
	"survivors": 3.0,         ## Still alive right now.
	"planets": 20.0,          ## Worlds the line has lived on.
	"archetypes": 40.0,       ## Crystallized identities produced.
	"entrenched_marks": 25.0, ## Epigenetic traits that became heritable.
	"events": 2.0,            ## Notable moments recorded.
}


static func for_lineage(record: LineageRecordResource) -> float:
	if record == null:
		return 0.0
	var archetype_count := 0.0
	for id in record.archetype_history:
		archetype_count += float(record.archetype_history[id])

	# Entrenched marks count by DEPTH, not by kind: a mark that has survived
	# five generations is worth far more than five separate one-generation
	# accidents, because it is the thing the player actually engineered.
	var entrenched_depth := 0.0
	for id in record.entrenched_marks:
		entrenched_depth += float(record.entrenched_marks[id])

	var score := 0.0
	score += WEIGHTS["generations"] * float(record.max_generation)
	score += WEIGHTS["members"] * float(record.member_uids.size())
	score += WEIGHTS["survivors"] * float(record.living_uids.size())
	score += WEIGHTS["planets"] * float(record.planets_inhabited.size())
	score += WEIGHTS["archetypes"] * archetype_count
	score += WEIGHTS["entrenched_marks"] * entrenched_depth
	score += WEIGHTS["events"] * float(record.notable_events.size())

	# An extinct line keeps most of its score — it happened, and the universe
	# remembers — but a living line is worth more.
	if record.is_extinct():
		score *= 0.75
	return score


## Recompute and cache onto every known lineage. Returns the campaign total.
static func recompute_all() -> float:
	var total := 0.0
	for id in StoryDirector.lineages:
		var record: LineageRecordResource = StoryDirector.lineages[id]
		record.legacy_score = for_lineage(record)
		total += record.legacy_score
	return total


## Lineages ranked by score, best first.
static func ranked() -> Array:
	var records: Array = StoryDirector.lineages.values()
	records.sort_custom(func(a, b): return a.legacy_score > b.legacy_score)
	return records


## Plain-language explanation of where a line's score came from — a bare
## number tells the player nothing about what they did well.
static func breakdown(record: LineageRecordResource) -> Array[String]:
	if record == null:
		return []
	var archetype_count := 0.0
	for id in record.archetype_history:
		archetype_count += float(record.archetype_history[id])
	var entrenched_depth := 0.0
	for id in record.entrenched_marks:
		entrenched_depth += float(record.entrenched_marks[id])

	var rows := [
		["generations deep", float(record.max_generation), WEIGHTS["generations"]],
		["ever born", float(record.member_uids.size()), WEIGHTS["members"]],
		["still living", float(record.living_uids.size()), WEIGHTS["survivors"]],
		["worlds inhabited", float(record.planets_inhabited.size()), WEIGHTS["planets"]],
		["archetypes produced", archetype_count, WEIGHTS["archetypes"]],
		["inherited-mark depth", entrenched_depth, WEIGHTS["entrenched_marks"]],
		["notable events", float(record.notable_events.size()), WEIGHTS["events"]],
	]
	var lines: Array[String] = []
	for row in rows:
		if float(row[1]) <= 0.0:
			continue
		lines.append("  %-24s %6.0f  x%-5.1f = %7.0f" % [
			row[0], row[1], row[2], float(row[1]) * float(row[2])])
	if record.is_extinct():
		lines.append("  %-24s %28s" % ["extinct", "x0.75"])
	return lines
