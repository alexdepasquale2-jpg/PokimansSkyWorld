extends Node
## GenomeDB — the content registry for everything biological and identity-bearing.
##
## Holds the *catalog* (authored, immutable at runtime):
##   chromosomes, loci, alleles, epigenetic mark templates, archetype definitions.
## Per-creature data (GenomeResource, EpigeneticProfileResource, ...) never lives
## here — this is the dictionary those resources' ids point into.
##
## WHY ONE REGISTRY: genomes store ids, not objects. That is what makes a
## creature cheap to serialize, cheap to diff against a sibling, and safe to
## keep a hundred thousand of in cold storage. The cost is that every id lookup
## must go somewhere central, and this is it.
##
## LOADING: catalogs are JSON under res://data/. JSON rather than .tres because
## the schema is large, hand-tuned, and benefits from being diffable and
## generatable by tools. The classes are still Resources, so .tres authoring in
## the editor remains available for one-off content — `register_*` accepts both.

const DATA_ROOT := "res://data/"

const FILE_CHROMOSOMES := DATA_ROOT + "genome/chromosomes.json"
const FILE_LOCI := DATA_ROOT + "genome/loci.json"
const FILE_ALLELES := DATA_ROOT + "genome/alleles.json"
const FILE_EPI_MARKS := DATA_ROOT + "epigenetics/marks.json"
const FILE_ARCHETYPES := DATA_ROOT + "archetypes/archetypes.json"

## Catalogs may also be split across a directory of JSON files. At full schema
## size a single alleles.json is ~150 entries — unreviewable in a diff and
## miserable to merge. Files in these directories are loaded in sorted order
## and merged into the same registry as the single-file form.
const DIR_LOCI := DATA_ROOT + "genome/loci/"
const DIR_ALLELES := DATA_ROOT + "genome/alleles/"

## id -> resource
var chromosomes: Dictionary = {}
var loci: Dictionary = {}
var alleles: Dictionary = {}
var epi_mark_templates: Dictionary = {}
var archetypes: Dictionary = {}

## chromosome_id -> Array[locus_id], sorted by map_position_cm. Rebuilt on load.
var _chromosome_loci: Dictionary = {}
## locus_id -> Array[allele_id], filtered to alleles that actually exist.
var _locus_alleles: Dictionary = {}
## trait_key -> Array[locus_id] that contribute to it. Used by the resolver.
var _trait_contributors: Dictionary = {}
## trait_key -> summed schema baseline. The species' neutral value for a trait,
## before any allele has an opinion. Precomputed because the resolver seeds
## every expression with it.
var _trait_baselines: Dictionary = {}

var loaded: bool = false
var load_problems: Array[String] = []


func _ready() -> void:
	load_catalogs()


# --- Loading ------------------------------------------------------------------

## Loads every catalog file that exists. Missing files are not an error at this
## stage — Phase 0 ships the skeleton, Phase 1 ships the schema content — but
## they are recorded in `load_problems` so nothing fails silently.
func load_catalogs() -> void:
	chromosomes.clear()
	loci.clear()
	alleles.clear()
	epi_mark_templates.clear()
	archetypes.clear()
	load_problems.clear()

	_load_into(FILE_CHROMOSOMES, chromosomes,
		func(d): return ChromosomeDefinitionResource.from_dict(d))
	_load_into(FILE_LOCI, loci,
		func(d): return LocusDefinitionResource.from_dict(d))
	_load_dir(DIR_LOCI, loci,
		func(d): return LocusDefinitionResource.from_dict(d))
	_load_into(FILE_ALLELES, alleles,
		func(d): return AlleleResource.from_dict(d))
	_load_dir(DIR_ALLELES, alleles,
		func(d): return AlleleResource.from_dict(d))
	_load_into(FILE_EPI_MARKS, epi_mark_templates,
		func(d): return EpigeneticMarkResource.from_dict(d))
	_load_into(FILE_ARCHETYPES, archetypes,
		func(d): return ArchetypeDefinitionResource.from_dict(d))

	rebuild_indices()
	loaded = true

	# Report catalogs that ended up EMPTY, rather than individual missing files.
	# A catalog can legitimately be split across a directory instead of a single
	# file, so "file absent" is not news — "nothing loaded at all" is.
	for entry in [["chromosomes", chromosomes], ["loci", loci], ["alleles", alleles],
			["epigenetic marks", epi_mark_templates], ["archetypes", archetypes]]:
		if (entry[1] as Dictionary).is_empty():
			load_problems.append("%s catalog is empty" % entry[0])

	if not load_problems.is_empty():
		print_rich("[color=yellow]GenomeDB loaded with %d note(s):[/color]" % load_problems.size())
		for p in load_problems:
			print("  - ", p)


## Each catalog file is a JSON array of objects, each with an "id" field.
func _load_into(path: String, target: Dictionary, factory: Callable) -> void:
	if not FileAccess.file_exists(path):
		return  # Fine — this catalog may be split across its directory instead.
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_ARRAY:
		load_problems.append("catalog %s is not a JSON array" % path)
		return
	for entry in parsed:
		if typeof(entry) != TYPE_DICTIONARY:
			load_problems.append("non-object entry in %s" % path)
			continue
		var res: Resource = factory.call(entry)
		var id := String(entry.get("id", ""))
		if id.is_empty():
			load_problems.append("entry without id in %s" % path)
			continue
		if target.has(id):
			load_problems.append("duplicate id '%s' in %s" % [id, path])
		target[id] = res


## Loads every *.json in a directory, in sorted order so the merge result is
## deterministic regardless of filesystem enumeration order. A missing
## directory is silently fine — the single-file form may be in use instead.
func _load_dir(dir_path: String, target: Dictionary, factory: Callable) -> void:
	var dir := DirAccess.open(dir_path)
	if dir == null:
		return
	var files := dir.get_files()
	files.sort()
	for file_name in files:
		# Godot renames .json to .json.import in exported builds; accept both.
		if not file_name.ends_with(".json"):
			continue
		_load_into(dir_path + file_name, target, factory)


## Rebuild the derived lookup indices. Call after any runtime registration.
func rebuild_indices() -> void:
	_chromosome_loci.clear()
	_locus_alleles.clear()
	_trait_contributors.clear()
	_trait_baselines.clear()

	for locus_id in loci:
		var locus: LocusDefinitionResource = loci[locus_id]
		var chrom := String(locus.chromosome_id)
		if not _chromosome_loci.has(chrom):
			_chromosome_loci[chrom] = []
		_chromosome_loci[chrom].append(locus_id)

		var legal: Array = []
		for a in locus.allele_ids:
			if alleles.has(String(a)):
				legal.append(String(a))
		_locus_alleles[locus_id] = legal

		for t in locus.trait_keys:
			var key := String(t)
			if not _trait_contributors.has(key):
				_trait_contributors[key] = []
			_trait_contributors[key].append(locus_id)
			# Baselines sum across loci. By schema convention exactly one locus
			# per trait declares a non-zero baseline (the trait's "home" locus)
			# and every other contributor declares 0.0 — otherwise a polygenic
			# trait would inherit its baseline several times over.
			_trait_baselines[key] = float(_trait_baselines.get(key, 0.0)) + locus.baseline(t)

	# Map order matters for recombination, so sort once here rather than in the
	# hot path of every meiosis.
	for chrom in _chromosome_loci:
		_chromosome_loci[chrom].sort_custom(func(a, b):
			return (loci[a] as LocusDefinitionResource).map_position_cm \
				< (loci[b] as LocusDefinitionResource).map_position_cm)


# --- Runtime registration (tests, tools, procedural content) ------------------

func register_chromosome(c: ChromosomeDefinitionResource) -> void:
	chromosomes[String(c.id)] = c


func register_locus(l: LocusDefinitionResource) -> void:
	loci[String(l.id)] = l


func register_allele(a: AlleleResource) -> void:
	alleles[String(a.id)] = a


func register_epi_template(m: EpigeneticMarkResource) -> void:
	epi_mark_templates[String(m.definition_id)] = m


func register_archetype(a: ArchetypeDefinitionResource) -> void:
	archetypes[String(a.id)] = a


# --- Lookup -------------------------------------------------------------------

func get_chromosome(id) -> ChromosomeDefinitionResource:
	return chromosomes.get(String(id))


func get_locus(id) -> LocusDefinitionResource:
	return loci.get(String(id))


func get_allele(id) -> AlleleResource:
	return alleles.get(String(id))


func get_epi_template(definition_id) -> EpigeneticMarkResource:
	return epi_mark_templates.get(String(definition_id))


func get_archetype(id) -> ArchetypeDefinitionResource:
	return archetypes.get(String(id))


## Fresh copy of a mark template, ready to be applied to a creature. Always
## returns a clone — templates must never be mutated by gameplay.
func instantiate_mark(definition_id) -> EpigeneticMarkResource:
	var tmpl: EpigeneticMarkResource = get_epi_template(definition_id)
	return null if tmpl == null else tmpl.clone()


func chromosome_ids_ordered() -> Array:
	var ids := chromosomes.keys()
	ids.sort_custom(func(a, b):
		return (chromosomes[a] as ChromosomeDefinitionResource).display_order \
			< (chromosomes[b] as ChromosomeDefinitionResource).display_order)
	return ids


## Loci on a chromosome, in map order. This is the ordering meiosis walks.
func loci_on_chromosome(chromosome_id) -> Array:
	return _chromosome_loci.get(String(chromosome_id), [])


func legal_alleles_for(locus_id) -> Array:
	return _locus_alleles.get(String(locus_id), [])


func loci_contributing_to(trait_key) -> Array:
	return _trait_contributors.get(String(trait_key), [])


func all_trait_keys() -> Array:
	return _trait_contributors.keys()


## The schema's neutral value for a trait, summed across every locus that
## declares a baseline for it. SILENCE and ENHANCE epigenetic marks need this
## anchor: "silenced" means pulled back toward what the species normally is,
## not pulled to zero.
func trait_baseline(trait_key) -> float:
	return float(_trait_baselines.get(String(trait_key), 0.0))


## Fresh copy of every trait at its schema baseline. The resolver seeds each
## expression with this, so allele contributions read as deviations from the
## species norm rather than as absolute values — which is what makes polygenic
## traits summable at all.
func baseline_traits() -> Dictionary:
	return _trait_baselines.duplicate()


# --- Primitives used by the genetics systems ---------------------------------

## Weighted random allele for a locus. `weight_field` selects which weighting
## to use: "natural_weight" when seeding wild populations, "mutation_weight"
## when a mutation lands. Passing the RNG in keeps generation deterministic.
func roll_allele(locus_id, rng: RandomNumberGenerator,
		weight_field: String = "natural_weight") -> String:
	var candidates: Array = legal_alleles_for(locus_id)
	if candidates.is_empty():
		return ""
	var total := 0.0
	for a in candidates:
		total += maxf(0.0, float((alleles[a] as AlleleResource).get(weight_field)))
	if total <= 0.0:
		return String(candidates[rng.randi() % candidates.size()])
	var pick := rng.randf() * total
	for a in candidates:
		pick -= maxf(0.0, float((alleles[a] as AlleleResource).get(weight_field)))
		if pick <= 0.0:
			return String(a)
	return String(candidates[candidates.size() - 1])


# --- Validation ---------------------------------------------------------------

## Cross-references the whole catalog. Run from the test scene and from a CI
## check — a schema with dangling ids produces creatures that are subtly wrong
## rather than loudly broken, which is the worst failure mode this project has.
func validate_catalog() -> Array[String]:
	var problems: Array[String] = []

	for locus_id in loci:
		var locus: LocusDefinitionResource = loci[locus_id]
		if not chromosomes.has(String(locus.chromosome_id)):
			problems.append("locus '%s' references unknown chromosome '%s'"
				% [locus_id, locus.chromosome_id])
		if locus.allele_ids.is_empty():
			problems.append("locus '%s' has no alleles" % locus_id)
		for a in locus.allele_ids:
			var allele: AlleleResource = get_allele(a)
			if allele == null:
				problems.append("locus '%s' references unknown allele '%s'" % [locus_id, a])
			elif String(allele.locus_id) != String(locus_id):
				problems.append("allele '%s' claims locus '%s' but is listed under '%s'"
					% [a, allele.locus_id, locus_id])
			else:
				# Catch contribution keys the locus never declared: a typo here
				# means a gene that silently does nothing.
				for tkey in allele.contributions:
					if not locus.trait_keys.has(StringName(tkey)):
						problems.append("allele '%s' contributes to undeclared trait '%s'"
							% [a, tkey])

	for chrom_id in chromosomes:
		var chrom: ChromosomeDefinitionResource = chromosomes[chrom_id]
		for l in chrom.locus_ids:
			if not loci.has(String(l)):
				problems.append("chromosome '%s' lists unknown locus '%s'" % [chrom_id, l])
			elif String((loci[String(l)] as LocusDefinitionResource).chromosome_id) != String(chrom_id):
				problems.append("locus '%s' is listed on chromosome '%s' but claims '%s'"
					% [l, chrom_id, (loci[String(l)] as LocusDefinitionResource).chromosome_id])

	for arch_id in archetypes:
		var arch: ArchetypeDefinitionResource = archetypes[arch_id]
		if arch.conditions.is_empty():
			problems.append("archetype '%s' has no crystallization conditions" % arch_id)
		for other in arch.conflicts_with:
			if not archetypes.has(String(other)):
				problems.append("archetype '%s' conflicts with unknown '%s'" % [arch_id, other])

	return problems


func debug_summary() -> String:
	return "GenomeDB: %d chromosomes, %d loci, %d alleles, %d epi templates, %d archetypes" % [
		chromosomes.size(), loci.size(), alleles.size(),
		epi_mark_templates.size(), archetypes.size(),
	]
