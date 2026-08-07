/* Skyward Reach — DOM interface: panels, tabs, modals, input. */
(function (SW) {
  'use strict';
  const C = SW.content;
  const F = SW.farm;
  const Cr = SW.creature;
  const S = SW.sim;
  const { clamp, fmt, titleCase } = SW.core;

  let G = null;
  let tab = 'farm';
  let lastFestivalShown = -1;
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
        <span class="pr-water">${p.crop ? '💧' + Math.round(p.water) : ''}</span>
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
      <p class="tiny">Lifetime: ${fmt(g.stats.harvests)} harvested · ${fmt(g.stats.sold)} sold · ${fmt(g.stats.coinEarned)} coin earned.</p>`;
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
      <div class="section-label">Build</div>
      <div class="btnrow">
        <button class="btn" data-act="hut">🛖 Raise a hut <span class="cost">${hc.wood}🪵 ${hc.coin}🪙</span></button>
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
      <p class="tiny">${g.stats.miracles} miracles worked.</p>`;
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
    return `<p class="hint">${earned.length} of ${C.FEATS.length} feats. Renown is the only thing anyone up here actually counts.</p>
      ${trophies.length ? `<div class="section-label">Trophy shelf</div><div class="trophies">
        ${trophies.map(t => `<span class="trophy p${t.place}" title="${esc(t.name)} — day ${t.day}">${t.place === 1 ? '🥇' : t.place === 2 ? '🥈' : '🥉'} ${esc(t.name.replace('The ', ''))}</span>`).join('')}
      </div>` : ''}
      <div class="feats">${earned.map(f => row(f, true)).join('')}${open.map(f => row(f, false)).join('')}</div>`;
  }

  // --- plot action bar ---------------------------------------------------
  function renderActionBar(g) {
    const el = $('actionbar');
    const i = SW.render.getSelected();
    const p = g.plots.find(pp => pp.i === i);
    if (!p) { setHTML(el, '<span class="ab-hint">Click a plot, the woodland, or your creature.</span>'); return; }
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
        <p class="tiny">Keys — <b>P</b> praise · <b>S</b> strike · <b>Space</b> pause · <b>1/2/3</b> speed · <b>F</b> festival panel</p>
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
    SW.render.setHover(p ? p.i : -1);
    $('stage').style.cursor = p || SW.render.hitCreature(G, w.x, w.y) ? 'pointer' : 'default';
  }

  function onCanvasClick(e) {
    const w = SW.render.toWorld(e.clientX, e.clientY);
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
    else if (d.mill) { const f = F.mill(G, d.mill, 1); if (f) log(G, `Milled into ${f} food.`); }
    else if (d.millAll !== undefined) {
      let total = 0;
      for (const cr of C.CROP_LIST) total += F.mill(G, cr.id, G.stock[cr.id] | 0);
      log(G, total ? `The granary takes ${total} food.` : 'Nothing to mill.', total ? 'good' : 'warn');
    }
    else if (d.miracle) S.castMiracle(G, d.miracle);
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
    else if (k === ' ') { e.preventDefault(); SW.main.togglePause(); }
    else if (k === '1') SW.main.setSpeed(1);
    else if (k === '2') SW.main.setSpeed(2);
    else if (k === '3') SW.main.setSpeed(4);
    else if (k === 'f') setTab('register');
    else if (k === '?') showHelp();
  }

  // --- wiring ------------------------------------------------------------
  function init(game) {
    G = game;
    document.querySelectorAll('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    // pointerdown, not click: these containers are rebuilt several times a
    // second and a click needs mousedown+mouseup on the same live element.
    $('panel-body').addEventListener('pointerdown', onPanelClick);
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

  function setGame(g) { G = g; lastFestivalShown = g.festival.index; }

  let acc = 0;
  function frame(g, dt) {
    G = g;
    acc += dt;
    renderJudge(g);
    if (acc > 0.2) {
      acc = 0;
      renderTop(g);
      renderCard(g);
      renderPanel(g);
      renderActionBar(g);
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
