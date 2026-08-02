extends RefCounted
class_name Meiosis

## Produces a gamete from a diploid genome.
##
## HOW LINKAGE ACTUALLY WORKS HERE
## Rather than computing a pairwise recombination fraction between each adjacent
## locus, this simulates the physical event: crossovers are scattered along the
## chromosome as a Poisson process, and then the walk down the chromosome flips
## which parental strand it is reading every time it passes one.
##
## That choice matters. Pairwise recombination fractions give correct two-locus
## statistics but wrong three-locus ones — they cannot represent the fact that a
## single crossover between locus 1 and locus 3 moves locus 2 as well. Modelling
## the crossover itself gives correct behaviour for any number of loci for free,
## and it is less code.
##
## Consequence for the player: a chromosome's LENGTH is a design lever. Expected
## crossovers = length_cm / 100, so the 45 cM `chr_special` chromosome hands its
## latent traits down as a near-intact package, while the 120 cM `chr_form`
## shuffles size, build and posture almost independently every generation.

## Safety valve. A chromosome would need to be ~6 metres of genetic map to
## legitimately exceed this; hitting it means a data error, not biology.
const MAX_CROSSOVERS: int = 64


## One haploid gamete: { locus_id: String -> allele_id: String }.
##
## `is_uniparental_donor` says whether THIS parent is the one that transmits
## uniparental (cytoplasmic) chromosomes. Exactly one parent should pass true,
## or the child ends up with two copies of a single-copy chromosome.
##
## `stats_out`, if supplied, receives diagnostics: { "crossovers": int }.
static func gamete(genome: GenomeResource, rng: RandomNumberGenerator,
		is_uniparental_donor: bool = false, stats_out: Dictionary = {}) -> Dictionary:
	var result: Dictionary = {}
	var total_crossovers := 0

	for chromosome_id in GenomeDB.chromosome_ids_ordered():
		var chromosome: ChromosomeDefinitionResource = GenomeDB.get_chromosome(chromosome_id)
		if chromosome == null:
			continue

		if chromosome.uniparental:
			# No recombination, no segregation: transmitted whole or not at all.
			if is_uniparental_donor:
				_copy_uniparental(genome, chromosome_id, result)
			continue

		total_crossovers += _walk_chromosome(genome, chromosome, rng, result)

	stats_out["crossovers"] = total_crossovers
	return result


## Reads down one chromosome in map order, switching strands at each crossover.
## Returns the number of crossovers that actually occurred.
static func _walk_chromosome(genome: GenomeResource, chromosome: ChromosomeDefinitionResource,
		rng: RandomNumberGenerator, out: Dictionary) -> int:
	var locus_ids: Array = GenomeDB.loci_on_chromosome(chromosome.id)
	if locus_ids.is_empty():
		return 0

	var crossovers := crossover_positions(chromosome.length_cm, rng)

	# Which strand the read starts on is a coin flip — this is independent
	# assortment, and it is why unlinked genes segregate at 50%.
	var on_strand_a := rng.randf() < 0.5
	var next_crossover := 0

	for locus_id in locus_ids:
		var locus: LocusDefinitionResource = GenomeDB.get_locus(locus_id)
		if locus == null or not genome.has_locus(locus_id):
			continue
		# Pass every crossover that lies before this locus.
		while next_crossover < crossovers.size() \
				and float(crossovers[next_crossover]) <= locus.map_position_cm:
			on_strand_a = not on_strand_a
			next_crossover += 1
		var pair := genome.pair_at(locus_id)
		out[String(locus_id)] = pair[0] if on_strand_a else pair[1]

	return crossovers.size()


## Uniparental chromosomes are single-copy in reality, but the genome model is
## uniformly diploid. Both strands therefore carry the donor's strand-A allele,
## which makes such a locus permanently homozygous — exactly the behaviour a
## non-recombining, non-segregating chromosome should show.
static func _copy_uniparental(genome: GenomeResource, chromosome_id, out: Dictionary) -> void:
	for locus_id in GenomeDB.loci_on_chromosome(chromosome_id):
		if genome.has_locus(locus_id):
			out[String(locus_id)] = genome.pair_at(locus_id)[0]


## Sorted crossover positions in centimorgans along a chromosome.
## Count is Poisson with mean length_cm / 100 — the definition of the
## centimorgan is "1% expected recombination", so 100 cM means one crossover
## on average.
static func crossover_positions(length_cm: float, rng: RandomNumberGenerator) -> Array:
	var count := poisson(length_cm / 100.0, rng)
	var positions: Array = []
	for i in count:
		positions.append(rng.randf() * length_cm)
	positions.sort()
	return positions


## Knuth's multiplicative Poisson sampler. Fine for the small means involved
## here (a chromosome averages ~1 crossover); would need the transformed
## rejection method only if means got large, which they cannot.
static func poisson(mean: float, rng: RandomNumberGenerator) -> int:
	if mean <= 0.0:
		return 0
	var threshold := exp(-mean)
	var k := 0
	var p := 1.0
	while k < MAX_CROSSOVERS:
		p *= rng.randf()
		if p <= threshold:
			break
		k += 1
	return k


## Fertilization: two gametes become a diploid genome, with phase preserved —
## strand A is always the first parent's contribution, strand B the second's.
## Keeping that convention stable is what makes "this came down your sire's
## line" answerable later.
static func fertilize(gamete_a: Dictionary, gamete_b: Dictionary,
		species_id: StringName, generation: int) -> GenomeResource:
	var genome := GenomeResource.new()
	genome.species_id = species_id
	genome.generation = generation

	for locus_id in gamete_a:
		# A locus missing from one gamete (schema drift, uniparental) falls back
		# to the other rather than producing a half-formed genome.
		genome.set_pair(locus_id, gamete_a[locus_id], gamete_b.get(locus_id, gamete_a[locus_id]))
	for locus_id in gamete_b:
		if not genome.has_locus(locus_id):
			genome.set_pair(locus_id, gamete_b[locus_id], gamete_b[locus_id])

	return genome
