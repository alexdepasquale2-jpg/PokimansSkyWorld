extends RefCounted
class_name AetherTypes

## Shared enumerations and small helpers used across every Aetherline system.
##
## These live in one place because they are referenced by serialized data.
## RULE: never reorder or remove an enum entry once it has shipped in a save —
## always append. The integer value is what lands on disk.
## (Where practical, resources serialize the *string* name instead of the int
## so that reordering is survivable; see `enum_to_key` / `key_to_enum`.)


## Broad functional grouping of a locus. Drives UI grouping, mutation
## weighting, and which systems bother to read a given gene.
enum GeneCategory {
	MORPHOLOGY,      ## Size, body plan, limb count, silhouette.
	METABOLISM,      ## Diet, energy efficiency, temperature tolerance.
	SENSORY,         ## Sight, scent, hearing, exotic senses.
	COMBAT,          ## Base combat stats and innate move availability.
	WORK,            ## Labour aptitudes (haul, build, farm, tend, craft).
	BEHAVIOR,        ## Predispositions: aggression, sociability, curiosity.
	SPECIAL,         ## Rare ability slots (bioluminescence, phase, venom...).
	MUTATION,        ## Modifiers to the creature's own mutation machinery.
	REPRODUCTION,    ## Fertility, gestation, clutch size.
	LONGEVITY,       ## Ageing curve, senescence resistance.
}


## How the two alleles at a locus combine into an expressed value.
enum ExpressionMode {
	DOMINANT,        ## Highest-dominance allele wins outright.
	INCOMPLETE,      ## Dominance-weighted blend of both alleles.
	CODOMINANT,      ## Both expressed fully and simultaneously (sum).
	ADDITIVE,        ## Simple average — the workhorse for polygenic traits.
	RECESSIVE_GATE,  ## Effect only fires when both alleles carry the tag.
}


## Where an epigenetic mark came from. Determines default stability,
## heritability, and how the StoryDirector narrates it.
enum EpiSource {
	ENVIRONMENT,     ## Ambient planetary pressure (cold, radiation, gravity).
	DIET,            ## What the creature habitually eats.
	STRESS,          ## Chronic stress and acute trauma.
	WORK,            ## Repeated labour of a given kind.
	SOCIAL,          ## Bonds, isolation, herd dynamics.
	COMBAT,          ## Fighting, wounds, victory, defeat.
	TRAINING,        ## Deliberate player-directed conditioning.
	RESEARCH,        ## Lab-induced marks (highest heritability, unlocked later).
}


## How a mark alters the expression of its target.
enum EpiEffect {
	ADD,             ## Flat offset to the expressed value.
	MULTIPLY,        ## Scalar on the expressed value.
	SILENCE,         ## Suppress toward the trait's baseline.
	ENHANCE,         ## Amplify deviation from baseline (makes extremes extremer).
	UNLOCK,          ## Gate open a latent ability the genome carries but hides.
}


## Lifecycle of an archetype on a given creature.
enum ArchetypeStage {
	DORMANT,         ## Not being tracked meaningfully yet.
	STIRRING,        ## Progress has begun; hints appear in UI.
	EMERGENT,        ## Over halfway; AI starts to bias.
	CRYSTALLIZED,    ## Locked in. Grants abilities and narrative weight.
	SHATTERED,       ## Was crystallized, then broken by catastrophe.
}


## Fidelity at which a creature is being simulated this frame.
## SimulationBudget assigns these; every system must honour them.
enum SimLOD {
	FULL,            ## On-screen, active planet: full AI, physics, needs.
	NEAR,            ## Active planet, off-screen: coarse AI ticks.
	ABSTRACT,        ## Active planet, far: statistical needs only.
	DORMANT,         ## Left behind on another planet: batch-updated on visit.
	FROZEN,          ## Archived; only summary data is retained in memory.
}


## Reproductive role. Deliberately not "sex" — Aetherline species vary, and
## some lineages are monomorphic or budding.
enum ReproRole {
	NONE,            ## Does not reproduce sexually.
	GAMETE_A,        ## Conventionally "male"-analogue contributor.
	GAMETE_B,        ## Conventionally "female"-analogue contributor / gestator.
	BOTH,            ## Hermaphroditic; can fill either role.
}


## --- Enum <-> string helpers -------------------------------------------------
## Saves store enum *names*, so inserting a value mid-enum never corrupts data.

static func enum_to_key(enum_dict: Dictionary, value: int) -> String:
	for key in enum_dict:
		if enum_dict[key] == value:
			return String(key)
	return ""


static func key_to_enum(enum_dict: Dictionary, key: String, fallback: int = 0) -> int:
	return int(enum_dict.get(key, fallback))


## --- 64-bit integer serialization -------------------------------------------
##
## Godot's JSON parser returns EVERY number as a double. Integers above 2^53
## therefore come back mangled: 841540765408843384 parses as ...392. Planet
## seeds are full 64-bit values and are the single source of truth for world
## regeneration, so a seed that shifts by 8 across a save/load silently
## regenerates a completely different world — with the player's outpost and
## left-behind creatures still attached to it.
##
## Every 64-bit quantity that touches JSON must go through these. They store the
## value as a decimal string, which String.to_int() parses back at full int64
## precision.

const EXACT_FLOAT_LIMIT: float = 9007199254740992.0  ## 2^53


static func i64_to_json(value: int) -> String:
	return str(value)


static func i64_from_json(value: Variant, fallback: int = 0) -> int:
	match typeof(value):
		TYPE_STRING, TYPE_STRING_NAME:
			return String(value).to_int()
		TYPE_INT:
			return int(value)
		TYPE_FLOAT:
			# Reached only via hand-edited or pre-fix data. Precision is already
			# gone by this point, so say so loudly rather than quietly handing
			# back a subtly wrong universe.
			if absf(float(value)) > EXACT_FLOAT_LIMIT:
				push_warning(
					"i64_from_json: %.0f exceeds exact float range; precision already lost."
					% value)
			return int(value)
		_:
			return fallback
