/* Coremind — construction influence. Chambers do not only pay a bonus;
 * they paint the rock. A cluster of cisterns makes a wet district. A
 * cluster of redoubts makes a bastion zone. Dominance, digging speed,
 * fauna pressure and matching income all read this field.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const AXES = ['shelter', 'water', 'food', 'heat', 'defense', 'research', 'breed', 'spine'];
  const AXIS_LABEL = {
    shelter: 'Shelter', water: 'Water', food: 'Forage', heat: 'Heat',
    defense: 'Defense', research: 'Research', breed: 'Breed', spine: 'Spine'
  };
  const AXIS_COLOR = {
    shelter: [198, 154, 99], water: [90, 170, 220], food: [110, 190, 110],
    heat: [224, 122, 74], defense: [212, 137, 106], research: [110, 192, 212],
    breed: [208, 122, 164], spine: [154, 124, 255]
  };
  const STANCE_AXIS = {
    SETTLE: 'shelter', FORTIFY: 'defense', HARVEST: 'food',
    BREED: 'breed', PUSH: 'spine', QUIET: null
  };

  const TYPE_AXES = {
    SHAFT: { spine: 1, defense: 0.35 },
    WARREN: { shelter: 1 },
    CISTERN: { water: 1 },
    GRANARY: { food: 0.85, shelter: 0.2 },
    DESCENT: { spine: 1 },
    NURSERY: { breed: 1, shelter: 0.25 },
    VAULT: { research: 1 },
    REDOUBT: { defense: 1 },
    FUNGARIUM: { food: 1 },
    GEOTHERMAL: { heat: 1 },
    VEINWORKS: { food: 1 },
    SANCTUM: { research: 0.7, shelter: 0.6 },
    WELL: { spine: 1 },
    GALLERY: { spine: 1 },
    SPOREWELL: { food: 1 },
    AQUEDUCT: { water: 1 },
    CLEFT: { spine: 1 },
    RESONATOR: { research: 0.85, spine: 0.2 },
    RELIQUARY: { research: 1 },
    CHASM: { spine: 1 },
    BASTION: { defense: 1 },
    MANTLE: { spine: 1 },
    HEARTH: { heat: 1 },
    SEAM: { food: 1 },
    ABYSS: { spine: 1 },
    CITADEL: { defense: 1, shelter: 0.25 },
    CRYPT: { research: 0.7, shelter: 0.55 },
    GATE: { spine: 1, defense: 0.45 },
    MUSTER: { breed: 0.85, defense: 0.3 },
    KEEP: { defense: 1 },
    NEXUS: { spine: 1 }
  };

  function weightOf(site) {
    let w = 1 + 0.35 * (site.tier || 0);
    if (site.entrenched) w *= 1.2;
    if (site.priority) w *= 1.1;
    return w;
  }

  function stampRadius(site) {
    const r = (CM.structures && CM.structures.radiusOf)
      ? CM.structures.radiusOf(site)
      : ((CM.structures.TYPES[site.type] || {}).radius || 6);
    return r * 2.15;
  }

  function emptyAxes() {
    const axes = {};
    for (let i = 0; i < AXES.length; i++) axes[AXES[i]] = 0;
    return axes;
  }

  function primaryOf(stamp) {
    let best = null, v = 0;
    for (const a in stamp) if (stamp[a] > v) { v = stamp[a]; best = a; }
    return best;
  }

  function at(game, x, y, depth, colonyId) {
    const axes = emptyAxes();
    const ownerScores = {};
    const list = CM.structures.all(game);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.done || s.controlled === false || s.depth !== depth) continue;
      const stamp = TYPE_AXES[s.type];
      if (!stamp) continue;
      const R = stampRadius(s);
      const d = K.dist(s.x, s.y, x, y);
      if (d > R) continue;
      const w = weightOf(s) * (1 - d / R);
      ownerScores[s.colonyId] = (ownerScores[s.colonyId] || 0) + w;
      if (colonyId && s.colonyId !== colonyId) continue;
      for (const a in stamp) axes[a] += stamp[a] * w;
    }
    let bestA = null, bestV = 0, second = 0;
    for (let i = 0; i < AXES.length; i++) {
      const a = AXES[i], v = axes[a];
      if (v > bestV) { second = bestV; bestV = v; bestA = a; }
      else if (v > second) second = v;
    }
    const district = (bestV >= 2.0 && bestV > second * 1.35) ? bestA : null;
    let ownerId = null, ownBest = 0;
    for (const id in ownerScores) {
      if (ownerScores[id] > ownBest) { ownBest = ownerScores[id]; ownerId = id; }
    }
    return { axes, district, strength: bestV, ownerId, ownerScores };
  }

  function layerScore(game, colonyId, depth) {
    let sum = 0;
    const list = CM.structures.all(game);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.done || s.controlled === false || s.colonyId !== colonyId || s.depth !== depth) continue;
      sum += weightOf(s) * 1.4;
    }
    return sum;
  }

  function layerDistrict(game, colonyId, depth) {
    const totals = emptyAxes();
    let n = 0;
    const list = CM.structures.all(game);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s.done || s.controlled === false || s.colonyId !== colonyId || s.depth !== depth) continue;
      const r = at(game, s.x, s.y, depth, colonyId);
      for (let a = 0; a < AXES.length; a++) totals[AXES[a]] += r.axes[AXES[a]];
      n++;
    }
    if (!n) return null;
    let bestA = null, bestV = 0, second = 0;
    for (let i = 0; i < AXES.length; i++) {
      const a = AXES[i], v = totals[a];
      if (v > bestV) { second = bestV; bestV = v; bestA = a; }
      else if (v > second) second = v;
    }
    if (bestV >= 2.0 && bestV > second * 1.35) return bestA;
    return null;
  }

  function digMul(game, site) {
    if (!site) return 1;
    const r = at(game, site.x, site.y, site.depth, site.colonyId);
    return 1 + Math.min(0.45, (r.axes.spine + r.axes.shelter) * 0.06);
  }

  function faunaMul(game, x, y, depth) {
    const r = at(game, x, y, depth);
    return Math.max(0.35, 1 - r.axes.defense * 0.12);
  }

  function incomeMul(game, site) {
    if (!site) return 1;
    const district = layerDistrict(game, site.colonyId, site.depth);
    if (!district) return 1;
    const stamp = TYPE_AXES[site.type];
    if (!stamp || !stamp[district]) return 1;
    return 1.15;
  }

  function axisOfType(typeKey) {
    return primaryOf(TYPE_AXES[typeKey] || {});
  }

  CM.influence = {
    AXES, AXIS_LABEL, AXIS_COLOR, STANCE_AXIS, TYPE_AXES,
    weightOf, stampRadius, at, layerScore, layerDistrict,
    digMul, faunaMul, incomeMul, axisOfType, primaryOf
  };
})(window.CM = window.CM || {});
