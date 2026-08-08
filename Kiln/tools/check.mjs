/* Kiln — headless checks on the parts that are not DOM.
 *
 *   node tools/check.mjs
 *
 * Most of this app is claims about behaviour, and the claims are the product:
 * "the batch does not change while you are reading it", "how often someone
 * responds is a fixed fact about them, not a lottery", "loosening a limit
 * waits a day". Those are testable, so they are tested. A design promise
 * with no test behind it is a slogan.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* A browser-shaped shell, big enough for the non-DOM modules. */
const store = new Map();
const sandbox = {
  console,
  Math, Date, JSON, Object, Array, String, Number, Boolean, isNaN, parseInt, parseFloat,
  setTimeout, clearTimeout, setInterval, clearInterval,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  },
  navigator: { language: 'en-GB' },
  document: { createElement: () => ({ style: {}, dataset: {}, appendChild() {}, addEventListener() {} }) },
  matchMedia: () => ({ matches: false })
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of ['core', 'content', 'state', 'charter', 'art', 'peers']) {
  vm.runInContext(readFileSync(join(ROOT, 'js', f + '.js'), 'utf8'), sandbox, { filename: f + '.js' });
}

const K = sandbox.window.Kiln;
let fails = 0;

function ok(name, cond, detail) {
  if (cond) { console.log('  ok   ' + name); return; }
  fails++;
  console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''));
}

function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

console.log('\nseeded randomness');
{
  const a = K.core.seeded('x', 1);
  const b = K.core.seeded('x', 1);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  eq('same seed gives the same stream', seqA, seqB);
  const c = K.core.seeded('x', 2);
  ok('different seed diverges', c() !== seqA[0]);
  ok('values stay in range', seqA.every(v => v >= 0 && v < 1));
}

console.log('\nthe day and the prompt');
{
  const d = K.core.today();
  ok('today is a plausible day index', d > 19000 && d < 40000, String(d));
  eq('the prompt is a fact about the day, not a roll',
    K.state.promptFor(d).t, K.state.promptFor(d).t);
  ok('the prompt walks rather than repeats',
    K.state.promptFor(d).t !== K.state.promptFor(d + 1).t);
  ok('negative day indices do not break the table', !!K.state.promptFor(-5).t);
}

console.log('\nthe circle is settled before you look');
{
  const d = K.core.today();
  const a = K.peers.postsOn(d).map(p => p.id);
  const b = K.peers.postsOn(d).map(p => p.id);
  eq('the same day yields the same posts', a, b);
  ok('not everyone posts every day', a.length < K.peers.all().length, a.length + ' of 8');

  let anyDay = 0;
  for (let i = 0; i < 60; i++) if (K.peers.postsOn(d + i).length) anyDay++;
  ok('most days have somebody', anyDay > 50, anyDay + '/60');

  const p = K.peers.postsOn(d)[0];
  const again = K.peers.postById(p.id);
  eq('a post can be recovered from its id alone', again.id, p.id);
  eq('and its content is identical', JSON.stringify(again.payload), JSON.stringify(p.payload));
}

console.log('\nwhat the peers make');
{
  const d = K.core.today();
  let draws = 0, writes = 0, beats = 0, checked = 0;
  for (let i = 0; i < 120; i++) {
    for (const post of K.peers.postsOn(d + i)) {
      checked++;
      if (post.craft === 'draw') {
        draws++;
        ok2(post.payload.strokes.length > 0, 'a drawing has strokes');
        for (const st of post.payload.strokes) {
          ok2(st.pts.length % 2 === 0, 'points come in pairs');
          ok2(st.pts.every(v => v >= 0 && v <= 1 && !isNaN(v)), 'points stay on the canvas');
          ok2(st.c >= 0 && st.c < K.art.PALETTE.length, 'colour is in the palette');
          ok2(st.s >= 0 && st.s < K.art.SIZES.length, 'brush size is real');
        }
      } else if (post.craft === 'write') {
        writes++;
        ok2(post.payload.text.length > 10, 'writing is not empty');
      } else {
        beats++;
        ok2(post.payload.tracks.length === 4, 'four voices');
        ok2(post.payload.tracks.every(t => t.length === 16), 'sixteen steps');
        ok2(post.payload.tempo >= 60 && post.payload.tempo <= 150, 'tempo is playable');
        ok2(post.payload.tracks.some(t => t.some(v => v)), 'a beat has at least one hit');
      }
    }
  }
  let bad = 0;
  function ok2(cond, why) { if (!cond) { bad++; if (bad < 4) console.log('     ' + why); } }
  ok('every generated piece is well formed', bad === 0, bad + ' bad of ' + checked);
  ok('all three crafts appear', draws > 0 && writes > 0 && beats > 0,
    `${draws} draw / ${writes} write / ${beats} beat`);
}

console.log('\nresponses are a fact about people, not a lottery');
{
  const s = K.state.newState();
  const d = K.core.today();
  // Twelve pieces shared to the circle, dated well in the past.
  for (let i = 0; i < 12; i++) {
    s.pieces.push({
      id: 'piece-' + i, day: d - 30 + i, craft: 'draw', prompt: 0,
      title: '', payload: { paper: 0, strokes: [] }, audience: 'circle'
    });
  }
  const runA = s.pieces.map(p => K.peers.responsesFor(s, p).map(r => r.from).join(','));
  const runB = s.pieces.map(p => K.peers.responsesFor(s, p).map(r => r.from).join(','));
  eq('the same piece always gets the same responses', runA, runB);

  const nour = s.pieces.filter(p => K.peers.responsesFor(s, p).some(r => r.from === 'nour')).length;
  const basil = s.pieces.filter(p => K.peers.responsesFor(s, p).some(r => r.from === 'basil')).length;
  ok('the peer who responds to everything, does', nour >= 8, nour + '/12');
  ok('the peer who rarely responds, rarely does', basil <= 3, basil + '/12');

  const sameDay = {
    id: 'today', day: d, craft: 'draw', prompt: 0, title: '',
    payload: { paper: 0, strokes: [] }, audience: 'circle'
  };
  s.pieces.push(sameDay);
  eq('nothing responds on the day you post', K.peers.responsesFor(s, sameDay).length, 0);

  const priv = {
    id: 'priv', day: d - 5, craft: 'draw', prompt: 0, title: '',
    payload: { paper: 0, strokes: [] }, audience: 'self'
  };
  s.pieces.push(priv);
  eq('work kept to yourself is never seen', K.peers.responsesFor(s, priv).length, 0);
}

console.log('\nthe charter is asymmetric');
{
  const s = K.state.newState();
  s.charter.minutes = 30;
  const tight = K.charter.propose(s, 'minutes', 15);
  ok('tightening applies now', tight.applied === true && s.charter.minutes === 15);

  const loose = K.charter.propose(s, 'minutes', 60);
  ok('loosening does not apply now', loose.applied === false && s.charter.minutes === 15);
  ok('loosening is queued for tomorrow', s.charter.pending.length === 1 &&
    s.charter.pending[0].from === K.core.today() + 1);

  const tighter = K.charter.propose(s, 'minutes', 10);
  ok('tightening cancels a queued loosening', s.charter.pending.length === 0 &&
    s.charter.minutes === 10);

  K.charter.propose(s, 'makeFirst', true);
  ok('make-first on is a tightening', s.charter.makeFirst === true);
  K.charter.propose(s, 'makeFirst', false);
  ok('make-first off waits', s.charter.makeFirst === true && s.charter.pending.length === 1);

  // Roll the clock forward and the pending change matures.
  K.core.setDayOffset(1);
  K.state.rollover(s);
  ok('tomorrow, the loosening lands', s.charter.makeFirst === false &&
    s.charter.pending.length === 0);
  K.core.setDayOffset(0);
}

console.log('\nnothing decays');
{
  const s = K.state.newState();
  s.pieces.push({ id: 'a', day: K.core.today(), craft: 'draw', prompt: 0, payload: {}, audience: 'self' });
  const before = s.pieces.length;
  K.core.setDayOffset(400);
  const away = K.state.rollover(s);
  ok('a long absence is counted', away > 300, String(away));
  eq('and costs nothing', s.pieces.length, before);
  ok('no field anywhere is a streak',
    JSON.stringify(s).toLowerCase().indexOf('streak') < 0);
  K.core.setDayOffset(0);
}

console.log('\nthe ladder only goes up');
{
  const s = K.state.newState();
  let last = -1;
  for (let i = 0; i < 100; i++) {
    const lvl = K.state.levelFor(i);
    const at = K.content.LEVELS.indexOf(lvl.cur);
    ok2(at >= last, 'level went backwards at ' + i);
    last = at;
  }
  let bad = 0;
  function ok2(cond, why) { if (!cond) { bad++; console.log('     ' + why); } }
  ok('more pieces never means a lower level', bad === 0);
  eq('nothing is a level at zero but the first', K.state.levelFor(0).cur.at, 0);
}

console.log('\nsave and load survive a round trip');
{
  const s = K.state.newState();
  s.name = 'Sam';
  s.pieces.push({ id: 'x', day: 1, craft: 'write', prompt: 3, payload: { text: 'hello' }, audience: 'circle' });
  K.core.save(s);
  const back = K.state.migrate(K.core.load());
  eq('the shelf comes back', back.pieces.length, 1);
  eq('the name comes back', back.name, 'Sam');
  const partial = K.state.migrate({ name: 'old save', pieces: [] });
  ok('an older shape gains the missing fields', partial.charter && partial.rules &&
    Array.isArray(partial.read));
}

console.log('\nthe content tables hold together');
{
  const C = K.content;
  ok('every prompt offers at least one craft', C.PROMPTS.every(p => p.c && p.c.length));
  ok('every prompt names real crafts',
    C.PROMPTS.every(p => p.c.every(c => C.CRAFTS[c])));
  ok('every praise line names real crafts',
    C.PRAISE.every(p => p.for.every(c => C.CRAFTS[c])));
  ok('every craft has four practice constraints',
    Object.keys(C.CRAFTS).every(c => C.PRACTICE[c] && C.PRACTICE[c].length === 4));
  ok('practice ids are unique', (() => {
    const seen = {};
    for (const c in C.PRACTICE) for (const p of C.PRACTICE[c]) {
      if (seen[p.id]) return false; seen[p.id] = 1;
    }
    return true;
  })());
  ok('every peer has a disposition', C.PEERS.every(p => !!K.peers.disposition(p.id)));
  ok('no peer posts every single day', C.PEERS.every(p => p.cadence < 1));
  ok('every Watchtower entry has a demo and an answer',
    C.PATTERNS.every(p => p.demo && p.instead && p.body && p.body2));
  ok('ten techniques', C.PATTERNS.length === 10, String(C.PATTERNS.length));

  /* The one word this app must never be able to show a user as a score. */
  const words = JSON.stringify(C).toLowerCase();
  ok('no praise line is a number or a rank',
    C.PRAISE.every(p => !/\d/.test(p.t)));
  ok('no level name contains a number',
    C.LEVELS.every(l => !/\d/.test(l.name)));
}

console.log('\nno counting anywhere in the interface source');
{
  /* Belt and braces: the app is allowed to count things for the receipt, but
   * no view may render a like, a follower, or a view count. Grep for the
   * shapes those take rather than trusting that nobody adds one later.
   *
   * The patterns are property accesses rather than bare words, because this
   * app says "no likes, no followers" out loud in several places and that
   * sentence is the opposite of the thing being looked for. A count that
   * actually reached the screen would arrive through a field. */
  const views = ['feed', 'card', 'shelf', 'make', 'ui'];
  const PATTERNS = [
    /\blikeCount\b/, /\bviewCount\b/, /\bfollowerCount\b/,
    /\.\s*likes\b/, /\.\s*followers\b/, /\bupvotes?\b/, /\bkarma\b/,
    /likes\s*:/, /followers\s*:/
  ];
  const bad = [];
  for (const v of views) {
    const src = readFileSync(join(ROOT, 'js', v + '.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    for (const re of PATTERNS) if (re.test(src)) bad.push(v + '.js: ' + re);
  }
  ok('no view renders a like, a follower or a view count', bad.length === 0, bad.join(', '));
}

console.log('');
if (fails) { console.log(fails + ' check(s) failed\n'); process.exit(1); }
console.log('all checks passed\n');
