/* Primal Isle — the interface.
 *
 * Built thumbs-first: a floating stick under the left thumb, actions under the
 * right, nothing important within 44px of a screen edge, and every panel a
 * full-screen sheet rather than a window. Keyboard is supported so the game is
 * playable at a desk, but the phone is the design target.
 *
 * Anything that opens a sheet stops the world. Being eaten while reading a
 * price list is not interesting, and on a phone a menu is not a moment of
 * spare attention.
 */
(function (ISLE) {
  'use strict';
  const C = ISLE.content;
  const S = ISLE.store;
  const W = ISLE.world;
  const D = ISLE.dino;
  const K = ISLE.combat;
  const M = ISLE.shop;
  const MU = ISLE.mutations;
  const Idle = ISLE.idle;
  const Sim = ISLE.sim;
  const { clamp, fmt, fmtSmall, clock } = ISLE.core;

  let G = null;
  let el = {};
  let mctx = null;
  let modalOpen = null;
  let storeTab = 'exchange';
  let speciesCb = null;
  let lastVitals = 0;
  let flashT = null;

  /* Rewriting a panel every tick detaches the node under the player's thumb
   * mid-tap. Each of these holds the last markup written, and the write is
   * skipped when nothing changed. */
  const painted = { vitals: '', wallet: '', threats: '', feed: '', place: '' };
  function paint(key, node, html) {
    if (painted[key] === html) return;
    painted[key] = html;
    node.innerHTML = html;
  }

  const input = { mx: 0, my: 0, sprint: false, interact: false };
  const stick = { on: false, id: null, ox: 0, oy: 0 };
  const held = {};

  const D$ = n => S.CUR.short + ' ' + fmt(n);
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function init(game) {
    G = game;
    el = {
      app: $('app'), stage: $('stage'), scene: $('scene'), hud: $('hud'),
      vitals: $('vitals'), wallet: $('wallet'), minimap: $('minimap'),
      place: $('place'), feed: $('feed'), threats: $('threats'),
      stick: $('stick'), knob: $('knob'), acts: $('acts'), offer: $('offerbtn'),
      modal: $('modal'), banner: $('banner')
    };
    mctx = el.minimap.getContext('2d');
    el.minimap.width = 132; el.minimap.height = 132;
    bindTouch();
    bindKeys();
    bindButtons();
  }

  function setGame(g) { G = g; }

  /* The world runs only when nothing is in front of it. */
  function paused() { return !!modalOpen || !!(G && G.draft); }

  // --- input --------------------------------------------------------------
  function bindTouch() {
    const stage = el.stage;
    stage.addEventListener('pointerdown', e => {
      if (paused()) return;
      const r = stage.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const nearThumb = G.settings.lefty ? x > r.width * 0.55 : x < r.width * 0.55;
      if (nearThumb && y > r.height * 0.42 && !stick.on) {
        stick.on = true; stick.id = e.pointerId; stick.ox = x; stick.oy = y;
        el.stick.style.left = x + 'px'; el.stick.style.top = y + 'px';
        el.stick.classList.add('on');
        stage.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    }, { passive: false });

    stage.addEventListener('pointermove', e => {
      if (!stick.on || e.pointerId !== stick.id) return;
      const r = stage.getBoundingClientRect();
      const dx = (e.clientX - r.left) - stick.ox, dy = (e.clientY - r.top) - stick.oy;
      const len = Math.hypot(dx, dy);
      const max = 52;
      const k = len > max ? max / len : 1;
      el.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const mag = Math.min(1, len / max);
      input.mx = len ? (dx / len) * mag : 0;
      input.my = len ? (dy / len) * mag : 0;
      e.preventDefault();
    }, { passive: false });

    const end = e => {
      if (!stick.on || e.pointerId !== stick.id) return;
      stick.on = false; stick.id = null;
      input.mx = input.my = 0;
      el.knob.style.transform = 'translate(0,0)';
      el.stick.classList.remove('on');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('contextmenu', e => { if (!modalOpen) e.preventDefault(); });
  }

  function bindKeys() {
    const map = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (map[e.code]) { held[map[e.code]] = 1; e.preventDefault(); }
      else if (e.code === 'Space') { act('bite'); e.preventDefault(); }
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = true;
      else if (e.code === 'KeyE') input.interact = true;
      else if (e.code === 'KeyQ') act('call');
      else if (e.code === 'KeyM') openMap();
      else if (e.code === 'KeyB') openStore('exchange');
      else if (e.code === 'Escape') closeModal();
    });
    window.addEventListener('keyup', e => {
      if (map[e.code]) held[map[e.code]] = 0;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.sprint = false;
      if (e.code === 'KeyE') input.interact = false;
    });
  }

  function keyVector() {
    const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
    if (!x && !y) return null;
    const l = Math.hypot(x, y);
    return { x: x / l, y: y / l };
  }

  function bindButtons() {
    const hold = (id, fn) => {
      const b = $(id);
      b.addEventListener('pointerdown', e => { e.preventDefault(); fn(true); b.classList.add('down'); });
      const off = () => { fn(false); b.classList.remove('down'); };
      b.addEventListener('pointerup', off);
      b.addEventListener('pointerleave', off);
      b.addEventListener('pointercancel', off);
    };
    const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });

    hold('b-sprint', on => { input.sprint = on; });
    hold('b-eat', on => { input.interact = on; });
    tap('b-bite', () => act('bite'));
    tap('b-call', () => act('call'));
    tap('b-use', () => openStore('items'));
    el.minimap.parentElement.addEventListener('pointerdown', e => { e.preventDefault(); openMap(); });
    el.wallet.addEventListener('pointerdown', e => {
      const t = e.target.closest('[data-open]');
      if (t) { e.preventDefault(); openStore(t.getAttribute('data-open')); }
    });
    el.offer.addEventListener('pointerdown', e => { e.preventDefault(); openStore('deals'); });
    el.modal.addEventListener('click', onModalClick);
  }

  function act(what) {
    if (paused() || !G.player || !G.player.alive) return;
    if (what === 'bite') {
      const res = Sim.playerBite(G);
      if (res && res.target) {
        haptic(res.killed ? 60 : 18);
        ISLE.render.kick(res.killed ? 0.9 : 0.35);
        if (res.ambushed) flash('Ambush!');
      } else haptic(6);
    } else if (what === 'call') {
      openCalls();
    }
  }

  function haptic(ms) {
    if (!G || !G.settings.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }

  // --- per-frame HUD ------------------------------------------------------
  function frame(g, dt) {
    G = g;
    const kv = keyVector();
    if (!stick.on) { input.mx = kv ? kv.x : 0; input.my = kv ? kv.y : 0; }

    if (input.interact && !paused() && g.player && g.player.alive) Sim.playerInteract(g, dt);

    lastVitals += dt;
    if (lastVitals > 0.1) {
      lastVitals = 0;
      drawVitals(g); drawWallet(g); drawThreats(g); drawFeed(g); updateActs(g);
      if (g.player) {
        const where = W.regionName(g.world, g.player.x, g.player.y) + ' · ' + W.phaseName(g.clock);
        if (painted.place !== where) { painted.place = where; el.place.textContent = where; }
      }
    }
    ISLE.render.minimap(g, mctx, 132, 132);
    drawDeal(g);

    if (g.draft && modalOpen !== 'draft') openDraft();
    /* `respawning` is the window between choosing to hatch again and choosing
     * what to hatch as: still dead, but the death sheet must not slam back
     * over the species picker. */
    if (g.dead && !g.ui.respawning && modalOpen !== 'death') openDeath();
    if (g.ui.popDeal && !modalOpen) { const id = g.ui.popDeal; g.ui.popDeal = null; openDealPopup(id); }
  }

  function bar(cls, v, max, label, extra) {
    const p = clamp(v / max, 0, 1) * 100;
    return `<div class="bar ${cls}${extra || ''}"><i style="width:${p}%"></i><b>${label}</b></div>`;
  }

  function drawVitals(g) {
    const d = g.player;
    if (!d) { paint('vitals', el.vitals, ''); return; }
    const sp = D.species(d);
    const growPct = Math.round(d.growth * 100);
    const stalled = d.growthStalled && d.growth < 1;
    const nextMile = MU.MILESTONES[d.mutMiles || 0];
    paint('vitals', el.vitals,
      `<div class="who"><b>${esc(sp.name)}</b><span>${D.label(d)} · ${growPct}%</span>
        ${M.clubActive(g) ? '<em class="vip">CLUB</em>' : ''}</div>
      <div class="bars">
        ${bar('grow', d.growth, 1, stalled ? '⚠ growth stalled'
          : (nextMile ? `Growth ${growPct}% → 🧬 ${Math.round(nextMile * 100)}%` : `Growth ${growPct}%`),
          stalled ? ' warn' : '')}
        ${bar('hp', d.hp, D.maxHp(d), 'HP')}
        ${bar('food', d.hunger, 100, 'Food')}
        ${bar('water', d.thirst, 100, 'Water')}
        ${bar('stam', d.stam, D.maxStam(d), 'Stam')}
      </div>
      <div class="wounds">
        ${(d.muts || []).map(id => `<span class="w mut ${MU.BY_ID[id].rarity}">${MU.BY_ID[id].icon}</span>`).join('')}
        ${d.bleed ? `<span class="w bleed">🩸 ×${d.bleed}</span>` : ''}
        ${d.bone ? '<span class="w bone">🦴 broken</span>' : ''}
        ${d.salt > 0 ? '<span class="w salt">🌊 salt</span>' : ''}
        ${d.protect > 0 ? `<span class="w buff">✨ unnoticed ${Math.ceil(d.protect)}s</span>` : ''}
        ${d.buffs.armor ? '<span class="w buff">🛡 plated</span>' : ''}
        ${d.buffs.reveal ? '<span class="w buff">👃 scent</span>' : ''}
        ${d.groupSize > 1 ? `<span class="w group">🤝 ×${d.groupSize}</span>` : ''}
      </div>`);
  }

  function drawWallet(g) {
    const a = g.acct;
    const rate = Idle.rate(g.idle) * M.exchangeMult(g);
    paint('wallet', el.wallet,
      `<button class="chip dino" data-open="exchange"><i>💵</i>${fmt(a.dino)}<em>+${fmtSmall(rate)}/s</em></button>
       <button class="chip bones" data-open="bones"><i>🦴</i>${fmt(a.bones)}</button>
       <button class="chip shop" data-open="items"><i>🎒</i></button>
       <button class="chip menu" data-open="menu"><i>☰</i></button>`);
  }

  function drawThreats(g) {
    const list = Sim.threats(g).filter(x => x.dist < 620);
    if (!list.length || !g.player) { paint('threats', el.threats, ''); return; }
    paint('threats', el.threats, list.slice(0, 4).map(x => {
      const cls = x.edge > 1.25 ? 'prey' : x.edge < 0.8 ? 'danger' : 'even';
      return `<div class="th ${cls}">${x.d.whale ? '♦' : ''}${esc(D.species(x.d).name)}
        <span>${Math.round(x.d.growth * 100)}%</span><em>${Math.round(x.dist)}m</em></div>`;
    }).join(''));
  }

  function drawFeed(g) {
    paint('feed', el.feed, g.feed.slice(0, 4).map(f =>
      `<div class="f ${f.tone}">${esc(f.text)}</div>`).join(''));
  }

  function drawDeal(g) {
    const o = g.acct.deals[0];
    if (!o) { el.offer.classList.remove('on'); return; }
    const def = S.DEALS[o.id];
    const left = Math.max(0, (o.until - Date.now()) / 1000);
    el.offer.classList.add('on');
    el.offer.innerHTML = `<b>${esc(def.name)}</b><span>${D$(def.cost)}</span><em>${clock(left)}</em>`;
  }

  function updateActs(g) {
    const hint = Sim.interactHint(g);
    const b = $('b-eat');
    b.querySelector('i').textContent = hint ? hint.icon : '🌿';
    b.classList.toggle('dim', !hint);
    const d = g.player;
    $('b-sprint').classList.toggle('dim', !d || d.stam < 5);
    $('b-bite').classList.toggle('dim', !d || !K.canBite(d));
    $('b-use').classList.toggle('has', Object.keys(g.acct.items).some(k => g.acct.items[k] > 0));
  }

  // --- modal plumbing -----------------------------------------------------
  function openModal(kind, html, opts) {
    opts = opts || {};
    modalOpen = kind;
    el.modal.className = 'on' + (opts.sheet ? ' sheet' : '') + (opts.locked ? ' locked' : '');
    el.modal.innerHTML = `<div class="scrim"${opts.locked ? '' : ' data-act="close"'}></div>
      <div class="dialog">${html}</div>`;
    input.mx = input.my = 0; input.sprint = false; input.interact = false;
    stick.on = false; el.stick.classList.remove('on');
  }
  function closeModal() {
    if (modalOpen === 'death' || modalOpen === 'draft') return;
    // Backing out of the picker hands you back to the death sheet.
    if (modalOpen === 'species' && G.dead) G.ui.respawning = false;
    forceClose();
  }
  function forceClose() { modalOpen = null; el.modal.className = ''; el.modal.innerHTML = ''; }

  function onModalClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    e.preventDefault();
    handle(t.getAttribute('data-act'), t.getAttribute('data-v'));
  }

  function handle(a, v) {
    switch (a) {
      case 'close': closeModal(); break;
      case 'pick': { const cb = speciesCb; speciesCb = null; if (cb) cb(v); break; }
      case 'tab': storeTab = v; renderStore(); break;
      case 'store': openStore(v || 'exchange'); break;

      // the Exchange
      case 'dig': doDig(); break;
      case 'buygen': if (Idle.buyGen(G, v, 1)) { haptic(8); renderStore(); } else denied(); break;
      case 'buygenmax': {
        const n = Idle.maxAfford(G.idle, G.acct.dino, v);
        if (n > 0 && Idle.buyGen(G, v, n)) { haptic(14); renderStore(); } else denied();
        break;
      }
      case 'buyup': if (Idle.buyUpgrade(G, v)) { haptic(20); renderStore(); } else denied(); break;
      case 'prestige': confirmPrestige(); break;

      // the shop
      case 'buyitem': if (M.buyItem(G, v)) { haptic(20); renderStore(); } else denied(); break;
      case 'useitem': if (M.useItem(G, v)) { haptic(20); renderStore(); } else denied(); break;
      case 'buybone': if (M.buyBoneItem(G, v)) renderStore(); else denied(); break;
      case 'usebone': if (M.useBoneItem(G, v)) renderStore(); else denied(); break;
      case 'buyspecies': if (M.buySpecies(G, v)) { haptic(40); renderStore(); } else denied(); break;
      case 'shardspecies': if (M.buySpeciesWithShards(G, v)) renderStore(); else denied(); break;
      case 'crate': openCrate(parseInt(v, 10)); break;
      case 'buypass': if (M.buyPass(G)) renderStore(); else denied(); break;
      case 'skiptier': if (M.skipTier(G, 1)) renderStore(); else denied(); break;
      case 'claimpass': M.claimAll(G); renderStore(); break;
      case 'buyclub': if (M.buyClub(G)) renderStore(); else denied(); break;
      case 'buydeal': if (M.buyDeal(G, v)) { haptic(40); renderStore(); } else denied(); break;
      case 'bankmut': if (M.bankMutation(G, v)) { haptic(30); renderStore(); } else denied(); break;
      case 'unbankmut': M.unbankMutation(G, v); renderStore(); break;

      // the run
      case 'takemut': if (Sim.takeMutation(G, v)) { haptic(30); forceClose(); } break;
      case 'reroll': if (Sim.rerollDraft(G)) { haptic(12); openDraft(); } else denied(); break;
      case 'revive': if (Sim.revive(G, v)) { forceClose(); haptic(40); } else denied(); break;
      case 'respawn': doRespawn(); break;
      case 'map': openMap(); break;
      case 'call': Sim.playerCall(G, v); closeModal(); break;
      case 'setskin': G.acct.skin = v === 'none' ? null : v; if (G.player) G.player.skin = G.acct.skin; renderStore(); break;
      case 'toggle': G.settings[v] = !G.settings[v]; renderStore(); break;
      case 'export': doExport(); break;
      case 'import': doImport(); break;
      case 'wipe': doWipe(); break;
      case 'about': openAbout(); break;
    }
  }

  function denied() { haptic(8); flash('Not enough.'); }

  function flash(text) {
    el.banner.textContent = text;
    el.banner.classList.add('on');
    clearTimeout(flashT);
    flashT = setTimeout(() => el.banner.classList.remove('on'), 1400);
  }

  // --- the mutation draft ---------------------------------------------------
  /* The roguelike beat. Three offers, one kept, the world held still while you
   * decide — and everything you take dies with this animal. */
  function openDraft() {
    const dr = G.draft;
    if (!dr || !G.player) return;
    const cards = dr.opts.map(id => {
      const m = MU.BY_ID[id];
      return `<button class="mutcard ${m.rarity}" data-act="takemut" data-v="${id}">
        <div class="mrow"><i>${m.icon}</i><b>${esc(m.name)}</b><em>${MU.RARITY[m.rarity].name}</em></div>
        <p>${esc(m.desc)}</p></button>`;
    }).join('');
    const have = (G.player.muts || []).map(id =>
      `<span class="minimut ${MU.BY_ID[id].rarity}">${MU.BY_ID[id].icon} ${esc(MU.BY_ID[id].name)}</span>`).join('');
    const rerolls = M.itemCount(G, 'reroll');

    openModal('draft', `<div class="draft">
        <div class="dhead">🧬 MUTATION</div>
        <h2>${Math.round(G.player.growth * 100)}% — the isle offers</h2>
        <p class="dim small">Keep one. The other two are gone. All of it dies with you.</p>
        ${cards}
        ${have ? `<div class="carrying"><b>Carrying</b>${have}</div>` : ''}
        <button class="wide ghost small" data-act="reroll" ${rerolls ? '' : 'disabled'}>
          🎲 Reroll — Unstable Genome <em>${rerolls} held</em></button>
      </div>`, { locked: true, sheet: true });
  }

  // --- calls ---------------------------------------------------------------
  function openCalls() {
    const cd = G.player ? G.player.callT : 0;
    const rows = Object.values(C.CALLS).map(c =>
      `<button class="row call" data-act="call" data-v="${c.id}" ${cd > 0 ? 'disabled' : ''}>
        <i>${c.icon}</i><div><b>${c.name}</b><span>${esc(c.blurb)}</span></div></button>`).join('');
    openModal('calls', `<h2>Call</h2>${cd > 0 ? `<p class="dim">Recovering — ${cd.toFixed(1)}s</p>` : ''}${rows}
      <button class="wide ghost" data-act="close">Cancel</button>`, { sheet: true });
  }

  // --- map -----------------------------------------------------------------
  function openMap() {
    openModal('map', `<h2>The Isle</h2>
      <canvas id="bigmap" width="600" height="600"></canvas>
      <p class="dim small">You see your own position and your pack. Everything else is
      rumour unless you are running Scent Surge.</p>
      <div class="row2">
        <button class="wide" data-act="buyitem" data-v="surge">👃 Scent Surge · ${D$(S.ITEMS.surge.cost)}</button>
        <button class="wide ghost" data-act="close">Close</button>
      </div>`, { sheet: true });
    const c = $('bigmap').getContext('2d');
    const draw = () => {
      if (modalOpen !== 'map') return;
      ISLE.render.minimap(G, c, 600, 600);
      requestAnimationFrame(draw);
    };
    draw();
  }

  // --- death ---------------------------------------------------------------
  function openDeath() {
    const info = G.deathInfo || {};
    const a = G.acct;
    const canItem = M.itemCount(G, 'revive') > 0;
    const canPay = a.dino >= S.ITEMS.revive.cost;
    const lostPct = Math.round((info.growth || 0) * 100);
    const muts = (G.player && G.player.muts) || [];
    const specimens = Math.floor((info.growth || 0) * 10);

    openModal('death', `
      <div class="death">
        <h2>You died</h2>
        <p class="big">${lostPct}% growth and ${muts.length} mutation${muts.length === 1 ? '' : 's'} lost</p>
        <p class="dim">${info.killer
          ? `Killed by ${esc(info.killer)}${info.killerWhale ? ' <span class="vipdot">♦</span>' : ''} — ${esc(C.SPECIES[info.killerSp].name)}`
          : 'Cause: ' + esc(info.cause || 'wounds')}
          · survived ${clock(info.lived || 0)}${info.kills ? ' · ' + info.kills + ' kills' : ''}</p>

        <div class="banked">🦴 ${specimens} specimen${specimens === 1 ? '' : 's'} logged —
          the Exchange keeps those whatever happens out here.</div>

        <div class="revives">
          <button class="wide gold" data-act="revive" data-v="item" ${canItem ? '' : 'disabled'}>
            💗 Use Second Chance <em>${M.itemCount(G, 'revive')} held</em></button>
          <button class="wide gold" data-act="revive" data-v="dino" ${canPay ? '' : 'disabled'}>
            💗 Get up where you fell <em>${D$(S.ITEMS.revive.cost)}</em></button>
        </div>

        <div class="orfree">or hatch again, small and clean</div>
        <button class="wide ghost" id="respawnbtn" data-act="respawn">Respawn</button>
        <button class="wide ghost small" data-act="store" data-v="exchange">
          💵 Work the Exchange instead <em>${D$(a.dino)} · +${fmtSmall(Idle.rate(G.idle))}/s</em></button>
        <p class="tiny dim">Deaths: ${a.deaths} · streak ${a.deathStreak}${a.mutBank.length ? ' · banked: ' + a.mutBank.map(id => MU.BY_ID[id].name).join(', ') : ''}</p>
      </div>`, { locked: true });

    const tick = () => {
      if (modalOpen !== 'death') return;
      const b = $('respawnbtn');
      if (!b) return;
      const left = G.respawn ? Math.max(0, G.respawn.t) : 0;
      const ready = left <= 0.5 || M.itemCount(G, 'instant') > 0;
      b.textContent = ready ? 'Respawn' : `Respawn in ${Math.ceil(left)}s`;
      b.disabled = !ready;
      requestAnimationFrame(tick);
    };
    tick();
  }

  function doRespawn() {
    const left = G.respawn ? G.respawn.t : 0;
    if (left > 0.5) {
      if (M.itemCount(G, 'instant') > 0) G.acct.items.instant--;
      else return;
    }
    G.ui.respawning = true;
    forceClose();
    openSpeciesPick(sp => {
      G.ui.respawning = false;
      Sim.respawnNow(G, sp);
      forceClose();
    });
  }

  /* Species select doubles as the shop window for premium species: the locked
   * cards sit in the same list as the free ones, with their numbers showing. */
  function openSpeciesPick(cb, first) {
    const cards = Object.keys(C.SPECIES).map(id => {
      const sp = C.SPECIES[id];
      const open = M.unlocked(G, id);
      const price = S.SPECIES_PRICE[id];
      return `<button class="spcard ${open ? '' : 'locked'} ${sp.premium ? 'prem' : ''}"
          data-act="${open ? 'pick' : 'buyspecies'}" data-v="${id}">
        <div class="sphead"><b>${esc(sp.name)}</b><em>${esc(sp.tag)}</em></div>
        <div class="spstats">
          <span>❤ ${sp.hp}</span><span>🦷 ${sp.dmg}</span><span>💨 ${sp.spd}</span>
          <span>🌱 ${sp.growthRate.toFixed(2)}×</span><span>${sp.diet === 'carnivore' ? '🍖' : '🌿'}</span>
        </div>
        <p>${esc(sp.blurb)}</p>
        ${open ? '' : `<div class="lock">🔒 ${D$(price.cost)} · ${price.shards} shards${G.acct.shards >= price.shards ? ' <u data-act="shardspecies" data-v="' + id + '">use shards</u>' : ''}</div>`}
      </button>`;
    }).join('');

    speciesCb = cb;
    const bank = G.acct.mutBank.map(id =>
      `<span class="minimut ${MU.BY_ID[id].rarity}">${MU.BY_ID[id].icon} ${esc(MU.BY_ID[id].name)}</span>`).join('');
    openModal('species', `<h2>${first ? 'Choose your animal' : 'Hatch as'}</h2>
      <p class="dim small">Premium species are not sidegrades. Compare the numbers.</p>
      ${bank ? `<div class="carrying"><b>Starting with</b>${bank}</div>` : ''}
      <div class="spgrid">${cards}</div>
      ${first ? '' : '<button class="wide ghost" data-act="close">Back</button>'}`,
      { sheet: true, locked: !!first });
  }

  // --- the shop ------------------------------------------------------------
  function openStore(tab) {
    storeTab = tab || 'exchange';
    renderStore();
  }

  const TABS = [
    ['exchange', '💵 Exchange'], ['items', '💉 Items'], ['mutations', '🧬 Genome'],
    ['crates', '🎁 Crates'], ['pass', '🏅 Pass'], ['club', '👑 Club'],
    ['species', '🦖 Species'], ['deals', '⏳ Deals'], ['bones', '🦴 Bones'],
    ['ledger', '📒 Ledger'], ['menu', '☰ Menu']
  ];

  function renderStore() {
    const a = G.acct;
    const head = `<div class="shophead">
        <div class="bal"><span>💵 <b id="hbal">${fmt(a.dino)}</b></span><span>🦴 ${fmt(a.bones)}</span><span>💠 ${fmt(a.shards)}</span></div>
        <button class="x" data-act="close">✕</button>
      </div>
      <nav class="stabs">${TABS.map(([id, name]) =>
        `<button class="${storeTab === id ? 'on' : ''}" data-act="tab" data-v="${id}">${name}</button>`).join('')}</nav>`;
    const body = ({
      exchange: tabExchange, items: tabItems, mutations: tabMutations, crates: tabCrates,
      pass: tabPass, club: tabClub, species: tabSpecies, deals: tabDeals,
      bones: tabBones, ledger: tabLedger, menu: tabMenu
    }[storeTab] || tabExchange)();

    if (modalOpen === 'store') {
      el.modal.querySelector('.dialog').innerHTML = head + `<div class="sbody">${body}</div>`;
    } else {
      openModal('store', head + `<div class="sbody">${body}</div>`, { sheet: true });
    }
    if (storeTab === 'exchange') liveExchange();
    else liveBalance();
  }

  /* The balance keeps moving while a sheet is open, because the Exchange does
   * not stop for the shop. */
  function liveBalance() {
    const step = () => {
      if (modalOpen !== 'store') return;
      const b = $('hbal');
      if (b) b.textContent = fmt(G.acct.dino);
      requestAnimationFrame(step);
    };
    step();
  }

  // --- the Fossil Exchange --------------------------------------------------
  function tabExchange() {
    const s = G.idle;
    const rate = Idle.rate(s) * M.exchangeMult(G);
    const gain = Idle.prestigeGain(s);

    const gens = Idle.GENS.map((def, i) => {
      const n = Idle.owned(s, def.id);
      const prev = i > 0 ? Idle.owned(s, Idle.GENS[i - 1].id) : 1;
      if (!n && !prev) return '';                       // one rung at a time
      const cost = Idle.costOf(s, def.id, 1);
      const each = def.rate * Idle.milestoneMult(n) * Idle.globalMult(s);
      const nextMile = Idle.MILES.find(k => k > n);
      return `<div class="genrow ${G.acct.dino >= cost ? 'can' : ''}" data-gen="${def.id}">
        <i>${def.icon}</i>
        <div><b>${esc(def.name)} ${n ? `<em class="tag">×${n}</em>` : ''}</b>
          <span>${esc(def.blurb)}</span>
          <span class="sub">${fmtSmall(each)}/s each${nextMile ? ` · ×2 at ${nextMile}` : ''}</span></div>
        <div class="btns">
          <button class="mini" data-act="buygen" data-v="${def.id}">${fmt(cost)}</button>
          <button class="mini ghost" data-act="buygenmax" data-v="${def.id}">max</button>
        </div></div>`;
    }).join('');

    const ups = Idle.UPGRADES.filter(u => !s.ups[u.id]).slice(0, 3).map(u =>
      `<div class="row item"><i>⭐</i>
        <div><b>${esc(u.name)}</b><span>${esc(u.blurb)}</span></div>
        <button class="mini" data-act="buyup" data-v="${u.id}">${fmt(u.cost)}</button></div>`).join('');

    return `<div class="exchange">
        <div class="exhead">
          <div class="exbal" id="exbal">${fmt(G.acct.dino)}</div>
          <div class="exrate" id="exrate">+${fmtSmall(rate)} ${S.CUR.short}/s</div>
        </div>
        <button class="digbtn" data-act="dig">⛏<span>DIG</span><em>+${fmtSmall(Idle.tapPower(s))}</em></button>
        <p class="lead">Dinollars come from here and nowhere else — there is no
        payment screen in this game. The Exchange keeps running while you are out
        on the isle, and every run banks specimens into it whether you live or
        die.</p>
        <div class="exstat">
          <span>Specimens <b>${s.specimens}</b> → ×${Idle.specimenMult(s).toFixed(2)}</span>
          <span>Fossil points <b>${s.fp}</b> → ×${(1 + 0.05 * s.fp).toFixed(2)}</span>
          ${M.clubActive(G) ? '<span class="clubon">Club ×1.5</span>' : ''}
        </div>
        ${gens}
        ${ups ? '<h3>Upgrades</h3>' + ups : ''}
        <h3>Extinction event</h3>
        <div class="prestige">
          <p>Reset every generator and upgrade on the Exchange. Fossil points are
          kept, and each one is +5% forever.</p>
          ${gain > 0
            ? `<button class="wide gold" data-act="prestige">Reset for ${gain} fossil point${gain === 1 ? '' : 's'}</button>`
            : `<div class="dim small">Needs ${fmt(Idle.PRESTIGE_BASE)} lifetime Dinollars for the first point. Lifetime so far: ${fmt(s.total)}.</div>`}
        </div>
      </div>`;
  }

  function doDig() {
    const got = Idle.tap(G);
    haptic(4);
    const b = $('exbal');
    if (b) {
      b.textContent = fmt(G.acct.dino);
      b.classList.remove('pop');
      void b.offsetWidth;
      b.classList.add('pop');
    }
    floatUp('+' + fmtSmall(got));
  }

  function floatUp(text) {
    const btn = el.modal.querySelector('.digbtn');
    if (!btn) return;
    const s = document.createElement('span');
    s.className = 'floater';
    s.textContent = text;
    s.style.left = (30 + Math.random() * 40) + '%';
    btn.appendChild(s);
    setTimeout(() => s.remove(), 900);
  }

  /* The Exchange screen updates its numbers without rebuilding its buttons, so
   * a tap never lands on a node that has just been replaced. */
  function liveExchange() {
    const step = () => {
      if (modalOpen !== 'store' || storeTab !== 'exchange') return;
      const b = $('exbal'), h = $('hbal'), r = $('exrate');
      if (b) b.textContent = fmt(G.acct.dino);
      if (h) h.textContent = fmt(G.acct.dino);
      if (r) r.textContent = '+' + fmtSmall(Idle.rate(G.idle) * M.exchangeMult(G)) + ' ' + S.CUR.short + '/s';
      for (const row of el.modal.querySelectorAll('.genrow')) {
        const id = row.getAttribute('data-gen');
        row.classList.toggle('can', G.acct.dino >= Idle.costOf(G.idle, id, 1));
      }
      requestAnimationFrame(step);
    };
    step();
  }

  function confirmPrestige() {
    const gain = Idle.prestigeGain(G.idle);
    openModal('prestige', `<h2>Extinction event</h2>
      <p>Every generator and upgrade on the Exchange goes, along with your
      Dinollar balance. You keep <b>${gain} fossil point${gain === 1 ? '' : 's'}</b>,
      everything the shop has already given you, and every specimen.</p>
      <button class="wide gold" id="prestigego">Do it</button>
      <button class="wide ghost" data-act="store" data-v="exchange">Not yet</button>`, { sheet: true });
    $('prestigego').addEventListener('click', () => {
      Idle.prestige(G);
      haptic(60);
      openStore('exchange');
    });
  }

  // --- shop tabs ------------------------------------------------------------
  function tabItems() {
    return `<p class="lead">Consumables, priced in Dinollars. The top two are the
      game: growth is health, damage and speed, and these sell it by the tap.</p>
      ${Object.values(S.ITEMS).map(it => {
        const n = M.itemCount(G, it.id);
        const usable = n > 0 && it.id !== 'revive' && it.id !== 'instant' && it.id !== 'reroll'
          && G.player && G.player.alive;
        return `<div class="row item">
          <i>${it.icon}</i>
          <div><b>${esc(it.name)}${n ? ` <em class="tag">×${n}</em>` : ''}</b><span>${esc(it.blurb)}</span></div>
          <div class="btns">
            ${usable ? `<button class="mini use" data-act="useitem" data-v="${it.id}">Use</button>` : ''}
            <button class="mini" data-act="buyitem" data-v="${it.id}">${fmt(it.cost)}</button>
          </div></div>`;
      }).join('')}
      <p class="fine">Second Chance is the most valuable thing on this page,
      because a death costs the whole run: the growth and every mutation on it.</p>`;
  }

  function tabMutations() {
    const a = G.acct;
    const run = (G.player && G.player.muts) || [];
    const seen = a.seenMuts || {};
    const bankable = MU.POOL.filter(m => seen[m.id] && (m.rarity === 'common' || m.rarity === 'uncommon'));

    return `<p class="lead">Mutations are drafted during a run and die with it.
      The bank is the exception: Dinollars buy a slot that is already filled when
      the next hatchling opens its eyes.</p>

      <h3>This run</h3>
      ${run.length ? run.map(id => mutRow(MU.BY_ID[id], '')).join('')
        : '<p class="dim small">Nothing yet. The first draft is at 12% growth.</p>'}

      <h3>Banked — ${a.mutBank.length}/${S.BANK.slots} slots</h3>
      ${a.mutBank.length ? a.mutBank.map(id =>
        mutRow(MU.BY_ID[id], `<button class="mini ghost" data-act="unbankmut" data-v="${id}">drop</button>`)).join('')
        : '<p class="dim small">Empty.</p>'}

      <h3>Bankable — ${D$(S.BANK.cost)} each</h3>
      <p class="dim small">Only mutations a run has actually shown you, and never
      the Rare or Apex ones — those have to be earned every time.</p>
      ${bankable.length ? bankable.map(m => mutRow(m,
        a.mutBank.indexOf(m.id) >= 0 ? '<u class="owned">banked</u>'
          : `<button class="mini" data-act="bankmut" data-v="${m.id}">${fmt(S.BANK.cost)}</button>`)).join('')
        : '<p class="dim small">Survive long enough to draft something first.</p>'}

      <h3>The pool</h3>
      <table class="odds">${MU.POOL.map(m =>
        `<tr class="${m.rarity === 'apex' ? 'legendary' : m.rarity === 'rare' ? 'epic' : m.rarity === 'uncommon' ? 'rare' : 'common'}">
          <td>${m.icon} ${esc(m.name)}</td><td>${MU.RARITY[m.rarity].name}</td></tr>`).join('')}</table>`;
  }

  function mutRow(m, right) {
    return `<div class="row mutrow ${m.rarity}">
      <i>${m.icon}</i>
      <div><b>${esc(m.name)} <em class="rar">${MU.RARITY[m.rarity].name}</em></b><span>${esc(m.desc)}</span></div>
      ${right || ''}</div>`;
  }

  function tabCrates() {
    const a = G.acct;
    const ev = Math.round(S.crateEV());
    const table = S.CRATE.table;
    const total = table.reduce((s, e) => s + e.w, 0);
    return `<p class="lead">${S.CRATE.name} — ${D$(S.CRATE.cost)}, or ten for ${fmt(S.CRATE.tenCost)}.</p>
      <div class="row2">
        <button class="wide gold" data-act="crate" data-v="1">Open 1 · ${fmt(S.CRATE.cost)}</button>
        <button class="wide gold" data-act="crate" data-v="10">Open 10 · ${fmt(S.CRATE.tenCost)}</button>
      </div>
      <div class="pity">Pity counter: <b>${a.crate.pity}/${S.CRATE.pity}</b> — a Legendary is guaranteed at ${S.CRATE.pity}.
        <span>${a.crate.pulls} opened</span></div>
      <h3>Full odds</h3>
      <table class="odds">${table.map(e => `<tr class="${e.rarity}">
        <td>${esc(e.name)}</td><td>${e.rarity}</td><td>${(e.w / total * 100).toFixed(2)}%</td></tr>`).join('')}</table>
      <p class="fine">Expected value of one pull: about <b>${fmt(ev)} ${S.CUR.short}</b> against a
      ${S.CRATE.cost} price. Printing that number is the difference between a
      crate and a con.</p>`;
  }

  function openCrate(n) {
    const res = M.openCrates(G, n);
    if (!res) { denied(); return; }
    haptic(40);
    const rows = res.map(r => `<div class="drop ${r.rarity}">
      <b>${esc(r.name)}</b><span>${esc(r.detail || '')}</span>
      ${r.pitied ? '<em>pity</em>' : ''}</div>`).join('');
    openModal('crate', `<h2>${n === 10 ? 'Ten crates' : 'Crate'}</h2>
      <div class="drops">${rows}</div>
      <div class="row2">
        <button class="wide gold" data-act="crate" data-v="${n}">Again · ${fmt(n === 10 ? S.CRATE.tenCost : S.CRATE.cost)}</button>
        <button class="wide ghost" data-act="store" data-v="crates">Done</button>
      </div>`, { sheet: true });
  }

  function tabPass() {
    const p = G.acct.pass;
    const inTier = p.xp % S.PASS.xpPerTier;
    const rows = [];
    const from = Math.max(1, p.tier - 2);
    for (let t = from; t <= Math.min(S.PASS.tiers, from + 11); t++) {
      rows.push(`<tr class="${t <= p.tier ? 'got' : ''}">
        <td class="tier">${t}</td>
        <td>${rewardName(S.PASS.freeReward(t))}${p.claimedFree[t] ? ' ✓' : ''}</td>
        <td class="${p.premium ? 'prem' : 'lockedcell'}">${rewardName(S.PASS.premReward(t))}${p.claimedPrem[t] ? ' ✓' : ''}</td></tr>`);
    }
    return `<p class="lead">${S.PASS.seasonName} — tier <b>${p.tier}</b>/${S.PASS.tiers}.
      XP comes from surviving, growing, killing and mutating.</p>
      <div class="xpbar"><i style="width:${(inTier / S.PASS.xpPerTier) * 100}%"></i>
        <b>${inTier} / ${S.PASS.xpPerTier} XP</b></div>
      ${p.premium ? '<div class="ok">Apex Pass active.</div>'
        : `<button class="wide gold" data-act="buypass">Unlock Apex Pass · ${fmt(S.PASS.cost)}</button>`}
      <div class="row2">
        <button class="wide" data-act="claimpass">Claim everything unlocked</button>
        <button class="wide" data-act="skiptier">Skip a tier · ${fmt(S.PASS.tierSkip)}</button>
      </div>
      <table class="pass"><tr><th>Tier</th><th>Free</th><th>Apex</th></tr>${rows.join('')}</table>
      <p class="fine">The free track pays bones. The paid track pays growth. That
      difference is the entire design of a season pass, and it is worth seeing
      written out.</p>`;
  }

  function rewardName(r) {
    if (!r) return '—';
    if (r.bones) return r.bones + ' bones';
    if (r.dino) return r.dino + ' ' + S.CUR.short;
    if (r.species) return C.SPECIES[r.species].name;
    if (r.item) return S.ITEMS[r.item].name + (r.n > 1 ? ' ×' + r.n : '');
    return '—';
  }

  function tabClub() {
    const on = M.clubActive(G);
    const left = on ? (G.acct.clubUntil - Date.now()) / 3600000 : 0;
    return `<div class="vipcard">
        <h3>👑 ${S.CLUB.name}</h3>
        <p>${esc(S.CLUB.blurb)}</p>
        <ul>
          <li>Growth rate ×${S.CLUB.growthMult}</li>
          <li>Respawn timers ×${S.CLUB.respawnMult}</li>
          <li>Bones ×${S.CLUB.boneMult}</li>
          <li>Hunger and thirst drain ×${S.CLUB.hungerMult}</li>
          <li>The Exchange earns ×${S.CLUB.exchangeMult}</li>
        </ul>
        ${on ? `<div class="ok">Active — ${left.toFixed(1)} hours left</div>` : ''}
        <button class="wide gold" data-act="buyclub">${on ? 'Extend' : 'Join'} for a day · ${fmt(S.CLUB.cost)}</button>
      </div>
      <p class="fine">A membership is the strongest thing in the shop because it
      multiplies the clock rather than handing over an item — including the clock
      on the Exchange that pays for it.</p>`;
  }

  function tabSpecies() {
    return `<p class="lead">Species. The premium ones are better, and the numbers are printed.</p>
      ${Object.keys(C.SPECIES).map(id => {
        const sp = C.SPECIES[id];
        const open = M.unlocked(G, id);
        const pr = S.SPECIES_PRICE[id];
        return `<div class="row species ${sp.premium ? 'prem' : ''}">
          <div><b>${esc(sp.name)}</b><span>${esc(sp.tag)} · ❤${sp.hp} 🦷${sp.dmg} 💨${sp.spd} 🌱${sp.growthRate}×</span>
          <span class="sub">${esc(sp.blurb)}</span></div>
          ${open ? '<u class="owned">owned</u>'
            : `<div class="btns">
                <button class="mini" data-act="buyspecies" data-v="${id}">${fmt(pr.cost)}</button>
                <button class="mini ghost" data-act="shardspecies" data-v="${id}">${pr.shards}💠</button>
              </div>`}
        </div>`;
      }).join('')}
      <h3>Skins</h3>
      <div class="skins">
        <button class="skin ${G.acct.skin ? '' : 'on'}" data-act="setskin" data-v="none">none</button>
        ${G.acct.skins.map(s => `<button class="skin ${G.acct.skin === s ? 'on' : ''} ${S.SKINS[s].rarity}"
          data-act="setskin" data-v="${s}">${esc(S.SKINS[s].name)}</button>`).join('')}
      </div>`;
  }

  function tabDeals() {
    const list = G.acct.deals;
    if (!list.length) {
      return `<p class="lead">No deals right now.</p>
      <p class="fine">Deals are not random. Each one waits for a moment:
      ${Object.values(S.DEALS).map(o => `<b>${esc(o.name)}</b> — ${triggerName(o.trigger)}`).join('; ')}.
      Three of those four are moments the game has just taken something from you.
      That timing is the oldest trick in the business, and it works just as well
      when the price is Dinollars — which is exactly why it is worth seeing it
      labelled.</p>`;
    }
    return list.map(o => {
      const def = S.DEALS[o.id];
      const left = Math.max(0, (o.until - Date.now()) / 1000);
      return `<div class="offercard">
        <h3>${esc(def.name)}</h3>
        <p>${esc(def.blurb)}</p>
        <div class="gives">${giveList(def.give)}</div>
        <div class="timer">⏳ ${clock(left)} left</div>
        <button class="wide gold" data-act="buydeal" data-v="${o.id}">${D$(def.cost)}</button>
      </div>`;
    }).join('');
  }

  /* The interstitial. A timed deal does not wait politely in a tab — it takes
   * the whole screen the moment the game has hurt you, with the buy button
   * large and the way out small. Both halves of that are the design. */
  function openDealPopup(id) {
    const def = S.DEALS[id];
    const held = G.acct.deals.find(x => x.id === id);
    if (!def || !held) return;
    openModal('deal', `<div class="offercard big">
        <div class="flag">LIMITED TIME</div>
        <h3>${esc(def.name)}</h3>
        <p>${esc(def.blurb)}</p>
        <div class="gives">${giveList(def.give)}</div>
        <div class="timer" id="dealtimer">⏳ —</div>
        <button class="wide gold" data-act="buydeal" data-v="${id}">Take it — ${D$(def.cost)}</button>
        <button class="tinyno" data-act="close">no thanks</button>
      </div>`, { sheet: true });
    const step = () => {
      if (modalOpen !== 'deal') return;
      const t = $('dealtimer');
      if (t) t.textContent = '⏳ ' + clock(Math.max(0, (held.until - Date.now()) / 1000)) + ' left';
      requestAnimationFrame(step);
    };
    step();
  }

  function triggerName(t) {
    return { firstDeath: 'your first death', deathStreak: 'three deaths in a row',
      nearAdult: 'passing 70% growth', richExchange: 'a fat Exchange balance' }[t] || t;
  }

  function giveList(gv) {
    const out = [];
    if (gv.dino) out.push(`${fmt(gv.dino)} ${S.CUR.short}`);
    if (gv.bones) out.push(`${fmt(gv.bones)} bones`);
    if (gv.shards) out.push(`${gv.shards} shards`);
    if (gv.item) out.push(`${S.ITEMS[gv.item].name} ×${gv.n || 1}`);
    if (gv.item2) out.push(`${S.ITEMS[gv.item2].name} ×${gv.n2 || 1}`);
    if (gv.mutBank) out.push('a banked mutation');
    if (gv.species) out.push(C.SPECIES[gv.species].name);
    return out.map(x => `<span>${esc(x)}</span>`).join('');
  }

  function tabBones() {
    return `<p class="lead">Bones are the survival game's own currency — earned by
      staying alive, growing, killing and mutating. They buy nothing the Exchange
      sells, and they are deliberately thin.</p>
      ${Object.values(S.BONE_ITEMS).map(it => {
        const n = G.acct.boneItems[it.id] || 0;
        return `<div class="row item">
          <i>${it.icon}</i>
          <div><b>${esc(it.name)}${n ? ` <em class="tag">×${n}</em>` : ''}</b><span>${esc(it.blurb)}</span></div>
          <div class="btns">
            ${n ? `<button class="mini use" data-act="usebone" data-v="${it.id}">Use</button>` : ''}
            <button class="mini" data-act="buybone" data-v="${it.id}">${it.bones}🦴</button>
          </div></div>`;
      }).join('')}
      <p class="fine">A Weak Serum is ${S.BONE_ITEMS.serumLite.bones} bones for +2.5% growth;
      a Growth Serum is ${S.ITEMS.serum.cost} ${S.CUR.short} for +12%. Surviving pays about
      ${S.BONES_PER.survive60s} bones a minute. Nearly five times the growth for a
      fraction of the effort is the whole free-to-play bargain, written out — except
      that here the other side of the bargain is a second game rather than a card.</p>`;
  }

  function tabLedger() {
    const L = M.ledger(G);
    const a = G.acct;
    const adv = M.advantage(G);
    const s = G.idle;
    return `<div class="receipt">
      <h3>📒 Where the Dinollars went</h3>
      <div class="total">${fmt(L.spent)} <small>${S.CUR.short}</small></div>
      <p class="dim small">Lifetime earned on the Exchange: ${fmt(L.earned)} · held now: ${fmt(L.held)}</p>
      ${L.lines.length ? `<table class="lines">${L.lines.map(l =>
        `<tr><td>${esc(l.what)}</td><td>${fmt(l.cost)}</td></tr>`).join('')}</table>`
        : '<p class="dim">Nothing spent yet.</p>'}

      <h3>How much of this run the Exchange is carrying</h3>
      <div class="advbar"><i style="width:${adv}%"></i><b>${adv}/100</b></div>
      <p class="fine">Species, membership, pass, revives, serums and banked
      mutations in hand. At 0 you are playing the survival game on its own terms;
      about a third of the lobby sits above 40.</p>

      <table class="lines">
        <tr><td>Runs</td><td>${a.lives}</td></tr>
        <tr><td>Deaths</td><td>${a.deaths}</td></tr>
        <tr><td>Revives used</td><td>${a.revivesUsed}</td></tr>
        <tr><td>Serums used</td><td>${a.serumsUsed}</td></tr>
        <tr><td>Crates opened</td><td>${a.crate.pulls}</td></tr>
        <tr><td>Best growth</td><td>${Math.round((a.bestGrowth || 0) * 100)}%</td></tr>
        <tr><td>Specimens banked</td><td>${s.specimens}</td></tr>
        <tr><td>Extinction events</td><td>${s.prestiges}</td></tr>
      </table></div>`;
  }

  function tabMenu() {
    const s = G.settings;
    return `<div class="menu">
      <button class="row tog" data-act="toggle" data-v="haptics"><b>Vibration</b><u>${s.haptics ? 'on' : 'off'}</u></button>
      <button class="row tog" data-act="toggle" data-v="lefty"><b>Left-handed stick</b><u>${s.lefty ? 'on' : 'off'}</u></button>
      <button class="row" data-act="about"><b>About this game</b><u>›</u></button>
      <button class="row" data-act="export"><b>Export save</b><u>›</u></button>
      <button class="row" data-act="import"><b>Import save</b><u>›</u></button>
      <button class="row danger" data-act="wipe"><b>Delete everything</b><u>›</u></button>
      <p class="fine">Progress saves to this browser every ten seconds. Nothing
      leaves the device, and nothing is ever charged for.</p>
    </div>`;
  }

  function openAbout() {
    openModal('about', `<h2>About</h2>
      <p><b>Three games in a trenchcoat.</b></p>
      <p><b>The isle.</b> A one-thumb survival game. Hatch at 6%, eat, drink,
      grow, avoid everything bigger. Death takes the whole run.</p>
      <p><b>The run.</b> At 12%, 22%, 35%, 52%, 70% and 88% growth the isle offers
      three mutations and you keep one. They stack and interact, and they die with
      the animal — so a grown dinosaur is a build, not just a bigger silhouette.</p>
      <p><b>The Exchange.</b> An incremental game that mints Dinollars, the only
      currency the shop takes. It runs while you are out on the isle, and every
      run banks specimens into it whether you live or die. No real money exists
      anywhere in here.</p>
      <p class="dim">The shop keeps the free-to-play shape — consumables, crates
      with a pity counter, a season pass, a membership, timed deals that fire the
      moment you die — because that shape is genuinely good at making a shop feel
      alive. What it does differently is print the numbers: crate odds and
      expected value, exact multipliers, what a bone is worth against a Dinollar,
      and a ledger of everything you have spent.</p>
      <button class="wide ghost" data-act="close">Close</button>`, { sheet: true });
  }

  /* Shown once on load, when the Exchange has been working without you. */
  function offlineReport(away) {
    if (!away || !away.got) return;
    openModal('offline', `<h2>While you were away</h2>
      <p class="big">+${fmt(away.got)} ${S.CUR.short}</p>
      <p class="dim">The Exchange ran for ${clock(away.secs)} at a reduced rate.
      It caps at eight hours.</p>
      <button class="wide gold" data-act="store" data-v="exchange">Open the Exchange</button>
      <button class="wide ghost" data-act="close">Back to the isle</button>`, { sheet: true });
  }

  // --- save plumbing --------------------------------------------------------
  function doExport() {
    const text = ISLE.core.exportSave(ISLE.state.forSave(G));
    openModal('export', `<h2>Export</h2><p class="dim small">Copy this text.</p>
      <textarea readonly rows="6">${esc(text)}</textarea>
      <button class="wide ghost" data-act="close">Close</button>`, { sheet: true });
    const ta = el.modal.querySelector('textarea');
    ta.focus(); ta.select();
  }

  function doImport() {
    openModal('import', `<h2>Import</h2><p class="dim small">Paste a save. This replaces everything.</p>
      <textarea id="impbox" rows="6" placeholder="paste here"></textarea>
      <button class="wide gold" id="impgo">Load it</button>
      <button class="wide ghost" data-act="close">Cancel</button>`, { sheet: true });
    $('impgo').addEventListener('click', () => {
      try {
        const g = ISLE.state.hydrate(ISLE.core.importSave($('impbox').value));
        if (!g) throw new Error('bad save');
        ISLE.main.replace(g);
        forceClose();
        flash('Save loaded.');
      } catch (e) { flash('That is not a save.'); }
    });
  }

  function doWipe() {
    openModal('wipe', `<h2>Delete everything?</h2>
      <p>The account, the Exchange, the ledger, the island. All of it.</p>
      <button class="wide danger" id="wipego">Delete</button>
      <button class="wide ghost" data-act="close">Keep it</button>`, { sheet: true });
    $('wipego').addEventListener('click', () => { ISLE.core.wipe(); location.reload(); });
  }

  // --- boot ----------------------------------------------------------------
  function showStart(cb) {
    openModal('start', `<div class="start">
      <h1>PRIMAL ISLE</h1>
      <p class="tagline">Hatch. Eat. Grow. Mutate. Get eaten.</p>
      <p class="dim">A survival game where every life is a roguelike run, funded by
      an incremental game you play in the same app. Dinollars are dug, not
      bought — there is no real money anywhere in this.</p>
      <button class="wide gold" id="startgo">Play</button>
      <p class="tiny dim">Drag the left side to move · buttons on the right</p>
    </div>`, { locked: true, sheet: true });
    $('startgo').addEventListener('click', () => {
      forceClose();
      openSpeciesPick(sp => { forceClose(); cb(sp); }, true);
    });
  }

  ISLE.ui = {
    init, setGame, frame, input, showStart, openSpeciesPick, openStore, flash,
    paused, offlineReport,
    log: (g, text, tone) => Sim.feed(g, text, tone)
  };
})(window.ISLE = window.ISLE || {});
