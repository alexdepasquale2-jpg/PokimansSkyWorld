/* Kiln — the Watchtower: ten techniques, done to you on purpose.
 *
 * This is the part of the app that is actually about empowerment, and it is
 * the part most likely to be misread as a lecture, so the demos are real.
 * The variable-reward demo runs a genuine variable-ratio schedule and shows
 * you your own pull count. The drift demo really does move a baseline while
 * you watch. The collection demo really does measure your behaviour in this
 * tab and then shows you the payload it did not send.
 *
 * Being told a hook exists and feeling one close on you are different kinds
 * of knowing, and only the second one transfers to the next app. A child who
 * has watched a streak counter take a hostage in a sandbox will recognise
 * the shape of it in the wild, on an app that will never explain itself.
 *
 * None of these demos are wired to anything real. Nothing in here writes to
 * your pieces, your shelf, or your circle.
 */
(function (K) {
  'use strict';
  const { el, $, $$, plural } = K.core;
  const C = K.content;

  /* Behaviour this tab quietly measures, for the collection demo at the end.
   * It never leaves this object and it is wiped when you leave the tab. */
  const watched = { opened: Date.now(), expands: 0, longest: null, longestMs: 0, taps: 0, scroll: 0 };

  function build(state, onChange) {
    const root = el('section', { class: 'view tower' });
    watched.opened = Date.now();
    watched.expands = 0; watched.taps = 0; watched.scroll = 0;

    root.appendChild(el('div', { class: 'tower-head' }, [
      el('h1', { class: 'sec big', text: 'How the other apps work' }),
      el('p', { text:
        'Ten techniques, each with a working demo that does the thing to you. ' +
        'None of them are guesses about what apps might do — they are the ' +
        'standard toolkit, and most of them are in the app you used before ' +
        'this one.' }),
      el('p', { class: 'muted small', text:
        'You have read ' + state.read.length + ' of ' + C.PATTERNS.length + '. ' +
        'Nothing happens when you finish. There is no badge.' })
    ]));

    C.PATTERNS.forEach(pat => {
      root.appendChild(patternCard(state, pat, onChange));
    });

    root.appendChild(el('div', { class: 'end-card' }, [
      el('div', { class: 'end-rule' }),
      el('h2', { text: 'One question that covers most of it' }),
      el('p', { text:
        'When something in an app feels good, ask who chose the timing. If you ' +
        'chose it, it is a tool. If it chose you, it is a hook, and it was ' +
        'designed by someone who was paid for the time you spent.' })
    ]));

    return root;
  }

  function patternCard(state, pat, onChange) {
    const open = { at: 0 };
    const card = el('article', { class: 'tower-card' });
    const bodyBox = el('div', { class: 'tower-body', hidden: true });

    const head = el('button', {
      type: 'button', class: 'tower-head-btn', 'aria-expanded': 'false',
      onclick: () => {
        const show = bodyBox.hidden;
        bodyBox.hidden = !show;
        head.setAttribute('aria-expanded', show ? 'true' : 'false');
        card.classList.toggle('open', show);
        if (show) {
          watched.expands++;
          open.at = Date.now();
          if (!bodyBox.dataset.built) { fill(state, bodyBox, pat, onChange); bodyBox.dataset.built = '1'; }
          if (state.read.indexOf(pat.id) < 0) {
            state.read.push(pat.id);
            K.core.save(state);
          }
        } else if (open.at) {
          const ms = Date.now() - open.at;
          if (ms > watched.longestMs) { watched.longestMs = ms; watched.longest = pat.name; }
        }
      }
    }, [
      el('span', { class: 'tower-n', text: state.read.indexOf(pat.id) >= 0 ? '✓' : '·' }),
      el('div', {}, [
        el('b', { text: pat.name }),
        el('span', { class: 'muted tiny', text: pat.one })
      ])
    ]);

    card.appendChild(head);
    card.appendChild(bodyBox);
    return card;
  }

  function fill(state, box, pat, onChange) {
    box.appendChild(el('p', { text: pat.body }));
    box.appendChild(el('p', { text: pat.body2 }));
    const demo = el('div', { class: 'demo' }, [
      el('div', { class: 'demo-tag', text: 'live demo — this one is real' })
    ]);
    (DEMOS[pat.demo] || (() => {}))(demo, state);
    box.appendChild(demo);
    box.appendChild(el('div', { class: 'instead' }, [
      el('b', { text: 'What Kiln does instead' }),
      el('p', { text: pat.instead })
    ]));
  }

  /* ====================================================================== */
  const DEMOS = {};

  /* --- 1. variable-ratio reward ------------------------------------------ */
  DEMOS.variable = function (host) {
    /* A real VR schedule: the payout lands after a random 1–8 pulls, then a
     * fresh interval is drawn. This is the schedule in a slot machine and it
     * is the schedule behind pull-to-refresh. */
    let pulls = 0, wins = 0, need = 1 + Math.floor(Math.random() * 8), since = 0;
    const history = [];

    const face = el('div', { class: 'slot' , text: 'pull'});
    const tape = el('div', { class: 'tape', 'aria-hidden': 'true' });
    const read = el('p', { class: 'demo-read', role: 'status' });

    const btn = el('button', { type: 'button', class: 'tool-btn go', onclick: () => {
      pulls++; since++; watched.taps++;
      let win = false;
      if (since >= need) { win = true; wins++; since = 0; need = 1 + Math.floor(Math.random() * 8); }
      history.push(win);
      face.textContent = win ? '✦ something new' : 'nothing';
      face.classList.toggle('win', win);
      const dot = el('span', { class: 'tape-dot' + (win ? ' win' : '') });
      tape.appendChild(dot);
      if (tape.children.length > 60) tape.removeChild(tape.firstChild);
      read.textContent = 'You have pulled ' + pulls + ' times and been rewarded ' +
        wins + '. The next reward is between one and eight pulls away, redrawn ' +
        'every time. There is no pattern to find. That is the design — a ' +
        'schedule you could learn would stop working.';
    }}, ['Pull to refresh']);

    host.appendChild(face);
    host.appendChild(btn);
    host.appendChild(tape);
    host.appendChild(read);
    host.appendChild(el('p', { class: 'muted tiny', text:
      'Notice the urge to do one more to see. That urge is the product.' }));
  };

  /* --- 2. infinite scroll ------------------------------------------------- */
  DEMOS.infinite = function (host) {
    const FILL = ['a cat doing something', 'someone angry about a film',
      'a recipe with a long story first', 'a stranger\'s holiday',
      'an advert dressed as a friend', 'a fact that is not true',
      'a person you went to school with', 'someone very upset about nothing',
      'a clip of a clip of a clip', 'an argument you were not in'];

    let n = 0;
    const list = el('div', { class: 'scroller', tabindex: '0' });
    const count = el('p', { class: 'demo-read', role: 'status' });

    function add(k) {
      for (let i = 0; i < k; i++) {
        n++;
        list.appendChild(el('div', { class: 'scroll-item', text: n + '. ' + FILL[n % FILL.length] }));
      }
      count.textContent = 'Loaded ' + n + ' items. It will keep doing this. There ' +
        'is no bottom, so there is no moment where stopping is the obvious thing to do.';
    }
    add(12);
    list.addEventListener('scroll', () => {
      watched.scroll = Math.max(watched.scroll, list.scrollTop);
      if (list.scrollTop + list.clientHeight > list.scrollHeight - 60) add(8);
    });

    const finite = el('div', { class: 'scroller finite', hidden: true });
    ['Nour made a drawing', 'Imani wrote four lines', 'Okwe made a beat',
     'Yuki drew a map'].forEach(t => finite.appendChild(el('div', { class: 'scroll-item', text: t })));
    finite.appendChild(el('div', { class: 'scroll-end', text:
      'That is everyone. Nothing below this.' }));

    const swap = el('button', { type: 'button', class: 'tool-btn', onclick: () => {
      const showFinite = finite.hidden;
      finite.hidden = !showFinite;
      list.hidden = showFinite;
      swap.textContent = showFinite ? 'Back to the endless one' : 'Show me one with a bottom';
      count.hidden = showFinite;
    }}, ['Show me one with a bottom']);

    host.appendChild(list);
    host.appendChild(finite);
    host.appendChild(swap);
    host.appendChild(count);
  };

  /* --- 3. the streak ------------------------------------------------------ */
  DEMOS.streak = function (host) {
    let streak = 47, lost = false;
    const num = el('div', { class: 'streak-num', text: '47' });
    const sub = el('p', { class: 'demo-read', text: 'A 47-day streak. Think about how ' +
      'you would feel pressing the next button.' });

    const skip = el('button', { type: 'button', class: 'tool-btn', onclick: () => {
      if (lost) {
        streak = 47; lost = false;
        num.textContent = '47'; num.classList.remove('lost');
        sub.textContent = 'Back to 47. Notice that getting it back felt like much ' +
          'less than losing it did. That gap is the whole mechanism.';
        skip.textContent = 'Skip a day';
        return;
      }
      streak = 0; lost = true;
      num.textContent = '0'; num.classList.add('lost');
      sub.textContent = 'Gone. Note what it cost you: nothing. You cannot spend a ' +
        'streak, it does not make you better at anything, and the app lost nothing ' +
        'when it reset. The only thing that happened is that you feel bad, which ' +
        'was the feature.';
      skip.textContent = 'Give it back';
    }}, ['Skip a day']);

    const shelf = el('div', { class: 'demo-side' }, [
      el('b', { text: 'The same information, without the hostage' }),
      el('p', { class: 'muted small', text:
        'You made 47 things. ← This is true whether or not you show up tomorrow, ' +
        'and it is the only sentence of the two that is about you.' })
    ]);

    host.appendChild(num);
    host.appendChild(skip);
    host.appendChild(sub);
    host.appendChild(shelf);
  };

  /* --- 4. public numbers --------------------------------------------------- */
  DEMOS.metrics = function (host) {
    /* Two identical posts. Different numbers, assigned at random. */
    const a = 12 + Math.floor(Math.random() * 40);
    const b = 4000 + Math.floor(Math.random() * 40000);
    let live = a;

    function post(label, n, id) {
      const numEl = el('b', { class: 'metric-n', text: String(n) });
      return {
        node: el('div', { class: 'metric-post' }, [
          el('div', { class: 'metric-art', text: '"the door was already open"' }),
          el('div', { class: 'metric-row' }, [
            el('span', { text: label }), numEl, el('span', { class: 'muted tiny', text: 'likes' })
          ])
        ]),
        numEl
      };
    }

    const p1 = post('Post A', a);
    const p2 = post('Post B', b);
    const ask = el('p', { class: 'demo-read', text:
      'Which one is better? You already have an answer, and you have not read ' +
      'either of them properly.' });

    const reveal = el('button', { type: 'button', class: 'tool-btn', onclick: () => {
      ask.textContent = 'They are the same post. The two numbers were generated at ' +
        'random when this demo loaded. Nothing about the work differs — the only ' +
        'thing that differed was a number somebody chose to show you.';
      reveal.disabled = true;
    }}, ['Tell me which is better']);

    // The live one ticks while you watch, which is its own small hook.
    const tick = setInterval(() => {
      live += Math.random() < 0.4 ? 1 : 0;
      p1.numEl.textContent = String(live);
    }, 1400);
    host.addEventListener('DOMNodeRemoved', () => clearInterval(tick));
    setTimeout(() => clearInterval(tick), 120000);

    host.appendChild(el('div', { class: 'metric-pair' }, [p1.node, p2.node]));
    host.appendChild(reveal);
    host.appendChild(ask);
    host.appendChild(el('p', { class: 'muted tiny', text:
      'Post A is also climbing while you sit here. Watch how hard it is not to look at it.' }));
  };

  /* --- 5. vague notifications ---------------------------------------------- */
  DEMOS.notify = function (host) {
    const rows = [
      ['Someone commented on a post you interacted with.',
       'Kai replied "same" to a photo you tapped on in March.'],
      ['You have 3 new activities waiting.',
       'Two adverts and a suggested account you have declined twice.'],
      ['People are talking about you.',
       'Your name appears in a group chat you are not in. It is about lunch.'],
      ['🔥 Your friends are online right now!',
       'Two people opened the app in the last hour. Neither mentioned you.']
    ];
    const list = el('div', { class: 'notify-list' });
    rows.forEach(([vague, real]) => {
      const truth = el('div', { class: 'notify-truth', hidden: true, text: real });
      list.appendChild(el('div', { class: 'notify-row' }, [
        el('button', {
          type: 'button', class: 'notify-btn',
          onclick: () => { truth.hidden = !truth.hidden; watched.taps++; }
        }, [el('span', { class: 'buzz', text: '🔔' }), vague]),
        truth
      ]));
    });
    host.appendChild(list);
    host.appendChild(el('p', { class: 'demo-read', text:
      'Tap each one to see what it would say if it were complete. Every one of ' +
      'them becomes ignorable the moment it tells you the truth, which is exactly ' +
      'why it does not.' }));
  };

  /* --- 6. autoplay ---------------------------------------------------------- */
  DEMOS.autoplay = function (host) {
    let t = null, left = 5, played = 0;
    const screen = el('div', { class: 'auto-screen', text: 'a video, finishing' });
    const bar = el('div', { class: 'auto-bar' }, [el('i')]);
    const read = el('p', { class: 'demo-read' });

    function stop() { if (t) { clearInterval(t); t = null; } }

    function run() {
      stop(); left = 5;
      screen.textContent = 'Next up in 5…';
      screen.classList.add('counting');
      t = setInterval(() => {
        left--;
        if (left <= 0) {
          played++;
          screen.textContent = 'Playing the next one. (' + played + ' auto-played)';
          read.textContent = 'You did not choose that. Stopping something already ' +
            'running feels like an action; letting it run feels like nothing. The ' +
            'default did the deciding, which is what a default is for.';
          setTimeout(run, 1800);
          stop();
          return;
        }
        screen.textContent = 'Next up in ' + left + '…';
        bar.firstChild.style.width = ((5 - left) / 5 * 100) + '%';
      }, 1000);
    }

    const start = el('button', { type: 'button', class: 'tool-btn go', onclick: () => {
      run(); start.disabled = true; cancel.disabled = false;
    }}, ['Let it finish']);

    const cancel = el('button', { type: 'button', class: 'tool-btn', disabled: true, onclick: () => {
      stop();
      screen.textContent = 'stopped';
      screen.classList.remove('counting');
      start.disabled = false; cancel.disabled = true;
      read.textContent = 'You had to act to make nothing happen. That asymmetry is ' +
        'the whole design.';
    }}, ['Stop it']);

    host.appendChild(screen);
    host.appendChild(bar);
    host.appendChild(el('div', { class: 'demo-acts' }, [start, cancel]));
    host.appendChild(read);
  };

  /* --- 7. filter drift ------------------------------------------------------ */
  DEMOS.compare = function (host) {
    /* Nine plain faces, drawn procedurally. The slider "improves" all of them
     * at once, and a marker tracks where your sense of normal has moved to. */
    const canvas = el('canvas', { class: 'faces', role: 'img',
      'aria-label': 'Nine simple drawn faces' });
    const slider = el('input', { type: 'range', min: '0', max: '100', value: '0',
      class: 'tempo', 'aria-label': 'Filter strength' });
    const read = el('p', { class: 'demo-read' });
    const baseline = el('div', { class: 'drift' }, [
      el('i', { class: 'drift-fill' }), el('span', { class: 'drift-mark' })
    ]);

    let seenSum = 0, seenN = 0;

    function face(ctx, x, y, r, seed, k) {
      const rng = K.core.seeded('face', seed);
      const eye = 0.14 + rng() * 0.05 + k * 0.10;
      const jaw = 1 - k * 0.28;
      const chin = 1 + k * 0.10;
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--ink') || '#222';
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.78 * jaw, r * 0.95 * chin, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - r * 0.3 * jaw, y - r * 0.15, r * eye, r * eye * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(x + r * 0.3 * jaw, y - r * 0.15, r * eye, r * eye * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - r * 0.22 * jaw, y + r * 0.42);
      ctx.quadraticCurveTo(x, y + r * (0.52 - k * 0.08), x + r * 0.22 * jaw, y + r * 0.42);
      ctx.stroke();
    }

    function paint() {
      const k = +slider.value / 100;
      const w = host.clientWidth || 320, h = 190;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cols = 5, r = Math.min(w / (cols * 2.4), 34);
      for (let i = 0; i < 9; i++) {
        const cx = (i % cols + 0.5) * (w / cols);
        const cy = (Math.floor(i / cols) + 0.5) * (h / 2);
        face(ctx, cx, cy, r, i, k);
      }
      seenSum += k; seenN++;
      const drift = seenN ? seenSum / seenN : 0;
      baseline.firstChild.style.width = (drift * 100) + '%';
      baseline.lastChild.style.left = (k * 100) + '%';
      read.textContent = k === 0
        ? 'Nine ordinary faces. Move the slider.'
        : 'Every face moved the same way, so none of them looks edited relative to ' +
          'the others — and your sense of an average face has already followed them ' +
          'to about ' + Math.round(drift * 100) + '% of the way. The bar is where ' +
          '"normal" has drifted to. Slide back to zero and see whether it looks right.';
    }

    slider.addEventListener('input', paint);
    host.appendChild(canvas);
    host.appendChild(slider);
    host.appendChild(baseline);
    host.appendChild(read);
    requestAnimationFrame(paint);
  };

  /* --- 8. ranking for reaction --------------------------------------------- */
  DEMOS.ranking = function (host) {
    const items = [
      { t: 'Nour posted a drawing of a bridge', heat: 2, when: 'this morning' },
      { t: 'A stranger says your city is the worst in the country', heat: 97, when: '3 days ago' },
      { t: 'Imani wrote four lines about rain', heat: 3, when: 'an hour ago' },
      { t: 'Two people arguing about a film neither watched', heat: 88, when: 'yesterday' },
      { t: 'Okwe made a beat', heat: 4, when: 'this afternoon' },
      { t: 'Someone is furious about a shop closing', heat: 76, when: 'last week' }
    ];
    let mode = 'time';
    const list = el('div', { class: 'rank-list' });

    function paint() {
      K.core.clear(list);
      const rows = items.slice();
      if (mode === 'heat') rows.sort((a, b) => b.heat - a.heat);
      rows.forEach(r => {
        list.appendChild(el('div', { class: 'rank-row' + (mode === 'heat' && r.heat > 50 ? ' hot' : '') }, [
          el('span', { text: r.t }),
          el('span', { class: 'muted tiny', text: mode === 'heat'
            ? 'predicted reaction ' + r.heat : r.when })
        ]));
      });
    }

    const swap = el('button', { type: 'button', class: 'tool-btn', onclick: () => {
      mode = mode === 'time' ? 'heat' : 'time';
      swap.textContent = mode === 'heat' ? 'Sort by when it happened' : 'Sort by predicted reaction';
      note.textContent = mode === 'heat'
        ? 'Nobody wrote a rule saying "show them angry things". The rule said ' +
          '"show them what gets a response", and anger won on the merits. Your ' +
          'friends dropped to the bottom without anyone deciding they should.'
        : 'Six things, in the order they happened. Three of your friends are in here.';
      paint();
    }}, ['Sort by predicted reaction']);

    const note = el('p', { class: 'demo-read', text:
      'Six things, in the order they happened. Three of your friends are in here.' });

    host.appendChild(list);
    host.appendChild(swap);
    host.appendChild(note);
    paint();
  };

  /* --- 9. the guilt-trip exit ----------------------------------------------- */
  DEMOS.exit = function (host) {
    let attempts = 0;
    const stage = el('div', { class: 'exit-stage' });
    const read = el('p', { class: 'demo-read' });

    const LINES = [
      ['Are you sure you want to leave?', 'Your friends will miss you.'],
      ['Really leaving?', 'You will lose your place in the conversation.'],
      ['Wait — just 5 more minutes?', 'There are 12 things you have not seen.'],
      ['Last chance.', 'People are posting right now.']
    ];

    function tryLeave() {
      if (attempts >= LINES.length) {
        K.core.clear(stage);
        stage.appendChild(el('p', { class: 'muted', text: 'Fine. Bye.' }));
        read.textContent = 'It took ' + plural(attempts + 1, 'tap') + ' to leave, and ' +
          'four separate attempts to make you feel bad about it. Staying was one tap ' +
          'the whole time.';
        return;
      }
      const [a, b] = LINES[attempts];
      attempts++;
      K.core.clear(stage);
      stage.appendChild(el('div', { class: 'exit-dialog' }, [
        el('b', { text: a }),
        el('p', { class: 'muted small', text: b }),
        el('button', { type: 'button', class: 'big-btn', onclick: () => {
          K.core.clear(stage);
          stage.appendChild(el('button', { type: 'button', class: 'tool-btn', onclick: tryLeave },
            ['Leave']));
          read.textContent = 'Staying is a big button. Leaving is small text. ' +
            'That asymmetry is not an accident and it is not a style choice.';
        }}, ['Stay']),
        el('button', { type: 'button', class: 'exit-link', onclick: tryLeave }, ['leave anyway'])
      ]));
    }

    stage.appendChild(el('button', { type: 'button', class: 'tool-btn', onclick: tryLeave }, ['Leave']));
    host.appendChild(stage);
    host.appendChild(read);
    host.appendChild(el('div', { class: 'demo-side' }, [
      el('b', { text: 'Kiln\'s version' }),
      el('p', { class: 'muted small', text: '"Done for today." → the app says goodbye. One tap, no argument.' })
    ]));
  };

  /* --- 10. quiet collection -------------------------------------------------- */
  DEMOS.harvest = function (host) {
    const out = el('pre', { class: 'payload' });
    const read = el('p', { class: 'demo-read', text:
      'Everything below was measured by this tab while you were reading it. None ' +
      'of it was requested, none of it is needed for anything, and all of it is ' +
      'the kind of thing that normally goes to a server.' });

    function paint() {
      const secs = Math.round((Date.now() - watched.opened) / 1000);
      const payload = {
        session_seconds: secs,
        sections_opened: watched.expands,
        taps_inside_demos: watched.taps,
        deepest_scroll_px: Math.round(watched.scroll),
        longest_read: watched.longest || '(still reading)',
        longest_read_seconds: Math.round(watched.longestMs / 1000),
        screen: window.innerWidth + 'x' + window.innerHeight,
        timezone_offset_minutes: new Date().getTimezoneOffset(),
        language: navigator.language,
        touch_capable: ('ontouchstart' in window),
        hour_of_day: new Date().getHours()
      };
      out.textContent = JSON.stringify(payload, null, 2);
    }
    const timer = setInterval(paint, 1000);
    setTimeout(() => clearInterval(timer), 300000);
    paint();

    host.appendChild(out);
    host.appendChild(read);
    host.appendChild(el('div', { class: 'demo-side' }, [
      el('b', { text: 'Where it went' }),
      el('p', { class: 'muted small', text:
        'Nowhere. This app contains no fetch, no XHR, no beacon and no socket — ' +
        'the build refuses to produce a file that has any of them. The object above ' +
        'was built in your browser and will be destroyed when you leave this tab. ' +
        'You can check: turn off the network and every part of Kiln still works.' })
    ]));
  };

  K.watchtower = { build };
})(window.Kiln = window.Kiln || {});
