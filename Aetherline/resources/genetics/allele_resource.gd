extends Resource
class_name AlleleResource

## One concrete variant that can occupy a locus.
##
## Alleles are *catalog* data, not per-creature data. They are authored once
## (as .tres files under res://data/alleles/ or generated from JSON) and
## registered in GenomeDB by `id`. A creature's genome stores only allele IDs,
## which keeps genomes tiny, save files small, and lineage diffing cheap.
##
## Design note: an allele does not know what it "means" mechanically beyond the
## numbers in `contributions`. Interpretation is the phenotype resolver's job.

## Stable unique key, e.g. &"morph_size_giant". NEVER rename a shipped id;
## add a new allele and deprecate the old one instead.
@export var id: StringName = &""

## Which locus this allele may occupy. Must match a LocusDefinitionResource.id.
@export var locus_id: StringName = &""

## Player-facing name, e.g. "Giant Frame".
@export var display_name: String = ""

## Player-facing flavour, shown in the genome readout.
@export_multiline var description: String = ""

## Dominance rank, 0.0 (fully recessive) .. 1.0 (fully dominant).
## Under ExpressionMode.DOMINANT the higher value wins; ties fall back to a
## blend. Under INCOMPLETE this is the blend weight. Chosen as a float rather
## than a discrete dominant/recessive flag so partial dominance is expressible.
@export_range(0.0, 1.0, 0.01) var dominance: float = 0.5

## Trait contributions: { trait_key: StringName -> value: float }.
## Example: { &"size": 1.8, &"metabolic_cost": 0.4 }.
## These are combined across the allele pair according to the locus's
## ExpressionMode to produce the expressed phenotype value.
@export var contributions: Dictionary = {}

## Free-form semantic tags used by archetypes, story hooks, and RECESSIVE_GATE
## expression, e.g. [&"cold_adapted", &"predator", &"lethal_homozygous"].
@export var tags: Array[StringName] = []

## Relative weight when rolling a random allele for this locus during
## planetary fauna seeding. 0.0 means "never generated naturally".
@export_range(0.0, 10.0, 0.01) var natural_weight: float = 1.0

## Relative weight when a point mutation lands on this locus. Lets us make
## catastrophic alleles rare without making them unreachable.
@export_range(0.0, 10.0, 0.01) var mutation_weight: float = 1.0

## If true, a homozygous pair of this allele is inviable — the embryo fails.
## This is what makes reckless inbreeding actually cost the player something.
@export var lethal_when_homozygous: bool = false


func has_tag(tag: StringName) -> bool:
	return tags.has(tag)


func contribution(trait_key: StringName) -> float:
	return float(contributions.get(trait_key, 0.0))


## Alleles are catalog data, so they serialize by reference (id only).
## This is here for tooling / export, not for the per-creature save path.
func to_dict() -> Dictionary:
	return {
		"id": String(id),
		"locus_id": String(locus_id),
		"display_name": display_name,
		"description": description,
		"dominance": dominance,
		"contributions": _stringify_keys(contributions),
		"tags": tags.map(func(t): return String(t)),
		"natural_weight": natural_weight,
		"mutation_weight": mutation_weight,
		"lethal_when_homozygous": lethal_when_homozygous,
	}


static func from_dict(d: Dictionary) -> AlleleResource:
	var a := AlleleResource.new()
	a.id = StringName(d.get("id", ""))
	a.locus_id = StringName(d.get("locus_id", ""))
	a.display_name = String(d.get("display_name", ""))
	a.description = String(d.get("description", ""))
	a.dominance = float(d.get("dominance", 0.5))
	a.natural_weight = float(d.get("natural_weight", 1.0))
	a.mutation_weight = float(d.get("mutation_weight", 1.0))
	a.lethal_when_homozygous = bool(d.get("lethal_when_homozygous", false))
	for k in d.get("contributions", {}):
		a.contributions[StringName(k)] = float(d["contributions"][k])
	for t in d.get("tags", []):
		a.tags.append(StringName(t))
	return a


static func _stringify_keys(src: Dictionary) -> Dictionary:
	var out := {}
	for k in src:
		out[String(k)] = src[k]
	return out
