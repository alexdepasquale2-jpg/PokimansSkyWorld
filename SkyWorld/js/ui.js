/* Skyward Reach — DOM interface: panels, tabs, modals, input. */
(function (SW) {
  'use strict';
  const C = SW.content;
  const F = SW.farm;
  const Cr = SW.creature;
  const S = SW.sim;
  const Ln = SW.lineage;
  const D = SW.discovery;
  const M = SW.minigames;
  const C2 = SW.content2;
  const W = SW.world;
  const B = SW.beast;
  const R = SW.relics;
  const T = SW.trade;
  const M2 = SW.mini2;
  const P = SW.prestige;
  const { clamp, fmt, titleCase } = SW.core;

  let G = null;
  let tab = 'farm';
  let lastFestivalShown = -1;
  let benchA = null, benchB = null;
  let relicPick = [];

  /* Every entry in the next-action list is a shortcut to the thing itself. */
  function doTodo(g, act) {
    if (act.startsWith('tab:')) { setTab(act.slice(4)); return; }
    switch (act) {
      case 'openevent': showEvent(g); break;
      case 'judge': Cr.praise(g); break;
      case 'breed': if (SW.lineage.canBreed(g)) SW.lineage.breed(g, false); break;
      case 'listen': M.startListen(g); break;
      case 'harvestall': batch(g, 'harvest'); break;
      case 'waterall': batch(g, 'water'); break;
    }
  }

  /* Batch work: the single biggest quality-of-life win once the farm is wide.
   * Costs the same focus per plot, just without the clicking. */
  function batch(g, what) {
    let n = 0;
    const list = what === 'harvest' ? F.ripePlots(g)
      : g.plots.filter(p => p.crop && p.water < 90).sort((a, b) => a.water - b.water);
    for (const p of list) {
      const before = g.res.focus;
      if (what === 'harvest') S.playerHarvest(g, p); else S.playerWater(g, p);
      if (g.res.focus === before) break;   // ran out of focus
      n++;
    }
    if (n) log(g, what === 'harvest' ? `You bring in ${n} plots.` : `You water ${n} plots.`, 'good');
    else log(g, 'Not enough focus.', 'warn');
    return n;
  }
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function log(g, text, tone) {
    if (!g) return;
    g.log.unshift({ day: g.day, text: text, tone: tone || 'info' });
    if (g.log.length > 140) g.log.length = 140;
    dirty.log = true;
  }

  const dirty = { log: true, panel: true, card: true };

  /* Panels are rebuilt several times a second. Only touch the DOM when the
   * markup actually changed, so hover states and scroll positions survive. */
  function setHTML(el, html) {
    if (el._last === html) return;
    el._last = html;
    el.innerHTML = html;
  }

  // --- bars --------------------------------------------------------------
  function bar(label, value, max, cls, extra) {
    const p = clamp(value / max, 0, 1) * 100;
    return `<div class="bar ${cls || ''}">
      <div class="bar-label"><span>${label}</span><span>${extra !== undefined ? extra : Math.round(value)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${p.toFixed(1)}%"></div></div>
    </div>`;
  }

  function axis(label, value, lowLabel, highLabel) {
    const p = (value + 100) / 200 * 100;
    return `<div class="axis">
      <div class="axis-head"><span>${lowLabel}</span><b>${label}</b><span>${highLabel}</span></div>
      <div class="axis-track"><div class="axis-mid"></div><div class="axis-knob" style="left:${p.toFixed(1)}%"></div></div>
    </div>`;
  }

  // --- top bar -----------------------------------------------------------
  function renderTop(g) {
    const rank = S.rankOf(g);
    const nxt = C.RANKS[Math.min(rank.id + 1, C.RANKS.length - 1)];
    const prog = nxt === rank ? 1 : clamp((g.res.renown - rank.renown) / (nxt.renown - rank.renown), 0, 1);
    $('res-coin').textContent = fmt(g.res.coin);
    $('res-wood').textContent = fmt(g.res.wood);
    $('res-prayer').textContent = fmt(g.res.prayer);
    $('res-renown').textContent = fmt(g.res.renown);
    $('res-insight').textContent = fmt(g.insight);
    $('res-focus').textContent = Math.floor(g.res.focus) + '/' + g.res.focusMax;
    $('focus-fill').style.width = (g.res.focus / g.res.focusMax * 100) + '%';
    $('hud-day').textContent = 'Day ' + g.day;
    const phase = g.dayTick / C.TICKS_PER_DAY;
    $('hud-clock').textContent = phase < 0.18 ? 'dawn' : phase < 0.52 ? 'midday' : phase < 0.72 ? 'dusk' : 'night';
    $('hud-rank').textContent = rank.name;
    $('hud-rank').style.color = rank.color;
    $('hud-place').textContent = g.lastStanding ? '#' + g.lastStanding + ' of ' + (g.rivals.length + 1) : '—';
    $('rank-fill').style.width = (prog * 100) + '%';
    $('rank-fill').style.background = rank.color;
    $('rank-next').textContent = nxt === rank ? 'the top' : `${fmt(nxt.renown - g.res.renown)} to ${nxt.name}`;
  }

  // --- creature card -----------------------------------------------------
  function renderCard(g) {
    const c = g.creature;
    const L = Cr.lineage(g);
    const rows = C.TRAINABLE.map(id => {
      const a = C.ACTS[id];
      const m = Cr.mastery(g, id);
      const good = a.useful;
      return `<div class="train ${good ? 'good' : 'vice'}" title="${esc(a.name)}">
        <span class="train-icon">${a.icon}</span>
        <span class="train-name">${esc(titleCase(a.name))}</span>
        <span class="train-bar"><i style="width:${(m * 100).toFixed(0)}%"></i></span>
        <span class="train-pct">${Math.round(m * 100)}%</span>
      </div>`;
    }).join('');

    const doing = c.act ? `${C.ACTS[c.act.id].icon} ${c.act.phase === 'travel' ? 'heading off to ' : ''}${C.ACTS[c.act.id].name}` : 'thinking';
    const age = Ln.ageOf(g);
    const evo = Ln.evolutionOf(g);
    const life = Ln.lifeProgress(g);
    const blocker = Ln.breedBlocker(g);
    const ingrainRows = C.TRAINABLE.filter(id => C.ACTS[id].useful || Ln.ingrainedOf(g, id) > 0.01).map(id => {
      const a = C.ACTS[id];
      const v = Ln.ingrainedOf(g, id);
      const warm = Cr.mastery(g, id) >= Ln.IN_MIN_MASTERY;
      return `<div class="ingrain ${warm ? '' : 'cold'}" title="${warm ? 'Praise it to drive this deeper into the line.' : 'It does not know this well enough to ingrain yet.'}">
        <span>${a.icon}</span>
        <span class="ingrain-name">${esc(titleCase(a.name))}</span>
        <span class="ingrain-bar"><i style="width:${(v * 100).toFixed(0)}%"></i></span>
        <span class="ingrain-pct">${Math.round(v * 100)}%</span>
      </div>`;
    }).join('');

    setHTML($('card'), `
      <div class="card-head">
        <div class="card-title">
          <span class="lineage-glyph">${L.glyph}</span>
          <div>
            <h2>${esc(c.name)}</h2>
            <p>${esc(L.name)} · ${esc(Cr.describe(g))}</p>
          </div>
        </div>
        <div class="doing">${esc(doing)}</div>
      </div>
      <div class="genline">
        <span>Gen <b>${c.gen || 1}</b></span>
        <span>${esc(age.name)} · <b>${Math.floor(c.age || 0)}d</b></span>
        <span class="evo">${evo.tier ? evo.glyph + ' ' + esc(evo.name) : ''}</span>
      </div>
      <div class="bars lifebar">
        ${bar('Life', life * 100, 100, '', Math.max(0, Math.ceil(Ln.lifespan(g) - (c.age || 0))) + 'd left')}
      </div>
      <div class="bars">
        ${bar('Belly', c.hunger, 130, c.hunger < 25 ? 'danger' : 'food')}
        ${bar('Vigour', c.vigor, 100, c.vigor < 25 ? 'danger' : 'vigor')}
        ${bar('Mood', c.mood, 100, c.mood < 25 ? 'danger' : 'mood')}
        ${bar('Bond', c.bond, 100, 'bond')}
      </div>
      ${axis('Nature', c.kind, 'cruel', 'kind')}
      ${axis('Habit', c.diligence, 'idle', 'diligent')}
      <div class="statline">
        <span title="Strength — yields and hauling">💪 ${c.stats.strength.toFixed(1)}</span>
        <span title="Cunning — speed and precision">🧠 ${c.stats.cunning.toFixed(1)}</span>
        <span title="Grace — performance and renown">✨ ${c.stats.grace.toFixed(1)}</span>
        <span title="Size — grows while well fed">📏 ${c.size.toFixed(2)}×</span>
      </div>
      <div class="leash">
        <div class="section-label">Leash</div>
        <div class="leash-row">
          ${C.LEASH_LIST.map(l => `<button class="leash-btn ${c.leash === l.id ? 'on' : ''}" data-leash="${l.id}" title="${esc(l.desc)}">${l.glyph}<span>${esc(l.name)}</span></button>`).join('')}
        </div>
        <p class="leash-desc">${esc(C.LEASHES[c.leash].desc)}</p>
      </div>
      <div class="section-label">What it has learned</div>
      <div class="trainlist">${rows}</div>
      <div class="section-label">Ingrained — what the line keeps</div>
      <div class="trainlist">${ingrainRows}</div>
      <button class="btn big" data-act="breed" ${blocker ? 'disabled' : ''} style="margin-top:8px">
        🧬 Generation leap ${blocker ? '' : '· gen ' + ((c.gen || 1) + 1)}
      </button>
      <p class="tiny">${esc(blocker || 'Everything above 0% carries into the whelp. Everything else dies with this animal.')}</p>
      <div class="section-label">Feed it</div>
      <div class="feedrow">
        ${C.CROP_LIST.map(cr => `<button class="chip" data-feed="${cr.id}" ${(g.stock[cr.id] | 0) > 0 ? '' : 'disabled'}>${cr.glyph} ${g.stock[cr.id] | 0}</button>`).join('')}
      </div>
      <p class="tiny">Taught ${c.praised} times, struck ${c.scolded}. ${c.chores} chores done.</p>
    `);
  }

  // --- right panel tabs --------------------------------------------------
  function renderPanel(g) {
    const body = $('panel-body');
    switch (tab) {
      case 'farm': setHTML(body, tabFarm(g)); break;
      case 'market': setHTML(body, tabMarket(g)); break;
      case 'village': setHTML(body, tabVillage(g)); break;
      case 'powers': setHTML(body, tabPowers(g)); break;
      case 'frontier': setHTML(body, tabFrontier(g)); break;
      case 'beast': setHTML(body, tabBeast(g)); break;
      case 'bench': setHTML(body, tabBench(g)); break;
      case 'register': setHTML(body, tabRegister(g)); break;
      case 'feats': setHTML(body, tabFeats(g)); break;
    }
  }

  function tabFarm(g) {
    const cost = S.plotCost(g);
    const rows = g.plots.map(p => {
      const crop = p.crop ? C.CROPS[p.crop] : null;
      const prog = crop && p.state === 'growing' ? Math.round(p.growth / crop.growTicks * 100) + '%' : p.state === 'ripe' ? 'RIPE' : '';
      return `<div class="plotrow ${SW.render.getSelected() === p.i ? 'sel' : ''}" data-plot="${p.i}">
        <span class="pr-i">${p.i + 1}</span>
        <span class="pr-state">${crop ? crop.glyph + ' ' + esc(crop.name) : p.state === 'tilled' ? 'tilled soil' : 'wild ground'}</span>
        <span class="pr-prog ${p.state === 'ripe' ? 'ripe' : ''}">${prog}</span>
        <span class="pr-water">${p.crop ? '💧' + Math.round(p.water) : '🟫' + Math.round(W.soilOf(p))}</span>
      </div>`;
    }).join('');
    return `
      <p class="hint">Click any plot in the scene to work it. Everything you do by hand, a creature on the <b>Leash of Learning</b> is watching.</p>
      <div class="plotlist">${rows}</div>
      <div class="btnrow">
        <button class="btn" data-act="forage">🪵 Gather wood <span class="cost">${S.COST.forage} focus</span></button>
        <button class="btn" data-act="clearplot" ${g.lockedPlots.length ? '' : 'disabled'}>
          ⛏️ Break new ground <span class="cost">${cost.wood}🪵 ${cost.coin}🪙</span>
        </button>
      </div>
      <div class="section-label">Soil — ${Math.round(g.plots.reduce((a, p) => a + W.soilOf(p), 0) / Math.max(1, g.plots.length))}% average</div>
      <p class="hint">Every harvest takes something out of the ground; empty ground recovers on its own. Sowing a <b>different</b> crop than last time is worth +${Math.round(C2.SOIL.rotationBonus * 100)}% yield.</p>
      <div class="btnrow wrap">
        ${C2.FERTILISER_LIST.map(f => `<button class="chip" data-fert="${f.id}" title="${esc(f.blurb)}">${f.glyph} ${esc(f.name)} <i>+${f.soil} · ${costLabel(f.cost)}</i></button>`).join('')}
      </div>
      <p class="tiny">Applies to the selected plot, or the poorest one if none is selected.</p>
      <div class="section-label">Seed bag</div>
      <div class="seedbag">
        ${C.CROP_LIST.map(cr => `<span class="chip ${(g.seeds[cr.id] | 0) ? '' : 'dim'}">${cr.glyph} ${g.seeds[cr.id] | 0}</span>`).join('')}
      </div>`;
  }

  function tabMarket(g) {
    const rank = S.rankOf(g).id;
    const row = cr => {
      const locked = rank < cr.rank;
      const held = g.stock[cr.id] | 0;
      const mod = g.prices[cr.id] || 1;
      const arrow = mod > 1.12 ? '<span class="up">▲</span>' : mod < 0.9 ? '<span class="down">▼</span>' : '';
      return `<div class="mkrow ${locked ? 'locked' : ''}">
        <div class="mk-top">
          <span class="mk-title" title="${esc(cr.blurb)}">${cr.glyph} ${esc(cr.name)}</span>
          <span class="mk-price">${F.price(g, cr.id)}${arrow}<i>coin each</i></span>
        </div>
        <div class="mk-bot">
          <span class="mk-held">held <b>${held}</b></span>
          ${locked ? `<span class="mk-lock">needs ${esc(C.RANKS[cr.rank].name)}</span>` : `
            <button class="mini" data-sell="${cr.id}" data-n="1" ${held ? '' : 'disabled'}>sell 1</button>
            <button class="mini" data-sell="${cr.id}" data-n="999999" ${held ? '' : 'disabled'}>sell all</button>
            <button class="mini seed" data-buy="${cr.id}" data-n="1">seed <i>${F.seedPrice(g, cr.id)}🪙</i></button>
            <button class="mini seed" data-buy="${cr.id}" data-n="10">×10</button>`}
        </div>
      </div>`;
    };
    return `<p class="hint">Prices drift every dawn. Sell high, sow the difference.</p>
      ${C.CROP_LIST.map(row).join('')}
      <div class="mkrow">
        <div class="mk-top">
          <span class="mk-title">🪵 Timber</span>
          <span class="mk-price">${F.WOOD_PRICE}<i>coin each</i></span>
        </div>
        <div class="mk-bot">
          <span class="mk-held">held <b>${fmt(g.res.wood)}</b></span>
          <button class="mini seed" data-wood="1">buy 1</button>
          <button class="mini seed" data-wood="25">buy 25</button>
          <span class="mk-lock">or send the creature foraging</span>
        </div>
      </div>
      ${Object.keys(g.fish).some(k => g.fish[k] > 0) ? `<div class="section-label">The catch</div>
        ${C2.FISH.filter(f => (g.fish[f.id] | 0) > 0).map(f => `<div class="wrow">
          <span>${f.glyph}</span>
          <span><b>${esc(f.name)}</b> ×${g.fish[f.id]}<i>${esc(f.blurb)}</i></span>
          <span><button class="mini" data-sellfish="${f.id}">sell <i>${fmt(f.coin)}</i></button>
                <button class="mini" data-eatfish="${f.id}">mill <i>+${f.feed}</i></button></span>
        </div>`).join('')}` : ''}
      ${caravanBlock(g)}
      <p class="tiny">Lifetime: ${fmt(g.stats.harvests)} harvested · ${fmt(g.stats.sold)} sold · ${fmt(g.stats.coinEarned)} coin earned.</p>`;
  }

  function caravanBlock(g) {
    if (!g.caravan) {
      const inDays = Math.max(0, (g.nextCaravan || 0) - g.day);
      return `<div class="section-label">Caravans</div><p class="hint">Nothing at the rim${inDays ? ` — something is due in about ${inDays} day${inDays === 1 ? '' : 's'}` : ''}. A Cloud Dock brings them more often.</p>`;
    }
    const m = T.caravanDef(g);
    const ct = g.caravan.contract;
    const stock = Object.keys(g.caravan.stock).filter(k => g.caravan.stock[k] > 0);
    return `<div class="section-label">${m.glyph} ${esc(m.name)} — leaves day ${g.caravan.until}</div>
      <p class="hint">${esc(m.blurb)} Standing with them: <b>${T.merchantRep(g, m.id)}</b> (tier ${T.repTier(T.merchantRep(g, m.id))}).</p>
      ${ct ? `<div class="terrace">
        <div class="terrace-head">📜 ${ct.need} ${esc(C.CROPS[ct.crop].name)} <span>${ct.got}/${ct.need}</span></div>
        <p>Pays ${fmt(Math.round(ct.coin * T.payout(g, m.id)))} coin and ${ct.renown} renown. Leaving it unfilled costs you standing.</p>
        <div class="btnrow"><button class="btn hot" data-act="deliver" ${(g.stock[ct.crop] | 0) ? '' : 'disabled'}>Hand over what you have</button></div>
      </div>` : '<p class="hint">Contract filled. Nothing more they want.</p>'}
      ${stock.length ? `<div class="btnrow wrap">${stock.map(k => `<button class="chip" data-carbuy="${k}">${C.MATERIALS[k].glyph} ×${g.caravan.stock[k]} <i>${fmt(T.matPrice(g, k))}🪙</i></button>`).join('')}</div>`
        : '<p class="hint">The cart is empty.</p>'}`;
  }

  function tabVillage(g) {
    const v = g.village;
    const hc = S.hutCost(g);
    const next = C.SHRINE_TIERS[g.shrine + 1];
    return `
      <div class="bars">
        ${bar('Faith', v.faith, 100, 'faith')}
        ${bar('Awe', v.awe, 100, 'awe')}
        ${bar('Granary', v.food, 200, v.food < 10 ? 'danger' : 'food', Math.round(v.food))}
        ${bar('Unrest', v.unrest, 100, 'danger')}
      </div>
      <p class="hint">${v.villagers} living in ${v.huts} huts. They eat ${(v.villagers * 0.085 * C.TICKS_PER_DAY).toFixed(0)} food a day, and pray in proportion to what they feel about you.</p>
      <div class="section-label">Tithe — crops into the granary</div>
      <div class="btnrow wrap">
        ${C.CROP_LIST.map(cr => `<button class="chip" data-mill="${cr.id}" ${(g.stock[cr.id] | 0) ? '' : 'disabled'}>${cr.glyph} mill 1 <i>+${cr.feed}</i></button>`).join('')}
        <button class="chip" data-mill-all="1">mill everything</button>
      </div>
      <div class="section-label">The people — ${(g.people || []).length}</div>
      <div>${(g.people || []).slice(0, 24).map(p => `<div class="person">
        <span>${esc(p.name)}${p.trait ? ` <span class="trait">· ${esc(C2.VILLAGER_TRAITS.find(t => t.id === p.trait).name.toLowerCase())}</span>` : ''}</span>
        <select data-role="${esc(p.name)}">
          ${C2.ROLE_LIST.map(r => `<option value="${r.id}" ${p.role === r.id ? 'selected' : ''}>${r.glyph} ${esc(r.name)}</option>`).join('')}
        </select>
      </div>`).join('')}</div>
      <div class="section-label">Build</div>
      <div class="btnrow">
        <button class="btn" data-act="hut" ${g.village.huts >= SW.discovery.hutCap(g) ? 'disabled' : ''}>🛖 Raise a hut <span class="cost">${hc.wood}🪵 ${hc.coin}🪙 · ${g.village.huts}/${SW.discovery.hutCap(g)}</span></button>
      </div>
      <div class="web">
        ${C2.BUILDING_LIST.map(b => {
          const why = W.canBuild(g, b.id);
          const tier = SW.boost.buildingTier(g, b.id);
          const cost = W.buildingCost(g, b.id);
          return `<button class="neuron ${tier ? 'owned' : why ? 'locked' : ''}" data-build="${b.id}" ${why ? 'disabled' : ''}>
            <span>${b.glyph}</span>
            <span><b>${esc(b.name)}${tier ? ' ' + 'I'.repeat(tier) : ''}</b><i>${esc(why || b.blurb)}</i></span>
            <span class="cost">${why ? '—' : fmt(cost.wood) + '🪵 ' + fmt(cost.coin) + '🪙'}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="section-label">Shrine — ${esc(C.SHRINE_TIERS[g.shrine].name)} (grandeur ${S.grandeur(g)})</div>
      ${next ? `<div class="btnrow">
        <button class="btn" data-act="shrine">🕯️ Raise to ${esc(next.name)} <span class="cost">${next.wood}🪵 ${fmt(next.coin)}🪙 · ${esc(C.RANKS[next.rank].name)}</span></button>
      </div>` : '<p class="hint">There is nothing higher to build.</p>'}`;
  }

  function tabPowers(g) {
    const rank = S.rankOf(g).id;
    return `<p class="hint">Prayer accrues from faith and awe alike. Terror is cheaper to farm, and costs you later.</p>
      <div class="miracles">
        ${C.MIRACLE_LIST.map(m => {
          const locked = rank < m.rank;
          const poor = g.res.prayer < m.cost;
          return `<button class="miracle ${locked || poor ? 'off' : ''}" data-miracle="${m.id}" ${locked ? 'disabled' : ''}>
            <span class="mi-glyph">${m.glyph}</span>
            <span class="mi-body"><b>${esc(m.name)}</b><i>${esc(locked ? 'Requires ' + C.RANKS[m.rank].name : m.desc)}</i></span>
            <span class="mi-cost">${m.cost}🙏</span>
          </button>`;
        }).join('')}
      </div>
      <div class="section-label">Chants${M2.chantUnlocked(g) ? '' : ' — needs a Standing Ring'}</div>
      <p class="hint">The shrine sings a sequence and you sing it back. Get it all and the effect lands whole; fumble it and you get part of one.</p>
      <div class="miracles">
        ${C2.CHANTS.map(ch => {
          const locked = !M2.chantUnlocked(g) || (g.ring | 0) < ch.ring;
          const poor = g.res.prayer < ch.prayer;
          return `<button class="miracle ${locked || poor ? 'off' : ''}" data-chant="${ch.id}" ${locked || poor || M2.busy(g) ? 'disabled' : ''}>
            <span class="mi-glyph">${ch.glyph}</span>
            <span class="mi-body"><b>${esc(ch.name)}</b><i>${esc(locked ? 'Requires ' + C.RINGS[ch.ring].name : ch.blurb)} · ${ch.len} tones</i></span>
            <span class="mi-cost">${ch.prayer}🙏</span>
          </button>`;
        }).join('')}
      </div>
      <p class="tiny">${g.stats.miracles} miracles worked, ${g.stats.chants || 0} chants sung.</p>`;
  }

  /* ---- the beast: what it can do, what is wrong with it, and the ring ---- */
  function tabBeast(g) {
    const c = g.creature;
    const ail = c.ailment ? C2.AILMENTS[c.ailment] : null;
    const rem = ail ? C2.REMEDIES[ail.remedy] : null;
    const slots = B.techSlots(g);
    const eq = g.equippedTech || [];
    const opps = B.arenaOpponents(g);
    const power = Math.round(B.beastPower(g));
    const hasRing = SW.boost.buildingTier(g, 'arena') > 0;

    const techRows = C2.TECHNIQUE_LIST.map(t => {
      const r = B.reps(g, t.id), known = B.techKnown(g, t.id), on = eq.includes(t.id);
      return `<button class="neuron ${on ? 'owned' : known ? '' : 'locked'}" data-tech="${t.id}" ${known ? '' : 'disabled'}>
        <span>${t.glyph}</span>
        <span><b>${esc(t.name)}</b><i>${esc(t.blurb)}</i></span>
        <span class="cost">${known ? (on ? 'set' : 'idle') : r + '/' + t.reps}</span>
      </button>`;
    }).join('');

    return `
      ${ail ? `<div class="terrace" style="border-color:#6f2f36">
        <div class="terrace-head">${ail.glyph} ${esc(ail.name)} <span>day ${Math.floor(c.ailDays || 0)}</span></div>
        <p>${esc(ail.blurb)} It is working at ${Math.round(ail.work * 100)}% and losing condition.</p>
        <div class="btnrow"><button class="btn hot" data-act="cure">${rem.glyph} ${esc(rem.name)}
          <span class="cost">${costLabel(rem.cost)}</span></button></div>
      </div>` : `<p class="hint">Nothing wrong with it. Illness comes from overfeeding, damp, heat, overwork and cruelty — all of which you control.</p>`}

      <div class="section-label">Techniques — ${eq.length}/${slots} set</div>
      <p class="hint">It works these out by repetition, not by being told. Set the ones you want it using.</p>
      <div class="web">${techRows}</div>

      <div class="section-label">Bloodline</div>
      ${g.mateOffer ? `<div class="terrace">
        <div class="terrace-head">🐾 ${esc(g.mateOffer.name)}</div>
        <p>💪 ${g.mateOffer.strength} · 🧠 ${g.mateOffer.cunning} · ✨ ${g.mateOffer.grace}${g.mateOffer.lineage !== c.lineage ? ' — a different line, which is worth more.' : ''}</p>
        <div class="btnrow">
          <button class="btn" data-act="mateyes">Take it in</button>
          <button class="btn" data-act="mateno">Drive it off</button>
        </div>
      </div>` : g.mate ? `<p class="hint">${esc(g.mate.name)} is waiting. The next whelp carries both lines.</p>`
        : '<p class="hint">No mate. Whelps will be pure line — steady, and narrower every time.</p>'}
      ${g.pedigree && g.pedigree.length ? `<div>${g.pedigree.slice(0, 6).map(p =>
        `<div class="wrow"><span>${p.hybrid ? '🧬' : '🐾'}</span><span><b>Gen ${p.gen}</b><i>out of ${esc(p.mate)}, day ${p.day}</i></span><span></span></div>`).join('')}</div>` : ''}
      ${g.inbreeding >= 3 ? '<p class="tiny" style="color:var(--warn)">The line is getting narrow. Bring in outside blood.</p>' : ''}

      <div class="section-label">The Trial Ring — power ${fmt(power)}</div>
      ${!hasRing ? '<p class="hint">You have nowhere to hold a trial. Build a Trial Ring on the second terrace.</p>' : `
        ${g.arenaResult ? `<div class="fest-result"><b>${esc(g.arenaResult.opponent)}, day ${g.arenaResult.day}</b> — ${g.arenaResult.won ? 'won' : 'lost'}
          <div class="fest-field">${g.arenaResult.rounds.map(r => `<span class="${r.won ? 'you' : ''}">${fmt(r.mine)} v ${fmt(r.theirs)}</span>`).join('')}</div></div>` : ''}
        <p class="hint">Three rounds, best of three. It costs the creature 28 vigour whatever happens.</p>
        ${opps.slice(0, 5).map((o, i) => `<div class="diplo">
          <span>${esc(o.name)}</span>
          <span class="op ${o.power < power ? 'warm' : 'cold'}">${fmt(Math.round(o.power))}</span>
          <button class="mini" data-fight="${i}" ${c.vigor >= 30 ? '' : 'disabled'}>fight</button>
        </div>`).join('')}`}`;
  }

  function costLabel(cost) {
    const bits = [];
    if (cost.food) bits.push(cost.food + '🥣');
    if (cost.wood) bits.push(cost.wood + '🪵');
    if (cost.prayer) bits.push(cost.prayer + '🙏');
    if (cost.mats) for (const k in cost.mats) bits.push(cost.mats[k] + C.MATERIALS[k].glyph);
    if (cost.coin) bits.push(fmt(cost.coin) + '🪙');
    return bits.join(' ');
  }

  function tabFrontier(g) {
    const ring = D.ringOf(g);
    const nxt = D.nextRing(g);
    const cost = D.ringCost(g);
    const unknown = D.unknownCount(g);
    const listenState = !M.listenUnlocked(g) ? 'locked'
      : g.listen ? 'running' : M.listenCooldown(g) > 0 ? 'cooling' : 'ready';

    const rows = g.features.map(inst => {
      const def = C.FEATURES.find(f => f.id === inst.fid);
      if (!def) return '';
      return inst.found
        ? `<div class="frow"><span>${def.glyph}</span><span><b>${esc(titleCase(def.name))}</b><br><i>${esc(def.blurb)}</i></span><span class="ins">day ${g.discovered[def.id] || '—'}</span></div>`
        : `<div class="frow unknown"><span>?</span><span><b>Something on the ${esc(C.RINGS[inst.ring].name.replace('The ', '').toLowerCase())}</b><br><i>You have not walked over to it.</i></span><span class="ins">+?</span></div>`;
    }).join('');

    return `
      <div class="terrace">
        <div class="terrace-head">⛰ ${esc(ring.name)} <span>${g.plots.length}/${ring.plots} plots · ${g.village.huts}/${ring.hutCap} huts</span></div>
        ${nxt ? `<p>${esc(nxt.name)} would add ${nxt.plots - ring.plots} plot slots and room for ${nxt.hutCap - ring.hutCap} more huts — and a fresh band of ground you know nothing about.</p>
          <div class="btnrow"><button class="btn" data-act="ring">⛰ Raise ${esc(nxt.name)}
            <span class="cost">${fmt(cost.wood)}🪵 ${fmt(cost.coin)}🪙 ${cost.insight}🧠</span></button></div>`
          : '<p>The island is as wide as it will ever be.</p>'}
      </div>

      <div class="terrace">
        <div class="terrace-head">🔊 The Listening <span>${listenState === 'locked' ? 'not yet known' : listenState === 'running' ? 'in progress' : listenState === 'cooling' ? Math.ceil(M.listenCooldown(g)) + 's' : 'ready'}</span></div>
        <p>Go still and sweep the island. Whatever answers glows for a moment — click it before it stops. The only way to get storm glass and skymetal out of the ground.</p>
        <div class="btnrow"><button class="btn" data-act="listen" ${listenState === 'ready' ? '' : 'disabled'}>
          🔊 Listen <span class="cost">${M.LISTEN_FOCUS} focus</span></button></div>
      </div>

      <div class="terrace">
        <div class="terrace-head">🎣 Cloud Fishing <span>${M2.fishingUnlocked(g) ? 'ready' : 'not yet known'}</span></div>
        <p>Drop a line off the rim. Three timing windows, each narrower than the last — clear more and something bigger comes up. Rare fish carry storm glass, skymetal, and occasionally something older.</p>
        <div class="btnrow"><button class="btn" data-act="fish" ${M2.fishingUnlocked(g) && !M2.busy(g) && g.res.focus >= M2.CAST_FOCUS ? '' : 'disabled'}>
          🎣 Cast <span class="cost">${M2.CAST_FOCUS} focus</span></button></div>
      </div>
      <div class="section-label">The ground — ${Object.keys(g.discovered).length} examined, ${unknown} not</div>
      <p class="hint">Unknown things show as <b>?</b> out on the island. Click one to walk over and examine it${D.examineCost(g) ? ` (${D.examineCost(g)} focus)` : ' (free — you have Long Sight)'}.</p>
      <div>${rows || '<p class="hint">Nothing left out there.</p>'}</div>

      <div class="section-label">The neural web — ${fmt(g.insight)} insight</div>
      <div class="web">
        ${C.NEURONS.map(n => {
          const owned = !!g.neurons[n.id];
          const open = D.neuronAvailable(g, n);
          return `<button class="neuron ${owned ? 'owned' : open ? '' : 'locked'}" data-neuron="${n.id}" ${owned || !open ? 'disabled' : ''}>
            <span>${n.icon}</span>
            <span><b>${esc(n.name)}</b><i>${esc(n.desc)}</i></span>
            <span class="cost">${owned ? '✓' : n.cost + '🧠'}</span>
          </button>`;
        }).join('')}
      </div>`;
  }

  function tabBench(g) {
    if (!M.benchUnlocked(g)) {
      return `<p class="hint">You do not have a workbench. Grow <b>The Bench</b> on the neural web to build one.</p>`;
    }
    const have = id => g.mats[id] | 0;
    const ready = benchA && benchB && have(benchA) >= (benchA === benchB ? 2 : 1) && have(benchB) >= 1;
    const known = C.RECIPES.filter(r => g.recipes[r.id]);
    const deadEnds = Object.keys(g.deadEnds).length;

    return `<p class="hint">Put two things together and find out. There is no list — ${C.RECIPES.length} pairings do something, ${21 - C.RECIPES.length} do nothing, and finding out either way costs you the materials.</p>
      <div class="matgrid">
        ${C.MATERIAL_LIST.map(m => `<button class="matchip ${benchA === m.id || benchB === m.id ? 'sel' : ''}" data-mat="${m.id}" ${have(m.id) ? '' : 'disabled'}>
          ${m.glyph} ${esc(m.name)} <b>${have(m.id)}</b></button>`).join('')}
      </div>
      <div class="bench-slots">
        <span class="slot ${benchA ? 'full' : ''}" data-slot="a">${benchA ? C.MATERIALS[benchA].glyph : ''}</span>
        <span>+</span>
        <span class="slot ${benchB ? 'full' : ''}" data-slot="b">${benchB ? C.MATERIALS[benchB].glyph : ''}</span>
      </div>
      <div class="btnrow">
        <button class="btn hot" data-act="combine" ${ready && g.res.focus >= M.CRAFT_FOCUS ? '' : 'disabled'}>⚒️ Combine <span class="cost">${M.CRAFT_FOCUS} focus</span></button>
        <button class="btn" data-act="benchclear">Clear</button>
      </div>
      <div class="section-label">Buy materials</div>
      <div class="btnrow wrap">
        ${C.MATERIAL_LIST.filter(m => m.buy).map(m => `<button class="chip" data-buymat="${m.id}">${m.glyph} ×5 <i>${m.buy * 5}🪙</i></button>`).join('')}
      </div>
      <p class="tiny">Storm glass and skymetal are not for sale. Examine the ground, or listen for them.</p>
      <div class="section-label">Known — ${known.length} of ${C.RECIPES.length}${deadEnds ? ` · ${deadEnds} dead ends` : ''}</div>
      ${known.length ? known.map(r => `<div class="recipe">
        <span>${r.glyph}</span>
        <span><b>${esc(r.name)}</b><br><i>${C.MATERIALS[r.a].glyph} + ${C.MATERIALS[r.b].glyph} · made ${g.crafted[r.id] || 0}×</i></span>
        <span class="val">${fmt(M.craftValue(g, r))}🪙</span>
      </div>`).join('') : '<p class="hint">You have not made anything yet.</p>'}`;
  }

  function tabRegister(g) {
    const rows = S.standings(g);
    const fest = C.FESTIVALS[g.festival.index % C.FESTIVALS.length];
    const daysTo = Math.max(0, g.festival.nextDay - g.day);
    const last = g.festival.lastResult;
    return `
      <div class="fest">
        <div class="fest-head">${fest.glyph} <b>${esc(fest.name)}</b> <span>${daysTo === 0 ? 'today' : 'in ' + daysTo + ' day' + (daysTo === 1 ? '' : 's')}</span></div>
        <p>${esc(fest.blurb)}</p>
        <p class="tiny">Your entry would score <b>${fmt(S.festivalScore(g, fest))}</b>.
          A strong rival is expected around <b>${fmt(S.festivalPar(g, fest))}</b>.</p>
      </div>
      ${last ? `<div class="fest-result"><b>${esc(last.name)}, day ${last.day}</b> — you placed ${last.place}${ordSuffix(last.place)} for +${last.payout} renown.
        <div class="fest-field">${last.field.map(f => `<span class="${f.you ? 'you' : ''}">${esc(f.name)} ${fmt(f.score)}</span>`).join('')}</div></div>` : ''}
      <div class="section-label">The Skyward Register</div>
      <table class="register">
        ${rows.map(r => `<tr class="${r.you ? 'you' : ''}">
          <td class="rg-place">${r.place}</td>
          <td class="rg-name">${esc(r.name)}</td>
          <td class="rg-renown">${fmt(r.renown)}</td>
        </tr>`).join('')}
      </table>
      <div class="section-label">Dealing with them directly</div>
      <p class="hint">Allies quietly add to your standing each day; enemies chip at it. Opinions drift back to indifference on their own.</p>
      <div>${g.rivals.map(r => {
        const op = T.opinion(g, r.name);
        return `<div class="diplo">
          <span>${esc(r.name)}</span>
          <span class="op ${T.opinionWord(op)}">${T.opinionWord(op)}</span>
          <span>${C2.DIPLO_ACTIONS.map(a => `<button class="mini" data-diplo="${a.id}" data-rival="${esc(r.name)}" title="${esc(a.blurb)}">${a.glyph}</button>`).join('')}</span>
        </div>`;
      }).join('')}</div>
      <div class="section-label">What they are saying</div>
      <div class="chatter">
        ${g.chatter.length ? g.chatter.slice(0, 14).map(ch => `<div class="ch ${ch.rel}"><i>day ${ch.day}</i> ${esc(ch.text)}</div>`).join('')
          : '<p class="hint">Nobody has mentioned you yet.</p>'}
      </div>`;
  }

  function ordSuffix(n) {
    if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th';
  }

  function tabFeats(g) {
    const earned = C.FEATS.filter(f => g.feats[f.id]);
    const open = C.FEATS.filter(f => !g.feats[f.id]);
    const row = (f, got) => `<div class="feat ${got ? 'got' : ''}">
      <span class="ft-mark">${got ? '★' : '☆'}</span>
      <span class="ft-body"><b>${esc(f.name)}</b><i>${esc(f.desc)}</i></span>
      <span class="ft-renown">+${f.renown}</span>
    </div>`;
    const trophies = g.trophies.slice(-12).reverse();
    const av = R.available(g);
    const owned = R.owned(g);
    return `
      <div class="section-label">Oaths — reroll every 3 days</div>
      ${(g.oaths || []).map(o => `<div class="oath ${o.done ? 'done' : ''}">
        <span>${o.done ? '★ ' : ''}${esc(o.name)}</span>
        <span class="oath-bar"><i style="width:${(W.oathProgress(g, o) * 100).toFixed(0)}%"></i></span>
        <span class="ft-renown">+${o.renown}</span>
      </div>`).join('')}

      <div class="section-label">Relics — ${owned.length}/${C2.RELIC_LIST.length} · ${(g.equipped || []).length}/${R.slots(g)} set</div>
      <p class="hint">Only what is set does anything. Two of the same rank can be fused into one of the next rank up, and both are consumed.</p>
      <div class="relicgrid">
        ${owned.length ? owned.map(r => `<button class="relicchip r${r.rank} ${R.isEquipped(g, r.id) ? 'on' : ''}" data-relic="${r.id}" title="${esc(r.blurb)}">${r.glyph} ${esc(r.name)}</button>`).join('')
          : '<span class="hint">None yet. Win festivals, take the ring, land something big, or make the hardest things at the bench.</span>'}
      </div>
      ${owned.length >= 2 ? `<div class="btnrow"><button class="btn" data-act="fuse">🔥 Fuse the two selected</button></div>
        <p class="tiny">Select exactly two of the same rank, then fuse.</p>` : ''}

      <div class="section-label">Titles</div>
      <div class="relicgrid">
        ${av.map(t => `<button class="relicchip ${g.title === t.id ? 'on' : ''}" data-title="${t.id}">${esc(t.name)}</button>`).join('')}
      </div>

      <div class="section-label">Ascension</div>
      <div class="terrace">
        <div class="terrace-head">✧ Let the island go <span>${P.canAscend(g) ? '+' + P.pointsFor(g) + ' points' : fmt(C2.ASCEND_MIN_RENOWN - g.res.renown) + ' renown to go'}</span></div>
        <p>Begin again on fresh ground, carrying only the boons you have bought. Run ${(g.prestige.runs | 0) + 1}. Best so far: ${fmt(g.prestige.best || 0)} renown.</p>
        <div class="btnrow"><button class="btn ${P.canAscend(g) ? 'hot' : ''}" data-act="ascend" ${P.canAscend(g) ? '' : 'disabled'}>✧ Ascend</button></div>
      </div>
      <div class="web">
        ${C2.BOONS.map(b => {
          const has = g.prestige.boons[b.id];
          return `<button class="neuron ${has ? 'owned' : P.unspent(g) >= b.cost ? '' : 'locked'}" data-boon="${b.id}" ${has ? 'disabled' : ''}>
            <span>${b.glyph}</span><span><b>${esc(b.name)}</b><i>${esc(b.blurb)}</i></span>
            <span class="cost">${has ? '✓' : b.cost + '✧'}</span></button>`;
        }).join('')}
      </div>
      <p class="tiny">${P.unspent(g)} of ${g.prestige.points | 0} ascension points unspent.</p>

      <div class="section-label">Feats — ${earned.length} of ${C.FEATS.length}</div>
      ${trophies.length ? `<div class="section-label">Trophy shelf</div><div class="trophies">
        ${trophies.map(t => `<span class="trophy p${t.place}" title="${esc(t.name)} — day ${t.day}">${t.place === 1 ? '🥇' : t.place === 2 ? '🥈' : '🥉'} ${esc(t.name.replace('The ', ''))}</span>`).join('')}
      </div>` : ''}
      <div class="feats">${earned.map(f => row(f, true)).join('')}${open.map(f => row(f, false)).join('')}</div>`;
  }

  // --- plot action bar ---------------------------------------------------
  function renderActionBar(g) {
    const el = $('actionbar');
    if (g.listen) {
      setHTML(el, `<span class="ab-title">🔊 Listening</span><span class="ab-hint">Click what glows before it fades. ${g.listen.hits} caught.</span>`);
      return;
    }
    const i = SW.render.getSelected();
    const p = g.plots.find(pp => pp.i === i);
    if (!p) {
      const unknown = D.unknownCount(g);
      setHTML(el, `<span class="ab-hint">Click a plot, the woodland, or your creature.${unknown ? ` <b>${unknown}</b> unknown thing${unknown === 1 ? '' : 's'} still out there — look for the <b>?</b> marks.` : ''}</span>`);
      return;
    }
    const crop = p.crop ? C.CROPS[p.crop] : null;
    let html = `<span class="ab-title">Plot ${p.i + 1} — ${crop ? esc(crop.name) : p.state === 'tilled' ? 'tilled' : 'wild'}</span>`;
    if (p.state === 'raw') {
      html += `<button class="btn" data-act="till">⛏️ Break soil <span class="cost">${S.COST.till}</span></button>`;
    } else if (p.state === 'tilled') {
      const rank = S.rankOf(g).id;
      html += C.CROP_LIST.map(cr => {
        const has = (g.seeds[cr.id] | 0) > 0;
        return `<button class="btn ${has ? '' : 'off'}" data-act="sow" data-crop="${cr.id}" ${has && rank >= cr.rank ? '' : 'disabled'}>${cr.glyph} Sow ${esc(cr.name)} <span class="cost">${g.seeds[cr.id] | 0} left</span></button>`;
      }).join('');
    } else {
      html += `<button class="btn" data-act="water" ${p.water > 95 ? 'disabled' : ''}>💧 Water <span class="cost">${S.COST.water}</span></button>`;
      if (p.state === 'ripe') html += `<button class="btn hot" data-act="harvest">🧺 Harvest <span class="cost">${S.COST.harvest}</span></button>`;
      else html += `<span class="ab-hint">${Math.round(p.growth / crop.growTicks * 100)}% grown · ${Math.round(p.water)}% watered</span>`;
    }
    setHTML(el, html);
  }

  function renderJudge(g) {
    const el = $('judge');
    const c = g.creature;
    if (!c.pending) { el.classList.remove('on'); return; }
    el.classList.add('on');
    const a = C.ACTS[c.pending.act];
    $('judge-what').innerHTML = `${a.icon} ${esc(c.name)} just chose to <b>${esc(a.name)}</b>`;
    const left = 1 - c.pending.t / Cr.PRAISE_WINDOW;
    $('judge-fill').style.width = (clamp(left, 0, 1) * 100) + '%';
  }

  /* The two timing games get their own overlay: they need to be clickable and
   * they need to read clearly, which is easier in DOM than on the canvas.
   *
   * The structure is built once per game and only the moving parts are then
   * animated. Rebuilding the markup every frame — which is what the panels do
   * — would destroy and recreate the Strike button sixty times a second, and
   * a button that is detached mid-press cannot be pressed.
   */
  let playKey = '';

  function renderPlay(g) {
    const el = $('play');
    const key = g.fishing ? 'fish:' + g.fishing.stage : g.chant ? 'chant:' + g.chant.id : '';
    if (key !== playKey) {
      playKey = key;
      el.innerHTML = key ? (g.fishing ? fishingMarkup(g) : chantMarkup(g)) : '';
      el._last = null;
      el.classList.toggle('on', !!key);
    }
    if (!key) return;
    if (g.fishing) {
      const f = g.fishing;
      const mark = el.querySelector('.fishmark');
      const btn = el.querySelector('.play-btn');
      const sub = el.querySelector('.play-sub');
      if (mark) mark.style.left = (f.pos * 100).toFixed(2) + '%';
      if (btn) btn.disabled = !!f.result;
      if (sub) sub.textContent = f.result
        ? (f.result === 'full' ? 'Landed it.' : f.result === 'partial' ? 'It slipped, but something came up.' : 'Gone.')
        : `Stage ${f.stage + 1} of ${M2.STAGES}`;
    } else if (g.chant) {
      const ch = g.chant;
      el.querySelectorAll('.tonepad').forEach((pad, i) => {
        pad.classList.toggle('lit', ch.lit === i);
        pad.disabled = ch.phase !== 'input';
      });
      el.querySelectorAll('.chant-steps i').forEach((dot, i) => {
        const given = ch.input[i];
        dot.className = given === undefined ? '' : given === ch.seq[i] ? 'ok' : 'bad';
      });
      const sub = el.querySelector('.play-sub');
      if (sub) sub.textContent = ch.phase === 'show' ? 'listen' : ch.phase === 'input' ? 'sing it back' : 'done';
    }
  }

  function fishingMarkup(g) {
    const f = g.fishing;
    return `<div class="play-title">🎣 Cloud Fishing <span class="play-sub"></span></div>
      <div class="fishbar">
        <div class="fishzone" style="left:${(f.zone * 100).toFixed(1)}%;width:${(f.zoneW * 100).toFixed(1)}%"></div>
        <div class="fishmark" style="left:0%"></div>
      </div>
      <button class="btn hot play-btn" data-act="strike">Strike <kbd>Space</kbd></button>`;
  }

  function chantMarkup(g) {
    const ch = g.chant;
    const def = C2.CHANTS.find(x => x.id === ch.id);
    return `<div class="play-title">${def.glyph} ${esc(def.name)} <span class="play-sub"></span></div>
      <div class="tonepads">
        ${C2.CHANT_TONES.map((t, i) => `<button class="tonepad" data-tone="${i}" disabled>${t}</button>`).join('')}
      </div>
      <div class="chant-steps">${ch.seq.map(() => '<i></i>').join('')}</div>
      <p class="tiny" style="text-align:center;margin-top:6px">Keys 6–0 play the tones.</p>`;
  }

  /* What to do next. The loop got wide enough that a player can lose the
   * thread, so the scene carries a short live list of the things that are
   * actually waiting on them, each one a shortcut to the thing itself. */
  function renderTodo(g) {
    const items = [];
    const add = (icon, text, tone, act) => items.push({ icon, text, tone, act });

    if (g.event) add('❗', W.eventDef(g).title, 'urgent', 'openevent');
    if (g.creature.pending) add(C.ACTS[g.creature.pending.act].icon, 'Judge it — praise or strike', 'good', 'judge');
    if (g.creature.ailment) add(C2.AILMENTS[g.creature.ailment].glyph, `${g.creature.name} is ill`, 'urgent', 'tab:beast');
    if (g.mateOffer) add('🐾', 'A mate is waiting on an answer', 'good', 'tab:beast');
    if (g.village.food < 25) add('🥣', 'The granary is nearly empty', 'urgent', 'tab:village');
    if (g.village.unrest > 60) add('🔥', 'The village is close to walking out', 'urgent', 'tab:village');
    const ripe = F.ripePlots(g).length;
    if (ripe >= 3) add('🧺', `${ripe} plots are ripe`, 'good', 'harvestall');
    const dry = g.plots.filter(p => p.crop && p.water < 25).length;
    if (dry >= 3) add('💧', `${dry} plots are drying out`, '', 'waterall');
    if (SW.lineage.lifeProgress(g) > 0.86 && SW.lineage.canBreed(g)) add('🧬', 'It is old — breed before you lose the work', 'urgent', 'breed');
    if (g.caravan && g.caravan.contract && (g.stock[g.caravan.contract.crop] | 0) >= g.caravan.contract.need - g.caravan.contract.got) {
      add('📜', 'A contract can be filled now', 'good', 'tab:market');
    }
    if (D.unknownCount(g) && g.res.focus >= D.examineCost(g) + 6 && g.day > 2) {
      add('❓', `${D.unknownCount(g)} unknown things on the island`, '', 'tab:frontier');
    }
    if (M.listenReady(g) && g.res.focus > M.LISTEN_FOCUS + 4) add('🔊', 'The Listening is ready', '', 'listen');
    if (g.arenaChallenge) add('🏟️', 'A challenge is waiting', 'good', 'tab:beast');

    setHTML($('todo'), items.slice(0, 5).map(i =>
      `<button class="todo-item ${i.tone}" data-todo="${i.act}"><i>${i.icon}</i>${esc(i.text)}</button>`).join(''));
  }

  function showEvent(g) {
    const def = W.eventDef(g);
    if (!def) return;
    showModal(`
      <h1>${esc(def.title)}</h1>
      <p class="lede">${esc(def.text)}</p>
      ${def.choices.map((c, i) => `<button class="btn evt-choice" data-choice="${i}">
        <b>${esc(c.label)}</b><i>${esc(c.note)}</i></button>`).join('')}
    `);
    $('modal').querySelectorAll('[data-choice]').forEach(b => {
      b.onclick = () => { W.resolveEvent(G, +b.dataset.choice); hideModal(); dirty.panel = true; };
    });
  }

  // --- log ---------------------------------------------------------------
  function renderLog(g) {
    setHTML($('log'), g.log.slice(0, 40).map(l =>
      `<div class="li ${l.tone}"><i>d${l.day}</i>${esc(l.text)}</div>`).join(''));
  }

  // --- modals ------------------------------------------------------------
  function showModal(html, opts) {
    const m = $('modal');
    m.innerHTML = `<div class="sheet ${opts && opts.wide ? 'wide' : ''}">${html}</div>`;
    m.classList.add('on');
  }
  function hideModal() { $('modal').classList.remove('on'); $('modal').innerHTML = ''; }

  function showHatch(onDone) {
    showModal(`
      <h1>Skyward Reach</h1>
      <p class="lede">You are a very small god with one floating island, three believers and no reputation whatsoever.
      Below you, eleven other godlings are already listed in the Register. Grow things. Raise a beast. Be spoken of.</p>
      <div class="section-label">Choose what hatches</div>
      <div class="hatch">
        ${C.LINEAGE_LIST.map((l, i) => `<button class="hatch-card ${i === 0 ? 'on' : ''}" data-lineage="${l.id}">
          <span class="hg">${l.glyph}</span><b>${esc(l.name)}</b>
          <i>${esc(l.blurb)}</i>
          <span class="hstat">💪${l.base.strength} 🧠${l.base.cunning} ✨${l.base.grace}</span>
        </button>`).join('')}
      </div>
      <div class="namerow">
        <label>Your name <input id="in-god" maxlength="30" value="Alethe of the Small Isle"></label>
        <label>Its name <input id="in-beast" maxlength="18" value="Pim"></label>
      </div>
      <p class="tiny">${esc(C.HATCH_HINTS[0])}</p>
      <button class="btn big" id="btn-begin">Open your eyes</button>
    `, { wide: true });
    let chosen = C.LINEAGE_LIST[0].id;
    $('modal').querySelectorAll('[data-lineage]').forEach(b => {
      b.onclick = () => {
        chosen = b.dataset.lineage;
        $('modal').querySelectorAll('[data-lineage]').forEach(x => x.classList.toggle('on', x === b));
      };
    });
    $('btn-begin').onclick = () => {
      const god = ($('in-god').value || 'the Nameless').trim().slice(0, 30);
      const beast = ($('in-beast').value || C.LINEAGES[chosen].name).trim().slice(0, 18);
      hideModal();
      onDone(chosen, beast, god);
    };
  }

  function showOffline(rep) {
    if (!rep) return;
    showModal(`
      <h1>While you were gone</h1>
      <p class="lede">${rep.minutes} minutes passed on the island — ${rep.days} day${rep.days === 1 ? '' : 's'}.</p>
      <div class="offgrid">
        <div><b>${fmt(rep.renown)}</b><i>renown</i></div>
        <div><b>${fmt(rep.coin)}</b><i>coin</i></div>
        <div><b>${fmt(rep.harvests)}</b><i>harvested</i></div>
      </div>
      <p class="tiny">Your creature kept doing whatever you last taught it. For better or worse.</p>
      <button class="btn big" onclick="SW.ui.hideModal()">Back to work</button>
    `);
  }

  function showFestival(g) {
    const r = g.festival.lastResult;
    if (!r) return;
    showModal(`
      <h1>${esc(r.name)}</h1>
      <p class="lede">You placed <b>${r.place}${ordSuffix(r.place)}</b> with a score of ${fmt(r.score)}. +${r.payout} renown.</p>
      <table class="register">
        ${r.field.map((f, i) => `<tr class="${f.you ? 'you' : ''}"><td class="rg-place">${i + 1}</td><td class="rg-name">${esc(f.name)}</td><td class="rg-renown">${fmt(f.score)}</td></tr>`).join('')}
      </table>
      <button class="btn big" onclick="SW.ui.hideModal()">Close</button>
    `);
  }

  function showHelp() {
    showModal(`
      <h1>How this works</h1>
      <div class="help">
        <p><b>You never command the creature.</b> It acts on its own, out of learned weights. When it finishes an act,
        you get a few seconds to <b>praise</b> (P) or <b>strike</b> (S) it. Praise multiplies that behaviour's weight;
        striking divides it and makes the creature meaner and less bonded. That is the entire training system.</p>
        <p><b>The Leash of Learning</b> means it copies chores you do by hand. Slower than praise, but it costs nothing
        and it works while you are busy farming.</p>
        <p><b>Needs beat training.</b> A starving beast will eat your ripe field no matter how well you taught it not to.
        Feed it, or it teaches itself bad habits.</p>
        <p><b>Focus</b> is your own stamina, and it is deliberately scarce. Everything you cannot do by hand, the creature
        eventually does for free — that is what you are working toward.</p>
        <p><b>Faith and Awe</b> both make prayer and renown. Faith comes from feeding and helping; awe comes from storms
        and a terrorising creature. Awe decays and breeds unrest; faith compounds. Pick a god to be.</p>
        <p><b>Festivals</b> every five days, rotating between crops, creature and shrine. <b>Feats</b> and placement in
        <b>the Register</b> are where renown really comes from.</p>
        <p><b>Learning dies with the animal.</b> Praising a chore it already knows well also <i>ingrains</i> it — and only ingrained
        behaviour survives a <b>generation leap</b>. Breed before it dies of old age and the whelp starts already knowing its
        parent's trade. Let it die first and you lose most of that. Every few generations the line changes shape permanently.</p>
        <p><b>The island is not fully known to you.</b> Unknown things sit out past the farm as <b>?</b> marks; walking over and
        examining one is the only source of <b>Insight</b>, which buys permanent upgrades on the neural web. Raising a terrace
        makes the island physically bigger and puts a fresh band of unknown ground inside it.</p>
        <p class="tiny">Keys — <b>P</b> praise · <b>S</b> strike · <b>L</b> listen · <b>B</b> breed · <b>Space</b> pause · <b>1/2/3</b> speed · <b>F</b> festival panel</p>
      </div>
      <button class="btn big" onclick="SW.ui.hideModal()">Understood</button>
    `, { wide: true });
  }

  function showMenu() {
    showModal(`
      <h1>Menu</h1>
      <div class="btnrow col">
        <button class="btn" id="mn-help">How this works</button>
        <button class="btn" id="mn-export">Copy save to clipboard</button>
        <button class="btn" id="mn-import">Paste a save</button>
        <button class="btn danger" id="mn-wipe">Abandon this island and start again</button>
        <button class="btn" onclick="SW.ui.hideModal()">Back</button>
      </div>
      <p class="tiny" id="mn-note">Progress saves to this browser automatically.</p>
    `);
    $('mn-help').onclick = showHelp;
    $('mn-export').onclick = () => {
      const txt = SW.core.exportSave(G);
      navigator.clipboard && navigator.clipboard.writeText(txt);
      $('mn-note').textContent = 'Copied. Keep it somewhere safe.';
    };
    $('mn-import').onclick = () => {
      const txt = prompt('Paste a save string:');
      if (!txt) return;
      try {
        const g = SW.state.hydrate(SW.core.importSave(txt));
        SW.main.replace(g);
        hideModal();
      } catch (e) { $('mn-note').textContent = 'That was not a save.'; }
    };
    $('mn-wipe').onclick = () => {
      if (!confirm('Erase this island for good?')) return;
      SW.core.wipe();
      location.reload();
    };
  }

  // --- input -------------------------------------------------------------
  function onCanvasMove(e) {
    const w = SW.render.toWorld(e.clientX, e.clientY);
    const p = SW.render.hitPlot(G, w.x, w.y);
    const f = SW.render.hitFeature(G, w.x, w.y);
    SW.render.setHover(p ? p.i : -1);
    SW.render.setHoverFeature(f);
    $('stage').style.cursor = (p || f || G.listen || SW.render.hitCreature(G, w.x, w.y)) ? 'pointer' : 'default';
  }

  function onCanvasClick(e) {
    const w = SW.render.toWorld(e.clientX, e.clientY);
    if (G.listen) { M.hitListen(G, w.x, w.y); return; }
    const feat = SW.render.hitFeature(G, w.x, w.y);
    if (feat) { D.examine(G, feat); dirty.panel = true; return; }
    if (SW.render.hitCreature(G, w.x, w.y)) {
      if (G.creature.pending) Cr.praise(G);
      else log(G, `${G.creature.name} looks up at you.`);
      dirty.card = true;
      return;
    }
    const p = SW.render.hitPlot(G, w.x, w.y);
    if (p) {
      SW.render.setSelected(p.i);
      quickAct(p);
      dirty.panel = true;
      return;
    }
    const lp = SW.render.hitLockedPlot(G, w.x, w.y);
    if (lp) { setTab('farm'); return; }
    const R = SW.render;
    if (Math.hypot(w.x - R.WOOD.x, w.y - R.WOOD.y) < 70) { S.playerForage(G); return; }
    if (Math.hypot(w.x - R.VILLAGE.x, w.y - R.VILLAGE.y) < 90) { setTab('village'); return; }
    if (Math.hypot(w.x - R.SHRINE.x, w.y - R.SHRINE.y) < 70) { setTab('village'); return; }
    SW.render.setSelected(-1);
  }

  /* One click does the obvious thing to a plot. Shift-click just selects. */
  function quickAct(p) {
    if (p.state === 'raw') S.playerTill(G, p);
    else if (p.state === 'ripe') S.playerHarvest(G, p);
    else if (p.state === 'growing') S.playerWater(G, p);
    else if (p.state === 'tilled') {
      const seed = F.bestSeed(G);
      if (seed && S.rankOf(G).id >= seed.rank) S.playerSow(G, p, seed.id);
      else log(G, 'No seed in the bag. Buy some at market.', 'warn');
    }
  }

  function setTab(t) {
    tab = t;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    dirty.panel = true;
    renderPanel(G);
  }

  function onPanelClick(e) {
    const t = e.target.closest('button, [data-plot]');
    if (!t) return;
    const d = t.dataset;
    if (d.plot !== undefined) { SW.render.setSelected(+d.plot); renderActionBar(G); renderPanel(G); return; }
    if (d.sell) { const gain = F.sell(G, d.sell, +d.n); if (gain) log(G, `Sold for ${fmt(gain)} coin.`); }
    else if (d.buy) { const n = F.buySeed(G, d.buy, +d.n); log(G, n ? `Bought ${n} ${C.CROPS[d.buy].name} seed.` : 'Not enough coin.', n ? 'info' : 'warn'); }
    else if (d.wood) { const n = F.buyWood(G, +d.wood); log(G, n ? `${n} timber delivered.` : 'Not enough coin.', n ? 'info' : 'warn'); }
    else if (d.tech) B.equipTech(G, d.tech);
    else if (d.fight !== undefined) B.fight(G, +d.fight);
    else if (d.build) W.build(G, d.build);
    else if (d.chant) M2.startChant(G, d.chant);
    else if (d.tone !== undefined) M2.chantInput(G, +d.tone);
    else if (d.sellfish) { const c = M2.sellFish(G, d.sellfish, 999); if (c) log(G, `Sold the catch for ${fmt(c)} coin.`, 'good'); }
    else if (d.eatfish) { const f = M2.eatFish(G, d.eatfish, 999); if (f) log(G, `${f} food into the granary.`, 'good'); }
    else if (d.carbuy) T.buyFromCaravan(G, d.carbuy, 3);
    else if (d.diplo) T.diplomacy(G, d.rival, d.diplo);
    else if (d.boon) P.buyBoon(G, d.boon);
    else if (d.title) R.setTitle(G, d.title);
    else if (d.relic) {
      // Click toggles equip; two of a rank selected with shift are the fuse pair.
      if (relicPick.includes(d.relic)) relicPick = relicPick.filter(x => x !== d.relic);
      else relicPick = [...relicPick, d.relic].slice(-2);
      R.equip(G, d.relic);
    }
    else if (d.fert) {
      const sel = G.plots.find(p => p.i === SW.render.getSelected());
      const target = sel || G.plots.slice().sort((a, b) => W.soilOf(a) - W.soilOf(b))[0];
      if (target) W.fertilise(G, target, d.fert);
    }
    else if (d.role) { W.assign(G, d.role, e.target.value); }
    else if (d.todo) doTodo(G, d.todo);
    else if (d.mill) { const f = F.mill(G, d.mill, 1); if (f) log(G, `Milled into ${f} food.`); }
    else if (d.millAll !== undefined) {
      let total = 0;
      for (const cr of C.CROP_LIST) total += F.mill(G, cr.id, G.stock[cr.id] | 0);
      log(G, total ? `The granary takes ${total} food.` : 'Nothing to mill.', total ? 'good' : 'warn');
    }
    else if (d.miracle) S.castMiracle(G, d.miracle);
    else if (d.neuron) D.buyNeuron(G, d.neuron);
    else if (d.buymat) { const n = M.buyMaterial(G, d.buymat, 5); if (n) log(G, `${n} ${C.MATERIALS[d.buymat].name.toLowerCase()} delivered.`); }
    else if (d.mat) {
      // First click fills the left slot, second the right, third starts over.
      if (benchA === null) benchA = d.mat;
      else if (benchB === null) benchB = d.mat;
      else { benchA = d.mat; benchB = null; }
    }
    else if (d.feed) Cr.feed(G, d.feed);
    else if (d.leash) { G.creature.leash = d.leash; log(G, `Leash of ${C.LEASHES[d.leash].name}.`); }
    else if (d.act) {
      const p = G.plots.find(pp => pp.i === SW.render.getSelected());
      switch (d.act) {
        case 'till': p && S.playerTill(G, p); break;
        case 'sow': p && S.playerSow(G, p, d.crop); break;
        case 'water': p && S.playerWater(G, p); break;
        case 'harvest': p && S.playerHarvest(G, p); break;
        case 'forage': S.playerForage(G); break;
        case 'clearplot': S.clearPlot(G); break;
        case 'hut': S.buildHut(G); break;
        case 'shrine': S.upgradeShrine(G); break;
        case 'ring': D.raiseRing(G); break;
        case 'listen': M.startListen(G); break;
        case 'breed': if (Ln.canBreed(G)) Ln.breed(G, false); break;
        case 'combine':
          if (benchA && benchB) { M.combine(G, benchA, benchB); benchA = null; benchB = null; }
          break;
        case 'benchclear': benchA = null; benchB = null; break;
        case 'cure': B.cure(G); break;
        case 'mateyes': B.acceptMate(G); break;
        case 'mateno': B.refuseMate(G); break;
        case 'deliver': T.deliverContract(G); break;
        case 'fish': M2.startFishing(G); break;
        case 'strike': M2.strike(G); break;
        case 'fuse': if (relicPick.length === 2) { R.fuse(G, relicPick[0], relicPick[1]); relicPick = []; } else log(G, 'Pick exactly two of the same rank.', 'warn'); break;
        case 'ascend':
          if (P.canAscend(G) && confirm('Let this island go and begin again?')) {
            const n = P.ascend(G);
            if (n) SW.main.replace(n);
          }
          break;
        case 'openevent': showEvent(G); break;
      }
    }
    dirty.panel = true; dirty.card = true;
    renderPanel(G);
    renderActionBar(G);
    renderCard(G);
  }

  function onKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'p') { Cr.praise(G); renderCard(G); }
    else if (k === 's') { Cr.scold(G); renderCard(G); }
    else if (k === ' ') {
      e.preventDefault();
      if (G.fishing) M2.strike(G); else SW.main.togglePause();
    }
    else if (G.chant && '67890'.includes(k)) M2.chantInput(G, '67890'.indexOf(k));
    else if (k === 'c' && G.fishing === null) M2.startFishing(G);
    else if (k === '1') SW.main.setSpeed(1);
    else if (k === '2') SW.main.setSpeed(2);
    else if (k === '3') SW.main.setSpeed(4);
    else if (k === 'f') setTab('register');
    else if (k === 'l') M.startListen(G);
    else if (k === 'b') { if (Ln.canBreed(G)) Ln.breed(G, false); }
    else if (k === '?') showHelp();
  }

  // --- wiring ------------------------------------------------------------
  function init(game) {
    G = game;
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    // pointerdown, not click: these containers are rebuilt several times a
    // second and a click needs mousedown+mouseup on the same live element.
    $('panel-body').addEventListener('pointerdown', onPanelClick);
    $('panel-body').addEventListener('change', onPanelClick);
    $('play').addEventListener('pointerdown', onPanelClick);
    $('todo').addEventListener('pointerdown', onPanelClick);
    $('card').addEventListener('pointerdown', onPanelClick);
    $('actionbar').addEventListener('pointerdown', onPanelClick);
    $('stage').addEventListener('mousemove', onCanvasMove);
    $('stage').addEventListener('click', onCanvasClick);
    $('btn-praise').onclick = () => { Cr.praise(G); renderCard(G); };
    $('btn-scold').onclick = () => { Cr.scold(G); renderCard(G); };
    $('btn-menu').onclick = showMenu;
    $('btn-help').onclick = showHelp;
    document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => SW.main.setSpeed(+b.dataset.speed));
    $('btn-pause').onclick = () => SW.main.togglePause();
    window.addEventListener('keydown', onKey);
    lastFestivalShown = G.festival.index;
    setTab('farm');
    renderCard(G);
    renderLog(G);
  }

  /* A dot on any tab with something waiting behind it. */
  function nudgeTabs(g) {
    const want = {
      farm: F.ripePlots(g).length > 0,
      market: !!(g.caravan && g.caravan.contract),
      village: g.village.food < 25 || g.village.unrest > 60 || (g.people || []).some(p => p.role === 'idle'),
      powers: false,
      frontier: D.unknownCount(g) > 0 && g.res.focus >= D.examineCost(g) + 6,
      bench: M.benchUnlocked(g) && M.matCount(g) >= 2,
      beast: !!g.creature.ailment || !!g.mateOffer || !!g.arenaChallenge,
      register: false,
      feats: (g.oaths || []).some(o => !o.done && W.oathProgress(g, o) >= 1) || SW.prestige.canAscend(g)
    };
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('nudge', !!want[b.dataset.tab]));
  }

  function setGame(g) { G = g; lastFestivalShown = g.festival.index; relicPick = []; playKey = ''; }

  let acc = 0;
  function frame(g, dt) {
    G = g;
    acc += dt;
    renderJudge(g);
    renderPlay(g);
    if (g.event && !$('modal').classList.contains('on')) showEvent(g);
    if (acc > 0.2) {
      acc = 0;
      renderTop(g);
      renderCard(g);
      renderPanel(g);
      renderActionBar(g);
      renderTodo(g);
      nudgeTabs(g);
      if (dirty.log) { renderLog(g); dirty.log = false; }
      document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === g.speed && !g.paused));
      $('btn-pause').textContent = g.paused ? '▶' : '❚❚';
    }
    if (g.festival.index !== lastFestivalShown) {
      lastFestivalShown = g.festival.index;
      showFestival(g);
    }
  }

  SW.ui = { init, setGame, frame, log, showHatch, showOffline, showHelp, hideModal, setTab };
})(window.SW = window.SW || {});
