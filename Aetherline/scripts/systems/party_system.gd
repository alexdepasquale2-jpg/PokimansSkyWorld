extends RefCounted
class_name PartySystem

## Your team, and everything else you've caught.
##
## The active party walks the world with you and fights. Storage is unlimited
## and lives on the ship — you never lose a catch, you just aren't carrying it.
## Party size is gated by the ship's habitat module, so "I can bring one more"
## is a real upgrade reward.
##
## Storage holds SERIALIZED creatures, not live nodes. A stored creature costs
## nothing to keep, which is the whole reason catching everything stays fun
## rather than becoming inventory management.

const MAX_PARTY_HARD_CAP := 6

## Live Creature nodes currently walking with the player.
var active: Array = []

## Serialized creature dictionaries, held on the ship.
var stored: Array = []


func party_limit(ship: ShipSystem) -> int:
	return clampi(2 + int(ship.stat("colony_cap") / 3.0), 2, MAX_PARTY_HARD_CAP)


func has_room(ship: ShipSystem) -> bool:
	return active.size() < party_limit(ship)


## The creature currently taking your orders. Always the first living member.
func leader() -> Creature:
	for entry in active:
		var c: Creature = entry
		if is_instance_valid(c) and c.stats.hp > 0.0 and not c.stats.downed:
			return c
	return null


## Rotate the party so the next living creature leads. Returns the new leader.
func cycle() -> Creature:
	if active.size() < 2:
		return leader()
	# Move the front to the back until someone able to fight is in front.
	for i in active.size():
		active.push_back(active.pop_front())
		var candidate := leader()
		if candidate != null and candidate == active[0]:
			return candidate
	return leader()


## Adds a caught creature. Goes to the party if there is room, otherwise
## straight to storage — a full party never blocks a catch.
## Returns "party" or "stored".
func accept(creature: Creature, ship: ShipSystem) -> String:
	if has_room(ship):
		active.append(creature)
		return "party"
	stored.append(creature.to_dict())
	creature.queue_free()
	return "stored"


## Pull a stored creature back out into the party.
func withdraw(index: int, parent: Node, ship: ShipSystem) -> Creature:
	if index < 0 or index >= stored.size() or not has_room(ship):
		return null
	var creature := CreatureFactory.spawn_from_dict(parent, stored[index])
	stored.remove_at(index)
	active.append(creature)
	return creature


## Send a party member to the ship.
func deposit(creature: Creature) -> bool:
	if not active.has(creature):
		return false
	active.erase(creature)
	stored.append(creature.to_dict())
	creature.queue_free()
	return true


## Everyone in the party back to full. The only "healing" the game has —
## no food, no medicine, just a rest at a settlement or the ship.
func heal_all() -> void:
	for entry in active:
		var c: Creature = entry
		if is_instance_valid(c):
			c.stats.hp = c.stats.max_hp()
			c.stats.revive(1.0)


func any_able() -> bool:
	return leader() != null


func size() -> int:
	return active.size()


func total_caught() -> int:
	return active.size() + stored.size()


# --- Serialization ---------------------------------------------------------------

## The party is serialized alongside storage: both travel with the ship, so
## neither is left behind on a world when you jump.
func to_dict() -> Dictionary:
	var party: Array = []
	for entry in active:
		if is_instance_valid(entry):
			party.append((entry as Creature).to_dict())
	return {"active": party, "stored": stored.duplicate(true)}


func from_dict(d: Dictionary, parent: Node) -> void:
	for entry in active:
		if is_instance_valid(entry):
			(entry as Creature).queue_free()
	active.clear()
	stored = d.get("stored", []).duplicate(true)
	for data in d.get("active", []):
		active.append(CreatureFactory.spawn_from_dict(parent, data))
