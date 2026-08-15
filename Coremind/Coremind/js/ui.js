/* Coremind — DOM UI: HUD, tabs, directive bar, event feed, genome designer,
 * inspect overlay. Rendering (canvas) stays in render.js; this file only
 * touches the DOM layer on top of it.
 */
(function (CM) {
  'use strict';
  const K = CM.core;
  const T = CM.traits;
  const D = CM.discovery;
  const CORE = CM.coremind;

  const DIRECTIVE_META = {
    EXPLORE: { icon: 'EX', label: 'Explore' },
    GATHER: { icon: 'GA', label: 'Gather' },
    HUNT: { icon: 'HU', label: 'Hunt' },
    DEFEND: { icon: 'DF', label: 'Defend' },
    REPRODUCE: { icon: 'RE', label: 'Reproduce' },
    INVESTIGATE: { icon: 'IN', label: 'Investigate' },
    RETURN: { icon: 'RT', label: 'Return' },
    DIG: { icon: 'DG', label: 'Dig' },
    SHELTER: { icon: 'SH', label: 'Shelter' },
    EXPAND: { icon: 'XP', label: 'Expand' }
  };

  const STAT_ROWS = [
    ['health', 'Health'], ['energyMax', 'Energy'], ['speed', 'Speed'], ['size', 'Size'],
    ['vision', 'Vision'], ['sense_radius', 'Sense'], ['attack', 'Attack'], ['defense', 'Defense'],
    ['armor', 'Armor'], ['venom', 'Venom'], ['camouflage', 'Camo'], ['digging', 'Dig'],
    ['temperature_tolerance', 'Temp.Tol'], ['water_requirement', 'Water'],
    ['reproduction_rate', 'Repro'], ['metabolism', 'Metab.']
  ];
  const STAT_MAXES = { health: 140, energyMax: 100, speed: 60, size: 40, vision: 70, sense_radius: 45, attack: 70, defense: 70, armor: 45, venom: 45, camouflage: 45, digging: 55, temperature_tolerance: 55, water_requirement: 1.2, reproduction_rate: 1.2, metabolism: 40 };

  function el(id) { return document.getElementById(id); }

  /* --- sheets ---------------------------------------------------------------
   * One controller for every transient panel. Only one sheet is open at a
   * time, and opening any of them arms the catcher so a tap anywhere on the
   * world dismisses it. Sheets are deliberately not modal: the simulation
   * keeps running and stays visible above them, which is the point — the
   * previous full-screen overlays meant opening the designer blinded you to
   * whatever was happening to your colony. */
  const SHEETS = ['designer-overlay', 'inspect-overlay', 'build-overlay'];
  let openSheetId = null;

  function openSheet(game, id) {
    if (openSheetId && openSheetId !== id) closeSheet(game, openSheetId, true);
    const node = el(id);
    node.classList.remove('hidden', 'closing');
    node.style.transform = '';
    el('sheet-catcher').classList.remove('hidden');
    openSheetId = id;
  }

  function closeSheet(game, id, immediate) {
    id = id || openSheetId;
    if (!id) return;
    const node = el(id);
    if (openSheetId === id) {
      openSheetId = null;
      el('sheet-catcher').classList.add('hidden');
    }
    if (immediate) { node.classList.add('hidden'); node.classList.remove('closing'); }
    else {
      node.classList.add('closing');
      setTimeout(() => { node.classList.add('hidden'); node.classList.remove('closing'); node.style.transform = ''; }, 190);
    }
    if (id === 'designer-overlay') stopPreviewLoop(game);
  }

  function anySheetOpen() { return !!openSheetId; }

  /* Swipe the grip (or the sheet head) downward to dismiss — the gesture a
   * bottom sheet is expected to answer to on a phone. */
  function initSheetGestures(game) {
    el('sheet-catcher').addEventListener('pointerdown', () => closeSheet(game));
    for (const id of SHEETS) {
      const node = el(id);
      const grip = node.querySelector('.sheet-grip');
      const head = node.querySelector('.sheet-head');
      let startY = null, dy = 0;
      const onDown = evt => { startY = evt.clientY; dy = 0; node.style.transition = 'none'; };
      const onMove = evt => {
        if (startY == null) return;
        dy = Math.max(0, evt.clientY - startY);
        node.style.transform = `translateY(${dy}px)`;
      };
      const onUp = () => {
        if (startY == null) return;
        node.style.transition = '';
        node.style.transform = '';
        if (dy > 60) closeSheet(game, id);
        startY = null;
      };
      for (const handle of [grip, head]) {
        if (!handle) continue;
        handle.addEventListener('pointerdown', onDown);
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
      }
    }
  }
  function fmt1(n) { return (Math.round(n * 10) / 10).toString(); }

  function init(game, bus) {
    const ui = {
      dnaBadgeSeen: 0, unreadAnalyze: 0, previewRaf: null, previewAngle: 0,
      inspectTarget: null, canvas: el('world-canvas'),
      layerExpanded: false, dirMore: false
    };
    game.ui = ui;

    initTabs(game);
    initDirectiveBar(game, bus);
    initCamControls(game);
    initDesigner(game, bus);
    initInspect(game);
    initBuild(game, bus);
    initDepthControls(game);
    initOrderBar(game);
    initMinimap(game);
    initOutcome(game);
    initSheetGestures(game);

    el('btn-open-build').addEventListener('click', () => openBuild(game));
    initHeroHud(game);

    el('btn-speed').addEventListener('click', () => {
      game.speed = game.speed === 0 ? 1 : game.speed >= 3 ? 0 : (game.speed === 1 ? 2 : 3);
      paintSpeed(game);
    });

    bus.on('event', evt => onEvent(game, evt));

    render(game);
    return ui;
  }

  // -- tabs -----------------------------------------------------------------
  function initTabs(game) {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === 'dna') { openDesigner(game); return; }
        document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
        if (tab === 'analyze') {
          game.ui.unreadAnalyze = 0; renderFeed(game); updateBadges(game);
          if (CM.guide) CM.guide.note(game, 'analyze');
        }
        if (tab === 'world') {
          game.ui.sawWorld = true;
          renderWorldPanel(game);
        }
      });
    });
  }

  // -- directive bar ----------------------------------------------------------
  const PRIMARY_DIRECTIVES = { EXPLORE: 1, GATHER: 1, HUNT: 1, DIG: 1 };

  function initDirectiveBar(game, bus) {
    const bar = el('directive-bar');
    const build = el('btn-open-build');
    bar.querySelectorAll('.dirbtn').forEach(n => n.remove());
    for (const d of CM.organism.DIRECTIVES) {
      const meta = DIRECTIVE_META[d];
      const btn = document.createElement('button');
      btn.className = 'dirbtn' + (PRIMARY_DIRECTIVES[d] ? '' : ' dir-extra');
      btn.dataset.directive = d;
      btn.innerHTML = `<i>${meta.icon}</i>${meta.label}`;
      btn.addEventListener('click', () => {
        CORE.issueDirective(game, d);
        renderDirectiveBar(game);
        renderSelection(game);
      });
      if (build) bar.insertBefore(btn, build);
      else bar.appendChild(btn);
    }
    if (!el('btn-dir-more')) {
      const more = document.createElement('button');
      more.className = 'dirbtn';
      more.id = 'btn-dir-more';
      more.type = 'button';
      more.innerHTML = '<i>\u22EF</i>MORE';
      more.addEventListener('click', () => {
        if (game.ui) game.ui.dirMore = !game.ui.dirMore;
        renderDirectiveBar(game);
      });
      if (build) bar.insertBefore(more, build);
      else bar.appendChild(more);
    }
    if (build && build.parentNode !== bar) bar.appendChild(build);
    renderDirectiveBar(game);
  }
  function renderDirectiveBar(game) {
    const active = game.selection && game.byId[game.selection] ? game.byId[game.selection].directive : game.globalDirective;
    document.querySelectorAll('#directive-bar .dirbtn').forEach(b => {
      if (b.id === 'btn-dir-more') return;
      b.classList.toggle('active', b.dataset.directive === active);
    });
    const bar = el('directive-bar');
    const moreOn = !!(game.ui && game.ui.dirMore);
    if (bar) bar.classList.toggle('dir-full', moreOn);
    const moreBtn = el('btn-dir-more');
    if (moreBtn) moreBtn.classList.toggle('active', moreOn);
  }

  // -- camera controls ---------------------------------------------------
  function initCamControls(game) {
    el('btn-focus-core').addEventListener('click', () => CM.input.focusCore(game));
    el('btn-zoom-in').addEventListener('click', () => CM.input.zoomBy(game, 1.35));
    el('btn-zoom-out').addEventListener('click', () => CM.input.zoomBy(game, 1 / 1.35));
  }

  /* --- depth switching -----------------------------------------------------
   * Surface plus one button per stratum. Levels below what the colony has cut
   * stay disabled rather than hidden, because the whole point of the deep tier
   * is that the player can see it waiting. */
  function initDepthControls(game) {
    const box = el('depth-controls');
    box.addEventListener('click', evt => {
      const btn = evt.target.closest('.depthbtn');
      if (!btn || btn.disabled) return;
      setViewDepth(game, parseInt(btn.dataset.depth, 10));
    });
    renderDepthControls(game);
  }

  function setViewDepth(game, depth) {
    if (game.viewDepth === depth) return;
    game.viewDepth = depth;
    // Placing a chamber is a surface action — the build banner would otherwise
    // sit over a view the tap does not apply to.
    if (depth && game.buildMode) setBuildMode(game, null);
    // No toast: the view itself changes completely and carries its own banner.
    // Announcing it as well just buried the map under notifications every time
    // the player flicked between levels.
    renderDepthControls(game);
  }

  const DEPTH_LABEL = ['S', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  function renderDepthControls(game) {
    const box = el('depth-controls');
    const view = game.viewDepth || 0;
    let html = '';
    for (let d = 0; d <= CM.structures.MAX_DEPTH; d++) {
      const open = CM.layers ? CM.layers.viewOpen(game, d) : (d === 0 || d <= (game.core ? CM.structures.deepestOf(game, game.core.id) : 0) + 1);
      const info = d ? CM.structures.DEPTHS[d] : null;
      const title = d === 0 ? 'Surface' : (open ? info.name : `${info.name} — dig deeper to see it`);
      const hostiles = (open && d && CM.layers && game.core) ? CM.layers.layerHostiles(game, d, game.core.id) : 0;
      const lost = game.core && game.core.burrowLost && d >= 1 && d <= 9;
      const settled = d >= 1 && d <= 9 && game.core && CM.layers && CM.layers.layerReady(game, game.core, d).ok;
      html += `<button class="depthbtn${view === d ? ' active' : ''}${d === 10 ? ' veil' : ''}${lost ? ' lost' : ''}${settled ? ' settled' : ''}" data-depth="${d}"
        ${open ? '' : 'disabled'} title="${title}">${DEPTH_LABEL[d] || d}${hostiles ? '<i class="pip"></i>' : ''}</button>`;
    }
    box.innerHTML = html;
    renderLayerCard(game);
  }

  function layerToolsHtml(game, d) {
    return `<div class="lc-tools">
      ${d >= 1 ? `<button data-infl class="${game.showInfluence ? 'active' : ''}">Influence</button>` : ''}
      <button data-aura class="${game.showAura !== false ? 'active' : ''}">Weather</button>
      <button data-peel class="${game.peel !== false ? 'active' : ''}">Stack</button>
      <button data-sense class="${game.senseSight !== false ? 'active' : ''}">Fog</button>
    </div>`;
  }

  function renderLayerCard(game) {
    const box = el('layer-card');
    if (!box) return;
    if (!game.ui) game.ui = { layerExpanded: false };
    const expanded = !!game.ui.layerExpanded;
    const d = game.viewDepth || 0;
    box.classList.remove('hidden');
    box.classList.toggle('lc-mini', !expanded);
    const region = CM.world.regionAt(game.world, game.camera.x, game.camera.y);
    const biome = CM.world.biomeInfoAt(game.world, game.camera.x, game.camera.y);
    const ready = !d
      ? (CM.layers ? CM.layers.surfaceReady(game, game.core) : { ok: true })
      : ((CM.layers && game.core && d < 10) ? CM.layers.layerReady(game, game.core, d) : { ok: true });
    const checks = ready.checks || [];
    const ticks = checks.slice(0, 3).map(c => c.ok ? '✓' : '·').join('');
    const info = d ? CM.structures.DEPTHS[d] : null;
    const dom = d && CM.layers ? CM.layers.dominantOf(game, d) : { colonyId: null };
    const owner = dom && dom.colonyId && game.coloniesById[dom.colonyId];
    const who = !d
      ? ((region && region.id ? region.name : (biome && biome.name)) || CM.climate.describe(game))
      : (!owner ? 'Unclaimed' : (dom.contested ? `Contested · ${owner.name}` : `${owner.name} dominates`));
    const title = !d ? 'Surface' : info.name;
    const toggle = `<button type="button" data-lc-expand class="lc-toggle">${expanded ? '▴' : '▾'}</button>`;
    const liveC = (d >= 1 && CM.layers) ? CM.layers.comfort(game, d) : 0;
    const liveLine = d >= 1
      ? `<div class="lc-live">Living: ${CM.layers ? CM.layers.livingLabel(liveC) : 'Exposed'}</div>`
      : '';

    if (!expanded) {
      box.innerHTML = `<div class="lc-head"><span${info ? ` style="color:${info.tint}"` : ''}>${title} · ${who}${ticks ? ' · ' + ticks : ''}</span>${toggle}</div>
        ${liveLine}
        ${layerToolsHtml(game, d)}`;
      bindLayerCardChrome(game);
      bindQuestIgnore();
      return;
    }

    if (!d) {
      box.innerHTML = `<div class="lc-head"><span>Surface</span><span class="lc-who">${CM.climate.describe(game)}</span>${toggle}</div>
        <div class="lc-bonus">${region && region.id ? region.name : biome.name} — forage, grow, then sink.</div>
        <div class="lc-pair"><b>Explore</b> Learn the ground. Deposits, water, and weather are the first campaign.</div>
        <div class="lc-pair"><b>Hold</b> A shaft waits on a foothold so the surface is not abandoned the moment you can dig.</div>
        ${checks.length ? `<div class="lc-checks">${checks.map(c =>
          `<span class="${c.ok ? 'ok' : ''}">${c.ok ? '✓' : '·'} ${c.label}</span>`).join('')}</div>` : ''}
        <div class="lc-next">${ready.ok ? 'Access Shaft unlocked.' : ready.reason}</div>
        ${layerToolsHtml(game, 0)}`;
      bindLayerCardChrome(game);
      bindQuestIgnore();
      return;
    }
    const tip = CM.layers ? CM.layers.tradeoff(d) : null;
    const hold = checks.find(c => c.key === 'hold');
    box.innerHTML = `<div class="lc-head"><span style="color:${info.tint}">${info.name}</span><span class="lc-who">${who}</span>${toggle}</div>
      ${liveLine}
      ${tip ? `<div class="lc-bonus">${tip.bonus}</div>
        <div class="lc-pair"><b>Expand</b> ${tip.expand}</div>
        <div class="lc-pair"><b>Defend</b> ${tip.defend}</div>` : ''}
      ${checks.length ? `<div class="lc-checks">${checks.map(c =>
        `<span class="${c.ok ? 'ok' : ''}">${c.ok ? '✓' : '·'} ${c.label}</span>`).join('')}</div>` : ''}
      ${hold && hold.frac != null ? `<div class="lc-bar"><i style="width:${Math.round(hold.frac * 100)}%"></i></div>` : ''}
      ${d < 9 ? `<div class="lc-next">${ready.ok
        ? `Next cut open — ${CM.structures.DEPTHS[d + 1] ? CM.structures.DEPTHS[d + 1].name : 'deeper'} is yours to take.`
        : (ready.reason || '')}</div>` : ''}
      ${d <= 9 && d >= 1 && game.core ? renderStanceRow(game, d) : ''}
      ${d >= 1 && game.core ? renderDistrictRow(game, d) : ''}
      ${d >= 1 && game.core ? renderLaborRow(game, d) : ''}
      ${layerToolsHtml(game, d)}`;
    box.querySelectorAll('[data-stance]').forEach(btn => {
      btn.addEventListener('click', () => {
        CM.structures.setStance(game.core, d, btn.dataset.stance);
        renderLayerCard(game);
      });
    });
    box.querySelectorAll('[data-labor]').forEach(btn => {
      btn.addEventListener('click', () => {
        CM.structures.bumpLabor(game.core, d, btn.dataset.labor);
        if (CM.progress) CM.progress.note(game, 'labor');
        renderLayerCard(game);
      });
    });
    bindLayerCardChrome(game);
  }

  function bindLayerCardChrome(game) {
    const box = el('layer-card');
    if (!box) return;
    const exp = box.querySelector('[data-lc-expand]');
    if (exp) exp.addEventListener('click', () => {
      if (!game.ui) game.ui = {};
      game.ui.layerExpanded = !game.ui.layerExpanded;
      renderLayerCard(game);
    });
    const inflBtn = box.querySelector('[data-infl]');
    if (inflBtn) inflBtn.addEventListener('click', () => {
      game.showInfluence = !game.showInfluence;
      renderLayerCard(game);
    });
    bindAuraTools(game);
  }

  function bindAuraTools(game) {
    const box = el('layer-card');
    if (!box) return;
    const auraBtn = box.querySelector('[data-aura]');
    if (auraBtn) auraBtn.addEventListener('click', () => {
      game.showAura = game.showAura === false;
      if (CM.progress) CM.progress.note(game, 'weather');
      if (CM.guide) CM.guide.note(game, 'weather');
      renderLayerCard(game);
    });
    const peelBtn = box.querySelector('[data-peel]');
    if (peelBtn) peelBtn.addEventListener('click', () => {
      game.peel = game.peel === false;
      renderLayerCard(game);
    });
    const senseBtn = box.querySelector('[data-sense]');
    if (senseBtn) senseBtn.addEventListener('click', () => {
      game.senseSight = game.senseSight === false;
      renderLayerCard(game);
    });
  }

  function paintSpeed(game) {
    const btn = el('btn-speed');
    if (!btn) return;
    if (game.speed === 0) btn.textContent = 'II';
    else if ((game.thought || 0) > 0.55) btn.textContent = 'THINK';
    else btn.textContent = game.speed + 'x';
    document.body.classList.toggle('thinking', (game.thought || 0) > 0.55);
    const moodEl = el('stat-mood');
    if (moodEl && CM.sentiment) {
      const feel = (game.sentiment && game.sentiment.last) || CM.sentiment.feel(game);
      moodEl.querySelector('span').textContent = feel.label;
      moodEl.dataset.mood = feel.mood;
      moodEl.title = `${feel.label} · ${feel.mood} · ${feel.flavor}`;
    }
    const ecoEl = el('stat-eco');
    if (ecoEl && CM.economy) {
      const e = CM.economy.ensure(game);
      const span = ecoEl.querySelector('span') || ecoEl;
      span.textContent =
        `ATT ${e.attention.toFixed(1)}  FAV ${e.favor.toFixed(1)}  GOS ${e.gossip.toFixed(1)}  SCR ${e.scars.toFixed(0)}`;
    }
    renderGuideCard(game);
  }

  function renderConstellation(game) {
    if (!CM.reputation) return '';
    const map = CM.reputation.constellation(game);
    if (!map.nodes.length) return '';
    const w = 280, h = 140;
    const placed = {};
    map.nodes.forEach((n, i) => {
      const a = (i / Math.max(1, map.nodes.length)) * Math.PI * 2 - Math.PI / 2;
      const r = n.id === 'player' ? 0 : 48;
      placed[n.id] = { x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r * 0.72, n };
    });
    let svg = `<div class="research-head">STANDING</div><svg class="constellation" viewBox="0 0 ${w} ${h}" width="100%" height="140">`;
    for (const e of map.edges) {
      const a = placed[e.from], b = placed[e.to];
      if (!a || !b) continue;
      const warm = e.favor >= 0;
      const op = 0.25 + Math.min(0.7, Math.abs(e.favor));
      svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${warm ? '#8bac0f' : '#ef5b5b'}" stroke-opacity="${op}" stroke-width="${1 + Math.abs(e.favor) * 2}"/>`;
    }
    for (const id in placed) {
      const p = placed[id];
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${id === 'player' ? 7 : 5}" fill="${p.n.color}"/>`;
      svg += `<text x="${p.x}" y="${p.y + 14}" text-anchor="middle" fill="#9a8b6a" font-size="8">${p.n.name}</text>`;
    }
    svg += '</svg>';
    return svg;
  }

  function firstPlayerOrg(game) {
    const depth = game.viewDepth || 0;
    let any = null;
    for (const o of game.organisms || []) {
      if (o.alive && o.ownerId === 'player') {
        if ((o.depth || 0) === depth) return o;
        if (!any) any = o;
      }
    }
    return any;
  }

  function placeGuideHighlight(game, target) {
    const spot = el('guide-spot');
    const hole = el('guide-hole');
    if (!spot || !hole) return;
    if (!target) { spot.classList.add('hidden'); return; }
    let r = null;
    if (target === 'scout') {
      const org = firstPlayerOrg(game);
      const canvas = el('world-canvas');
      if (org && canvas && CM.render && CM.render.worldToScreen) {
        if ((org.depth || 0) !== (game.viewDepth || 0)) game.viewDepth = org.depth || 0;
        let p = CM.render.worldToScreen(game, canvas, org.x, org.y);
        const box = canvas.getBoundingClientRect();
        const dpr = canvas.__dpr || 1;
        let sx = p.x / dpr, sy = p.y / dpr;
        if (sx < 0 || sy < 0 || sx > box.width || sy > box.height) {
          if (CM.render.focusOn) CM.render.focusOn(game, org.x, org.y);
          if (game.camera) { game.camera.x = org.x; game.camera.y = org.y; }
          p = CM.render.worldToScreen(game, canvas, org.x, org.y);
          sx = p.x / dpr;
          sy = p.y / dpr;
        }
        r = { left: box.left + sx - 30, top: box.top + sy - 30, width: 60, height: 60 };
      }
    } else {
      const node = document.querySelector(target);
      if (node && !node.classList.contains('hidden')) r = node.getBoundingClientRect();
    }
    if (!r || r.width < 2) { spot.classList.add('hidden'); return; }
    const pad = 6;
    spot.classList.remove('hidden');
    hole.style.left = Math.round(r.left - pad) + 'px';
    hole.style.top = Math.round(r.top - pad) + 'px';
    hole.style.width = Math.round(r.width + pad * 2) + 'px';
    hole.style.height = Math.round(r.height + pad * 2) + 'px';
  }

  function dockToasts() {
    const layer = el('toast-layer');
    if (!layer) return;
    const guide = el('guide-card');
    const quest = el('quest-card');
    const guideOn = !!(guide && !guide.classList.contains('hidden'));
    const questOn = !!(quest && !quest.classList.contains('hidden'));
    layer.classList.toggle('under-guide', guideOn);
    layer.classList.toggle('under-quest', !guideOn && questOn);
  }

  function renderGuideCard(game) {
    const box = el('guide-card');
    if (!box || !CM.guide) return;
    const beat = CM.guide.current(game);
    if (!beat) {
      box.classList.add('hidden');
      document.body.classList.remove('guiding');
      if (game.ui) game.ui.guideBeat = null;
      placeGuideHighlight(game, null);
      dockToasts();
      return;
    }
    document.body.classList.add('guiding');
    if (beat.tab && CM.ui && beat.tab === 'explore') {
      /* keep explore open so GATHER / BUILD stay on screen */
    }
    if (game.ui && game.ui.guideBeat !== beat.id) {
      game.ui.guideBeat = beat.id;
      if (beat.tab && beat.tab !== 'analyze' && beat.tab !== 'world') {
        const explore = el('panel-explore');
        if (explore && beat.tab === 'explore' && !explore.classList.contains('active')) {
          /* do not yank them off analyze mid-click; only open explore for gather/build */
          switchTab('explore', game);
        }
      }
      box.classList.remove('hidden');
      const extra = beat.extra ? 'SIDE' : (beat.step + ' / ' + beat.total);
      box.innerHTML = `<div class="gc-head">QUEST · ${extra}</div>
        <div class="gc-title">${beat.title}</div>
        <div class="gc-line">${beat.text}</div>
        <div class="gc-hint">${beat.hint || ''}</div>
        <button type="button" class="gc-skip">Skip tutorial</button>`;
      const skip = box.querySelector('.gc-skip');
      if (skip) skip.addEventListener('click', () => {
        CM.guide.skip(game);
        box.classList.add('hidden');
        document.body.classList.remove('guiding');
        placeGuideHighlight(game, null);
        if (game.ui) game.ui.guideBeat = null;
        dockToasts();
      });
    } else {
      box.classList.remove('hidden');
    }
    placeGuideHighlight(game, beat.target);
    dockToasts();
    dockSelection();
  }

  function renderStanceRow(game, d) {
    const cur = CM.structures.stanceOf(game.core, d);
    return `<div class="lc-stance">${CM.structures.STANCE_ORDER.map(k =>
      `<button data-stance="${k}" class="${cur === k ? 'active' : ''}">${CM.structures.STANCES[k].label}</button>`).join('')}</div>`;
  }

  function renderDistrictRow(game, d) {
    if (!CM.influence) return '';
    const dist = CM.influence.layerDistrict(game, game.core.id, d);
    const at = CM.influence.at(game, game.camera.x, game.camera.y, d, game.core.id);
    if (!dist && at.strength < 0.4) return '<div class="lc-dist">No district yet — cluster matching rooms.</div>';
    const label = dist ? CM.influence.AXIS_LABEL[dist] : 'Mixed';
    return `<div class="lc-dist">District: <b>${label}</b>${at.strength ? ` · ${at.strength.toFixed(1)}` : ''}</div>`;
  }

  function renderLaborRow(game, d) {
    const L = CM.structures.laborOf(game.core, d);
    return `<div class="lc-labor">${CM.structures.LABOR_KEYS.map(k =>
      `<button data-labor="${k}" class="${(L[k] || 0) >= 3 ? 'active' : ''}">${CM.structures.LABOR_LABEL[k]} ${L[k] || 0}</button>`
    ).join('')}</div>`;
  }

  function bindQuestIgnore() { /* noop — quest card is separate */ }

  function renderQuestCard(game) {
    const box = el('quest-card');
    if (!box || !CM.progress) return;
    const q = CM.progress.activeQuest(game);
    const sides = CM.progress.sideQuests(game);
    if (!q && !sides.length) { box.classList.add('hidden'); dockToasts(); return; }
    box.classList.remove('hidden');
    let html = '';
    if (q) {
      html += `<div class="qc-head">QUEST · ${q.title}</div>
        <div class="qc-blurb">${q.blurb}</div>
        <div class="qc-hint">${q.hint}</div>`;
    }
    for (const s of sides) {
      html += `<div class="qc-side"><b>${s.title}</b> ${s.blurb}</div>`;
    }
    box.innerHTML = html;
    dockToasts();
  }

  function initOrderBar(game) {
    const bar = el('order-bar');
    if (!bar) return;
    bar.addEventListener('click', evt => {
      const btn = evt.target.closest('[data-order]');
      if (!btn) return;
      const act = btn.dataset.order;
      if (act === 'ADD') {
        game.addSelect = !game.addSelect;
      } else if (act === 'CLEAR') {
        CM.coremind.selectOrganism(game, null);
      } else if (act === 'BOX') {
        game.boxSelect = !game.boxSelect;
      } else if (act === 'FOLLOW') {
        game.followSelection = !game.followSelection;
      } else if (act === 'ALL') {
        if (CM.orders) CM.orders.selectAllOnLayer(game);
      } else if (act === 'QUEUE') {
        game.queueOrders = !game.queueOrders;
      } else if (act === 'G1' || act === 'G2' || act === 'G3' || act === 'G4' || act === 'G5' || act === 'G6') {
        const slot = parseInt(act[1], 10);
        if (game.addSelect) CM.orders.assignGroup(game, slot);
        else CM.orders.recallGroup(game, slot);
      } else if (CM.orders) {
        CM.orders.setMode(game, act);
      }
      renderOrderBar(game);
      renderSelection(game);
    });
  }

  function renderOrderBar(game) {
    const bar = el('order-bar');
    if (!bar) return;
    const group = CM.orders ? CM.orders.selectedPlayerOrgs(game) : [];
    if (!group.length || (game.hero && game.hero.on)) { bar.classList.add('hidden'); return; }
    const mode = game.commandMode;
    const mk = (id, label, extra) =>
      `<button data-order="${id}" class="obtn${mode === id || extra ? ' active' : ''}">${label}</button>`;
    bar.classList.remove('hidden');
    bar.innerHTML = mk('MOVE', 'Move') + mk('ATTACK', 'Atk') + mk('ATTACK_MOVE', 'A-M')
      + mk('HOLD', 'Hold') + mk('GARRISON', 'Gar') + mk('PATROL', 'Pat')
      + mk('RETREAT', 'Rtr') + mk('STOP', 'Stop')
      + mk('QUEUE', 'Q', game.queueOrders)
      + mk('BOX', 'Box', game.boxSelect) + mk('FOLLOW', 'Cam', game.followSelection)
      + mk('ALL', 'All') + mk('ADD', '+', game.addSelect) + mk('CLEAR', '×')
      + mk('G1', '1') + mk('G2', '2') + mk('G3', '3') + mk('G4', '4')
      + mk('G5', '5') + mk('G6', '6');
  }

  function initMinimap(game) {
    const node = el('minimap');
    if (!node) return;
    node.addEventListener('pointerdown', evt => {
      evt.stopPropagation();
      const rect = node.getBoundingClientRect();
      const x = ((evt.clientX - rect.left) / rect.width) * game.world.size;
      const y = ((evt.clientY - rect.top) / rect.height) * game.world.size;
      CM.render.focusOn(game, x, y);
      game.followSelection = false;
    });
  }

  function initOutcome(game) {
    const overlay = el('end-overlay');
    if (!overlay) return;
    el('btn-end-continue').addEventListener('click', () => overlay.classList.add('hidden'));
    if (game.outcome) showOutcome(game);
  }

  function showOutcome(game) {
    const overlay = el('end-overlay');
    if (!overlay || overlay.dataset.shown === game.outcome) return;
    overlay.dataset.shown = game.outcome;
    el('end-title').textContent = game.outcome === 'victory' ? 'THE VEIL IS YOURS' : 'THE VEIL IS LOST';
    el('end-blurb').textContent = game.outcome === 'victory'
      ? 'Every other Gate has fallen. You hold the underworld. The surface war can still go on.'
      : 'Another Coremind holds the last Gate. Reclaim yours, or the burrow stays theirs.';
    overlay.classList.remove('hidden');
  }

  /* The Sanctum readout. Only appears once the colony is actually cutting one
   * — before that it would be a promise the game has not made yet. */
  function renderSanctumMeter(game) {
    const box = el('sanctum-meter');
    if (!game.core) return;
    const done = CM.structures.hasSanctum(game, game.core.id);
    const prog = CM.structures.sanctumProgress(game, game.core.id);
    if (prog <= 0) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.classList.toggle('secured', done);
    box.innerHTML = done
      ? '\u{1F52E} <b>Sanctum secured.</b><br>The Coremind cannot be killed from the surface.'
      : `\u{1F52E} Deep Sanctum ${Math.round(prog * 100)}%<div class="bar"><i style="width:${Math.round(prog * 100)}%"></i></div>`;
  }

  // -- selection panel ------------------------------------------------------
  function renderSelection(game) {
    const panel = el('selection-panel');
    const summary = el('selection-summary');
    const org = game.selection && game.byId[game.selection];
    if (!org) {
      panel.classList.add('hidden');
      summary.textContent = 'Tap an organism to select it. With one selected, tap the ground to move it — or issue a colony directive.';
      renderDirectiveBar(game);
      renderOrderBar(game);
      return;
    }
    panel.classList.remove('hidden');
    const hf = Math.round(100 * org.health / org.stats.health);
    const ef = Math.round(100 * org.energy / org.stats.energyMax);
    // Distress flags name the thing that is actually killing this organism,
    // so a failed design reads as a diagnosis instead of a mystery.
    const flags = [];
    if (org.burrowed) flags.push('<span style="color:var(--warn)">BURROWED</span>');
    if (org.hunger > 80) flags.push('<span style="color:var(--danger)">STARVING</span>');
    if (org.thirst > 80) flags.push('<span style="color:var(--danger)">DEHYDRATED</span>');
    const stress = CM.organism.tempStress(org, CM.world.tempAt(game.world, org.x, org.y));
    if (stress > 1) flags.push('<span style="color:var(--danger)">TEMP STRESS</span>');
    const lifeLine = CM.life ? CM.life.selectionLine(org) : org.name;
    const marks = CM.life ? CM.life.markList(org) : [];
    const play = (game.hero && game.hero.on && game.hero.orgId === org.id)
      ? '<button type="button" class="playbtn" data-play="exit">COMMAND</button>'
      : '<button type="button" class="playbtn" data-play="enter">PLAY</button>';
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <b>${lifeLine}</b>${play}</div>
      <div style="font-size:11.5px;color:var(--fg-dim);margin-top:2px">${org.state}${org.order && CM.orders ? ' / ' + CM.orders.label(org.order) : ''} &middot; HP ${hf}% &middot; Energy ${ef}% &middot; L${org.depth || 0}</div>
      ${flags.length ? `<div style="font-size:10.5px;margin-top:3px;letter-spacing:.05em">${flags.join(' ')}</div>` : ''}
      ${marks.length ? `<div style="font-size:10.5px;color:var(--gold-hi);margin-top:3px">${marks.join(' · ')}</div>` : ''}`;
    const playBtn = panel.querySelector('[data-play]');
    if (playBtn) playBtn.addEventListener('click', evt => {
      evt.stopPropagation();
      if (playBtn.dataset.play === 'exit') CM.hero.exit(game);
      else CM.hero.enter(game, org);
      renderSelection(game);
      renderHero(game);
    });
    dockSelection();
    /* First-select hint lives in the tutorial and the summary line — no popup. */
    const n = (game.selectedIds && game.selectedIds.length) || 1;
    summary.textContent = n > 1
      ? `${n} organisms selected — tap ground to move the group.`
      : lifeLine;
    renderDirectiveBar(game);
    renderOrderBar(game);
    renderHero(game);
  }

  function dockSelection() {
    const panel = el('selection-panel');
    const stage = el('stage');
    if (!panel || !stage || panel.classList.contains('hidden')) return;
    if (document.body.classList.contains('hero')) {
      panel.style.top = '';
      return;
    }
    const guide = el('guide-card');
    const quest = el('quest-card');
    const stageTop = stage.getBoundingClientRect().top;
    let top = 8;
    if (document.body.classList.contains('guiding') && guide && !guide.classList.contains('hidden')) {
      top = Math.round(guide.getBoundingClientRect().bottom - stageTop + 8);
    } else if (quest && !quest.classList.contains('hidden')) {
      top = Math.round(quest.getBoundingClientRect().bottom - stageTop + 8);
    }
    panel.style.top = top + 'px';
    panel.style.left = (window.matchMedia('(min-width:900px)').matches ? '52px' : '8px');
    panel.style.right = 'auto';
  }

  function initHeroHud(game) {
    const hud = el('hero-hud');
    const bar = el('hero-bar');
    const bag = el('hero-bag');
    const stick = el('hero-stick');
    if (!hud || !CM.hero) return;
    el('btn-hero-exit').addEventListener('click', () => {
      CM.hero.exit(game);
      renderSelection(game);
      renderHero(game);
    });
    el('btn-hero-bag').addEventListener('click', () => {
      game.hero = CM.hero.ensure(game);
      game.hero.bagOpen = !game.hero.bagOpen;
      renderHero(game);
    });
    bar.addEventListener('click', evt => {
      const btn = evt.target.closest('[data-slot]');
      if (!btn) return;
      CM.hero.cast(game, parseInt(btn.dataset.slot, 10));
      renderHero(game);
    });
    bag.addEventListener('click', evt => {
      const btn = evt.target.closest('[data-item]');
      if (!btn) return;
      const hero = CM.hero.heroOf(game);
      if (hero) CM.hero.useItem(game, hero, parseInt(btn.dataset.item, 10));
      renderHero(game);
    });
    if (stick) {
      const setStick = (evt) => {
        const r = stick.getBoundingClientRect();
        const x = ((evt.clientX - r.left) / r.width) * 2 - 1;
        const y = ((evt.clientY - r.top) / r.height) * 2 - 1;
        const h = CM.hero.ensure(game);
        h.stick.x = Math.max(-1, Math.min(1, x));
        h.stick.y = Math.max(-1, Math.min(1, y));
      };
      stick.addEventListener('pointerdown', evt => { stick.setPointerCapture(evt.pointerId); setStick(evt); });
      stick.addEventListener('pointermove', evt => { if (evt.buttons) setStick(evt); });
      stick.addEventListener('pointerup', () => { const h = CM.hero.ensure(game); h.stick.x = 0; h.stick.y = 0; });
    }
  }

  function renderHero(game) {
    const hud = el('hero-hud');
    const bar = el('hero-bar');
    const bag = el('hero-bag');
    const tgt = el('hero-target');
    const stick = el('hero-stick');
    if (!hud || !CM.hero) return;
    const on = !!(game.hero && game.hero.on && CM.hero.heroOf(game));
    hud.classList.toggle('hidden', !on);
    if (tgt) tgt.classList.toggle('hidden', !on);
    if (stick) stick.classList.toggle('hidden', !on);
    if (bag) bag.classList.toggle('hidden', !(on && game.hero.bagOpen));
    document.body.classList.toggle('hero', on);
    if (!on) return;
    const hero = CM.hero.heroOf(game);
    const slots = CM.hero.kit(hero, game);
    const pack = CM.hero.packOf(game);
    const syn = CM.hero.synergies(pack).map(s => s.name).join(' · ');
    bar.innerHTML = slots.map((ab, i) => {
      const left = CM.hero.cdLeft(game, ab.id);
      const ready = left <= 0 && hero.energy >= ab.cost;
      return `<button type="button" data-slot="${i}" class="abtn${ready ? '' : ' wait'}" title="${ab.name}">
        <i>${ab.key}</i><span>${ab.name}</span>${left > 0 ? `<b>${left.toFixed(1)}</b>` : ''}</button>`;
    }).join('') + (syn ? `<div class="hero-syn">${pack.length} as one · ${syn}</div>` : `<div class="hero-syn">${pack.length} as one</div>`);
    const lock = CM.hero.targetOf(game);
    if (tgt) {
      if (lock) {
        const hp = Math.round(100 * lock.health / lock.stats.health);
        tgt.innerHTML = `<b>${lock.name}</b> · ${hp}%<div class="hero-hp"><i style="width:${hp}%"></i></div>`;
      } else tgt.innerHTML = 'Tab a target · Space to strike';
    }
    if (bag && game.hero.bagOpen) {
      const inv = CM.hero.ensureInv(hero);
      let html = '<div class="research-head">BAG · ' + hero.name + '</div>';
      for (let i = 0; i < CM.hero.BAG; i++) {
        const it = inv[i];
        html += it
          ? `<button type="button" data-item="${i}" class="bag-slot">${it.name} ×${it.n}</button>`
          : `<div class="bag-slot empty">—</div>`;
      }
      bag.innerHTML = html;
    }
  }

  // -- events / feed / toasts ---------------------------------------------
  function onEvent(game, evt) {
    const badgeKinds = { discovery: 1, warn: 1, rival: 1, death: 1 };
    if (badgeKinds[evt.kind]) game.ui.unreadAnalyze++;
    updateBadges(game);
    /* Toasts only for discoveries, warnings, rivals, and becoming legend. */
    if (evt.kind === 'discovery' || evt.kind === 'warn' || evt.kind === 'rival' || evt.kind === 'legend') toast(evt);
    if (el('panel-analyze').classList.contains('active')) renderFeed(game);
  }

  function toast(evt) {
    const layer = el('toast-layer');
    if (!layer || !evt || !evt.message) return;
    dockToasts();
    const kind = evt.kind === 'death' ? 'danger' : (evt.kind === 'warn' ? 'warn' : (evt.kind === 'discovery' || evt.kind === 'legend' ? 'good' : 'ok'));
    const text = String(evt.message);
    const existing = layer.querySelector('.toast');
    if (existing && existing.dataset.msg === text) {
      const n = (parseInt(existing.dataset.n, 10) || 1) + 1;
      existing.dataset.n = String(n);
      const body = existing.querySelector('.toast-msg');
      if (body) body.textContent = text;
      const count = existing.querySelector('.toast-n');
      if (count) { count.textContent = '×' + n; count.hidden = false; }
      existing.classList.remove('toast-pop');
      void existing.offsetWidth;
      existing.classList.add('toast-pop');
      return;
    }
    const div = document.createElement('div');
    div.className = 'toast ' + kind;
    div.dataset.msg = text;
    div.dataset.n = '1';
    div.innerHTML = `<span class="toast-ico">${evt.icon || ''}</span><span class="toast-msg"></span><span class="toast-n" hidden></span>`;
    div.querySelector('.toast-msg').textContent = text;
    layer.appendChild(div);
    const ms = kind === 'warn' ? 2200 : kind === 'good' ? 2400 : 1600;
    setTimeout(() => {
      div.classList.add('toast-out');
      setTimeout(() => { if (div.parentNode) div.remove(); }, 220);
    }, ms);
    while (layer.children.length > 2) layer.removeChild(layer.firstChild);
  }

  /* The research backlog: traits the Coremind has partial evidence for.
   * Without this the player only ever sees the moment a discovery lands and
   * has no idea that watching a predator fight is *doing* anything. */
  function renderResearch(game) {
    const wrap = el('research-list');
    const rows = D.researchInProgress(game);
    if (!rows.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<div class="research-head">ANALYSIS IN PROGRESS</div>';
    for (const r of rows.slice(0, 6)) {
      const row = document.createElement('div');
      row.className = 'research-row';
      row.innerHTML = `<div class="rname">${r.trait.name}</div>
        <div class="rbar"><i style="width:${Math.round(r.progress * 100)}%"></i></div>
        <div class="rcount">${r.observations}/${r.needed}</div>`;
      wrap.appendChild(row);
    }
  }

  function renderFeed(game) {
    renderResearch(game);
    const feed = el('event-feed');
    const events = game.discovery.events;
    if (!events.length) { feed.innerHTML = '<div class="event-empty">Nothing observed yet. Send an organism to EXPLORE.</div>'; return; }
    feed.innerHTML = '';
    for (const evt of events.slice(0, 80)) {
      const row = document.createElement('button');
      row.className = 'event-row' + (evt.kind === 'discovery' ? ' discovery' : evt.kind === 'death' ? ' death'
        : evt.kind === 'warn' ? ' warn' : evt.kind === 'rival' ? ' rival' : evt.kind === 'climate' ? ' climate' : '');
      const mins = Math.floor(evt.time / 60), secs = Math.floor(evt.time % 60);
      const obs = evt.observation
        ? `<div class="obs">Species: <b>${evt.observation.species}</b><br>Damage type: <b>${evt.observation.damageType}</b><br>Observed defense: <b>${evt.observation.defense}</b></div>`
        : '';
      row.innerHTML = `<div class="ico">${evt.icon || '•'}</div><div class="body"><div class="msg">${evt.message}</div>${obs}<div class="time">t+${mins}:${String(secs).padStart(2, '0')}</div></div>`;
      row.addEventListener('click', () => onEventClick(game, evt));
      feed.appendChild(row);
    }
  }

  function onEventClick(game, evt) {
    if (evt.x != null && evt.y != null) CM.render.focusOn(game, evt.x, evt.y, 22);
    if (evt.traitId) { openDesigner(game); return; }
    if (evt.orgId && game.byId[evt.orgId]) { CORE.selectOrganism(game, evt.orgId); renderSelection(game); switchTab('explore'); return; }
    if (evt.colonyId && game.coloniesById && game.coloniesById[evt.colonyId]) {
      showInspect(game, 'colony', { colony: game.coloniesById[evt.colonyId] }); return;
    }
    if (evt.speciesId) showInspect(game, 'species', { speciesId: evt.speciesId });
  }

  function switchTab(name, game) {
    game = game || window.__CM_GAME__;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
    if (name === 'analyze' && game && CM.guide) CM.guide.note(game, 'analyze');
    if (name === 'world' && game && game.ui) game.ui.sawWorld = true;
  }

  function hasUnusedDiscoveredTrait(game) {
    const used = new Set();
    for (const d of (game.designs || [])) {
      const traits = d.traits || {};
      for (const k of Object.keys(traits)) if (traits[k]) used.add(traits[k]);
    }
    for (const id of Object.keys(game.discovery.discoveredTraits || {})) {
      if (!used.has(id)) return true;
    }
    return false;
  }

  function updateBadges(game) {
    const ab = el('badge-analyze');
    if (game.ui.unreadAnalyze > 0) { ab.textContent = Math.min(99, game.ui.unreadAnalyze); ab.classList.remove('hidden'); }
    else ab.classList.add('hidden');

    const discovered = Object.keys(game.discovery.discoveredTraits).length;
    const db = el('badge-dna');
    if (hasUnusedDiscoveredTrait(game) && discovered > game.ui.dnaBadgeSeen) {
      db.classList.remove('hidden'); db.classList.add('warn');
    } else db.classList.add('hidden');
  }

  // -- genome designer -----------------------------------------------------
  function initDesigner(game, bus) {
    el('btn-designer-close').addEventListener('click', () => closeDesigner(game));
    el('btn-create-organism').addEventListener('click', () => {
      const org = CORE.createOrganismFromDraft(game, bus);
      if (org) { renderDesigner(game); toast({ kind: 'system', icon: '\u{1F9EA}', message: `${org.name} deployed near the Core.` }); }
    });
    el('btn-save-design').addEventListener('click', () => {
      const design = CORE.saveDesign(game);
      if (design) { renderDesignerDesigns(game); toast({ kind: 'system', icon: '\u{1F4BE}', message: `Saved ${design.name}.` }); }
    });
  }

  function openDesigner(game) {
    openSheet(game, 'designer-overlay');
    game.ui.dnaBadgeSeen = Object.keys(game.discovery.discoveredTraits).length;
    updateBadges(game);
    renderDesigner(game);
    startPreviewLoop(game);
  }
  function closeDesigner(game) { closeSheet(game, 'designer-overlay'); }

  function renderDesignerSlots(game) {
    const wrap = el('designer-slots');
    wrap.innerHTML = '';
    for (const cat of T.CATEGORIES) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const current = game.designerDraft[cat];
      const currentTrait = current && T.TRAITS_BY_ID[current];
      const select = document.createElement('select');
      const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = 'None'; select.appendChild(noneOpt);
      const otherSlots = T.CATEGORIES.filter(c => c !== cat).map(c => game.designerDraft[c]);
      for (const t of T.TRAITS_BY_CATEGORY[cat]) {
        const opt = document.createElement('option');
        opt.value = t.id;
        const known = t.mutation
          ? !!(CM.mutations && CM.mutations.unlocked(game, t.id))
          : !!game.discovery.discoveredTraits[t.id];
        const blockedBy = known ? T.conflictsWith(otherSlots, t.id) : null;
        if (!known) opt.textContent = (t.mutation ? '\u{1F9EC} ' : '\u{1F512} ') + t.name;
        else if (blockedBy) opt.textContent = '\u{2298} ' + t.name;
        else opt.textContent = (t.mutation ? '\u{1F9EC} ' : '') + t.name;
        opt.disabled = !known || !!blockedBy;
        if (blockedBy) opt.title = `Incompatible with ${T.TRAITS_BY_ID[blockedBy].name}`;
        if (t.id === current) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        CORE.setDesignSlot(game, cat, select.value || null);
        renderDesigner(game);
      });
      slot.innerHTML = `<div class="cat">${cat}</div>`;
      const nameDiv = document.createElement('div');
      nameDiv.className = 'trait' + (currentTrait ? '' : ' empty');
      nameDiv.textContent = currentTrait ? currentTrait.name : 'Empty';
      slot.appendChild(nameDiv);
      slot.appendChild(select);
      wrap.appendChild(slot);
    }
  }

  function renderDesignerStats(game) {
    const wrap = el('designer-stats');
    const stats = CORE.draftStats(game);
    wrap.innerHTML = '';
    for (const [key, label] of STAT_ROWS) {
      const base = T.BASE_STATS[key];
      const val = stats[key];
      const delta = val - base;
      const max = STAT_MAXES[key] || 100;
      const row = document.createElement('div'); row.className = 'statrow';
      const pct = K.clamp01(val / max) * 100;
      const deltaTxt = Math.abs(delta) < 0.01 ? '' : (delta > 0 ? '+' + fmt1(delta) : fmt1(delta));
      // Colour by whether the change is *good*, not by its sign: a higher
      // metabolism or water requirement is a cost, and showing it in the
      // same green as a higher attack would invert the tradeoff the
      // designer exists to communicate.
      const deltaCls = Math.abs(delta) < 0.01 ? '' : (T.isBenefit(key, delta) ? 'pos' : 'neg');
      row.innerHTML = `<div class="label">${label}</div><div class="bar"><i style="width:${pct}%"></i></div><div class="val">${fmt1(val)}</div><div class="delta ${deltaCls}">${deltaTxt}</div>`;
      wrap.appendChild(row);
    }
  }

  function renderDesignerCost(game) {
    const cost = CORE.draftCost(game);
    const afford = CORE.canAfford(game, cost);
    el('designer-cost').innerHTML = `Cost: <span class="${game.core.biomass >= cost.biomass ? 'ok' : 'bad'}">${cost.biomass} biomass</span> &middot; <span class="${game.core.energy >= cost.energy ? 'ok' : 'bad'}">${cost.energy} energy</span>`;
    el('btn-create-organism').disabled = !afford;
    el('btn-save-design').disabled = CORE.draftTraitIds(game).length === 0;
  }

  /* Why these traits are worth putting together — or why they can't be. The
   * designer's whole job is making a tradeoff legible before it is paid for. */
  function renderDesignerCombo(game) {
    const wrap = el('designer-combo');
    const { conflicts, synergies } = CORE.draftCombination(game);
    wrap.innerHTML = '';
    for (const s of synergies) {
      const div = document.createElement('div');
      div.className = 'combo-note synergy';
      div.innerHTML = `<span>\u{1F517}</span><span><b>${T.TRAITS_BY_ID[s.a].name} + ${T.TRAITS_BY_ID[s.b].name}</b> reinforce each other — both traits' benefits are boosted ${Math.round(T.SYNERGY_BONUS * 100)}%.</span>`;
      wrap.appendChild(div);
    }
    for (const c of conflicts) {
      const div = document.createElement('div');
      div.className = 'combo-note conflict';
      div.innerHTML = `<span>\u{2298}</span><span><b>${T.TRAITS_BY_ID[c.a].name}</b> cannot coexist with <b>${T.TRAITS_BY_ID[c.b].name}</b>.</span>`;
      wrap.appendChild(div);
    }
  }

  /* Saved strains: tap to load one back into the draft, tap the x to drop it. */
  function renderDesignerDesigns(game) {
    const wrap = el('designer-designs');
    wrap.innerHTML = '';
    for (const design of game.designs) {
      const chip = document.createElement('button');
      chip.className = 'strain-chip';
      chip.innerHTML = `${design.name}<span class="del">×</span>`;
      chip.addEventListener('click', evt => {
        if (evt.target.classList.contains('del')) {
          CORE.deleteDesign(game, design.id);
        } else {
          CORE.loadDesign(game, design.id);
        }
        renderDesigner(game);
      });
      wrap.appendChild(chip);
    }
  }

  /* One entry point so every designer control redraws consistently — the
   * slots gate on each other (conflicts), so a partial refresh would leave
   * stale options enabled. */
  function renderDesigner(game) {
    renderDesignerSlots(game);
    renderDesignerCombo(game);
    renderDesignerStats(game);
    renderDesignerCost(game);
    renderDesignerDesigns(game);
  }

  function startPreviewLoop(game) {
    stopPreviewLoop(game);
    const canvas = el('preview-canvas');
    const ctx = canvas.getContext('2d');
    function frame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      game.ui.previewAngle += 0.012;
      const traits = CORE.draftTraitIds(game);
      const stats = T.resolveStats(traits);
      const previewOrg = { traits, stats, health: stats.health, heading: game.ui.previewAngle, color: '#8bac0f', selected: false };
      // A fixed, generous zoom independent of the world camera — the
      // designer's job is to show off trait silhouettes up close, not to
      // represent true in-world scale.
      CM.render.drawOrganism(ctx, previewOrg, canvas.width / 2, canvas.height / 2, 55);
      game.ui.previewRaf = requestAnimationFrame(frame);
    }
    frame();
  }
  function stopPreviewLoop(game) {
    if (game.ui.previewRaf) cancelAnimationFrame(game.ui.previewRaf);
    game.ui.previewRaf = null;
  }

  // -- inspect overlay (samples / species / core) --------------------------
  function initInspect(game) {
    el('btn-inspect-close').addEventListener('click', () => closeSheet(game, 'inspect-overlay'));
  }

  function nucleiStrip(game) {
    if (!CM.sentiment) return '';
    const feel = (game.sentiment && game.sentiment.last) || CM.sentiment.feel(game);
    const names = CM.sentiment.HIDDEN || ['pulse', 'coil', 'hearth', 'veil', 'fang', 'root'];
    const labels = { pulse: 'Pulse', coil: 'Coil', hearth: 'Hearth', veil: 'Veil', fang: 'Fang', root: 'Root' };
    let rows = '<div class="research-head" style="margin-top:10px">NUCLEI</div><div class="nuclei-strip">';
    for (let i = 0; i < names.length; i++) {
      const v = feel.h && feel.h[i] != null ? feel.h[i] : 0;
      const pct = Math.round(((v + 1) * 0.5) * 100);
      const name = labels[names[i]] || names[i];
      rows += `<div class="statrow nuclei-row"><span class="k">${name}</span><span class="bar"><i style="width:${pct}%"></i></span></div>`;
    }
    rows += '</div>';
    return rows;
  }

  function showInspect(game, kind, data) {
    const title = el('inspect-title'), body = el('inspect-body');
    if (kind === 'sample') {
      const s = data.sample;
      title.textContent = 'BIOLOGICAL SAMPLE';
      const traitChips = s.traits.map(id => `<span class="trait-chip">${T.TRAITS_BY_ID[id].name}</span>`).join('');
      body.innerHTML = `<div class="kv"><span class="k">Source</span><span>${s.name}</span></div>
        <div class="kv"><span class="k">Traits detected</span><span></span></div>
        <div style="margin-top:6px">${traitChips || '<span style="color:var(--fg-dim)">Unclear — needs more observation</span>'}</div>
        <button class="bigbtn extract-btn" id="btn-do-extract">EXTRACT SAMPLE</button>`;
      el('btn-do-extract').addEventListener('click', () => {
        D.extractSample(game, game.__bus, s.id);
        closeSheet(game, 'inspect-overlay');
      });
    } else if (kind === 'core') {
      title.textContent = 'COREMIND';
      body.innerHTML = `<div class="kv"><span class="k">Biomass</span><span>${Math.floor(game.core.biomass)}</span></div>
        <div class="kv"><span class="k">Energy</span><span>${Math.floor(game.core.energy)}</span></div>
        <div class="kv"><span class="k">Population</span><span>${game.stats.playerPop}</span></div>
        ${nucleiStrip(game)}
        <p style="color:var(--fg-dim);font-size:12.5px;margin-top:10px">Every organism you deploy is grown from biomass and energy gathered by the colony. Send organisms to GATHER to keep the Core supplied.</p>`;
    } else if (kind === 'colony') {
      const colony = data.colony;
      const strategy = CM.colony.strategyOf(colony);
      title.textContent = colony.name.toUpperCase();
      const design = CM.colony.designTraitIds(colony.currentDesign)
        .map(id => `<span class="trait-chip">${T.TRAITS_BY_ID[id].name}</span>`).join('');
      body.innerHTML = `
        <div class="kv"><span class="k">Status</span><span>${colony.alive ? 'Active' : 'Collapsed'}</span></div>
        <div class="kv"><span class="k">Doctrine</span><span>${strategy.label}</span></div>
        <div class="kv"><span class="k">Population</span><span>${colony.pop}</span></div>
        <div class="kv"><span class="k">Core integrity</span><span>${Math.round(colony.integrity)}%</span></div>
        <div class="kv"><span class="k">Traits known</span><span>${Object.keys(colony.discovered).length}</span></div>
        <div class="kv"><span class="k">Kills / losses</span><span>${colony.kills} / ${colony.losses}</span></div>
        <div class="kv"><span class="k">Genome revision</span><span>${colony.designGeneration}</span></div>
        <p style="color:var(--fg-dim);font-size:12px;margin:10px 0 4px">${strategy.blurb}</p>
        ${CM.reputation ? `<div class="kv"><span class="k">Regard</span><span>${(CM.reputation.of(game, 'player', colony.id)).toFixed(2)}</span></div>` : ''}
        ${colony.isPlayer ? nucleiStrip(game) : ''}
        <div class="research-head" style="margin-top:10px">CURRENT GENOME</div>
        <div>${design || '<span style="color:var(--fg-dim)">Unknown — no organism of theirs has been observed closely.</span>'}</div>
        ${!colony.isPlayer && colony.alive ? '<button class="bigbtn" id="btn-tribute">OFFER TRIBUTE · 8 biomass</button>' : ''}`;
      const trib = el('btn-tribute');
      if (trib) trib.addEventListener('click', () => {
        const res = CM.economy ? CM.economy.offerTribute(game, colony) : { ok: false, reason: 'No economy.' };
        if (res.ok) {
          toast({ kind: 'system', icon: '\u{1F381}', message: `You offered ${colony.name} a gift. Their regard warmed.` });
          showInspect(game, 'colony', { colony });
        } else toast({ kind: 'warn', icon: '\u{26A0}', message: res.reason });
      });
    } else if (kind === 'org') {
      const org = data.org;
      title.textContent = (CM.life ? CM.life.selectionLine(org) : org.name).toUpperCase();
      const marks = CM.life ? CM.life.markList(org) : [];
      const tier = CM.life ? CM.life.tierOf(org) : (org.lifeTier || 'common');
      body.innerHTML = `<div class="kv"><span class="k">Tier</span><span>${tier}</span></div>
        <div class="kv"><span class="k">Level</span><span>${org.lifeLevel || 1}</span></div>
        <div class="kv"><span class="k">XP</span><span>${Math.floor(org.xp || 0)}</span></div>
        <div class="kv"><span class="k">Focus</span><span>${org.lifeFocus || '—'}</span></div>
        <div class="research-head" style="margin-top:10px">MARKS</div>
        <div>${marks.length ? marks.map(n => `<span class="trait-chip">${n}</span>`).join('') : '<span style="color:var(--fg-dim)">None yet.</span>'}</div>`;
    } else if (kind === 'species') {
      const sp = T.WILD_BY_ID[data.speciesId];
      title.textContent = sp.name.toUpperCase();
      const traitChips = sp.traits.map(id => `<span class="trait-chip">${game.discovery.discoveredTraits[id] ? '' : '\u{1F512} '}${T.TRAITS_BY_ID[id].name}</span>`).join('');
      body.innerHTML = `<div class="kv"><span class="k">Role</span><span>${sp.tier}</span></div><div style="margin-top:6px">${traitChips}</div>`;
    } else if (kind === 'structure') {
      const site = data.site;
      const type = CM.structures.TYPES[site.type];
      const depth = CM.structures.DEPTHS[site.depth];
      const owner = game.coloniesById[site.colonyId];
      title.textContent = type.name.toUpperCase();
      const integrity = site.integrity == null ? 100 : Math.round(site.integrity);
      let rows = `<div class="kv"><span class="k">Stratum</span><span style="color:${depth.tint}">${depth.name}</span></div>
        <div class="kv"><span class="k">Colony</span><span style="color:${owner ? owner.color : '#889'}">${owner ? owner.name : 'unknown'}</span></div>
        <div class="kv"><span class="k">State</span><span>${site.done ? 'Complete' : Math.round(100 * site.work / site.workNeeded) + '% excavated'}</span></div>`;
      if (site.done) {
        rows += `<div class="kv"><span class="k">Integrity</span><span style="color:${integrity < 60 ? 'var(--danger)' : 'var(--fg)'}">${integrity}%</span></div>`;
        const tier = site.tier || 0;
        const tname = tier ? CM.structures.upgradeName(site.type, tier) : 'Unraised';
        rows += `<div class="kv"><span class="k">Works</span><span>${tname} · T${tier}/${CM.structures.MAX_TIER}</span></div>`;
        if (site.upgradingTo) {
          const need = site.upgradeNeeded || CM.structures.upgradeWorkNeeded(site);
          const pct = Math.round(100 * (site.upgradeWork || 0) / Math.max(1, need));
          rows += `<div class="kv"><span class="k">Raising</span><span>${CM.structures.upgradeName(site.type, site.upgradingTo)} · ${pct}%</span></div>`;
        }
        if (CM.influence) {
          const axis = CM.influence.axisOfType(site.type);
          if (axis) rows += `<div class="kv"><span class="k">Paints</span><span>${CM.influence.AXIS_LABEL[axis]}</span></div>`;
        }
        if (site.crewIds && site.crewIds.length) {
          rows += `<div class="kv"><span class="k">Crew</span><span>${site.crewIds.length} posted</span></div>`;
        }
      }
      if (site.veinId) {
        const vein = (game.world.veins || []).find(v => v.id === site.veinId);
        if (vein) rows += `<div class="kv"><span class="k">Seam remaining</span><span>${Math.round(vein.remaining)}</span></div>`;
      }
      if (site.controlled === false) {
        rows += `<div class="kv"><span class="k">Control</span><span style="color:var(--danger)">Uncontrolled — burrow lost</span></div>`;
      }
      if (site.fortified) {
        const fh = Math.round(100 * (site.fortHp || 0) / (site.fortMax || CM.layers.FORT_HP));
        rows += `<div class="kv"><span class="k">Barrier</span><span>${fh}% — blocks ascent</span></div>`;
      }
      body.innerHTML = rows + `<p style="color:var(--fg-dim);font-size:12.5px;margin-top:10px">${type.blurb}</p>`
        + (site.done && integrity < 100
          ? '<p style="color:var(--warn);font-size:12px;margin-top:6px">Something is chewing at this chamber. Organisms standing in it will drive them off.</p>'
          : '');
      if (site.colonyId === 'player') {
        const acts = document.createElement('div');
        acts.className = 'struct-acts';
        const mk = (label, fn) => {
          const b = document.createElement('button');
          b.className = 'bigbtn secondary';
          b.style.cssText = 'width:100%;margin-top:8px';
          b.textContent = label;
          b.addEventListener('click', fn);
          acts.appendChild(b);
          return b;
        };
        if (site.done) {
          mk(game.buildFromId === site.id ? 'Expanding from here' : 'Expand from here', () => {
            game.buildFromId = game.buildFromId === site.id ? null : site.id;
            toast({ kind: 'system', icon: '\u{1F517}',
              message: game.buildFromId
                ? `New chambers will link to this ${type.name} if they are in reach.`
                : 'Link parent cleared — nearest chamber wins.' });
            showInspect(game, 'structure', { site });
          });
          mk('Rally this layer here', () => {
            CM.structures.setLayerRally(game.core, site.depth, site.x, site.y, site.id);
            toast({ kind: 'system', icon: '\u{1F6A9}', message: `Layer ${site.depth} rally set on ${type.name}. Dig / Defend / Expand will post here.` });
          });
          const up = CM.structures.canUpgrade(game, game.core, site);
          const ub = mk(up.ok
            ? `Raise — ${up.name} (${up.cost.biomass} biomass · ${up.cost.energy} energy)`
            : (site.upgradingTo ? 'Raising…' : ((site.tier || 0) >= CM.structures.MAX_TIER ? 'Masterwork' : up.reason)), () => {
            const res = CM.structures.startUpgrade(game, game.__bus, game.core, site);
            if (!res.ok) toast({ kind: 'warn', icon: '\u{26A0}', message: res.reason });
            else toast({ kind: 'system', icon: '\u{26A1}', message: `${type.name}: ${up.name}. Garrison or Dig to finish it.` });
            showInspect(game, 'structure', { site });
          });
          ub.disabled = !up.ok;
          const sel = CM.orders ? CM.orders.selectedPlayerOrgs(game) : [];
          mk(sel.length
            ? `Assign crew (${sel.length})`
            : (site.crewIds && site.crewIds.length ? 'Clear crew' : 'Assign crew — select first'), () => {
            if (sel.length) {
              CM.structures.assignCrew(game, site, sel.map(o => o.id));
              if (CM.progress) CM.progress.note(game, 'crew');
              toast({ kind: 'system', icon: '\u{1F477}', message: `${sel.length} posted to this ${type.name}. They will dig, raise, or hold it first.` });
            } else {
              CM.structures.clearCrew(game, site);
              toast({ kind: 'system', icon: '\u{1F477}', message: 'Crew cleared.' });
            }
            showInspect(game, 'structure', { site });
          });
          const enc = CM.structures.canEntrench(game, game.core, site);
          const eb = mk(enc.ok
            ? `Entrench (${CM.structures.ENTRENCH_COST.biomass} biomass · ${CM.structures.ENTRENCH_COST.energy} energy)`
            : (site.entrenched ? 'Entrenched' : enc.reason), () => {
            const res = CM.structures.entrench(game, game.__bus, game.core, site);
            if (!res.ok) toast({ kind: 'warn', icon: '\u{26A0}', message: res.reason });
            showInspect(game, 'structure', { site });
          });
          eb.disabled = !enc.ok;
        } else {
          mk(site.priority ? 'Clear dig priority' : 'Dig this first', () => {
            CM.structures.setPriority(game, site, !site.priority);
            toast({ kind: 'system', icon: '\u{26CF}', message: site.priority ? `${type.name} is first in the dig queue.` : 'Priority cleared.' });
            showInspect(game, 'structure', { site });
          });
        }
        mk(site.done ? 'Pull down' : 'Cancel (half refund)', () => {
          const res = CM.structures.demolish(game, game.__bus, game.core, site);
          if (!res.ok) toast({ kind: 'warn', icon: '\u{26A0}', message: res.reason });
          else closeSheet(game, 'inspect-overlay');
        });
        body.appendChild(acts);
      }
      if (site.type === 'SHAFT' && site.done && site.colonyId === 'player' && CM.layers) {
        const btn = document.createElement('button');
        btn.className = 'bigbtn secondary';
        btn.style.cssText = 'width:100%;margin-top:10px';
        const check = CM.layers.canFortify(game, game.core, site);
        btn.disabled = !check.ok;
        btn.textContent = check.ok
          ? `Fortify shaft (${CM.layers.FORTIFY_COST.biomass} biomass · ${CM.layers.FORTIFY_COST.energy} energy)`
          : check.reason;
        btn.addEventListener('click', () => {
          const res = CM.layers.fortify(game, game.__bus, game.core, site);
          if (!res.ok) toast({ kind: 'warn', icon: '\u{26A0}', message: res.reason });
          showInspect(game, 'structure', { site });
        });
        body.appendChild(btn);
      }
    }
    openSheet(game, 'inspect-overlay');
  }

  /* --- excavation ---------------------------------------------------------
   * The build sheet is a palette: tap a chamber, then tap the world to place
   * it. Placement stays live (the banner replaces the sheet) so the player is
   * choosing a spot while watching the actual ground, not a menu. */
  function initBuild(game, bus) {
    el('btn-build-close').addEventListener('click', () => closeSheet(game, 'build-overlay'));
    el('build-banner').addEventListener('click', evt => {
      if (evt.target.dataset && evt.target.dataset.act === 'cancel') setBuildMode(game, null);
    });
  }

  function openBuild(game) {
    if (CM.guide) CM.guide.note(game, 'build');
    openSheet(game, 'build-overlay');
    renderBuild(game);
  }

  function setBuildMode(game, typeKey) {
    game.buildMode = typeKey;
    // Siting a chamber is done against the surface — that is where the tap
    // has to land, so entering build mode surfaces the view.
    if (typeKey) {
      const td = CM.structures.TYPES[typeKey].depth;
      if (td && game.viewDepth !== td) { game.viewDepth = td; renderDepthControls(game); }
    }
    renderBuildBanner(game);
    if (typeKey) closeSheet(game, 'build-overlay');
    else renderBuild(game);
  }

  function renderBuildBanner(game) {
    const banner = el('build-banner');
    if (!game.buildMode) { banner.classList.add('hidden'); return; }
    const type = CM.structures.TYPES[game.buildMode];
    banner.innerHTML = `<span>${type.icon}</span>
      <span class="bb-text">Tap the ground to site a <b>${type.name}</b>.</span>
      <button data-act="cancel">Cancel</button>`;
    banner.classList.remove('hidden');
  }

  function renderBuild(game) {
    const body = el('build-body');
    const colony = game.core;
    const built = CM.structures.completed(game, colony.id);
    const pending = CM.structures.ofColony(game, colony.id).filter(s => !s.done);

    // Best digging stat available tells the player whether they can even
    // attempt the deeper chambers — a refusal has to be explicable.
    let bestDig = 0;
    for (const o of game.organisms) if (o.ownerId === colony.id && o.stats.digging > bestDig) bestDig = o.stats.digging;

    let html = `<div style="font-size:11.5px;color:var(--fg-dim);margin-bottom:8px">
      Network: <b style="color:var(--fg)">${built.length}</b> chambers &middot;
      ${pending.length} under excavation &middot; best digging <b style="color:var(--fg)">${Math.round(bestDig)}</b>
      </div>`;

    /* Grouped by stratum, deepest last. The palette is the clearest place to
     * show that the underground is a ladder rather than a shop: a level you
     * have not reached is listed, greyed, with the one thing that would open
     * it — otherwise the abyssal chambers would simply be invisible and the
     * player would never learn there is anywhere further to go. */
    const deepest = CM.structures.deepestOf(game, colony.id);
    const focus = (game.viewDepth >= 1 ? game.viewDepth : (deepest || 1));
    const filter = game.buildFilter || 'auto';
    html += `<div class="build-filters">
      <button data-bfilter="auto" class="${filter === 'auto' ? 'active' : ''}">This layer</button>
      <button data-bfilter="ladder" class="${filter === 'ladder' ? 'active' : ''}">Spine</button>
      <button data-bfilter="all" class="${filter === 'all' ? 'active' : ''}">All</button>
    </div>`;
    for (let d = 1; d <= CM.structures.MAX_DEPTH; d++) {
      if (filter === 'auto' && d !== focus && d !== 10) continue;
      const info = CM.structures.DEPTHS[d];
      const reached = deepest >= d - 1;   // you can always cut one level below
      html += `<div class="depth-head"${reached ? '' : ' style="opacity:.5"'}>
        <span style="color:${info.tint}">${info.name.toUpperCase()}</span>
        <span>${reached ? `level ${d}` : 'sealed — dig the level above first'}</span></div>`;
      html += '<div class="build-grid">';
      for (const key of CM.structures.TYPE_KEYS) {
        const type = CM.structures.TYPES[key];
        if (type.depth !== d || type.hidden) continue;
        if (filter === 'ladder' && !type.spine && type.key !== 'NEXUS') continue;
        const cost = CM.structures.cost(key);
        const afford = colony.biomass >= cost.biomass && colony.energy >= cost.energy;
        const canDig = bestDig >= type.minDigging;
        let pace = { ok: true };
        if (CM.layers) {
          if (type.standalone && type.key === 'SHAFT') pace = CM.layers.surfaceReady(game, colony);
          else if (type.spine && type.depth > 1) pace = CM.layers.layerReady(game, colony, type.depth - 1);
        }
        const forbidden = !CM.structures.isPermitted(colony, key, d);
        const disabled = !afford || !canDig || !reached || !pace.ok || forbidden;
        let note = `${cost.biomass} biomass · ${cost.energy} energy`;
        if (!reached) note = `Sealed — cut ${CM.structures.DEPTHS[d - 1].name.toLowerCase()} first.`;
        else if (forbidden) note = 'Forbidden on this layer — tap Allow.';
        else if (!pace.ok) note = pace.reason;
        else if (!canDig) note = `Needs digging ${type.minDigging} — none of your organisms can cut this.`;
        else if (!afford) note = `Not enough — needs ${cost.biomass} biomass, ${cost.energy} energy.`;
        else if (type.requiresVein) {
          const known = (game.world.veins || []).filter(v => v.known && !v.claimedBy).length;
          note += known ? ` · ${known} vein${known > 1 ? 's' : ''} found` : ' · no vein found yet';
        }
        html += `<div class="build-wrap">
          <button class="build-card${game.buildMode === key ? ' active' : ''}${forbidden ? ' forbid' : ''}" data-type="${key}" ${disabled ? 'disabled' : ''}>
          <div class="bc-top"><span>${type.icon}</span><span>${type.name}</span></div>
          <div class="bc-cost">${note}</div>
          <div class="bc-blurb">${type.blurb}</div>
        </button>
          <button class="bc-permit" data-forbid="${key}" data-depth="${d}">${forbidden ? 'Allow' : 'Forbid'}</button>
        </div>`;
      }
      html += '</div>';
    }

    if (pending.length) {
      html += '<div class="research-head" style="margin-top:12px">UNDER DIG</div><div class="build-list">';
      for (const site of pending) {
        const type = CM.structures.TYPES[site.type];
        const pct = Math.round(100 * site.work / site.workNeeded);
        html += `<button class="build-row${site.priority ? ' pri' : ''}" data-site="${site.id}">
          <span>${type.icon}</span><span style="flex:0 0 auto">${site.priority ? '★ ' : ''}${type.name}</span>
          <span class="br-bar"><i style="width:${pct}%"></i></span>
          <span style="color:var(--fg-dim)">${pct}%</span></button>`;
      }
      html += '</div>';
    }
    if (game.buildFromId) {
      const parent = CM.structures.all(game).find(s => s.id === game.buildFromId);
      if (parent) {
        html += `<p style="color:var(--accent);font-size:11.5px;margin-top:10px">Expanding from <b>${CM.structures.TYPES[parent.type].name}</b> on L${parent.depth}. New rooms will link to it.</p>`;
      }
    }
    if (!built.length && !pending.length) {
      html += `<p style="color:var(--fg-dim);font-size:11.5px;margin-top:10px">
        Start with an <b>Access Shaft</b> — it is the only chamber that can be dug on open ground.
        Everything else must connect to a finished chamber. Then order your colony to <b>Dig</b>.</p>`;
    }
    body.innerHTML = html;

    body.querySelectorAll('.build-filters button').forEach(btn => {
      btn.addEventListener('click', () => { game.buildFilter = btn.dataset.bfilter; renderBuild(game); });
    });
    body.querySelectorAll('.build-card').forEach(btn => {
      btn.addEventListener('click', () => setBuildMode(game, btn.dataset.type));
    });
    body.querySelectorAll('.bc-permit').forEach(btn => {
      btn.addEventListener('click', () => {
        CM.structures.togglePermit(colony, parseInt(btn.dataset.depth, 10), btn.dataset.forbid);
        renderBuild(game);
      });
    });
    body.querySelectorAll('.build-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const site = CM.structures.all(game).find(s => s.id === btn.dataset.site);
        if (!site) return;
        CM.structures.setPriority(game, site, !site.priority);
        renderBuild(game);
      });
    });
  }

  // -- world / colony panel -------------------------------------------------
  /* Refreshed on a slow cadence rather than per frame: it is a wall of text
   * whose numbers move slowly, and rebuilding it 60 times a second would cost
   * more than the whole simulation. */
  function overhuntLines(game) {
    if (!CM.reputation || !game.rep || !game.rep.edges) return '';
    const lines = [];
    for (const k in game.rep.edges) {
      if (k.indexOf('player>wild:') !== 0) continue;
      if (game.rep.edges[k].favor >= -0.4) continue;
      const spId = k.slice('player>wild:'.length);
      const sp = T.WILD_BY_ID[spId];
      const name = sp ? sp.name : spId;
      lines.push(`<div class="kv"><span class="k">Avoids</span><span style="color:var(--warn)">${name} avoids you.</span></div>`);
    }
    return lines.join('');
  }

  function renderWorldPanel(game) {
    const region = CM.world.regionAt(game.world, game.camera.x, game.camera.y);
    const biome = CM.world.biomeInfoAt(game.world, game.camera.x, game.camera.y);
    const temp = CM.world.tempAt(game.world, game.camera.x, game.camera.y);
    const hazard = CM.world.hazardAt(game.world, game.camera.x, game.camera.y);
    const hazardInfo = hazard ? CM.world.HAZARD_INFO[hazard] : null;

    const mood = CM.sentiment ? CM.sentiment.feel(game) : null;
    const eco = CM.economy ? CM.economy.ensure(game) : null;
    el('world-readout').innerHTML =
      `<div class="kv"><span class="k">Region</span><span>${region && region.id ? region.name : (biome && biome.name) || 'Uncharted'}</span></div>
       <div class="kv"><span class="k">Terrain</span><span>${biome.name}</span></div>
       <div class="kv"><span class="k">Temperature</span><span>${Math.round(temp)}&deg;C</span></div>
       <div class="kv"><span class="k">Climate</span><span>${CM.climate.describe(game)}</span></div>
       ${hazardInfo ? `<div class="kv"><span class="k">Hazard</span><span style="color:var(--danger)">${hazardInfo.name}</span></div>` : ''}
       ${mood ? `<div class="kv"><span class="k">Mood</span><span title="${mood.mood} · ${mood.flavor}">${mood.label}</span></div>` : ''}
       ${eco ? `<div class="eco-strip">
         <span title="ATT: earned while THINK, spent on orders.">ATT ${eco.attention.toFixed(1)}</span>
         <span title="FAV: gifts and peaceful contact.">FAV ${eco.favor.toFixed(1)}</span>
         <span title="GOS: sights and extracts.">GOS ${eco.gossip.toFixed(1)}</span>
         <span title="SCR: colony deaths; feeds grief.">SCR ${eco.scars.toFixed(0)}</span>
       </div>` : ''}
       ${overhuntLines(game)}
       ${renderConstellation(game)}`;

    const counts = CM.colony.territoryCounts(game);
    const roster = el('colony-roster');
    roster.innerHTML = '<div class="research-head">COREMINDS</div>';
    for (const colony of game.colonies) {
      const row = document.createElement('button');
      row.className = 'colony-row' + (colony.alive ? '' : ' dead');
      const strategy = CM.colony.strategyOf(colony);
      const known = Object.keys(colony.discovered).length;
      row.innerHTML =
        `<span class="swatch" style="background:${colony.color}"></span>
         <span class="cbody">
           <span class="cname">${colony.name}${colony.isPlayer ? ' <em>(you)</em>' : ''}</span>
           <span class="cmeta">${colony.alive
             ? `${strategy.label} &middot; pop ${colony.pop} &middot; ${known} traits &middot; ${counts[colony.id] || 0} territory`
             : 'collapsed'}</span>
         </span>
         ${colony.alive && colony.integrity < 100 ? `<span class="cint">${Math.round(colony.integrity)}%</span>` : ''}`;
      row.addEventListener('click', () => {
        CM.render.focusOn(game, colony.x, colony.y, 14);
        showInspect(game, 'colony', { colony });
      });
      roster.appendChild(row);
    }
    if (CM.progress && game.progress) {
      const got = Object.keys(game.progress.achievements || {}).length;
      const mut = Object.keys(game.progress.mutations || {}).length;
      const block = document.createElement('div');
      block.className = 'ach-block';
      block.innerHTML = `<div class="research-head" style="margin-top:12px">PROGRESS · ${got}/${CM.progress.ACHIEVEMENTS.length} · ${mut}/30 mutations</div>`
        + CM.progress.ACHIEVEMENTS.map(a => {
          const on = !!game.progress.achievements[a.id];
          return `<div class="ach-row${on ? ' on' : ''}">${a.icon} <b>${a.name}</b> — ${a.blurb}</div>`;
        }).join('');
      roster.appendChild(block);
    }
  }

  // -- per-frame refresh (cheap: text only) --------------------------------
  function render(game) {
    const ui = game.ui;
    if (game.guide && game.guide.on && !game.guide.skipped) renderGuideCard(game);
    ui.statAcc = (ui.statAcc || 0) + 1;
    if (ui.statAcc >= 6) {
      ui.statAcc = 0;
      el('stat-biomass').querySelector('span').textContent = Math.floor(game.core.biomass) + '/' + game.core.biomassCap;
      el('stat-energy').querySelector('span').textContent = Math.floor(game.core.energy);
      el('stat-pop').querySelector('span').textContent = game.stats.playerPop;
      el('stat-climate').querySelector('span').textContent = CM.climate.describe(game);
      paintSpeed(game);
      if (game.hero && game.hero.on) renderHero(game);
      dockSelection();
    }

    // The world panel is text-heavy and slow-moving; refresh it about twice a
    // second and only while it is actually the visible tab.
    ui.worldPanelAcc = (ui.worldPanelAcc || 0) + 1;
    if (ui.worldPanelAcc >= 30 && el('panel-world').classList.contains('active')) {
      ui.worldPanelAcc = 0;
      renderWorldPanel(game);
    }
    // The depth strip and sanctum meter change on the timescale of a chamber
    // being finished, so twice a second is plenty.
    ui.depthAcc = (ui.depthAcc || 0) + 1;
    if (ui.depthAcc >= 30) {
      ui.depthAcc = 0;
      renderDepthControls(game);
      renderSanctumMeter(game);
      renderLayerCard(game);
      renderQuestCard(game);
    }
  }

  CM.ui = { init, render, renderSelection, renderFeed, renderWorldPanel, updateBadges, showInspect, toast, switchTab,
    openSheet, closeSheet, anySheetOpen, openBuild, renderBuild, renderBuildBanner,
    setViewDepth, renderDepthControls, renderSanctumMeter, renderOrderBar, renderLayerCard, renderQuestCard, showOutcome,
    renderHero, dockSelection };
})(window.CM = window.CM || {});
