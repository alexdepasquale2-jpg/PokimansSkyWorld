/* Coremind — reusable utility AI. One function decides what any organism
 * wants to do next from its needs, senses and the player's directive; it
 * never knows about a specific species. Pure logic, no canvas/DOM — the
 * simulation gathers `ctx` (what's nearby) and executes the chosen state.
 */
(function (CM) {
  'use strict';
  const S = CM.organism.AI_STATE;

  /* How much a spotted threat scares this organism. Armor and defense make
   * standing ground more viable; a defense-heavy build flees later. */
  function fearMultiplier(org) {
    const stoutness = (org.stats.defense + org.stats.armor) / 120;
    return Math.max(0.35, 1.1 - stoutness);
  }

  function applyDirectiveBias(directive, u) {
    switch (directive) {
      case 'EXPLORE': u.EXPLORE *= 2.2; u.INVESTIGATE *= 1.4; break;
      case 'GATHER': u.SEEK_FOOD *= 2.4; u.RETURN_TO_CORE *= 1.3; break;
      case 'HUNT': u.HUNT *= 2.6; u.ATTACK *= 1.5; break;
      case 'DEFEND': u.FLEE *= 0.15; u.EXPLORE *= 0.3; break; // guard() below drives the actual behaviour
      case 'REPRODUCE': u.REPRODUCE *= 3; break;
      case 'INVESTIGATE': u.INVESTIGATE *= 3; break;
      case 'RETURN': u.RETURN_TO_CORE = 999; break;
      default: break;
    }
  }

  /* ctx fields (all optional — absence just means "nothing sensed"):
   *   canEatPlants, canHunt: bool
   *   nearestThreat:  {dist, entity}
   *   nearestFood:    {dist, x, y}
   *   nearestWater:   {x, y}
   *   nearestPrey:    {dist, entity}
   *   nearestCuriosity: {dist, x, y, kind, ref}   // unknown species sighting or sample
   *   mateAvailable:  bool
   *   coreDist: number
   *   defendRadius: number  (only meaningful with directive DEFEND)
   */
  function decide(org, ctx) {
    if (org.health <= 0) return { state: S.IDLE, target: null };

    const hungerFrac = CM.core.clamp01(org.hunger / 100);
    const thirstFrac = CM.core.clamp01(org.thirst / 100);
    const energyFrac = CM.core.clamp01(org.energy / org.stats.energyMax);
    const healthFrac = CM.core.clamp01(org.health / org.stats.health);
    const critical = hungerFrac > 0.92 || thirstFrac > 0.92 || healthFrac < 0.22;

    const u = { IDLE: 0.05, EXPLORE: 0.22, REST: 0, SEEK_FOOD: 0, SEEK_WATER: 0, HUNT: 0, FLEE: 0, RETURN_TO_CORE: 0, REPRODUCE: 0, INVESTIGATE: 0, ATTACK: 0 };

    if (ctx.nearestThreat) {
      const closeness = 1 - CM.core.clamp01(ctx.nearestThreat.dist / Math.max(1, org.stats.sense_radius));
      u.FLEE = closeness * 1.35 * fearMultiplier(org);
    }

    if (ctx.canEatPlants) {
      u.SEEK_FOOD = hungerFrac * hungerFrac * (ctx.nearestFood ? 1 : 0.45);
    }
    // Thirst curves the same way hunger does, so an organism engineered with a
    // high water_requirement genuinely spends more of its life walking to water
    // instead of doing what the player asked of it.
    u.SEEK_WATER = thirstFrac * thirstFrac * (ctx.nearestWater ? 1.05 : 0.4);
    if (ctx.canHunt && ctx.nearestPrey) {
      u.HUNT = (0.35 + hungerFrac * 0.75);
    }

    u.REST = Math.max(0, (1 - energyFrac) * 0.75 + (1 - healthFrac) * 0.25 - (ctx.nearestThreat ? 0.6 : 0));
    u.RETURN_TO_CORE = org.carrying > 0 ? 0.85 + Math.min(0.4, org.carrying / 40) : 0;
    u.REPRODUCE = (energyFrac > 0.72 && healthFrac > 0.7 && (org.reproCooldown || 0) <= 0)
      ? org.stats.reproduction_rate * 1.8 : 0;
    u.INVESTIGATE = ctx.nearestCuriosity ? 0.4 : 0;

    // A fight in progress is not re-litigated every re-decision — without
    // this an ATTACK organism would be yanked back into HUNT (which
    // immediately re-enters ATTACK, but only *after* skipping this tick's
    // damage) every single time it re-decides, i.e. every tick for anything
    // near the camera.
    if (org.state === S.ATTACK && org.actionTarget && org.actionTarget.ref && org.actionTarget.ref.health > 0) {
      u.ATTACK = 2.2;
    }

    applyDirectiveBias(org.directive, u);

    // A guarding organism holds position near the Core and only leaves the
    // utility loop to fight something that gets close, or to flee if truly
    // overwhelmed (critical health always wins — see below).
    if (org.directive === 'DEFEND') {
      if (ctx.nearestThreat && ctx.defendRadius != null && ctx.nearestThreat.dist <= ctx.defendRadius) {
        u.HUNT = Math.max(u.HUNT, 1.6); // "hunt" the intruder, i.e. engage it
      } else {
        u.EXPLORE = 0.12; // stay close; movement code keeps DEFEND orbiting the Core
      }
    }

    // Critical needs are an imperative, not a suggestion — an organism must
    // never be argued out of eating or fleeing by a stale directive.
    if (critical) {
      if (healthFrac < 0.22 && ctx.nearestThreat) u.FLEE *= 2.2;
      if (hungerFrac > 0.92) u.SEEK_FOOD = Math.max(u.SEEK_FOOD, 1.5);
      if (thirstFrac > 0.92) u.SEEK_WATER = Math.max(u.SEEK_WATER, 1.55);
    }

    // Hysteresis: mildly prefer whatever we're already doing so utilities
    // that are nearly tied don't flap the organism between states every tick.
    if (u[org.state] != null) u[org.state] *= 1.12;

    let bestState = S.IDLE, bestScore = -Infinity;
    for (const st in u) {
      if (u[st] > bestScore) { bestScore = u[st]; bestState = st; }
    }

    return resolveTarget(org, bestState, ctx);
  }

  /* Turn the chosen state into something the simulation can act on. If the
   * ideal target isn't actually available (e.g. HUNT with no prey in range),
   * fall back to a search behaviour instead of an empty action. */
  function resolveTarget(org, state, ctx) {
    switch (state) {
      case S.FLEE:
        if (!ctx.nearestThreat) return { state: S.EXPLORE, target: null };
        return { state: S.FLEE, target: { type: 'flee_from', x: ctx.nearestThreat.entity.x, y: ctx.nearestThreat.entity.y } };
      case S.SEEK_FOOD:
        if (ctx.nearestFood) return { state: S.SEEK_FOOD, target: { type: 'food_cell', x: ctx.nearestFood.x, y: ctx.nearestFood.y } };
        return { state: S.EXPLORE, target: null };
      case S.SEEK_WATER:
        if (ctx.nearestWater) return { state: S.SEEK_WATER, target: { type: 'water_cell', x: ctx.nearestWater.x, y: ctx.nearestWater.y } };
        return { state: S.EXPLORE, target: null };
      case S.HUNT:
        if (org.directive === 'DEFEND' && ctx.nearestThreat) {
          return { state: S.HUNT, target: { type: 'organism', ref: ctx.nearestThreat.entity } };
        }
        if (ctx.nearestPrey) return { state: S.HUNT, target: { type: 'organism', ref: ctx.nearestPrey.entity } };
        return { state: S.EXPLORE, target: null };
      case S.ATTACK:
        // Only ever chosen by the hysteresis guard in decide() when already
        // mid-fight; keep the exact same target rather than re-resolving it.
        if (org.actionTarget && org.actionTarget.ref && org.actionTarget.ref.health > 0) {
          return { state: S.ATTACK, target: org.actionTarget };
        }
        return { state: S.EXPLORE, target: null };
      case S.RETURN_TO_CORE:
        return { state: S.RETURN_TO_CORE, target: { type: 'core' } };
      case S.REPRODUCE:
        return { state: S.REPRODUCE, target: null };
      case S.INVESTIGATE:
        if (org.directive === 'INVESTIGATE' && org.directiveTarget) {
          return { state: S.INVESTIGATE, target: { type: 'point', x: org.directiveTarget.x, y: org.directiveTarget.y, ref: org.directiveTarget.ref || null } };
        }
        if (ctx.nearestCuriosity) return { state: S.INVESTIGATE, target: { type: 'point', x: ctx.nearestCuriosity.x, y: ctx.nearestCuriosity.y, ref: ctx.nearestCuriosity.ref || null } };
        return { state: S.EXPLORE, target: null };
      case S.REST:
        return { state: S.REST, target: null };
      default:
        return { state: S.EXPLORE, target: null };
    }
  }

  CM.ai = { decide, fearMultiplier };
})(window.CM = window.CM || {});
