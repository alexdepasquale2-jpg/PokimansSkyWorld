extends CreatureComponent
class_name GeneticsComponent

## Owns the creature's GenomeResource and resolves it into base trait values.
##
## "Base" means: what the DNA alone says, before life has had its say. The
## epigenetic overlay and archetype modifiers are applied downstream by
## StatsComponent, which is the single read point for gameplay. Keeping the
## stages separate is what lets the debug readout show a player *why* their
## animal is what it is — this much is bred, this much is lived.

## Per-locus chance of a point mutation at conception, before any modifier.
## Multiplied by the locus's own susceptibility, the creature's expressed
## mutation_rate trait, and the planet's mutation_rate_modifier.
const BASE_MUTATION_CHANCE: float = 0.02

@export var genome: GenomeResource

## Cached base expression. Invalidated whenever the genome changes; genomes
## change rarely (conception, mutation) and are read constantly, so caching
## here is the single highest-value optimisation in the creature stack.
var _cached_traits: Dictionary = {}
var _dirty: bool = true


func _on_setup() -> void:
	if genome == null:
		genome = GenomeResource.new()


# --- Genome management --------------------------------------------------------

func set_genome(g: GenomeResource) -> void:
	genome = g
	mark_dirty()


func mark_dirty() -> void:
	_dirty = true
	# Downstream caches depend on this one; tell Stats to drop its own.
	if creature != null and creature.stats != null:
		creature.stats.mark_dirty()


## Builds a fresh random genome from the loaded schema. Used for founders and
## for wild fauna seeding. `divergence` biases toward rarer alleles — a distant,
## hostile world should not be populated with the same stock as the homeworld.
func randomize_genome(rng: RandomNumberGenerator, species_id: StringName = &"aether_base",
		divergence: float = 0.0) -> void:
	var g := GenomeResource.new()
	g.species_id = species_id
	g.repro_role = AetherTypes.ReproRole.GAMETE_A if rng.randf() < 0.5 \
		else AetherTypes.ReproRole.GAMETE_B

	for chrom_id in GenomeDB.chromosome_ids_ordered():
		for locus_id in GenomeDB.loci_on_chromosome(chrom_id):
			# Two independent draws: a founder is not assumed homozygous.
			var a := GenomeDB.roll_allele(locus_id, rng, "natural_weight")
			var b := GenomeDB.roll_allele(locus_id, rng, "natural_weight")
			# Divergence occasionally re-rolls a strand on mutation weights,
			# which favours the alleles natural selection would not have picked.
			if divergence > 0.0 and rng.randf() < divergence:
				b = GenomeDB.roll_allele(locus_id, rng, "mutation_weight")
			if a.is_empty() or b.is_empty():
				continue
			g.set_pair(locus_id, a, b)

	set_genome(g)


# --- Expression ---------------------------------------------------------------

## Base trait values from DNA alone: { trait_key: String -> float }.
## Cached wrapper over PhenotypeResolver.express. The resolution logic itself
## lives there so that breeding previews, offspring statistics and the debug lab
## can resolve a genome without instantiating a creature — and so the tests
## exercise the same code the game runs.
func express_base() -> Dictionary:
	if not _dirty:
		return _cached_traits
	_cached_traits = PhenotypeResolver.express(genome)
	_dirty = false
	return _cached_traits


func trait_value(trait_key) -> float:
	return float(express_base().get(String(trait_key), 0.0))


# --- Mutation -----------------------------------------------------------------

## The creature's own expressed mutation multiplier.
func mutation_rate() -> float:
	var expressed := trait_value(&"mutation_rate")
	return maxf(0.0, expressed if expressed > 0.0 else 1.0)


## Rolls a point mutation on every locus. Returns a list of records:
##   { "locus": String, "strand": "a"|"b", "from": String, "to": String }
## Called at conception; also exposed for the debug tools and for research
## effects that deliberately destabilise a genome.
func mutate(rng: RandomNumberGenerator, planet_modifier: float = 1.0) -> Array:
	var records: Array = []
	if genome == null:
		return records
	var creature_rate := mutation_rate()

	for locus_id in genome.locus_ids():
		var locus: LocusDefinitionResource = GenomeDB.get_locus(locus_id)
		if locus == null:
			continue
		var chance := BASE_MUTATION_CHANCE * locus.mutation_susceptibility \
			* creature_rate * planet_modifier
		if rng.randf() >= chance:
			continue
		var strand := "a" if rng.randf() < 0.5 else "b"
		var record := force_mutation(locus_id, strand, rng)
		if not record.is_empty():
			records.append(record)

	if not records.is_empty():
		mark_dirty()
	return records


## Deterministically mutate one strand at one locus. Returns {} if the roll
## produced the allele that was already there (a silent mutation). Separated
## from `mutate` so tests can drive it without fighting probability.
func force_mutation(locus_id, strand: String, rng: RandomNumberGenerator) -> Dictionary:
	var pair := genome.pair_at(locus_id)
	if pair.is_empty():
		return {}
	var old_allele: String = pair[0] if strand == "a" else pair[1]
	var new_allele := GenomeDB.roll_allele(locus_id, rng, "mutation_weight")
	if new_allele.is_empty() or new_allele == old_allele:
		return {}

	if strand == "a":
		genome.set_pair(locus_id, new_allele, pair[1])
	else:
		genome.set_pair(locus_id, pair[0], new_allele)

	var key := String(locus_id)
	if not genome.de_novo_loci.has(key):
		genome.de_novo_loci.append(key)
	mark_dirty()

	var uid: StringName = creature.identity.uid if creature != null else &""
	EventBus.mutation_occurred.emit(uid, StringName(key),
		StringName(old_allele), StringName(new_allele))

	return {"locus": key, "strand": strand, "from": old_allele, "to": new_allele}


# --- Readout ------------------------------------------------------------------

## Plain-language genome readout, grouped by chromosome and in map order.
## Deliberately reads like a description rather than a data dump — "keep the
## genetic system readable" is a project rule, and raw data is available
## separately via genome.to_dict().
func describe() -> Array[String]:
	var lines: Array[String] = []
	if genome == null:
		return ["  (no genome)"]
	var traits := express_base()
	lines.append("  (polygenic traits show this gene's own contribution, "
		+ "then the whole-genome total)")

	for chrom_id in GenomeDB.chromosome_ids_ordered():
		var chrom: ChromosomeDefinitionResource = GenomeDB.get_chromosome(chrom_id)
		var locus_ids: Array = GenomeDB.loci_on_chromosome(chrom_id)
		if locus_ids.is_empty():
			continue
		lines.append("  %s  (%.0f cM)" % [chrom.display_name, chrom.length_cm])

		for locus_id in locus_ids:
			if not genome.has_locus(locus_id):
				continue
			var locus: LocusDefinitionResource = GenomeDB.get_locus(locus_id)
			if not locus.show_in_summary:
				continue
			var pair := genome.pair_at(locus_id)
			var allele_a: AlleleResource = GenomeDB.get_allele(pair[0])
			var allele_b: AlleleResource = GenomeDB.get_allele(pair[1])
			if allele_a == null or allele_b == null:
				continue

			var zygosity := "homozygous" if pair[0] == pair[1] else "heterozygous"
			var genotype := allele_a.display_name if pair[0] == pair[1] \
				else "%s / %s" % [allele_a.display_name, allele_b.display_name]

			# For a polygenic trait, show what THIS locus contributes and what
			# the whole genome adds up to. Printing only the total under every
			# contributing locus reads as though each gene produced it alone —
			# which is exactly backwards for understanding a bloodline.
			var effects: Array[String] = []
			for trait_key in locus.trait_keys:
				var key := String(trait_key)
				var total := float(traits.get(key, 0.0))
				if GenomeDB.loci_contributing_to(key).size() > 1:
					var contribution := PhenotypeResolver.combine(
						locus, allele_a, allele_b, trait_key)
					effects.append("%s %+.2f (of %.2f)" % [key, contribution, total])
				else:
					effects.append("%s %.2f" % [key, total])

			lines.append("    %-26s %-38s [%s, %s]" % [
				locus.display_name, genotype,
				AetherTypes.enum_to_key(AetherTypes.ExpressionMode, locus.expression_mode).to_lower(),
				zygosity,
			])
			lines.append("      -> " + ",  ".join(effects))

	if not genome.de_novo_loci.is_empty():
		lines.append("  Mutated in this individual: " + ", ".join(genome.de_novo_loci))
	lines.append("  Generation %d · genome checksum %d" % [genome.generation, genome.checksum()])
	return lines


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	return {"genome": genome.to_dict() if genome != null else {}}


func from_dict(d: Dictionary) -> void:
	var g: Dictionary = d.get("genome", {})
	genome = GenomeResource.from_dict(g) if not g.is_empty() else GenomeResource.new()
	mark_dirty()
