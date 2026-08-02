extends Node2D
class_name Overworld

## The game: walk a strange world, find something alive, weaken it, catch it,
## and go somewhere stranger.
##
## Deliberately only five verbs — move, scan, fight, catch, interact. There is
## no feeding, no building, no work rosters, no research screen. The deep
## genetics simulation underneath is what makes each catch DIFFERENT; it is
## never something the player is asked to manage.

const FAUNA_SPAWN_RADIUS := 900.0
const FOLLOW_DISTANCE := 62.0
const HARVEST_RANGE := 56.0
const SAVE_SLOT := "campaign"

var session: GameSession
var world: PlanetWorld
var player: PlayerAvatar
var wild: Array = []
var resource_nodes: Array = []

var chunk_layer: Node2D
var node_layer: Node2D
var chunk_views: Dictionary = {}
var settlement: SettlementView

var _rng := RandomNumberGenerator.new()
var _nearest_wild: Creature = null
var _nearest_node: ResourceNode = null
var _nearest_building: Dictionary = {}
var _ship_view: ShipView
var _service_menu: ServiceMenu
var _party_panel: PartyPanel

var _info: Label
var _prompt: Label
var _target_bar: Label
var _log_label: RichTextLabel
var _log_lines: Array[String] = []
var _hud_panel: FxPanel


func _ready() -> void:
	_rng.randomize()

	session = GameSession.new()
	session.name = "GameSession"
	add_child(session)
	session.notice.connect(_log)

	chunk_layer = Node2D.new()
	add_child(chunk_layer)
	node_layer = Node2D.new()
	add_child(node_layer)

	EventBus.planet_chunk_loaded.connect(_on_chunk_loaded)
	EventBus.planet_chunk_unloaded.connect(_on_chunk_unloaded)
	# The ONLY narrative event still surfaced in the world. Crystallizing is
	# this game's evolution moment and deserves a callout; everything else the
	# story layer produces belongs on the party screen, not in the player's face.
	EventBus.archetype_crystallized.connect(_on_crystallized)

	_build_ui()

	if bool(Engine.get_meta("aetherline_new_campaign", true)):
		_begin_new_campaign()
	else:
		_resume_campaign()


func _exit_tree() -> void:
	_unbind(EventBus.planet_chunk_loaded, _on_chunk_loaded)
	_unbind(EventBus.planet_chunk_unloaded, _on_chunk_unloaded)
	_unbind(EventBus.archetype_crystallized, _on_crystallized)


func _on_crystallized(uid: StringName, archetype_id: StringName, _tick: int) -> void:
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c) or c.identity.uid != uid:
			continue
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		_log("[b]%s became %s.[/b]" % [c.display_name(),
			definition.display_name if definition != null else archetype_id])
		ImpactEffect.spawn(self, c.global_position, Color(1.0, 0.85, 0.4), 160.0)
		if _hud_panel != null:
			_hud_panel.set_rim_color(Color(1.0, 0.85, 0.35))
			_hud_panel.flash(2.0)
		return


func _unbind(source: Signal, handler: Callable) -> void:
	if source.is_connected(handler):
		source.disconnect(handler)


# --- Start -------------------------------------------------------------------------

func _begin_new_campaign() -> void:
	session.start_new_campaign()
	var planet := PlanetManager.create_planet()
	_land_on(planet.planet_id)

	player = PlayerAvatar.new()
	player.position = Vector2.ZERO
	add_child(player)

	# You start with one creature. Everything else you have to go and find.
	var starter := CreatureFactory.spawn_random(self, _rng, {
		"origin_kind": "gifted", "planet_id": planet.planet_id,
		"planet_name": ShipSystem.HOME_PLANET})
	starter.position = Vector2(40, 20)
	session.party.active.append(starter)
	session.discovery.scan_creature(starter, world.planet, session.ship)

	_spawn_fauna(world.planet)
	_log("%s is gone. You got out with one creature and a failing ship." % ShipSystem.HOME_PLANET)
	_log("%s is with you." % starter.display_name())
	_log("Q scans. Space attacks. C throws. Weaken something before you throw.")


func _resume_campaign() -> void:
	if not SaveSystem.load_game(SAVE_SLOT) or PlanetManager.active_planet_id.is_empty():
		_begin_new_campaign()
		return
	_land_on(PlanetManager.active_planet_id)
	player = PlayerAvatar.new()
	add_child(player)
	session.party.from_dict(session.pending_party, self)
	_spawn_fauna(world.planet)
	_log("Back on %s." % world.planet.display_name)


func _land_on(planet_id: String) -> void:
	PlanetManager.land(planet_id)
	world = PlanetWorld.new()
	add_child(world)
	world.setup(PlanetManager.active_planet(), PlanetManager.active_summary())

	if settlement != null:
		settlement.queue_free()
	settlement = SettlementView.new()
	chunk_layer.add_child(settlement)
	settlement.setup(SettlementGenerator.generate(world.planet))

	var first_visit := session.discovery.register_planet(world.planet)
	if first_visit:
		session.ship.add_salvage(DiscoverySystem.SALVAGE_PLANET)
	LandfallCard.show_for(self, world.planet, session.discovery, first_visit)


# --- Loop ---------------------------------------------------------------------------

func _menu_open() -> bool:
	return (_ship_view != null and _ship_view.visible) \
		or (_service_menu != null and _service_menu.visible) \
		or (_party_panel != null and _party_panel.visible)


func _process(delta: float) -> void:
	if player == null or _menu_open():
		return
	_move_player(delta)
	_follow(delta)
	_update_targets()
	_tick_wild(delta)
	_update_info()


func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or _menu_open():
		return
	match event.keycode:
		KEY_Q: _scan()
		KEY_E: _interact()
		KEY_SPACE: _attack()
		KEY_C: _throw()
		KEY_TAB: _cycle_leader()
		KEY_P: _open_party()
		KEY_J: _open_ship()
		KEY_ESCAPE: _to_menu()


func _move_player(delta: float) -> void:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if dir == Vector2.ZERO:
		return
	var cost := float(PlanetGenerator.get_biome(
		world.biome_at(player.position)).get("move_cost", 1.0))
	player.position += dir.normalized() * (240.0 / maxf(0.5, cost)) * delta
	world.set_focus(player.position)
	SimulationBudget.set_focus_point(player.position)


## Party members trail you loosely, staggered so a team reads as a group of
## animals rather than a formation.
func _follow(delta: float) -> void:
	for i in session.party.active.size():
		var c: Creature = session.party.active[i]
		if not is_instance_valid(c):
			continue
		var slot := Vector2(cos(i * 2.4), sin(i * 2.4)) * FOLLOW_DISTANCE
		var goal := player.position + slot
		if c.position.distance_to(goal) > 12.0:
			c.position = c.position.move_toward(goal,
				c.stats.stat("move_speed") * 1.5 * delta)


func _update_targets() -> void:
	_nearest_wild = null
	var best := 260.0
	for entry in wild:
		var c: Creature = entry
		if not is_instance_valid(c) or c.stats.hp <= 0.0:
			continue
		var d := c.position.distance_to(player.position)
		if d < best:
			best = d
			_nearest_wild = c

	_nearest_node = null
	var node_best := HARVEST_RANGE
	for entry in resource_nodes:
		var n: ResourceNode = entry
		if not is_instance_valid(n) or n.depleted():
			continue
		var d := n.position.distance_to(player.position)
		if d < node_best:
			node_best = d
			_nearest_node = n

	_nearest_building = settlement.building_at(player.position) if settlement != null else {}
	_update_prompt()


func _update_prompt() -> void:
	var parts: Array[String] = []
	if not _nearest_building.is_empty():
		var definition := SettlementGenerator.get_building(_nearest_building["building_id"])
		parts.append("[E] %s" % definition["display_name"])
	elif _nearest_node != null:
		parts.append("[E] gather %s" % _nearest_node.resource_id)

	if _nearest_wild != null:
		var chance := CatchSystem.chance_for(_nearest_wild, session.ship)
		parts.append("[Space] fight    [C] throw — %s (%d%%)" % [
			CatchSystem.describe_chance(chance), int(chance * 100.0)])
	_prompt.text = "        ".join(parts)

	# The target's condition, front and centre — this is the number the player
	# is actually managing when they decide whether to throw.
	if _nearest_wild != null:
		var hp := _nearest_wild.stats.hp_fraction()
		var bars := int(round(hp * 20.0))
		_target_bar.text = "%s   [%s%s]  %d%%%s" % [
			_nearest_wild.display_name(),
			"|".repeat(bars), ".".repeat(20 - bars), int(hp * 100.0),
			"   DOWNED" if _nearest_wild.stats.downed else ""]
	else:
		_target_bar.text = ""


# --- Verbs ----------------------------------------------------------------------------

func _scan() -> void:
	var radius := 260.0 + session.ship.stat("scan_depth") * 60.0
	ScanEffect.sweep(self, player.global_position, radius)

	var discovered := 0
	var salvage := 0.0
	for entry in wild + session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c) or c.global_position.distance_to(player.position) > radius:
			continue
		var result := session.discovery.scan_creature(c, world.planet, session.ship)
		salvage += float(result["salvage"])
		if bool(result["new"]):
			discovered += 1
			_log("Catalogued: %s" % result["name"])
		ScanEffect.tag(self, c.global_position, String(result["name"]), bool(result["new"]))

	for entry in resource_nodes:
		var n: ResourceNode = entry
		if not is_instance_valid(n) or n.global_position.distance_to(player.position) > radius:
			continue
		var result := session.discovery.scan_resource(n.resource_id, world.planet)
		salvage += float(result["salvage"])
		if bool(result["new"]):
			discovered += 1
			ScanEffect.tag(self, n.global_position, n.resource_id, true)

	session.ship.add_salvage(salvage)
	if discovered > 0:
		var totals := session.discovery.totals()
		_log("%d new. Aetherdex: %d species across %d worlds.  +%.0f salvage"
			% [discovered, totals["species"], totals["planets"], salvage])
		_sync_ship_metrics()


func _attack() -> void:
	if _nearest_wild == null:
		return
	var leader := session.party.leader()
	if leader == null:
		_log("Nothing in your party can fight. Rest at a settlement.")
		return
	if not leader.combat.ready_to_attack():
		return
	# Your creature closes the distance itself — you point, it fights.
	leader.position = leader.position.move_toward(_nearest_wild.position, 40.0)
	if leader.position.distance_to(_nearest_wild.position) > leader.combat.attack_range():
		return

	leader.combat.reset_cooldown()
	leader.combat.engaged = true
	_nearest_wild.combat.engaged = true
	_resolve_hit(leader, _nearest_wild)


func _throw() -> void:
	if _nearest_wild == null:
		return
	if player.position.distance_to(_nearest_wild.position) > 220.0:
		_log("Too far. Get closer.")
		return

	var target := _nearest_wild
	var result := CatchSystem.attempt(target, session.ship, _rng)
	ScanEffect.sweep(self, target.global_position, 70.0, Color(1.0, 0.85, 0.4))

	if not bool(result["caught"]):
		DamagePopup.spawn(self, target.global_position, 0.0, "miss")
		_log("%s broke free." % target.display_name())
		return

	wild.erase(target)
	# Catching catalogues it. Otherwise a player who throws without scanning
	# first ends up with a creature in hand and no dex entry for it.
	var entry := session.discovery.scan_creature(target, world.planet, session.ship)
	if bool(entry["new"]):
		_log("Catalogued: %s" % entry["name"])
	var where := session.party.accept(target, session.ship)
	session.discovery.mark_tamed(target.genetics.genome)
	session.ship.add_salvage(10.0)
	session.ship.record("tamed", 1.0, true)
	ImpactEffect.spawn(self, player.global_position, Color(0.6, 0.9, 1.0), 110.0)

	if where == "party":
		_log("Caught %s! It joins your party." % target.display_name())
	else:
		_log("Caught %s! Party is full — sent to the ship." % target.display_name())
	_sync_ship_metrics()


func _cycle_leader() -> void:
	var next := session.party.cycle()
	if next != null:
		_log("%s steps forward." % next.display_name())


func _interact() -> void:
	if not _nearest_building.is_empty():
		_enter_building(_nearest_building)
		return
	if _nearest_node == null:
		return
	var yielded := _nearest_node.harvest(session.party.leader())
	if yielded <= 0.0:
		return
	# Materials exist only as salvage now — there is no inventory to manage.
	session.ship.add_salvage(yielded * 0.35)
	DamagePopup.spawn(self, _nearest_node.global_position, yielded, "heal")
	var summary := PlanetManager.active_summary()
	if summary != null:
		summary.resource_depletion[_nearest_node.node_key] = _nearest_node.remaining / 40.0
	if _nearest_node.depleted():
		resource_nodes.erase(_nearest_node)
		_nearest_node.queue_free()


# --- Combat ----------------------------------------------------------------------------

func _resolve_hit(attacker: Creature, target: Creature) -> void:
	var result := CombatSystem.resolve_attack(attacker, target, _rng)
	if not bool(result["hit"]):
		DamagePopup.spawn(self, target.global_position, 0.0, "miss")
		return
	target.visual.flash_hit(Color(1.0, 0.4, 0.35))
	ImpactEffect.spawn(self, target.global_position, Color(1.0, 0.75, 0.3),
		40.0 + float(result["damage"]) * 1.2)
	DamagePopup.spawn(self, target.global_position, float(result["damage"]))

	if bool(result["downed"]):
		_log("%s is down — good time to throw." % target.display_name())
	elif bool(result["killed"]):
		_log("%s died." % target.display_name())
		wild.erase(target)
		session.ship.add_salvage(3.0)
		target.queue_free()


## Wild creatures approach and swing back if provoked or naturally aggressive.
func _tick_wild(delta: float) -> void:
	var leader := session.party.leader()
	for entry in session.party.active + wild:
		var c: Creature = entry
		if is_instance_valid(c) and c.combat != null:
			c.combat.tick(delta)
	if leader == null:
		return

	for entry in wild.duplicate():
		var beast: Creature = entry
		if not is_instance_valid(beast) or beast.stats.hp <= 0.0 or beast.stats.downed:
			continue
		var d := beast.position.distance_to(leader.position)
		if d > beast.combat.aggro_range() and not beast.combat.engaged:
			continue
		if not beast.combat.engaged and beast.stats.trait_value(&"aggression") < 0.5:
			continue
		beast.combat.engaged = true
		if d > beast.combat.attack_range():
			beast.position += (leader.position - beast.position).normalized() \
				* beast.stats.stat("move_speed") * 0.5 * delta
		elif beast.combat.ready_to_attack():
			beast.combat.reset_cooldown()
			_resolve_hit(beast, leader)


# --- Screens -----------------------------------------------------------------------------

func _enter_building(entry: Dictionary) -> void:
	if _service_menu == null:
		var layer := CanvasLayer.new()
		layer.layer = 6
		add_child(layer)
		_service_menu = ServiceMenu.new()
		layer.add_child(_service_menu)
	_service_menu.open(entry, session, session.party.active)


func _open_party() -> void:
	if _party_panel == null:
		var layer := CanvasLayer.new()
		layer.layer = 6
		add_child(layer)
		_party_panel = PartyPanel.new()
		layer.add_child(_party_panel)
	_party_panel.open(session, self)


func _open_ship() -> void:
	if _ship_view == null:
		var layer := CanvasLayer.new()
		layer.layer = 7
		add_child(layer)
		_ship_view = ShipView.new()
		layer.add_child(_ship_view)
		_ship_view.jump_requested.connect(_jump_to)
	_sync_ship_metrics()
	_ship_view.open(session)


func _sync_ship_metrics() -> void:
	var ship := session.ship
	var earned: Array = []
	earned += ship.record("planets_visited", float(session.discovery.planets.size()))
	earned += ship.record("colony_size", float(session.party.total_caught()))
	earned += ship.record("species", float(session.discovery.totals()["species"]))
	var deepest := 0.0
	var archetypes := 0.0
	for id in StoryDirector.lineages:
		var record: LineageRecordResource = StoryDirector.lineages[id]
		deepest = maxf(deepest, float(record.max_generation))
		for a in record.archetype_history:
			archetypes += float(record.archetype_history[a])
	earned += ship.record("max_generation", deepest)
	earned += ship.record("archetypes", archetypes)
	for achievement in earned:
		_log("[ACHIEVEMENT] %s — %s  (%s)" % [achievement["display_name"],
			achievement["description"], achievement.get("reward_text", "")])
	if not earned.is_empty() and _hud_panel != null:
		_hud_panel.set_rim_color(Color(1.0, 0.85, 0.35))
		_hud_panel.flash(1.6)


## Called by ServiceMenu / PartyPanel when the party changes.
func adopt_offspring(child: Creature) -> void:
	child.position = player.position + Vector2(_rng.randf_range(-40, 40), _rng.randf_range(-40, 40))
	session.party.accept(child, session.ship)
	_log("%s was born." % child.display_name())


func recruit_colonist(_npc_name: String) -> void:
	_log("Nobody here is looking to leave.")


# --- Travel --------------------------------------------------------------------------------

func _jump_to(planet_id: String) -> void:
	# Your party comes with you. Nothing is ever left behind — the whole point
	# of a team is that it is YOUR team.
	for key in chunk_views:
		chunk_views[key].queue_free()
	chunk_views.clear()
	for n in resource_nodes:
		if is_instance_valid(n):
			n.queue_free()
	resource_nodes.clear()
	for c in wild:
		if is_instance_valid(c):
			c.queue_free()
	wild.clear()
	if world != null:
		world.queue_free()

	session.jumps_made += 1
	_land_on(planet_id)
	player.position = Vector2.ZERO
	for c in session.party.active:
		if is_instance_valid(c):
			c.home_planet_id = planet_id
			c.position = Vector2(_rng.randf_range(-50, 50), _rng.randf_range(-50, 50))
	_spawn_fauna(world.planet)
	world.set_focus(player.position)
	_apply_travel_pressure()
	SaveSystem.save_game(SAVE_SLOT)


## Living through a world marks the creatures that saw it — but SILENTLY.
## Applied once per jump rather than nagged daily, so a team that has crossed
## six worlds quietly accumulates a history you can read on the party screen
## and nowhere else.
func _apply_travel_pressure() -> void:
	var pressures: Dictionary = world.planet.epigenetic_pressures
	if pressures.is_empty():
		return
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		for definition_id in pressures:
			if _rng.randf() < float(pressures[definition_id]) * 0.6:
				c.epigenetics.apply_mark(definition_id, 0.22)


func _spawn_fauna(planet: PlanetSeedResource) -> void:
	var depth := session.ship.fauna_depth()
	var count := clampi(int(round(float(planet.fauna_species_count) * depth)), 2, 14)
	for i in count:
		var angle := _rng.randf() * TAU
		var c := CreatureFactory.spawn_random(self, _rng, {
			"name": CreatureFactory.generate_name(_rng),
			"planet_id": planet.planet_id, "planet_name": planet.display_name,
			"divergence": planet.fauna_divergence})
		c.position = Vector2(cos(angle), sin(angle)) * _rng.randf_range(220.0, FAUNA_SPAWN_RADIUS)
		wild.append(c)


func _to_menu() -> void:
	SaveSystem.save_game(SAVE_SLOT)
	get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")


# --- Streaming ------------------------------------------------------------------------------

func _on_chunk_loaded(_planet_id: String, coord: Vector2i) -> void:
	if world == null:
		return
	var key := "%d,%d" % [coord.x, coord.y]
	if not world.loaded_chunks.has(key) or chunk_views.has(key):
		return
	var chunk: Dictionary = world.loaded_chunks[key]
	var view := ChunkView.new()
	view.set_chunk(chunk)
	chunk_layer.add_child(view)
	chunk_views[key] = view
	resource_nodes.append_array(ResourceNode.spawn_for_chunk(
		node_layer, world.planet, chunk, PlanetManager.active_summary()))


func _on_chunk_unloaded(_planet_id: String, coord: Vector2i) -> void:
	var key := "%d,%d" % [coord.x, coord.y]
	if chunk_views.has(key):
		chunk_views[key].queue_free()
		chunk_views.erase(key)
	var prefix := "%d,%d:" % [coord.x, coord.y]
	for n in resource_nodes.duplicate():
		if is_instance_valid(n) and String(n.node_key).begins_with(prefix):
			resource_nodes.erase(n)
			n.queue_free()


# --- UI ---------------------------------------------------------------------------------------

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)

	var camera := Camera2D.new()
	camera.zoom = Vector2(1.3, 1.3)
	add_child(camera)
	set_meta("camera", camera)

	_hud_panel = FxPanel.new(Color(0.4, 0.75, 1.0))
	_hud_panel.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_hud_panel.position = Vector2(12, 12)
	layer.add_child(_hud_panel)
	var hud_margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		hud_margin.add_theme_constant_override("margin_" + side, 8)
	_hud_panel.add_child(hud_margin)
	var box := VBoxContainer.new()
	hud_margin.add_child(box)

	_info = Label.new()
	box.add_child(_info)

	var hint := Label.new()
	hint.text = "WASD move · Q scan · Space fight · C throw · Tab swap · E interact · P party · J ship · Esc menu"
	hint.add_theme_color_override("font_color", Color(0.62, 0.64, 0.7))
	box.add_child(hint)

	_target_bar = Label.new()
	_target_bar.add_theme_font_size_override("font_size", 18)
	_target_bar.add_theme_color_override("font_color", Color(1.0, 0.75, 0.7))
	_target_bar.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_target_bar.add_theme_constant_override("outline_size", 5)
	_target_bar.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_target_bar.position = Vector2(-180, 24)
	layer.add_child(_target_bar)

	_prompt = Label.new()
	_prompt.add_theme_font_size_override("font_size", 16)
	_prompt.add_theme_color_override("font_color", Color(1.0, 0.9, 0.4))
	_prompt.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_prompt.add_theme_constant_override("outline_size", 5)
	_prompt.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_prompt.position = Vector2(-240, -70)
	layer.add_child(_prompt)

	var log_panel := FxPanel.new(Color(0.5, 0.55, 0.7))
	log_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	log_panel.position = Vector2(12, -150)
	log_panel.custom_minimum_size = Vector2(520, 130)
	layer.add_child(log_panel)
	var log_margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		log_margin.add_theme_constant_override("margin_" + side, 8)
	log_panel.add_child(log_margin)
	_log_label = RichTextLabel.new()
	_log_label.bbcode_enabled = true
	_log_label.scroll_following = true
	log_margin.add_child(_log_label)


func _log(text: String) -> void:
	if text.is_empty():
		return
	_log_lines.append(text)
	if _log_lines.size() > 40:
		_log_lines = _log_lines.slice(_log_lines.size() - 40)
	_log_label.text = "\n".join(_log_lines.map(func(l): return "· " + l))


func _update_info() -> void:
	if world == null or player == null:
		return
	var dex := session.discovery.totals()
	var leader := session.party.leader()
	var leader_text := "no one able"
	if leader != null:
		leader_text = "%s   %d/%d hp" % [leader.display_name(),
			int(leader.stats.hp), int(leader.stats.max_hp())]

	_info.text = "%s   ·   %s\nleading: %s\nparty %d/%d · caught %d · dex %d species / %d worlds · salvage %.0f" % [
		world.planet.display_name,
		PlanetGenerator.get_biome(world.biome_at(player.position)).get("display_name", "?"),
		leader_text,
		session.party.size(), session.party.party_limit(session.ship),
		session.party.total_caught(),
		dex["species"], dex["planets"], session.ship.salvage]

	(get_meta("camera") as Camera2D).global_position = player.global_position
