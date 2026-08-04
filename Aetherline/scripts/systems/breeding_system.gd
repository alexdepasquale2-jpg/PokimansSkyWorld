extends RefCounted
class_name BreedingSystem

## Turns two creatures into offspring.
##
## The full conception pipeline:
##   1. compatibility        — species, reproductive roles
##   2. meiosis              — a gamete from each parent, with crossover
##   3. fertilization        — diploid genome, phase preserved
##   4. viability            — lethal homozygous alleles kill the embryo
##   5. mutation at birth    — rate from the child's own inherited machinery,
##                             the planet, and (later) research
##   6. epigenetic crossing  — each parent's marks roll against heritability
##   7. identity & lineage   — naming, generation, records, story events
##
## Every random draw goes through the caller's RandomNumberGenerator, so a
## breeding is reproducible from its seed. That is not just for tests: it means
## a save can replay a conception and get the same animal.

## Global multiplier on mutation rate, raised by research (Phase 5) and by
## deliberate destabilisation. Static because it is a campaign-wide condition,
## not a property of any one creature.
static var research_mutation_modifier: float = 1.0

## The matching knob for epigenetic heritability lives on EpigeneticsComponent
## (`research_heritability_bonus`) rather than here, both because it is
## epigenetics' business and to keep this class off that dependency cycle.

## Hard cap on offspring per conception, whatever the litter genes say.
const MAX_LITTER: int = 6


## Breed two creatures. Returns a result dictionary:
##   {
##     "children": Array[Creature],   # empty on failure
##     "child": Creature or null,     # convenience: first child
##     "success": bool,
##     "note": String,                # why it failed, or what happened
##     "mutations": Array,            # mutation records across all children
##     "inherited_marks": int,
##     "crossovers": int,
##   }
##
## `opts`: planet_id, planet_name, lineage_id, litter_override, name.
static func breed(parent_a: Creature, parent_b: Creature, parent_node: Node,
		rng: RandomNumberGenerator, opts: Dictionary = {}) -> Dictionary:
	var result := {
		"children": [], "child": null, "success": false, "note": "",
		"mutations": [], "inherited_marks": 0, "crossovers": 0,
	}

	var compatibility := check_compatibility(parent_a, parent_b)
	if not bool(compatibility["ok"]):
		result["note"] = String(compatibility["reason"])
		_announce_failure(parent_a, parent_b, result["note"])
		return result

	# The gestating parent transmits the cytoplasmic chromosome, which is what
	# gives the lineage UI an unbroken maternal line to follow.
	var gestator: Creature = compatibility["gestator"]
	var sire: Creature = parent_b if gestator == parent_a else parent_a

	var litter := int(opts.get("litter_override", _litter_size(parent_a, parent_b)))
	litter = clampi(litter, 1, MAX_LITTER)

	var generation := maxi(parent_a.identity.generation, parent_b.identity.generation) + 1
	var stillbirths := 0

	for i in litter:
		var conception := _conceive(sire, gestator, parent_node, rng, generation, opts)
		result["crossovers"] = int(result["crossovers"]) + int(conception["crossovers"])
		if conception["child"] == null:
			stillbirths += 1
			if result["note"].is_empty():
				result["note"] = String(conception["note"])
			continue
		result["children"].append(conception["child"])
		result["mutations"].append_array(conception["mutations"])
		result["inherited_marks"] = int(result["inherited_marks"]) + int(conception["inherited_marks"])

	result["success"] = not result["children"].is_empty()
	if result["success"]:
		result["child"] = result["children"][0]
		if result["note"].is_empty():
			result["note"] = "%d born%s" % [
				result["children"].size(),
				", %d stillborn" % stillbirths if stillbirths > 0 else ""]
	elif result["note"].is_empty():
		result["note"] = "no viable offspring"

	return result


# --- Compatibility ------------------------------------------------------------

## Returns { "ok": bool, "reason": String, "gestator": Creature }.
static func check_compatibility(a: Creature, b: Creature) -> Dictionary:
	if a == null or b == null:
		return {"ok": false, "reason": "a parent is missing", "gestator": null}
	if a == b:
		return {"ok": false, "reason": "a creature cannot breed with itself", "gestator": null}
	if a.identity.species_id != b.identity.species_id:
		return {"ok": false, "reason": "different species cannot interbreed", "gestator": null}

	var role_a := a.genetics.genome.repro_role
	var role_b := b.genetics.genome.repro_role
	if role_a == AetherTypes.ReproRole.NONE or role_b == AetherTypes.ReproRole.NONE:
		return {"ok": false, "reason": "one parent does not reproduce sexually", "gestator": null}

	# Someone has to gestate. BOTH can fill either role, which is what makes
	# hermaphroditic lineages viable without special-casing them everywhere.
	var a_can_gestate := role_a == AetherTypes.ReproRole.GAMETE_B or role_a == AetherTypes.ReproRole.BOTH
	var b_can_gestate := role_b == AetherTypes.ReproRole.GAMETE_B or role_b == AetherTypes.ReproRole.BOTH
	var a_can_sire := role_a == AetherTypes.ReproRole.GAMETE_A or role_a == AetherTypes.ReproRole.BOTH
	var b_can_sire := role_b == AetherTypes.ReproRole.GAMETE_A or role_b == AetherTypes.ReproRole.BOTH

	if a_can_gestate and b_can_sire:
		return {"ok": true, "reason": "", "gestator": a}
	if b_can_gestate and a_can_sire:
		return {"ok": true, "reason": "", "gestator": b}
	return {"ok": false, "reason": "incompatible reproductive roles", "gestator": null}


static func _litter_size(a: Creature, b: Creature) -> int:
	var average := (a.stats.trait_value(&"litter_size") + b.stats.trait_value(&"litter_size")) * 0.5
	return maxi(1, int(round(average)))


# --- Conception ---------------------------------------------------------------

static func _conceive(sire: Creature, gestator: Creature, parent_node: Node,
		rng: RandomNumberGenerator, generation: int, opts: Dictionary) -> Dictionary:
	var out := {"child": null, "note": "", "mutations": [], "inherited_marks": 0, "crossovers": 0}

	var sire_stats := {}
	var gestator_stats := {}
	var gamete_sire := Meiosis.gamete(sire.genetics.genome, rng, false, sire_stats)
	var gamete_gestator := Meiosis.gamete(gestator.genetics.genome, rng, true, gestator_stats)
	out["crossovers"] = int(sire_stats.get("crossovers", 0)) + int(gestator_stats.get("crossovers", 0))

	var genome := Meiosis.fertilize(
		gamete_sire, gamete_gestator, sire.identity.species_id, generation)

	var lethal := _find_lethal_homozygote(genome)
	if not lethal.is_empty():
		out["note"] = "stillborn: lethal homozygous %s" % lethal
		return out

	# --- Build the child ---
	var child: Creature = CreatureFactory.spawn_blank(parent_node, {
		"name": opts.get("name", ""),
		"species_id": String(sire.identity.species_id),
		"is_human": sire.identity.is_human,
		"generation": generation,
		"origin_kind": "born",
		"planet_id": opts.get("planet_id", PlanetManager.active_planet_id),
		"planet_name": opts.get("planet_name", ""),
		# Offspring join the gestating parent's bloodline by default. Lineages
		# follow the maternal line because the cytoplasmic chromosome does.
		"lineage_id": opts.get("lineage_id", String(gestator.identity.lineage_id)),
		# And the gestating parent's people, for the same reason: a child is
		# raised by whoever carried it, and culture is transmitted by raising.
		"culture_id": opts.get("culture_id", String(gestator.identity.culture_id)),
	}, rng)

	child.identity.parent_uids = [String(sire.identity.uid), String(gestator.identity.uid)]
	child.genetics.set_genome(genome)
	# Reproductive role is decided at conception, not inherited as a gene.
	child.genetics.genome.repro_role = _roll_repro_role(sire, gestator, rng)

	# --- Mutation at birth ---
	# Uses the child's own inherited copying machinery: it got its parents'
	# repair genes, and those are what will misfire.
	var planet_modifier := 1.0
	var planet := PlanetManager.active_planet()
	if planet != null:
		planet_modifier = planet.mutation_rate_modifier
	out["mutations"] = child.genetics.mutate(rng, planet_modifier * research_mutation_modifier)

	# --- Epigenetic inheritance ---
	# Both parents roll their marks; a mark that crosses arrives attenuated and
	# one generation deeper. This is the mechanism by which a lineage slowly
	# absorbs the conditions it has lived under.
	var inherited := 0
	for parent in [gestator, sire]:
		for mark in parent.epigenetics.profile.heritable_subset(rng):
			child.epigenetics.adopt_inherited_mark(mark)
			inherited += 1
			if mark.inherited_depth >= 2:
				var lineage := StoryDirector.get_lineage(child.identity.lineage_id)
				if lineage != null:
					lineage.note_entrenched_mark(String(mark.definition_id), mark.inherited_depth)
	out["inherited_marks"] = inherited

	child.stats.mark_dirty()
	child.stats.initialize_vitals()
	child.visual.refresh()

	_announce_birth(child, sire, gestator, out)
	out["child"] = child
	return out


## Reproductive role at conception. Weighted by what the parents are, so a
## lineage of hermaphrodites tends to stay that way without being forced to.
static func _roll_repro_role(sire: Creature, gestator: Creature,
		rng: RandomNumberGenerator) -> AetherTypes.ReproRole:
	if sire.genetics.genome.repro_role == AetherTypes.ReproRole.BOTH \
			and gestator.genetics.genome.repro_role == AetherTypes.ReproRole.BOTH:
		return AetherTypes.ReproRole.BOTH
	return AetherTypes.ReproRole.GAMETE_A if rng.randf() < 0.5 \
		else AetherTypes.ReproRole.GAMETE_B


## Returns the allele id of the first lethal homozygous pair, or "".
## This is the cost of inbreeding: recessive lethals that hid harmlessly in a
## bloodline for generations start meeting themselves once the pool narrows.
static func _find_lethal_homozygote(genome: GenomeResource) -> String:
	for locus_id in genome.locus_ids():
		if not genome.is_homozygous(locus_id):
			continue
		var allele: AlleleResource = GenomeDB.get_allele(genome.pair_at(locus_id)[0])
		if allele != null and allele.lethal_when_homozygous:
			return String(allele.id)
	return ""


# --- Announcements ------------------------------------------------------------

static func _announce_birth(child: Creature, sire: Creature, gestator: Creature,
		conception: Dictionary) -> void:
	EventBus.creature_born.emit(child.identity.uid, sire.identity.uid, gestator.identity.uid)
	EventBus.breeding_resolved.emit(
		sire.identity.uid, gestator.identity.uid, child.identity.uid, "born")

	var lineage := StoryDirector.get_lineage(child.identity.lineage_id)
	if lineage != null:
		lineage.record_birth(String(child.identity.uid), child.identity.generation)
		lineage.note_planet(child.identity.birth_planet_id)

	# The clan's culture learns that it has a new generation. Consolidation is
	# triggered from here rather than scheduled: a generation advance is
	# something a people does by living long enough, not something a system does
	# to them on a timer.
	var culture := CultureRegistry.culture_for(child)
	CultureRegistry.note_birth(culture.culture_id, child.identity.generation)

	# A birth that carried a mutation is worth remembering; an ordinary one is
	# worth counting. The story layer needs both, weighted differently.
	var mutation_count: int = (conception["mutations"] as Array).size()
	StoryDirector.observe("birth", child.identity.uid, 1.0, {
		"sire": String(sire.identity.uid),
		"dam": String(gestator.identity.uid),
		"mutations": mutation_count,
		"inherited_marks": conception["inherited_marks"],
	}, 0.7 if mutation_count > 0 else 0.2)


static func _announce_failure(a: Creature, b: Creature, note: String) -> void:
	EventBus.breeding_resolved.emit(a.identity.uid if a != null else &"",
		b.identity.uid if b != null else &"", &"", note)
