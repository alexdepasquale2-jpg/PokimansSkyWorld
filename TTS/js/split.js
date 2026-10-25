/* Segmentation — text in, speakable chunks out.
 *
 * Pure: no DOM, no speech API, no timers. This is the half of the reader that
 * can be tested properly, so everything fiddly lives here.
 *
 * Two jobs:
 *
 *  1. Find sentence boundaries without splitting on "Dr.", "3.14" or "J. R. R.".
 *  2. Cut anything still too long into clause-sized pieces, because Android
 *     Chrome truncates a single utterance at roughly fifteen seconds. Speaking
 *     one chunk at a time is the workaround, and it is also what gives the
 *     reader a seek unit and a highlight unit.
 *
 * Every chunk carries its exact offsets in the source string, so the reading
 * pane highlights the original text rather than a reconstruction of it. The
 * chunks partition the input: joining their slices reproduces the input byte
 * for byte, which the self-test asserts.
 */
(function (window) {
  'use strict';

  var DEFAULT_MAX_CHARS = 180;

  var TERMINATORS = '.!?…。！？';
  var CLOSERS = '"”’\')]}»';
  var CLAUSE = ',;:—–';

  /* Words that end in a period without ending a sentence. Not exhaustive —
   * no list is — but it covers what turns up in pasted prose. */
  var ABBREV = {};
  ('mr mrs ms mx dr prof rev fr st jr sr vs etc cf al fig inc ltd co corp ' +
   'dept est univ approx ave rd blvd ln apt ste vol ch chap ed eds pp ca circa ' +
   'jan feb mar apr jun jul aug sep sept oct nov dec mon tue tues wed thu thur ' +
   'thurs fri sat sun hr hrs pt pts qty'
  ).split(' ').forEach(function (w) { ABBREV[w] = true; });

  /* These are abbreviations only when a number follows — "No. 5" is a label,
   * "the answer is no." is a sentence, and prose has far more of the latter. */
  var NUMBERED = { no: true, nos: true, vol: true, ch: true, pp: true, fig: true };

  function isSpace(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' || c === ' '; }
  function has(set, c) { return c !== undefined && set.indexOf(c) >= 0; }

  /* Is the period at `dot` part of an abbreviation or an initial rather than
   * the end of a sentence? */
  function abbreviationAt(text, dot) {
    var i = dot;
    while (i > 0 && /[A-Za-z]/.test(text.charAt(i - 1))) i--;
    var word = text.slice(i, dot);
    if (!word) return false;

    if (word.length === 1) {
      // "J. R. R. Tolkien" — a lone capital is an initial, never a full stop.
      if (word === word.toUpperCase()) return true;
      // the tail of a dotted abbreviation: the "g" of "e.g."
      if (i > 0 && text.charAt(i - 1) === '.') return true;
      return false;
    }

    var lower = word.toLowerCase();
    if (NUMBERED[lower]) {
      var p = dot + 1;
      while (p < text.length && isSpace(text.charAt(p))) p++;
      return p < text.length && /[0-9]/.test(text.charAt(p));
    }
    return ABBREV[lower] === true;
  }

  /* Offsets at which one chunk ends and the next begins. */
  function boundaries(text) {
    var n = text.length;
    var cuts = [];
    var i = 0;

    while (i < n) {
      var c = text.charAt(i);

      // A blank line always ends a chunk. A single newline does not — plain
      // text is often hard-wrapped, and splitting every wrapped line would
      // chop sentences into stutters.
      if (c === '\n' || c === '\r') {
        var j = i, newlines = 0;
        while (j < n && isSpace(text.charAt(j))) {
          if (text.charAt(j) === '\n') newlines++;
          j++;
        }
        if (newlines >= 2) cuts.push(j);
        i = j;
        continue;
      }

      if (has(TERMINATORS, c)) {
        var t = i;
        while (t < n && has(TERMINATORS, text.charAt(t))) t++;   // "?!" and "..."
        var k = t;
        while (k < n && has(CLOSERS, text.charAt(k))) k++;       // ...he said."

        var atEnd = k >= n;
        if (atEnd || isSpace(text.charAt(k))) {
          var lone = (t - i === 1 && c === '.');

          // An ellipsis trailing off into a lowercase word is a pause inside a
          // sentence, not the end of one: "Wait… no." is one breath.
          var ellipsis = (c === '…') || (c === '.' && t - i >= 3);
          var continues = false;
          if (ellipsis) {
            var p = k;
            while (p < n && isSpace(text.charAt(p))) p++;
            continues = p < n && /[a-z]/.test(text.charAt(p));
          }

          if (!continues && !(lone && abbreviationAt(text, i))) {
            // Take the trailing spaces with this chunk, plus at most one
            // newline; a second newline belongs to the blank-line rule.
            var m = k, seenNewline = false;
            while (m < n && isSpace(text.charAt(m))) {
              if (text.charAt(m) === '\n') {
                if (seenNewline) break;
                seenNewline = true;
              }
              m++;
            }
            cuts.push(m);
            i = m;
            continue;
          }
        }
        i = t;
        continue;
      }

      i++;
    }

    // Dedupe and drop the degenerate ends; the caller supplies 0 and n.
    var seen = {}, clean = [];
    for (var q = 0; q < cuts.length; q++) {
      var v = cuts[q];
      if (v > 0 && v < n && !seen[v]) { seen[v] = true; clean.push(v); }
    }
    clean.sort(function (a, b) { return a - b; });
    return clean;
  }

  /* Break [start, end) into pieces no longer than maxChars, preferring a
   * clause break, then any space, and only then a hard cut mid-word. */
  function chop(text, start, end, maxChars) {
    var out = [];
    var s = start;
    var floor = Math.max(24, Math.floor(maxChars / 3));

    while (end - s > maxChars) {
      var limit = s + maxChars;
      var cut = -1;
      var i;

      for (i = limit; i > s + floor; i--) {
        if (has(CLAUSE, text.charAt(i - 1)) && i < end && isSpace(text.charAt(i))) { cut = i; break; }
      }
      if (cut < 0) {
        for (i = limit; i > s + floor; i--) {
          if (isSpace(text.charAt(i - 1))) { cut = i; break; }
        }
      }
      if (cut < 0) cut = limit;

      out.push([s, cut]);
      s = cut;
    }
    out.push([s, end]);
    return out;
  }

  /* text -> [{ index, start, end, text, speech }] */
  function segment(text, opts) {
    var maxChars = (opts && opts.maxChars) || DEFAULT_MAX_CHARS;
    if (typeof text !== 'string' || !text.replace(/\s/g, '')) return [];

    var n = text.length;
    var cuts = boundaries(text);
    var ranges = [];
    var prev = 0, i;

    for (i = 0; i < cuts.length; i++) {
      if (cuts[i] > prev) { ranges.push([prev, cuts[i]]); prev = cuts[i]; }
    }
    if (prev < n) ranges.push([prev, n]);

    var raw = [];
    for (i = 0; i < ranges.length; i++) {
      var pieces = chop(text, ranges[i][0], ranges[i][1], maxChars);
      for (var p = 0; p < pieces.length; p++) {
        var a = pieces[p][0], b = pieces[p][1];
        raw.push({ start: a, end: b, text: text.slice(a, b), speech: text.slice(a, b).trim() });
      }
    }

    // Whitespace-only pieces are real text and must not vanish from the pane,
    // but they are not worth an utterance. Fold them into a neighbour.
    var merged = [];
    for (i = 0; i < raw.length; i++) {
      var c = raw[i];
      if (!c.speech && merged.length) {
        var last = merged[merged.length - 1];
        last.end = c.end;
        last.text = text.slice(last.start, last.end);
        continue;
      }
      merged.push(c);
    }
    while (merged.length > 1 && !merged[0].speech) {
      merged[1].start = merged[0].start;
      merged[1].text = text.slice(merged[1].start, merged[1].end);
      merged.shift();
    }

    for (i = 0; i < merged.length; i++) merged[i].index = i;
    return merged;
  }

  window.TTS = window.TTS || {};
  window.TTS.split = {
    segment: segment,
    boundaries: boundaries,
    DEFAULT_MAX_CHARS: DEFAULT_MAX_CHARS
  };
})(typeof window !== 'undefined' ? window : this);
