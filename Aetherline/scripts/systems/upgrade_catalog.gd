extends RefCounted
class_name UpgradeCatalog

## Modular upgrade catalog loader for ship and colony upgrades.
## The goal is to make new upgrades data-driven and iteration-friendly.

const CATALOG_FILE := "res://data/upgrades/catalog.json"

static var entries: Dictionary = {}

static func load_catalog() -> void:
	if not entries.is_empty():
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CATALOG_FILE))
	if parsed is Array:
		for entry in parsed:
			entries[String(entry.get("id", ""))] = entry


static func all() -> Array:
	load_catalog()
	var out: Array = []
	for id in entries:
		out.append(entries[id])
	out.sort_custom(func(a, b): return String(a.get("display_name", "")).nocasecmp_to(String(b.get("display_name", ""))) < 0)
	return out


static func get_entry(id: String) -> Dictionary:
	load_catalog()
	return Dictionary(entries.get(String(id), {}))


static func action_for(id: String) -> String:
	return String(get_entry(id).get("action", "upgrade"))
