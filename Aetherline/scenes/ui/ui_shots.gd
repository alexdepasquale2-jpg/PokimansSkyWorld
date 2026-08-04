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

const SETTLE_FRAMES := 3

var _out_dir := "user://shots"
var _shots: Array[Dictionary] = []
var _index: int = -1
var _settle: int = 0
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
		{"name": "hud", "build": _build_hud},
		{"name": "understandings", "build": _build_neurons},
		{"name": "your_people", "build": _build_people},
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


func _process(_delta: float) -> void:
	if _index < 0 or _index >= _shots.size():
		return
	_settle -= 1
	if _settle > 0:
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
		add_child(_current)
	_settle = SETTLE_FRAMES


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
	panel.open(_session, "culture_colony")
	return panel


func _build_people() -> Node:
	var panel := PeoplePanel.new()
	panel.position = Vector2(200, 90)
	panel.open(_session)
	return panel


func _build_ending_won() -> Node:
	var screen := EndingScreen.new()
	_session.arc.outcome = CampaignArc.Outcome.TRIUMPH
	screen.show_ending(CampaignArc.Outcome.TRIUMPH, _session.arc.chronicle())
	return screen


func _build_ending_lost() -> Node:
	var screen := EndingScreen.new()
	screen.show_ending(CampaignArc.Outcome.EXTINCTION, _session.arc.chronicle())
	return screen
