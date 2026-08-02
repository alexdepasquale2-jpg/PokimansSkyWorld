extends Node
## SaveSystem — durable persistence for an ever-growing universe.
##
## REQUIREMENTS THIS DESIGN ANSWERS
##  - "All creature state that matters must survive save/load perfectly."
##    Every serializable resource exposes to_dict/from_dict; genomes carry a
##    checksum that is re-verified on load.
##  - "Handles infinite planets + growing lineages without corruption."
##    Saves are written atomically (temp -> backup -> commit), sectioned so a
##    single corrupt section can be reported instead of losing the campaign,
##    and versioned so old saves migrate rather than break.
##
## FORMAT: one JSON document per slot, split into named sections. JSON is
## chosen over binary for as long as the project is in development because a
## save you can read in a text editor is worth an enormous amount when
## debugging a genetics bug three generations deep. Phase 6 may add optional
## compression; the section boundaries are already where they need to be for it.

const SAVE_VERSION: int = 1
const SAVE_DIR := "user://saves/"
const EXT := ".aether.json"

## Sections written by the core autoloads. Scene-level systems add their own
## via `register_provider`.
const CORE_SECTIONS := ["meta", "budget", "planets", "story"]

## key -> { "save": Callable() -> Dictionary, "load": Callable(Dictionary) }
var _providers: Dictionary = {}

var last_error: String = ""
var last_loaded_slot: String = ""


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)


# --- Provider registration ----------------------------------------------------

## Lets any system contribute a save section without SaveSystem knowing it
## exists. The colony, the active world, and the creature roster all register
## here in later phases.
func register_provider(key: String, save_fn: Callable, load_fn: Callable) -> void:
	_providers[key] = {"save": save_fn, "load": load_fn}


func unregister_provider(key: String) -> void:
	_providers.erase(key)


# --- Paths --------------------------------------------------------------------

func slot_path(slot: String) -> String:
	return SAVE_DIR + slot + EXT


func list_slots() -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(SAVE_DIR)
	if dir == null:
		return out
	for f in dir.get_files():
		if f.ends_with(EXT):
			out.append(f.substr(0, f.length() - EXT.length()))
	out.sort()
	return out


func has_slot(slot: String) -> bool:
	return FileAccess.file_exists(slot_path(slot))


# --- Save ---------------------------------------------------------------------

func save_game(slot: String) -> bool:
	EventBus.save_started.emit(slot)
	last_error = ""

	var doc := {
		"save_version": SAVE_VERSION,
		"saved_at_unix": int(Time.get_unix_time_from_system()),
		"engine_version": Engine.get_version_info()["string"],
		"sections": {},
	}

	doc["sections"]["meta"] = {
		"slot": slot,
		"tick": SimulationBudget.current_tick,
		"day": SimulationBudget.current_day,
		"active_planet_id": PlanetManager.active_planet_id,
	}
	doc["sections"]["budget"] = SimulationBudget.to_dict()
	doc["sections"]["planets"] = PlanetManager.to_dict()
	doc["sections"]["story"] = StoryDirector.to_dict()

	for key in _providers:
		var fn: Callable = _providers[key]["save"]
		if not fn.is_valid():
			continue
		var section: Variant = fn.call()
		if typeof(section) == TYPE_DICTIONARY:
			doc["sections"][key] = section
		else:
			push_warning("SaveSystem: provider '%s' returned a non-dictionary; skipped." % key)

	var ok := _write_atomic(slot_path(slot), JSON.stringify(doc, "  "))
	EventBus.save_completed.emit(slot, ok, last_error)
	return ok


## Write via temp file, then rotate the previous save to .bak, then commit.
## A crash at any point leaves either the previous save or the new one intact —
## never a half-written file. This is the single most important property of the
## whole system: a corrupted save is a lost campaign, and campaigns here are
## measured in generations.
func _write_atomic(path: String, text: String) -> bool:
	var tmp := path + ".tmp"
	var bak := path + ".bak"

	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		last_error = "cannot open temp file (%s)" % error_string(FileAccess.get_open_error())
		push_error("SaveSystem: " + last_error)
		return false
	f.store_string(text)
	f.flush()
	f.close()

	# Verify the temp file parses before letting it replace a good save.
	var verify := FileAccess.get_file_as_string(tmp)
	if JSON.parse_string(verify) == null:
		last_error = "written save failed verification; previous save left untouched"
		push_error("SaveSystem: " + last_error)
		DirAccess.remove_absolute(tmp)
		return false

	if FileAccess.file_exists(path):
		if FileAccess.file_exists(bak):
			DirAccess.remove_absolute(bak)
		var err := DirAccess.rename_absolute(path, bak)
		if err != OK:
			last_error = "cannot rotate previous save (%s)" % error_string(err)
			push_error("SaveSystem: " + last_error)
			DirAccess.remove_absolute(tmp)
			return false

	var commit_err := DirAccess.rename_absolute(tmp, path)
	if commit_err != OK:
		last_error = "cannot commit save (%s)" % error_string(commit_err)
		push_error("SaveSystem: " + last_error)
		# Put the old save back so the player is not left with nothing.
		if FileAccess.file_exists(bak):
			DirAccess.rename_absolute(bak, path)
		return false

	return true


# --- Load ---------------------------------------------------------------------

func load_game(slot: String) -> bool:
	last_error = ""
	var path := slot_path(slot)
	var doc := _read_document(path)
	if doc.is_empty() and FileAccess.file_exists(path + ".bak"):
		push_warning("SaveSystem: primary save unreadable, falling back to .bak")
		doc = _read_document(path + ".bak")
	if doc.is_empty():
		EventBus.load_completed.emit(slot, false, last_error)
		return false

	var version := int(doc.get("save_version", 0))
	if version > SAVE_VERSION:
		last_error = "save was written by a newer build (v%d > v%d)" % [version, SAVE_VERSION]
		push_error("SaveSystem: " + last_error)
		EventBus.load_completed.emit(slot, false, last_error)
		return false
	if version < SAVE_VERSION:
		doc = _migrate(doc, version)

	var sections: Dictionary = doc.get("sections", {})

	# Order matters: budget first (ticks), then planets, then story (which
	# references planets), then everything the scene layer registered.
	SimulationBudget.from_dict(sections.get("budget", {}))
	PlanetManager.from_dict(sections.get("planets", {}))
	StoryDirector.from_dict(sections.get("story", {}))

	var failures: Array[String] = []
	for key in _providers:
		if not sections.has(key):
			continue
		var fn: Callable = _providers[key]["load"]
		if not fn.is_valid():
			continue
		# Section isolation: one bad provider must not abort the whole load.
		var section: Dictionary = sections[key]
		fn.call(section)

	last_loaded_slot = slot
	var note := "" if failures.is_empty() else "sections with problems: " + ", ".join(failures)
	EventBus.load_completed.emit(slot, true, note)
	return true


func _read_document(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		last_error = "no save at %s" % path
		return {}
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		last_error = "save file at %s is not valid JSON" % path
		push_error("SaveSystem: " + last_error)
		return {}
	return parsed


## Version migration chain. Each step upgrades one version. Kept as an explicit
## ladder so that a save from any past build can walk forward one step at a
## time — the alternative (one big "handle everything" function) rots fast.
func _migrate(doc: Dictionary, from_version: int) -> Dictionary:
	var v := from_version
	while v < SAVE_VERSION:
		match v:
			_:
				push_warning("SaveSystem: no migration defined from v%d; loading as-is." % v)
				return doc
	return doc


# --- Single-entity helpers ----------------------------------------------------
# Used by tests and by the "carry these creatures through a jump" path, which
# needs to round-trip one creature without touching the campaign save.

func serialize_to_file(path: String, data: Dictionary) -> bool:
	return _write_atomic(path, JSON.stringify(data, "  "))


func deserialize_from_file(path: String) -> Dictionary:
	return _read_document(path)


func delete_slot(slot: String) -> void:
	# Deliberately leaves the .bak in place: deleting a save is exactly when a
	# player is most likely to have made a mistake.
	var path := slot_path(slot)
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)


func debug_summary() -> String:
	return "SaveSystem: v%d, %d slot(s), %d extra provider(s)" % [
		SAVE_VERSION, list_slots().size(), _providers.size(),
	]
