extends Resource
class_name EpigeneticProfileResource

## The full set of epigenetic marks a creature currently carries.
##
## Owned by EpigeneticsComponent, read by the phenotype resolver, written by
## basically every gameplay system (climate, diet, combat, work, training).

const SCHEMA_VERSION: int = 1

@export var schema_version: int = SCHEMA_VERSION

## Array[EpigeneticMarkResource]. Kept as a flat list rather than a dict keyed
## by definition_id because duplicate marks of the same kind from different
## episodes are meaningful and must not silently merge.
@export var marks: Array = []


# --- Mutation -----------------------------------------------------------------

## Add a new mark, or reinforce the existing one of the same definition_id.
## Returns the mark that ended up carrying the exposure.
##
## Merging by definition_id is the default because the alternative — a creature
## slowly accumulating four hundred "cold day" marks — is both a memory leak
## and unreadable. Callers that genuinely want a distinct episode (a specific
## trauma, say) should pass `force_distinct`.
## `heritability_ceiling` is passed in rather than fixed here because it is a
## campaign condition (research raises it), not a property of the mark.
func apply(mark: EpigeneticMarkResource, reinforce_amount: float = 0.15,
		force_distinct: bool = false,
		heritability_ceiling: float = 0.6) -> EpigeneticMarkResource:
	if not force_distinct:
		var existing := find_by_definition(mark.definition_id)
		if existing != null:
			existing.reinforce(reinforce_amount, 0.01, heritability_ceiling)
			return existing
	var added := mark.clone()
	if String(added.uid).is_empty():
		added.uid = StringName("epi_%d_%d" % [Time.get_ticks_usec(), randi() % 100000])
	if added.strength <= 0.0:
		added.strength = reinforce_amount
	added.exposure_count = maxi(added.exposure_count, 1)
	marks.append(added)
	return added


## Age every mark and drop the ones that have faded to nothing.
func decay_all(delta_days: float, base_rate: float = 0.02) -> void:
	for m in marks:
		m.decay(delta_days, base_rate)
	marks = marks.filter(func(m): return not m.is_expired())


func remove(uid: StringName) -> void:
	marks = marks.filter(func(m): return m.uid != uid)


func clear_all() -> void:
	marks.clear()


# --- Queries ------------------------------------------------------------------

func find_by_definition(definition_id: StringName) -> EpigeneticMarkResource:
	for m in marks:
		if m.definition_id == definition_id:
			return m
	return null


func marks_for_trait(trait_key: StringName) -> Array:
	return marks.filter(func(m): return m.target_trait == trait_key)


func marks_for_locus(locus_id: StringName) -> Array:
	return marks.filter(func(m): return m.target_locus == locus_id)


func marks_with_tag(tag: StringName) -> Array:
	return marks.filter(func(m): return m.has_tag(tag))


func marks_from_source(source: AetherTypes.EpiSource) -> Array:
	return marks.filter(func(m): return m.source == source)


## Total ADD offset and MULTIPLY scalar affecting a trait, pre-combined so the
## phenotype resolver stays simple. Returns { "add": float, "mul": float }.
func trait_modifiers(trait_key: StringName) -> Dictionary:
	var add := 0.0
	var mul := 1.0
	for m in marks_for_trait(trait_key):
		match m.effect:
			AetherTypes.EpiEffect.ADD:
				add += m.effective_magnitude()
			AetherTypes.EpiEffect.MULTIPLY:
				mul *= (1.0 + m.effective_magnitude())
			_:
				pass  # SILENCE / ENHANCE / UNLOCK need the baseline; resolver handles them.
	return {"add": add, "mul": mul}


## Marks the creature would pass on, rolled against their heritability.
## `rng` is passed in so breeding stays deterministic and replayable.
func heritable_subset(rng: RandomNumberGenerator) -> Array:
	var out: Array = []
	for m in marks:
		if rng.randf() < m.heritability_chance:
			var child_mark: EpigeneticMarkResource = m.clone()
			child_mark.uid = StringName("")            # re-issued on apply()
			child_mark.inherited_depth = m.inherited_depth + 1
			# Inherited marks arrive attenuated: the offspring inherits the
			# predisposition, not the parent's full lived intensity.
			child_mark.strength = m.strength * 0.6
			child_mark.exposure_count = 0
			out.append(child_mark)
	return out


## One-line summaries for the debug/inspection UI.
func summarize() -> Array[String]:
	var lines: Array[String] = []
	for m in marks:
		var target := String(m.target_trait) if not String(m.target_trait).is_empty() \
			else "locus:" + String(m.target_locus)
		lines.append("%s [%s] %s %+0.2f  str %.2f  herit %.0f%%  x%d%s" % [
			m.display_name if not m.display_name.is_empty() else String(m.definition_id),
			target,
			AetherTypes.enum_to_key(AetherTypes.EpiEffect, m.effect),
			m.effective_magnitude(),
			m.strength,
			m.heritability_chance * 100.0,
			m.exposure_count,
			"  (gen+%d)" % m.inherited_depth if m.inherited_depth > 0 else "",
		])
	return lines


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"schema_version": schema_version,
		"marks": marks.map(func(m): return m.to_dict()),
	}


static func from_dict(d: Dictionary) -> EpigeneticProfileResource:
	var p := EpigeneticProfileResource.new()
	p.schema_version = int(d.get("schema_version", 1))
	for md in d.get("marks", []):
		p.marks.append(EpigeneticMarkResource.from_dict(md))
	return p


func clone() -> EpigeneticProfileResource:
	return EpigeneticProfileResource.from_dict(to_dict())
