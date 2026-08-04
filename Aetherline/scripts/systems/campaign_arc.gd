extends RefCounted
class_name CampaignArc

## What the run is *for*, and how it ends.
##
## THE GAP THIS FILLS. Everything else in this project simulates beautifully and
## none of it was going anywhere. There was no win condition, no fail state and
## no ending: `GameSession` counted days and jumps and nothing consumed either,
## the menu promised "carry a bloodline across an infinite scatter of worlds",
## and nothing defined carrying it well or carrying it badly. A player could do
## everything right or nothing at all and the game responded identically.
##
## Worse, the absence quietly disarmed the best mechanic in the game. The
## neuronal tree loses understandings a clan is too few to support — but nobody
## could die of neglect, so member count only ever rose, and the loss branch was
## unreachable. Stakes are not a layer on top of a simulation; without them
## several of its systems are decorative.
##
## THE SPINE, and it is deliberately made of parts that already existed:
##
##   the ambition   take the lineage through EVOLUTION_LEAPS_TO_WIN leaps.
##                  Leaps already existed and already required understandings
##                  that a thin clan cannot hold. Aiming at them makes every
##                  other system load-bearing.
##
##   the failure    the last member of your clan dies. The lineage ends, and
##                  because lineage is what this game has always been about, that
##                  is the correct and only real loss.
##
## ONE OUTCOME PER RUN. `campaign_ended` fires exactly once; the arc latches. A
## run that wins and is then wiped out has won — you do not lose a thing you
## already carried across.

enum Outcome { UNRESOLVED, TRIUMPH, EXTINCTION }

## Leaps the lineage must cross to have carried the bloodline somewhere.
##
## Three rather than one: a single leap is an accident of a good afternoon, and
## the point of the fantasy is the long haul. Three is roughly eighteen locked
## understandings and the generations it takes to hold them.
const EVOLUTION_LEAPS_TO_WIN: int = 3

## Below this many living clan members, the clan is dying rather than merely
## thinned — a warning, not yet an ending.
const DIRE_MEMBERS: int = 2

var clan_id: String = ""
var outcome: Outcome = Outcome.UNRESOLVED
var resolved_tick: int = -1

## Set once the clan has ever had somebody in it. Without this, a campaign would
## register extinction in the frame before its first creature spawns.
var _ever_lived: bool = false
var _warned_dire: bool = false

## What this lineage did, for the ending to read back.
var peak_members: int = 0
var deaths: int = 0
var generations: int = 0


func _init(id: String = "") -> void:
	clan_id = id


func is_resolved() -> bool:
	return outcome != Outcome.UNRESOLVED


# --- The ambition ---------------------------------------------------------------

func leaps_taken() -> int:
	return NeuronalTree.for_clan(clan_id).leaps


func leaps_remaining() -> int:
	return maxi(0, EVOLUTION_LEAPS_TO_WIN - leaps_taken())


## 0..1 toward the ambition, counting progress within the current leap so the
## bar moves during the long stretches between crossings.
func progress() -> float:
	var tree := NeuronalTree.for_clan(clan_id)
	# Whole leaps, plus how far into the next one the clan has locked.
	var whole := float(tree.leaps)
	var within := clampf(float(tree.understandings_since_leap())
		/ float(NeuronalTree.LEAP_THRESHOLD), 0.0, 1.0)
	return clampf((whole + within) / float(EVOLUTION_LEAPS_TO_WIN), 0.0, 1.0)


# --- Evaluation -------------------------------------------------------------------

## Called whenever the clan's living strength may have changed. `living` is how
## many members are actually alive right now.
##
## Returns the outcome if this call resolved the run, otherwise UNRESOLVED.
func evaluate(living: int, generation: int = 0) -> Outcome:
	if is_resolved():
		return Outcome.UNRESOLVED

	generations = maxi(generations, generation)
	if living > 0:
		_ever_lived = true
		peak_members = maxi(peak_members, living)

	if leaps_taken() >= EVOLUTION_LEAPS_TO_WIN:
		return _resolve(Outcome.TRIUMPH)

	if _ever_lived and living <= 0:
		return _resolve(Outcome.EXTINCTION)

	# A warning, once, while there is still time to do something about it.
	if _ever_lived and living <= DIRE_MEMBERS and not _warned_dire:
		_warned_dire = true
		EventBus.lineage_imperilled.emit(clan_id, living)
	elif living > DIRE_MEMBERS:
		_warned_dire = false

	return Outcome.UNRESOLVED


func note_death() -> void:
	deaths += 1


func _resolve(result: Outcome) -> Outcome:
	outcome = result
	resolved_tick = SimulationBudget.current_tick
	EventBus.campaign_ended.emit(clan_id, int(result), chronicle())
	return result


# --- The ending ---------------------------------------------------------------------

## What this lineage did, in the order it matters. Read by the ending screen.
##
## Deliberately not a score. The player is not told they got 74%; they are told
## what their people became, which is the only summary this game has any business
## producing.
func chronicle() -> Dictionary:
	var tree := NeuronalTree.for_clan(clan_id)
	var culture := CultureRegistry.get_culture(clan_id)
	var understood: Array[String] = []
	for id in tree.locked:
		understood.append(String(NeuronalTree.definition(id).get("display_name", id)))
	var lost: Array[String] = []
	for id in tree.forgotten:
		lost.append(String(NeuronalTree.definition(id).get("display_name", id)))

	return {
		"clan_id": clan_id,
		"outcome": int(outcome),
		"leaps": tree.leaps,
		"generations": maxi(generations, culture.generation if culture != null else 0),
		"peak_members": peak_members,
		"deaths": deaths,
		"understood": understood,
		"lost": lost,
		"lifetime_energy": tree.lifetime_energy,
	}


func outcome_name() -> String:
	return AetherTypes.enum_to_key(Outcome, int(outcome))


# --- Serialization ---------------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"clan_id": clan_id,
		"outcome": outcome_name(),
		"resolved_tick": resolved_tick,
		"ever_lived": _ever_lived,
		"peak_members": peak_members,
		"deaths": deaths,
		"generations": generations,
	}


static func from_dict(d: Dictionary) -> CampaignArc:
	var arc := CampaignArc.new(String(d.get("clan_id", "")))
	arc.outcome = AetherTypes.key_to_enum(
		Outcome, String(d.get("outcome", "UNRESOLVED")), Outcome.UNRESOLVED) as Outcome
	arc.resolved_tick = int(d.get("resolved_tick", -1))
	arc._ever_lived = bool(d.get("ever_lived", false))
	arc.peak_members = int(d.get("peak_members", 0))
	arc.deaths = int(d.get("deaths", 0))
	arc.generations = int(d.get("generations", 0))
	return arc
