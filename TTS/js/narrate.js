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

  // --- condensing ----------------------------------------------------------
  //
  // A raw session is one beat per tool call, and read aloud that becomes
  // "Now I… Now I… Now I…" for minutes at a stretch. The actions are true but
  // they are not the interesting part; the reasoning is, and it drowns.
  //
  // So: fold each result into the action that caused it, collapse runs of
  // consecutive actions into one sentence, and merge adjacent asides. Nothing
  // that carries reasoning — a brief, a thought, a verdict — is ever touched.

  var NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    'eight', 'nine', 'ten', 'eleven', 'twelve'];

  function numberWord(n) { return n < NUMBER.length ? NUMBER[n] : String(n); }

  /* Tool name -> how to count it out loud. */
  var GROUPS = {
    Read:  ['reading', 'file', 'files'],
    Write: ['writing', 'file', 'files'],
    Edit:  ['making', 'edit', 'edits'],
    Bash:  ['running', 'command', 'commands'],
    Grep:  ['running', 'search', 'searches'],
    Glob:  ['running', 'search', 'searches']
  };

  var OPENERS = ['Now I', 'Then I', 'Next I', 'After that I'];

  /* "Now I read the harness." -> "read the harness" */
  function clauseOf(text) {
    return String(text)
      .replace(/^\s*(?:Now|Then|Next|After that)?\s*I\s+/i, '')
      .replace(/\s*\.\s*$/, '')
      .trim();
  }

  /* Not every source writes in the first person — the test narrator says
   * "Running the self-test." Prefixing that with "Now I" produces nonsense, so
   * only re-open a sentence that was built that way in the first place. */
  function firstPerson(text) {
    return /^\s*(?:Now|Then|Next|After that)?\s*I\s+/i.test(String(text));
  }

  function reopen(text, opener) {
    return firstPerson(text)
      ? opener + ' ' + clauseOf(text) + '.'
      : String(text).replace(/\s*\.\s*$/, '') + '.';
  }

  function withResult(text, result, opener) {
    return reopen(text, opener).replace(/\.$/, '') + ' — ' + clauseOf(result) + '.';
  }

  function joinList(items) {
    if (items.length <= 1) return items[0] || '';
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  /* One sentence for a run of actions. Short runs keep their detail, because
   * detail is what makes them worth hearing; long ones become a tally. */
  function summariseRun(run, opener) {
    if (run.length <= 3) {
      var clauses = [];
      for (var i = 0; i < run.length; i++) {
        var c = clauseOf(run[i].text);
        if (c && clauses.indexOf(c) < 0) clauses.push(c);
      }
      if (clauses.length === 1) return reopen(run[0].text, opener);
      return opener + ' ' + joinList(clauses) + '.';
    }

    var tally = {};
    var order = [];
    for (var j = 0; j < run.length; j++) {
      var key = GROUPS[run[j].at] ? run[j].at : 'other';
      if (!tally[key]) { tally[key] = 0; order.push(key); }
      tally[key]++;
    }

    var phrases = [];
    for (var k = 0; k < order.length; k++) {
      var name = order[k];
      var n = tally[name];
      var g = GROUPS[name];
      phrases.push(g
        ? g[0] + ' ' + numberWord(n) + ' ' + (n === 1 ? g[1] : g[2])
        : numberWord(n) + ' further ' + (n === 1 ? 'step' : 'steps'));
    }
    return opener + ' work through ' + joinList(phrases) + '.';
  }

  /* "Twelve assertions on segmentation, all passing." — the sections come from
   * the harness, so the summary says what was covered, not just how many. */
  function summarisePasses(passes) {
    var sections = [];
    for (var i = 0; i < passes.length; i++) {
      var name = String(passes[i].at || '').trim();
      if (name && sections.indexOf(name) < 0) sections.push(name);
    }
    var count = numberWord(passes.length) + ' assertion' + (passes.length === 1 ? '' : 's');

    if (!sections.length) return count.charAt(0).toUpperCase() + count.slice(1) + ', all passing.';
    if (sections.length > 3) {
      return count.charAt(0).toUpperCase() + count.slice(1) +
        ' across ' + numberWord(sections.length) + ' areas, all passing.';
    }
    var lead = count.charAt(0).toUpperCase() + count.slice(1);
    return lead + ' on ' + joinList(sections.map(function (s) { return s.toLowerCase(); })) + ', all passing.';
  }

  function condense(beats, opts) {
    opts = opts || {};
    var maxRun = opts.maxRun == null ? 3 : opts.maxRun;
    var out = [];
    var i = 0;
    var opener = 0;

    while (i < beats.length) {
      var b = beats[i];

      // A hundred consecutive passing assertions carry one fact between them.
      // A failing one carries all of its own, so those are never merged.
      if (b.kind === 'verdict' && b.tone === 'good') {
        var passes = [];
        while (i < beats.length && beats[i].kind === 'verdict' && beats[i].tone === 'good') {
          passes.push(beats[i]);
          i++;
        }
        if (passes.length >= 3) {
          out.push({
            index: passes[0].index,
            kind: 'verdict',
            text: summarisePasses(passes),
            tone: 'good',
            at: passes.length + ' assertions',
            inferred: false,
            speaker: '',
            merged: passes.length
          });
        } else {
          for (var p = 0; p < passes.length; p++) out.push(passes[p]);
        }
        continue;
      }

      // Reasoning passes through untouched.
      if (b.kind !== 'action' && b.kind !== 'say' && b.kind !== 'result') {
        out.push(b);
        i++;
        continue;
      }

      // Several asides in a row are one aside.
      if (b.kind === 'say') {
        var says = [];
        while (i < beats.length && beats[i].kind === 'say') { says.push(beats[i].text); i++; }
        out.push(Object.assign({}, b, { text: says.join(' ') }));
        continue;
      }

      // A result with no action in front of it stands alone.
      if (b.kind === 'result') { out.push(b); i++; continue; }

      // An action, and the result it produced, are one thought.
      var run = [];
      while (i < beats.length && beats[i].kind === 'action') {
        var action = beats[i];
        var next = beats[i + 1];
        i++;
        if (next && next.kind === 'result') {
          i++;
          out.push(Object.assign({}, action, {
            text: withResult(action.text, next.text, OPENERS[opener++ % OPENERS.length]),
            tone: next.tone || action.tone,
            fused: true
          }));
          run = [];                       // the fused beat breaks the run
          break;
        }
        run.push(action);
        if (run.length >= maxRun * 4) break;   // do not let one run eat the session
      }

      if (run.length) {
        if (run.length === 1) {
          out.push(Object.assign({}, run[0], {
            text: reopen(run[0].text, OPENERS[opener++ % OPENERS.length])
          }));
        } else {
          out.push({
            index: run[0].index,
            kind: 'action',
            text: summariseRun(run, OPENERS[opener++ % OPENERS.length]),
            tone: 'neutral',
            at: run.length + ' steps',
            inferred: false,
            speaker: '',
            merged: run.length
          });
        }
      }
    }

    // Adjacent duplicates read as a stutter.
    var deduped = [];
    for (var d = 0; d < out.length; d++) {
      var prev = deduped[deduped.length - 1];
      if (prev && prev.text === out[d].text && prev.kind === out[d].kind) continue;
      deduped.push(out[d]);
    }

    for (var n = 0; n < deduped.length; n++) deduped[n].index = n;
    return deduped;
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
    counts: counts,
    condense: condense,
    clauseOf: clauseOf,
    firstPerson: firstPerson,
    numberWord: numberWord
  };
})(typeof window !== 'undefined' ? window : this);
