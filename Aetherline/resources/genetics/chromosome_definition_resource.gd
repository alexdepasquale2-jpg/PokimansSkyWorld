extends Resource
class_name ChromosomeDefinitionResource

## A linkage group. Loci on the same chromosome are inherited together except
## where crossover breaks them apart.
##
## Catalog data. The full Aetherline schema targets 12–16 of these (Phase 1).

## Stable key, e.g. &"chr_morphology".
@export var id: StringName = &""

@export var display_name: String = ""
@export_multiline var description: String = ""

## Ordinal used only for stable display ordering in the genome readout.
@export var display_order: int = 0

## Total genetic length in centimorgans. Expected crossovers per meiosis is
## roughly length_cm / 100, so a 100 cM chromosome averages one crossover.
## Short chromosomes therefore behave as tight, reliable trait packages.
@export_range(1.0, 400.0, 1.0) var length_cm: float = 100.0

## Loci carried on this chromosome (LocusDefinitionResource ids), in map order.
## GenomeDB re-sorts by map_position_cm on load, so authoring order is a hint.
@export var locus_ids: Array[StringName] = []

## If true, this chromosome does not recombine and is inherited whole from one
## parent — reserved for organelle-style genomes (mitochondrial analogue),
## which gives us clean maternal-line tracking for lineage UI.
@export var uniparental: bool = false

## Which gamete role transmits a uniparental chromosome.
@export var uniparental_source: AetherTypes.ReproRole = AetherTypes.ReproRole.GAMETE_B


func to_dict() -> Dictionary:
	return {
		"id": String(id),
		"display_name": display_name,
		"description": description,
		"display_order": display_order,
		"length_cm": length_cm,
		"locus_ids": locus_ids.map(func(x): return String(x)),
		"uniparental": uniparental,
		"uniparental_source": AetherTypes.enum_to_key(
			AetherTypes.ReproRole, uniparental_source),
	}


static func from_dict(d: Dictionary) -> ChromosomeDefinitionResource:
	var c := ChromosomeDefinitionResource.new()
	c.id = StringName(d.get("id", ""))
	c.display_name = String(d.get("display_name", ""))
	c.description = String(d.get("description", ""))
	c.display_order = int(d.get("display_order", 0))
	c.length_cm = float(d.get("length_cm", 100.0))
	c.uniparental = bool(d.get("uniparental", false))
	c.uniparental_source = AetherTypes.key_to_enum(
		AetherTypes.ReproRole, String(d.get("uniparental_source", "GAMETE_B")),
		AetherTypes.ReproRole.GAMETE_B)
	for l in d.get("locus_ids", []):
		c.locus_ids.append(StringName(l))
	return c
