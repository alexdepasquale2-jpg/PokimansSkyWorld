extends Node2D
class_name Creature

## A living thing — human or creature, the stack is the same.
##
## COMPOSITION, NOT INHERITANCE. This node holds an identity and a flat list of
## components. It contains no behaviour of its own beyond wiring, ticking and
## serialization. A pack beast, a colonist and a feral predator differ by which
## components they carry and what their genome says — never by subclassing
## Creature.
##
## Unified stack (Pokimans culture + Godot colony):
##   Perception + culture AI  (Odyssey)
##   Combat / Work / Relationships / Audio  (colony + embodiment)
## Components remain droppable by node name.

## Narrative identity. The one part of a creature that outlives its body.
@export var identity: CreatureIdentityResource

## Which planet this creature is currently on. Drives environmental pressure
## filtering and the depart/land bookkeeping.
@export var home_planet_id: String = ""

# --- Component accessors ------------------------------------------------------
var genetics: GeneticsComponent
var epigenetics: EpigeneticsComponent
var archetype: ArchetypeComponent
var experience: ExperienceComponent
var needs: NeedsComponent
var stats: StatsComponent
var perception: PerceptionComponent
var work: WorkComponent
var combat: CombatComponent
var relationships: RelationshipComponent
var ai: AIController
var visual: VisualController
var audio: AudioController

## Every component, in setup order, for the generic serialize/load walk.
var _components: Array[CreatureComponent] = []

## Mounting — data only (from Godot colony build).
var mount_target: Creature = null
var rider: Creature = null
var player_controlled: bool = false

var _registered: bool = false

## Ticks between story-template evaluations for this creature.
const STORY_EVALUATION_INTERVAL: int = 600
var _next_story_tick: int = 0


func _ready() -> void:
	if identity == null:
		identity = CreatureIdentityResource.new()
	_collect_components()
	_register()
	EventBus.day_passed.connect(_on_day_passed)


func _exit_tree() -> void:
	if EventBus.day_passed.is_connected(_on_day_passed):
		EventBus.day_passed.disconnect(_on_day_passed)
	_unregister()


## Finds components by node name. Names, not types, so a designer can drop a
## component out of the scene to make a variant (a plant-creature with no AI,
## a corpse with no needs) and everything else keeps working.
func _collect_components() -> void:
	genetics = get_node_or_null("Genetics") as GeneticsComponent
	epigenetics = get_node_or_null("Epigenetics") as EpigeneticsComponent
	archetype = get_node_or_null("Archetype") as ArchetypeComponent
	experience = get_node_or_null("Experience") as ExperienceComponent
	needs = get_node_or_null("Needs") as NeedsComponent
	stats = get_node_or_null("Stats") as StatsComponent
	perception = get_node_or_null("Perception") as PerceptionComponent
	work = get_node_or_null("Work") as WorkComponent
	combat = get_node_or_null("Combat") as CombatComponent
	relationships = get_node_or_null("Relationships") as RelationshipComponent
	ai = get_node_or_null("AI") as AIController
	visual = get_node_or_null("Visual") as VisualController
	audio = get_node_or_null("Audio") as AudioController

	# Order matters: Stats before Genetics.setup; Experience before Archetype;
	# Perception before AI (culture arbitration senses through it).
	_components.clear()
	for c in [stats, genetics, epigenetics, experience, archetype, needs,
			perception, work, combat, relationships, ai, visual, audio]:
		if c != null:
			_components.append(c)
	for c in _components:
		c.setup(self)


# --- Registration -------------------------------------------------------------

func _register() -> void:
	if _registered or identity == null:
		return
	SimulationBudget.register_creature(identity.uid, self, home_planet_id)
	_registered = true
	EventBus.creature_spawned.emit(identity.uid, self)


func _unregister(reason: String = "despawn") -> void:
	if not _registered:
		return
	SimulationBudget.unregister_creature(identity.uid)
	_registered = false
	EventBus.creature_despawned.emit(identity.uid, reason)


# --- Simulation ---------------------------------------------------------------

func _on_day_passed(_day: int) -> void:
	if SimulationBudget.lod_of(identity.uid) != AetherTypes.SimLOD.FULL:
		return
	tick_days(1.0)


## Integrate `days` of life. The single entry point for time passing, whether
## that is one live day or nine years of catch-up after a jump home.
func tick_days(days: float) -> void:
	if days <= 0.0:
		return
	if stats != null:
		stats.age(days)
	if epigenetics != null:
		epigenetics.decay(days)
	if relationships != null:
		relationships.decay_all(days)
	if needs != null:
		needs.tick(days)
	if archetype != null:
		archetype.maybe_evaluate()
	if ai != null:
		# Culture AI uses tick-gated maybe_decide for live frames; day
		# integration still calls maybe_decide so the gate can fire once.
		ai.maybe_decide()
	_maybe_evaluate_story()


func _maybe_evaluate_story() -> void:
	if experience == null or SimulationBudget.current_tick < _next_story_tick:
		return
	_next_story_tick = SimulationBudget.current_tick + STORY_EVALUATION_INTERVAL
	StoryDirector.evaluate_creature(self)


# --- Mounting -----------------------------------------------------------------

func mount(target: Creature) -> bool:
	if target == null or target == self or mount_target != null or target.rider != null:
		return false
	mount_target = target
	target.rider = self
	return true


func dismount() -> void:
	if mount_target != null:
		mount_target.rider = null
		mount_target = null


func effective_move_speed() -> float:
	if mount_target != null and mount_target.stats != null:
		return mount_target.stats.stat("move_speed")
	if stats != null:
		return stats.stat("move_speed")
	return 1.0


func display_name() -> String:
	return identity.display_name() if identity != null else "<unnamed>"


# --- Serialization ------------------------------------------------------------

func to_dict() -> Dictionary:
	var components := {}
	for c in _components:
		components[c.name] = c.to_dict()
	return {
		"identity": identity.to_dict() if identity != null else {},
		"home_planet_id": home_planet_id,
		"position": [position.x, position.y],
		"components": components,
	}


func apply_dict(d: Dictionary) -> void:
	identity = CreatureIdentityResource.from_dict(d.get("identity", {}))
	home_planet_id = String(d.get("home_planet_id", ""))
	var pos: Array = d.get("position", [0.0, 0.0])
	position = Vector2(float(pos[0]), float(pos[1]))

	var components: Dictionary = d.get("components", {})
	for c in _components:
		if components.has(c.name):
			c.from_dict(components[c.name])
	for c in _components:
		c.post_load()


# --- Debug readout ------------------------------------------------------------

func describe() -> Array[String]:
	var lines: Array[String] = []
	lines.append("=== %s ===" % display_name())
	lines.append("  uid %s · lineage %s · gen %d · %s" % [
		identity.uid, identity.lineage_id, identity.generation, identity.origin_kind])
	lines.append("  born tick %d on %s" % [
		identity.birth_tick,
		identity.birth_planet_name if not identity.birth_planet_name.is_empty() else "<nowhere>"])
	lines.append("  repro role: %s" % AetherTypes.enum_to_key(
		AetherTypes.ReproRole, genetics.genome.repro_role).to_lower())

	var sections := {
		"GENOME": genetics, "EPIGENETICS": epigenetics, "PHENOTYPE": stats,
		"EXPERIENCE": experience, "ARCHETYPE": archetype, "NEEDS": needs,
		"PERCEPTION": perception, "WORK": work, "COMBAT": combat,
		"RELATIONSHIPS": relationships, "BEHAVIOUR": ai, "APPEARANCE": visual,
	}
	for title in sections:
		var component: CreatureComponent = sections[title]
		if component == null:
			continue
		lines.append("")
		lines.append("-- %s --" % title)
		lines.append_array(component.describe())
	return lines
