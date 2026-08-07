/* Skyward Reach — plots, crops and the market.
 * Shared by the player's hand and by the creature, so both go through the
 * same rules: whoever swings the hoe, the soil behaves identically.
 */
(function (SW) {
  'use strict';
  const C = SW.content;
  const { clamp, chance } = SW.core;

  // --- queries -----------------------------------------------------------
  const plotsWhere = (g, fn) => g.plots.filter(fn);
  const rawPlots     = g => plotsWhere(g, p => p.state === 'raw');
  const tilledPlots  = g => plotsWhere(g, p => p.state === 'tilled');
  const growingPlots = g => plotsWhere(g, p => p.state === 'growing');
  const ripePlots    = g => plotsWhere(g, p => p.state === 'ripe');

  function thirstiest(g) {
    const cand = plotsWhere(g, p => (p.state === 'growing' || p.state === 'ripe') && p.water < 80);
    if (!cand.length) return null;
    return cand.reduce((a, b) => (a.water <= b.water ? a : b));
  }

  function bestSeed(g) {
    // The creature sows the most valuable seed it has enough of.
    let best = null;
    for (const c of C.CROP_LIST) {
      if ((g.seeds[c.id] | 0) > 0 && (!best || c.price > best.price)) best = c;
    }
    return best;
  }

  function seedCount(g) {
    let n = 0;
    for (const k in g.seeds) n += g.seeds[k] | 0;
    return n;
  }

  function stockCount(g) {
    let n = 0;
    for (const k in g.stock) n += g.stock[k] | 0;
    return n;
  }

  function bestStock(g) {
    let best = null;
    for (const c of C.CROP_LIST) {
      if ((g.stock[c.id] | 0) > 0 && (!best || c.price > best.price)) best = c;
    }
    return best;
  }

  // --- mutations ---------------------------------------------------------
  function till(g, plot) {
    if (!plot || plot.state !== 'raw') return false;
    plot.state = 'tilled';
    plot.rot = 0;
    return true;
  }

  function sow(g, plot, cropId) {
    if (!plot || plot.state !== 'tilled') return false;
    if ((g.seeds[cropId] | 0) <= 0) return false;
    g.seeds[cropId]--;
    plot.state = 'growing';
    plot.crop = cropId;
    plot.growth = 0;
    plot.water = Math.max(plot.water, 45);
    plot.rot = 0;
    return true;
  }

  function water(g, plot) {
    if (!plot || (plot.state !== 'growing' && plot.state !== 'ripe')) return false;
    if (plot.water >= 99) return false;
    plot.water = 100;
    plot.rot = Math.max(0, plot.rot - 25);
    return true;
  }

  /* Returns the crop definition harvested, or null. `bonus` scales the yield —
   * a strong creature brings in more than a careless one. */
  function harvest(g, plot, bonus) {
    if (!plot || plot.state !== 'ripe') return null;
    const crop = C.CROPS[plot.crop];
    const spoil = plot.rot > 55 ? 0.5 : 1;
    const amount = Math.max(1, Math.round(crop.yield * (bonus || 1) * spoil));
    g.stock[crop.id] = (g.stock[crop.id] | 0) + amount;
    g.stats.harvests += amount;
    plot.state = 'tilled';
    plot.crop = null;
    plot.growth = 0;
    plot.rot = 0;
    plot.water = Math.max(0, plot.water - 20);
    return { crop, amount };
  }

  /* Something ate the crop in the ground. Nobody gets paid. */
  function devour(g, plot) {
    if (!plot || (plot.state !== 'growing' && plot.state !== 'ripe')) return null;
    const crop = C.CROPS[plot.crop];
    const ripeness = plot.state === 'ripe' ? 1 : clamp(plot.growth / crop.growTicks, 0.2, 1);
    plot.state = 'tilled';
    plot.crop = null;
    plot.growth = 0;
    plot.rot = 0;
    return { crop, ripeness };
  }

  // --- per-tick simulation ----------------------------------------------
  function tickPlots(g, dt) {
    for (const p of g.plots) {
      if (p.state === 'growing' || p.state === 'ripe') {
        const crop = C.CROPS[p.crop];
        p.water = clamp(p.water - crop.thirst * dt, 0, 100);
        if (p.state === 'growing') {
          // Dry soil stalls growth rather than stopping it dead.
          const rate = p.water > 20 ? 1 : p.water > 0 ? 0.35 : 0.1;
          p.growth += rate * dt;
          if (p.growth >= crop.growTicks) { p.state = 'ripe'; p.growth = crop.growTicks; }
        } else {
          // Ripe crops left in the field start to go over.
          p.rot = clamp(p.rot + 0.55 * dt, 0, 100);
        }
        if (p.water <= 0) p.rot = clamp(p.rot + 0.8 * dt, 0, 100);
        if (p.rot >= 100 && chance(0.05 * dt)) {
          p.state = 'tilled'; p.crop = null; p.growth = 0; p.rot = 0;
          SW.ui && SW.ui.log(g, 'A crop withered to nothing in the dry.', 'bad');
        }
      }
    }
  }

  // --- market ------------------------------------------------------------
  function price(g, cropId) {
    return Math.max(1, Math.round(C.CROPS[cropId].price * (g.prices[cropId] || 1)));
  }

  function rollPrices(g) {
    for (const c of C.CROP_LIST) {
      const drift = (Math.random() - 0.5) * 0.34;
      g.prices[c.id] = clamp((g.prices[c.id] || 1) * 0.55 + (1 + drift) * 0.45, 0.62, 1.55);
    }
  }

  function sell(g, cropId, count) {
    const have = g.stock[cropId] | 0;
    const n = Math.min(have, count);
    if (n <= 0) return 0;
    const gain = price(g, cropId) * n;
    g.stock[cropId] -= n;
    g.res.coin += gain;
    g.stats.sold += n;
    g.stats.coinEarned += gain;
    return gain;
  }

  function buySeed(g, cropId, count) {
    const crop = C.CROPS[cropId];
    const unit = Math.max(1, Math.round(crop.seedCost * (0.75 + 0.35 * (g.prices[cropId] || 1))));
    const affordable = Math.min(count, Math.floor(g.res.coin / unit));
    if (affordable <= 0) return 0;
    g.res.coin -= unit * affordable;
    g.seeds[cropId] = (g.seeds[cropId] | 0) + affordable;
    return affordable;
  }

  function seedPrice(g, cropId) {
    const crop = C.CROPS[cropId];
    return Math.max(1, Math.round(crop.seedCost * (0.75 + 0.35 * (g.prices[cropId] || 1))));
  }

  /* Timber, bought rather than hauled. Coin needs a sink and wood is the
   * bottleneck on every structure you actually want. */
  const WOOD_PRICE = 12;
  function buyWood(g, count) {
    const affordable = Math.min(count, Math.floor(g.res.coin / WOOD_PRICE));
    if (affordable <= 0) return 0;
    g.res.coin -= WOOD_PRICE * affordable;
    g.res.wood += affordable;
    return affordable;
  }

  /* Crops into the granary. Villagers eat food, not raw duskberries. */
  function mill(g, cropId, count) {
    const have = g.stock[cropId] | 0;
    const n = Math.min(have, count);
    if (n <= 0) return 0;
    g.stock[cropId] -= n;
    const food = C.CROPS[cropId].feed * n;
    g.village.food += food;
    return food;
  }

  SW.farm = {
    rawPlots, tilledPlots, growingPlots, ripePlots, thirstiest, bestSeed, bestStock,
    seedCount, stockCount, till, sow, water, harvest, devour, tickPlots,
    price, seedPrice, rollPrices, sell, buySeed, mill, buyWood, WOOD_PRICE
  };
})(window.SW = window.SW || {});
