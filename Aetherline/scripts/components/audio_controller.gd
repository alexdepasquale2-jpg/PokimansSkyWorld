extends CreatureComponent
class_name AudioController

## Makes a creature's genetics audible the same way VisualController makes them
## visible. No sample assets yet — this synthesizes tones procedurally so the
## MAPPING is real and testable now, and swapping in recorded audio later means
## replacing the generator, not rewiring the data path.
##
##   size / mass  -> pitch (a big animal is a low animal)
##   aggression   -> harshness and volume
##   archetype    -> a distinct interval layered over the base voice
##
## The whole point of the project is that a player can recognise a bloodline.
## Recognising it with their eyes shut is the same promise.

const SAMPLE_RATE := 22050.0

var player: AudioStreamPlayer2D
var _base_pitch: float = 1.0
var _harshness: float = 0.0
var _volume_db: float = -12.0


func _on_setup() -> void:
	player = AudioStreamPlayer2D.new()
	player.name = "CreatureVoice"
	player.stream = _make_voice()
	creature.add_child(player)


## Recompute the voice from the resolved phenotype. Called alongside
## VisualController.refresh — the two are the same idea in two senses.
func refresh() -> void:
	if creature == null or player == null:
		return
	var t: Dictionary = creature.stats.phenotype()
	# Bigger frame, lower voice. Inverse-ish so extremes stay in audible range.
	var size := clampf(float(t.get("size", 1.0)), 0.2, 3.5)
	_base_pitch = clampf(1.6 / (0.5 + size), 0.35, 2.4)
	_harshness = clampf(float(t.get("aggression", 0.5)), 0.0, 1.0)
	_volume_db = lerpf(-18.0, -6.0, _harshness)

	# A crystallized archetype adds a recognisable interval on top.
	if creature.archetype != null and creature.archetype.state.has_any_archetype():
		_base_pitch *= 1.5  # a perfect fifth above its own voice
	player.pitch_scale = _base_pitch
	player.volume_db = _volume_db


## One short vocalisation. Callers: taking damage, crystallizing, being fed.
func vocalize(reason: String = "idle") -> void:
	if player == null:
		return
	match reason:
		"hurt":
			player.pitch_scale = _base_pitch * 1.25
			player.volume_db = _volume_db + 4.0
		"crystallize":
			player.pitch_scale = _base_pitch * 2.0
			player.volume_db = _volume_db + 6.0
		_:
			player.pitch_scale = _base_pitch
			player.volume_db = _volume_db
	player.play()


## Procedural voice: a decaying tone with noise mixed in proportional to how
## aggressive the creature is. Generated once per creature at setup.
func _make_voice() -> AudioStreamWAV:
	var duration := 0.22
	var frames := int(SAMPLE_RATE * duration)
	var data := PackedByteArray()
	data.resize(frames * 2)  # 16-bit mono

	var rng := RandomNumberGenerator.new()
	rng.seed = creature.identity.appearance_seed if creature != null else 0

	for i in frames:
		var progress := float(i) / float(frames)
		var envelope := pow(1.0 - progress, 2.2)
		var tone := sin(TAU * 220.0 * float(i) / SAMPLE_RATE)
		var noise := rng.randf_range(-1.0, 1.0)
		var sample := lerpf(tone, noise, _harshness * 0.35) * envelope * 0.6
		var value := int(clampf(sample, -1.0, 1.0) * 32767.0)
		data.encode_s16(i * 2, value)

	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = int(SAMPLE_RATE)
	stream.stereo = false
	stream.data = data
	return stream


func describe() -> Array[String]:
	return ["  voice pitch %.2f · harshness %.2f · %.0f dB" % [
		_base_pitch, _harshness, _volume_db]]


func to_dict() -> Dictionary:
	return {}  # fully derived from phenotype


func post_load() -> void:
	refresh()
