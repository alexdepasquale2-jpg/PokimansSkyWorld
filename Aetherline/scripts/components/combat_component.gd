extends CreatureComponent
class_name CombatComponent

## Live, in-world combat state — cooldowns and range, not resolution logic.
## Resolution still goes through CombatSystem (Phase 4); this is what lets that
## same resolver run continuously while creatures walk around instead of in
## discrete resolved-instantly rounds.

@export var attack_cooldown_max: float = 1.1  ## Seconds between attacks.
var attack_cooldown: float = 0.0
var target_uid: StringName = &""

## True once something has hurt this creature or it has chosen to fight back;
## used to distinguish "ambient wildlife" from "currently in a scrap" for AI
## and for the aggro-range check.
var engaged: bool = false


func _on_setup() -> void:
	attack_cooldown_max = 1.1


func tick(delta: float) -> void:
	if attack_cooldown > 0.0:
		attack_cooldown -= delta


func ready_to_attack() -> bool:
	return attack_cooldown <= 0.0


func reset_cooldown() -> void:
	var tempo := 1.0
	if creature != null:
		tempo = maxf(0.3, creature.stats.trait_value(&"attack_speed") + 1.0)
	attack_cooldown = attack_cooldown_max / tempo


## Melee reach in world pixels — reach trait and frame size both push it out.
func attack_range() -> float:
	if creature == null:
		return 40.0
	var reach: float = creature.stats.trait_value(&"reach")
	var size: float = creature.stats.trait_value(&"size")
	return 34.0 + reach * 14.0 + size * 8.0


func aggro_range() -> float:
	return attack_range() * 3.0


func describe() -> Array[String]:
	return ["  cooldown %.2fs · range %.0f · engaged %s" % [
		maxf(0.0, attack_cooldown), attack_range(), engaged]]


func to_dict() -> Dictionary:
	return {}  # transient combat state; never worth persisting


func from_dict(_d: Dictionary) -> void:
	pass
