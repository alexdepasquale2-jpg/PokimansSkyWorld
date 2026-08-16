/* Resonant — DOM layer: readouts, drawers, toasts.
 *
 * Canvas draws the world and the instruments; DOM handles text, lists and
 * anything scrollable, because canvas text at arbitrary sizes on arbitrary DPRs
 * is a losing fight and native scrolling is better than any reimplementation.
 *
 * The split is strict: nothing here reads the pointer, and nothing in input.js
 * writes text. The one thing DOM *does* own that matters for feel is that
 * numeric readouts are re-rendered only when they change, and changed numbers
 * get a one-shot class that pops them — an unchanging number should be
 * absolutely still, so that a changing one draws the eye.
 */
(function (RS) {
  'use strict';
  const { fmt, clamp01, hsl } = RS.core;

  const el = Object.create(null);
  const lastText = Object.create(null);
  let drawerOpen = null;

  function $(id) { return document.getElementById(id); }

  function init(game, bus) {
    for (const id of ['insight-val', 'rate-val', 'gnosis-val', 'progress-fill', 'progress-pct',
      'tier-name', 'tier-sci', 'layer-name', 'layer-rules', 'objective',
      'toasts', 'readout', 'drawer', 'drawer-body', 'drawer-title',
      'btn-upgrades', 'btn-codex', 'btn-settings', 'btn-drawer-close', 'beat-hint',
      'btn-world', 'btn-vessels', 'scene-tag', 'body-bar', 'btn-contact', 'contact-hint',
      'btn-guide', 'btn-paths']) {
      el[id] = $(id);
    }

    el['btn-upgrades'].addEventListener('click', () => toggleDrawer(game, bus, 'upgrades'));
    el['btn-codex'].addEventListener('click', () => toggleDrawer(game, bus, 'codex'));
    el['btn-settings'].addEventListener('click', () => toggleDrawer(game, bus, 'settings'));
    el['btn-world'].addEventListener('click', () => toggleDrawer(game, bus, 'world'));
    el['btn-vessels'].addEventListener('click', () => toggleDrawer(game, bus, 'vessels'));
    el['btn-contact'].addEventListener('click', () => toggleDrawer(game, bus, 'contact'));
    el['btn-guide'].addEventListener('click', () => toggleDrawer(game, bus, 'guide'));
    el['btn-paths'].addEventListener('click', () => toggleDrawer(game, bus, 'paths'));
    el['btn-drawer-close'].addEventListener('click', () => closeDrawer());

    /* Delegated, because the drawer body is rebuilt wholesale on every open and
     * per-node listeners would leak. */
    el['drawer-body'].addEventListener('click', ev => {
      const btn = ev.target.closest('[data-buy]');
      if (btn) {
        const [dialId, kind] = btn.dataset.buy.split(':');
        const res = RS.game.tryUpgrade(game, bus, dialId, kind);
        if (!res.ok) bus.emit('ui:deny', res);
        renderDrawer(game, bus);
        return;
      }
      const tog = ev.target.closest('[data-toggle]');
      if (tog) {
        const k = tog.dataset.toggle;
        game.settings[k] = !game.settings[k];
        bus.emit('settings', { key: k, value: game.settings[k] });
        renderDrawer(game, bus);
        return;
      }
      const res = ev.target.closest('[data-research]');
      if (res) {
        const r = RS.influence.tryResearch(game, bus, res.dataset.research);
        if (!r.ok) bus.emit('ui:deny', r);
        renderDrawer(game, bus);
        return;
      }
      const emb = ev.target.closest('[data-embark]');
      if (emb) {
        const id = emb.dataset.embark;
        const r = id === '_off' ? (RS.scenes.disembark(game, bus), { ok: true })
          : RS.scenes.embark(game, bus, id);
        if (!r.ok) bus.emit('ui:deny', { reason: 'blocked', message: r.reason });
        renderDrawer(game, bus);
        return;
      }
      const st = ev.target.closest('[data-build]');
      if (st) {
        const r = RS.influence.place(game, bus, game.scene.planet, st.dataset.build);
        if (!r.ok) bus.emit('ui:deny', { reason: 'blocked', message: r.reason });
        renderDrawer(game, bus);
        return;
      }
      const con = ev.target.closest('[data-contact]');
      if (con) {
        const c = game.scene.contact;
        if (c) {
          const r = RS.contact.act(game, bus, c.planet, c.civ, con.dataset.contact);
          if (!r.ok) bus.emit('ui:deny', { reason: 'blocked', message: r.reason });
          if (r.closed) closeDrawer(); else renderDrawer(game, bus);
        }
        return;
      }
      const trav = ev.target.closest('[data-travel]');
      if (trav) {
        const st = game.galaxy.stars.find(x => x.key === trav.dataset.travel);
        const r = RS.galaxy.travelTo(game, bus, st);
        if (!r.ok) bus.emit('ui:deny', { reason: 'blocked', message: r.reason });
        renderDrawer(game, bus);
        return;
      }
      const act = ev.target.closest('[data-act]');
      if (act) {
        const kind = act.dataset.act;
        const r = kind === 'extract' ? RS.scenes.extract(game, bus) : RS.scenes.sell(game, bus);
        if (!r.ok) bus.emit('ui:deny', { reason: 'blocked', message: r.reason });
        renderDrawer(game, bus);
      }
    });
  }

  // --- text helpers --------------------------------------------------------

  /* Only touch the DOM when the string actually changed, and flag the change
   * so CSS can pop it. */
  function setText(id, text, popClass) {
    const node = el[id];
    if (!node || lastText[id] === text) return false;
    lastText[id] = text;
    node.textContent = text;
    if (popClass) {
      node.classList.remove(popClass);
      /* Force reflow so re-adding the class restarts the animation. */
      void node.offsetWidth;
      node.classList.add(popClass);
    }
    return true;
  }

  // --- per-frame -----------------------------------------------------------

  function render(game) {
    setText('insight-val', fmt(game.insight), 'pop');
    setText('rate-val', '+' + fmt(game.passiveRate) + '/s');
    setText('gnosis-val', String(RS.fractal.totalGnosis(game)));

    const p = RS.game.progress(game);
    el['progress-fill'].style.width = (p * 100).toFixed(2) + '%';
    setText('progress-pct', (p * 100).toFixed(1) + '%');

    const D = game.dials;
    const tier = RS.cosmos.tierAt(D.space.value);
    setText('tier-name', tier.name.toUpperCase());
    setText('tier-sci', game.settings.showSci
      ? tier.sci
      : (tier.logM == null ? 'Tegmark Level ' + tier.level : RS.core.fmtMetres(tier.logM)));

    /* The second context line describes whatever is actually in front of the
     * player. Showing the reality layer's rules while looking at a star map
     * was simply false information in the most prominent text slot on screen. */
    const focus = RS.dials.focusOf(D.frequency);
    const band = RS.spectrum.BANDS[game.field.bandIndex];
    const ghost = RS.spectrum.isGhost(band, focus);
    const sc = game.scene;

    if (sc.kind === 'galaxy') {
      const inReach = game.galaxy.stars.filter(x => x.inReach).length;
      const reachLy = (RS.influence.reachRadius(game) * RS.galaxy.LY_PER_SECTOR).toFixed(0);
      setText('layer-name', 'SECTOR ' + game.galaxy.sx + ', ' + game.galaxy.sy);
      setText('layer-rules', game.galaxy.stars.length + ' stars in view · ' + inReach +
        ' within your ' + reachLy + ' ly field · green ring = life, amber = inhabited');
      el['layer-name'].style.color = hsl(190, 0.75, 0.72);
    } else if (sc.kind === 'system' && sc.system) {
      const st = sc.system.primary;
      setText('layer-name', sc.system.name.toUpperCase());
      setText('layer-rules', st.cls.c + st.sub + ' ' + st.cls.name + ' · ' +
        sc.system.bodies.filter(b => b.kind === 'planet').length + ' planets · habitable zone ' +
        sc.system.hz.inner.toFixed(2) + '–' + sc.system.hz.outer.toFixed(2) + ' AU');
      el['layer-name'].style.color = hsl(st.cls.hue, 0.8, 0.72);
    } else if (sc.kind === 'planet' && sc.planet) {
      const p = sc.planet;
      setText('layer-name', p.name.toUpperCase());
      setText('layer-rules', p.type.name + ' · ' + Math.round(p.surfaceTemp) + ' K · ' +
        p.gravity.toFixed(2) + ' g · ' +
        (p.pressure < 0.01 ? 'no atmosphere' : p.pressure.toFixed(2) + ' bar') +
        (p.biosphere ? ' · ' + p.biosphere.stage.name : ''));
      el['layer-name'].style.color = hsl(p.type.hue, 0.75, 0.72);
    } else {
      setText('layer-name', band.name.toUpperCase() + (ghost ? ' · GHOST' : ''));
      setText('layer-rules', ghost
        ? 'Beyond your focus. Visible, not holdable. Buy φ FOCUS to make it cohere.'
        : band.rules);
      el['layer-name'].style.color = hsl(band.hue, ghost ? 0.15 : band.sat, 0.72);
    }

    const obj = RS.game.sceneObjective(game);
    setText('objective', obj.text);

    /* Scene tag: which of the three worlds the player is in, and — critically —
     * which mode the dials are in, because that is the one thing they must
     * never be wrong about. */
    const s = game.scene;
    const modeLabel = game.inhabiting ? 'PILOTING' : 'OBSERVING';
    setText('scene-tag', s.kind.toUpperCase() + ' · ' + modeLabel);
    el['scene-tag'].style.color = game.inhabiting ? '#fca5a5' : '#7dd3fc';

    renderBodyBar(game);
    renderContactHint(game);
    renderReadout(game);
    renderBeatHint(game);
  }

  /* A civilisation in earshot is the rarest thing in the game, so it gets a
   * permanent, unmissable line of its own the moment one is detectable —
   * finding one and not realising it would be the worst failure this game
   * could have. */
  function renderContactHint(game) {
    const c = game.scene.contact;
    const btn = el['btn-contact'];
    const hint = el['contact-hint'];
    if (!c) {
      if (btn.dataset.on !== '0') { btn.dataset.on = '0'; btn.classList.remove('live'); }
      hint.style.opacity = '0';
      return;
    }
    btn.dataset.on = '1';
    btn.classList.add('live');
    const state = RS.contact.stateOf(game, c.planet, c.civ, c.lock);
    const open = state === RS.contact.STATES.open || state === RS.contact.STATES.warm;
    btn.style.color = hsl(state.hue, 0.85, 0.7);
    hint.style.opacity = '1';
    hint.style.color = hsl(state.hue, 0.85, 0.72);
    setText('contact-hint', open
      ? '◉ ' + c.civ.name + ' — channel open'
      : '◉ ' + c.civ.name + ' — carrier at φ' + c.lock.carrier.phi.toFixed(1) +
        ' (' + (c.lock.total * 100).toFixed(0) + '% lock)');
  }

  /* The body bar only exists while embodied, and it shows the three things a
   * pilot actually needs: charge, hold, and — when riding a mind — how much of
   * that creature is currently you. */
  function renderBodyBar(game) {
    const bar = el['body-bar'];
    if (!game.inhabiting) {
      if (bar.dataset.on !== '0') { bar.dataset.on = '0'; bar.innerHTML = ''; bar.style.opacity = '0'; }
      return;
    }
    bar.dataset.on = '1';
    bar.style.opacity = '1';
    const b = game.body;
    const arch = RS.vessel.archOf(b);
    const cf = clamp01(b.charge / arch.capacity);
    const env = RS.vessel.environmentFor(game);
    const blocked = RS.vessel.canOperate(arch, env);
    const poss = b.mindState ? b.mindState.possession : null;

    bar.innerHTML =
      '<span class="bb-glyph" style="color:' + hsl(arch.hue, 0.8, 0.7) + '">' + arch.glyph + '</span>' +
      '<span class="bb-name">' + arch.name + '</span>' +
      '<span class="bb-meter" title="charge"><b style="width:' + (cf * 100).toFixed(0) +
        '%;background:' + hsl(cf > 0.25 ? 160 : 0, 0.85, 0.6) + '"></b></span>' +
      (b.holdMass > 0 ? '<span class="bb-tag">' + fmt(b.holdMass) + 'u</span>' : '') +
      (poss != null ? '<span class="bb-tag" style="color:#f0abfc" title="how much of this mind is you">' +
        (poss * 100).toFixed(0) + '% you</span>' : '') +
      (blocked ? '<span class="bb-warn">' + blocked + '</span>' : '');
  }

  /* The node readout. Names the thing, names its essence, and — the part that
   * matters — says which dial is wrong and in which direction. A four-axis
   * lock is only fair if the player can diagnose a miss. */
  function renderReadout(game) {
    const node = el['readout'];

    /* The node readout belongs to the attunement field. In an embodied scene
     * the same slot shows what is under the player instead — same position,
     * same role, different world. */
    if (game.scene.kind !== 'field') {
      renderSceneReadout(game, node);
      return;
    }

    const n = game.focusNode;
    if (!n || n.align < 0.04) {
      if (node.dataset.empty !== '1') {
        node.dataset.empty = '1';
        node.innerHTML = '<div class="ro-empty">Sweep φ to resolve something.</div>';
      }
      return;
    }
    node.dataset.empty = '0';
    const man = n.man;
    const p = n.alignParts;
    const resolved = n.resolved > 0.45;
    const gn = RS.fractal.gnosisOf(game, man.essence.id);

    const axes = [
      { k: 'φ', v: p.f, d: p.dem.freq, err: p.fd, hue: 187 },
      { k: 'Σ', v: p.s, d: p.dem.tier, err: p.sd, hue: 338 },
      { k: 'Δ', v: p.p, d: p.dem.phase, err: p.pd, hue: 268 },
      { k: 'τ', v: p.r, d: p.dem.rate, err: p.rd, hue: 43 }
    ];
    let bars = '';
    for (const a of axes) {
      if (a.d <= 0.02) {
        bars += '<span class="ax off" title="not demanded by this layer">' + a.k + '</span>';
        continue;
      }
      const good = a.v > 0.86;
      /* An arrow is worth more than a percentage: it says what to *do*. */
      const dir = Math.abs(a.err) < 0.25 ? '·' : (a.err > 0 ? '↓' : '↑');
      bars += '<span class="ax' + (good ? ' good' : '') + '" style="--h:' + a.hue + '">' +
        a.k + '<b style="width:' + (clamp01(a.v) * 100).toFixed(0) + '%"></b><i>' + dir + '</i></span>';
    }

    const title = resolved ? man.name : 'Unresolved';
    const sub = resolved
      ? man.essence.name + (gn ? ' · gnosis ' + gn : '') + (man.rarity ? ' · ' + '★'.repeat(man.rarity) : '')
      : 'Hold closer to resolve';
    const blocked = n.blocked && n.antecedent
      ? '<div class="ro-block">Blocked — requires ' + n.antecedent.name + ' crystallised first</div>' : '';

    node.innerHTML =
      '<div class="ro-head"><span class="ro-glyph" style="color:' + hsl(man.hue, 0.8, 0.7) + '">' +
        (resolved ? man.glyph : '?') + '</span>' +
      '<span class="ro-title">' + title + '</span></div>' +
      '<div class="ro-sub">' + sub + '</div>' +
      '<div class="ro-axes">' + bars + '</div>' + blocked;
  }

  /* What is under the player right now, in the embodied scenes. */
  function renderSceneReadout(game, node) {
    const s = game.scene;
    node.dataset.empty = '0';
    if (s.kind === 'galaxy') { renderGalaxyReadout(game, node); return; }
    if (s.kind === 'system' && s.system) {
      const p = s.planet;
      const prim = s.system.primary;
      node.innerHTML =
        '<div class="ro-head"><span class="ro-glyph" style="color:' + hsl(prim.cls.hue, 0.8, 0.7) + '">&#9673;</span>' +
        '<span class="ro-title">' + s.system.name + '</span></div>' +
        '<div class="ro-sub">' + prim.cls.c + prim.sub + ' ' + prim.cls.name + ' &middot; ' +
        s.system.bodies.length + ' bodies &middot; epoch ' + (s.t >= 0 ? '+' : '') + fmt(s.t) + ' yr</div>' +
        (p ? '<div class="ro-sub" style="margin-top:4px;color:' + hsl(p.type.hue, 0.7, 0.68) + '">' +
          p.name + ' &mdash; ' + p.type.name +
          (p.biosphere ? ' &middot; ' + p.biosphere.stage.name : '') +
          (p.civ ? ' &middot; ' + p.civ.tier.name : '') + '</div>' : '');
      return;
    }
    if (s.kind === 'planet' && s.planet) {
      const p = s.planet;
      const su = s.surface;
      node.innerHTML =
        '<div class="ro-head"><span class="ro-glyph" style="color:' + hsl(p.type.hue, 0.8, 0.7) + '">&#9679;</span>' +
        '<span class="ro-title">' + p.name + '</span></div>' +
        '<div class="ro-sub">' + p.type.name + ' &middot; ' + p.gravity.toFixed(2) + ' g &middot; ' +
        (p.pressure < 0.01 ? 'no air' : p.pressure.toFixed(2) + ' bar') + '</div>' +
        (su ? '<div class="ro-sub" style="margin-top:4px;color:' + hsl(su.biome.hue, 0.6, 0.7) + '">' +
          su.biome.name + ' &middot; ' + Math.round(su.T) + ' K &middot; lat ' +
          (su.lat * 57.3).toFixed(0) + '&deg;</div>' : '') +
        (s.agents.length ? '<div class="ro-sub" style="margin-top:4px">' + s.agents.length +
          ' minds nearby</div>' : '');
      return;
    }
    node.innerHTML = '<div class="ro-empty">Nowhere in particular.</div>';
  }

  /* A one-line hint that teaches the beat-tuning mechanic without a tutorial
   * box, shown only while the player is close enough for the beat to be
   * audible and slow enough to notice. */
  function renderBeatHint(game) {
    const D = game.dials.frequency;
    const band = RS.spectrum.nearestBand(D.value);
    const err = Math.abs(D.value - band.centre);
    const hz = err * RS.audio.BEAT_SCALE;
    const show = err < band.width * 2.2 && err > 0.02;
    el['beat-hint'].style.opacity = show ? '1' : '0';
    if (show) setText('beat-hint', 'beat ' + hz.toFixed(2) + ' Hz — slow it to zero');
  }

  // --- toasts --------------------------------------------------------------

  function toast(opts) {
    const t = document.createElement('div');
    t.className = 'toast ' + (opts.kind || 'info');
    if (opts.hue != null) t.style.setProperty('--h', opts.hue);
    t.innerHTML = '<i>' + (opts.icon || '◈') + '</i><span><b>' + opts.title + '</b>' +
      (opts.body ? '<em>' + opts.body + '</em>' : '') + '</span>';
    el['toasts'].appendChild(t);
    /* Cap the stack — a burst of discoveries otherwise walls off the field. */
    while (el['toasts'].children.length > 3) el['toasts'].removeChild(el['toasts'].firstChild);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 420);
    }, opts.ms || 3400);
  }

  // --- drawers -------------------------------------------------------------

  function toggleDrawer(game, bus, which) {
    if (drawerOpen === which) { closeDrawer(); return; }
    drawerOpen = which;
    el['drawer'].classList.add('open');
    renderDrawer(game, bus);
  }

  function closeDrawer() {
    drawerOpen = null;
    el['drawer'].classList.remove('open');
  }

  function renderDrawer(game, bus) {
    if (!drawerOpen) return;
    const titles = { upgrades: 'DIALS', codex: 'CODEX', settings: 'SETTINGS',
      world: 'WORLD', vessels: 'BODIES & RESEARCH', contact: 'CONTACT',
      guide: 'HOW THIS WORKS', paths: 'PATHWAYS' };
    el['drawer-title'].textContent = titles[drawerOpen] || '';
    el['drawer-body'].innerHTML =
      drawerOpen === 'upgrades' ? upgradesHTML(game)
        : drawerOpen === 'codex' ? codexHTML(game)
          : drawerOpen === 'world' ? worldHTML(game)
            : drawerOpen === 'vessels' ? vesselsHTML(game)
              : drawerOpen === 'contact' ? contactHTML(game, bus)
                : drawerOpen === 'guide' ? RS.guide.guideHTML(game)
                  : drawerOpen === 'paths' ? RS.guide.pathwaysHTML(game)
                    : settingsHTML(game);
  }

  const KIND_BLURB = {
    range: 'Extends how far the dial physically reaches.',
    precision: 'Shrinks the smallest step you can make.',
    focus: 'Narrows your carrier — makes layers cohere and locks hold.'
  };

  function upgradesHTML(game) {
    let h = '';
    for (const def of RS.dials.DEFS) {
      const d = game.dials[def.id];
      h += '<section class="up-dial" style="--h:' + def.hue + '">' +
        '<header><span class="sym">' + def.symbol + '</span><h3>' + def.name + '</h3>' +
        '<span class="reach">' + reachLabel(def, d) + '</span></header>' +
        '<p class="blurb">' + def.blurb + '</p><div class="up-rows">';
      for (const kind of ['range', 'precision', 'focus']) {
        const can = RS.dials.canUpgrade(d, kind);
        const cost = RS.dials.costOf(d, kind);
        const afford = game.insight >= cost;
        const lvl = d.levels[kind];
        if (!can && kind === 'range' && def.rangeStep === 0) {
          h += '<div class="up-row na"><span class="k">RANGE</span><span class="v">n/a — already a closed circle</span></div>';
          continue;
        }
        h += '<button class="up-row" data-buy="' + def.id + ':' + kind + '"' +
          (can && afford ? '' : ' disabled') + '>' +
          '<span class="k">' + kind.toUpperCase() + '</span>' +
          '<span class="lv">' + RS.core.romanize(lvl) + '</span>' +
          '<span class="d">' + KIND_BLURB[kind] + '</span>' +
          '<span class="c">' + (can ? fmt(cost) + ' Ψ' : 'MAX') + '</span></button>';
      }
      h += '</div></section>';
    }
    return h;
  }

  function reachLabel(def, d) {
    switch (def.id) {
      case 'frequency': return 'reach φ' + d.max.toFixed(0);
      case 'space': return RS.cosmos.TIERS[Math.round(d.min)].short + ' → ' + RS.cosmos.TIERS[Math.round(d.max)].short;
      case 'time': return d.min.toFixed(1) + '× → ' + d.max.toFixed(1) + '×';
      default: return 'full circle';
    }
  }

  function codexHTML(game) {
    let h = '<div class="codex-tabs">';

    h += '<section><h3>Essences <em>' + RS.fractal.totalGnosis(game) + ' contexts recognised</em></h3>' +
      '<p class="blurb">One alphabet, spelled differently by every layer and every scale. ' +
      'Recognising an essence somewhere new deepens it everywhere.</p><div class="ess-grid">';
    for (const e of RS.fractal.ESSENCES) {
      const g = RS.fractal.gnosisOf(game, e.id);
      h += '<div class="ess' + (g ? '' : ' unknown') + '">' +
        '<span class="g">' + (g ? e.glyph : '·') + '</span>' +
        '<span class="n">' + (g ? e.name : '—') + '</span>' +
        '<span class="lv">' + (g ? '×' + g : '') + '</span>' +
        (g ? '<span class="t">' + e.trait + '</span>' : '') +
        (g ? '<span class="b">+' + ((RS.fractal.gnosisBonus(game, e.id) - 1) * 100).toFixed(0) + '% yield</span>' : '') +
        '</div>';
    }
    h += '</div></section>';

    h += '<section><h3>Layers</h3><div class="list">';
    const foc = RS.dials.focusOf(game.dials.frequency);
    for (const b of RS.spectrum.BANDS) {
      const known = !!game.known.bands[b.id];
      const reachable = b.centre <= game.dials.frequency.max;
      const ghost = RS.spectrum.isGhost(b, foc);
      const status = known ? 'held' : !reachable ? 'out of reach' : ghost ? 'ghost — needs focus' : 'reachable';
      h += '<div class="row' + (known ? '' : ' dim') + '" style="--h:' + b.hue + '">' +
        '<span class="g">' + b.glyph + '</span>' +
        '<span class="n">' + b.name + '<em>φ' + b.centre + ' · ' + status + '</em></span>' +
        '<span class="d">' + (known ? b.blurb : '—') + '</span></div>';
    }
    h += '</div></section>';

    h += '<section><h3>Scales</h3><div class="list">';
    for (const t of RS.cosmos.TIERS) {
      const known = !!game.known.tiers[t.id];
      const inReach = t.index >= game.dials.space.min && t.index <= game.dials.space.max;
      h += '<div class="row' + (known ? '' : ' dim') + '" style="--h:' + t.hue + '">' +
        '<span class="g">' + (t.root ? '◉' : known ? '○' : inReach ? '·' : ' ') + '</span>' +
        '<span class="n">' + t.name + (t.root ? ' <b>ROOT</b>' : '') +
        '<em>' + (t.logM == null ? 'Tegmark Level ' + t.level : RS.core.fmtMetres(t.logM)) + '</em></span>' +
        '<span class="d">' + (known || inReach ? t.sci : '—') + '</span></div>';
    }
    h += '</div></section></div>';
    return h;
  }

  function settingsHTML(game) {
    const s = game.settings;
    const row = (k, label, blurb) =>
      '<button class="set-row" data-toggle="' + k + '"><span class="k">' + label + '</span>' +
      '<span class="d">' + blurb + '</span>' +
      '<span class="sw' + (s[k] ? ' on' : '') + '"></span></button>';
    return '<section class="settings">' +
      row('audio', 'Audio', 'Procedural synthesis. The beat tone is how you tune by ear — strongly recommended.') +
      row('haptics', 'Haptics', 'Detent ticks and impacts through the vibration motor.') +
      row('reduceMotion', 'Reduce motion', 'Disables screen shake and thins particle bursts.') +
      row('showSci', 'Scientific notes', 'Show the physical definition of each scale.') +
      '<div class="stats"><h3>Session</h3>' +
      '<div>Crystallised <b>' + fmt(game.stats.crystals) + '</b></div>' +
      '<div>Best single <b>' + fmt(game.stats.bestSingle) + ' Ψ</b></div>' +
      '<div>Lifetime <b>' + fmt(game.lifetimeInsight) + ' Ψ</b></div>' +
      '<div>Layers held <b>' + Object.keys(game.known.bands).length + '/' + RS.spectrum.BANDS.length + '</b></div>' +
      '<div>Scales visited <b>' + Object.keys(game.known.tiers).length + '/' + RS.cosmos.TIERS.length + '</b></div>' +
      '<div>Played <b>' + RS.core.fmt(Math.floor(game.stats.playSeconds / 60)) + ' min</b></div>' +
      '</div></section>';
  }


  // --- world drawer --------------------------------------------------------

  /* Everything derivable about where the player currently is. This panel is
   * the payoff for the physics chain in planet.js: every line is a consequence
   * of the one before it, and the player can read the causality straight down
   * the list. */
  function worldHTML(game) {
    const s = game.scene;
    if (!s.system) return '<p class="blurb">Turn &Sigma; toward the system tier to arrive somewhere.</p>';

    const sys = s.system;
    const prim = sys.primary;
    let h = '';

    h += '<section><h3>' + sys.name + ' <em>' + sys.stars.length +
      (sys.stars.length === 1 ? ' star' : ' stars') + '</em></h3><div class="list">';
    for (const st of sys.stars) {
      h += '<div class="row" style="--h:' + st.cls.hue + '"><span class="g">&#9673;</span>' +
        '<span class="n">' + st.cls.c + st.sub + ' &middot; ' + st.cls.name +
        '<em>' + st.mass.toFixed(2) + ' M&#9737; &middot; ' + fmt(st.luminosity) + ' L&#9737; &middot; ' +
        Math.round(st.temperature) + ' K &middot; ' + st.age.toFixed(1) + '/' + st.lifetime.toFixed(1) + ' Gyr</em></span>' +
        '</div>';
    }
    h += '</div><div class="stats">' +
      '<div>Habitable zone <b>' + sys.hz.inner.toFixed(2) + '&ndash;' + sys.hz.outer.toFixed(2) + ' AU</b></div>' +
      '<div>Frost line <b>' + sys.frost.toFixed(2) + ' AU</b></div>' +
      '<div>Metallicity <b>' + prim.metallicity.toFixed(2) + ' Z&#9737;</b></div>' +
      '<div>Epoch <b>' + (s.t >= 0 ? '+' : '') + fmt(s.t) + ' yr</b></div>' +
      '</div></section>';

    const p = s.planet;
    if (!p) return h + '<p class="blurb">Tap a world to select it.</p>';

    const civ = p.civ || RS.civ.civOf(p, s.tGyr);
    h += '<section><h3>' + p.name + ' <em>' + p.type.name + '</em></h3>' +
      '<div class="stats">' +
      '<div>Orbit <b>' + p.a.toFixed(3) + ' AU</b></div>' +
      '<div>Mass / radius <b>' + fmt(p.massE) + ' M&#8853; / ' + p.radiusE.toFixed(2) + ' R&#8853;</b></div>' +
      '<div>Gravity <b>' + p.gravity.toFixed(2) + ' g</b></div>' +
      '<div>Escape velocity <b>' + p.vEsc.toFixed(1) + ' km/s</b></div>' +
      '<div>Stellar flux <b>' + p.flux.toFixed(2) + ' S&#8853;</b></div>' +
      '<div>Surface <b>' + Math.round(p.surfaceTemp) + ' K</b></div>' +
      '<div>Pressure <b>' + (p.pressure < 0.01 ? '&lt;0.01' : p.pressure.toFixed(2)) + ' bar</b></div>' +
      '<div>Day <b>' + (p.tidallyLocked ? 'tidally locked' : p.dayHours.toFixed(1) + ' h') + '</b></div>' +
      '<div>Hydrosphere <b>' + (p.hydrosphere * 100).toFixed(0) + '%</b></div>' +
      '<div>Habitability <b>' + (p.habitability * 100).toFixed(1) + '%</b></div>' +
      '</div>';

    if (p.composition.length) {
      h += '<h3 style="margin-top:10px">Atmosphere</h3><div class="list">';
      for (const c of p.composition.slice(0, 5)) {
        h += '<div class="row" style="--h:190"><span class="g">&middot;</span><span class="n">' +
          c.gas.name + '<em>' + (c.frac * 100).toFixed(1) + '%</em></span></div>';
      }
      h += '</div>';
    } else {
      h += '<p class="blurb">No atmosphere &mdash; too small and too hot to hold one.</p>';
    }

    if (p.biosphere) {
      const b = p.biosphere;
      h += '<h3 style="margin-top:10px">Biosphere ' +
        (b.seeded ? '<em>seeded by you</em>' : '') + '</h3><div class="stats">' +
        '<div>Stage <b>' + b.stage.name + '</b></div>' +
        '<div>Complexity <b>' + (b.complexity * 100).toFixed(0) + '%</b></div>' +
        '<div>Chemistry <b>' + b.chemistry + '</b></div>' +
        '<div>Oxygenation <b>' + (b.oxygenation * 100).toFixed(0) + '%</b></div>' +
        '<div>Diversity <b>' + fmt(b.diversity) + ' clades</b></div>' +
        '</div>';
    }

    if (civ) {
      h += '<h3 style="margin-top:10px">' + civ.name + '</h3><div class="stats">' +
        '<div>Technology <b>' + civ.tier.name + '</b></div>' +
        '<div>Population <b>' + fmt(civ.population) + '</b></div>' +
        '<div>Disposition <b>' + civ.disposition.name + '</b></div>' +
        '<div>Kardashev <b>' + civ.kardashev.toFixed(2) + '</b></div>' +
        (civ.collapsed ? '<div>Status <b style="color:var(--warn)">post-collapse</b></div>' : '') +
        '</div>';

      const market = RS.civ.marketOf(p, civ);
      h += '<h3 style="margin-top:10px">Market</h3><div class="list">';
      for (const m of market.slice(0, 7)) {
        h += '<div class="row" style="--h:' + m.commodity.hue + '"><span class="g">&#9671;</span>' +
          '<span class="n">' + m.commodity.name + '<em>' + m.price.toFixed(1) + ' &Psi;/u &middot; ' +
          (m.balance > 0 ? 'wants' : 'sells') + '</em></span></div>';
      }
      h += '</div>';
    }

    // resources
    h += '<h3 style="margin-top:10px">Resources</h3><div class="list">';
    for (const k of RS.planet.RESOURCE_KINDS) {
      const v = p.resources[k.id] || 0;
      if (v < 0.02) continue;
      h += '<div class="row" style="--h:' + k.hue + '"><span class="g">&#9632;</span>' +
        '<span class="n">' + k.name + '<em>' + (v * 100).toFixed(0) + '% abundance</em></span></div>';
    }
    h += '</div>';

    // player actions available here
    if (game.inhabiting) {
      const arch = RS.vessel.archOf(game.body);
      h += '<h3 style="margin-top:12px">Actions</h3><div class="up-rows">';
      if (arch.extracts) {
        h += '<button class="up-row" data-act="extract"><span class="k">EXTRACT</span><span class="lv">&#9660;</span>' +
          '<span class="d">Take the richest local seam into your hold.</span><span class="c">8 chg</span></button>';
      }
      if (game.body.holdMass > 0) {
        h += '<button class="up-row" data-act="sell"><span class="k">SELL</span><span class="lv">&#9650;</span>' +
          '<span class="d">Convert your hold at local prices.</span><span class="c">' +
          fmt(game.body.holdMass) + ' u</span></button>';
      }
      h += '</div>';
    }

    // structures
    const placed = RS.influence.structuresOn(game, p);
    h += '<h3 style="margin-top:12px">Structures <em>upkeep ' +
      RS.influence.totalUpkeep(game).toFixed(1) + '/' + fmt(game.passiveRate) + '</em></h3>';
    if (placed.length) {
      h += '<div class="list">';
      for (const x of placed) {
        h += '<div class="row" style="--h:' + x.struct.hue + '"><span class="g">' + x.struct.glyph + '</span>' +
          '<span class="n">' + x.struct.name + '<em>' + ((x.delta.progress || 0) * 100).toFixed(0) +
          '% matured &middot; ' + x.struct.effect + '</em></span></div>';
      }
      h += '</div>';
    }
    const buildable = RS.influence.STRUCTURES.filter(x => game.structuresUnlocked[x.id]);
    if (buildable.length) {
      h += '<div class="up-rows" style="margin-top:6px">';
      for (const x of buildable) {
        const why = RS.influence.canPlace(game, p, x.id);
        h += '<button class="up-row" data-build="' + x.id + '"' + (why ? ' disabled' : '') + '>' +
          '<span class="k">' + x.glyph + '</span><span class="lv"></span>' +
          '<span class="d"><b>' + x.name + '</b> &mdash; ' + x.blurb + '</span>' +
          '<span class="c">' + (why ? why : fmt(x.cost.insight) + ' &Psi;') + '</span></button>';
      }
      h += '</div>';
    } else {
      h += '<p class="blurb">Research FIELD PROJECTION to build anything here.</p>';
    }

    h += '</section>';
    return h;
  }

  // --- vessels & research drawer -------------------------------------------

  function vesselsHTML(game) {
    const avail = RS.vessel.availability(game);
    const cur = RS.vessel.archOf(game.body);
    let h = '<section><h3>Bodies <em>' + (game.inhabiting ? 'inhabiting ' + cur.name : 'unembodied') + '</em></h3>' +
      '<p class="blurb">The four dials become this body\'s controls while you are in it. ' +
      'Unembodied, &tau; scrubs time and &Sigma; moves the scale ladder; embodied, &tau; is throttle and &Sigma; is your vertical axis.</p>' +
      '<div class="up-rows">';

    if (game.inhabiting) {
      const b = game.body;
      h += '<div class="up-row na"><span class="k">CHARGE</span><span class="lv">' +
        Math.round(b.charge) + '</span><span class="d">of ' + cur.capacity +
        ' &middot; hold ' + fmt(b.holdMass) + ' u' +
        (b.mindState ? ' &middot; possession ' + (b.mindState.possession * 100).toFixed(0) + '%' : '') +
        '</span><span class="c"></span></div>';
      h += '<button class="up-row" data-embark="_off"><span class="k">LEAVE</span><span class="lv">&#8598;</span>' +
        '<span class="d">Return to the bare point of consciousness.</span><span class="c"></span></button>';
    }

    for (const a of avail) {
      if (!a.unlocked) continue;
      if (game.inhabiting && a.arch.id === cur.id) continue;
      const dm = a.arch.dialMap;
      h += '<button class="up-row" data-embark="' + a.arch.id + '"' + (a.reason ? ' disabled' : '') +
        ' style="--h:' + a.arch.hue + '">' +
        '<span class="k">' + a.arch.glyph + ' ' + a.arch.name.toUpperCase() + '</span><span class="lv"></span>' +
        '<span class="d">' + a.arch.blurb +
        '<br><i style="opacity:.6">&tau; ' + dm.time + ' &middot; &Sigma; ' + dm.space +
        ' &middot; &Delta; ' + dm.phase + '</i></span>' +
        '<span class="c">' + (a.reason ? a.reason : 'TAKE') + '</span></button>';
    }
    h += '</div></section>';

    h += '<section><h3>Research <em>' + Object.keys(game.research).length + '/' +
      RS.influence.RESEARCH.length + '</em></h3><div class="up-rows">';
    for (const node of RS.influence.RESEARCH) {
      const done = RS.influence.isResearched(game, node.id);
      const open = RS.influence.researchAvailable(game, node);
      const afford = game.insight >= node.cost;
      h += '<button class="up-row" data-research="' + node.id + '"' +
        (done || !open || !afford ? ' disabled' : '') + ' style="--h:' + node.hue + '">' +
        '<span class="k">' + node.name.toUpperCase() + '</span>' +
        '<span class="lv">' + (done ? '&#10003;' : open ? '' : '&#128274;') + '</span>' +
        '<span class="d">' + node.blurb +
        (node.needs.length && !open ? '<br><i style="opacity:.6">needs ' +
          node.needs.map(n => RS.influence.RESEARCH_BY_ID[n].name).join(', ') + '</i>' : '') +
        '</span><span class="c">' + (done ? '&mdash;' : fmt(node.cost) + ' &Psi;') + '</span></button>';
    }
    h += '</div></section>';

    h += '<section><h3>Fields</h3><div class="stats">' +
      '<div>Consciousness <b>' + game.fields.consciousness.toFixed(2) + '</b></div>' +
      '<div>Reality <b>' + game.fields.reality.toFixed(2) + '</b></div>' +
      '<div>Reach <b>' + RS.influence.reachRadius(game) + ' systems</b></div>' +
      '<div>Structures <b>' + RS.influence.structureCount(game) + '</b></div>' +
      '</div><p class="blurb">The consciousness field is how far you reach. ' +
      'The reality field is how hard your influence bites when it gets there. ' +
      'Both grow from gnosis, research and beacons &mdash; three currencies, one pair of numbers.</p></section>';

    return h;
  }


  // --- contact drawer ------------------------------------------------------

  /* The contact panel is the payoff for the whole tuning apparatus, so it
   * shows the *tuning* first: how close the carrier lock is, in the same
   * language the field uses, with the same arrows. A player who has learned to
   * land a manifestation already knows how to read this. */
  function contactHTML(game, bus) {
    const c = game.scene.contact;
    if (!c) {
      return '<p class="blurb">No mind within reach. Civilisations are rare &mdash; ' +
        'look for the pulsing amber rings on the galactic map, then descend into that system.</p>' +
        contactRosterHTML(game);
    }

    const { civ, lock, planet } = c;
    const rec = RS.contact.recordOf(game, planet);
    const state = RS.contact.stateOf(game, planet, civ, lock);
    const carrier = lock.carrier;
    let h = '';

    h += '<section><h3>' + civ.name + ' <em>' + planet.name + '</em></h3>' +
      '<div class="stats">' +
      '<div>Technology <b>' + civ.tier.name + '</b></div>' +
      '<div>Population <b>' + fmt(civ.population) + '</b></div>' +
      '<div>Disposition <b>' + civ.disposition.name + '</b></div>' +
      '<div>Channel <b style="color:' + hsl(state.hue, 0.8, 0.7) + '">' + state.name + '</b></div>' +
      '<div>They know of you <b>' + (rec.awareness * 100).toFixed(0) + '%</b></div>' +
      '<div>Standing <b style="color:' + hsl(rec.standing >= 0 ? 135 : 0, 0.8, 0.68) + '">' +
        (rec.standing >= 0 ? '+' : '') + rec.standing.toFixed(2) + '</b></div>' +
      '</div>';

    // ── the carrier ──
    h += '<h3 style="margin-top:12px">Carrier</h3>' +
      '<p class="blurb">They broadcast on the <b>' + carrier.band.name + '</b> layer &mdash; ' +
      carrier.spec.note + '. Tune &phi; onto it and hold &Delta; to open the channel.</p>';

    const dirF = Math.abs(lock.fd) < 0.25 ? 'on' : (lock.fd > 0 ? 'lower &phi;' : 'raise &phi;');
    const dirP = Math.abs(lock.pd) < 0.25 ? 'on' : (lock.pd > 0 ? 'lower &Delta;' : 'raise &Delta;');
    h += '<div class="ro-axes" style="margin:0 0 8px">' +
      '<span class="ax' + (lock.f > 0.86 ? ' good' : '') + '" style="--h:187">&phi;' +
        '<b style="width:' + (clamp01(lock.f) * 100).toFixed(0) + '%"></b><i>' + dirF + '</i></span>' +
      '<span class="ax' + (lock.p > 0.86 ? ' good' : '') + '" style="--h:268">&Delta;' +
        '<b style="width:' + (clamp01(lock.p) * 100).toFixed(0) + '%"></b><i>' + dirP + '</i></span>' +
      '</div>';

    if (!lock.inReach) {
      h += '<p class="blurb" style="color:var(--warn)">Their carrier sits at &phi;' +
        carrier.phi.toFixed(1) + ', past your dial\'s reach of &phi;' +
        game.dials.frequency.max.toFixed(0) + '. Buy &phi; RANGE.</p>';
    } else if (lock.ghost) {
      h += '<p class="blurb" style="color:var(--warn)">You can hear that somebody is there and cannot make them out. ' +
        'The ' + carrier.band.name + ' layer needs more &phi; FOCUS to cohere.</p>';
    } else if (rec.awareness < 0.35) {
      h += '<p class="blurb">They have not noticed you yet. Stay in their system, ' +
        'raise your reality field, or build something they can see.</p>';
    }

    // ── what they say ──
    if (state === RS.contact.STATES.open || state === RS.contact.STATES.warm) {
      h += '<h3 style="margin-top:12px">They say</h3><div class="say">';
      for (const line of RS.contact.greeting(game, planet, civ)) {
        h += '<p>' + line + '</p>';
      }
      h += '</div>';

      h += '<h3 style="margin-top:12px">Exchange</h3><div class="up-rows">';
      for (const o of RS.contact.offersFor(game, planet, civ)) {
        const dis = !o.available;
        h += '<button class="up-row" data-contact="' + o.id + '"' + (dis ? ' disabled' : '') +
          ' style="--h:' + civ.disposition.hue + '">' +
          '<span class="k">' + o.name.toUpperCase().slice(0, 22) + '</span><span class="lv"></span>' +
          '<span class="d">' + o.blurb + '<br><i style="opacity:.65">' +
            (dis && o.why ? o.why : o.effect) + '</i></span>' +
          '<span class="c">' + (o.cost ? fmt(o.cost) + ' &Psi;' : '') + '</span></button>';
      }
      h += '</div>';
    } else if (state === RS.contact.STATES.cold) {
      h += '<p class="blurb" style="color:var(--warn)">They are refusing you. ' +
        'Standing must rise above &minus;0.45 before they will answer again.</p>';
    }

    return h + contactRosterHTML(game);
  }

  /* Everyone you have ever spoken to, so relationships persist visibly rather
   * than existing only while you are standing in the right system. */
  function contactRosterHTML(game) {
    const keys = Object.keys(game.contacts).filter(k => game.contacts[k].met);
    if (!keys.length) return '';
    let h = '<section><h3>Known cultures <em>' + keys.length + '</em></h3><div class="list">';
    for (const k of keys) {
      const r = game.contacts[k];
      const hue = r.standing > 0.45 ? 135 : r.standing < -0.2 ? 0 : 45;
      h += '<div class="row" style="--h:' + hue + '"><span class="g">&#9673;</span>' +
        '<span class="n">' + (r.name || 'Unnamed culture') +
        (r.where ? ' <b style="color:var(--dimmer)">' + r.where + '</b>' : '') +
        '<em>standing ' + (r.standing >= 0 ? '+' : '') +
        r.standing.toFixed(2) + ' &middot; ' + r.exchanges + ' exchanges' +
        (r.taught.length ? ' &middot; taught you ' + r.taught.length : '') +
        (r.uplifted ? ' &middot; uplifted &times;' + r.uplifted : '') + '</em></span></div>';
    }
    return h + '</div></section>';
  }

  // --- galaxy readout ------------------------------------------------------

  /* What the player is looking at on the map, and what it would cost to go
   * there. Rendered into the same slot the node readout uses. */
  function renderGalaxyReadout(game, node) {
    const G = game.galaxy;
    const tg = G.target;
    const reachLy = RS.influence.reachRadius(game) * RS.galaxy.LY_PER_SECTOR;
    node.dataset.empty = '0';

    if (!tg) {
      node.innerHTML =
        '<div class="ro-head"><span class="ro-glyph" style="color:#7dd3fc">&#9678;</span>' +
        '<span class="ro-title">Sector ' + G.sx + ', ' + G.sy + '</span></div>' +
        '<div class="ro-sub">' + G.stars.length + ' stars in view &middot; reach ' +
        reachLy.toFixed(0) + ' ly</div>' +
        '<div class="ro-sub" style="margin-top:4px">Tap a star to select it.</div>';
      return;
    }

    const sv = RS.galaxy.surveyOf(game, tg);
    const st = tg.star;
    node.innerHTML =
      '<div class="ro-head"><span class="ro-glyph" style="color:' + hsl(st.cls.hue, 0.8, 0.72) + '">&#9673;</span>' +
      '<span class="ro-title">' + tg.name + '</span></div>' +
      '<div class="ro-sub">' + st.cls.c + st.sub + ' ' + st.cls.name + ' &middot; ' +
        st.mass.toFixed(2) + ' M&#9737; &middot; ' + tg.dist.toFixed(1) + ' ly</div>' +
      (sv ? '<div class="ro-sub" style="margin-top:4px">' + sv.planets + ' planets' +
        (sv.life ? ' &middot; <b style="color:#86efac">' + sv.life + ' living</b>' : '') +
        (sv.civ ? ' &middot; <b style="color:#fcd34d">' + sv.civ + ' inhabited</b>' : '') + '</div>'
        : '<div class="ro-sub" style="margin-top:4px;color:var(--warn)">Beyond your field &mdash; unresolved</div>') +
      '<div class="ro-sub" style="margin-top:4px">' +
        (tg.inReach || tg.visited || tg.charted
          ? 'Turn &Sigma; inward to travel here.'
          : 'Expand the consciousness field to reach it.') + '</div>';
  }

  RS.ui = { init, render, toast, toggleDrawer, closeDrawer, renderDrawer, setText, worldHTML, vesselsHTML, contactHTML, get drawerOpen() { return drawerOpen; } };
})(typeof window !== 'undefined' ? (window.RS = window.RS || {}) : (globalThis.RS = globalThis.RS || {}));
