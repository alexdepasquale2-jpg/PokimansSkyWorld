extends Resource
class_name GenomeResource

## The per-creature genome: chromosomes -> loci -> allele pairs.
##
## STORAGE MODEL
## The genome is stored as two *phased haplotypes*, not as an unordered pair
## per locus. haplotype_a holds one allele per locus, haplotype_b holds the
## other, and a given locus's pair is (a[locus], b[locus]).
##
## Phase matters. Without it we could not model linkage: recombination has to
## know which alleles physically travelled together on the same strand. Storing
## phase is what lets "the giant frame and the bad joints came from the same
## grandparent's chromosome" be a real, discoverable fact rather than flavour.
##
## Keys are plain Strings so the whole structure JSON round-trips losslessly.
## Values are AlleleResource ids; the alleles themselves live in GenomeDB.

## Bumped whenever the on-disk shape changes. SaveSystem migrates on load.
const SCHEMA_VERSION: int = 1

@export var schema_version: int = SCHEMA_VERSION

## Which species/schema this genome was built against. A genome is only
## meaningful against the schema it was generated from.
@export var species_id: StringName = &"aether_base"

## locus_id -> allele_id, for each of the two strands.
@export var haplotype_a: Dictionary = {}
@export var haplotype_b: Dictionary = {}

## Reproductive role, determined at conception. Kept on the genome rather than
## the identity because breeding code needs it and identity is narrative data.
@export var repro_role: AetherTypes.ReproRole = AetherTypes.ReproRole.BOTH

## Loci that arose by mutation in this individual (not inherited). Purely
## informational, but the StoryDirector loves it: "born different".
@export var de_novo_loci: Array[String] = []

## Number of meioses since the lineage founder. Cheap generation counter that
## survives even when ancestors have been garbage-collected from memory.
@export var generation: int = 0


# --- Access -------------------------------------------------------------------

func locus_ids() -> Array:
	return haplotype_a.keys()


func has_locus(locus_id) -> bool:
	return haplotype_a.has(String(locus_id))


## Returns [allele_a_id, allele_b_id] as Strings, or [] if the locus is absent.
func pair_at(locus_id) -> Array:
	var key := String(locus_id)
	if not haplotype_a.has(key):
		return []
	return [String(haplotype_a[key]), String(haplotype_b.get(key, haplotype_a[key]))]


func set_pair(locus_id, allele_a, allele_b) -> void:
	var key := String(locus_id)
	haplotype_a[key] = String(allele_a)
	haplotype_b[key] = String(allele_b)


func is_homozygous(locus_id) -> bool:
	var p := pair_at(locus_id)
	return p.size() == 2 and p[0] == p[1]


## True if either allele at the locus carries the tag. Requires GenomeDB for
## the lookup, so it is a convenience wrapper rather than pure genome data.
func has_allele_tag(locus_id, tag: StringName) -> bool:
	for allele_id in pair_at(locus_id):
		var allele: AlleleResource = GenomeDB.get_allele(allele_id)
		if allele != null and allele.has_tag(tag):
			return true
	return false


## Every distinct allele id carried, both strands. Useful for lineage diffing.
func all_allele_ids() -> Array:
	var seen := {}
	for k in haplotype_a:
		seen[String(haplotype_a[k])] = true
	for k in haplotype_b:
		seen[String(haplotype_b[k])] = true
	return seen.keys()


# --- Integrity ----------------------------------------------------------------

## Order-independent fingerprint of the genome. Two creatures with identical
## genomes produce identical checksums, which gives us (a) save-load
## verification and (b) a cheap "are these clones?" test for the story layer.
func checksum() -> int:
	var keys := haplotype_a.keys()
	keys.sort()
	var acc := ""
	for k in keys:
		acc += "%s:%s|%s;" % [k, haplotype_a[k], haplotype_b.get(k, "")]
	return hash(acc)


## Structural validation against the loaded schema. Returns a list of
## human-readable problems; empty means clean.
func validate() -> Array[String]:
	var problems: Array[String] = []
	for key in haplotype_a:
		if not haplotype_b.has(key):
			problems.append("locus '%s' present on strand A but missing on strand B" % key)
		var locus: LocusDefinitionResource = GenomeDB.get_locus(key)
		if locus == null:
			problems.append("locus '%s' is not in the loaded schema" % key)
			continue
		for allele_id in pair_at(key):
			if GenomeDB.get_allele(allele_id) == null:
				problems.append("locus '%s' references unknown allele '%s'" % [key, allele_id])
			elif not locus.allele_ids.has(StringName(allele_id)):
				problems.append("allele '%s' is not legal at locus '%s'" % [allele_id, key])
	for key in haplotype_b:
		if not haplotype_a.has(key):
			problems.append("locus '%s' present on strand B but missing on strand A" % key)
	return problems


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"schema_version": schema_version,
		"species_id": String(species_id),
		"repro_role": AetherTypes.enum_to_key(AetherTypes.ReproRole, repro_role),
		"generation": generation,
		"de_novo_loci": de_novo_loci.duplicate(),
		"hap_a": haplotype_a.duplicate(true),
		"hap_b": haplotype_b.duplicate(true),
		"checksum": checksum(),
	}


static func from_dict(d: Dictionary) -> GenomeResource:
	var g := GenomeResource.new()
	g.schema_version = int(d.get("schema_version", 1))
	g.species_id = StringName(d.get("species_id", "aether_base"))
	g.repro_role = AetherTypes.key_to_enum(
		AetherTypes.ReproRole, String(d.get("repro_role", "BOTH")),
		AetherTypes.ReproRole.BOTH)
	g.generation = int(d.get("generation", 0))
	for l in d.get("de_novo_loci", []):
		g.de_novo_loci.append(String(l))
	for k in d.get("hap_a", {}):
		g.haplotype_a[String(k)] = String(d["hap_a"][k])
	for k in d.get("hap_b", {}):
		g.haplotype_b[String(k)] = String(d["hap_b"][k])

	# Fidelity guard: a genome that does not round-trip exactly is a save bug,
	# and a silent one would poison a lineage forever. Shout about it.
	if d.has("checksum") and int(d["checksum"]) != g.checksum():
		push_error("GenomeResource.from_dict: checksum mismatch — genome may be corrupt.")
	return g


func clone() -> GenomeResource:
	return GenomeResource.from_dict(to_dict())
