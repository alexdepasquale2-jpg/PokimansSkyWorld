extends RefCounted
class_name LoreVoice

## Says what the simulation is doing, in words a player already knows.
##
## THE PROBLEM THIS SOLVES. Aetherline's depth is real and almost all of it was
## invisible in play. The genome, the epigenetic marks, the archetype arcs and
## the shared cultural network were surfaced only in two debug benches, and where
## the game did surface them it surfaced them raw:
##
##     clan lin_00000000_0004 · creature · gen 3 · 412 lessons
##     · lean foraging_priority 14%
##
## Every one of those is a true fact about a running system and none of them is a
## sentence. A player reading that learns nothing except that the developers were
## busy. What they should read is:
##
##     The Vess have gone three generations. They have learned to put finding
##     food ahead of almost everything.
##
## ONE OWNER FOR THE VOCABULARY. The heads-up display, the event feed and the
## People menu all describe the same systems, and if each phrased things its own
## way the game would appear to contradict itself — the feed saying the clan grew
## bolder while the menu still called them timid. Every player-facing sentence
## about genetics, epigenetics, archetypes or culture comes from this file.
##
## PROGRESSIVE DISCLOSURE IS A RULE, NOT A STYLE. Nothing here prints a raw id, a
## weight, a probability or a tick. Those are real and worth showing, and they
## live one keystroke deeper, in the People menu's advanced view. The surface
## says what happened; the menu says exactly how much.
##
## WRITE FOR SOMEBODY WHO WILL NEVER READ THE README. If a line only makes sense
## once you know what a softmax is, it is the wrong line.

# --- Drives ---------------------------------------------------------------------

## What each drive is called, and what it sounds like when it rises or falls.
##
## The catalog already carries a `display_name`; these are the *verbs*, which the
## catalog has no business knowing about because they are presentation.
const DRIVE_VOICE := {
	"fear": {"noun": "caution", "up": "more careful", "down": "braver"},
	"aggression": {"noun": "aggression", "up": "quicker to fight", "down": "slower to anger"},
	"rest_urge": {"noun": "rest", "up": "readier to stop and recover", "down": "harder-driving"},
	"foraging_priority": {"noun": "hunger", "up": "more single-minded about food",
		"down": "less preoccupied with food"},
	"curiosity": {"noun": "curiosity", "up": "more curious", "down": "less inclined to wander"},
	"vigilance": {"noun": "watchfulness", "up": "more watchful", "down": "less wary"},
	"protectiveness": {"noun": "protectiveness", "up": "quicker to stand over each other",
		"down": "less willing to take a hit for anyone"},
	"social_bonding": {"noun": "closeness", "up": "closer to one another",
		"down": "more solitary"},
	"industry": {"noun": "industry", "up": "readier to gather for the whole clan",
		"down": "less willing to work for others"},
	"migration_urge": {"noun": "restlessness", "up": "readier to move on",
		"down": "more settled"},
	"play": {"noun": "play", "up": "more playful", "down": "more serious"},
	"tool_confidence": {"noun": "handiness", "up": "readier to reach for a tool",
		"down": "less interested in tools"},
}

## How strong a drive has to be, as a share of the whole policy, before it is
## worth describing as a defining trait rather than background noise.
const DEFINING_SHARE: float = 0.14
const STRONG_SHARE: float = 0.22


static func drive_noun(drive_id: String) -> String:
	var voice: Dictionary = DRIVE_VOICE.get(drive_id, {})
	if not voice.is_empty():
		return String(voice["noun"])
	# Unknown drive: fall back to the catalog's display name rather than the id,
	# so a designer adding a drive gets readable text before writing any voice.
	var definition := GenomeDB.get_drive(drive_id)
	return String(definition.get("display_name", drive_id)).to_lower()


## "Your people are growing braver." Built from a signed change in one drive.
static func shift_sentence(clan_name: String, drive_id: String, delta: float) -> String:
	var voice: Dictionary = DRIVE_VOICE.get(drive_id, {})
	var direction := "up" if delta > 0.0 else "down"
	var phrase := String(voice.get(direction, "")) if not voice.is_empty() else ""
	if phrase.is_empty():
		phrase = "%s %s" % [
			"more" if delta > 0.0 else "less", drive_noun(drive_id)]
	var strength := "markedly " if absf(delta) >= 0.12 else ""
	return "The %s are becoming %s%s." % [the(clan_name), strength, phrase]


## The clan in one line: what they are most and least inclined to do.
##
## Deliberately never a number. "Cautious, and close to one another" tells a
## player what to expect from their people; "fear 0.19, social_bonding 0.16"
## tells them the developer used a softmax.
static func disposition(culture: CultureResource) -> String:
	if culture == null:
		return "a people with no history yet"
	culture.ensure_nets()
	var report := culture.drive_report()
	if report.is_empty():
		return "a people with no history yet"

	var defining: Array[String] = []
	for entry in report:
		var share := float(entry["p"])
		if share < DEFINING_SHARE:
			break
		var noun := drive_noun(String(entry["drive"]))
		defining.append(("deep " + noun) if share >= STRONG_SHARE else noun)
		if defining.size() >= 2:
			break

	if defining.is_empty():
		# A young clan genuinely has no opinions yet, and saying so is more
		# honest — and more interesting — than inventing a personality.
		return "no strong habits yet — they are still finding out what works"
	if defining.size() == 1:
		return defining[0]
	return "%s, and %s" % [defining[0], defining[1]]


## How settled the clan's opinions are, in plain terms. Reads the same entropy
## the drift chart plots, and never says the word entropy.
static func conviction(culture: CultureResource) -> String:
	if culture == null or culture.live == null:
		return "unformed"
	culture.refresh_mean_policy()
	var spread := CultureNet.entropy(culture.mean_policy)
	var ceiling := CultureNet.max_entropy(culture.live.out_size)
	if ceiling <= 0.0:
		return "unformed"
	var certainty := 1.0 - spread / ceiling
	if certainty < 0.02:
		return "open to anything"
	if certainty < 0.08:
		return "forming habits"
	if certainty < 0.20:
		return "set in their ways"
	return "hard to teach anything new"


## The headline a menu or HUD shows for a whole people.
static func clan_headline(culture: CultureResource) -> String:
	if culture == null:
		return "No clan"
	return "%s — %s" % [clan_name(culture), disposition(culture)]


## A clan name with exactly one definite article, whatever the author wrote.
##
## Clans are named from two directions — authored ("The Tellani") and generated
## ("Survivors", "Kel-9 herd 2") — and a sentence template that prepends "the"
## produces "The The Tellani" for the first and reads wrong without it for the
## second. One helper, so no caller has to know which kind of name it holds.
static func the(name: String) -> String:
	var lowered := name.to_lower()
	if lowered.begins_with("the "):
		return name.substr(4)
	return name


static func clan_name(culture: CultureResource) -> String:
	if culture == null:
		return "the clan"
	if not culture.display_name.is_empty():
		return culture.display_name
	return culture.culture_id


## "Three generations, and they have learned a great deal." The experience line.
static func clan_history(culture: CultureResource) -> String:
	if culture == null:
		return ""
	var generations := culture.generation
	var lessons: int = culture.live.applies if culture.live != null else 0

	var age := "newly founded"
	if generations == 1:
		age = "one generation deep"
	elif generations > 1:
		age = "%d generations deep" % generations

	var learning := "nothing has taught them anything yet"
	if lessons > 2000:
		learning = "they have learned a great deal"
	elif lessons > 500:
		learning = "they are learning steadily"
	elif lessons > 0:
		learning = "they are beginning to learn"
	return "%s; %s" % [age, learning]


# --- Creatures --------------------------------------------------------------------

## Traits worth describing, and what an unusual value sounds like. Only traits a
## player can act on: this is a character sketch, not a stat block.
const TRAIT_VOICE := {
	"mass": {"high": "heavy-framed", "low": "light-framed"},
	"size": {"high": "outsized", "low": "small"},
	"agility": {"high": "quick", "low": "ponderous"},
	"stamina": {"high": "tireless", "low": "easily winded"},
	"armor": {"high": "thick-hided", "low": "thin-skinned"},
	"aggression": {"high": "short-tempered", "low": "placid"},
	"boldness": {"high": "fearless", "low": "skittish"},
	"curiosity": {"high": "inquisitive", "low": "incurious"},
	"sociability": {"high": "gregarious", "low": "aloof"},
	"empathy": {"high": "tender", "low": "indifferent"},
	"loyalty": {"high": "devoted", "low": "faithless"},
	"scent": {"high": "keen-nosed", "low": "scent-blind"},
	"sight": {"high": "sharp-eyed", "low": "weak-eyed"},
	"hearing": {"high": "sharp-eared", "low": "hard of hearing"},
	"night_sight": {"high": "night-sighted", "low": ""},
	"cold_tolerance": {"high": "built for cold", "low": "cold-hating"},
	"heat_tolerance": {"high": "built for heat", "low": "heat-hating"},
	"forage": {"high": "a natural forager", "low": "a poor forager"},
	"craft": {"high": "deft-handed", "low": "clumsy"},
	"fertility": {"high": "strongly fertile", "low": "barely fertile"},
	"lifespan": {"high": "long-lived", "low": "short-lived"},
	"regeneration": {"high": "quick to heal", "low": "slow to heal"},
	"toxin_resist": {"high": "poison-proof", "low": "easily poisoned"},
}

## How far from the species norm a trait must sit before it is worth remarking on.
const NOTABLE_DEVIATION: float = 0.28


## A character sketch: the two or three ways this animal is not ordinary.
##
## Reads the RESOLVED phenotype, so a creature bred placid and traumatised into
## aggression is described as the animal it has become — the same invariant the
## AI has honoured since Phase 0.
static func creature_blurb(creature: Node, limit: int = 3) -> String:
	if creature == null or creature.stats == null:
		return "an ordinary animal"
	var traits: Dictionary = creature.stats.phenotype()
	var ranked: Array = []
	for key in TRAIT_VOICE:
		if not traits.has(key):
			continue
		var deviation := float(traits[key]) - GenomeDB.trait_baseline(key)
		if absf(deviation) < NOTABLE_DEVIATION:
			continue
		var phrase := String(TRAIT_VOICE[key]["high" if deviation > 0.0 else "low"])
		if phrase.is_empty():
			continue
		ranked.append({"phrase": phrase, "weight": absf(deviation)})

	ranked.sort_custom(func(a, b): return float(a["weight"]) > float(b["weight"]))
	var parts: Array[String] = []
	for entry in ranked.slice(0, limit):
		parts.append(String(entry["phrase"]))
	if parts.is_empty():
		return "unremarkable in every way, which is its own kind of luck"
	# Not `capitalize()`: it title-cases every word and eats hyphens, turning
	# "thick-hided, poison-proof" into "Thick Hided, Poison Proof".
	var sentence := ", ".join(parts)
	return sentence.substr(0, 1).to_upper() + sentence.substr(1) + "."


## What this creature is on its way to becoming, if anything. The archetype
## system's progress, said as a fate rather than a percentage.
static func creature_becoming(creature: Node) -> String:
	if creature == null or creature.archetype == null or creature.archetype.state == null:
		return ""
	var state: ArchetypeStateResource = creature.archetype.state
	for archetype_id in state.active_archetypes():
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		if definition != null:
			return "It is %s." % definition.display_name
	var best_id := ""
	var best := 0.0
	for archetype_id in state.progress:
		if state.is_crystallized(archetype_id):
			continue
		var progress: float = state.get_progress(archetype_id)
		if progress > best:
			best = progress
			best_id = String(archetype_id)
	if best < 0.25 or best_id.is_empty():
		return ""
	var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(best_id)
	var name := definition.display_name if definition != null else best_id
	if best >= 0.75:
		return "It is very nearly %s." % name
	return "Something of %s is stirring in it." % name


## Condition, from needs. The line a player reads before deciding whether to
## bring this animal along.
static func creature_condition(creature: Node) -> String:
	if creature == null or creature.needs == null:
		return ""
	var needs: NeedsComponent = creature.needs
	if needs.health <= 0.0:
		return "Dead."
	var worst_word := ""
	var worst := 1.0
	for pair in [["starving", needs.hunger], ["exhausted", needs.energy],
			["badly hurt", needs.health]]:
		if float(pair[1]) < worst:
			worst = float(pair[1])
			worst_word = String(pair[0])
	if worst > 0.7:
		return "In good condition."
	if worst > 0.4:
		return "Wearing down."
	if worst > NeedsComponent.CRITICAL_THRESHOLD:
		return "In a bad way — %s." % worst_word
	return "Close to death — %s." % worst_word


# --- Events ------------------------------------------------------------------------

## A gene changed in the bloodline. Said as inheritance, not as a diff.
static func mutation_sentence(name: String, locus_id: String) -> String:
	var locus: LocusDefinitionResource = GenomeDB.get_locus(locus_id)
	var what := locus.display_name.to_lower() if locus != null else "something"
	return "%s was born with a change in its %s." % [name, what]


## The world left a mark. This is the epigenetics system announcing itself, and
## it is the one players find most surprising, so it says plainly that this is
## the environment doing the writing.
static func mark_sentence(name: String, definition_id: String) -> String:
	var template: EpigeneticMarkResource = GenomeDB.get_epi_template(definition_id)
	var what := template.display_name.to_lower() if template != null else "a change"
	return "This place is marking %s: %s." % [name, what]


static func generation_sentence(culture: CultureResource, retained: float) -> String:
	var kept := "most of what they knew"
	if retained < 0.5:
		kept = "little of what they knew"
	elif retained < 0.85:
		kept = "much of what they knew"
	return "A generation of the %s has turned over, carrying %s." % [
		the(clan_name(culture)), kept]


## A colony was left behind and is now its own people. The payoff line for the
## whole culture-forking mechanism, and worth saying clearly.
static func fork_sentence(parent_name: String, reason: String) -> String:
	if reason == "merge":
		return "The %s have taken the returning clan back in." % the(parent_name)
	return "Those left behind are no longer the %s. They will become their own people." \
		% the(parent_name)


static func crystallized_sentence(name: String, archetype_id: String) -> String:
	var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
	var what := definition.display_name if definition != null else archetype_id
	return "%s has become %s." % [name, what]


# --- Advanced view ------------------------------------------------------------------

## The numbers, for the menu that asks for them.
##
## This is the OTHER half of progressive disclosure and it matters as much as the
## plain language: a player who wants the raw policy should be able to reach it
## without a debug build. Everything above hides the machine; this shows it.
static func advanced_lines(culture: CultureResource) -> Array[String]:
	var lines: Array[String] = []
	if culture == null:
		return lines
	culture.ensure_nets()
	culture.refresh_mean_policy()

	lines.append("clan id            %s" % culture.culture_id)
	lines.append("generation         %d   (high water %d)" % [
		culture.generation, culture.high_water_generation])
	lines.append("members            %d" % culture.member_count)
	lines.append("lessons applied    %d" % culture.live.applies)
	lines.append("network            %s" % culture.live.debug_summary())
	lines.append("exploration        %.2f  (anneals toward %.2f)" % [
		culture.temperature(), culture.temperature_min])
	lines.append("conviction         %.3f of %.3f possible" % [
		CultureNet.entropy(culture.mean_policy),
		CultureNet.max_entropy(culture.live.out_size)])
	lines.append("drift from forebears  %.5f per weight" % (
		culture.live.mean_abs_difference(culture.locked)))
	lines.append("")
	lines.append("%-20s %7s  %7s" % ["drive", "share", "bias"])
	for entry in culture.drive_report():
		lines.append("%-20s %6.1f%%  %+7.2f" % [
			drive_noun(String(entry["drive"])),
			float(entry["p"]) * 100.0, float(entry["bias"])])

	if not culture.reward_tally.is_empty():
		lines.append("")
		lines.append("what has been teaching them")
		var kinds: Array = culture.reward_tally.keys()
		kinds.sort_custom(func(a, b):
			return absf(float(culture.reward_tally[a])) > absf(float(culture.reward_tally[b])))
		for kind in kinds.slice(0, 8):
			lines.append("  %-26s %+8.1f" % [
				String(kind).replace("_", " "), culture.reward_tally[kind]])
	return lines
