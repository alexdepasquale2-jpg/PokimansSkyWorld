extends RefCounted
class_name CatchingSelfTest

## The core loop: weaken, throw, keep. If anything here fails the game is not
## playable, whatever else passes.

var _passed: int = 0
var _failed: int = 0
var _lines: Array[String] = []
var _rng := RandomNumberGenerator.new()


func run(parent: Node) -> Dictionary:
	_passed = 0
	_failed = 0
	_lines.clear()
	_rng.seed = 8675309

	_test_catch_odds(parent)
	_test_catching(parent)
	_test_party(parent)
	_test_full_loop(parent)

	return {"passed": _passed, "failed": _failed, "lines": _lines.duplicate()}


# --- Odds -------------------------------------------------------------------------

func _test_catch_odds(parent: Node) -> void:
	var ship := ShipSystem.new()
	var target := CreatureFactory.spawn_random(parent, _rng, {})

	target.stats.hp = target.stats.max_hp()
	var healthy := CatchSystem.chance_for(target, ship)
	target.stats.hp = target.stats.max_hp() * 0.15
	var hurt := CatchSystem.chance_for(target, ship)
	_check("odds: weakening a creature is what makes it catchable", hurt > healthy + 0.2)

	target.stats.downed = true
	var downed := CatchSystem.chance_for(target, ship)
	_check("odds: a downed creature is nearly certain", downed > hurt)
	target.stats.downed = false

	# Temperament must matter, or every creature feels the same to catch.
	var fierce := CreatureFactory.spawn_random(parent, _rng, {})
	fierce.genetics.genome.set_pair(&"behav_aggression", "aggr_fierce", "aggr_fierce")
	fierce.genetics.genome.set_pair(&"behav_curiosity", "curio_incurious", "curio_incurious")
	fierce.genetics.mark_dirty()
	fierce.stats.mark_dirty()
	var docile := CreatureFactory.spawn_random(parent, _rng, {})
	docile.genetics.genome.set_pair(&"behav_aggression", "aggr_placid", "aggr_placid")
	docile.genetics.genome.set_pair(&"behav_curiosity", "curio_probing", "curio_probing")
	docile.genetics.mark_dirty()
	docile.stats.mark_dirty()
	for c in [fierce, docile]:
		c.stats.hp = c.stats.max_hp() * 0.5
	_check("odds: a docile creature is easier to catch than a fierce one",
		CatchSystem.chance_for(docile, ship) > CatchSystem.chance_for(fierce, ship))

	# Odds must stay inside the stated bounds no matter what is thrown at them.
	target.stats.hp = 0.0
	target.stats.downed = true
	_check("odds: never becomes a guarantee",
		CatchSystem.chance_for(target, ship) <= CatchSystem.MAX_CHANCE)
	target.stats.downed = false
	target.stats.hp = target.stats.max_hp()
	_check("odds: never becomes impossible",
		CatchSystem.chance_for(fierce, ship) >= CatchSystem.MIN_CHANCE)

	_check("odds: are described in plain language",
		CatchSystem.describe_chance(0.8) == "almost certain"
		and CatchSystem.describe_chance(0.05) == "hopeless")

	# A better sensor should measurably help.
	ship.levels["mod_sensor"] = 4
	_check("odds: upgrading the bio-sensor improves catching",
		CatchSystem.chance_for(fierce, ship) > CatchSystem.chance_for(fierce, ShipSystem.new()))

	for c in [target, fierce, docile]:
		c.free()


# --- Catching ---------------------------------------------------------------------

func _test_catching(parent: Node) -> void:
	var ship := ShipSystem.new()
	var target := CreatureFactory.spawn_random(parent, _rng, {})
	target.stats.hp = 1.0
	target.stats.downed = true

	var joined: Array = []
	var listener := func(uid, kind): joined.append(kind)
	EventBus.creature_joined_colony.connect(listener)

	var caught := false
	for attempt in 40:
		if bool(CatchSystem.attempt(target, ship, _rng)["caught"]):
			caught = true
			break
	EventBus.creature_joined_colony.disconnect(listener)

	_check("catch: a downed creature is caught within a few throws", caught)
	_check("catch: catching is announced on the bus", not joined.is_empty())
	_check("catch: a caught creature is recorded as caught",
		target.identity.origin_kind == "caught")
	_check("catch: a caught creature is revived, not kept at death's door",
		not target.stats.downed and target.stats.hp > 1.0)

	target.free()


# --- Party -------------------------------------------------------------------------

func _test_party(parent: Node) -> void:
	var party := PartySystem.new()
	var ship := ShipSystem.new()

	_check("party: starts empty", party.size() == 0 and party.leader() == null)
	_check("party: a fresh ship carries a small team", party.party_limit(ship) >= 2)

	var caught: Array = []
	for i in party.party_limit(ship):
		var c := CreatureFactory.spawn_random(parent, _rng, {})
		caught.append(c)
		_check("party: catch %d joins the party" % i, party.accept(c, ship) == "party")

	# A full party must never block a catch ΓÇö it overflows to the ship.
	var overflow := CreatureFactory.spawn_random(parent, _rng, {})
	_check("party: a full party sends the next catch to the ship",
		party.accept(overflow, ship) == "stored")
	_check("party: nothing is ever lost to a full party", party.total_caught() > party.size())

	# Upgrading the habitat must actually let you carry more.
	var upgraded := ShipSystem.new()
	upgraded.levels["mod_habitat"] = 6
	_check("party: upgrading the habitat raises the limit",
		party.party_limit(upgraded) > party.party_limit(ship))

	# Leadership must skip anyone who cannot fight.
	var leader := party.leader()
	leader.stats.downed = true
	_check("party: a downed leader is passed over", party.leader() != leader)

	party.heal_all()
	_check("party: resting restores everyone", not leader.stats.downed
		and is_equal_approx(leader.stats.hp, leader.stats.max_hp()))

	# Cycling must land on someone able to fight.
	var next := party.cycle()
	_check("party: cycling picks a creature that can fight",
		next != null and not next.stats.downed)

	# Deposit and withdraw round trip.
	var before := party.size()
	party.deposit(party.active[party.active.size() - 1])
	_check("party: depositing shrinks the party", party.size() == before - 1)
	_check("party: withdrawing brings one back",
		party.withdraw(0, parent, ship) != null and party.size() == before)

	# The whole team must survive a save.
	var reloaded := PartySystem.new()
	reloaded.from_dict(JSON.parse_string(JSON.stringify(party.to_dict())), parent)
	_check("party: survives serialization",
		reloaded.size() == party.size()
		and reloaded.stored.size() == party.stored.size())

	for entry in party.active + reloaded.active:
		if is_instance_valid(entry):
			(entry as Creature).free()


# --- Full loop ----------------------------------------------------------------------

func _test_full_loop(parent: Node) -> void:
	var session := GameSession.new()
	session.start_new_campaign(4242)
	var planet := PlanetManager.create_planet()
	PlanetManager.land(planet.planet_id)

	var starter := CreatureFactory.spawn_random(parent, _rng, {})
	session.party.active.append(starter)
	_check("loop: you start with one creature", session.party.size() == 1)

	# Scan it into the dex.
	var scan := session.discovery.scan_creature(starter, planet, session.ship)
	_check("loop: scanning fills the dex", bool(scan["new"]))
	_check("loop: a dex entry is named in plain language",
		not String(scan["name"]).is_empty())
	_check("loop: scanning pays salvage", float(scan["salvage"]) > 0.0)

	# Find something, weaken it, catch it.
	var quarry := CreatureFactory.spawn_random(parent, _rng, {})
	var rounds := 0
	while not quarry.stats.downed and quarry.stats.hp > 0.0 and rounds < 60:
		CombatSystem.resolve_attack(starter, quarry, _rng)
		rounds += 1
	_check("loop: a creature can be fought down", quarry.stats.downed or quarry.stats.hp <= 0.0)

	if quarry.stats.downed:
		var got := false
		for attempt in 30:
			if bool(CatchSystem.attempt(quarry, session.ship, _rng)["caught"]):
				got = true
				break
		_check("loop: a downed creature can be caught", got)
		if got:
			# Mirrors the real flow: catching catalogues, then marks tamed.
			session.discovery.scan_creature(quarry, planet, session.ship)
			session.party.accept(quarry, session.ship)
			session.discovery.mark_tamed(quarry.genetics.genome)
			_check("loop: the catch joins your team", session.party.total_caught() == 2)
			_check("loop: the dex records it as tamed",
				session.discovery.totals()["tamed"] >= 1)

	# The salvage earned must be spendable on the ship.
	session.ship.add_salvage(500.0)
	var before := session.ship.fauna_depth()
	_check("loop: salvage buys a ship module", session.ship.upgrade("mod_scanner"))
	_check("loop: upgrading the ship reveals more of the world",
		session.ship.fauna_depth() > before)

	# And the whole campaign has to survive a save.
	session.pending_party = {}
	var snapshot: Variant = JSON.parse_string(JSON.stringify(session.to_dict()))
	var reloaded := GameSession.new()
	reloaded.from_dict(snapshot)
	_check("loop: the dex survives a save",
		reloaded.discovery.totals()["species"] == session.discovery.totals()["species"])
	_check("loop: the ship survives a save",
		is_equal_approx(reloaded.ship.salvage, session.ship.salvage))
	_check("loop: the team is held for the world scene to inflate",
		not reloaded.pending_party.is_empty())

	for entry in session.party.active:
		if is_instance_valid(entry):
			(entry as Creature).free()
	PlanetManager.active_planet_id = ""


# --- Harness ------------------------------------------------------------------

func _check(label: String, condition: bool) -> void:
	if condition:
		_passed += 1
		_lines.append("  [PASS] " + label)
	else:
		_failed += 1
		_lines.append("  [FAIL] " + label)
