/* Narration scripts — validation, and the turn from beats into a document.
 *
 * Pure: no DOM, no speech API. A script is what tools/monologue.mjs writes —
 * a development record turned into speakable beats. This module checks one is
 * well formed, flattens a mode into a single string the existing segmenter can
 * chew on, and maps every chunk back to the beat it came from so the player
 * can label and colour it.
 *
 * The flattening matters: rather than inventing a second playback path, a
 * narration mode becomes ordinary text with an index beside it, and the reader
 * plays it with the machinery that already works.
 */
(function (window) {
  'use strict';

  var KINDS = {
    brief:   { label: 'Brief',   rate: 1.00, pitch: 1.00 },
    thought: { label: 'Thinking', rate: 0.94, pitch: 0.96 },
    action:  { label: 'Doing',   rate: 1.06, pitch: 1.00 },
    result:  { label: 'Result',  rate: 1.00, pitch: 0.98 },
    say:     { label: 'Saying',  rate: 1.00, pitch: 1.02 },
    verdict: { label: 'Verdict', rate: 0.96, pitch: 1.00 }
  };

  function kindOf(kind) { return KINDS[kind] || KINDS.say; }

  /* Throws a message worth showing a person. */
  function parseScript(input) {
    var raw = input;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); }
      catch (e) { throw new Error('That is not valid JSON: ' + e.message); }
    }
    if (!raw || typeof raw !== 'object') throw new Error('A narration script must be an object.');
    if (!raw.modes || typeof raw.modes !== 'object') throw new Error('No "modes" in this script.');

    var names = Object.keys(raw.modes);
    if (!names.length) throw new Error('The script has no modes in it.');

    var modes = {};
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      var mode = raw.modes[name];
      if (!mode || !Array.isArray(mode.beats)) throw new Error('Mode "' + name + '" has no beats.');

      var beats = [];
      for (var b = 0; b < mode.beats.length; b++) {
        var raw_b = mode.beats[b];
        if (!raw_b || typeof raw_b.text !== 'string') continue;
        var text = raw_b.text.trim();
        if (!text) continue;
        beats.push({
          index: beats.length,
          kind: KINDS[raw_b.kind] ? raw_b.kind : 'say',
          text: text,
          tone: raw_b.tone || 'neutral',
          at: raw_b.at || '',
          inferred: !!raw_b.inferred,
          speaker: raw_b.speaker || ''
        });
      }
      if (!beats.length) throw new Error('Mode "' + name + '" has no readable beats.');

      modes[name] = {
        name: name,
        label: mode.label || name,
        caveat: mode.caveat || '',
        source: mode.source || {},
        beats: beats
      };
    }

    return {
      version: raw.version || 1,
      title: raw.title || 'Narration',
      generated: raw.generated || '',
      modes: modes,
      order: Object.keys(modes)
    };
  }

  /* A mode becomes one string plus the offsets each beat occupies in it. */
  function flatten(mode, opts) {
    var spoken = !opts || opts.announce !== false;
    var parts = [];
    var ranges = [];
    var at = 0;

    for (var i = 0; i < mode.beats.length; i++) {
      var b = mode.beats[i];

      // A short spoken label keeps a listener oriented — otherwise a result
      // and a reconstruction sound identical, which is the one thing this
      // must not do.
      var lead = '';
      if (spoken) {
        if (b.kind === 'brief') lead = 'The brief: ';
        else if (b.kind === 'thought') lead = b.inferred ? 'Reconstructed: ' : 'Thinking: ';
        else if (b.kind === 'result') lead = 'Result: ';
        else if (b.kind === 'verdict') lead = 'Verdict: ';
      }

      var text = lead + b.text;
      if (!/[.!?…]$/.test(text)) text += '.';

      var start = at;
      parts.push(text);
      at += text.length;
      ranges.push({ beat: b.index, start: start, end: at });

      if (i < mode.beats.length - 1) {
        parts.push('\n\n');
        at += 2;
      }
    }

    return { text: parts.join(''), ranges: ranges };
  }

  /* Which beat does a source offset belong to? Chunks are produced by
   * split.segment over the flattened text, so this is how a chunk finds its
   * beat. Binary search: a long session runs to hundreds of beats. */
  function beatAt(ranges, offset) {
    var lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (offset < ranges[mid].start) hi = mid - 1;
      else if (offset >= ranges[mid].end) lo = mid + 1;
      else return ranges[mid].beat;
    }
    return ranges.length ? ranges[Math.min(lo, ranges.length - 1)].beat : 0;
  }

  /* Tag each chunk with its beat, so the player can colour and label it and
   * modulate the voice per kind. */
  function tag(chunks, ranges, beats) {
    for (var i = 0; i < chunks.length; i++) {
      var index = beatAt(ranges, chunks[i].start);
      chunks[i].beat = index;
      chunks[i].beatKind = beats[index] ? beats[index].kind : 'say';
      chunks[i].beatFirst = i === 0 || chunks[i - 1].beat !== index;
    }
    return chunks;
  }

  function counts(mode) {
    var out = {};
    for (var i = 0; i < mode.beats.length; i++) {
      var k = mode.beats[i].kind;
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }

  window.TTS = window.TTS || {};
  window.TTS.narrate = {
    KINDS: KINDS,
    kindOf: kindOf,
    parseScript: parseScript,
    flatten: flatten,
    beatAt: beatAt,
    tag: tag,
    counts: counts
  };
})(typeof window !== 'undefined' ? window : this);
