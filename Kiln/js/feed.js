/* Kiln — the Circle: a feed that ends.
 *
 * The batch is everyone in your circle who made something today. It is built
 * once, stored, and does not change again until tomorrow. There is no
 * refresh gesture, no "new posts" pill, no infinite scroll, and nothing
 * loads when you reach the bottom, because there is a bottom and reaching it
 * is the normal way to finish.
 *
 * That one property — a finite, settled batch — removes most of what makes a
 * feed compulsive. You cannot pull a lever that has no handle. Everything
 * else in this file is downstream of it.
 *
 * The ordering is a short list of rules the user can read and switch off,
 * and every card will tell you which rule put it where it is. An algorithm
 * you can interrogate stops being a thing that happens to you.
 */
(function (K) {
  'use strict';
  const { el, today, plural, agoWords } = K.core;
  const C = K.content;
  const S = K.state;

  const RULE_TEXT = {
    chrono: 'Keep the circle in the order it was made. No ranking at all.',
    quiet: 'People you have not heard from in a while come first.',
    unseen: 'Things you have not seen yet come before things you have.',
    mycraft: 'If you made something today, put the same craft near the top.'
  };

  /* --- building the day's batch ------------------------------------------
   * Called at most once per day. Storing the ids means the order is fixed
   * even across reloads: the app cannot quietly reshuffle to show you
   * something it thinks will hold you longer, because it has already
   * committed to an order in writing. */
  function batch(state) {
    const d = today();
    if (state.batch.day === d && state.batch.ids.length) {
      return state.batch.ids.map(K.peers.postById).filter(Boolean);
    }
    const posts = K.peers.postsOn(d);
    const ordered = order(state, posts);
    state.batch = { day: d, ids: ordered.map(p => p.id) };
    return ordered;
  }

  function lastHeardFrom(state, peerId) {
    let last = -1;
    for (const id in state.seen) {
      if (id.indexOf(peerId + '@') === 0) {
        const day = parseInt(id.slice(id.indexOf('@') + 1), 10);
        if (day > last) last = day;
      }
    }
    return last;
  }

  function order(state, posts) {
    const d = today();
    const r = state.rules;
    const mineToday = S.piecesOn(state, d).map(p => p.craft);

    const scored = posts.map((p, i) => {
      let score = 0;
      let why = 'The order your circle has always been in.';

      if (r.unseen && state.seen[p.id] === undefined) {
        score -= 100;
        why = 'You have not seen this one yet.';
      }
      if (r.quiet) {
        const last = lastHeardFrom(state, p.peer);
        const gap = last < 0 ? 999 : d - last;
        if (gap >= 3) {
          score -= Math.min(gap, 60);
          why = last < 0
            ? 'You have not heard from ' + K.peers.peer(p.peer).name + ' before.'
            : 'You have not heard from ' + K.peers.peer(p.peer).name + ' since ' +
              agoWords(gap) + '.';
        }
      }
      if (r.mycraft && mineToday.indexOf(p.craft) >= 0) {
        score -= 40;
        why = 'You made a ' + C.CRAFTS[p.craft].name.toLowerCase() +
              ' today, and so did they.';
      }
      if (!r.chrono && !r.unseen && !r.quiet && !r.mycraft) {
        why = 'No rules are switched on, so this is just the circle in order.';
      }
      return { p, score, i, why };
    });

    scored.sort((a, b) => (a.score - b.score) || (a.i - b.i));
    return scored.map(s => { s.p.why = s.why; return s.p; });
  }

  /* --- the view ----------------------------------------------------------- */
  function build(state, onChange) {
    const root = el('section', { class: 'view feed' });
    const d = today();

    if (!K.charter.circleOpen(state)) {
      root.appendChild(gate(state, onChange));
      return root;
    }

    const posts = batch(state);

    root.appendChild(el('div', { class: 'feed-head' }, [
      el('h1', { class: 'sec big', text: posts.length
        ? plural(posts.length, 'person', 'people') + ' made something today'
        : 'Nobody made anything today' }),
      el('p', { class: 'muted small', text: posts.length
        ? 'That is the whole batch. It was decided this morning and it will not ' +
          'grow while you are reading it.'
        : 'That happens. Everyone in your circle is a person with a week going on.' })
    ]));

    const io = window.IntersectionObserver ? new IntersectionObserver(entries => {
      let touched = false;
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0.5) {
          const id = e.target.dataset.post;
          if (id && S.markSeen(state, id)) touched = true;
          io.unobserve(e.target);
        }
      }
      if (touched) K.core.save(state);
    }, { threshold: [0.55] }) : null;

    for (const p of posts) {
      const card = postCard(state, p, onChange);
      card.dataset.post = p.id;
      root.appendChild(card);
      if (io) io.observe(card);
      else S.markSeen(state, p.id);
    }

    root.appendChild(endCard(state, posts.length));
    return root;
  }

  /* The make-first gate. It is the user's own rule, so the card says so, and
   * the way out is one tap — to the studio, not to a paywall. */
  function gate(state, onChange) {
    return el('div', { class: 'gate' }, [
      el('h1', { class: 'sec big', text: 'You asked for this one' }),
      el('p', { text:
        'You turned on "make before you look". The batch is sitting there and it ' +
        'is not going anywhere — it is the same eight people whether you open it ' +
        'now or tonight. Go and make the thing first.' }),
      el('div', { class: 'gate-acts' }, [
        el('button', {
          type: 'button', class: 'big-btn',
          onclick: () => onChange({ go: 'studio' })
        }, ['Open the studio']),
        el('button', {
          type: 'button', class: 'tool-btn quiet',
          onclick: () => onChange({ go: 'settings' })
        }, ['Change this rule'])
      ]),
      el('p', { class: 'muted small', text:
        'Turning it off takes effect tomorrow — that was the deal you made with ' +
        'yourself, and it is the only reason the rule is worth anything.' })
    ]);
  }

  function endCard(state, n) {
    const made = S.madeToday(state);
    return el('div', { class: 'end-card' }, [
      el('div', { class: 'end-rule' }),
      el('h2', { text: n ? 'That is everyone.' : 'Nothing today.' }),
      el('p', { class: 'muted', text: n
        ? 'You have reached the end of the day. There is nothing underneath this, ' +
          'and nothing new will appear if you wait. Tomorrow there will be a new ' +
          'prompt and a new batch.'
        : 'Come back tomorrow, or make something anyway.' }),
      el('p', { class: 'small', text: made
        ? 'You made something today too. Good day.'
        : 'You have not made anything today. That is allowed. So is closing the app.' })
    ]);
  }

  /* --- one post ------------------------------------------------------------ */
  function postCard(state, post, onChange) {
    const peer = K.peers.peer(post.peer);
    const wrap = el('article', { class: 'card' });

    wrap.appendChild(el('div', { class: 'card-head' }, [
      K.card.who(peer, peer.about),
      el('span', { class: 'chip quiet-chip', text: C.CRAFTS[post.craft].name.toLowerCase() })
    ]));

    if (post.title) wrap.appendChild(el('div', { class: 'card-title', text: post.title }));

    wrap.appendChild(K.card.body(post.craft, post.payload));

    if (post.note) wrap.appendChild(el('p', { class: 'card-note', text: post.note }));

    /* "Why am I seeing this" is one tap and always answerable. */
    const whyBtn = el('button', {
      type: 'button', class: 'why-btn',
      onclick: () => {
        whyBox.hidden = !whyBox.hidden;
        whyBtn.setAttribute('aria-expanded', whyBox.hidden ? 'false' : 'true');
      },
      'aria-expanded': 'false'
    }, ['why this is here']);
    const whyBox = el('p', { class: 'why-box', hidden: true, text: post.why || '' });

    wrap.appendChild(el('div', { class: 'card-foot' }, [whyBtn]));
    wrap.appendChild(whyBox);
    wrap.appendChild(respond(state, post, onChange));
    return wrap;
  }

  /* --- responding ----------------------------------------------------------
   * A specific sentence about the work, or nothing. There is no button that
   * costs nothing to press, because a button that costs nothing to press
   * produces a number, and a number produces a ranking. */
  function respond(state, post, onChange) {
    const box = el('div', { class: 'respond' });
    const given = state.given[post.id];

    if (given) {
      const pr = C.PRAISE.find(x => x.id === given.praise);
      box.appendChild(el('p', { class: 'muted small', text:
        'You said: ' + (pr ? pr.t : '') + (given.text ? ' — "' + given.text + '"' : '') }));
      return box;
    }

    /* Folded away until asked for. An always-open response panel under every
     * post is a standing invitation to react, and the invitation itself is a
     * pressure — the reason every platform leaves the box open is that an
     * open box gets used. Here, responding is a thing you decide to do. */
    const open = el('button', {
      type: 'button', class: 'say-btn', onclick: () => {
        open.remove();
        box.appendChild(panel);
      }
    }, ['Say something about this']);
    const panel = el('div', { class: 'respond-panel' });
    box.appendChild(open);

    let chosen = null;
    const pool = C.PRAISE.filter(p => p.for.indexOf(post.craft) >= 0);
    const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Say something specific' });
    pool.forEach(p => {
      const b = el('button', {
        type: 'button', class: 'chip-btn', 'aria-pressed': 'false',
        onclick: () => {
          chosen = chosen === p.id ? null : p.id;
          K.core.$$('.chip-btn', chips).forEach(x => {
            const on = x.dataset.id === chosen;
            x.classList.toggle('on', on);
            x.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          sync();
        }
      }, [p.t]);
      b.dataset.id = p.id;
      chips.appendChild(b);
    });

    const note = el('input', {
      type: 'text', class: 'resp-in', maxlength: '140',
      placeholder: 'Add a sentence, if you have one',
      'aria-label': 'Optional sentence'
    });

    const cool = el('p', { class: 'cool', hidden: true, role: 'status' });
    const send = el('button', { type: 'button', class: 'tool-btn go', disabled: true }, ['Send']);
    const hint = el('p', { class: 'muted tiny', text:
      'Only they will see this. Nobody is counting.' });

    let timer = null, left = 0;

    function hot(text) {
      const t = ' ' + text.toLowerCase() + ' ';
      for (const w of C.HEAT) if (t.indexOf(w) >= 0) return w;
      if (text.length > 12 && text === text.toUpperCase() && /[A-Z]/.test(text)) return 'shouting';
      return null;
    }

    function sync() {
      send.disabled = !chosen || left > 0;
      send.textContent = left > 0 ? 'Send in ' + left : 'Send';
    }

    /* The cool-down. Not a filter and not a ban: the message still sends,
     * intact, if you still want it in forty-five seconds. Almost nobody
     * does, and the ones who do meant it. */
    function checkHeat() {
      const w = hot(note.value);
      if (!w || timer) return;
      left = 45;
      cool.hidden = false;
      cool.textContent = 'That reads hot. Nothing is blocked — the send button just ' +
        'waits forty-five seconds. Change it, keep it, or delete it. It is yours either way.';
      sync();
      timer = setInterval(() => {
        left--;
        if (left <= 0) {
          clearInterval(timer); timer = null; left = 0;
          cool.textContent = 'Still want to send it? Go ahead.';
        }
        sync();
      }, 1000);
    }

    note.addEventListener('input', () => { sync(); });
    note.addEventListener('blur', checkHeat);

    send.addEventListener('click', () => {
      if (!chosen) return;
      const w = hot(note.value);
      if (w && left === 0 && !timer && !send.dataset.waited) {
        send.dataset.waited = '1';
        checkHeat();
        return;
      }
      state.given[post.id] = { praise: chosen, text: note.value.trim(), day: today() };
      if (timer) { clearInterval(timer); timer = null; }
      onChange({ responded: post.id });
    });

    panel.appendChild(chips);
    panel.appendChild(el('div', { class: 'resp-row' }, [note, send]));
    panel.appendChild(cool);
    panel.appendChild(hint);
    return box;
  }

  K.feed = { build, batch, order, RULE_TEXT };
})(window.Kiln = window.Kiln || {});
