/* Kiln — tabs, modals, onboarding, and the glue between views.
 *
 * The interface has one structural opinion: the studio is the first tab and
 * the app opens on it. Which screen an app opens on is the loudest thing it
 * ever says about what it thinks you are for, and a feed-first app has
 * already decided you are an audience before you have touched it.
 *
 * The tab bar shows no badges, no dots, and no counts. There is nothing in
 * this app that can accumulate somewhere you are not looking, so there is
 * nothing for a badge to be about — which is the honest reason most apps
 * have badges, and it is not a good one.
 */
(function (K) {
  'use strict';
  const { el, $, clear, today, plural } = K.core;
  const S = K.state;

  const TABS = [
    { id: 'studio', label: 'Studio', mark: '✎' },
    { id: 'circle', label: 'Circle', mark: '◇' },
    { id: 'shelf', label: 'Shelf', mark: '▤' },
    { id: 'tower', label: 'Watchtower', mark: '◭' },
    { id: 'audit', label: 'Audit', mark: '⚙' }
  ];

  let state = null;
  let tab = 'studio';
  let away = 0;
  let cache = {};
  let root, main, nav, header;
  let leaving = false;

  function boot(s, awayDays) {
    state = s;
    away = awayDays || 0;
    root = $('#app');
    clear(root);

    header = el('header', { class: 'bar' });
    main = el('main', { id: 'main', tabindex: '-1' });
    nav = el('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Sections' });

    root.appendChild(header);
    root.appendChild(main);
    root.appendChild(nav);

    if (!state.onboarded) { onboarding(); return; }
    buildChrome();
    render();
  }

  /* --- chrome -------------------------------------------------------------- */
  function buildChrome() {
    clear(header);
    header.appendChild(el('div', { class: 'mark' }, [
      el('b', { text: 'Kiln' }),
      el('span', { class: 'muted tiny', text: state.name ? state.name : 'a place to make things' })
    ]));
    header.appendChild(el('button', {
      type: 'button', class: 'done-btn', onclick: showGoodbye
    }, ['Done for today']));

    clear(nav);
    TABS.forEach(t => {
      nav.appendChild(el('button', {
        type: 'button', role: 'tab', class: 'tab' + (t.id === tab ? ' on' : ''),
        'aria-selected': t.id === tab ? 'true' : 'false',
        onclick: () => setTab(t.id)
      }, [
        el('span', { class: 'tab-mark', text: t.mark }),
        el('span', { class: 'tab-label', text: t.label })
      ]));
    });
  }

  function setTab(id) {
    if (leaving) return;
    if (tab === id) { window.scrollTo(0, 0); return; }
    tab = id;
    K.core.$$('.tab', nav).forEach((b, i) => {
      const on = TABS[i].id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    render(true);
    main.focus({ preventScroll: true });
  }

  function invalidate() {
    for (const k of arguments) delete cache[k];
    if (!arguments.length) cache = {};
  }

  /* Settings changes rebuild everything except the studio, because a
   * half-finished drawing should survive a trip to the Audit tab. */
  function invalidateAround() {
    const studio = cache.studio;
    cache = {};
    if (studio) cache.studio = studio;
  }

  function render(fresh) {
    const keepScroll = fresh ? 0 : window.scrollY;
    clear(main);
    let node = cache[tab];
    if (!node) {
      node = buildTab(tab);
      /* The studio keeps its DOM between tab switches so a half-finished
       * drawing survives a look at the circle. Nothing else needs to. */
      if (tab === 'studio') cache.studio = node;
    }
    main.appendChild(node);
    window.scrollTo(0, keepScroll);
  }

  function buildTab(id) {
    const on = res => handle(res);
    if (id === 'studio') return K.make.build(state, on);
    if (id === 'circle') return K.feed.build(state, on);
    if (id === 'shelf') { const n = K.shelf.build(state, on, away); away = 0; return n; }
    if (id === 'tower') return K.watchtower.build(state, on);
    return K.audit.build(state, on);
  }

  /* --- what the views ask for ---------------------------------------------- */
  function handle(res) {
    res = res || {};

    if (res.go) { setTab(res.go === 'settings' ? 'audit' : res.go); return; }

    if (res.erased) {
      state = S.newState();
      K.core.setDayOffset(0);
      cache = {};
      K.core.save(state);
      onboarding();
      return;
    }

    if (res.kept) {
      K.core.save(state);
      invalidate();
      toast(keptWords(res.kept, res.fresh));
      render(true);
      return;
    }

    if (res.responded) {
      K.core.save(state);
      invalidate('circle');
      render();
      return;
    }

    if (res.dayShift) {
      K.core.save(state);
      away = S.rollover(state);
      K.core.save(state);
      cache = {};
      render(true);
      toast('Clock moved. Today is ' + K.core.dayLabel(today()) + '.');
      return;
    }

    if (res.rerender) {
      K.core.save(state);
      invalidateAround();
      render();
      if (res.keepMsg) toast(res.keepMsg);
      return;
    }
  }

  function keptWords(piece, fresh) {
    let t = piece.audience === 'circle'
      ? 'Kept, and your circle sees it tomorrow.'
      : 'Kept, just for you.';
    if (fresh && fresh.length) {
      const names = fresh.map(id => {
        for (const c in K.content.PRACTICE) {
          const hit = K.content.PRACTICE[c].find(p => p.id === id);
          if (hit) return hit.name;
        }
        return null;
      }).filter(Boolean);
      if (names.length) t += ' You also did: ' + names.join(', ') + '.';
    }
    return t;
  }

  /* --- onboarding -----------------------------------------------------------
   * The charter is explained before it is chosen, including the part that is
   * inconvenient. A commitment device you did not know you were agreeing to
   * is just a dark pattern facing the other way. */
  function onboarding() {
    clear(header); clear(nav); clear(main);
    let step = 0;
    const draft = { name: '', minutes: 20, makeFirst: false };

    function paint() {
      clear(main);
      main.appendChild(steps[step]());
      window.scrollTo(0, 0);
    }

    const steps = [
      () => el('section', { class: 'view onboard' }, [
        el('h1', { class: 'ob-title', text: 'Kiln' }),
        el('p', { class: 'lede', text:
          'A small social app where the point is the thing you make, and where ' +
          'the app is not trying to keep you.' }),
        el('ul', { class: 'absent' }, [
          el('li', { text: 'No likes, no counts, no followers, no profiles.' }),
          el('li', { text: 'No streaks. Nothing decays while you are away.' }),
          el('li', { text: 'No notifications, ever. It will not come looking for you.' }),
          el('li', { text: 'The feed ends. Every day. On purpose.' }),
          el('li', { text: 'Eight people you know. No strangers and no public.' }),
          el('li', { text: 'Nothing leaves this device. There is no server.' })
        ]),
        el('p', { class: 'muted small', text:
          'There is also a tab that shows you, with working demos, exactly how the ' +
          'apps that do the opposite pull it off. That one is the real point.' }),
        el('button', { type: 'button', class: 'big-btn', onclick: () => { step = 1; paint(); } },
          ['Start'])
      ]),

      () => {
        const input = el('input', {
          type: 'text', class: 'title-in wide', maxlength: '24',
          placeholder: 'A name, or nothing', 'aria-label': 'Your name'
        });
        input.value = draft.name;
        return el('section', { class: 'view onboard' }, [
          el('h1', { class: 'ob-title', text: 'What should the app call you?' }),
          el('p', { class: 'muted', text:
            'Optional, and it stays in this browser. There is no account, no email, ' +
            'no password, and nothing to sign up to — the app has nowhere to send it ' +
            'even if it wanted to.' }),
          input,
          el('button', {
            type: 'button', class: 'big-btn',
            onclick: () => { draft.name = input.value.trim(); step = 2; paint(); }
          }, ['Next'])
        ]);
      },

      () => {
        const minRow = el('div', { class: 'opt-row' });
        [10, 15, 20, 30, 45, 60].forEach(m => {
          minRow.appendChild(el('button', {
            type: 'button', class: 'opt' + (draft.minutes === m ? ' on' : ''),
            onclick: () => {
              draft.minutes = m;
              K.core.$$('.opt', minRow).forEach(b =>
                b.classList.toggle('on', b.textContent === m + ' min'));
            }
          }, [m + ' min']));
        });

        const mfRow = el('div', { class: 'opt-row' });
        [[true, 'Yes'], [false, 'No']].forEach(([v, label]) => {
          mfRow.appendChild(el('button', {
            type: 'button', class: 'opt' + (draft.makeFirst === v ? ' on' : ''),
            onclick: () => {
              draft.makeFirst = v;
              K.core.$$('.opt', mfRow).forEach(b => b.classList.toggle('on', b.textContent === label));
            }
          }, [label]));
        });

        return el('section', { class: 'view onboard' }, [
          el('h1', { class: 'ob-title', text: 'Set your own limits' }),
          el('p', { text:
            'You pick these, not the app. And here is the part you should know ' +
            'before you choose:' }),
          el('div', { class: 'deal' }, [
            el('b', { text: 'Tightening a limit happens straight away.' }),
            el('b', { text: 'Loosening one happens tomorrow.' }),
            el('p', { class: 'muted small', text:
              'That one-day wait is the only thing that makes a limit worth setting, ' +
              'because a limit you can lift the second you want to lift it is not a ' +
              'limit. Kiln will never refuse you — it just makes the decision ' +
              'yours-tomorrow instead of yours-right-now.' })
          ]),
          el('div', { class: 'setting' }, [
            el('b', { text: 'How long is a session?' }),
            el('p', { class: 'muted small', text:
              'When you get there Kiln tells you once and then leaves you alone. ' +
              'It never locks you out.' }),
            minRow
          ]),
          el('div', { class: 'setting' }, [
            el('b', { text: 'Make something before you look at anyone else\'s?' }),
            el('p', { class: 'muted small', text:
              'The circle stays shut until you have made something that day. You can ' +
              'change your mind later — tomorrow.' }),
            mfRow
          ]),
          el('button', {
            type: 'button', class: 'big-btn',
            onclick: () => {
              state.name = draft.name;
              state.charter.minutes = draft.minutes;
              state.charter.makeFirst = draft.makeFirst;
              state.onboarded = true;
              K.core.save(state);
              cache = {};
              tab = 'studio';
              buildChrome();
              render(true);
            }
          }, ['Into the studio'])
        ]);
      }
    ];

    paint();
  }

  /* --- modal + toast --------------------------------------------------------- */
  function modal(inner, opts) {
    const back = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
    back.appendChild(inner);
    document.body.appendChild(back);
    const close = () => { if (back.parentNode) back.parentNode.removeChild(back); };
    if (!opts || !opts.sticky) {
      back.addEventListener('click', e => { if (e.target === back) close(); });
    }
    return close;
  }

  let toastTimer = null;
  function toast(text) {
    let t = $('#toast');
    if (!t) {
      t = el('div', { id: 'toast', role: 'status' });
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 5200);
  }

  /* --- session end ------------------------------------------------------------ */
  function showBudget() {
    let close = null;
    close = modal(K.receipt.budgetCard(state,
      () => { close(); showGoodbye(); },
      mins => { K.receipt.extend(state, mins); K.core.save(state); close(); toast('Ten more. It is in the receipt.'); }
    ), { sticky: true });
  }

  function showGoodbye() {
    K.receipt.commit(state);
    K.core.save(state);
    leaving = true;
    clear(main); clear(nav);
    header.classList.add('hushed');
    main.appendChild(K.receipt.goodbye(state, () => {
      leaving = false;
      header.classList.remove('hushed');
      buildChrome();
      invalidateAround();
      render(true);
    }));
    window.scrollTo(0, 0);
  }

  K.ui = { boot, setTab, toast, modal, showBudget, showGoodbye, invalidate,
    get state() { return state; } };
})(window.Kiln = window.Kiln || {});
