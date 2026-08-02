extends RefCounted
class_name PhenotypeResolver

## Pure genome -> trait resolution. No node, no component, no state.
##
## Lives apart from GeneticsComponent so that anything can ask "what would this
## genome express?" without instantiating a creature: breeding previews, the
## debug lab, offspring statistics, and wild-fauna filtering all need exactly
## this and nothing else. GeneticsComponent is now a thin caching wrapper over
## it, which also means the tests exercise the same code the game runs rather
## than a reimplementation.

## Base trait values from DNA alone: { trait_key: String -> float }.
## Polygenic by construction — every locus declaring a trait key adds into the
## same running total, so traits touched by several loci vary continuously
## instead of in steps.
static func express(genome: GenomeResource) -> Dictionary:
	# Seed with the schema baselines. Allele contributions are DELTAS from the
	# species norm, not absolute values — that is the only way several loci can
	# meaningfully sum into one polygenic trait.
	var traits: Dictionary = GenomeDB.baseline_traits()
	if genome == null:
		return traits
	for locus_id in genome.locus_ids():
		var locus: LocusDefinitionResource = GenomeDB.get_locus(locus_id)
		if locus == null:
			continue
		var pair := genome.pair_at(locus_id)
		var allele_a: AlleleResource = GenomeDB.get_allele(pair[0])
		var allele_b: AlleleResource = GenomeDB.get_allele(pair[1])
		if allele_a == null or allele_b == null:
			continue
		for trait_key in locus.trait_keys:
			var key := String(trait_key)
			traits[key] = float(traits.get(key, 0.0)) \
				+ combine(locus, allele_a, allele_b, trait_key)
	return traits


## Resolves one allele pair's contribution to one trait, per the locus's mode.
static func combine(locus: LocusDefinitionResource, a: AlleleResource,
		b: AlleleResource, trait_key: StringName) -> float:
	var va := a.contribution(trait_key)
	var vb := b.contribution(trait_key)

	match locus.expression_mode:
		AetherTypes.ExpressionMode.DOMINANT:
			# Equal dominance is not a tie to break arbitrarily — it is how the
			# schema expresses genuine co-expression (see meta_diet, where
			# carnivore x herbivore yields a real omnivore).
			if is_equal_approx(a.dominance, b.dominance):
				return (va + vb) * 0.5
			return va if a.dominance > b.dominance else vb

		AetherTypes.ExpressionMode.INCOMPLETE:
			var total := a.dominance + b.dominance
			if total <= 0.0:
				return (va + vb) * 0.5
			var weight_a := a.dominance / total
			return va * weight_a + vb * (1.0 - weight_a)

		AetherTypes.ExpressionMode.CODOMINANT:
			return va + vb

		AetherTypes.ExpressionMode.RECESSIVE_GATE:
			# Expresses only when both strands agree — the classic recessive
			# trait that skips generations and then reappears.
			return va if a.id == b.id else 0.0

		_:  # ADDITIVE — the workhorse for polygenic traits.
			return (va + vb) * 0.5


## Convenience for callers that want one number.
static func express_trait(genome: GenomeResource, trait_key) -> float:
	return float(express(genome).get(String(trait_key), 0.0))


## Which allele actually shows at a DOMINANT locus. Used by the readout to say
## "carries sparse, shows thick" — the single most important thing a player
## needs to understand about their breeding stock.
static func dominant_allele_at(genome: GenomeResource, locus_id) -> AlleleResource:
	var locus: LocusDefinitionResource = GenomeDB.get_locus(locus_id)
	if locus == null or not genome.has_locus(locus_id):
		return null
	var pair := genome.pair_at(locus_id)
	var a: AlleleResource = GenomeDB.get_allele(pair[0])
	var b: AlleleResource = GenomeDB.get_allele(pair[1])
	if a == null or b == null:
		return null
	if locus.expression_mode != AetherTypes.ExpressionMode.DOMINANT:
		return null
	if is_equal_approx(a.dominance, b.dominance):
		return null  # co-expressed; neither masks the other
	return a if a.dominance > b.dominance else b


## Alleles the creature carries but does not show — the hidden half of a
## bloodline, and the reason breeding is interesting rather than arithmetic.
static func hidden_carriers(genome: GenomeResource) -> Array:
	var hidden: Array = []
	for locus_id in genome.locus_ids():
		if genome.is_homozygous(locus_id):
			continue
		var locus: LocusDefinitionResource = GenomeDB.get_locus(locus_id)
		if locus == null:
			continue
		var pair := genome.pair_at(locus_id)
		match locus.expression_mode:
			AetherTypes.ExpressionMode.DOMINANT:
				var shown := dominant_allele_at(genome, locus_id)
				if shown == null:
					continue
				var masked_id: String = pair[1] if String(shown.id) == pair[0] else pair[0]
				var masked: AlleleResource = GenomeDB.get_allele(masked_id)
				if masked != null:
					hidden.append({"locus": String(locus_id), "allele": masked_id,
						"name": masked.display_name, "reason": "masked"})
			AetherTypes.ExpressionMode.RECESSIVE_GATE:
				# Heterozygous at a gate means the trait is carried, silent.
				for allele_id in pair:
					var allele: AlleleResource = GenomeDB.get_allele(allele_id)
					if allele != null and not allele.contributions.is_empty() \
							and allele.contributions.values().any(func(v): return absf(float(v)) > 0.0):
						hidden.append({"locus": String(locus_id), "allele": String(allele_id),
							"name": allele.display_name, "reason": "ungated"})
	return hidden
