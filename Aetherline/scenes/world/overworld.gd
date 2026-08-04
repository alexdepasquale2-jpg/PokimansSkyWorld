extends Node2D
class_name Overworld

## Five-verb game surface: walk, scan, fight, catch, interact, jump.
## Keeps Task 4 culture stack (CultureRegistry + CultureTicker + perception
## LOD) and ports phase3on verb handlers onto GameSession / Catch / Combat.

const SAVE_SLOT := "campaign"
const FAUNA_COUNT := 8
const FAUNA_SPAWN_RADIUS := 900.0
const ALLY_RADIUS := 400.0
const PREDATOR_AGGRO := 0.65
const FOLLOW_DISTANCE := 62.0
const HARVEST_RANGE := 56.0
const TARGET_RANGE := 260.0
const LOD_REFRESH_INTERVAL := 0.5
const SENSE_REFRESH_INTERVAL := 0.25
const ATMOS_REFRESH_INTERVAL := 0.4
const MIND_REFRESH_INTERVAL := 0.5
const CAMERA_ZOOM := Vector2(1.65, 1.65)

var session: GameSession
var world: PlanetWorld
var player: PlayerAvatar
var chunk_layer: Node2D
var node_layer: Node2D
var chunk_views: Dictionary = {}  # "x,y" -> ChunkView
var wild: Array = []  # Creature
var resource_nodes: Array = []
var settlement: SettlementView
var settlement_runtime: SettlementRuntime
var ticker: CultureTicker
var growth: ClanGrowth
var camera: Camera2D
var atmos: CanvasModulate
var backdrop: Node2D
var haze: CanvasLayer
var _haze_rect: ColorRect
var _haze_mat: ShaderMaterial

var _rng := RandomNumberGenerator.new()
var _nearest_wild: Creature = null
var _nearest_node: ResourceNode = null
var _nearest_building: Dictionary = {}
var _party_panel: PartyPanel
var _star_map
var _ship_view: ShipView
var _inventory_panel: InventoryPanel
var _people_panel: PeoplePanel
var _neuron_panel: NeuronPanel
var _ending_screen: EndingScreen
var _service_menu: ServiceMenu

var _info: Label
var _prompt: Label
var _target_bar: Label
var _log_label: RichTextLabel
var _log_lines: Array[String] = []
var _hud_panel: FxPanel
var _target_panel: FxPanel

## Presentation throttles for the neuronal feed. Not simulation state, so neither
## is saved: a reload may repeat one line, which is cheaper than a save format
## that carries what the player has already read.
var _last_fear_line: int = -100000
var _prompted_understanding: bool = false

## HUD figures that cost a collection walk each. Refreshed on a timer, not per
## frame — see `_refresh_mind_readout`.
var _mind_timer: float = 0.0
var _cached_living: int = 0
var _cached_mind_line: String = ""

var _lod_timer: float = 0.0
var _sense_timer: float = 0.0
var _atmos_timer: float = 0.0
var _atmos_color: Color = Color(0.92, 0.94, 0.98)
var _atmos_target: Color = Color(0.92, 0.94, 0.98)
var _haze_color: Color = Color(0.55, 0.72, 0.95)
var _haze_density: float = 0.18
var _pending_chunks: Array = []


func _ready() -> void:
	_rng.randomize()
	CultureRegistry.install(int(PlanetManager.universe_seed))
	ticker = CultureTicker.new()
	ticker.name = "CultureTicker"
	ticker.enabled = true
	add_child(ticker)
	# Odyssey reward path: experience_logged -> clan gradients (one router for all).
	var rewards := CultureRewardRouter.new()
	rewards.name = "CultureRewardRouter"
	add_child(rewards)
	# A clan that is looked after grows. Before this the only way a lineage
	# continued was paying for it at a settlement.
	growth = ClanGrowth.new()
	growth.name = "ClanGrowth"
	growth.nursery = node_layer
	add_child(growth)

	session = GameSession.new()
	session.name = "GameSession"
	add_child(session)
	session.notice.connect(_log)

	# Deep backdrop so unloaded void never reads as pure black flat.
	backdrop = Node2D.new()
	backdrop.name = "Backdrop"
	backdrop.z_index = -100
	backdrop.draw.connect(_draw_backdrop)
	add_child(backdrop)

	chunk_layer = Node2D.new()
	chunk_layer.name = "ChunkLayer"
	chunk_layer.z_index = 0
	add_child(chunk_layer)
	node_layer = Node2D.new()
	node_layer.name = "NodeLayer"
	node_layer.z_index = 1
	add_child(node_layer)

	EventBus.planet_chunk_loaded.connect(_on_chunk_loaded)
	EventBus.planet_chunk_unloaded.connect(_on_chunk_unloaded)
	EventBus.archetype_crystallized.connect(_on_crystallized)
	# The emergent layer announces itself IN PLAY. Until now every one of these
	# fired into a debug bench or into nothing at all, so a player could run a
	# whole campaign without ever being told that their bloodline had mutated,
	# that the world was marking their animals, or that their clan had changed
	# its mind. The systems were working and silent, which is the same as absent.
	EventBus.mutation_occurred.connect(_on_mutation)
	EventBus.epigenetic_mark_gained.connect(_on_mark_gained)
	EventBus.culture_shifted.connect(_on_culture_shifted)
	EventBus.culture_generation_advanced.connect(_on_generation_advanced)
	EventBus.culture_forked.connect(_on_culture_forked)
	EventBus.story_event_fired.connect(_on_story_event)
	EventBus.neuronal_energy_gained.connect(_on_neuronal_energy)
	EventBus.neuron_reinforced.connect(_on_neuron_reinforced)
	EventBus.neurons_locked.connect(_on_neurons_locked)
	EventBus.neurons_lost.connect(_on_neurons_lost)
	EventBus.evolution_leap.connect(_on_evolution_leap)
	# Stakes. A run can now be lost and won, and both need somebody watching.
	EventBus.creature_born.connect(_on_creature_born)
	EventBus.creature_died.connect(_on_creature_died)
	EventBus.lineage_imperilled.connect(_on_lineage_imperilled)
	EventBus.campaign_ended.connect(_on_campaign_ended)

	_build_ui()
	if bool(Engine.get_meta("aetherline_new_campaign", true)):
		_begin_new_campaign()
	else:
		_resume_campaign()
	# Primed before the first frame, or the HUD spends half a second claiming
	# nobody is alive and warning the player that their people are dying.
	_refresh_mind_readout()


func _exit_tree() -> void:
	_unbind(EventBus.planet_chunk_loaded, _on_chunk_loaded)
	_unbind(EventBus.planet_chunk_unloaded, _on_chunk_unloaded)
	_unbind(EventBus.archetype_crystallized, _on_crystallized)
	_unbind(EventBus.mutation_occurred, _on_mutation)
	_unbind(EventBus.epigenetic_mark_gained, _on_mark_gained)
	_unbind(EventBus.culture_shifted, _on_culture_shifted)
	_unbind(EventBus.culture_generation_advanced, _on_generation_advanced)
	_unbind(EventBus.culture_forked, _on_culture_forked)
	_unbind(EventBus.story_event_fired, _on_story_event)
	_unbind(EventBus.neuronal_energy_gained, _on_neuronal_energy)
	_unbind(EventBus.neuron_reinforced, _on_neuron_reinforced)
	_unbind(EventBus.neurons_locked, _on_neurons_locked)
	_unbind(EventBus.neurons_lost, _on_neurons_lost)
	_unbind(EventBus.evolution_leap, _on_evolution_leap)
	_unbind(EventBus.creature_born, _on_creature_born)
	_unbind(EventBus.creature_died, _on_creature_died)
	_unbind(EventBus.lineage_imperilled, _on_lineage_imperilled)
	_unbind(EventBus.campaign_ended, _on_campaign_ended)


func _unbind(source: Signal, handler: Callable) -> void:
	if source.is_connected(handler):
		source.disconnect(handler)


func _on_crystallized(uid: StringName, archetype_id: StringName, _tick: int) -> void:
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c) or c.identity.uid != uid:
			continue
		var definition: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
		_log("[b]%s became %s.[/b]" % [c.display_name(),
			definition.display_name if definition != null else String(archetype_id)])
		ImpactEffect.spawn(self, c.global_position, Color(1.0, 0.85, 0.4), 160.0)
		return


## --- The emergent layer, said out loud ------------------------------------------
##
## Every handler below is deliberately quiet about anything the player has no
## stake in. A herd on the far side of the planet mutating is a true fact and
## noise; the animal in their party mutating is news. The filter is ownership,
## not distance.

## Is this one of the player's own creatures?
func _is_mine(uid: StringName) -> Creature:
	if session == null or session.party == null:
		return null
	for entry in session.party.active:
		var c: Creature = entry
		if is_instance_valid(c) and c.identity != null and c.identity.uid == uid:
			return c
	return null


func _on_mutation(uid: StringName, locus_id: StringName, _old: StringName,
		_new: StringName) -> void:
	var c := _is_mine(uid)
	if c == null:
		return
	_log(LoreVoice.mutation_sentence(c.display_name(), String(locus_id)))


func _on_mark_gained(uid: StringName, definition_id: StringName, _source: int) -> void:
	var c := _is_mine(uid)
	if c == null:
		return
	_log(LoreVoice.mark_sentence(c.display_name(), String(definition_id)))


## The clan changed its mind about something. Already throttled at the emitter
## (CultureRewardRouter.SHIFT_INTERVAL), so this cannot become chatter.
func _on_culture_shifted(culture_id: String, drive_id: String, delta: float) -> void:
	var culture := CultureRegistry.get_culture(culture_id)
	if culture == null or not _is_player_culture(culture_id):
		return
	_log(LoreVoice.shift_sentence(LoreVoice.clan_name(culture), drive_id, delta))


func _on_generation_advanced(culture_id: String, _generation: int, retained: float) -> void:
	if not _is_player_culture(culture_id):
		return
	_log("[b]%s[/b]" % LoreVoice.generation_sentence(
		CultureRegistry.get_culture(culture_id), retained))


func _on_culture_forked(parent_culture_id: String, _child_culture_id: String,
		reason: String) -> void:
	var parent := CultureRegistry.get_culture(parent_culture_id)
	if parent == null:
		return
	_log("[b]%s[/b]" % LoreVoice.fork_sentence(LoreVoice.clan_name(parent), reason))


## StoryDirector narration. It has been producing real sentences about the
## player's own animals since Phase 2 and delivering them to the genome lab.
func _on_story_event(event: Dictionary) -> void:
	var text := String(event.get("text", ""))
	if text.is_empty():
		return
	_log("[i]%s[/i]" % text)


## Somebody earned the clan something. The loudest thing in the loop that a
## player can actually cause on purpose.
##
## A FIRST is always said, because it happens once ever per kind and it is the
## sentence that teaches the player what the tree runs on. FEAR is throttled to
## one line a day here in the presenter rather than on the bus: winning a fight
## pays every time and should keep paying, but five identical lines a day would
## train the player to stop reading the feed, and the feed is where every other
## emergent system speaks.
func _on_neuronal_energy(clan_id: String, kind: String, gained: float,
		was_first: bool) -> void:
	if not _is_player_culture(clan_id):
		return
	if not was_first:
		if float(SimulationBudget.current_tick - _last_fear_line) \
				< SimulationBudget.TICKS_PER_DAY:
			return
		_last_fear_line = SimulationBudget.current_tick
	var line := LoreVoice.energy_sentence(kind, was_first)
	_log(("[b]%s[/b]" % line) if was_first else "[i]%s[/i]" % line)
	if was_first and player != null:
		ImpactEffect.spawn(self, player.global_position, Color(0.7, 0.95, 1.0), 180.0)
	_hint_at_understanding(gained)


## Spending is provisional, and the feed should say so at the moment it happens
## rather than letting the player find out at the generation boundary.
func _on_neuron_reinforced(clan_id: String, neuron_id: String) -> void:
	if not _is_player_culture(clan_id):
		return
	_log(LoreVoice.reinforced_sentence(neuron_id))


## Say it once, the first time there is anything to spend. After that the HUD
## carries it and the feed stays out of the way.
func _hint_at_understanding(_gained: float) -> void:
	if _prompted_understanding:
		return
	var tree := NeuronalTree.for_clan(_player_clan_id())
	if not tree.affordable_ids().is_empty():
		_prompted_understanding = true
		_log("[i]They have understood enough to change something about "
			+ "themselves. Press N.[/i]")


func _on_neurons_locked(clan_id: String, neuron_ids: Array) -> void:
	if not _is_player_culture(clan_id):
		return
	_log("[b]%s[/b]" % LoreVoice.neurons_locked_sentence(neuron_ids))


## The loss is the mechanic, so it is said loudly and it says why.
func _on_neurons_lost(clan_id: String, neuron_ids: Array) -> void:
	if not _is_player_culture(clan_id):
		return
	_log("[b]%s[/b]" % LoreVoice.neurons_lost_sentence(neuron_ids))


func _on_evolution_leap(clan_id: String, leap: int, locked_neurons: int) -> void:
	if not _is_player_culture(clan_id):
		return
	_log("[b]%s[/b]" % LoreVoice.leap_sentence(leap, locked_neurons))
	if player != null:
		ImpactEffect.spawn(self, player.global_position, Color(1.0, 0.9, 0.5), 320.0)
	# A leap is the only thing that can win the run, so the arc is asked here
	# rather than waiting for the next death to prompt it.
	_evaluate_arc()


## Somebody was born. `creature_born` has existed since Phase 1 with no listener
## anywhere, because nothing in play produced a birth that was not the player
## paying for one at a settlement.
func _on_creature_born(child_uid: StringName, parent_a_uid: StringName,
		_parent_b_uid: StringName) -> void:
	var child := SimulationBudget.node_for(child_uid) as Creature
	if child == null or not is_instance_valid(child):
		return
	if not _is_player_culture(CultureRegistry.culture_for(child).culture_id):
		return
	var mother := String(session.roster_names.get(String(parent_a_uid), ""))
	_log("[b]%s[/b]" % LoreVoice.birth_sentence(child.display_name(), mother))
	# Into the party if there is room for them, and left with the clan if not —
	# `accept` stores and frees an overflow, which would delete a newborn the
	# support arithmetic has just started counting.
	if session.party.has_room(session.ship):
		session.party.accept(child, session.ship)
		session.enroll(child)
	_refresh_mind_readout()


## Somebody died. If they were yours, it matters, and it may have ended the run.
func _on_creature_died(uid: StringName, cause: String, _tick: int) -> void:
	if session == null:
		return
	var name := String(session.roster_names.get(String(uid), ""))
	var mine := name != "" or _is_mine(uid) != null
	if mine:
		session.arc.note_death()
		_log("[b]%s[/b]" % LoreVoice.death_sentence(
			name if name != "" else "One of yours", cause))
	_evaluate_arc()


## The count that decides whether the lineage still exists.
##
## Read from the live party and colony rather than a tally kept somewhere: a
## number maintained by hand is a number that eventually disagrees with the
## bodies, and this one decides whether the player has lost.
## How many of the player's clan are still alive.
##
## Same number the generational boundary uses, from the same owner — see
## `CultureRegistry.living_members`. Counting the party and the settlers by hand
## here gave a third answer, and the HUD's death warning and the boundary's
## verdict have to be the same arithmetic or the warning is decoration.
func _living_clan() -> int:
	if session == null:
		return 0
	var counted := CultureRegistry.living_members(_player_clan_id())
	if counted > 0 or session.party == null:
		return counted
	var living := 0
	for entry in session.party.active:
		var c: Creature = entry
		if is_instance_valid(c) and c.needs != null and not c.needs.is_dead():
			living += 1
	return living


func _evaluate_arc() -> void:
	if session == null or session.arc.is_resolved():
		return
	var culture := CultureRegistry.get_culture("culture_colony")
	session.arc.evaluate(_living_clan(), culture.generation if culture != null else 0)


func _on_lineage_imperilled(_clan_id: String, living: int) -> void:
	_log("[b]%s[/b]" % LoreVoice.imperilled_sentence(living))


func _on_campaign_ended(_clan_id: String, outcome: int, chronicle: Dictionary) -> void:
	for line in LoreVoice.ending_lines(outcome, chronicle):
		_log(line)
	SimulationBudget.set_paused(true)
	_show_ending(outcome, chronicle)


## Take the screen. Pausing and logging four lines into the same feed that
## carries every other event is not an ending, and it left the player frozen in
## place with nowhere to go.
func _show_ending(outcome: int, chronicle: Dictionary) -> void:
	if _ending_screen == null:
		var layer := CanvasLayer.new()
		layer.layer = 20   # Above every panel; nothing outranks the end of a run.
		layer.name = "EndingLayer"
		add_child(layer)
		_ending_screen = EndingScreen.new()
		_ending_screen.begin_again.connect(_restart_campaign)
		_ending_screen.to_menu.connect(_abandon_to_menu)
		layer.add_child(_ending_screen)
	_ending_screen.show_ending(outcome, chronicle)


## Start over, and CLEAR THE SLOT FIRST.
##
## Without the delete, the finished run stays on disk: the menu's Continue is
## enabled, and taking it reopens a resolved campaign whose arc has already
## latched and can never fire again. A player would be handed their own corpse
## with no ending and no way to tell it had happened.
func _restart_campaign() -> void:
	SaveSystem.delete_slot(SAVE_SLOT)
	SimulationBudget.set_paused(false)
	Engine.set_meta("aetherline_new_campaign", true)
	get_tree().reload_current_scene()


## Leave a finished run without writing it back to disk. `_to_menu` saves on the
## way out, which is right for a run still in progress and exactly wrong here.
func _abandon_to_menu() -> void:
	SaveSystem.delete_slot(SAVE_SLOT)
	SimulationBudget.set_paused(false)
	get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")


## Any culture the player's own creatures belong to.
## The clan the player is actually travelling with.
##
## Read from the party rather than assumed, because `culture_colony` stops being
## the answer the moment a culture forks — a colony left behind takes a
## planet-local id, and the HUD and the Understandings screen must follow the
## people on the ship, not the name they started under. Falls back to the
## founding id before there is a party to ask.
func _player_clan_id() -> String:
	if session != null and session.party != null:
		for entry in session.party.active:
			var c: Creature = entry
			if is_instance_valid(c) and c.identity != null:
				return CultureRegistry.culture_for(c).culture_id
	return "culture_colony"


func _is_player_culture(culture_id: String) -> bool:
	if session == null or session.party == null:
		return false
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		if CultureRegistry.culture_for(c).culture_id == culture_id:
			return true
	return false


# --- Campaign --------------------------------------------------------------------

func _menu_open() -> bool:
	return (_party_panel != null and _party_panel.visible) \
		or (_star_map != null and _star_map.visible) \
		or (_ship_view != null and _ship_view.visible) \
		or (_inventory_panel != null and _inventory_panel.visible) \
		or (_people_panel != null and _people_panel.visible) \
		or (_neuron_panel != null and _neuron_panel.visible) \
		or (_service_menu != null and _service_menu.visible) \
		or (_ending_screen != null and _ending_screen.visible)


func _begin_new_campaign() -> void:
	session.start_new_campaign()
	_ensure_player()
	var planet := PlanetManager.create_planet()
	_land_on(planet.planet_id)

	# Human companion: same stack as fauna, explicit colony culture (Odyssey clan brain).
	var starter := CreatureFactory.spawn_random(self, _rng, {
		"origin_kind": "gifted",
		"is_human": true,
		"species_id": "aether_base",
		"culture_id": "culture_colony",
		"lineage_id": "lin_colony",
		"planet_id": planet.planet_id,
		"planet_name": ShipSystem.HOME_PLANET,
		"name": "Vess",
	})
	starter.position = player.position + Vector2(40, 20)
	session.party.active.append(starter)
	session.enroll(starter)
	_bind_culture_member(starter)
	session.discovery.scan_creature(starter, world.planet, session.ship)

	world.set_focus(player.global_position)
	_drain_stream_budget()
	_spawn_fauna(planet)
	_refresh_lod()
	_refresh_world_senses()
	_refresh_atmosphere()
	if backdrop != null:
		backdrop.queue_redraw()

	var colony := CultureRegistry.ensure("culture_colony", "Survivors")
	_log("%s is gone. You got out with one human and a failing ship." % ShipSystem.HOME_PLANET)
	_log("%s walks with you — clan \"%s\"." % [starter.display_name(), colony.display_name])
	_log("Cultures learn from what they live. Villages keep their own fire.")
	if settlement_runtime != null and not settlement_runtime.layout.is_empty():
		_log("Smoke on the wind: %s." % settlement_runtime.describe())
	_log("Q scan · Space fight · C throw · E village/ship · J jump · U ship bay")


func _resume_campaign() -> void:
	if not SaveSystem.load_game(SAVE_SLOT) or PlanetManager.active_planet_id.is_empty():
		_begin_new_campaign()
		return
	_ensure_player()
	_land_on(PlanetManager.active_planet_id)
	if not session.pending_party.is_empty():
		session.party.from_dict(session.pending_party, self)
		session.pending_party = {}
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		c.home_planet_id = PlanetManager.active_planet_id
		c.position = player.position + Vector2(40, 20)
		SimulationBudget.register_creature(c.identity.uid, c, PlanetManager.active_planet_id)
	_spawn_fauna(world.planet)
	_refresh_lod()
	_refresh_world_senses()
	_refresh_atmosphere()
	if backdrop != null:
		backdrop.queue_redraw()
	_log("Back on %s." % world.planet.display_name)

	# A run that was already over when it was saved must not resume as if it were
	# not. The arc latches, so nothing would ever end it a second time: the player
	# would be walking a dead clan around a live world forever.
	if session.arc != null and session.arc.is_resolved():
		SimulationBudget.set_paused(true)
		_show_ending(session.arc.outcome, session.arc.chronicle())


func _ensure_player() -> void:
	if player != null:
		return
	player = PlayerAvatar.new()
	player.name = "Player"
	player.position = Vector2.ZERO
	add_child(player)

	camera = Camera2D.new()
	camera.name = "Camera2D"
	camera.enabled = true
	camera.zoom = CAMERA_ZOOM
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 8.0
	player.add_child(camera)

	if atmos == null:
		atmos = CanvasModulate.new()
		atmos.name = "Atmosphere"
		atmos.color = _atmos_color
		add_child(atmos)
	if haze == null:
		haze = CanvasLayer.new()
		haze.name = "WorldHaze"
		haze.layer = 2
		add_child(haze)
		_haze_rect = ColorRect.new()
		_haze_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
		_haze_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_haze_rect.color = Color(1, 1, 1, 1)
		var haze_path := "res://shaders/world_haze.gdshader"
		if ResourceLoader.exists(haze_path):
			_haze_mat = ShaderMaterial.new()
			_haze_mat.shader = load(haze_path)
			_haze_mat.set_shader_parameter("density", _haze_density)
			_haze_mat.set_shader_parameter("haze_color", Vector3(_haze_color.r, _haze_color.g, _haze_color.b))
			_haze_rect.material = _haze_mat
		haze.add_child(_haze_rect)


func _land_on(planet_id: String) -> void:
	PlanetManager.land(planet_id)
	if world != null:
		world.queue_free()
		world = null
	world = PlanetWorld.new()
	world.name = "PlanetWorld"
	add_child(world)
	world.setup(PlanetManager.active_planet(), PlanetManager.active_summary())

	_teardown_settlement()
	if SettlementGenerator.has_settlement(world.planet):
		_build_settlement(world.planet)

	var first_visit := session.discovery.register_planet(world.planet)
	if first_visit:
		session.ship.add_salvage(DiscoverySystem.SALVAGE_PLANET)
	(load("res://scenes/ui/landfall_card.gd") as GDScript).call("show_for",
		self, world.planet, session.discovery, first_visit)
	if player != null:
		world.set_focus(player.global_position)


func _clear_surface() -> void:
	for key in chunk_views.keys():
		var view: Node = chunk_views[key]
		if is_instance_valid(view):
			view.queue_free()
	chunk_views.clear()
	for n in resource_nodes:
		if is_instance_valid(n):
			n.queue_free()
	resource_nodes.clear()
	for c in wild:
		if is_instance_valid(c):
			c.queue_free()
	wild.clear()
	_teardown_settlement()
	if world != null:
		world.queue_free()
		world = null
	_nearest_wild = null
	_nearest_node = null
	_nearest_building = {}


## Depart -> land new planet -> environmental pressure -> autosave campaign.
func _jump_to(planet_id: String = "") -> void:
	if session == null or player == null:
		return
	var carried: Array = []
	for entry in session.party.active:
		var c: Creature = entry
		if is_instance_valid(c) and c.identity != null:
			carried.append(String(c.identity.uid))
	var serializer := func(uid: StringName) -> Dictionary:
		var node := SimulationBudget.node_for(uid)
		if node != null and node.has_method("to_dict"):
			return node.to_dict()
		return {}
	PlanetManager.depart(carried, serializer)
	_clear_surface()
	session.prepare_hold()
	session.complete_jump()

	var next_id := planet_id
	if next_id.is_empty():
		var next := PlanetManager.create_planet()
		next_id = next.planet_id
	_land_on(next_id)

	# _land_on places the player near a village when one exists; otherwise origin.
	if settlement_runtime == null or settlement_runtime.layout.is_empty():
		player.position = Vector2.ZERO
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		c.home_planet_id = next_id
		c.position = player.position + Vector2(_rng.randf_range(-40, 40), _rng.randf_range(-30, 30))
		SimulationBudget.register_creature(c.identity.uid, c, next_id)
	_apply_travel_pressure()
	_spawn_fauna(world.planet)
	# Party culture remembers the jump.
	for entry in session.party.active:
		var c: Creature = entry
		if is_instance_valid(c) and c.experience != null:
			c.experience.log_event("biomes_entered", 1.0)
			c.experience.log_event("distance_travelled", 800.0)
	world.set_focus(player.global_position)
	_refresh_lod()
	_refresh_world_senses()
	_refresh_atmosphere()
	if backdrop != null:
		backdrop.queue_redraw()
	SaveSystem.save_game(SAVE_SLOT)
	var folk := ""
	if settlement_runtime != null and not settlement_runtime.layout.is_empty():
		folk = "  " + settlement_runtime.describe()
	_log("Jumped to %s. Local herds and folk bring their own cultures.%s" % [
		world.planet.display_name, folk])


func _jump_to_new_world() -> void:
	_jump_to("")


func _apply_travel_pressure() -> void:
	if world == null or world.planet == null or session == null:
		return
	var pressures: Dictionary = world.planet.epigenetic_pressures
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c) or c.epigenetics == null:
			continue
		for definition_id in pressures:
			if _rng.randf() < float(pressures[definition_id]) * 0.6:
				c.epigenetics.apply_mark(definition_id, 0.22)
	PlanetManager.apply_environmental_pressure(1.0)


func _open_star_map() -> void:
	if session == null:
		return
	# Close overlapping menus so only the map is interactive.
	if _ship_view != null:
		_ship_view.visible = false
	if _inventory_panel != null:
		_inventory_panel.visible = false
	if _star_map == null:
		var layer := CanvasLayer.new()
		layer.layer = 7
		layer.name = "StarMapLayer"
		add_child(layer)
		_star_map = (load("res://scenes/ui/star_map.gd") as GDScript).new()
		layer.add_child(_star_map)
		_star_map.destination_chosen.connect(_jump_to)
	_star_map.max_candidates = session.ship.jump_candidates()
	_star_map.scan_depth = session.ship.scan_depth()
	_star_map.open(session.discovery.planets.keys())


func _toggle_ship() -> void:
	if session == null:
		return
	if _ship_view != null and _ship_view.visible:
		_ship_view.visible = false
		return
	if _ship_view == null:
		var layer := CanvasLayer.new()
		layer.layer = 7
		layer.name = "ShipLayer"
		add_child(layer)
		_ship_view = (load("res://scenes/ui/ship_view.gd") as GDScript).new() as ShipView
		layer.add_child(_ship_view)
		_ship_view.returned_to_surface.connect(func(): _ship_view.visible = false)
		_ship_view.open_star_map_requested.connect(_open_star_map)
		_ship_view.open_inventory_requested.connect(_open_inventory)
		_ship_view.jump_requested.connect(_jump_to)
	_ship_view.open(session)


func _open_inventory() -> void:
	if session == null:
		return
	if _inventory_panel != null and _inventory_panel.visible:
		_inventory_panel.close()
		return
	if _inventory_panel == null:
		var layer := CanvasLayer.new()
		layer.layer = 7
		layer.name = "InventoryLayer"
		add_child(layer)
		_inventory_panel = InventoryPanel.new()
		layer.add_child(_inventory_panel)
		_inventory_panel.changed.connect(func():
			if _info != null:
				_update_info())
	if _ship_view != null:
		_ship_view.visible = false
	_inventory_panel.open(session)


func _open_service(entry: Dictionary) -> void:
	if session == null or entry.is_empty():
		return
	if _service_menu == null:
		var layer := CanvasLayer.new()
		layer.layer = 7
		layer.name = "ServiceLayer"
		add_child(layer)
		_service_menu = ServiceMenu.new()
		layer.add_child(_service_menu)
		_service_menu.closed.connect(func(): pass)
	_service_menu.settlement_runtime = settlement_runtime
	_service_menu.open(entry, session, session.party.active)


func _build_settlement(planet: PlanetSeedResource) -> void:
	var layout := SettlementGenerator.generate(planet)
	if layout.is_empty():
		return
	settlement = SettlementView.new()
	settlement.name = "Settlement"
	chunk_layer.add_child(settlement)
	settlement_runtime = SettlementRuntime.new()
	settlement_runtime.name = "SettlementRuntime"
	add_child(settlement_runtime)
	settlement_runtime.setup(layout, self, settlement)
	settlement_runtime.culture_taught.connect(func(text: String):
		if not text.is_empty():
			_log(text))
	settlement_runtime.settler_recruited.connect(_on_settler_recruited)
	# Settlers are living culture hosts — include them in wild-adjacent systems.
	for c in settlement_runtime.settlers:
		if is_instance_valid(c) and not wild.has(c):
			wild.append(c)
	# Land within walking distance of the fire — Odyssey: people, not empty dirt.
	if player != null:
		var plaza := settlement_runtime.center()
		if player.position.distance_to(plaza) > 220.0:
			var ang := _rng.randf() * TAU
			player.position = plaza + Vector2(cos(ang), sin(ang)) * _rng.randf_range(90.0, 160.0)
	_log("Arrived near %s." % settlement_runtime.describe())


func _teardown_settlement() -> void:
	if settlement_runtime != null:
		for c in settlement_runtime.settlers:
			if is_instance_valid(c):
				wild.erase(c)
		settlement_runtime.clear()
		settlement_runtime.queue_free()
		settlement_runtime = null
	if settlement != null:
		settlement.queue_free()
		settlement = null


func _on_settler_recruited(creature: Creature) -> void:
	if creature == null or not is_instance_valid(creature) or session == null:
		return
	wild.erase(creature)
	if creature.identity != null:
		creature.identity.culture_id = &"culture_colony"
	_bind_culture_member(creature)
	session.enroll(creature)
	var where := session.party.accept(creature, session.ship)
	if where == "party":
		_log("%s joins your party — and the Survivors' fire." % creature.display_name())
	else:
		_log("%s boards the ship (party full)." % creature.display_name())
	ImpactEffect.spawn(self, creature.global_position, Color(0.55, 0.9, 0.65), 90.0)


## The screen the whole simulation exists to justify.
func _open_people() -> void:
	if session == null:
		return
	if _people_panel == null:
		var layer := CanvasLayer.new()
		layer.layer = 6
		layer.name = "PeopleLayer"
		add_child(layer)
		_people_panel = PeoplePanel.new()
		_people_panel.set_anchors_preset(Control.PRESET_CENTER)
		_people_panel.position = Vector2(180, 70)
		layer.add_child(_people_panel)
	_people_panel.open(session)


## Where the player decides what their people become.
func _open_neurons() -> void:
	if session == null:
		return
	if _neuron_panel == null:
		var layer := CanvasLayer.new()
		layer.layer = 6
		layer.name = "NeuronLayer"
		add_child(layer)
		_neuron_panel = NeuronPanel.new()
		_neuron_panel.position = Vector2(150, 50)
		layer.add_child(_neuron_panel)
	_neuron_panel.open(session, _player_clan_id())


func _to_menu() -> void:
	SaveSystem.save_game(SAVE_SLOT)
	get_tree().change_scene_to_file("res://scenes/ui/main_menu.tscn")


# --- Loop ------------------------------------------------------------------------

func _process(delta: float) -> void:
	if player == null or world == null:
		return
	if _menu_open():
		return

	_drain_stream_budget()
	PlayerWalker.move(player, world, delta)
	world.set_focus(player.global_position)
	_follow(delta)
	_tick_culture_bodies(delta)
	if settlement_runtime != null:
		settlement_runtime.tick(delta, player, world)
	_update_targets()
	_tick_combat(delta)

	_lod_timer += delta
	if _lod_timer >= LOD_REFRESH_INTERVAL:
		_lod_timer = 0.0
		_refresh_lod()

	_sense_timer += delta
	if _sense_timer >= SENSE_REFRESH_INTERVAL:
		_sense_timer = 0.0
		_refresh_world_senses()

	_mind_timer += delta
	if _mind_timer >= MIND_REFRESH_INTERVAL:
		_mind_timer = 0.0
		_refresh_mind_readout()

	_atmos_timer += delta
	if _atmos_timer >= ATMOS_REFRESH_INTERVAL:
		_atmos_timer = 0.0
		_refresh_atmosphere()
	if atmos != null:
		_atmos_color = _atmos_color.lerp(_atmos_target, clampf(delta * 1.8, 0.0, 1.0))
		atmos.color = _atmos_color
	# skip continuous backdrop redraw (FPS)

	_update_info()


func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	# Nothing outranks the end of a run. Without this the player can walk the
	# corpse around and open panels behind their own ending.
	if _ending_screen != null and _ending_screen.visible:
		return
	if _star_map != null and _star_map.visible:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_J:
			_star_map.visible = false
		return
	if _ship_view != null and _ship_view.visible:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_U or event.keycode == KEY_O:
			_ship_view.visible = false
		elif event.keycode == KEY_J:
			_ship_view.visible = false
			_open_star_map()
		elif event.keycode == KEY_I:
			_ship_view.visible = false
			_open_inventory()
		return
	if _inventory_panel != null and _inventory_panel.visible:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_I:
			_inventory_panel.close()
		return
	if _service_menu != null and _service_menu.visible:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_E:
			_service_menu.visible = false
		return
	if _party_panel != null and _party_panel.visible:
		if event.keycode == KEY_P or event.keycode == KEY_ESCAPE:
			_party_panel.close()
		return
	if _neuron_panel != null and _neuron_panel.visible:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_N:
			_neuron_panel.close_panel()
		elif event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
			_neuron_panel.reinforce_selected()
		elif event.keycode == KEY_X:
			_neuron_panel.take_leap()
		return
	if _people_panel != null and _people_panel.visible:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_L:
			_people_panel.close_panel()
		elif event.keycode == KEY_V:
			# The one keystroke between "who your people are" and the policy
			# that makes them that way.
			_people_panel.toggle_advanced()
		return
	match event.keycode:
		KEY_Q:
			_scan()
		KEY_E:
			_interact()
		KEY_SPACE:
			_attack()
		KEY_C:
			_throw()
		KEY_TAB:
			_cycle_leader()
		KEY_P:
			_open_party()
		KEY_J:
			_open_star_map()
		KEY_U, KEY_O:
			_toggle_ship()
		KEY_I:
			_open_inventory()
		KEY_L:
			_open_people()
		KEY_N:
			_open_neurons()
		KEY_M:
			_to_menu()


func _follow(delta: float) -> void:
	if session == null:
		return
	for i in session.party.active.size():
		var c: Creature = session.party.active[i]
		if not is_instance_valid(c):
			continue
		var slot := Vector2(cos(i * 2.4), sin(i * 2.4)) * FOLLOW_DISTANCE
		var goal := player.position + slot
		if c.position.distance_to(goal) > 12.0:
			var speed := 80.0
			if c.stats != null:
				speed = maxf(40.0, c.stats.stat("move_speed") * 1.5)
			c.position = c.position.move_toward(goal, speed * delta)


func _update_targets() -> void:
	_nearest_wild = null
	var best := TARGET_RANGE
	for entry in wild:
		var c: Creature = entry
		if not is_instance_valid(c) or c.stats == null or c.stats.hp <= 0.0:
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

	if settlement_runtime != null:
		_nearest_building = settlement_runtime.building_at(player.position)
	elif settlement != null:
		_nearest_building = settlement.building_at(player.position)
	else:
		_nearest_building = {}
	_update_prompt()


func _update_prompt() -> void:
	if _prompt == null:
		return
	var parts: Array[String] = []
	if not _nearest_building.is_empty():
		var definition := SettlementGenerator.get_building(_nearest_building["building_id"])
		parts.append("[E] enter %s" % definition.get("display_name", "building"))
	elif player != null and player.position.length() < 56.0 and _nearest_node == null:
		parts.append("[E] ship bay  ·  [U] upgrades  ·  [I] inventory  ·  [J] jump")
	elif _nearest_node != null:
		parts.append("[E] gather %s" % _nearest_node.resource_id)

	if _nearest_wild != null and session != null:
		var chance := CatchSystem.chance_for(_nearest_wild, session.ship)
		parts.append("[Space] fight    [C] throw — %s (%d%%)" % [
			CatchSystem.describe_chance(chance), int(chance * 100.0)])
	_prompt.text = "        ".join(parts)

	if _target_bar == null:
		return
	if _nearest_wild != null:
		var hp := _nearest_wild.stats.hp_fraction()
		var bars := int(round(hp * 16.0))
		_target_bar.text = "TARGET  %s\n[%s%s]  %d%%%s" % [
			_nearest_wild.display_name(),
			"█".repeat(bars), "░".repeat(16 - bars), int(hp * 100.0),
			"   DOWNED" if _nearest_wild.stats.downed else ""]
		if _target_panel != null:
			_target_panel.visible = true
	else:
		_target_bar.text = ""
		if _target_panel != null:
			_target_panel.visible = false


# --- Verbs -----------------------------------------------------------------------

func _scan() -> void:
	if player == null or session == null or world == null:
		return
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
		_log_phenotype_summary(c, String(result["name"]))
		_log_culture_summary(c)
		if c.experience != null and bool(result["new"]):
			c.experience.log_event("anomaly_investigated", 1.0)
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


## What the player is told when they look at one of their own animals.
##
## Was: "clan lin_00000000_0004 · creature · gen 3 · 412 lessons · lean
## foraging_priority 14%". Every term in that line is a true fact about a running
## system and not one of them is a sentence. The numbers still exist and are one
## keystroke away in the People menu; here the game speaks English.
func _log_culture_summary(c: Creature) -> void:
	if c == null or c.identity == null:
		return
	var culture := CultureRegistry.culture_for(c)
	_log("  %s" % LoreVoice.clan_headline(culture))
	_log("  %s" % LoreVoice.clan_history(culture))
	var becoming := LoreVoice.creature_becoming(c)
	if not becoming.is_empty():
		_log("  %s" % becoming)


func _log_phenotype_summary(c: Creature, species_name: String) -> void:
	if c.stats == null:
		return
	var ph := c.stats.phenotype()
	var stage := ""
	if c.archetype != null and c.archetype.state != null:
		var best_id := ""
		var best_p := 0.0
		for archetype_id in c.archetype.state.progress:
			if c.archetype.state.is_crystallized(archetype_id):
				var d: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
				stage = " · %s" % (d.display_name if d != null else String(archetype_id))
				best_id = ""
				break
			var p := c.archetype.state.get_progress(archetype_id)
			if p > best_p:
				best_p = p
				best_id = String(archetype_id)
		if stage.is_empty() and not best_id.is_empty() and best_p > 0.15:
			var def: ArchetypeDefinitionResource = GenomeDB.get_archetype(best_id)
			var label := def.display_name if def != null else best_id
			stage = " · becoming %s (%d%%)" % [label, int(best_p * 100.0)]
	_log("%s [%s]: size %.1f · atk %.1f · armor %.1f%s" % [
		c.display_name(), species_name,
		float(ph.get("size", 1.0)),
		float(ph.get("attack_power", 0.0)),
		float(ph.get("armor", 0.0)),
		stage])


func _attack() -> void:
	if _nearest_wild == null or session == null:
		return
	var leader := session.party.leader()
	if leader == null:
		_log("Nothing in your party can fight. Rest at a settlement.")
		return
	if leader.combat != null and not leader.combat.ready_to_attack():
		return

	# Close enough to trade blows.
	leader.position = leader.position.move_toward(_nearest_wild.position, 40.0)
	if leader.combat != null and leader.position.distance_to(_nearest_wild.position) > leader.combat.attack_range():
		return

	if leader.combat != null:
		leader.combat.reset_cooldown()
		leader.combat.engaged = true
	if _nearest_wild.combat != null:
		_nearest_wild.combat.engaged = true

	var target := _nearest_wild
	var log_hits: Array = CombatSystem.fight_round(leader, target, _rng)
	for result in log_hits:
		var r: Dictionary = result
		if not bool(r.get("hit", false)):
			DamagePopup.spawn(self, target.global_position, 0.0, "miss")
			continue
		var dmg := float(r.get("damage", 0.0))
		ImpactEffect.spawn(self, target.global_position, Color(1.0, 0.75, 0.3), 40.0 + dmg * 1.2)
		DamagePopup.spawn(self, target.global_position, dmg)
	if is_instance_valid(target) and target.stats.downed:
		_log("%s is down — good time to throw." % target.display_name())
	elif is_instance_valid(target) and target.stats.hp <= 0.0:
		_log("%s died." % target.display_name())
		wild.erase(target)
		session.ship.add_salvage(3.0)
		target.queue_free()
		_nearest_wild = null


func _throw() -> void:
	if _nearest_wild == null or session == null or player == null:
		return
	if player.position.distance_to(_nearest_wild.position) > 220.0:
		_log("Too far. Get closer.")
		return

	var target := _nearest_wild
	var chance := CatchSystem.chance_for(target, session.ship)
	var result := CatchSystem.attempt(target, session.ship, _rng)
	ScanEffect.sweep(self, target.global_position, 70.0, Color(1.0, 0.85, 0.4))

	if not bool(result["caught"]):
		DamagePopup.spawn(self, target.global_position, 0.0, "miss")
		_log("%s broke free. (%d%%)" % [target.display_name(), int(chance * 100.0)])
		return

	wild.erase(target)
	var entry := session.discovery.scan_creature(target, world.planet, session.ship)
	if bool(entry["new"]):
		_log("Catalogued: %s" % entry["name"])
	# Fold the catch into the colony culture (Odyssey: recruitment is learning).
	if target.experience != null:
		target.experience.log_event("creature_calmed", 1.0)
	# Enroll before accept — storage path frees the live node.
	session.enroll(target)
	# Join the player clan's brain going forward.
	if target.identity != null:
		target.identity.culture_id = &"culture_colony"
	_bind_culture_member(target)
	session.discovery.mark_tamed(target.genetics.genome)
	var where := session.party.accept(target, session.ship)
	session.ship.add_salvage(10.0)
	session.ship.record("tamed", 1.0, true)
	ImpactEffect.spawn(self, player.global_position, Color(0.6, 0.9, 1.0), 110.0)

	if where == "party":
		_log("Caught %s! It joins your party — and the Survivors' culture." % target.display_name())
	else:
		_log("Caught %s! Party is full — sent to the ship." % target.display_name())
	_nearest_wild = null


func _cycle_leader() -> void:
	if session == null:
		return
	var next := session.party.cycle()
	if next != null:
		_log("%s steps forward." % next.display_name())


func _interact() -> void:
	if session == null:
		return
	# Settlement doors open the full service menu (trade, breed, craft…).
	if not _nearest_building.is_empty():
		_open_service(_nearest_building)
		return
	# Near origin = lander / ship bay.
	if player != null and player.position.length() < 56.0 and _nearest_node == null:
		_toggle_ship()
		_log("Ship bay. Upgrade modules, pack the hold, open the star map.")
		ImpactEffect.spawn(self, player.global_position, Color(0.45, 0.7, 1.0), 90.0)
		return
	if _nearest_node == null:
		return
	var yielded := _nearest_node.harvest(session.party.leader())
	if yielded <= 0.0:
		return
	session.ship.add_salvage(yielded * 0.35)
	session.gain(_nearest_node.resource_id, yielded)
	DamagePopup.spawn(self, _nearest_node.global_position, yielded, "heal")
	ActionEffects.apply(self, "harvest", {"name": _nearest_node.resource_id})
	var summary := PlanetManager.active_summary()
	if summary != null:
		summary.resource_depletion[_nearest_node.node_key] = _nearest_node.remaining / 40.0
	if _nearest_node.depleted():
		resource_nodes.erase(_nearest_node)
		_nearest_node.queue_free()
		_nearest_node = null


func _open_party() -> void:
	if session == null:
		return
	if _party_panel == null:
		var layer := CanvasLayer.new()
		layer.layer = 6
		layer.name = "PartyLayer"
		add_child(layer)
		_party_panel = PartyPanel.new()
		layer.add_child(_party_panel)
	_party_panel.open(session, self)


# --- Combat tick (engaged wild retaliate) ----------------------------------------

func _tick_combat(delta: float) -> void:
	if session == null:
		return
	var leader := session.party.leader()
	for entry in session.party.active + wild:
		var c: Creature = entry
		if is_instance_valid(c) and c.combat != null:
			c.combat.tick(delta)
	if leader == null:
		return

	for entry in wild.duplicate():
		var beast: Creature = entry
		if not is_instance_valid(beast) or beast.stats == null:
			continue
		if beast.stats.hp <= 0.0 or beast.stats.downed:
			continue
		if beast.combat == null:
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
			var result := CombatSystem.resolve_attack(beast, leader, _rng)
			if bool(result.get("hit", false)):
				ImpactEffect.spawn(self, leader.global_position, Color(1.0, 0.45, 0.35),
					36.0 + float(result.get("damage", 0.0)))
				DamagePopup.spawn(self, leader.global_position, float(result.get("damage", 0.0)))
				if bool(result.get("downed", false)):
					_log("%s is down!" % leader.display_name())
				elif bool(result.get("killed", false)):
					_log("%s fell." % leader.display_name())


# --- World systems (LOD / senses / fauna / stream) -------------------------------

func _draw_backdrop() -> void:
	var centre := player.global_position if player != null else Vector2.ZERO
	var extent := 2400.0
	var rect := Rect2(centre.x - extent, centre.y - extent, extent * 2.0, extent * 2.0)
	# Planet-tinted void so unloaded chunks never read as flat black.
	var deep := Color(0.05, 0.06, 0.09)
	var mid := Color(0.09, 0.11, 0.15)
	if world != null and world.planet != null:
		var p := world.planet
		if p.mean_temperature_c < -10.0:
			deep = Color(0.04, 0.06, 0.11)
			mid = Color(0.08, 0.12, 0.18)
		elif p.mean_temperature_c > 32.0:
			deep = Color(0.09, 0.05, 0.04)
			mid = Color(0.14, 0.09, 0.06)
		elif p.hydrosphere_fraction > 0.55:
			deep = Color(0.04, 0.07, 0.11)
			mid = Color(0.07, 0.12, 0.16)
	backdrop.draw_rect(rect, deep, true)
	for i in 7:
		var t := float(i) / 7.0
		var r := 220.0 + t * 1050.0
		var c := mid.lerp(deep, t)
		c.a = 0.38 - t * 0.04
		backdrop.draw_circle(centre, r, c)
	# Sparse distant "hills" silhouettes for depth.
	if world != null and world.planet != null:
		var seed_v := int(world.planet.seed)
		for i in 12:
			var a := float((seed_v + i * 37) % 360) * TAU / 360.0
			var dist := 900.0 + float((seed_v + i * 91) % 700)
			var pos := centre + Vector2(cos(a), sin(a)) * dist
			var h := 40.0 + float((seed_v + i * 13) % 80)
			backdrop.draw_circle(pos, h, Color(mid.r, mid.g, mid.b, 0.22))


func _refresh_atmosphere() -> void:
	if world == null or player == null:
		return
	var biome_id := world.biome_at(player.global_position)
	var density := 0.16
	var wind := 0.3
	var haze_col := Color(0.55, 0.72, 0.95)
	if biome_id.is_empty():
		_atmos_target = Color(0.92, 0.94, 0.98)
	else:
		match biome_id:
			"biome_ice_waste", "biome_tundra":
				_atmos_target = Color(0.86, 0.92, 1.0)
				haze_col = Color(0.70, 0.82, 0.98)
				density = 0.22
				wind = 0.55
			"biome_desert", "biome_savanna":
				_atmos_target = Color(1.0, 0.95, 0.86)
				haze_col = Color(0.92, 0.78, 0.48)
				density = 0.28
				wind = 0.7
			"biome_jungle", "biome_forest", "biome_taiga":
				_atmos_target = Color(0.88, 0.97, 0.88)
				haze_col = Color(0.45, 0.72, 0.48)
				density = 0.20
				wind = 0.25
			"biome_ashland":
				_atmos_target = Color(1.0, 0.88, 0.84)
				haze_col = Color(0.55, 0.35, 0.30)
				density = 0.38
				wind = 0.5
			"biome_shallows", "biome_wetland":
				_atmos_target = Color(0.86, 0.94, 1.0)
				haze_col = Color(0.40, 0.68, 0.85)
				density = 0.26
				wind = 0.35
			_:
				_atmos_target = Color(0.93, 0.94, 0.96)
				haze_col = Color(0.55, 0.68, 0.82)
				density = 0.16
	# Hostile worlds thicken the air — survival pressure you can see.
	if world.planet != null:
		var hazard := 0.0
		for key in world.planet.hazard_profile:
			hazard += float(world.planet.hazard_profile[key])
		density = clampf(density + hazard * 0.04, 0.08, 0.5)
		if float(world.planet.hazard_profile.get("radiation", 0.0)) > 0.3:
			haze_col = haze_col.lerp(Color(0.55, 0.95, 0.45), 0.35)
	_haze_color = _haze_color.lerp(haze_col, 0.35)
	_haze_density = lerpf(_haze_density, density, 0.35)
	if _haze_mat != null:
		_haze_mat.set_shader_parameter("haze_color",
			Vector3(_haze_color.r, _haze_color.g, _haze_color.b))
		_haze_mat.set_shader_parameter("density", _haze_density)
		_haze_mat.set_shader_parameter("wind", wind)


func _spawn_fauna(planet: PlanetSeedResource) -> void:
	if planet == null or player == null:
		return
	# Need streamed chunks so ecology_at is meaningful for placement.
	if world != null:
		world.set_focus(player.global_position)
		for _i in 25:
			if world.pending_count() == 0:
				break
			world.process_stream_budget(1)

	var depth := 1.0
	if session != null:
		depth = session.ship.fauna_depth()
	var planet_scale := clampf(
		(0.35 + 0.65 * planet.habitability) * depth
		* (float(planet.fauna_species_count) / 8.0),
		0.25, 1.75)

	var local_life := 0.0
	if world != null:
		local_life = float(world.ecology_at(player.global_position).get("life", 0.0))
	# Soft floor only on mid-habitable worlds so the loop still has targets;
	# true barren land stays empty (no hard FAUNA_COUNT floor).
	var target := Ecology.expected_fauna(local_life, planet_scale)
	if target == 0 and planet.habitability >= 0.35:
		target = 2
	target = clampi(target, 0, Ecology.MAX_FAUNA)

	var pack_count := clampi(int(ceil(float(maxi(target, 1)) / 4.0)), 1, 4)
	var placed := 0
	var attempts := 0
	var max_attempts := 48
	while placed < target and attempts < max_attempts:
		attempts += 1
		var ang := _rng.randf() * TAU
		var dist := _rng.randf_range(120.0, FAUNA_SPAWN_RADIUS)
		var pos: Vector2 = player.position + Vector2(cos(ang), sin(ang)) * dist
		var life := local_life
		if world != null:
			life = float(world.ecology_at(pos).get("life", 0.0))
		if life < Ecology.LIFE_SPAWN_FLOOR:
			# Scout pack on habitable worlds may still land near the player.
			if not (target <= 2 and planet.habitability >= 0.35 and placed < target):
				continue
		elif _rng.randf() > clampf(life, 0.0, 1.0):
			continue

		var pack := placed % pack_count
		var culture_id := "culture_%s_pack%d" % [planet.planet_id, pack]
		var lineage_id := "lin_%s_pack%d" % [planet.planet_id, pack]
		CultureRegistry.ensure(culture_id, "%s herd %d" % [planet.display_name, pack + 1])
		var c: Creature = CreatureFactory.spawn_random(self, _rng, {
			"origin_kind": "wild",
			"planet_id": planet.planet_id,
			"planet_name": planet.display_name,
			"divergence": planet.fauna_divergence,
			"culture_id": culture_id,
			"lineage_id": lineage_id,
		})
		c.position = pos
		_bind_culture_member(c)
		wild.append(c)
		placed += 1
	_refresh_lod()


func _bind_culture_member(c: Creature) -> void:
	if c == null or c.identity == null:
		return
	var culture := CultureRegistry.culture_for(c)
	culture.member_count = maxi(culture.member_count, 1)
	# Mint nets so the first decision is not a cold allocate mid-frame.
	culture.ensure_nets()


func _refresh_lod() -> void:
	if player == null:
		return
	var all: Array = wild.duplicate()
	if session != null:
		all.append_array(session.party.active)
	for c in all:
		if not is_instance_valid(c) or c.identity == null:
			continue
		var d: float = c.global_position.distance_to(player.global_position)
		var lod: AetherTypes.SimLOD = AetherTypes.SimLOD.ABSTRACT
		if d < SimulationBudget.full_radius:
			lod = AetherTypes.SimLOD.FULL
		elif d < SimulationBudget.near_radius:
			lod = AetherTypes.SimLOD.NEAR
		SimulationBudget.set_lod(c.identity.uid, lod)


func _refresh_world_senses() -> void:
	# Odyssey Stage-2: every FULL/NEAR creature gets spatial slots 27–30.
	var all: Array = wild.duplicate()
	if session != null:
		all.append_array(session.party.active)
	for c in all:
		if not is_instance_valid(c) or c.perception == null:
			continue
		c.perception.world_senses = _compute_senses(c)


## Execute culture-chosen AI states as motion (embodiment). FULL band every frame;
## NEAR gets a cheap step so herds still look alive without the full brain cost.
func _tick_culture_bodies(delta: float) -> void:
	if player == null:
		return
	var party_nodes: Array = []
	if session != null:
		for p in session.party.active:
			if is_instance_valid(p):
				party_nodes.append(p)
	var threats_for_wild: Array = party_nodes.duplicate()
	if player != null:
		threats_for_wild.append(player)
	for c in wild:
		if not is_instance_valid(c) or c.ai == null or c.identity == null:
			continue
		# SettlementRuntime owns village routines.
		if bool(c.get_meta("is_settler", false)):
			continue
		var lod := SimulationBudget.lod_of(c.identity.uid)
		if lod == AetherTypes.SimLOD.ABSTRACT:
			continue
		var food := BehaviorExecutor.food_point_for(c, world)
		BehaviorExecutor.step(c, delta, {
			"player": player,
			"world": world,
			"threats": threats_for_wild,
			"allies": wild,
			"food_point": food,
		})
	# Party members: soft AI when not player-led (they still follow via _follow).
	for p in party_nodes:
		var pc: Creature = p
		if pc.ai == null or pc.identity == null:
			continue
		if SimulationBudget.lod_of(pc.identity.uid) == AetherTypes.SimLOD.FULL:
			# Light wander offset is enough; follow() owns formation.
			pass


func _compute_senses(c: Creature) -> Dictionary:
	var predator_dist := 9999.0
	var ally_count := 0
	var peers: Array = wild.duplicate()
	if session != null:
		peers.append_array(session.party.active)
	for other in peers:
		if other == c or not is_instance_valid(other):
			continue
		if not (other is Node2D):
			continue
		var d: float = c.global_position.distance_to((other as Node2D).global_position)
		var aggro := 0.0
		if other.stats != null:
			aggro = float(other.stats.phenotype().get("aggression", 0.5))
		# Player presence is a predator signal for wild non-allied animals.
		if aggro >= PREDATOR_AGGRO and d < predator_dist:
			predator_dist = d
		var same_culture := false
		if c.identity != null and other.identity != null:
			var ca := String(c.identity.culture_id)
			var cb := String(other.identity.culture_id)
			if ca.is_empty():
				ca = String(c.identity.lineage_id)
			if cb.is_empty():
				cb = String(other.identity.lineage_id)
			same_culture = ca == cb and not ca.is_empty()
		if d <= ALLY_RADIUS and (same_culture or aggro < PREDATOR_AGGRO):
			ally_count += 1
	if player != null and c.identity != null and not bool(c.identity.is_human):
		var pd: float = c.global_position.distance_to(player.global_position)
		if pd < predator_dist:
			predator_dist = pd

	var food_dist := 9999.0
	var hazard := 0.0
	if world != null:
		var biome_hazard := 0.0
		var biome_id := world.biome_at(c.global_position)
		if not biome_id.is_empty():
			var biome: Dictionary = PlanetGenerator.get_biome(biome_id)
			var hazards: Dictionary = biome.get("hazards", {})
			for key in hazards:
				biome_hazard = maxf(biome_hazard, float(hazards[key]))

		var eco := Ecology.empty()
		if world.has_method("ecology_at"):
			eco = world.ecology_at(c.global_position)
		var food_sig := Ecology.food_signal(eco)
		if food_sig > 0.02:
			food_dist = 500.0 * (1.0 - food_sig)

		var planet_load := 0.0
		if world.planet != null and not world.planet.hazard_profile.is_empty():
			var n := 0
			for key in world.planet.hazard_profile:
				planet_load += float(world.planet.hazard_profile[key])
				n += 1
			if n > 0:
				planet_load /= float(n)
		hazard = Ecology.hazard_blend(
			biome_hazard,
			float(eco.get("order", 0.5)),
			planet_load,
			0.7)

	return {
		"predator_dist": predator_dist,
		"food_dist": food_dist,
		"ally_count": ally_count,
		"hazard": hazard,
	}


func _on_chunk_loaded(planet_id: String, coord: Vector2i) -> void:
	if world == null or world.planet == null or planet_id != world.planet.planet_id:
		return
	var key := "%d,%d" % [coord.x, coord.y]
	if chunk_views.has(key):
		return
	if not world.loaded_chunks.has(key):
		return
	_pending_chunks.append({"key": key, "data": world.loaded_chunks[key]})


func _drain_stream_budget() -> void:
	# At most one heavy job per frame: gen OR bake (not both) — holds 120fps.
	if world != null and world.has_method("pending_count") and world.pending_count() > 0:
		if world.process_stream_budget(1) > 0:
			return
	if _pending_chunks.is_empty():
		return
	var item: Dictionary = _pending_chunks.pop_front()
	var key: String = item["key"]
	if chunk_views.has(key) or world == null or not world.loaded_chunks.has(key):
		return
	var view := ChunkView.new()
	chunk_layer.add_child(view)
	view.set_chunk(item["data"])
	chunk_views[key] = view
	if node_layer != null:
		resource_nodes.append_array(ResourceNode.spawn_for_chunk(
			node_layer, world.planet, item["data"], PlanetManager.active_summary()))


func _on_chunk_unloaded(planet_id: String, coord: Vector2i) -> void:
	if world == null or world.planet == null or planet_id != world.planet.planet_id:
		return
	var key := "%d,%d" % [coord.x, coord.y]
	for i in range(_pending_chunks.size() - 1, -1, -1):
		if _pending_chunks[i]["key"] == key:
			_pending_chunks.remove_at(i)
	if chunk_views.has(key):
		(chunk_views[key] as Node).queue_free()
		chunk_views.erase(key)
	var prefix := "%d,%d:" % [coord.x, coord.y]
	for n in resource_nodes.duplicate():
		if is_instance_valid(n) and String(n.node_key).begins_with(prefix):
			resource_nodes.erase(n)
			n.queue_free()


# --- HUD -------------------------------------------------------------------------

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	layer.layer = 5
	add_child(layer)

	_hud_panel = FxPanel.new(Color(0.40, 0.78, 1.0), 0.72)
	_hud_panel.position = Vector2(12, 12)
	_hud_panel.custom_minimum_size = Vector2(460, 0)
	layer.add_child(_hud_panel)
	var hud_margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		hud_margin.add_theme_constant_override("margin_" + side, 12)
	_hud_panel.add_child(hud_margin)
	var hud_box := VBoxContainer.new()
	hud_box.add_theme_constant_override("separation", 4)
	hud_margin.add_child(hud_box)

	_info = Label.new()
	_info.add_theme_color_override("font_color", Color(0.90, 0.93, 0.98))
	_info.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_info.add_theme_constant_override("outline_size", 3)
	_info.add_theme_font_size_override("font_size", 14)
	hud_box.add_child(_info)

	var hint := Label.new()
	hint.text = "WASD · Q scan · Space fight · C throw · E interact · I inventory · U ship · J jump · P party · L your people · N understandings · M menu"
	hint.add_theme_color_override("font_color", Color(0.55, 0.62, 0.72))
	hint.add_theme_font_size_override("font_size", 11)
	hud_box.add_child(hint)

	_target_panel = FxPanel.new(Color(1.0, 0.55, 0.45), 0.65)
	_target_panel.position = Vector2(12, 118)
	_target_panel.custom_minimum_size = Vector2(360, 0)
	_target_panel.visible = false
	layer.add_child(_target_panel)
	var t_margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		t_margin.add_theme_constant_override("margin_" + side, 10)
	_target_panel.add_child(t_margin)
	_target_bar = Label.new()
	_target_bar.add_theme_font_size_override("font_size", 16)
	_target_bar.add_theme_color_override("font_color", Color(1.0, 0.78, 0.72))
	_target_bar.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_target_bar.add_theme_constant_override("outline_size", 3)
	t_margin.add_child(_target_bar)

	_prompt = Label.new()
	_prompt.add_theme_font_size_override("font_size", 17)
	_prompt.add_theme_color_override("font_color", Color(1.0, 0.92, 0.45))
	_prompt.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.92))
	_prompt.add_theme_constant_override("outline_size", 5)
	_prompt.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_prompt.offset_left = -320
	_prompt.offset_right = 320
	_prompt.offset_top = -78
	_prompt.offset_bottom = -42
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	layer.add_child(_prompt)

	var log_panel := FxPanel.new(Color(0.35, 0.55, 0.75), 0.78)
	log_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	log_panel.offset_left = 12
	log_panel.offset_top = -168
	log_panel.offset_right = 540
	log_panel.offset_bottom = -12
	layer.add_child(log_panel)
	var log_margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		log_margin.add_theme_constant_override("margin_" + side, 10)
	log_panel.add_child(log_margin)
	_log_label = RichTextLabel.new()
	_log_label.bbcode_enabled = true
	_log_label.scroll_following = true
	_log_label.fit_content = false
	_log_label.custom_minimum_size = Vector2(500, 120)
	_log_label.add_theme_color_override("default_color", Color(0.82, 0.88, 0.94))
	log_margin.add_child(_log_label)


func _log(text: String) -> void:
	if text.is_empty() or _log_label == null:
		return
	_log_lines.append(text)
	if _log_lines.size() > 40:
		_log_lines = _log_lines.slice(_log_lines.size() - 40)
	_log_label.text = "\n".join(_log_lines.map(func(l): return "· " + l))


func _update_info() -> void:
	if world == null or player == null or session == null or _info == null:
		return
	var biome_name := "?"
	var biome_id := world.biome_at(player.position)
	if not biome_id.is_empty():
		biome_name = String(PlanetGenerator.get_biome(biome_id).get("display_name", biome_id))
	var leader := session.party.leader()
	var leader_text := "no one able"
	var culture_line := ""
	var colony := CultureRegistry.get_culture("culture_colony")
	if colony != null:
		colony.ensure_nets()
		var report: Array = colony.drive_report()
		var lean := ""
		if not report.is_empty() and report[0] is Dictionary:
			lean = String(report[0].get("drive", ""))
		culture_line = "\nclan %s · gen %d · %d lessons%s" % [
			colony.display_name, colony.generation, colony.live.applies if colony.live != null else 0,
			(" · " + lean) if not lean.is_empty() else ""]
	var village_line := ""
	if settlement_runtime != null and not settlement_runtime.layout.is_empty():
		var d_plaza := player.position.distance_to(settlement_runtime.center())
		if d_plaza < 520.0:
			village_line = "\n%s" % settlement_runtime.describe()
	if leader != null:
		leader_text = "%s   %d/%d hp" % [leader.display_name(),
			int(leader.stats.hp), int(leader.stats.max_hp())]
	var pos := player.position
	var dex := session.discovery.totals()
	var mass := session.stock.carried_mass()
	var cap := session.stock.carry_capacity
	# The ambition, always on screen. A player who cannot see what they are aiming
	# at is not playing toward anything, and this run has a destination now.
	var arc: CampaignArc = session.arc
	var arc_line := ""
	if arc != null:
		arc_line = "\nbloodline: %d/%d crossings · %d alive%s" % [
			arc.leaps_taken(), CampaignArc.EVOLUTION_LEAPS_TO_WIN, _cached_living,
			"  <<< YOUR PEOPLE ARE DYING" if _cached_living <= CampaignArc.DIRE_MEMBERS
				else ""]

	_info.text = "%s · %s · (%.0f, %.0f)\nleading: %s\nparty %d/%d · caught %d · dex %d spp · salvage %.0f · hold %.0f/%.0f · jumps %d%s%s%s" % [
		world.planet.display_name, biome_name, pos.x, pos.y,
		leader_text,
		session.party.size(), session.party.party_limit(session.ship),
		session.party.total_caught(),
		dex["species"], session.ship.salvage, mass, cap, session.jumps_made,
		culture_line, village_line, arc_line + _cached_mind_line]


## The clan's headcount and the neuronal readout, refreshed on a timer.
##
## `_update_info` runs every frame, and both of these walk collections rather
## than reading a counter: `living_members` walks the whole simulation registry
## and `affordable_ids` walks the neuron catalog checking prerequisites. Neither
## changes fast enough to be worth that per frame, and the LOD governor exists
## precisely so this project does not do O(population) work sixty times a second.
func _refresh_mind_readout() -> void:
	_cached_living = _living_clan()

	# The only ambient signal that there is anything to spend. Both halves
	# matter: what is available now, and what is still provisional — pending
	# understandings are what a thin generation loses, and a player who cannot
	# see the count cannot weigh it.
	var tree := NeuronalTree.for_clan(_player_clan_id())
	_cached_mind_line = ""
	if tree.energy >= 1.0 or not tree.pending.is_empty():
		var at_risk: int = tree.pending.size()
		var supportable := int(
			floor(float(_cached_living) / NeuronalTree.SUPPORT_PER_PENDING))
		_cached_mind_line = "\nunderstanding: %.0f banked · %d within reach (N) · %d not yet safe%s" % [
			tree.energy, tree.affordable_ids().size(), at_risk,
			"  <<< MORE THAN THEY CAN HOLD" if at_risk > supportable else ""]
