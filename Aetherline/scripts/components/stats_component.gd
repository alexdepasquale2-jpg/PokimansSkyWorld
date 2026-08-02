extends CreatureComponent
class_name StatsComponent

## The single read point for "what is this creature actually like right now".
##
## Owns the three-stage phenotype pipeline:
##     genetics.express_base()  ->  epigenetics.apply_to()  ->  archetype.apply_to()
## and derives gameplay stats from the result. Every other system asks Stats,
## never Genetics directly — otherwise half the codebase would silently be
## reading the un-lived, un-earned version of the animal.
##
## The intermediate stages are kept queryable (`base_traits`, `lived_traits`)
## because the debug readout has to be able to show a player *why*: this much
## is bred, this much is lived, this much is earned.

## Live vitals — these are state, not derived, so they serialize.
## Absolute hit points, not a fraction. 0.0 means "not yet initialized" —
## max_hp depends on the genome, which does not exist when the component is
## constructed, so vitals are filled in by initialize_vitals() once the
## creature is fully assembled. Do not default this to a positive number or
## newborns silently spawn on 1 hp.
@export var hp: float = 0.0
@export var age_days: float = 0.0

var _phenotype: Dictionary = {}
var _derived: Dictionary = {}
var _dirty: bool = true


func mark_dirty() -> void:
	_dirty = true


# --- Phenotype pipeline -------------------------------------------------------

## Fully resolved traits: bred, then lived, then earned.
func phenotype() -> Dictionary:
	if not _dirty:
		return _phenotype
	_resolve()
	return _phenotype


## Stage 1 only — what the DNA says, ignoring the creature's history.
func base_traits() -> Dictionary:
	return creature.genetics.express_base() if creature != null else {}


## Stages 1+2 — DNA plus epigenetics, before archetype.
func lived_traits() -> Dictionary:
	if creature == null:
		return {}
	var traits: Dictionary = creature.genetics.express_base()
	if creature.epigenetics != null:
		traits = creature.epigenetics.apply_to(traits)
	return traits


func _resolve() -> void:
	if creature == null:
		_phenotype = {}
		_derived = {}
		_dirty = false
		return

	var traits := lived_traits()
	if creature.archetype != null:
		traits = creature.archetype.apply_to(traits)
	_phenotype = traits
	_derived = _derive(traits)
	_dirty = false


func trait_value(key) -> float:
	return float(phenotype().get(String(key), 0.0))


# --- Derived gameplay stats ---------------------------------------------------

## FIRST-PASS TUNING. These formulas exist so the rest of the stack has real
## numbers to consume; balancing happens in Phase 4 (combat) and Phase 6. The
## shape matters more than the constants right now: every stat must be traceable
## back to a gene the player can breed for.
func _derive(t: Dictionary) -> Dictionary:
	var mass := maxf(0.05, float(t.get("mass", 1.0)))
	var size := maxf(0.05, float(t.get("size", 1.0)))
	var armor := float(t.get("armor", 0.0))
	var agility := float(t.get("agility", 1.0))
	var aggression := float(t.get("aggression", 0.5))

	return {
		"max_hp": 20.0 + mass * 30.0 + armor * 20.0,
		"move_speed": 60.0 * clampf(0.5 + agility * 0.5, 0.2, 3.0) / (1.0 + mass * 0.15),
		"attack_power": 4.0 + mass * 6.0 + aggression * 5.0,
		"defense": maxf(0.0, armor * 10.0),
		"carry_capacity": mass * 25.0 * maxf(0.1, float(t.get("haul", 1.0))),
		"work_rate": maxf(0.05, float(t.get("haul", 1.0))),
		"craft_rate": maxf(0.05, float(t.get("craft", 1.0))),
		"max_age_days": 300.0 * maxf(0.1, float(t.get("lifespan", 1.0))),
		"visual_scale": clampf(size, 0.2, 4.0),
		# Comfortable temperature band, straight from thermal genes + marks.
		"cold_floor_c": -5.0 - float(t.get("cold_tolerance", 0.0)) * 40.0,
		"heat_ceiling_c": 32.0 + float(t.get("heat_tolerance", 0.0)) * 40.0,
	}


func derived() -> Dictionary:
	if _dirty:
		_resolve()
	return _derived


func stat(key: String) -> float:
	return float(derived().get(key, 0.0))


func max_hp() -> float:
	return stat("max_hp")


func hp_fraction() -> float:
	var m := max_hp()
	return 0.0 if m <= 0.0 else clampf(hp / m, 0.0, 1.0)


## Called once after load/spawn to put vitals at full if they were never set.
func initialize_vitals() -> void:
	if hp <= 0.0:
		hp = max_hp()


func age(days: float) -> void:
	age_days += days


func is_elderly() -> bool:
	return age_days >= stat("max_age_days")


func is_infant() -> bool:
	return age_days < stat("max_age_days") * 0.06


## Creatures are DURABLE. Outside the fragile bookends of life they collapse
## rather than die — dropping to a whisker of health, unconscious and useless
## until tended, but recoverable.
##
## This is a deliberate design stance: the whole game is built on attachment to
## specific bloodlines, and a system that kills a nine-generation animal to a
## bad roll spends the player's investment carelessly. Death is reserved for
## the very old and the very young, where it carries meaning instead of noise.
func is_fragile() -> bool:
	return is_elderly() or is_infant()


## Returns true if this blow actually kills. Otherwise the creature is left
## downed at minimum health.
func resolve_mortal_blow() -> bool:
	if is_fragile():
		return true
	hp = maxf(1.0, max_hp() * 0.05)
	downed = true
	return false


## Set while collapsed. Cleared by healing, resting or a stable's care.
@export var downed: bool = false


func revive(fraction: float = 0.4) -> void:
	downed = false
	hp = maxf(hp, max_hp() * fraction)


# --- Readout ------------------------------------------------------------------

func describe() -> Array[String]:
	var lines: Array[String] = []
	var base := base_traits()
	var lived := lived_traits()
	var final := phenotype()

	lines.append("  %-18s %8s %8s %8s" % ["trait", "bred", "lived", "final"])
	var keys := final.keys()
	keys.sort()
	for key in keys:
		var b := float(base.get(key, 0.0))
		var l := float(lived.get(key, 0.0))
		var f := float(final.get(key, 0.0))
		# Flag the traits life actually changed — that is the interesting part.
		var marker := "  <-" if not is_equal_approx(b, f) else ""
		lines.append("  %-18s %8.2f %8.2f %8.2f%s" % [key, b, l, f, marker])

	lines.append("")
	var d := derived()
	lines.append("  hp %.0f/%.0f · speed %.0f · atk %.1f · def %.1f · carry %.0f" % [
		hp, d["max_hp"], d["move_speed"], d["attack_power"], d["defense"], d["carry_capacity"]])
	lines.append("  age %.0f/%.0f days · comfort %.0f°C to %.0f°C" % [
		age_days, d["max_age_days"], d["cold_floor_c"], d["heat_ceiling_c"]])
	return lines


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	# Only true state is stored. Derived stats are recomputed on load, which
	# means a balance patch applies to existing creatures instead of leaving a
	# generation of animals frozen at old numbers.
	return {"hp": hp, "age_days": age_days, "downed": downed}


func from_dict(d: Dictionary) -> void:
	hp = float(d.get("hp", 0.0))
	age_days = float(d.get("age_days", 0.0))
	downed = bool(d.get("downed", false))
	mark_dirty()


func post_load() -> void:
	mark_dirty()
	initialize_vitals()
