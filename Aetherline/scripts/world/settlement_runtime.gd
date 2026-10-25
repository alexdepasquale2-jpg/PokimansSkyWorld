extends Node
class_name SettlementRuntime

## Living village: layout + walking NPCs + a shared culture that learns.
## Odyssey spine — people gather, work, teach, and remember under pressure.

signal settler_recruited(creature: Creature)
signal culture_taught(text: String)

const TILE := PlanetWorld.TILE_SIZE
const HOME_RADIUS := 46.0
const VILLAGE_RADIUS := 320.0
const LIFE_TICK := 2.8  # seconds between "a day of village life" lessons

var layout: Dictionary = {}
var view: SettlementView
var settlers: Array = []  ## Creature
var culture_id: String = ""
var _life_timer: float = 0.0
var _rng := RandomNumberGenerator.new()
var _parent_world: Node = null  # Overworld


func setup(settlement_layout: Dictionary, host: Node, view_node: SettlementView) -> void:
	layout = settlement_layout
	_parent_world = host
	view = view_node
	settlers.clear()
	if layout.is_empty():
		return
	_rng.seed = hash(String(layout.get("name", "village"))) ^ int(Time.get_ticks_msec())
	culture_id = String(layout.get("culture_id", "culture_settlers"))
	var cname := String(layout.get("culture_name", "Local folk"))
	var culture := CultureRegistry.ensure(culture_id, cname)
	# Ethos seeds the clan's first leanings via mild synthetic lessons.
	_seed_ethos(culture, String(layout.get("ethos", "wanderer")))
	_spawn_population(host)
	if view != null:
		view.setup(layout)


func center() -> Vector2:
	if layout.is_empty():
		return Vector2.ZERO
	return Vector2(float(layout["origin"][0]), float(layout["origin"][1])) * TILE


func building_at(world_position: Vector2, radius: float = 46.0) -> Dictionary:
	if view != null:
		return view.building_at(world_position, radius)
	return {}


func clear() -> void:
	for c in settlers:
		if is_instance_valid(c):
			c.queue_free()
	settlers.clear()
	layout = {}


func tick(delta: float, player: Node2D, world: PlanetWorld) -> void:
	if layout.is_empty():
		return
	_life_timer += delta
	if _life_timer >= LIFE_TICK:
		_life_timer = 0.0
		_village_life_lesson()

	var plaza := center()
	for c in settlers:
		if not is_instance_valid(c):
			continue
		# Soft tether — Odyssey clans range but return to the fire.
		var dist: float = c.global_position.distance_to(plaza)
		if dist > VILLAGE_RADIUS:
			c.position = c.position.move_toward(plaza, 80.0 * delta)
		_drive_routine(c, delta, player, world, plaza)


## Player did something that teaches the village (trade, rest, breed…).
func note_player_deed(kind: String, intensity: float = 1.0) -> void:
	var culture := CultureRegistry.ensure(culture_id)
	culture.ensure_nets()
	for c in settlers:
		if not is_instance_valid(c) or c.experience == null:
			continue
		# Map deeds onto experience kinds the reward router already understands.
		# Only kinds in data/culture/rewards.json teach the shared network.
		var deed_map := {
			"trade": "forage_success",
			"heal": "creature_tended",
			"rest": "creature_calmed",
			"breed": "offspring_sired",
			"craft": "forage_success",
			"rumor": "anomaly_investigated",
			"study": "anomaly_investigated",
			"recruit": "creature_calmed",
			"divine": "threat_foreseen",
			"purge": "creature_tended",
			"assay": "anomaly_investigated",
			"board": "creature_calmed",
			"expand_hold": "forage_success",
			"store": "forage_success",
		}
		var exp_kind: String = String(deed_map.get(kind, "biomes_entered"))
		c.experience.log_event(exp_kind, intensity)
	culture_taught.emit(_deed_line(kind, culture))


func nearest_recruitable(from: Vector2, radius: float = 80.0) -> Creature:
	var best: Creature = null
	var best_d := radius
	for c in settlers:
		if not is_instance_valid(c) or c.stats == null or c.stats.hp <= 0.0:
			continue
		# Building keepers stay; free residents can be hired.
		if bool(c.get_meta("is_keeper", false)):
			continue
		var dist: float = c.global_position.distance_to(from)
		if dist < best_d:
			best_d = dist
			best = c
	return best


func take_recruit(creature: Creature) -> bool:
	if creature == null or not settlers.has(creature):
		return false
	settlers.erase(creature)
	creature.remove_meta("settlement_home")
	creature.remove_meta("settlement_work")
	creature.remove_meta("settlement_role")
	creature.set_meta("is_settler", false)
	settler_recruited.emit(creature)
	return true


func describe() -> String:
	if layout.is_empty():
		return ""
	var culture := CultureRegistry.get_culture(culture_id)
	# THROUGH LoreVoice, like everything else a player reads. This was the last
	# raw clan readout in the game and it went straight into the event feed:
	# "Kelwatch Watch (town) · wary · 18 folk · clan gen 0 · 3 lessons · lean
	# foraging_priority." Rendering the opening minute of a campaign is what
	# found it — the HUD had been cleaned up and this had not.
	var who := LoreVoice.clan_name(culture) if culture != null else "folk"
	var mood := LoreVoice.disposition(culture) if culture != null else ""
	return "%s, a %s of %d — %s%s" % [
		layout.get("name", "Settlement"),
		SettlementGenerator.tier_name(int(layout.get("tier", 0))).to_lower(),
		_living_count(), who,
		(", %s" % mood) if not mood.is_empty() else ""]


func dialogue_flavor(building_entry: Dictionary) -> String:
	var culture := CultureRegistry.get_culture(culture_id)
	var role := String(building_entry.get("npc_role", "Resident"))
	var name := String(building_entry.get("npc_name", "Someone"))
	var ethos := String(layout.get("ethos", "wanderer"))
	var lean := ""
	if culture != null:
		culture.ensure_nets()
		var report: Array = culture.drive_report()
		if not report.is_empty() and report[0] is Dictionary:
			lean = String(report[0].get("drive", ""))
	var lines: Array[String] = []
	match ethos:
		"wary":
			lines.append("We keep the fire small and the watch long.")
		"tender":
			lines.append("The soil here answers if you listen.")
		"maker":
			lines.append("Hands remember what the mouth forgets.")
		"herder":
			lines.append("The stock taught us patience before we taught them paths.")
		"trader":
			lines.append("Everything has a weight. Most of it is stories.")
		"keeper":
			lines.append("We do not forget the dead. They still vote.")
		"scavenger":
			lines.append("The wreckage of other people is our orchard.")
		_:
			lines.append("We are still learning how to stay.")
	if not lean.is_empty():
		# `drive_noun`, not the raw id. A villager was saying "These days the clan
		# leans toward foraging_priority." out loud, in dialogue, to the player.
		lines.append("These days we lean toward %s." % LoreVoice.drive_noun(lean))
	if culture != null and culture.generation > 0:
		lines.append("This is generation %d of our fire." % culture.generation)
	return "%s the %s: \"%s\"" % [name, role, " ".join(lines)]


# --- Internals ----------------------------------------------------------------

func _living_count() -> int:
	var n := 0
	for c in settlers:
		if is_instance_valid(c):
			n += 1
	return n


func _seed_ethos(culture: CultureResource, ethos: String) -> void:
	culture.ensure_nets()
	if culture.live != null and culture.live.applies > 4:
		return  # already lived
	# Soft prior: a few synthetic applies so a wary village is not a blank slate.
	var priors: Dictionary = {
		"wary": ["flee_success", "creature_protected"],
		"tender": ["forage_success", "birth_attended"],
		"maker": ["work_completed_craft", "work_completed_haul"],
		"herder": ["creature_calmed", "forage_success"],
		"trader": ["work_completed_haul", "social_contact"],
		"keeper": ["anomaly_investigated", "rest_taken"],
		"scavenger": ["forage_success", "work_completed_haul"],
		"wanderer": ["distance_travelled", "biomes_entered"],
	}
	# Actual seeding happens via member experiences after spawn.


func _spawn_population(host: Node) -> void:
	if host == null or layout.is_empty():
		return
	var planet_id := String(layout.get("planet_id", PlanetManager.active_planet_id))
	var planet_name := ""
	var planet := PlanetManager.get_planet(planet_id)
	if planet != null:
		planet_name = planet.display_name
	var plaza := center()

	# One keeper per building — tied to that door.
	for entry in layout.get("buildings", []):
		var cell := Vector2i(int(entry["cell"][0]), int(entry["cell"][1]))
		var fp := Vector2i(int(entry["footprint"][0]), int(entry["footprint"][1]))
		var door := Vector2(
			(float(cell.x) + float(fp.x) * 0.5) * TILE,
			(float(cell.y) + float(fp.y) + 0.6) * TILE)
		var home := Vector2(
			(float(cell.x) + float(fp.x) * 0.5) * TILE,
			(float(cell.y) + float(fp.y) * 0.5) * TILE)
		var c := _spawn_human(host, {
			"name": String(entry.get("npc_name", "Settler")),
			"planet_id": planet_id,
			"planet_name": planet_name,
			"role": String(entry.get("npc_role", "Resident")),
			"seed": int(entry.get("npc_seed", 0)),
			"is_keeper": true,
			"home": home,
			"work": door,
		})
		if c != null:
			c.position = door + Vector2(_rng.randf_range(-6, 6), _rng.randf_range(2, 10))

	# Free residents who roam the plaza — recruitable.
	var free_n := maxi(1, int(layout.get("population", 4)) - settlers.size())
	free_n = mini(free_n, 4 + int(layout.get("tier", 0)))
	for i in free_n:
		var ang := _rng.randf() * TAU
		var dist := _rng.randf_range(28.0, 90.0)
		var pos := plaza + Vector2(cos(ang), sin(ang)) * dist
		var c2 := _spawn_human(host, {
			"name": "",
			"planet_id": planet_id,
			"planet_name": planet_name,
			"role": "Resident",
			"seed": _rng.randi(),
			"is_keeper": false,
			"home": plaza,
			"work": plaza,
		})
		if c2 != null:
			c2.position = pos

	# Ethos priors via a shared first lesson on each member.
	_apply_ethos_lessons()


func _spawn_human(host: Node, opts: Dictionary) -> Creature:
	var local_rng := RandomNumberGenerator.new()
	local_rng.seed = int(opts.get("seed", _rng.randi()))
	var name_opt := String(opts.get("name", ""))
	var spawn_opts := {
		"origin_kind": "recruited",
		"is_human": true,
		"culture_id": culture_id,
		"lineage_id": "lin_%s" % culture_id,
		"planet_id": String(opts.get("planet_id", "")),
		"planet_name": String(opts.get("planet_name", "")),
		"divergence": 0.05,
	}
	if not name_opt.is_empty():
		spawn_opts["name"] = name_opt
	var c: Creature = CreatureFactory.spawn_random(host, local_rng, spawn_opts)
	if c == null:
		return null
	c.set_meta("is_settler", true)
	c.set_meta("is_keeper", bool(opts.get("is_keeper", false)))
	c.set_meta("settlement_home", opts.get("home", center()))
	c.set_meta("settlement_work", opts.get("work", center()))
	c.set_meta("settlement_role", String(opts.get("role", "Resident")))
	c.set_meta("settlement_culture", culture_id)
	# Register with culture + budget.
	var culture := CultureRegistry.culture_for(c)
	culture.member_count = maxi(culture.member_count, settlers.size() + 1)
	culture.ensure_nets()
	if c.identity != null:
		SimulationBudget.register_creature(c.identity.uid, c, String(opts.get("planet_id", "")))
		SimulationBudget.set_lod(c.identity.uid, AetherTypes.SimLOD.NEAR)
	settlers.append(c)
	return c


func _apply_ethos_lessons() -> void:
	var ethos := String(layout.get("ethos", "wanderer"))
	var events: Array = {
		"wary": [["distance_travelled", 40.0], ["protect_ally", 0.6], ["threat_foreseen", 0.4]],
		"tender": [["forage_success", 0.7], ["offspring_sired", 0.3], ["creature_tended", 0.4]],
		"maker": [["forage_success", 0.5], ["anomaly_investigated", 0.5]],
		"herder": [["creature_calmed", 0.7], ["forage_success", 0.4]],
		"trader": [["forage_success", 0.6], ["biomes_entered", 0.4]],
		"keeper": [["anomaly_investigated", 0.5], ["threat_foreseen", 0.4]],
		"scavenger": [["forage_success", 0.8], ["biomes_entered", 0.3]],
		"wanderer": [["biomes_entered", 0.5], ["distance_travelled", 50.0]],
	}.get(ethos, [["biomes_entered", 0.5]])
	for c in settlers:
		if not is_instance_valid(c) or c.experience == null:
			continue
		for pair in events:
			c.experience.log_event(String(pair[0]), float(pair[1]))


func _drive_routine(c: Creature, delta: float, player: Node2D, world: PlanetWorld,
		plaza: Vector2) -> void:
	if c.ai == null:
		return
	var home: Vector2 = c.get_meta("settlement_home", plaza)
	var work: Vector2 = c.get_meta("settlement_work", plaza)
	var is_keeper := bool(c.get_meta("is_keeper", false))
	# Phase of day from wall clock — simple circadian loop.
	var phase := fmod(Time.get_ticks_msec() * 0.00015 + float(hash(String(c.identity.uid)) % 100) * 0.01, 1.0)
	var target := plaza
	if is_keeper:
		if phase < 0.35:
			target = work
		elif phase < 0.55:
			target = plaza
		elif phase < 0.8:
			target = work
		else:
			target = home
	else:
		if phase < 0.25:
			target = home
		elif phase < 0.5:
			target = plaza
		elif phase < 0.75:
			# Range for forage near village edge.
			var ang := float(hash(c.identity.uid) % 360) * TAU / 360.0
			target = plaza + Vector2(cos(ang), sin(ang)) * 140.0
		else:
			target = plaza

	var speed := 42.0
	if c.stats != null:
		speed = maxf(28.0, c.stats.stat("move_speed") * 0.7)
	# Idle sway when close to goal.
	if c.global_position.distance_to(target) > 10.0:
		c.position = c.position.move_toward(target, speed * delta)
	else:
		# Culture body still steps for micro-behavior when near goal.
		BehaviorExecutor.step(c, delta, {
			"player": player,
			"world": world,
			"threats": [],
			"allies": settlers,
			"food_point": plaza,
			"home_point": home,
			"plaza_point": plaza,
			"work_point": work,
		})


func _village_life_lesson() -> void:
	# Quiet learning: someone forages, someone socializes, someone rests.
	if settlers.is_empty():
		return
	var c: Creature = settlers[_rng.randi() % settlers.size()]
	if not is_instance_valid(c) or c.experience == null:
		return
	var ethos := String(layout.get("ethos", "wanderer"))
	var pool: Array = ["forage_success", "creature_calmed", "biomes_entered", "anomaly_investigated"]
	match ethos:
		"wary":
			pool = ["protect_ally", "threat_foreseen", "distance_travelled"]
		"tender":
			pool = ["forage_success", "creature_tended", "creature_calmed"]
		"maker":
			pool = ["forage_success", "anomaly_investigated"]
		"herder":
			pool = ["creature_calmed", "forage_success", "protect_ally"]
		"trader":
			pool = ["forage_success", "biomes_entered"]
		"keeper":
			pool = ["anomaly_investigated", "threat_foreseen", "creature_tended"]
	var kind: String = pool[_rng.randi() % pool.size()]
	var amt := 0.35 + _rng.randf() * 0.4
	if kind == "distance_travelled":
		amt = 20.0 + _rng.randf() * 40.0
	c.experience.log_event(kind, amt)
	# Generations are NOT pressed from here any more.
	#
	# This used to reimplement the boundary inline and got it wrong three ways: it
	# skipped the half that turns the neuronal tree over; it asked
	# `applies % 40 == 0`, a level rather than an edge, so it fired on every lesson
	# for as long as `applies` sat on a multiple of forty; and hanging the clock
	# off village life at all meant a party out in the field never aged. It is a
	# day counter now, owned by CultureTicker, and the generation is narrated
	# through LoreVoice like every other thing a player is told.


func _deed_line(kind: String, culture: CultureResource) -> String:
	var lessons := culture.live.applies if culture != null and culture.live != null else 0
	return "The folk of %s watched. Clan lessons: %d." % [
		layout.get("name", "the village"), lessons]
