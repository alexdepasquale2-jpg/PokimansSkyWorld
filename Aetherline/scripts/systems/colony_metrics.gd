extends RefCounted
class_name ColonyMetrics

## Flat metric snapshot for colony-scope story conditions and UI. Pure
## aggregation over whatever creatures/structures/research are handed to it —
## no ownership, no autoload, so tests can build one without a live colony.

static func build(creatures: Array, summary: PlanetSummaryResource,
		research: ResearchSystem, planet: PlanetSeedResource) -> Dictionary:
	var mood_total := 0.0
	var living := 0
	for entry in creatures:
		var c: Creature = entry
		if is_instance_valid(c) and c.needs != null:
			mood_total += c.needs.mood
			living += 1

	return {
		"population": float(living),
		"average_mood": mood_total / float(maxi(1, living)),
		"structure_count": float(summary.structures.size() if summary != null else 0),
		"research_unlocked_count": float(research.unlocked.size() if research != null else 0),
		"planet_habitability": planet.habitability if planet != null else 0.0,
	}
