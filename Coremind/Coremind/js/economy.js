/* Coremind — interaction economy. Biomass is meat. These coins are
 * what the mind actually trades: attention, favor, gossip, scars.
 * Orders still fire when you are broke — the net just feels thin.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  function ensure(game) {
    if (!game.economy) {
      game.economy = { attention: 2, favor: 0, gossip: 0, scars: 0, gifts: 0, spent: 0 };
    }
    return game.economy;
  }

  function add(game, coin, n) {
    const e = ensure(game);
    if (e[coin] == null) e[coin] = 0;
    e[coin] = Math.max(0, e[coin] + n);
    return e[coin];
  }

  function spendAttention(game, cost) {
    const e = ensure(game);
    const c = cost || 0.35;
    const had = e.attention;
    e.attention = Math.max(0, e.attention - c);
    e.spent = (e.spent || 0) + Math.min(had, c);
    return had >= c;
  }

  function observeMul(game) {
    const e = game.economy;
    if (!e) return 1;
    return 1 + Math.min(0.25, (e.gossip || 0) * 0.02);
  }

  function thinMul(game) {
    const e = game.economy;
    if (!e) return 1;
    if (e.attention >= 0.4) return 1;
    return 0.82 + e.attention * 0.45;
  }

  function tick(game, dt) {
    const e = ensure(game);
    const thinking = (game.thought || 0) > 0.4;
    if (thinking) e.attention = Math.min(12, e.attention + 0.15 * dt);
    e.scars = Math.max(0, e.scars - 0.04 * dt);
  }

  function onOrder(game) {
    spendAttention(game, 0.35);
    if (CM.guide) CM.guide.note(game, 'order');
  }

  function onCreate(game) {
    spendAttention(game, 0.8);
    if (CM.sentiment) CM.sentiment.learn(game, 'created');
  }

  function onExtract(game, sample) {
    add(game, 'gossip', 0.6);
    if (CM.reputation && sample) CM.reputation.onExtract(game, sample.speciesId);
    if (CM.guide) CM.guide.note(game, 'extract');
  }

  function onSight(game, speciesId, watcher) {
    add(game, 'gossip', 0.2);
    if (CM.reputation) CM.reputation.onSight(game, watcher || { ownerId: 'player' }, speciesId);
    if (CM.guide) CM.guide.note(game, 'sight');
  }

  function onDeath(game, org, cause) {
    if (org && org.ownerId === 'player') add(game, 'scars', 1);
    if (org && org.ownerId === 'wild' && cause === 'combat') {
      if (CM.sentiment) CM.sentiment.learn(game, 'kill');
    }
  }

  function offerTribute(game, colony) {
    if (!CM.reputation || !colony || colony.isPlayer) {
      return { ok: false, reason: 'No one to offer to.' };
    }
    const e = ensure(game);
    if (e.favor < 1 && e.gifts > 0 && e.attention < 0.5) {
      /* first gift is free of favor; later ones want a coin or attention */
    }
    const res = CM.reputation.tribute(game, 'player', colony.id, 8);
    if (!res.ok) return res;
    if (e.favor >= 1) e.favor -= 1;
    e.gifts = (e.gifts || 0) + 1;
    add(game, 'favor', 0.35);
    if (CM.sentiment) CM.sentiment.learn(game, 'gift');
    if (CM.guide) CM.guide.note(game, 'gift');
    if (CM.life) CM.life.grantActors(game, 'gift', 5, colony.x, colony.y);
    return res;
  }

  function serialize(game) {
    const e = ensure(game);
    return {
      attention: e.attention, favor: e.favor, gossip: e.gossip,
      scars: e.scars, gifts: e.gifts || 0, spent: e.spent || 0
    };
  }

  function hydrate(game, data) {
    game.economy = {
      attention: data && data.attention != null ? data.attention : 2,
      favor: data && data.favor || 0,
      gossip: data && data.gossip || 0,
      scars: data && data.scars || 0,
      gifts: data && data.gifts || 0,
      spent: data && data.spent || 0
    };
  }

  CM.economy = {
    ensure, add, spendAttention, observeMul, thinMul, tick,
    onOrder, onCreate, onExtract, onSight, onDeath, offerTribute,
    serialize, hydrate
  };
})(window.CM = window.CM || {});
