/* Kiln — the circle: eight simulated people who make things.
 *
 * There is no server, so the circle is generated. That is a limitation
 * turned into the app's most honest feature, because a generated circle can
 * be given properties a real platform would never admit to:
 *
 *   Whether a peer responds to your work is a fixed fact about that peer,
 *   not a roll of dice. Nour responds to everything. Basil responds to one
 *   piece in seven, forever, no matter what you make. This is written down
 *   in the Audit tab in those words.
 *
 * That single decision removes the engine underneath most of what social
 * media does to a young person. If response rate were random, every post
 * would be a pull of a lever and you would learn, correctly, that posting
 * more often pays. If it is a fixed property of other people, you learn the
 * true thing instead: how much someone responds is about them, and the only
 * thing you control is the work.
 *
 * Responses also arrive the day after you post. Never the same session. You
 * cannot sit and wait for them, because they are not coming today.
 */
(function (K) {
  'use strict';
  const C = K.content;
  const { seeded, clamp } = K.core;

  /* Fixed disposition per peer: responds to one piece in `every`, counting
   * through your pieces in order, starting at `offset`. Deterministic, and
   * printed for the user in Audit. */
  const DISPOSITION = {
    nour:  { every: 1, offset: 0, warmth: 'responds to everything you make' },
    tomas: { every: 3, offset: 1, warmth: 'responds to about one piece in three' },
    imani: { every: 2, offset: 0, warmth: 'responds to about half of what you make' },
    yuki:  { every: 2, offset: 1, warmth: 'responds to about half of what you make' },
    basil: { every: 7, offset: 3, warmth: 'responds to about one piece in seven' },
    priya: { every: 3, offset: 0, warmth: 'responds to about one piece in three' },
    okwe:  { every: 4, offset: 2, warmth: 'responds to about one piece in four' },
    lena:  { every: 8, offset: 5, warmth: 'responds rarely, and at length' }
  };

  const byId = {};
  for (const p of C.PEERS) byId[p.id] = p;

  function peer(id) { return byId[id]; }
  function all() { return C.PEERS; }

  function postId(peerId, day) { return peerId + '@' + day; }

  /* --- does this peer make something today? ------------------------------
   * Seeded on the day and the peer, so it is settled before you look. Some
   * peers go quiet for a week. That absence is normal and the app never
   * flags it, because "X hasn't posted in a while" is a nudge aimed at X. */
  function active(p, day) {
    return seeded('active', p.id, day)() < p.cadence;
  }

  /* --- writing ------------------------------------------------------------ */
  function writeText(p, day) {
    const rng = seeded('write', p.id, day);
    const long = rng() < p.wordy;
    const parts = [];
    const n = long ? rng.int(3, 5) : rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      if (i > 0 && rng.chance(0.4)) { parts.push(rng.pick(C.W.mid)); continue; }
      parts.push(rng.pick(C.W.open) + ' ' + rng.pick(C.W.subj) + ' ' +
                 rng.pick(C.W.verb) + ', ' + rng.pick(C.W.tail));
    }
    let text = parts.join(' ');
    text = text.charAt(0).toUpperCase() + text.slice(1);
    return text;
  }

  /* --- beats --------------------------------------------------------------
   * Generated with a little musical prior so peers' patterns are listenable:
   * kick near downbeats, snare on the backbeat, hats subdividing, tone
   * sparse. Then the seed is allowed to break one of those rules. */
  function beatPattern(p, day) {
    const rng = seeded('beat', p.id, day);
    const g = () => new Array(16).fill(false);
    const kick = g(), snare = g(), hat = g(), tone = g();

    kick[0] = true;
    if (rng.chance(0.8)) kick[8] = true;
    for (let i = 0; i < 16; i++) if (rng.chance(0.12)) kick[i] = true;

    snare[4] = true; snare[12] = true;
    if (rng.chance(0.3)) snare[14] = true;

    const div = rng.pick([1, 2, 2, 4]);
    for (let i = 0; i < 16; i++) if (i % div === 0 && rng.chance(0.85)) hat[i] = true;

    const toneN = rng.int(1, 5);
    for (let i = 0; i < toneN; i++) tone[rng.int(0, 15)] = true;

    // One rule broken on purpose, because perfectly correct is not a person.
    if (rng.chance(0.35)) { snare[rng.chance(0.5) ? 4 : 12] = false; }

    return {
      tempo: rng.int(72, 132),
      tracks: [kick, snare, hat, tone].map(t => t.map(v => (v ? 1 : 0)))
    };
  }

  /* --- the post ----------------------------------------------------------- */
  function post(p, day) {
    if (!active(p, day)) return null;
    const rng = seeded('post', p.id, day);
    const prompt = K.state.promptFor(day);
    /* Peers reach for a craft the prompt suits. If none of theirs fits they
     * answer in their own medium anyway — the studio tells you the prompt is
     * a suggestion rather than a rule, and the circle should be seen taking
     * that at its word rather than quietly obeying. */
    const fits = p.crafts.filter(c => prompt.c.indexOf(c) >= 0);
    const craft = rng.pick(fits.length ? fits : p.crafts);

    const o = {
      id: postId(p.id, day),
      peer: p.id,
      day,
      craft,
      title: rng.chance(0.45) ? rng.pick(C.TITLES) : '',
      note: rng.chance(0.3) ? rng.pick(C.W.mid) : ''
    };

    if (craft === 'draw') o.payload = K.art.generate(p, day, 'post');
    else if (craft === 'write') o.payload = { text: writeText(p, day) };
    else o.payload = beatPattern(p, day);

    return o;
  }

  /* Every post from the circle for a given day. */
  function postsOn(day) {
    const out = [];
    for (const p of C.PEERS) {
      const o = post(p, day);
      if (o) out.push(o);
    }
    return out;
  }

  function postById(id) {
    const at = id.indexOf('@');
    if (at < 0) return null;
    const p = byId[id.slice(0, at)];
    const day = parseInt(id.slice(at + 1), 10);
    if (!p || isNaN(day)) return null;
    return post(p, day);
  }

  /* --- responses to your work --------------------------------------------
   * Deterministic from the piece's ordinal in your body of work and each
   * peer's fixed disposition. Nothing here consults luck, recency, effort,
   * or how often you opened the app. */
  function responsesFor(state, piece) {
    const today = K.core.today();
    if (today <= piece.day) return [];               // never the same day
    if (piece.audience !== 'circle') return [];      // kept to yourself is kept

    const ordinal = state.pieces.filter(x => x.audience === 'circle')
      .findIndex(x => x.id === piece.id);
    if (ordinal < 0) return [];

    const out = [];
    for (const p of C.PEERS) {
      const d = DISPOSITION[p.id];
      if (!d) continue;
      if ((ordinal + d.offset) % d.every !== 0) continue;
      // They also have to have been around the day after you posted.
      if (!active(p, piece.day + 1)) continue;

      const rng = seeded('resp', p.id, piece.id);
      const pool = C.PRAISE.filter(x => x.for.indexOf(piece.craft) >= 0);
      const praise = rng.pick(pool);
      const words = rng() < p.wordy ? rng.pick([
        'Kept looking at it.', 'I want to try this.', 'Did not expect that.',
        'This is the one.', 'Made me want to make something.',
        'I would not have thought of it.', 'Do more of these.'
      ]) : '';
      out.push({ from: p.id, praise: praise.id, text: words, day: piece.day + 1 });
    }
    return out;
  }

  function disposition(id) { return DISPOSITION[id]; }

  K.peers = { all, peer, post, postsOn, postById, active, responsesFor, disposition, postId };
})(window.Kiln = window.Kiln || {});
