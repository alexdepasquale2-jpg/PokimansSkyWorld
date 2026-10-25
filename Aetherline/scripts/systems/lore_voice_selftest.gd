extends RefCounted
class_name LoreVoiceSelfTest

## Validates that the game can explain itself.
##
## THE FAILURE THIS EXISTS TO CATCH is not a crash. It is a line like
## "lean foraging_priority 14%" reaching a player, or — worse — a blank space
## where a sentence should be, because somebody added a drive to the catalog and
## the vocabulary never heard about it. Both look fine in code review and both
## make the deepest systems in the game read as noise.
##
## So the assertions come in two halves, and they pull in opposite directions on
## purpose:
##
##   the plain view must contain NO machine vocabulary — no ids, no digits, no
##   underscores, nothing a player would have to be taught to read;
##
##   the advanced view must contain PLENTY — if "show the numbers" shows no
##   numbers, progressive disclosure has collapsed into just hiding things.
##
## A system that cannot be described is indistinguishable from one that is not
## running, which is the entire risk this project carries.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()

var stats: Array[String] = []


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	stats.clear()
	_rng.seed = 20260806

	_test_every_drive_has_a_voice()
	_test_every_deed_has_a_voice()
	_test_plain_view_has_no_machine_vocabulary(parent)
	_test_advanced_view_actually_discloses()
	_test_event_sentences()
	_test_panel(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Vocabulary coverage -----------------------------------------------------------

## Every drive the catalog defines must be sayable, rising and falling.
##
## This is the assertion that protects a designer from themselves: add a drive to
## drives.json, forget the voice, and the game silently starts telling players
## "The Vess are becoming more tool_confidence."
func _test_every_drive_has_a_voice() -> void:
	var voiceless: Array[String] = []
	var one_directional: Array[String] = []
	for i in GenomeDB.drive_count():
		var drive_id := GenomeDB.drive_id_at(i)
		if not LoreVoice.DRIVE_VOICE.has(drive_id):
			voiceless.append(drive_id)
			continue
		var voice: Dictionary = LoreVoice.DRIVE_VOICE[drive_id]
		if String(voice.get("up", "")).is_empty() or String(voice.get("down", "")).is_empty():
			one_directional.append(drive_id)
	_check("voice: every drive in the catalog can be spoken (%s)"
		% ("all %d" % GenomeDB.drive_count() if voiceless.is_empty()
			else ", ".join(voiceless)), voiceless.is_empty())
	_check("voice: and can be spoken both rising and falling",
		one_directional.is_empty())

	# An unknown drive must degrade to the catalog's display name, never to a
	# raw id and never to nothing.
	var fallback := LoreVoice.drive_noun("drive_that_does_not_exist")
	_check("voice: an unknown drive still says something", not fallback.is_empty())


## Every experience kind must be sayable as a thing somebody DID.
##
## The same protection as the drive walk above, guarding the half of the neuronal
## loop that had no voice at all until now: energy was earned on a debug trace,
## so a player could only find out what feeds the tree by reading the source.
## Now every kind that can pay has a sentence, and forgetting one fails here
## instead of shipping "None of them had ever near_death_survived."
func _test_every_deed_has_a_voice() -> void:
	var voiceless: Array[String] = []
	var machine_readable: Array[String] = []
	for kind in GenomeDB.rewards:
		var id := String(kind)
		if not LoreVoice.DEED_VOICE.has(id):
			voiceless.append(id)
			continue
		for was_first in [true, false]:
			var sentence := LoreVoice.energy_sentence(id, was_first)
			if sentence.is_empty() or sentence.contains("_"):
				machine_readable.append(id)
				break

	_check("voice: every experience kind can be spoken as a deed (%s)"
		% ("all %d" % GenomeDB.rewards.size() if voiceless.is_empty()
			else ", ".join(voiceless)), voiceless.is_empty())
	_check("voice: and none of them leaks an id into the sentence",
		machine_readable.is_empty())

	# The two reasons energy is earned must not read alike, or the player cannot
	# tell "nobody has ever done this" from "somebody survived that again".
	_check("voice: a discovery and a survival read differently",
		LoreVoice.energy_sentence("forage_success", true)
			!= LoreVoice.energy_sentence("forage_success", false))

	# And an unrecognised kind must still be a sentence, because the reward
	# catalog is data and data outruns tables.
	var unknown := LoreVoice.energy_sentence("kind_that_does_not_exist", true)
	_check("voice: an unknown deed still narrates",
		not unknown.is_empty() and not unknown.contains("_"))

	stats.append("  discovery:   %s" % LoreVoice.energy_sentence("anomaly_investigated", true))
	stats.append("  survival:    %s" % LoreVoice.energy_sentence("near_death_survived", false))


# --- The plain view ------------------------------------------------------------------

func _test_plain_view_has_no_machine_vocabulary(parent: Node) -> void:
	CultureRegistry.reset(20260806)
	CultureRegistry.install(20260806)
	var creature := CreatureFactory.spawn_random(parent, _rng,
		{"culture_id": "clan_voice", "name": "Tellan"})
	var culture := CultureRegistry.ensure("clan_voice", "The Tellani")
	culture.ensure_nets()

	# Teach it something so the disposition is not the empty-clan special case.
	var router := CultureRewardRouter.new()
	parent.add_child(router)
	for _i in 90:
		creature.ai.decide_from(Perception.compose(creature), true)
		router.route_creature(creature, "forage_success", 1.0, 1600)
		creature.ai.clear_trace()
	culture.maybe_apply(true)

	var surfaces := {
		"disposition": LoreVoice.disposition(culture),
		"conviction": LoreVoice.conviction(culture),
		"clan headline": LoreVoice.clan_headline(culture),
		"clan history": LoreVoice.clan_history(culture),
		"creature blurb": LoreVoice.creature_blurb(creature),
		"condition": LoreVoice.creature_condition(creature),
		"shift": LoreVoice.shift_sentence("The Tellani", "curiosity", 0.14),
	}

	for label in surfaces:
		_check("plain: %s says something" % label, not String(surfaces[label]).is_empty())

	# The machine must not show through.
	var leaks: Array[String] = []
	for label in surfaces:
		var text := String(surfaces[label])
		if text.contains("_"):
			leaks.append("%s has an id-shaped word" % label)
		for jargon in ["softmax", "logit", "weight", "tensor", "policy", "gradient",
				"culture_", "clan_", "drive_", "PackedFloat"]:
			if text.to_lower().contains(jargon.to_lower()):
				leaks.append("%s contains '%s'" % [label, jargon])
	_check("plain: no machine vocabulary reaches the player (%s)"
		% ("clean" if leaks.is_empty() else "; ".join(leaks)), leaks.is_empty())

	# Numbers are the subtler leak: a percentage reads as a stat block and is
	# exactly what the old in-game readout got wrong.
	var numeric: Array[String] = []
	for label in ["disposition", "conviction", "creature blurb", "condition", "shift"]:
		var text := String(surfaces[label])
		for digit in ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "%"]:
			if text.contains(digit):
				numeric.append(label)
				break
	_check("plain: no raw numbers in the prose (%s)"
		% ("clean" if numeric.is_empty() else ", ".join(numeric)), numeric.is_empty())

	# A brand-new clan must say so rather than inventing a personality.
	var fresh := CultureRegistry.ensure("clan_fresh", "The Unproven")
	fresh.ensure_nets()
	var fresh_words := LoreVoice.disposition(fresh)
	_check("plain: a clan with no history admits it",
		fresh_words.contains("without strong habits")
			or fresh_words.contains("no history"))
	# And it has to COMPLETE the sentence the screens wrap it in. Both the
	# People panel and the HUD write "They are %s." — the previous wording gave
	# a player "They are no strong habits yet", which no assertion could see
	# because it is not an id, not a digit and not blank. A rendered screenshot
	# found it.
	_check("plain: and the disposition completes 'They are ___'",
		not fresh_words.begins_with("no ") and not fresh_words.begins_with("a people"))

	stats.append("  disposition:  %s" % surfaces["disposition"])
	stats.append("  history:      %s" % surfaces["clan history"])
	stats.append("  a creature:   %s" % surfaces["creature blurb"])
	stats.append("  a shift:      %s" % surfaces["shift"])

	# Freed now rather than queued: see the note in CultureSelfTest. A router that
	# outlives its suite doubles the rewards of every suite that follows it.
	router.free()
	creature.queue_free()


# --- The advanced view -----------------------------------------------------------------

## The other half of the promise. Hiding the machine is only defensible if the
## machine is one keystroke away.
func _test_advanced_view_actually_discloses() -> void:
	var culture := CultureRegistry.ensure("clan_voice")
	var lines := LoreVoice.advanced_lines(culture)
	_check("advanced: there is an advanced view at all", lines.size() >= 8)

	var joined := "\n".join(lines)
	var digits := 0
	for character in joined:
		if character in "0123456789":
			digits += 1
	_check("advanced: it is full of the numbers the prose refused (%d digits)"
		% digits, digits > 40)

	for expected in ["generation", "drive", "share", "clan id"]:
		_check("advanced: it reports %s" % expected, joined.to_lower().contains(expected))

	# Every drive must be listed, or the advanced view is also an abstraction.
	var listed := 0
	for i in GenomeDB.drive_count():
		if joined.contains(LoreVoice.drive_noun(GenomeDB.drive_id_at(i))):
			listed += 1
	_check("advanced: every drive is accounted for (%d of %d)"
		% [listed, GenomeDB.drive_count()], listed == GenomeDB.drive_count())

	_check("advanced: a missing clan does not crash the menu",
		LoreVoice.advanced_lines(null).is_empty())


# --- Event narration -------------------------------------------------------------------

func _test_event_sentences() -> void:
	var culture := CultureRegistry.ensure("clan_voice")
	var sentences := {
		"mutation": LoreVoice.mutation_sentence("Vess", "sens_vision"),
		"mark": LoreVoice.mark_sentence("Vess", GenomeDB.epi_mark_templates.keys()[0]
			if not GenomeDB.epi_mark_templates.is_empty() else "epi_unknown"),
		"generation": LoreVoice.generation_sentence(culture, 0.9),
		"fork": LoreVoice.fork_sentence("The Tellani", "left_behind"),
		"merge": LoreVoice.fork_sentence("The Tellani", "merge"),
		"crystallized": LoreVoice.crystallized_sentence("Vess", "arch_guardian"),
	}
	for label in sentences:
		var text := String(sentences[label])
		_check("events: %s produces a sentence" % label,
			not text.is_empty() and text.ends_with("."))
		_check("events: %s names no raw id" % label, not text.contains("_"))

	# The two directions of a fork must not read the same, or the player cannot
	# tell a colony being lost from one being taken back.
	_check("events: splitting and reuniting read differently",
		sentences["fork"] != sentences["merge"])

	# Unknown ids must still yield a sentence rather than a blank line.
	_check("events: an unknown archetype still narrates",
		not LoreVoice.crystallized_sentence("Vess", "arch_nonexistent").is_empty())

	for label in sentences:
		stats.append("  %-12s %s" % [label + ":", sentences[label]])


# --- The panel -------------------------------------------------------------------------

func _test_panel(parent: Node) -> void:
	var session := GameSession.new()
	parent.add_child(session)
	var creature := CreatureFactory.spawn_random(parent, _rng,
		{"culture_id": "clan_voice", "name": "Marnis"})
	session.enroll(creature)
	session.party.accept(creature, session.ship)

	var panel := PeoplePanel.new()
	parent.add_child(panel)
	var problems := panel.run_smoke_test(session)
	_check("panel: Your People opens, hides the machine, then shows it on request (%s)"
		% ("clean" if problems.is_empty() else "; ".join(problems)), problems.is_empty())

	panel.queue_free()
	creature.queue_free()
	session.queue_free()
	CultureRegistry.reset()


# --- Harness ---------------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
