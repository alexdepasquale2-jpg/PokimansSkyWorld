extends Control
class_name ServiceMenu

## Settlement interaction: rest, breed, trade inventory, craft, rumors, etc.
## Priced in salvage + real goods so the economy has teeth.

signal closed()

var session: GameSession
var colony: Array = []
var settlement_runtime: SettlementRuntime = null
var _entry: Dictionary = {}
var _definition: Dictionary = {}

var _title: Label
var _dialogue: Label
var _body: RichTextLabel
var _actions: VBoxContainer
var _trade_list: ItemList
var _trade_host: VBoxContainer
var _rng := RandomNumberGenerator.new()
var _frame: FxPanel
var _mode := "services"  # services | trade_sell | trade_buy | craft


func _ready() -> void:
	_rng.randomize()
	_build_ui()
	visible = false


func open(entry: Dictionary, game_session: GameSession, colony_creatures: Array) -> void:
	_entry = entry
	_definition = SettlementGenerator.get_building(entry["building_id"])
	session = game_session
	colony = colony_creatures
	_mode = "services"
	visible = true
	_refresh()
	modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(self, "modulate:a", 1.0, 0.15)


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.02, 0.04, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := FxPanel.new(Color(0.85, 0.65, 0.35), 0.92)
	_frame = panel
	panel.custom_minimum_size = Vector2(680, 520)
	center.add_child(panel)

	var margin := MarginContainer.new()
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 16)
	panel.add_child(margin)

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	margin.add_child(box)

	_title = Label.new()
	_title.add_theme_font_size_override("font_size", 22)
	_title.add_theme_color_override("font_color", Color(0.95, 0.92, 0.85))
	box.add_child(_title)

	_dialogue = Label.new()
	_dialogue.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialogue.add_theme_color_override("font_color", Color(0.85, 0.82, 0.65))
	box.add_child(_dialogue)

	box.add_child(HSeparator.new())

	_actions = VBoxContainer.new()
	_actions.add_theme_constant_override("separation", 6)
	box.add_child(_actions)

	_trade_host = VBoxContainer.new()
	_trade_host.add_theme_constant_override("separation", 6)
	_trade_host.visible = false
	box.add_child(_trade_host)

	_trade_list = ItemList.new()
	_trade_list.custom_minimum_size = Vector2(0, 160)
	_trade_host.add_child(_trade_list)

	var trade_btns := HBoxContainer.new()
	trade_btns.add_theme_constant_override("separation", 8)
	_trade_host.add_child(trade_btns)
	var sell10 := FxButton.new(Color(1.0, 0.78, 0.4))
	sell10.text = "Sell 10"
	sell10.custom_minimum_size = Vector2(100, 34)
	sell10.pressed.connect(func(): _trade_act(10.0))
	trade_btns.add_child(sell10)
	var sell_all := FxButton.new(Color(1.0, 0.7, 0.35))
	sell_all.text = "Sell All"
	sell_all.custom_minimum_size = Vector2(100, 34)
	sell_all.pressed.connect(func(): _trade_act(99999.0))
	trade_btns.add_child(sell_all)
	var back := FxButton.new(Color(0.6, 0.6, 0.68))
	back.text = "Back"
	back.custom_minimum_size = Vector2(100, 34)
	back.pressed.connect(func():
		_mode = "services"
		_refresh())
	trade_btns.add_child(back)

	box.add_child(HSeparator.new())

	_body = RichTextLabel.new()
	_body.bbcode_enabled = true
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.custom_minimum_size.y = 140
	_body.add_theme_color_override("default_color", Color(0.85, 0.88, 0.9))
	box.add_child(_body)

	var close := FxButton.new(Color(0.6, 0.6, 0.68))
	close.text = "Leave"
	close.custom_minimum_size = Vector2(0, 36)
	close.pressed.connect(func():
		visible = false
		closed.emit())
	box.add_child(close)


func _refresh() -> void:
	var place := ""
	if settlement_runtime != null and not settlement_runtime.layout.is_empty():
		place = String(settlement_runtime.layout.get("name", ""))
	_title.text = "%s%s — %s %s" % [
		(place + " · ") if not place.is_empty() else "",
		_definition.get("display_name", "Building"),
		_entry.get("npc_role", ""),
		_entry.get("npc_name", "")]
	# Living dialogue: greeting + culture flavor from the village brain.
	var talk := String(_definition.get("greeting", "..."))
	if settlement_runtime != null:
		talk = settlement_runtime.dialogue_flavor(_entry)
	_dialogue.text = talk
	_trade_host.visible = _mode in ["trade_sell", "trade_buy", "craft"]
	_actions.visible = _mode == "services"

	for child in _actions.get_children():
		child.queue_free()

	if _mode == "services":
		for service in _definition.get("services", []):
			var service_key := String(service)
			var label := _service_label(service_key)
			if label.is_empty():
				continue
			var button := FxButton.new(Color(0.85, 0.65, 0.35))
			button.text = label
			button.custom_minimum_size = Vector2(0, 34)
			button.pressed.connect(func(): _perform(service_key))
			_actions.add_child(button)
		if _actions.get_child_count() == 0:
			var nothing := Label.new()
			nothing.text = "Nothing here for you today."
			nothing.add_theme_color_override("font_color", Color(0.6, 0.6, 0.66))
			_actions.add_child(nothing)
		_report("[i]%s[/i]\n\n[color=#9fc7ff]Now:[/color] %s\n[color=#c8a0ff]Later:[/color] %s\n\nSalvage on hand: [b]%.0f[/b]" % [
			_definition.get("description", ""),
			_definition.get("early_value", ""),
			_definition.get("late_value", ""),
			session.ship.salvage if session != null else 0.0])
	elif _mode == "trade_sell":
		_populate_trade_sell()
	elif _mode == "trade_buy":
		_populate_trade_buy()
	elif _mode == "craft":
		_populate_craft()


const PRICES := {
	"heal": 0.0, "rest": 0.0,
	"breed": 15.0, "assay": 20.0, "purge": 40.0,
	"divine": 10.0, "consecrate": 60.0, "trade": 0.0, "rumor": 0.0,
	"study": 25.0, "expand_hold": 80.0, "board": 5.0, "recruit": 12.0,
}


func _service_label(service: String) -> String:
	var label: String = {
		"heal": "Rest your team — back to full",
		"rest": "Sleep here — back to full",
		"breed": "Use the breeding stalls",
		"assay": "Assay hidden genes",
		"purge": "Ease a creature's worst scar",
		"divine": "Read archetype progress",
		"consecrate": "Push a near-complete archetype",
		"rumor": "Ask about distant worlds",
		"trade": "Open the market (sell / buy)",
		"craft": "Use the workshop benches",
		"study": "Buy research progress",
		"expand_hold": "Permanently expand cargo hold",
		"board": "Board a party member on-site",
		"store": "Review warehouse stock",
		"recruit": "Invite a free villager to walk with you",
	}.get(service, "")
	if label.is_empty():
		return ""
	var cost := float(PRICES.get(service, 0.0))
	return label if cost <= 0.0 else "%s  —  %.0f salvage" % [label, cost]


func _charge(service: String) -> bool:
	var cost := float(PRICES.get(service, 0.0))
	if cost <= 0.0:
		return true
	if session.ship.salvage < cost:
		_report("That costs %.0f salvage. You have %.0f." % [cost, session.ship.salvage])
		return false
	session.ship.salvage -= cost
	return true


func _report(text: String) -> void:
	_body.text = text
	if _frame != null:
		_frame.flash(0.45)


func _perform(service: String) -> void:
	match service:
		"heal", "rest":
			_rest_team()
		"breed":
			_breed()
		"assay":
			_assay()
		"purge":
			_purge()
		"divine":
			_divine()
		"consecrate":
			_consecrate()
		"rumor":
			_rumor()
		"trade":
			_mode = "trade_sell"
			_refresh()
		"craft":
			_mode = "craft"
			_refresh()
		"study":
			_study()
		"expand_hold":
			_expand_hold()
		"board":
			_board()
		"store":
			_store_review()
		"recruit":
			_recruit()
	# Every service is a lesson the village watches and remembers.
	if settlement_runtime != null:
		settlement_runtime.note_player_deed(service, 1.0)


func _rest_team() -> void:
	session.party.heal_all()
	ActionEffects.apply(self, "rest", {})
	_report("Your team sleeps under a roof.\n\nEveryone is back to full.")


func _breed() -> void:
	if not _charge("breed"):
		return
	var eligible: Array = session.party.active.filter(func(c):
		return is_instance_valid(c) and c.stats.hp > 0.0)
	if eligible.size() < 2:
		_report("You need two creatures with you for the stalls.")
		return
	for i in eligible.size():
		for j in range(i + 1, eligible.size()):
			var result := BreedingSystem.breed(
				eligible[i], eligible[j], get_tree().current_scene, _rng)
			if not result["success"]:
				continue
			var child: Creature = result["child"]
			var scene := get_tree().current_scene
			if scene != null and scene.has_method("adopt_offspring"):
				scene.call("adopt_offspring", child)
			else:
				session.party.accept(child, session.ship)
				session.enroll(child)
			_report("[b]%s[/b]\n\nborn to %s and %s.\n\n%s" % [
				child.display_name(),
				eligible[i].display_name(), eligible[j].display_name(),
				"Something new surfaced in it."
					if not (result["mutations"] as Array).is_empty()
					else "It takes after its parents."])
			return
	_report("No viable pairing among your creatures.")


func _assay() -> void:
	if not _charge("assay"):
		return
	var lines: Array[String] = []
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		var hidden := PhenotypeResolver.hidden_carriers(c.genetics.genome)
		lines.append("[b]%s[/b]" % c.display_name())
		if hidden.is_empty():
			lines.append("  carries nothing hidden")
		for h in hidden.slice(0, 4):
			lines.append("  %s (%s)" % [h["name"], h["reason"]])
	_report("\n".join(lines) if not lines.is_empty() else "You have nothing to assay.")


func _purge() -> void:
	if not _charge("purge"):
		return
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		for mark in c.epigenetics.profile.marks:
			if mark.has_tag(&"trauma"):
				c.epigenetics.profile.remove(mark.uid)
				c.stats.mark_dirty()
				_report("Eased '%s' out of %s.\n\nIt sleeps easier now."
					% [mark.display_name, c.display_name()])
				return
	_report("Nothing you have carries a scar worth easing.")


func _divine() -> void:
	if not _charge("divine"):
		return
	var lines: Array[String] = []
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		var best := ""
		var best_progress := 0.0
		for archetype_id in c.archetype.state.progress:
			if c.archetype.state.is_crystallized(archetype_id):
				continue
			var p := c.archetype.state.get_progress(archetype_id)
			if p > best_progress:
				best_progress = p
				var d: ArchetypeDefinitionResource = GenomeDB.get_archetype(archetype_id)
				best = d.display_name if d != null else String(archetype_id)
		if not best.is_empty():
			lines.append("  %-18s is becoming %s (%.0f%%)"
				% [c.display_name(), best, best_progress * 100.0])
	_report("\"This is what they are turning into.\"\n\n" + "\n".join(lines)
		if not lines.is_empty() else "\"None of them are becoming anything yet.\"")


func _consecrate() -> void:
	if not _charge("consecrate"):
		return
	for entry in session.party.active:
		var c: Creature = entry
		if not is_instance_valid(c):
			continue
		for archetype_id in c.archetype.state.progress:
			var p := c.archetype.state.get_progress(archetype_id)
			if p >= 0.55 and p < 1.0 and not c.archetype.state.is_crystallized(archetype_id):
				c.archetype.state.set_progress(archetype_id, 1.0)
				c.archetype.evaluate()
				_report("Something settles in %s.\n\nIt is what it was becoming."
					% c.display_name())
				return
	_report("\"Nothing you have is close enough to push.\"")


func _rumor() -> void:
	var candidate := PlanetManager.create_planet()
	PlanetGenerator.derive(candidate)
	var pressures: Array[String] = []
	for key in candidate.epigenetic_pressures:
		var mark := GenomeDB.get_epi_template(key)
		pressures.append(mark.display_name if mark != null else String(key))
	_report("\"There's a world called [b]%s[/b] out that way.\"\n\n  %s star · %.0f °C · gravity %.2f\n  %d lifeforms · habitability %.0f%%\n  it would shape them: %s\n\n[i]Find it on the star map (J) after you leave.[/i]" % [
		candidate.display_name, candidate.star_class, candidate.mean_temperature_c,
		candidate.surface_gravity_g, candidate.fauna_species_count,
		candidate.habitability * 100.0,
		", ".join(pressures) if not pressures.is_empty() else "not at all"])


func _study() -> void:
	if not _charge("study"):
		return
	if session.research != null:
		session.research.add_points(15.0)
		_report("You buy time in the archive.\n\n+15 research points (now %.0f)." % session.research.points)
	else:
		session.ship.add_salvage(5.0)
		_report("The tablets are incomplete, but you salvage a few useful diagrams.\n\n+5 salvage refunded as notes.")


func _expand_hold() -> void:
	if not _charge("expand_hold"):
		return
	# Prefer a real Cargo Hold level when salvage allows after the service fee.
	if session.ship.can_upgrade("mod_hold") and session.ship.upgrade("mod_hold"):
		session.stock.carry_capacity = session.ship.carry_capacity()
		session.ship.apply_biology_bonuses()
		_report("Hull plates weld into a deeper hold.\n\nCargo capacity is now [b]%.0f[/b]." % session.ship.carry_capacity())
		return
	session.stock.carry_capacity += 40.0
	_report("They bolt on a local bay.\n\nCarry capacity +40 (now %.0f).\nUpgrade the Cargo Hold module in the ship bay for bigger gains." % session.stock.carry_capacity)


func _board() -> void:
	if session.party.active.size() <= 1:
		_report("You need someone to leave behind — and someone to keep walking.")
		return
	if not _charge("board"):
		return
	var c: Creature = session.party.active.back()
	if session.party.deposit(c):
		_report("%s is stabled here until you return.\n\nBoarded stock never starves." % "Companion")
	else:
		_report("Could not board them.")


func _store_review() -> void:
	var lines: Array[String] = ["[b]Warehouse ledger[/b]", ""]
	for entry in session.stock.lines():
		lines.append("  %s  local %.0f · hold %.0f" % [
			Market.display_name(entry["id"]),
			float(entry["local"]), float(entry["carried"])])
	if lines.size() <= 2:
		lines.append("  (empty)")
	lines.append("")
	lines.append("Hold mass %.0f / %.0f" % [
		session.stock.carried_mass(), session.stock.carry_capacity])
	_report("\n".join(lines))


func _recruit() -> void:
	if settlement_runtime == null:
		_report("\"No one here is ready to leave this dirt.\"\n\nCatch fauna in the wild, or breed at the stables.")
		return
	var from := Vector2.ZERO
	var scene := get_tree().current_scene
	if scene != null and scene.get("player") != null:
		from = scene.player.global_position
	var candidate := settlement_runtime.nearest_recruitable(from, 140.0)
	if candidate == null:
		for c in settlement_runtime.settlers:
			if is_instance_valid(c) and not bool(c.get_meta("is_keeper", false)):
				candidate = c
				break
	if candidate == null:
		_report("\"Everyone who remains is bound to a post.\"\n\nKeepers stay with their buildings. Free folk can join you.")
		return
	if not _charge("recruit"):
		return
	var nm := candidate.display_name()
	if settlement_runtime.take_recruit(candidate):
		_report("[b]%s[/b] sets down their work and walks with you.\n\nThey carry this village's lessons into your clan." % nm)
	else:
		_report("They hesitate at the edge of the firelight.")


# --- Trade / craft submodes -------------------------------------------------------

func _populate_trade_sell() -> void:
	_trade_list.clear()
	_trade_list.set_meta("mode", "sell")
	var lines := session.stock.lines()
	if lines.is_empty():
		_trade_list.add_item("(nothing to sell — go harvest)")
		_report("Bring goods and I'll weigh them.")
		return
	for entry in lines:
		var id := String(entry["id"])
		_trade_list.add_item("%s  x%.0f   sell10=%.0f salvage" % [
			Market.display_name(id), float(entry["total"]),
			Market.sell_value(id, 10.0, session.ship)])
		_trade_list.set_item_metadata(_trade_list.item_count - 1, id)
	# Mode switch buttons via report
	_report("[b]Selling[/b]  ·  salvage %.0f  ·  trade bonus %.0f%%\n\nSelect a line, then Sell 10 / Sell All.\n\n[color=#9fd4ff]Tip:[/color] Contact Beacon improves rates." % [
		session.ship.salvage, session.ship.stat("trade_rates") * 100.0])
	# Add buy switch
	if _actions.get_child_count() == 0:
		pass
	var buy_btn := FxButton.new(Color(0.5, 0.75, 0.95))
	buy_btn.text = "Switch to Buy goods"
	buy_btn.custom_minimum_size = Vector2(0, 32)
	buy_btn.pressed.connect(func():
		_mode = "trade_buy"
		_refresh())
	# Put under trade host
	if not _trade_host.has_meta("buy_added"):
		_trade_host.add_child(buy_btn)
		_trade_host.set_meta("buy_added", true)


func _populate_trade_buy() -> void:
	_trade_list.clear()
	_trade_list.set_meta("mode", "buy")
	for entry in Market.all():
		var id := String(entry["id"])
		_trade_list.add_item("%s  buy10=%.0f salvage" % [
			entry.get("display_name", id),
			Market.buy_cost(id, 10.0, session.ship)])
		_trade_list.set_item_metadata(_trade_list.item_count - 1, id)
	_report("[b]Buying[/b]  ·  salvage %.0f\n\nSelect a good, then Sell 10 acts as Buy 10 here." % session.ship.salvage)


func _populate_craft() -> void:
	_trade_list.clear()
	_trade_list.set_meta("mode", "craft")
	CraftingSystem.load_catalog()
	var summary := PlanetManager.active_summary()
	for id in CraftingSystem.catalog:
		var recipe: Dictionary = CraftingSystem.catalog[id]
		var blocked := CraftingSystem.can_craft(id, summary, session.research)
		# Settlement workshop acts as a generic workbench for basic crafts.
		if not blocked.is_empty() and blocked.begins_with("needs a "):
			blocked = ""
		var label := "%s  %s" % [
			recipe.get("display_name", id),
			("— " + blocked) if not blocked.is_empty() else "✓"]
		_trade_list.add_item(label)
		_trade_list.set_item_metadata(_trade_list.item_count - 1, id)
		if not blocked.is_empty():
			_trade_list.set_item_custom_fg_color(_trade_list.item_count - 1, Color(0.55, 0.55, 0.6))
	_report("[b]Workshop[/b]\n\nSelect a recipe, then Sell 10 crafts one batch.\nOutputs scale with your leader's craft skill.")


func _trade_act(qty: float) -> void:
	var mode := String(_trade_list.get_meta("mode", "sell"))
	var selected := _trade_list.get_selected_items()
	if selected.is_empty():
		_report("Select a line first.")
		return
	var meta = _trade_list.get_item_metadata(selected[0])
	if meta == null:
		return
	var id := String(meta)
	if mode == "sell":
		var gained := Market.sell_from_stock(session.stock, id, qty, session.ship)
		if gained <= 0.0:
			_report("Nothing to sell.")
			return
		session.resources_changed.emit()
		ActionEffects.apply(self, "sell", {"name": Market.display_name(id)})
		_report("Sold %s.\n\n[b]+%.1f salvage[/b]  (now %.0f)" % [
			Market.display_name(id), gained, session.ship.salvage])
		_populate_trade_sell()
	elif mode == "buy":
		var bought := Market.buy_to_stock(session.stock, id, minf(qty, 10.0), session.ship)
		if bought <= 0.0:
			_report("Cannot afford that.")
			return
		session.resources_changed.emit()
		_report("Bought %.0f %s.\n\nSalvage now %.0f" % [
			bought, Market.display_name(id), session.ship.salvage])
		_populate_trade_buy()
	elif mode == "craft":
		var leader := session.party.leader()
		var summary := PlanetManager.active_summary()
		# Temporarily ignore station requirement by crafting with null station check bypass:
		var recipe := CraftingSystem.get_recipe(id)
		if recipe.is_empty():
			_report("Unknown recipe.")
			return
		var required_research := String(recipe.get("requires_research", ""))
		if not required_research.is_empty() and session.research != null \
				and not session.research.is_unlocked(required_research):
			_report("Needs research: %s" % required_research)
			return
		if not session.stock.spend(recipe.get("inputs", {})):
			_report("Insufficient materials.")
			return
		var skill := String(recipe.get("skill", "craft"))
		var aptitude: float = leader.stats.trait_value(skill) if leader != null else 1.0
		var multiplier := clampf(aptitude + 0.15, 0.25, 4.0)  # workshop bonus
		var produced := {}
		for res_id in recipe.get("outputs", {}):
			var out_qty: float = float(recipe["outputs"][res_id]) * multiplier
			session.stock.add_local(res_id, out_qty)
			produced[res_id] = out_qty
		session.resources_changed.emit()
		ActionEffects.apply(self, "harvest", {"name": recipe.get("display_name", id)})
		var bits: Array[String] = []
		for k in produced:
			bits.append("%.1f %s" % [float(produced[k]), Market.display_name(k)])
		_report("Crafted [b]%s[/b].\n\nProduced: %s" % [
			recipe.get("display_name", id), ", ".join(bits)])
		_populate_craft()
