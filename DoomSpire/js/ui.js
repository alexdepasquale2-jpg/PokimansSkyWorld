/* DoomSpire — every DOM surface: the HUD, the ability bar, character
 * creation, and every panel (character, talents, bags, quests, professions,
 * reputation, party, and whatever NPC you're standing in front of).
 *
 * Panels are rebuilt from scratch on open and on action (innerHTML from a
 * template string) since they're opened rarely; the HUD bars and ability
 * cooldowns are touched every frame with direct property writes, the same
 * split PrimalIsle's ui.js makes.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const K = DS.content;

  const RES_COLOR = { rage: '#c0392b', mana: '#2f6fb0', energy: '#e0b23a' };
  const RES_NAME = { rage: 'Rage', mana: 'Mana', energy: 'Energy' };

  let els = {};
  let game = null;
  let ui = { panel: null, panelCtx: null };
  let onStartCb = null;

  function q(sel, root) { return (root || document).querySelector(sel); }
  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
  function qcolor(key) { return (K.QUALITY_BY_KEY[key] || K.QUALITY_BY_KEY.common).color; }

  function boot() {
    els = {
      scene: q('#scene'), minimap: q('#minimap'), stage: q('#stage'), stick: q('#stick'), knob: q('#knob'),
      hpFill: q('#hp-fill'), hpText: q('#hp-text'), resFill: q('#res-fill'), resText: q('#res-text'),
      xpFill: q('#xp-fill'), lvlText: q('#lvl-text'), nameText: q('#name-text'),
      zoneText: q('#zone-text'), goldText: q('#gold-text'),
      log: q('#combat-log'), interactBtn: q('#interact-btn'),
      abilityBar: q('#ability-bar'), menuBtn: q('#menu-btn'), targetBar: q('#target-bar'),
      targetName: q('#target-name'), targetFill: q('#target-fill'),
      panelsHost: q('#panels'), tabs: q('#tabs'),
      charcreate: q('#charcreate'), deathscreen: q('#deathscreen'), comboWrap: q('#combo-points')
    };
    DS.engine.input = DS.engine.makeInput({ stage: els.stage, stick: els.stick, knob: els.knob });
    els.interactBtn.addEventListener('click', onInteract);
    els.menuBtn.addEventListener('click', () => openPanel(ui.panel ? null : 'character'));
    els.panelsHost.addEventListener('click', onPanelClick);
    els.tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) openPanel(b.dataset.tab); });
    q('#deathscreen .respawn-btn').addEventListener('click', () => { DS.sim.respawnPlayer(game); closeDeath(); });
    window.addEventListener('resize', () => DS.render.resize());
    buildCharCreate();
  }

  // --- character creation ---------------------------------------------------
  function buildCharCreate() {
    const list = q('#class-list');
    list.innerHTML = Object.values(K.CLASSES).map(c => `
      <button class="class-card" data-cls="${c.id}">
        <div class="cc-icon">${c.icon}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-role">${c.role}</div>
        <div class="cc-blurb">${c.blurb}</div>
      </button>`).join('');
    let chosen = null;
    list.addEventListener('click', e => {
      const b = e.target.closest('.class-card'); if (!b) return;
      list.querySelectorAll('.class-card').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel'); chosen = b.dataset.cls;
      q('#begin-btn').disabled = false;
    });
    q('#begin-btn').addEventListener('click', () => {
      if (!chosen) return;
      const name = (q('#name-input').value || 'Adventurer').trim().slice(0, 18);
      const g = DS.state.newGame(name, chosen);
      els.charcreate.classList.add('hidden');
      onStartCb && onStartCb(g);
    });
  }
  function showCharCreate(onStart) { onStartCb = onStart; els.charcreate.classList.remove('hidden'); }

  function startGame(g) {
    game = g;
    DS.render.init(els.scene, els.minimap);
    buildAbilityBar();
    renderStaticHeader();
  }

  function renderStaticHeader() {
    els.nameText.textContent = `${game.player.name}`;
  }

  // --- ability bar -----------------------------------------------------------
  function buildAbilityBar() {
    const abilities = DS.player.abilityList(game.player);
    els.abilityBar.innerHTML = abilities.map((a, i) => `
      <button class="ability-btn" data-ability="${a.id}" title="${a.name}">
        <span class="ab-icon">${a.icon}</span>
        <span class="ab-cd"></span>
        <span class="ab-key">${i + 1}</span>
      </button>`).join('');
    els.abilityBar.querySelectorAll('.ability-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = DS.sim.useAbility(game, btn.dataset.ability);
        if (!res.ok && res.reason !== 'gcd' && res.reason !== 'cooldown') { DS.sim.log(game, `Can't use that (${res.reason}).`); refreshLog(); }
      });
    });
  }

  // --- per-frame HUD ----------------------------------------------------------
  let lastLogLen = -1;
  function frame(dt) {
    if (!game) return;
    const p = game.player;
    if (!p.alive) { showDeath(); return; }
    const d = DS.player.refreshVitals(p);
    els.hpFill.style.width = C.pct(p.hp.current / p.hp.max);
    els.hpText.textContent = `${Math.round(p.hp.current)} / ${p.hp.max}`;
    const resKind = K.CLASSES[p.cls].resource;
    els.resFill.style.width = C.pct(p.resource.current / p.resource.max);
    els.resFill.style.background = RES_COLOR[resKind];
    els.resText.textContent = `${Math.round(p.resource.current)} / ${p.resource.max} ${RES_NAME[resKind]}`;
    const need = DS.player.xpForLevel(p.level);
    els.xpFill.style.width = p.level >= K.LEVEL_CAP ? '100%' : C.pct(p.xp / need);
    els.lvlText.textContent = `Lv ${p.level} ${K.CLASSES[p.cls].icon} ${K.CLASSES[p.cls].name}`;
    els.zoneText.textContent = K.ZONES[p.zone].name;
    els.goldText.textContent = `${p.gold}g`;

    els.comboWrap.innerHTML = K.CLASSES[p.cls].comboPoints
      ? Array.from({ length: 5 }, (_, i) => `<i class="${i < p.comboPoints ? 'on' : ''}"></i>`).join('') : '';

    const abilities = DS.player.abilityList(p);
    els.abilityBar.querySelectorAll('.ability-btn').forEach(btn => {
      const a = abilities.find(x => x.id === btn.dataset.ability);
      const cd = (p.cooldowns[a.id] || 0);
      const cdEl = btn.querySelector('.ab-cd');
      cdEl.style.height = cd > 0 ? C.pct(cd / (a.cd || 1)) : '0%';
      const cost = a.cost || 0;
      btn.classList.toggle('unaffordable', cost > (p.resource.current || 0) && !a.self);
    });

    if (game.target && game.target.alive) {
      els.targetBar.classList.remove('hidden');
      els.targetName.textContent = `${game.target.name} · Lv ${game.target.level}`;
      els.targetFill.style.width = C.pct(game.target.hp.current / game.target.hp.max);
    } else els.targetBar.classList.add('hidden');

    const rt = DS.state.currentRuntime(game);
    const near = DS.world.nearbyInteractable(p, rt);
    if (near) {
      els.interactBtn.classList.remove('hidden');
      els.interactBtn.textContent = interactLabel(near);
    } else els.interactBtn.classList.add('hidden');

    if (game.combatLog.length !== lastLogLen) { refreshLog(); lastLogLen = game.combatLog.length; }
    if (ui.panel) refreshOpenPanel();
  }

  function interactLabel(near) {
    if (near.kind === 'node') return `⛏️ Gather ${near.ref.kind === 'mining' ? 'Ore' : 'Herb'}`;
    if (near.kind === 'portal') return `🌀 Enter the Vault`;
    if (near.kind === 'exit') return `➜ ${K.ZONES[near.ref.toZone].name}`;
    const n = near.ref;
    if (n.vendor) return `💰 Trade with ${n.name}`;
    if (n.kind === 'trainer') return `🏛️ Speak with ${n.name}`;
    if (n.kind === 'proftrainer') return `⚙️ Speak with ${n.name}`;
    return `❗ Speak with ${n.name}`;
  }

  function refreshLog() {
    els.log.innerHTML = game.combatLog.slice(-8).map(m => `<div>${m}</div>`).join('');
    els.log.scrollTop = els.log.scrollHeight;
  }

  function onInteract() {
    const rt = DS.state.currentRuntime(game);
    const near = DS.world.nearbyInteractable(game.player, rt);
    if (!near) return;
    if (near.kind === 'node') { const r = DS.world.gatherNode(game.player, near.ref); DS.sim.log(game, r.msg); refreshLog(); return; }
    if (near.kind === 'portal') {
      const r = DS.world.enterPortal(game.player);
      if (!r.ok) { DS.sim.log(game, r.msg); refreshLog(); return; }
      DS.state.warp(game, r.toZone, r.toX, r.toY, r.toFacing);
      DS.sim.log(game, `You step through into ${K.ZONES[r.toZone].name}.`);
      refreshLog(); return;
    }
    if (near.kind === 'exit') return; // handled automatically by sim
    openPanel('npc', { npc: near.ref });
  }

  // --- panels -----------------------------------------------------------------
  function openPanel(kind, ctx) {
    if (!kind) { closePanel(); return; }
    ui.panel = kind; ui.panelCtx = ctx || null;
    els.tabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === kind));
    els.panelsHost.classList.remove('hidden');
    renderPanel();
  }
  function closePanel() {
    ui.panel = null; ui.panelCtx = null;
    els.panelsHost.classList.add('hidden');
    els.tabs.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
  }
  function paused() { return !!ui.panel; }
  function refreshOpenPanel() { renderPanel(); }

  function renderPanel() {
    const p = game.player;
    let html = '';
    switch (ui.panel) {
      case 'character': html = renderCharacter(p); break;
      case 'talents': html = renderTalents(p); break;
      case 'bags': html = renderBags(p); break;
      case 'quests': html = renderQuests(p); break;
      case 'professions': html = renderProfessions(p); break;
      case 'reputation': html = renderReputation(p); break;
      case 'party': html = renderParty(p); break;
      case 'npc': html = renderNpc(p, ui.panelCtx.npc); break;
      default: html = '';
    }
    els.panelsHost.querySelector('.panel-body').innerHTML = html;
    const title = els.panelsHost.querySelector('.panel-title');
    title.textContent = ui.panel === 'npc' ? ui.panelCtx.npc.name : C.titleCase(ui.panel);
  }

  function slotIcon(slot) {
    return ({ head: '🪖', neck: '📿', shoulder: '🎽', cloak: '🧣', chest: '👕', wrist: '⌚', hands: '🧤', waist: '🎗️', legs: '👖', feet: '🥾', ring1: '💍', ring2: '💍', trinket1: '🔮', trinket2: '🔮', mainhand: '🗡️', offhand: '🛡️' })[slot] || '❔';
  }
  function itemLine(it, extraBtns) {
    const color = qcolor(it.quality);
    const sub = it.slot ? `${K.SLOT_WEIGHT[it.slot] ? C.titleCase(it.slot.replace(/[12]$/, '')) : ''}${it.ilvl ? ` · ilvl ${it.ilvl}` : ''}`
      : it.potion ? 'Potion' : it.enchant ? 'Enchant' : it.matId ? 'Material' : 'Item';
    const stats = Object.entries(it.stats || {}).filter(([, v]) => v).map(([k, v]) => `+${v} ${k}`).join(', ');
    const dmg = it.dmgLo ? `${it.dmgLo}-${it.dmgHi} dmg, ${it.speed.toFixed(1)} spd` : '';
    return `<div class="item-row">
      <div class="item-main">
        <b style="color:${color}">${it.name}</b>
        <span class="item-sub">${sub}</span>
        ${stats || dmg ? `<div class="item-stats">${[dmg, stats].filter(Boolean).join(' · ')}</div>` : ''}
      </div>
      <div class="item-btns">${extraBtns}</div>
    </div>`;
  }

  function renderCharacter(p) {
    const d = DS.player.derived(p);
    const eq = K.SLOTS.map(s => {
      const it = p.equip[s];
      return `<button class="slot-cell" data-act="unequip" data-slot="${s}" ${it ? '' : 'disabled'}>
        <span>${it ? '' : slotIcon(s)}</span>
        <b style="color:${it ? qcolor(it.quality) : '#5f6b82'}">${it ? it.name : C.titleCase(s.replace(/[12]$/, ''))}</b>
      </button>`;
    }).join('');
    return `
      <div class="stat-grid">
        <div>Strength <b>${Math.round(d.str)}</b></div><div>Agility <b>${Math.round(d.agi)}</b></div>
        <div>Intellect <b>${Math.round(d.int)}</b></div><div>Stamina <b>${Math.round(d.sta)}</b></div>
        <div>Spirit <b>${Math.round(d.spirit)}</b></div><div>Armor <b>${d.armor}</b></div>
        <div>Attack Power <b>${d.attackPower}</b></div><div>Spell Power <b>${d.spellPower}</b></div>
        <div>Crit <b>${C.pct(d.critChance)}</b></div><div>Haste <b>${C.pct(d.hastePct)}</b></div>
      </div>
      <h4>Equipped</h4>
      <div class="slot-grid">${eq}</div>`;
  }

  function renderTalents(p) {
    const cls = K.CLASSES[p.cls];
    const tiers = K.talentTiers();
    const spent = DS.player.talentPointsSpent(p);
    const groups = [1, 2, 3, 4, 5].map(tier => {
      const unlocked = spent >= tiers[tier];
      const items = cls.talents.filter(t => t.tier === tier).map(t => {
        const rank = p.talents[t.id] || 0;
        const can = DS.player.canSpendTalent(p, t.id);
        return `<button class="talent-cell ${rank > 0 ? 'ranked' : ''} ${can ? 'can' : ''}" data-act="talent" data-id="${t.id}" ${unlocked ? '' : 'disabled'}>
          <span class="t-icon">${t.icon}</span>
          <b>${t.name}</b>
          <span class="t-rank">${rank}/${t.maxRank}</span>
          <div class="t-desc">${t.desc}</div>
        </button>`;
      }).join('');
      return `<div class="talent-tier ${unlocked ? '' : 'locked'}">
        <div class="tier-label">${unlocked ? `Tier ${tier}` : `Tier ${tier} — needs ${tiers[tier]} points spent`}</div>
        <div class="talent-row">${items}</div>
      </div>`;
    }).join('');
    return `<div class="talent-header">
        <span>${p.talentPoints} point${p.talentPoints === 1 ? '' : 's'} available</span>
        <button class="mini-btn" data-act="respec">Reset (${DS.world.respecCost(p)}g)</button>
      </div>${groups}`;
  }

  function renderBags(p) {
    const items = p.bags.map(it => itemLine(it,
      (it.slot ? `<button class="mini-btn" data-act="equip" data-iid="${it.iid}">Equip</button>` : '') +
      (it.potion ? `<button class="mini-btn" data-act="usepotion" data-iid="${it.iid}">Use</button>` : '') +
      (it.enchant ? `<button class="mini-btn" data-act="useenchant" data-iid="${it.iid}">Apply</button>` : '') +
      (it.questItem ? '' : `<button class="mini-btn" data-act="sell" data-iid="${it.iid}">Sell ${it.sell}g</button>`)
    )).join('') || '<p class="empty">Nothing here.</p>';
    return `<div class="bag-header">${p.bags.length} / ${DS.player.BAG_SIZE} — ${p.gold}g</div>${items}`;
  }

  function renderQuests(p) {
    const active = Object.entries(p.quests.active).map(([qid, a]) => {
      const q = K.QUESTS[qid];
      const goal = q.kind === 'kill' ? `${K.BESTIARY[q.target].name} ${a.progress}/${q.count}` : q.kind === 'collect' ? `${q.item.replace(/_/g, ' ')} ${a.progress}/${q.count}` : 'Return and report';
      return `<div class="quest-row"><b>${q.name}</b><div class="quest-sub">${K.ZONES[q.zone].name} · ${goal}</div><div class="quest-text">${q.text}</div></div>`;
    }).join('') || '<p class="empty">No active quests.</p>';
    return `<h4>Active</h4>${active}<h4>Completed (${p.quests.completed.length})</h4>`;
  }

  function renderProfessions(p) {
    const learnedGather = p.professions.learned.filter(id => K.GATHER_PROFESSIONS[id]);
    const learnedCraft = p.professions.learned.filter(id => K.CRAFT_PROFESSIONS[id]);
    const allIds = Object.keys(K.GATHER_PROFESSIONS).concat(Object.keys(K.CRAFT_PROFESSIONS));
    const learnRow = p.professions.learned.length >= 2 ? '' : `<div class="learn-row">${allIds.filter(id => !p.professions.learned.includes(id)).map(id => {
      const def = K.GATHER_PROFESSIONS[id] || K.CRAFT_PROFESSIONS[id];
      return `<button class="mini-btn" data-act="learnprof" data-id="${id}">${def.icon} Learn ${def.name}</button>`;
    }).join('')}</div>`;
    const gatherHtml = learnedGather.map(id => {
      const skill = p.professions.skill[id] || 0;
      return `<div class="prof-block"><b>${K.GATHER_PROFESSIONS[id].icon} ${K.GATHER_PROFESSIONS[id].name}</b>
        <div class="skillbar"><i style="width:${C.pct(skill / 300)}"></i></div>
        <span>${skill} / 300 — ${K.SKILL_TIER_NAME(skill)}</span></div>`;
    }).join('');
    const craftHtml = learnedCraft.map(id => {
      const prof = K.CRAFT_PROFESSIONS[id];
      const skill = p.professions.skill[id] || 0;
      const recipes = prof.recipes.map(r => {
        const can = DS.world.canCraft(p, id, r);
        const matsStr = Object.entries(r.mats).map(([m, n]) => `${DS.world.matName(m)} ${DS.world.matCount(p, m)}/${n}`).join(', ');
        return `<div class="recipe-row"><b>${r.name}</b><span class="item-sub">req ${r.skillReq} skill — ${matsStr}</span>
          <button class="mini-btn" data-act="craft" data-prof="${id}" data-recipe="${r.id}" ${can ? '' : 'disabled'}>Craft</button></div>`;
      }).join('');
      return `<div class="prof-block"><b>${prof.icon} ${prof.name}</b>
        <div class="skillbar"><i style="width:${C.pct(skill / 300)}"></i></div>
        <span>${skill} / 300 — ${K.SKILL_TIER_NAME(skill)}</span>${recipes}</div>`;
    }).join('');
    return `${learnRow}${gatherHtml}${craftHtml}` || '<p class="empty">No professions learned.</p>';
  }

  function renderReputation(p) {
    return Object.values(K.FACTIONS).map(f => {
      const rep = p.rep[f.id] || 0;
      const tier = K.repTier(rep);
      const idx = K.FACTION_TIERS.findIndex(t => t.name === tier.name);
      const next = K.FACTION_TIERS[idx + 1];
      const span = next ? next.min - tier.min : 1;
      const into = rep - tier.min;
      return `<div class="rep-row"><b>${f.name}</b><span class="item-sub">${tier.name} (${rep})</span>
        <div class="skillbar"><i style="width:${next ? C.pct(C.clamp(into / span, 0, 1)) : '100%'}"></i></div></div>`;
    }).join('');
  }

  function renderParty(p) {
    return Object.entries(DS.ai.COMPANION_DEFS).map(([id, def]) => {
      const c = p.companions[id];
      if (!c || !c.recruited) return `<div class="party-row dim"><b>${def.icon} ${def.name}</b><span class="item-sub">Not yet found — rumored to be somewhere out there.</span></div>`;
      const actor = game.companionsActive[id];
      const hpPct = actor ? actor.hp.current / actor.hp.max : 1;
      return `<div class="party-row"><b>${def.icon} ${def.name}</b><span class="item-sub">Lv ${actor ? actor.level : p.level} ${K.CLASSES[def.cls].name} — ${def.role}</span>
        <div class="skillbar"><i style="width:${C.pct(hpPct)};background:#79c07a"></i></div></div>`;
    }).join('');
  }

  function renderNpc(p, npc) {
    let html = '';
    if (npc.kind === 'quest' || npc.kind === 'companion') {
      const offer = DS.world.questsOffered(p, npc.id);
      const turn = DS.world.questsToTurnIn(p, npc.id);
      const prog = DS.world.questsInProgress(p, npc.id);
      html += turn.map(q => `<div class="quest-row"><b>${q.name}</b><div class="quest-text">Turn in for ${q.xp} xp, ${q.gold}g${q.rep ? `, +rep` : ''}${q.companion ? ', a companion' : ''}.</div>
        <button class="mini-btn" data-act="turnin" data-q="${q.id}">Turn In</button></div>`).join('');
      html += offer.map(q => `<div class="quest-row"><b>${q.name}</b><div class="quest-text">${q.text}</div>
        <button class="mini-btn" data-act="accept" data-q="${q.id}">Accept</button></div>`).join('');
      html += prog.map(q => `<div class="quest-row dim"><b>${q.name}</b><div class="quest-text">In progress.</div></div>`).join('');
      if (!offer.length && !turn.length && !prog.length) html += '<p class="empty">Nothing for you right now.</p>';
    }
    if (npc.vendor) {
      const stock = DS.world.vendorStock(npc, p);
      html += `<h4>For Sale</h4>` + stock.map(it => itemLine(it, `<button class="mini-btn" data-act="buy" data-npc="${npc.id}" data-iid="${it.iid}">Buy ${Math.max(1, Math.round((it.sell || 1) * 3.2))}g</button>`)).join('');
      html += `<h4>Sell From Bags</h4>` + (p.bags.length ? p.bags.map(it => itemLine(it, it.questItem ? '' : `<button class="mini-btn" data-act="sell" data-iid="${it.iid}">Sell ${it.sell}g</button>`)).join('') : '<p class="empty">Bags are empty.</p>');
    }
    if (npc.kind === 'trainer') {
      html += `<p>${npc.name} can unteach what you've learned, for a price.</p>
        <button class="mini-btn" data-act="respec">Reset Talents (${DS.world.respecCost(p)}g)</button>`;
    }
    if (npc.kind === 'proftrainer') {
      html += renderProfessions(p);
    }
    return html;
  }

  // --- action dispatch --------------------------------------------------------
  function onPanelClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) { if (e.target.closest('.panel-close')) closePanel(); return; }
    const p = game.player, d = btn.dataset;
    let msg = null;
    switch (d.act) {
      case 'unequip': if (DS.player.unequipToBag(p, d.slot)) msg = 'Unequipped.'; else msg = 'Bags are full.'; break;
      case 'equip': DS.player.equipFromBag(p, d.iid); break;
      case 'sell': msg = DS.world.sellItem(p, d.iid).msg; break;
      case 'usepotion': { const it = p.bags.find(b => b.iid === d.iid); if (it) { if (it.potion === 'heal') DS.combat.applyHeal(p, it.power); else DS.combat.addBuff(p, { key: 'potion_speed', name: 'Swiftness', icon: '💨', dur: 15, fields: { speedPct: it.power } }); DS.player.removeItem(p, d.iid); msg = `Used ${it.name}.`; } break; }
      case 'useenchant': { const it = p.bags.find(b => b.iid === d.iid); if (it) { const slot = K.SLOTS.find(s => p.equip[s] && !p.equip[s].__enchanted); if (slot) { Object.entries(it.enchant).forEach(([k, v]) => { p.equip[slot].stats[k] = (p.equip[slot].stats[k] || 0) + v; }); p.equip[slot].__enchanted = true; DS.player.removeItem(p, d.iid); msg = `Applied ${it.name} to ${slot}.`; } else msg = 'Every equipped item is already enchanted.'; } break; }
      case 'talent': if (DS.player.spendTalent(p, d.id)) { msg = 'Talent learned.'; buildAbilityBar(); } else msg = 'Cannot learn that yet.'; break;
      case 'respec': msg = DS.world.respec(p).msg; buildAbilityBar(); break;
      case 'learnprof': msg = DS.player.learnProfession(p, d.id) ? 'Profession learned.' : "Can't learn more professions."; break;
      case 'craft': msg = DS.world.craft(p, d.prof, K.CRAFT_PROFESSIONS[d.prof].recipes.find(r => r.id === d.recipe)).msg; break;
      case 'accept': msg = DS.player.acceptQuest(p, d.q) ? 'Quest accepted.' : "Can't accept that."; break;
      case 'turnin': { const q = DS.player.turnInQuest(p, d.q); msg = q ? `Turned in: ${q.name}.` : "Can't turn that in."; if (q) buildAbilityBar(); break; }
      case 'buy': { const npc = ui.panelCtx.npc; const item = DS.world.vendorStock(npc, p).find(it => it.iid === d.iid); msg = item ? DS.world.buyItem(p, npc, item).msg : null; break; }
      default: break;
    }
    if (msg) { DS.sim.log(game, msg); refreshLog(); }
    renderPanel();
  }

  // --- death ------------------------------------------------------------------
  function showDeath() { els.deathscreen.classList.remove('hidden'); }
  function closeDeath() { els.deathscreen.classList.add('hidden'); }

  DS.ui = { boot, showCharCreate, startGame, frame, paused, openPanel, closePanel };
})(window.DS = window.DS || {});
