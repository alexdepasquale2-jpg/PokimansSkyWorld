extends Node
class_name CreatureComponent

## Thin shared contract for every creature component.
##
## This is NOT behavioural inheritance — no component inherits logic from
## another, and the Creature never type-switches on component class. All this
## base provides is (a) a back-reference to the owning creature and (b) the
## two-phase load protocol. Everything a creature can *do* is composed by which
## components are present on its scene, which is the point.
##
## TWO-PHASE LOAD: `from_dict` on every component runs first, then `post_load`
## on every component. Components routinely need to read each other (Stats reads
## Genetics and Epigenetics to resolve a phenotype), and a single-phase load
## would make correctness depend on child order in the scene tree.

## The owning Creature. Typed as Node rather than Creature on purpose: GDScript
## resolves `class_name` cycles unreliably, and Creature already references
## every component type. Components reach back through the named accessors on
## Creature (`creature.genetics`, `creature.stats`, ...), which stay readable.
var creature: Node = null


## Called once by Creature immediately after the component is found, before any
## data is loaded. Wire up signal connections here, not in _ready — _ready fires
## before the creature has attached itself.
func setup(owner_creature: Node) -> void:
	creature = owner_creature
	_on_setup()


func _on_setup() -> void:
	pass


## Serialize this component's persistent state. Return {} for components that
## are purely derived and can rebuild themselves from other components.
func to_dict() -> Dictionary:
	return {}


func from_dict(_d: Dictionary) -> void:
	pass


## Runs after every component on the creature has finished `from_dict`.
## Safe to read other components here.
func post_load() -> void:
	pass


## Short human-readable state, for the debug readout.
func describe() -> Array[String]:
	return []
