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
    EXPLORE: { icon: '\u{1F9ED}', label: 'Explore' },
    GATHER: { icon: '\u{1F33F}', label: 'Gather' },
    HUNT: { icon: '\u{1F3F9}', label: 'Hunt' },
    DEFEND: { icon: '\u{1F6E1}', label: 'Defend' },
    REPRODUCE: { icon: '\u{1F95A}', label: 'Reproduce' },
    INVESTIGATE: { icon: '\u{1F50D}', label: 'Investigate' },
    RETURN: { icon: '\u{1F3E0}', label: 'Return' }
  };

  const STAT_ROWS = [
    ['health', 'Health'], ['energyMax', 'Energy'], ['speed', 'Speed'], ['size', 'Size'],
    ['vision', 'Vision'], ['sense_radius', 'Sense'], ['attack', 'Attack'], ['defense', 'Defense'],
    ['armor', 'Armor'], ['venom', 'Venom'], ['camouflage', 'Camo'], ['digging', 'Dig'],
    ['temperature_tolerance', 'Temp.Tol'], ['reproduction_rate', 'Repro'], ['metabolism', 'Metab.']
  ];
  const STAT_MAXES = { health: 140, energyMax: 100, speed: 60, size: 40, vision: 70, sense_radius: 45, attack: 70, defense: 70, armor: 45, venom: 45, camouflage: 45, digging: 55, temperature_tolerance: 55, reproduction_rate: 1.2, metabolism: 40 };

  function el(id) { return document.getElementById(id); }
  function fmt1(n) { return (Math.round(n * 10) / 10).toString(); }

  function init(game, bus) {
    const ui = {
      dnaBadgeSeen: 0, unreadAnalyze: 0, previewRaf: null, previewAngle: 0,
      inspectTarget: null, canvas: el('world-canvas')
    };
    game.ui = ui;

    initTabs(game);
    initDirectiveBar(game, bus);
    initCamControls(game);
    initDesigner(game, bus);
    initInspect(game);

    el('btn-speed').addEventListener('click', () => {
      game.speed = game.speed >= 3 ? 1 : (game.speed === 1 ? 2 : 3);
      el('btn-speed').textContent = game.speed + 'x';
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
        if (tab === 'analyze') { game.ui.unreadAnalyze = 0; renderFeed(game); updateBadges(game); }
      });
    });
  }

  // -- directive bar ----------------------------------------------------------
  function initDirectiveBar(game, bus) {
    const bar = el('directive-bar');
    bar.innerHTML = '';
    for (const d of CM.organism.DIRECTIVES) {
      const meta = DIRECTIVE_META[d];
      const btn = document.createElement('button');
      btn.className = 'dirbtn'; btn.dataset.directive = d;
      btn.innerHTML = `<i>${meta.icon}</i>${meta.label}`;
      btn.addEventListener('click', () => {
        const scope = CORE.issueDirective(game, d);
        const who = scope === 'selected' ? (game.byId[game.selection] || {}).name : 'Your colony';
        toast({ kind: 'system', icon: meta.icon, message: `${who} directed to ${meta.label}.` });
        renderDirectiveBar(game);
        renderSelection(game);
      });
      bar.appendChild(btn);
    }
    renderDirectiveBar(game);
  }
  function renderDirectiveBar(game) {
    const active = game.selection && game.byId[game.selection] ? game.byId[game.selection].directive : game.globalDirective;
    document.querySelectorAll('#directive-bar .dirbtn').forEach(b => b.classList.toggle('active', b.dataset.directive === active));
  }

  // -- camera controls ---------------------------------------------------
  function initCamControls(game) {
    el('btn-focus-core').addEventListener('click', () => CM.input.focusCore(game));
    el('btn-zoom-in').addEventListener('click', () => CM.input.zoomBy(game, 1.35));
    el('btn-zoom-out').addEventListener('click', () => CM.input.zoomBy(game, 1 / 1.35));
  }

  // -- selection panel ------------------------------------------------------
  function renderSelection(game) {
    const panel = el('selection-panel');
    const summary = el('selection-summary');
    const org = game.selection && game.byId[game.selection];
    if (!org) {
      panel.classList.add('hidden');
      summary.textContent = 'Tap an organism to select it, or issue a directive to your whole colony.';
      renderDirectiveBar(game);
      return;
    }
    panel.classList.remove('hidden');
    const hf = Math.round(100 * org.health / org.stats.health);
    const ef = Math.round(100 * org.energy / org.stats.energyMax);
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <b>${org.name}</b><span style="color:var(--fg-dim);font-size:11px">${org.ownerId === 'player' ? 'Gen ' + org.generation : org.name}</span></div>
      <div style="font-size:11.5px;color:var(--fg-dim);margin-top:2px">${org.state} &middot; HP ${hf}% &middot; Energy ${ef}%</div>`;
    summary.textContent = `${org.name} selected — directives below apply to it only.`;
    renderDirectiveBar(game);
  }

  // -- events / feed / toasts ---------------------------------------------
  function onEvent(game, evt) {
    game.ui.unreadAnalyze++;
    updateBadges(game);
    if (evt.kind === 'discovery' || evt.kind === 'death' || evt.kind === 'warn') toast(evt);
    if (el('panel-analyze').classList.contains('active')) renderFeed(game);
  }

  function toast(evt) {
    const layer = el('toast-layer');
    const div = document.createElement('div');
    div.className = 'toast' + (evt.kind === 'death' ? ' danger' : evt.kind === 'warn' ? ' warn' : '');
    div.textContent = (evt.icon ? evt.icon + ' ' : '') + evt.message;
    layer.appendChild(div);
    setTimeout(() => { div.style.transition = 'opacity .4s'; div.style.opacity = '0'; setTimeout(() => div.remove(), 400); }, 3600);
    while (layer.children.length > 3) layer.removeChild(layer.firstChild);
  }

  function renderFeed(game) {
    const feed = el('event-feed');
    const events = game.discovery.events;
    if (!events.length) { feed.innerHTML = '<div class="event-empty">Nothing observed yet. Send an organism to EXPLORE.</div>'; return; }
    feed.innerHTML = '';
    for (const evt of events.slice(0, 80)) {
      const row = document.createElement('button');
      row.className = 'event-row' + (evt.kind === 'discovery' ? ' discovery' : evt.kind === 'death' ? ' death' : evt.kind === 'warn' ? ' warn' : '');
      const mins = Math.floor(evt.time / 60), secs = Math.floor(evt.time % 60);
      row.innerHTML = `<div class="ico">${evt.icon || '•'}</div><div class="body"><div class="msg">${evt.message}</div><div class="time">t+${mins}:${String(secs).padStart(2, '0')}</div></div>`;
      row.addEventListener('click', () => onEventClick(game, evt));
      feed.appendChild(row);
    }
  }

  function onEventClick(game, evt) {
    if (evt.x != null && evt.y != null) CM.render.focusOn(game, evt.x, evt.y, 22);
    if (evt.traitId) { openDesigner(game); return; }
    if (evt.orgId && game.byId[evt.orgId]) { CORE.selectOrganism(game, evt.orgId); renderSelection(game); switchTab('explore'); return; }
    if (evt.speciesId) showInspect(game, 'species', { speciesId: evt.speciesId });
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  }

  function updateBadges(game) {
    const ab = el('badge-analyze');
    if (game.ui.unreadAnalyze > 0) { ab.textContent = Math.min(99, game.ui.unreadAnalyze); ab.classList.remove('hidden'); }
    else ab.classList.add('hidden');

    const discovered = Object.keys(game.discovery.discoveredTraits).length;
    const db = el('badge-dna');
    if (discovered > game.ui.dnaBadgeSeen) { db.classList.remove('hidden'); db.classList.add('warn'); }
    else db.classList.add('hidden');
  }

  // -- genome designer -----------------------------------------------------
  function initDesigner(game, bus) {
    el('btn-designer-close').addEventListener('click', () => closeDesigner(game));
    el('btn-create-organism').addEventListener('click', () => {
      const org = CORE.createOrganismFromDraft(game, bus);
      if (org) { renderDesignerCost(game); renderDesignerStats(game); toast({ kind: 'system', icon: '\u{1F9EA}', message: `${org.name} deployed near the Core.` }); }
    });
  }

  function openDesigner(game) {
    el('designer-overlay').classList.remove('hidden');
    game.ui.dnaBadgeSeen = Object.keys(game.discovery.discoveredTraits).length;
    updateBadges(game);
    renderDesignerSlots(game);
    renderDesignerStats(game);
    renderDesignerCost(game);
    startPreviewLoop(game);
  }
  function closeDesigner(game) {
    el('designer-overlay').classList.add('hidden');
    stopPreviewLoop(game);
  }

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
      for (const t of T.TRAITS_BY_CATEGORY[cat]) {
        const opt = document.createElement('option');
        opt.value = t.id;
        const known = !!game.discovery.discoveredTraits[t.id];
        opt.textContent = known ? t.name : '\u{1F512} ' + t.name;
        opt.disabled = !known;
        if (t.id === current) opt.selected = true;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        CORE.setDesignSlot(game, cat, select.value || null);
        renderDesignerStats(game); renderDesignerCost(game); renderDesignerSlots(game);
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
      const deltaCls = delta > 0.01 ? 'pos' : delta < -0.01 ? 'neg' : '';
      row.innerHTML = `<div class="label">${label}</div><div class="bar"><i style="width:${pct}%"></i></div><div class="val">${fmt1(val)}</div><div class="delta ${deltaCls}">${deltaTxt}</div>`;
      wrap.appendChild(row);
    }
  }

  function renderDesignerCost(game) {
    const cost = CORE.draftCost(game);
    const afford = CORE.canAfford(game, cost);
    el('designer-cost').innerHTML = `Cost: <span class="${game.core.biomass >= cost.biomass ? 'ok' : 'bad'}">${cost.biomass} biomass</span> &middot; <span class="${game.core.energy >= cost.energy ? 'ok' : 'bad'}">${cost.energy} energy</span>`;
    el('btn-create-organism').disabled = !afford;
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
      const previewOrg = { traits, stats, health: stats.health, heading: game.ui.previewAngle, color: '#33e6b0', selected: false };
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
    el('btn-inspect-close').addEventListener('click', () => el('inspect-overlay').classList.add('hidden'));
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
        el('inspect-overlay').classList.add('hidden');
      });
    } else if (kind === 'core') {
      title.textContent = 'COREMIND';
      body.innerHTML = `<div class="kv"><span class="k">Biomass</span><span>${Math.floor(game.core.biomass)}</span></div>
        <div class="kv"><span class="k">Energy</span><span>${Math.floor(game.core.energy)}</span></div>
        <div class="kv"><span class="k">Population</span><span>${game.stats.playerPop}</span></div>
        <p style="color:var(--fg-dim);font-size:12.5px;margin-top:10px">Every organism you deploy is grown from biomass and energy gathered by the colony. Send organisms to GATHER to keep the Core supplied.</p>`;
    } else if (kind === 'species') {
      const sp = T.WILD_BY_ID[data.speciesId];
      title.textContent = sp.name.toUpperCase();
      const traitChips = sp.traits.map(id => `<span class="trait-chip">${game.discovery.discoveredTraits[id] ? '' : '\u{1F512} '}${T.TRAITS_BY_ID[id].name}</span>`).join('');
      body.innerHTML = `<div class="kv"><span class="k">Role</span><span>${sp.tier}</span></div><div style="margin-top:6px">${traitChips}</div>`;
    }
    el('inspect-overlay').classList.remove('hidden');
  }

  // -- per-frame refresh (cheap: text only) --------------------------------
  function render(game) {
    el('stat-biomass').querySelector('span').textContent = K.fmt(game.core.biomass);
    el('stat-energy').querySelector('span').textContent = K.fmt(game.core.energy);
    el('stat-pop').querySelector('span').textContent = game.stats.playerPop + game.stats.herbivorePop + game.stats.predatorPop;
  }

  CM.ui = { init, render, renderSelection, renderFeed, updateBadges, showInspect, toast, switchTab };
})(window.CM = window.CM || {});
