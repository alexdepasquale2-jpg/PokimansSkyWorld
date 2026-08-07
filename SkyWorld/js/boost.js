/* Skyward Reach — one place that answers "how much of X do I get".
 *
 * Nine systems now multiply the same handful of numbers. Rather than scatter
 * `if (neuron) ... if (relic) ...` through the simulation, every source
 * registers here and the rest of the game asks a single question.
 *
 * Keys are multipliers around 1.0 unless noted.
 */
(function (SW) {
  'use strict';
  const C = SW.content, C2 = SW.content2;
  const { clamp } = SW.core;

  /* Relic effect id -> boost key. */
  const RELIC_KEY = {
    growth: 'growth', thirst: 'thirstDown', bond: 'bond', yield: 'yield',
    prayer: 'prayer', insight: 'insight', work: 'work', herit: 'herit',
    coin: 'coin', renown: 'renown', unrest: 'unrestDown', focus: 'focus',
    life: 'life', all: 'all'
  };

  const seasonOf = g => C2.SEASONS[Math.floor(((g.day - 1) % (C2.SEASON_LEN * C2.SEASONS.length)) / C2.SEASON_LEN)];
  const weatherOf = g => C2.WEATHER[(g.weather && g.weather.today) || 'clear'];

  function titleOf(g) {
    return C2.TITLES.find(t => t.id === (g.title || 'none')) || C2.TITLES[0];
  }

  function buildingTier(g, id) { return (g.buildings && g.buildings[id]) | 0; }

  function roleCount(g, roleId) {
    if (!g.people) return 0;
    let n = 0;
    for (const p of g.people) if (p.role === roleId) n += (p.trait === 'quick' ? 1.5 : 1);
    return n;
  }

  /* The big one. Every multiplier in the game resolves through here. */
  function get(g, key) {
    let m = 1;
    const season = seasonOf(g), weather = weatherOf(g);

    // --- island features (permanent, from examining the ground)
    if (key === 'thirstDown' && g.effects.thirst) m *= 1.25;
    if (key === 'growth' && g.effects.growth) m *= 1.15;
    if (key === 'foodDown' && g.effects.granary) m *= 1.18;
    if (key === 'prayer' && g.effects.prayer) m *= 1.25;

    // --- neurons
    const n = g.neurons || {};
    if (key === 'yield' && n.husbandry) m *= 1.25;
    if (key === 'focus' && n.stamina) m *= 1.4;
    if (key === 'learn' && n.patience) m *= 1.3;
    if (key === 'forgetDown' && n.memory) m *= 2;
    if (key === 'herit' && n.lineage) m *= 1.5;
    if (key === 'life' && n.lineage) m *= 1.15;
    if (key === 'renown' && n.devotion) m *= 1.3;
    if (key === 'craft' && n.craftsman) m *= 1.6;
    if (key === 'insight' && n.sight) m *= 1.4;
    if (key === 'buildCostDown' && n.frontier) m *= 1.49;

    // --- the line's evolutions
    const evoKey = { yield: 'yield', insight: 'insight', renown: 'renown', work: 'speed', life: 'life' }[key];
    if (evoKey) m *= 1 + SW.lineage.bonus(g, evoKey);

    // --- season and weather
    if (key === 'growth') m *= season.growth * weather.growth;
    if (key === 'thirstUp') m *= season.thirst * weather.thirst;
    if (key === 'coin') m *= season.feed;
    if (key === 'faith') m *= season.faith * (weather.faith || 1);
    if (key === 'awe') m *= weather.awe || 1;
    if (key === 'prayer') m *= weather.prayer || 1;
    if (key === 'insight') m *= weather.insight || 1;
    if (key === 'listen') m *= weather.listen || 1;
    if (key === 'rotUp') m *= weather.rot || 1;
    if (key === 'vigor') m *= weather.vigor || 1;

    // --- buildings
    if (key === 'thirstDown') m *= 1 + buildingTier(g, 'well') * 0.12;
    if (key === 'foodDown') m *= 1 + buildingTier(g, 'granary') * 0.10;
    if (key === 'craft') m *= 1 + buildingTier(g, 'workshop') * 0.18;
    if (key === 'insight') m *= 1 + buildingTier(g, 'watchtower') * 0.10;
    if (key === 'careUp') m *= 1 + buildingTier(g, 'infirmary') * 0.34;
    if (key === 'trade') m *= 1 + buildingTier(g, 'dock') * 0.22;

    // --- villager roles
    if (key === 'buildCostDown') m *= 1 + roleCount(g, 'mason') * 0.05;
    if (key === 'careUp') m *= 1 + roleCount(g, 'herbalist') * 0.20;
    if (key === 'prayer') m *= 1 + roleCount(g, 'acolyte') * 0.08;
    if (key === 'faith') m *= 1 + roleCount(g, 'acolyte') * 0.05;
    if (key === 'coin') m *= 1 + roleCount(g, 'trader') * 0.06;
    if (key === 'trade') m *= 1 + roleCount(g, 'trader') * 0.10;

    // --- equipped relics
    if (g.equipped) {
      for (const id of g.equipped) {
        const r = C2.RELICS[id];
        if (!r) continue;
        if (r.effect === 'all') m *= 1 + r.power;
        else if (RELIC_KEY[r.effect] === key) m *= 1 + r.power;
      }
    }

    // --- title
    const t = titleOf(g);
    if (t.bonus) {
      if (t.bonus.all) m *= 1 + t.bonus.all;
      if (t.bonus[key] !== undefined) m *= 1 + t.bonus[key];
      if (key === 'buildCostDown' && t.bonus.buildCost) m *= 1 - t.bonus.buildCost;
    }

    // --- prestige boons, which outlive everything
    const b = (g.prestige && g.prestige.boons) || {};
    if (key === 'insight' && b.wideeye) m *= 1.33;
    if (key === 'yield' && b.greenthumb) m *= 1.25;
    if (key === 'renown' && b.standing) m *= 1.4;

    return m;
  }

  /* Thirst and food are "lower is better", so they get their own reducers. */
  const thirst = g => get(g, 'thirstUp') / get(g, 'thirstDown');
  const foodUse = g => 1 / get(g, 'foodDown');
  const forget = g => 1 / get(g, 'forgetDown');
  const buildCost = g => 1 / get(g, 'buildCostDown');
  const unrest = g => 1 / get(g, 'unrestDown');

  SW.boost = { get, seasonOf, weatherOf, titleOf, buildingTier, roleCount, thirst, foodUse, forget, buildCost, unrest };
})(window.SW = window.SW || {});
