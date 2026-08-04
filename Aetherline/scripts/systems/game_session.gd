extends Node
class_name GameSession

## The campaign itself: who you have, what you own, what you know, and where
## you are. Owned by the game scene rather than being a seventh autoload (the
## project holds to six), and registered with SaveSystem via the provider seam
## that has existed since Phase 0 for exactly this.
##
## Everything the player accumulates lives here. Creature BODIES do not — those
## are spawned by the world scene and serialized through PlanetManager on
## departure; this holds the roster of who belongs to the colony.

signal roster_changed()
signal resources_changed()
signal notice(text: String)

const SAVE_KEY := "session"
const STARTING_RESOURCES := {"timber": 60.0, "ore_ferrite": 20.0, "forage": 40.0}

var stock := Stockpile.new()
var research := ResearchSystem.new()

## The incremental spine. Persists across everything the player does planetside
## and decides how much of the simulation the planet layer is allowed to show.
var ship := ShipSystem.new()

## The Aetherdex. Persists for the whole campaign and never resets.
var discovery := DiscoverySystem.new()

## Your team, and everything you've caught.
var party := PartySystem.new()

## Party data read from a save, waiting for the world scene to inflate it —
## creatures need a parent node, which does not exist at load time.
var pending_party: Dictionary = {}

## uids of every creature/colonist belonging to the colony, alive or left
## behind. The living bodies are wherever they physically are.
var roster: Array[String] = []

## uid -> last known display name, so the star map and menus can name someone
## whose body is currently in cold storage on another world.
var roster_names: Dictionary = {}

var days_elapsed: int = 0
var jumps_made: int = 0
var campaign_started: bool = false


func _ready() -> void:
	SaveSystem.register_provider(SAVE_KEY,
		func(): return to_dict(),
		func(d): from_dict(d))


func _exit_tree() -> void:
	SaveSystem.unregister_provider(SAVE_KEY)


# --- Campaign lifecycle ---------------------------------------------------------

func start_new_campaign(seed_value: int = 0) -> void:
	stock = Stockpile.new()
	for res_id in STARTING_RESOURCES:
		stock.add_local(res_id, float(STARTING_RESOURCES[res_id]))
	research = ResearchSystem.new()
	ship = ShipSystem.new()
	ship.salvage = 35.0  # enough for a first Survey Array or Hold plate
	discovery = DiscoverySystem.new()
	party = PartySystem.new()
	pending_party = {}
	stock.carry_capacity = ship.carry_capacity()
	roster.clear()
	roster_names.clear()
	days_elapsed = 0
	jumps_made = 0
	campaign_started = true

	PlanetManager.known_planets.clear()
	PlanetManager.summaries.clear()
	PlanetManager.active_planet_id = ""
	var seed_final: int = seed_value if seed_value != 0 else randi() | (randi() << 32)
	PlanetManager.set_universe_seed(seed_final)
	# Fresh campaign = fresh clan brains (Odyssey: cultures are per-campaign).
	CultureRegistry.reset(seed_final)
	CultureRegistry.install(seed_final)
	StoryDirector.lineages.clear()
	StoryDirector.long_term.clear()
	CreatureFactory.reset_counter()
	SimulationBudget.current_tick = 0
	SimulationBudget.current_day = 0


func enroll(creature: Creature) -> void:
	var uid := String(creature.identity.uid)
	if not roster.has(uid):
		roster.append(uid)
	roster_names[uid] = creature.display_name()
	roster_changed.emit()


func release(uid: String) -> void:
	roster.erase(uid)
	roster_changed.emit()


func is_colonist(creature: Creature) -> bool:
	return roster.has(String(creature.identity.uid))


func colony_size() -> int:
	return roster.size()


# --- Economy --------------------------------------------------------------------

func gain(res_id, qty: float) -> void:
	stock.add_local(res_id, qty)
	resources_changed.emit()


func spend(costs: Dictionary) -> bool:
	var ok := stock.spend(costs)
	if ok:
		resources_changed.emit()
	return ok


## Total edible material on hand — what feeding actually draws from.
func food_available() -> float:
	return stock.amount("forage") + stock.amount("grain") + stock.amount("feed")


## Consumes one meal's worth from the best food available. Returns how
## nourishing it was, 0 if the colony has nothing to eat.
func consume_meal(amount: float = 8.0) -> float:
	for res_id in ["feed", "grain", "forage"]:
		if stock.amount(res_id) >= amount:
			stock.spend({res_id: amount})
			resources_changed.emit()
			# Compound feed is worth more than raw forage — the whole point of
			# researching it.
			return {"feed": 1.0, "grain": 0.7, "forage": 0.5}[res_id]
	return 0.0


# --- Travel ---------------------------------------------------------------------

## Loads the hold ahead of a jump, proportionally, so the player is not forced
## to micromanage every resource line to leave a planet.
func prepare_hold() -> Dictionary:
	var manifest := {}
	var keys: Array = stock.local.keys()
	keys.sort()
	for res_id in keys:
		var moved := stock.load_for_travel(res_id, float(stock.local[res_id]))
		if moved > 0.0:
			manifest[res_id] = moved
	resources_changed.emit()
	return manifest


func complete_jump() -> void:
	var left := stock.abandon_local()
	stock.unload_on_arrival()
	jumps_made += 1
	resources_changed.emit()
	if not left.is_empty():
		notice.emit("Left %d resource type(s) behind — the hold was full." % left.size())


# --- Serialization ---------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"stock": stock.to_dict(),
		"research": research.to_dict(),
		"ship": ship.to_dict(),
		"discovery": discovery.to_dict(),
		"party": party.to_dict(),
		"roster": roster.duplicate(),
		"roster_names": roster_names.duplicate(),
		"days_elapsed": days_elapsed,
		"jumps_made": jumps_made,
		"campaign_started": campaign_started,
	}


func from_dict(d: Dictionary) -> void:
	stock.from_dict(d.get("stock", {}))
	research.from_dict(d.get("research", {}))
	ship.from_dict(d.get("ship", {}))
	discovery.from_dict(d.get("discovery", {}))
	# Held, not applied: inflating creatures needs a scene parent.
	pending_party = d.get("party", {})
	roster.clear()
	for uid in d.get("roster", []):
		roster.append(String(uid))
	roster_names = d.get("roster_names", {}).duplicate()
	days_elapsed = int(d.get("days_elapsed", 0))
	jumps_made = int(d.get("jumps_made", 0))
	campaign_started = bool(d.get("campaign_started", false))
	roster_changed.emit()
	resources_changed.emit()
