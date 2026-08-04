extends Control

## Screenshot harness. Builds each player-facing screen with plausible state,
## renders it, and writes a PNG.
##
## WHY THIS EXISTS. Every panel in this project has a behavioural smoke test and
## not one of them had ever been LOOKED AT — there is no display in the build
## container, so two rounds of interface work were reasoned from structure and
## verified only by assertion. Assertions catch "the label is blank". They do not
## catch a column that overflows its panel, text clipped by a container that
## shrank, four things that are all the same grey, or a tree whose rows are too
## tight to read.
##
## Godot renders fine under a virtual framebuffer. So: run it under one, drive
## each screen, and save the frame. It is not a substitute for a person playing
## the game, but it is the difference between "the test says it is not blank" and
## "I have seen it".
##
##   xvfb-run -a -s "-screen 0 1600x900x24" godot --path Aetherline \
##       --display-driver x11 --rendering-driver opengl3 \
##       res://scenes/ui/ui_shots.tscn
##
## Writes to `--shot-dir <path>` (from the user args after `--`), defaulting to
## `user://shots`.

## Real seconds to let a screen finish ARRIVING before photographing it.
##
## Frames are the wrong unit and three of them was nowhere near enough. The main
## menu fades its title in over 0.9s; a three-frame settle caught it at about 5%
## opacity and I very nearly "fixed" the contrast of a title that was simply not
## there yet. Anything with an intro tween, a pulse, or an eased bar needs wall
## time, and a screenshot taken before a screen has finished arriving is worse
## than no screenshot — it invents defects.
const SETTLE_SECONDS := 1.4

var _out_dir := "user://shots"
var _shots: Array[Dictionary] = []
var _index: int = -1
var _settle: float = 0.0
var _current: Node = null


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var flag := args.find("--shot-dir")
	if flag >= 0 and flag + 1 < args.size():
		_out_dir = args[flag + 1]
	DirAccess.make_dir_recursive_absolute(_out_dir)

	CultureRegistry.install(20260901)
	_seed_world()

	_shots = [
		{"name": "main_menu", "build": _build_main_menu},
		{"name": "hud", "build": _build_hud},
		{"name": "understandings", "build": _build_neurons,
			"arm": func(n): n.open(_session, "culture_colony")},
		{"name": "your_people", "build": _build_people,
			"arm": func(n): n.open(_session)},
		{"name": "party", "build": _build_party,
			"arm": func(n): n.open(_session)},
		{"name": "inventory", "build": _build_inventory,
			"arm": func(n): n.open(_session)},
		{"name": "ship", "build": _build_ship,
			"arm": func(n): n.open(_session)},
		{"name": "star_map", "build": _build_star_map,
			"arm": func(n): n.open(PlanetManager.known_planets.keys())},
		{"name": "bloodline", "build": _build_bloodline},
		{"name": "ending_triumph", "build": _build_ending_won},
		{"name": "ending_extinction", "build": _build_ending_lost},
	]
	_advance()


## A clan with a history, so the screens have something real to show. Empty
## panels photograph fine and tell you nothing.
var _session: GameSession = null
var _clan: Array[Creature] = []


func _seed_world() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260901

	_session = GameSession.new()
	add_child(_session)
	# A few worlds, so the star map has somewhere to point at.
	for i in 5:
		PlanetManager.derive_planet("world_%d" % i)

	var culture := CultureRegistry.ensure("culture_colony", "The Vess")
	culture.ensure_nets()
	culture.generation = 3

	var tree := NeuronalTree.for_clan("culture_colony")
	tree.energy = 96.0
	# A believable mid-campaign: a couple of branches opened, one thing lost.
	for id in ["neu_listen", "neu_scent_memory", "neu_grip"]:
		tree.energy += 200.0
		tree.reinforce(id)
	tree.advance_generation(40.0)
	tree.energy = 96.0
	for id in tree.affordable_ids().slice(0, 2):
		tree.reinforce(id)
	tree.forgotten["neu_night_eyes"] = true

	for i in 4:
		var c := CreatureFactory.spawn_random(self, rng, {"culture_id": "culture_colony"})
		c.stats.initialize_vitals()
		c.stats.age_days = c.stats.stat("max_age_days") * 0.35
		c.experience.log_event("forage_success", 3.0)
		c.experience.log_event("protect_ally", 2.0)
		c.archetype.evaluate()
		_session.enroll(c)
		_session.party.accept(c, _session.ship)
		_clan.append(c)
	# Give the readouts something other than "everything is fine" to draw.
	_clan[0].needs.hunger = 0.28
	_clan[0].needs.energy = 0.55
	_clan[1].needs.health = 0.09
	_session.arc.evaluate(_clan.size())


func _process(delta: float) -> void:
	if _index < 0 or _index >= _shots.size():
		return
	_settle -= delta
	if _settle > 0.0:
		return
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var path := "%s/%s.png" % [_out_dir, _shots[_index]["name"]]
	var err := image.save_png(path)
	print("shot %-18s %s%s" % [_shots[_index]["name"], path,
		"" if err == OK else "   FAILED %d" % err])
	_advance()


func _advance() -> void:
	if _current != null and is_instance_valid(_current):
		_current.queue_free()
		_current = null
	_index += 1
	if _index >= _shots.size():
		print("shots done")
		get_tree().quit()
		return
	_current = (_shots[_index]["build"] as Callable).call()
	if _current != null:
		# ADDED BEFORE IT IS OPENED. Several panels build their children in
		# `_ready`, so calling `open()` on a node that is not in the tree yet
		# assigns text to labels that do not exist — the first run of this
		# harness photographed the party panel as an empty grey screen and the
		# ship view half-built, and neither is a bug in those panels.
		add_child(_current)
		var arm: Variant = _shots[_index].get("arm")
		if arm is Callable:
			(arm as Callable).call(_current)
	_settle = SETTLE_SECONDS


# --- The screens ---------------------------------------------------------------

func _build_hud() -> Node:
	var hud := HudRoot.new()
	hud.show_place("Kesh II", "frostbitten steppe")
	hud.show_leader(_clan[0])
	hud.show_run(1, _clan.size(), "The Vess — %s"
		% LoreVoice.disposition(CultureRegistry.get_culture("culture_colony")))
	var tree := NeuronalTree.for_clan("culture_colony")
	hud.show_understanding(tree.energy, tree.affordable_ids().size(),
		tree.pending.size(), 2)
	hud.show_keys(["WASD move", "E interact", "L your people",
		"N understandings", "M menu"])
	return hud


func _build_neurons() -> Node:
	var panel := NeuronPanel.new()
	panel.position = Vector2(120, 60)
	return panel


func _build_people() -> Node:
	var panel := PeoplePanel.new()
	panel.position = Vector2(200, 90)
	return panel


func _build_main_menu() -> Node:
	return load("res://scenes/ui/main_menu.tscn").instantiate()


func _build_party() -> Node:
	var panel := PartyPanel.new()
	panel.position = Vector2(180, 80)
	return panel


func _build_inventory() -> Node:
	_session.stock.add_local("res_biomass", 22.0)
	_session.stock.add_local("res_alloy", 6.0)
	var panel := InventoryPanel.new()
	panel.position = Vector2(180, 80)
	return panel


func _build_ship() -> Node:
	_session.ship.salvage = 480.0
	var view := ShipView.new()
	view.position = Vector2(120, 60)
	return view


func _build_star_map() -> Node:
	var panel := StarMap.new()
	panel.position = Vector2(140, 70)
	return panel


## A line with real depth.
##
## Built through `ClanGrowth` — the same path the game uses — rather than by
## calling `BreedingSystem` directly, because breeding refuses on reproductive
## roles and a hand-rolled pairing quietly produced nothing. Two earlier attempts
## at this shot photographed a scroll box containing one dot.
func _build_bloodline() -> Node:
	var rng := RandomNumberGenerator.new()
	rng.seed = 20260902

	var growth := ClanGrowth.new()
	growth.rng.seed = 20260902
	growth.nursery = self
	add_child(growth)

	var stock: Array[Creature] = []
	for i in 8:
		var c := CreatureFactory.spawn_random(self, rng, {"culture_id": "clan_shot"})
		c.stats.initialize_vitals()
		c.stats.age_days = c.stats.stat("max_age_days") * 0.4
		c.needs.feed(1.0)
		c.needs.heal(1.0)
		stock.append(c)

	for _i in 10:
		var born := growth.attempt("clan_shot")
		if born == null:
			continue
		born.stats.age_days = born.stats.stat("max_age_days") * 0.4
		born.needs.feed(1.0)
		born.needs.heal(1.0)
	growth.free()

	# Somebody does not make it, so the drawing has a hollow node in it — an
	# ancestor who died is the reason the rest of the line exists.
	var deepest: LineageRecordResource = null
	for record in StoryDirector.lineages.values():
		var line: LineageRecordResource = record
		if deepest == null or line.descent.size() > deepest.descent.size():
			deepest = line
	if deepest != null and deepest.descent.size() > 2:
		var last := ""
		for uid in deepest.descent:
			last = String(uid)
		deepest.record_death(last, "starvation", SimulationBudget.current_tick)
		print("  deepest line %s: %d people" % [deepest.display_name,
			deepest.descent.size()])

	return LineagePanel.new()


func _build_ending_won() -> Node:
	var screen := EndingScreen.new()
	_session.arc.outcome = CampaignArc.Outcome.TRIUMPH
	screen.show_ending(CampaignArc.Outcome.TRIUMPH, _session.arc.chronicle())
	return screen


func _build_ending_lost() -> Node:
	var screen := EndingScreen.new()
	screen.show_ending(CampaignArc.Outcome.EXTINCTION, _session.arc.chronicle())
	return screen
