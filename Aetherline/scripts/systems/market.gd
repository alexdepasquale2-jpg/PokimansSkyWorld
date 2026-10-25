extends RefCounted
class_name Market

## Salvage prices for goods. Sell is what a trade post pays you; buy is what
## they charge. Beacon / settlement tier can nudge both so upgrading Contact
## Beacon makes commerce feel better, not just different text.

const MARKET_FILE := "res://data/economy/market.json"

static var _catalog: Dictionary = {}


static func load_catalog() -> void:
	if not _catalog.is_empty():
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(MARKET_FILE))
	if typeof(parsed) != TYPE_ARRAY:
		push_error("Market: market.json missing or malformed")
		return
	for entry in parsed:
		_catalog[String(entry["id"])] = entry


static func all() -> Array:
	load_catalog()
	var out: Array = []
	for id in _catalog:
		out.append(_catalog[id])
	out.sort_custom(func(a, b):
		return String(a.get("display_name", "")).nocasecmp_to(String(b.get("display_name", ""))) < 0)
	return out


static func get_entry(res_id) -> Dictionary:
	load_catalog()
	return Dictionary(_catalog.get(String(res_id), {}))


static func display_name(res_id) -> String:
	var e := get_entry(res_id)
	if e.is_empty():
		return String(res_id).capitalize().replace("_", " ")
	return String(e.get("display_name", res_id))


## Salvage paid to the player for selling qty of a resource.
static func sell_value(res_id, qty: float, ship: ShipSystem = null) -> float:
	var e := get_entry(res_id)
	var unit := float(e.get("sell", 0.35))
	var rate := 1.0 + (ship.stat("trade_rates") if ship != null else 0.0)
	return maxf(0.0, unit * qty * rate)


## Salvage cost to buy qty of a resource from a vendor.
static func buy_cost(res_id, qty: float, ship: ShipSystem = null) -> float:
	var e := get_entry(res_id)
	var unit := float(e.get("buy", 1.0))
	var rate := 1.0 - (ship.stat("trade_rates") if ship != null else 0.0) * 0.5
	return maxf(0.0, unit * qty * clampf(rate, 0.5, 1.5))


## Sell as much as possible of a resource from the stockpile (local first).
## Returns salvage gained.
static func sell_from_stock(stock: Stockpile, res_id, qty: float,
		ship: ShipSystem) -> float:
	if stock == null or ship == null or qty <= 0.0:
		return 0.0
	var key := String(res_id)
	var available := stock.amount(key, true)
	var take := minf(qty, available)
	if take <= 0.0:
		return 0.0
	if not stock.spend({key: take}):
		return 0.0
	var value := sell_value(key, take, ship)
	ship.add_salvage(value)
	return value


## Buy qty into local stock for salvage. Returns amount bought.
static func buy_to_stock(stock: Stockpile, res_id, qty: float,
		ship: ShipSystem) -> float:
	if stock == null or ship == null or qty <= 0.0:
		return 0.0
	var cost := buy_cost(res_id, qty, ship)
	if ship.salvage < cost:
		# Afford partial.
		var unit := buy_cost(res_id, 1.0, ship)
		if unit <= 0.0:
			return 0.0
		qty = floorf(ship.salvage / unit)
		if qty <= 0.0:
			return 0.0
		cost = buy_cost(res_id, qty, ship)
	ship.salvage -= cost
	stock.add_local(res_id, qty)
	return qty
