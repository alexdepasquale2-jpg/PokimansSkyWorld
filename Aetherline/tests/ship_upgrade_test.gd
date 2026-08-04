extends SceneTree

func _init() -> void:
	var ship := ShipSystem.new()
	ship.salvage = 40.0
	assert(ship.can_upgrade("mod_drive") == true)
	assert(ship.module_definition("mod_scanner").get("action", "") == "scan")

	var overworld := Overworld.new()
	var session := GameSession.new()
	overworld.add_child(session)
	overworld.session = session
	assert(overworld.is_processing_unhandled_key_input() == true)
	overworld._toggle_ship()
	assert(overworld._ship_view != null)
	assert(overworld._ship_view.visible == true)
	overworld._toggle_ship()
	assert(overworld._ship_view.visible == false)

	ship.salvage = 39.0
	assert(ship.can_upgrade("mod_drive") == false)

	ship.salvage = 80.0
	assert(ship.can_upgrade("mod_drive") == true)
	assert(ship.upgrade("mod_drive") == true)
	assert(ship.level_of("mod_drive") == 1)
	assert(ship.sell("mod_drive") == true)
	assert(ship.level_of("mod_drive") == 0)
	assert(ship.salvage > 0.0)

	print("ship upgrade smoke test passed")
	quit()
