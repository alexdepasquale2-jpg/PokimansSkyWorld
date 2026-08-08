/* Kiln — Audit: the settings, the ranking rules, and the whole save file.
 *
 * The premise of this tab is that a user is owed the ability to check. Not a
 * privacy policy describing what happens — the actual bytes, the actual
 * ordering rules with switches on them, and the actual reason each person in
 * the circle responds as often as they do.
 *
 * "Show your working" is a much stronger commitment than "trust us", and it
 * is the one thing a platform funded by attention can never offer, because
 * the working is the part that would not survive being read.
 */
(function (K) {
  'use strict';
  const { el, plural, bytesWords, today, dayShort } = K.core;
  const C = K.content;

  function build(state, onChange) {
    const root = el('section', { class: 'view audit' });

    /* --- your charter ------------------------------------------------------ */
    root.appendChild(el('h1', { class: 'sec big', text: 'Limits you set on yourself' }));
    root.appendChild(el('p', { class: 'muted small', text:
      'Making a limit stricter happens now. Making it looser happens tomorrow. ' +
      'That is the entire deal, it is the same in both directions every time, ' +
      'and the app will never refuse you — it only ever makes you sleep on it.' }));

    const pend = K.charter.pendingSummary(state);
    if (pend.length) {
      root.appendChild(el('div', { class: 'pending' }, [
        el('b', { text: 'Waiting until tomorrow' }),
        el('ul', {}, pend.map(p => el('li', {}, [
          el('span', { text: p.label + ' → ' + p.value }),
          el('button', {
            type: 'button', class: 'link-btn',
            onclick: () => { K.charter.cancel(state, p.key); onChange({ rerender: true }); }
          }, ['cancel'])
        ])))
      ]));
    }

    const msg = el('p', { class: 'charter-msg', role: 'status' });

    // Session length
    const minutes = [10, 15, 20, 30, 45, 60];
    const minRow = el('div', { class: 'opt-row', role: 'group', 'aria-label': 'Session length' });
    minutes.forEach(m => {
      minRow.appendChild(el('button', {
        type: 'button', class: 'opt' + (state.charter.minutes === m ? ' on' : ''),
        'aria-pressed': state.charter.minutes === m ? 'true' : 'false',
        onclick: () => {
          const r = K.charter.propose(state, 'minutes', m);
          msg.textContent = r.text;
          onChange({ rerender: true, keepMsg: r.text });
        }
      }, [m + ' min']));
    });

    root.appendChild(el('div', { class: 'setting' }, [
      el('b', { text: 'How long a session is' }),
      el('p', { class: 'muted small', text:
        'When you reach it, Kiln says so once and gets out of the way. It does not ' +
        'lock you out — a lockout only teaches you to find a way round it. It tells ' +
        'you the truth and lets you decide.' }),
      minRow
    ]));

    // Make first
    const mfRow = el('div', { class: 'opt-row', role: 'group', 'aria-label': 'Make before you look' });
    [[true, 'On'], [false, 'Off']].forEach(([v, label]) => {
      mfRow.appendChild(el('button', {
        type: 'button', class: 'opt' + (state.charter.makeFirst === v ? ' on' : ''),
        'aria-pressed': state.charter.makeFirst === v ? 'true' : 'false',
        onclick: () => {
          const r = K.charter.propose(state, 'makeFirst', v);
          msg.textContent = r.text;
          onChange({ rerender: true, keepMsg: r.text });
        }
      }, [label]));
    });

    root.appendChild(el('div', { class: 'setting' }, [
      el('b', { text: 'Make before you look' }),
      el('p', { class: 'muted small', text:
        'The circle stays shut until you have made something that day. Plenty of ' +
        'people find this is the only setting that matters.' }),
      mfRow
    ]));

    root.appendChild(msg);

    /* --- the ranking rules -------------------------------------------------- */
    root.appendChild(el('h1', { class: 'sec big', text: 'How your feed is ordered' }));
    root.appendChild(el('p', { class: 'muted small', text:
      'This is the complete list. There is no other ranking, no model, no ' +
      'engagement prediction, and nothing that learns what keeps you here. ' +
      'Turn them all off and the circle comes in the order it was made.' }));

    const rules = el('div', { class: 'rules' });
    Object.keys(K.feed.RULE_TEXT).forEach(k => {
      const on = !!state.rules[k];
      rules.appendChild(el('button', {
        type: 'button', class: 'rule' + (on ? ' on' : ''),
        'aria-pressed': on ? 'true' : 'false',
        onclick: () => {
          state.rules[k] = !state.rules[k];
          /* Reordering takes effect on tomorrow's batch. Today's is already
           * settled — the whole point of a settled batch is that it settles. */
          onChange({ rerender: true });
        }
      }, [
        el('span', { class: 'tick', text: on ? '✓' : '○' }),
        el('span', { text: K.feed.RULE_TEXT[k] })
      ]));
    });
    root.appendChild(rules);
    root.appendChild(el('p', { class: 'muted tiny', text:
      'Changes apply to tomorrow\'s batch. Today\'s was decided this morning and ' +
      'does not get to be re-decided while you are in it.' }));

    /* --- the circle, explained ----------------------------------------------- */
    root.appendChild(el('h1', { class: 'sec big', text: 'Who responds, and why' }));
    root.appendChild(el('p', { class: 'muted small', text:
      'How often somebody responds to your work is a fixed fact about them. It is ' +
      'not a lottery, it does not go up when you post more, and it has nothing to ' +
      'do with whether the thing you made was good. Here it is, written down.' }));

    const who = el('div', { class: 'peer-list' });
    K.peers.all().forEach(p => {
      const d = K.peers.disposition(p.id);
      who.appendChild(el('div', { class: 'peer-row' }, [
        el('span', { class: 'avatar', style: '--hue:' + p.hue, text: p.mark }),
        el('div', {}, [
          el('b', { text: p.name }),
          el('div', { class: 'muted tiny', text: p.about }),
          el('div', { class: 'tiny', text: d ? d.warmth : '' }),
          el('div', { class: 'muted tiny', text:
            'makes something on about ' + Math.round(p.cadence * 100) + ' days in 100' })
        ])
      ]));
    });
    root.appendChild(who);

    /* --- data ---------------------------------------------------------------- */
    root.appendChild(el('h1', { class: 'sec big', text: 'Everything Kiln knows about you' }));

    const bytes = K.core.saveBytes();
    root.appendChild(el('p', { text:
      'It is ' + bytesWords(bytes) + ', it is in this browser, and it has never ' +
      'been anywhere else. Kiln makes no network requests of any kind — there is ' +
      'no server for it to talk to. Switch the network off and use the whole app.' }));

    const raw = el('pre', { class: 'payload tall', hidden: true });
    const showBtn = el('button', {
      type: 'button', class: 'tool-btn', onclick: () => {
        if (raw.hidden) {
          raw.textContent = JSON.stringify(state, null, 2);
          raw.hidden = false;
          showBtn.textContent = 'Hide it';
        } else { raw.hidden = true; showBtn.textContent = 'Show me the file'; }
      }
    }, ['Show me the file']);

    const copyMsg = el('span', { class: 'muted tiny', role: 'status' });
    const copyBtn = el('button', {
      type: 'button', class: 'tool-btn', onclick: () => {
        const text = JSON.stringify(state, null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
            .then(() => { copyMsg.textContent = 'copied'; })
            .catch(() => { copyMsg.textContent = 'could not copy — use "show me the file"'; });
        } else {
          copyMsg.textContent = 'no clipboard here — use "show me the file"';
        }
      }
    }, ['Copy it out']);

    let armed = false;
    const eraseMsg = el('span', { class: 'muted tiny', role: 'status' });
    const eraseBtn = el('button', {
      type: 'button', class: 'tool-btn danger', onclick: () => {
        if (!armed) {
          armed = true;
          eraseBtn.textContent = 'Erase everything — tap again';
          eraseMsg.textContent = 'This deletes your shelf and cannot be undone. ' +
            'Nothing will try to talk you out of it a second time.';
          return;
        }
        K.core.erase();
        onChange({ erased: true });
      }
    }, ['Erase everything']);

    root.appendChild(el('div', { class: 'data-acts' }, [showBtn, copyBtn, copyMsg]));
    root.appendChild(raw);
    root.appendChild(el('div', { class: 'data-acts' }, [eraseBtn, eraseMsg]));

    /* --- what is not here ----------------------------------------------------- */
    root.appendChild(el('h1', { class: 'sec big', text: 'What this app does not have' }));
    const absent = [
      'No like button, and no count of anything, anywhere.',
      'No followers, no follower count, and no profiles to compare.',
      'No streak, and nothing that decays while you are away.',
      'No notifications. Kiln never interrupts you.',
      'No refresh. The day\'s batch is settled before you open it.',
      'No infinite scroll. The feed ends and says so.',
      'No autoplay. Sound happens when you press something.',
      'No camera, no face, no filter.',
      'No advertising, no sponsored posts, and nothing bought its way in front of you.',
      'No recommendation model, and no strangers — only the eight people in your circle.',
      'No account, no email, no password, no analytics, no cookies.',
      'No network requests at all.'
    ];
    root.appendChild(el('ul', { class: 'absent' }, absent.map(t => el('li', { text: t }))));

    /* --- demo control ---------------------------------------------------------- */
    root.appendChild(el('h1', { class: 'sec big', text: 'Demo control' }));
    root.appendChild(el('p', { class: 'muted small', text:
      'Kiln is built around what happens across days, which is awkward to show in ' +
      'one sitting. This moves the app\'s clock so you can watch a day roll over, ' +
      'see responses arrive, and see the "you were away" message. It is labelled ' +
      'as a demo because that is what it is.' }));

    const dayRow = el('div', { class: 'opt-row' }, [
      el('button', { type: 'button', class: 'opt', onclick: () => shift(1) }, ['+1 day']),
      el('button', { type: 'button', class: 'opt', onclick: () => shift(7) }, ['+7 days']),
      el('button', { type: 'button', class: 'opt', onclick: () => shift(-state.demoOffset) },
        ['back to real today'])
    ]);

    function shift(n) {
      if (!n) return;
      state.demoOffset = (state.demoOffset || 0) + n;
      K.core.setDayOffset(state.demoOffset);
      onChange({ dayShift: true });
    }

    root.appendChild(dayRow);
    root.appendChild(el('p', { class: 'muted tiny', text:
      state.demoOffset ? 'Currently ' + plural(state.demoOffset, 'day') + ' ahead of ' +
        'real time. Today reads as ' + K.core.dayLabel(today()) + '.'
        : 'Running on the real calendar.' }));

    return root;
  }

  K.audit = { build };
})(window.Kiln = window.Kiln || {});
