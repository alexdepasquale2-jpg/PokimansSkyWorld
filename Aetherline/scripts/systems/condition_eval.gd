extends RefCounted
class_name ConditionEval

## Shared evaluator for the data-driven condition dictionaries used by both
## archetype crystallization and story event templates.
##
## One implementation, because the two systems ask the same question — "does
## this creature's history satisfy this rule?" — and letting them drift apart
## would mean an archetype and the event announcing it could disagree about
## whether it had happened.
##
## A condition is:
##   {
##     "metric":     "protect_ally",   # key into the metrics dictionary
##     "comparator": ">=",             # ">=", ">", "<=", "<", "==", "!="
##     "threshold":  25.0,
##     "weight":     1.0,              # share of aggregate progress
##     "required":   true,             # must be fully met to qualify
##   }


## How much of a single condition is satisfied, 0..1.
##
## ">=" and ">" give PARTIAL credit (value / threshold) so progress bars move
## smoothly and the UI can honestly show "63% Guardian". The others are
## pass/fail, because "63% of the way to having killed fewer than three things"
## is not a meaningful sentence.
static func fraction(condition: Dictionary, metrics: Dictionary) -> float:
	var value := float(metrics.get(String(condition.get("metric", "")), 0.0))
	var threshold := float(condition.get("threshold", 1.0))
	match String(condition.get("comparator", ">=")):
		">=", ">":
			if threshold <= 0.0:
				return 1.0
			return clampf(value / threshold, 0.0, 1.0)
		"<=":
			return 1.0 if value <= threshold else 0.0
		"<":
			return 1.0 if value < threshold else 0.0
		"==":
			return 1.0 if is_equal_approx(value, threshold) else 0.0
		"!=":
			return 1.0 if not is_equal_approx(value, threshold) else 0.0
		_:
			return 0.0


static func met(condition: Dictionary, metrics: Dictionary) -> bool:
	return fraction(condition, metrics) >= 1.0


## Weighted aggregate progress across a list of conditions, 0..1.
static func progress(conditions: Array, metrics: Dictionary) -> float:
	if conditions.is_empty():
		return 0.0
	var total_weight := 0.0
	var earned := 0.0
	for condition in conditions:
		var weight := float(condition.get("weight", 1.0))
		total_weight += weight
		earned += weight * fraction(condition, metrics)
	return 0.0 if total_weight <= 0.0 else clampf(earned / total_weight, 0.0, 1.0)


## True only if every condition flagged `required` is fully satisfied.
static func required_met(conditions: Array, metrics: Dictionary) -> bool:
	for condition in conditions:
		if bool(condition.get("required", false)) and not met(condition, metrics):
			return false
	return true


## True if EVERY condition is satisfied, required or not.
static func all_met(conditions: Array, metrics: Dictionary) -> bool:
	for condition in conditions:
		if not met(condition, metrics):
			return false
	return true


## The conditions still standing between a creature and qualifying, most
## incomplete first. Drives "what does it still need?" in the debug readout.
static func unmet(conditions: Array, metrics: Dictionary) -> Array:
	var remaining: Array = []
	for condition in conditions:
		var done := fraction(condition, metrics)
		if done < 1.0:
			remaining.append({
				"metric": String(condition.get("metric", "")),
				"have": float(metrics.get(String(condition.get("metric", "")), 0.0)),
				"need": float(condition.get("threshold", 0.0)),
				"comparator": String(condition.get("comparator", ">=")),
				"fraction": done,
				"required": bool(condition.get("required", false)),
			})
	remaining.sort_custom(func(a, b): return float(a["fraction"]) < float(b["fraction"]))
	return remaining
