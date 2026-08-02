extends Resource
class_name LocusDefinitionResource

## A single addressable gene position on a chromosome.
##
## Catalog data. Defines which alleles are legal here, how the pair is
## expressed, and where on the chromosome it sits (for linkage).

## Stable key, e.g. &"morph_size".
@export var id: StringName = &""

## Owning chromosome (ChromosomeDefinitionResource.id).
@export var chromosome_id: StringName = &""

@export var display_name: String = ""
@export_multiline var description: String = ""

@export var category: AetherTypes.GeneCategory = AetherTypes.GeneCategory.MORPHOLOGY

## How the allele pair resolves into an expressed value.
@export var expression_mode: AetherTypes.ExpressionMode = AetherTypes.ExpressionMode.ADDITIVE

## Legal alleles at this position (AlleleResource ids).
@export var allele_ids: Array[StringName] = []

## Position along the chromosome in centimorgans. Loci that sit close together
## are inherited together far more often than not — this is what creates
## linkage groups, and therefore package deals the player can learn to exploit
## ("that lineage's huge frame always drags the bad joints along with it").
@export_range(0.0, 400.0, 0.1) var map_position_cm: float = 0.0

## Trait keys this locus is expected to touch. Purely declarative — used by the
## debug readout and by validation to catch typos in allele contributions.
@export var trait_keys: Array[StringName] = []

## Baseline value used by SILENCE/ENHANCE epigenetic effects as the "neutral"
## anchor for each trait key: { trait_key -> float }.
@export var trait_baselines: Dictionary = {}

## Per-locus multiplier on mutation chance. Mutation hotspots (immune, sensory)
## sit above 1.0; deeply conserved body-plan loci sit well below.
@export_range(0.0, 8.0, 0.01) var mutation_susceptibility: float = 1.0

## If false, this locus is hidden from the plain-language genome readout and
## only shown in raw mode. Keeps the UI legible as the schema grows.
@export var show_in_summary: bool = true


func baseline(trait_key: StringName) -> float:
	return float(trait_baselines.get(trait_key, 0.0))


func to_dict() -> Dictionary:
	return {
		"id": String(id),
		"chromosome_id": String(chromosome_id),
		"display_name": display_name,
		"description": description,
		"category": AetherTypes.enum_to_key(AetherTypes.GeneCategory, category),
		"expression_mode": AetherTypes.enum_to_key(AetherTypes.ExpressionMode, expression_mode),
		"allele_ids": allele_ids.map(func(a): return String(a)),
		"map_position_cm": map_position_cm,
		"trait_keys": trait_keys.map(func(t): return String(t)),
		"trait_baselines": AlleleResource._stringify_keys(trait_baselines),
		"mutation_susceptibility": mutation_susceptibility,
		"show_in_summary": show_in_summary,
	}


static func from_dict(d: Dictionary) -> LocusDefinitionResource:
	var l := LocusDefinitionResource.new()
	l.id = StringName(d.get("id", ""))
	l.chromosome_id = StringName(d.get("chromosome_id", ""))
	l.display_name = String(d.get("display_name", ""))
	l.description = String(d.get("description", ""))
	l.category = AetherTypes.key_to_enum(
		AetherTypes.GeneCategory, String(d.get("category", "MORPHOLOGY")))
	l.expression_mode = AetherTypes.key_to_enum(
		AetherTypes.ExpressionMode, String(d.get("expression_mode", "ADDITIVE")))
	l.map_position_cm = float(d.get("map_position_cm", 0.0))
	l.mutation_susceptibility = float(d.get("mutation_susceptibility", 1.0))
	l.show_in_summary = bool(d.get("show_in_summary", true))
	for a in d.get("allele_ids", []):
		l.allele_ids.append(StringName(a))
	for t in d.get("trait_keys", []):
		l.trait_keys.append(StringName(t))
	for k in d.get("trait_baselines", {}):
		l.trait_baselines[StringName(k)] = float(d["trait_baselines"][k])
	return l
