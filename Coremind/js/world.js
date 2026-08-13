/* Coremind — procedural world: a 256x256 cell ecosystem grid, plus a uniform
 * spatial grid used to query organisms by position cheaply.
 *
 * The terrain is regenerated from the seed on every load (world.js never
 * touches localStorage); only the *deltas* worth keeping — food levels drift
 * back to their natural carrying capacity fast enough that they are not
 * saved at all; see save.js for what actually persists.
 */
(function (CM) {
  'use strict';
  const K = CM.core;

  const SIZE = 256; // cells per side
  const BIOME = { WATER: 0, GRASS: 1, SOIL: 2, ROCK: 3 };
  const BIOME_NAMES = ['Water', 'Grass', 'Soil', 'Rock'];

  function idx(x, y) { return y * SIZE + x; }
  function inBounds(x, y) { return x >= 0 && y >= 0 && x < SIZE && y < SIZE; }

  /* --- generation ---------------------------------------------------------
   * Elevation carves water / land / rock. Moisture (itself elevation-biased,
   * so basins are wetter) decides grass vs bare soil. Temperature follows a
   * latitude band across the y axis plus noise, so the world has a cold edge,
   * a warm middle, and local variation neither alone would produce. */
  function generate(seed) {
    seed = (seed >>> 0) || 1;
    const n = SIZE * SIZE;
    const biome = new Uint8Array(n);
    const temp = new Float32Array(n);      // degrees C
    const moisture = new Float32Array(n);
    const food = new Float32Array(n);      // current plant biomass per cell
    const foodCap = new Float32Array(n);   // carrying capacity per cell

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = idx(x, y);
        const e = K.fbm(seed, x * 0.02, y * 0.02, 5) * 0.75 + K.fbm(seed + 1, x * 0.06, y * 0.06, 3) * 0.25;
        let m = K.fbm(seed + 2000, x * 0.035, y * 0.035, 4) * 0.7 + (1 - e) * 0.3;
        m = K.clamp01(m);

        // latitude-ish temperature band centred on the vertical middle,
        // warmest at the equator (mid-row), coldest at the poles (edges).
        const lat = Math.abs(y / SIZE - 0.5) * 2; // 0 at equator, 1 at pole
        let t = K.lerp(34, -12, lat) + (K.fbm(seed + 4000, x * 0.05, y * 0.05, 3) - 0.5) * 14;
        t -= K.clamp01(e - 0.6) * 18; // higher ground runs cooler

        let b;
        if (e < 0.30) b = BIOME.WATER;
        else if (e > 0.80 || (e > 0.62 && m < 0.22)) b = BIOME.ROCK;
        else if (m > 0.38 && t > -4) b = BIOME.GRASS;
        else b = BIOME.SOIL;

        biome[i] = b;
        temp[i] = t;
        moisture[i] = m;
        if (b === BIOME.GRASS) {
          const cap = K.clamp01(m * 0.7 + K.invLerp(-4, 30, t) * 0.3) * 90 + 10;
          foodCap[i] = cap;
          // Coherent noise, not a raw per-cell hash — a hash decorrelates
          // completely between neighbours, which reads as TV static once
          // painted into the terrain cache. Real grass patchiness (and the
          // grazing pressure that later shows through it) should look like
          // patches, not salt-and-pepper noise.
          food[i] = cap * (0.45 + 0.55 * K.noise2(seed + 5000, x * 0.12, y * 0.12));
        } else {
          foodCap[i] = 0;
          food[i] = 0;
        }
      }
    }

    const world = {
      seed, size: SIZE, biome, temp, moisture, food, foodCap,
      foodCursor: 0,
      grid: makeSpatialGrid(SIZE, 6)
    };
    world.coreSpawn = findCoreSpawn(world, K.rngFrom(seed ^ 0x9e3779b9));
    return world;
  }

  /* A grassy, temperate, non-coastal patch near the middle of the map — a
   * reasonable home base regardless of seed. */
  function findCoreSpawn(world, rng) {
    let best = null, bestScore = -Infinity;
    for (let tries = 0; tries < 400; tries++) {
      const x = K.rndInt(rng, SIZE * 0.25, SIZE * 0.75);
      const y = K.rndInt(rng, SIZE * 0.25, SIZE * 0.75);
      const i = idx(x, y);
      if (world.biome[i] !== BIOME.GRASS) continue;
      const t = world.temp[i];
      let score = -Math.abs(t - 18) - K.dist(x, y, SIZE / 2, SIZE / 2) * 0.02;
      // reward being near water (drinkable, but not flooded)
      let nearWater = false;
      for (let dy = -3; dy <= 3 && !nearWater; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, ny = y + dy;
          if (inBounds(nx, ny) && world.biome[idx(nx, ny)] === BIOME.WATER) { nearWater = true; break; }
        }
      }
      if (nearWater) score += 5;
      if (score > bestScore) { bestScore = score; best = { x: x + 0.5, y: y + 0.5 }; }
    }
    return best || { x: SIZE / 2, y: SIZE / 2 };
  }

  function biomeAt(world, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (!inBounds(xi, yi)) return BIOME.ROCK;
    return world.biome[idx(xi, yi)];
  }
  function tempAt(world, x, y) {
    const xi = K.clamp(Math.floor(x), 0, SIZE - 1), yi = K.clamp(Math.floor(y), 0, SIZE - 1);
    return world.temp[idx(xi, yi)];
  }
  function moistureAt(world, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (!inBounds(xi, yi)) return 0;
    return world.moisture[idx(xi, yi)];
  }
  function foodAt(world, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (!inBounds(xi, yi)) return 0;
    return world.food[idx(xi, yi)];
  }
  function consumeFood(world, x, y, amount) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (!inBounds(xi, yi)) return 0;
    const i = idx(xi, yi);
    const taken = Math.min(world.food[i], amount);
    world.food[i] -= taken;
    return taken;
  }

  /* Regrowth runs on a rolling cursor instead of a full 65k-cell sweep every
   * call, so cost per call is bounded regardless of world size. */
  function tickFood(world, batchSize) {
    const n = world.food.length;
    let c = world.foodCursor;
    for (let k = 0; k < batchSize; k++) {
      const i = c;
      if (world.foodCap[i] > 0) {
        const cap = world.foodCap[i];
        world.food[i] += (cap - world.food[i]) * 0.02;
        if (world.food[i] < 0.01) world.food[i] = 0;
      }
      c = (c + 1) % n;
    }
    world.foodCursor = c;
  }

  function findNearestFood(world, x, y, radius, minAmount) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let best = null, bestD = Infinity;
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = xi + dx, ny = yi + dy;
        if (!inBounds(nx, ny)) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > radius * radius) continue;
        const i = idx(nx, ny);
        if (world.food[i] >= minAmount) {
          if (d2 < bestD) { bestD = d2; best = { x: nx + 0.5, y: ny + 0.5, amount: world.food[i] }; }
        }
      }
    }
    return best;
  }

  /* Nearest drinkable cell. Organisms drink from the shore rather than
   * swimming, so this returns the water cell itself and the caller treats
   * "adjacent" as close enough (see DRINK_DIST in simulation.js). */
  function findNearestWater(world, x, y, radius) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let best = null, bestD = Infinity;
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = xi + dx, ny = yi + dy;
        if (!inBounds(nx, ny)) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > radius * radius || d2 >= bestD) continue;
        if (world.biome[idx(nx, ny)] === BIOME.WATER) {
          bestD = d2; best = { x: nx + 0.5, y: ny + 0.5 };
        }
      }
    }
    return best;
  }

  /* Is this position at or beside open water — i.e. can something standing
   * here drink without entering the lake? */
  function atWaterEdge(world, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = xi + dx, ny = yi + dy;
        if (inBounds(nx, ny) && world.biome[idx(nx, ny)] === BIOME.WATER) return true;
      }
    }
    return false;
  }

  // --- uniform spatial grid for organisms / samples -------------------------
  function makeSpatialGrid(worldSize, cellSize) {
    const cols = Math.ceil(worldSize / cellSize);
    const buckets = new Map();
    const key = (cx, cy) => cx * 100000 + cy;

    function bucketOf(x, y) {
      return [Math.floor(x / cellSize), Math.floor(y / cellSize)];
    }
    function insert(entity) {
      const [cx, cy] = bucketOf(entity.x, entity.y);
      entity.__gx = cx; entity.__gy = cy;
      const k = key(cx, cy);
      let b = buckets.get(k);
      if (!b) { b = new Set(); buckets.set(k, b); }
      b.add(entity);
    }
    function remove(entity) {
      const k = key(entity.__gx, entity.__gy);
      const b = buckets.get(k);
      if (b) { b.delete(entity); if (b.size === 0) buckets.delete(k); }
    }
    function update(entity) {
      const [cx, cy] = bucketOf(entity.x, entity.y);
      if (cx === entity.__gx && cy === entity.__gy) return;
      remove(entity);
      insert(entity);
    }
    function queryRadius(x, y, radius, out) {
      out = out || [];
      const r = Math.ceil(radius / cellSize);
      const [cx, cy] = bucketOf(x, y);
      const r2 = radius * radius;
      for (let gy = cy - r; gy <= cy + r; gy++) {
        for (let gx = cx - r; gx <= cx + r; gx++) {
          const b = buckets.get(key(gx, gy));
          if (!b) continue;
          for (const e of b) {
            if (K.dist2(e.x, e.y, x, y) <= r2) out.push(e);
          }
        }
      }
      return out;
    }
    function queryBox(minX, minY, maxX, maxY, out) {
      out = out || [];
      const [cx0, cy0] = bucketOf(minX, minY);
      const [cx1, cy1] = bucketOf(maxX, maxY);
      for (let gy = cy0; gy <= cy1; gy++) {
        for (let gx = cx0; gx <= cx1; gx++) {
          const b = buckets.get(key(gx, gy));
          if (!b) continue;
          for (const e of b) out.push(e);
        }
      }
      return out;
    }
    function clear() { buckets.clear(); }
    return { cellSize, insert, remove, update, queryRadius, queryBox, clear };
  }

  CM.world = {
    SIZE, BIOME, BIOME_NAMES, idx, inBounds,
    generate, biomeAt, tempAt, moistureAt, foodAt, consumeFood, tickFood, findNearestFood,
    findNearestWater, atWaterEdge, makeSpatialGrid
  };
})(window.CM = window.CM || {});
