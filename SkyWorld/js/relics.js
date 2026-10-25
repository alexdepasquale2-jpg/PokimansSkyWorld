/* Skyward Reach — relics, the slots they go in, and the titles you earn. */
(function (SW) {
  'use strict';
  const C = SW.content, C2 = SW.content2;
  const { clamp, pick, chance, fmt } = SW.core;

  const fail = (g, m) => { SW.ui.log(g, m, 'warn'); return false; };

  /* Slots open up with the shrine — a bigger shrine is somewhere to keep
   * things, and somewhere for people to see that you have them. */
  function slots(g) {
    return 1 + Math.floor((g.shrine | 0) / 2) + ((g.ring | 0) >= 2 ? 1 : 0);
  }

  const owned = g => C2.RELIC_LIST.filter(r => g.relics[r.id]);
  const isEquipped = (g, id) => (g.equipped || []).includes(id);

  /* Relic tier is gated on standing, so the good ones cannot turn up on day 3. */
  function grant(g, forceRank) {
    const rank = forceRank || (1 + Math.min(3, Math.floor(SW.sim.rankOf(g).id / 1.4)));
    const pool = C2.RELIC_LIST.filter(r => r.rank <= rank && !g.relics[r.id]);
    if (!pool.length) {
      // Nothing new to find; convert into insight instead so it is never a dud.
      g.insight += 12;
      SW.ui.log(g, 'Another relic, and you already own its like. You study it apart instead. +12 insight.', 'good');
      return null;
    }
    const r = pick(pool);
    g.relics[r.id] = g.day;
    SW.ui.log(g, `${r.glyph} ${r.name}. ${r.blurb}`, 'great');
    g.fx.push({ at: 'banner', text: r.glyph + ' ' + r.name, life: 4.5, t: 0 });
    SW.discovery.firstTime(g, 'relic', 6, 'holding a relic');
    // First one goes on automatically, so its effect is never invisible.
    if ((g.equipped || []).length < slots(g)) equip(g, r.id);
    return r;
  }

  function equip(g, id) {
    if (!g.relics[id]) return false;
    if (!g.equipped) g.equipped = [];
    const i = g.equipped.indexOf(id);
    if (i >= 0) { g.equipped.splice(i, 1); return true; }
    if (g.equipped.length >= slots(g)) return fail(g, 'No free setting. Take one out first.');
    g.equipped.push(id);
    return true;
  }

  /* Two relics of the same rank fuse into one of the next rank up. The cost is
   * that you lose both, which makes it a real decision rather than a menu. */
  function canFuse(g, a, b) {
    if (!a || !b || a === b) return false;
    if (!g.relics[a] || !g.relics[b]) return false;
    if (C2.RELICS[a].rank !== C2.RELICS[b].rank) return false;
    return C2.RELIC_LIST.some(r => r.rank === C2.RELICS[a].rank + 1 && !g.relics[r.id]);
  }

  function fuse(g, a, b) {
    if (!canFuse(g, a, b)) return fail(g, 'Those two will not fuse.');
    const rank = C2.RELICS[a].rank + 1;
    delete g.relics[a]; delete g.relics[b];
    g.equipped = (g.equipped || []).filter(x => x !== a && x !== b);
    SW.ui.log(g, `${C2.RELICS[a].name} and ${C2.RELICS[b].name} go into the fire together.`, 'info');
    grant(g, rank);
    return true;
  }

  /* ------------------------------------------------------------- titles  */
  function available(g) {
    return C2.TITLES.filter(t => { try { return t.need(g); } catch (e) { return false; } });
  }

  function setTitle(g, id) {
    const t = C2.TITLES.find(x => x.id === id);
    if (!t) return false;
    try { if (!t.need(g)) return fail(g, 'You have not earned that.'); } catch (e) { return false; }
    g.title = id;
    SW.ui.log(g, id === 'none' ? 'You go by no title.' : `You are ${g.godName}, ${t.name}.`, 'good');
    return true;
  }

  function checkTitles(g) {
    const av = available(g);
    if (!g.titlesSeen) g.titlesSeen = {};
    for (const t of av) {
      if (t.id === 'none' || g.titlesSeen[t.id]) continue;
      g.titlesSeen[t.id] = g.day;
      SW.ui.log(g, `A title is yours to take if you want it: ${t.name}.`, 'good');
      SW.discovery.firstTime(g, 'title:' + t.id, 4, 'earning a title');
    }
  }

  SW.relics = { slots, owned, isEquipped, grant, equip, canFuse, fuse, available, setTitle, checkTitles };
})(window.SW = window.SW || {});
