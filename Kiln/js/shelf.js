/* Kiln — the Shelf: everything you have made, and the only progress the app
 * keeps.
 *
 * The shelf is a monotone accumulator. It goes up and it never goes down.
 * There is no streak, no decay, no "you're falling behind", no weekly
 * comparison against your past self, and no consecutive-anything.
 *
 * This is the direct inversion of the streak, and it is worth being precise
 * about why. A streak's only real feature is that it can be destroyed, which
 * is what gives it its grip: loss hurts about twice as much as the
 * equivalent gain feels good, so the longer you hold one the more leverage
 * the app has over you. The leverage is the product. Removing the streak
 * does not make the app less motivating — it makes the motivation yours,
 * because what remains is the actual pile of things you actually made.
 *
 * So when you come back after six weeks, the app says exactly that: you were
 * gone, nothing happened to your work, here it is.
 */
(function (K) {
  'use strict';
  const { el, today, plural, dayShort, agoWords } = K.core;
  const C = K.content;
  const S = K.state;

  function build(state, onChange, away) {
    const root = el('section', { class: 'view shelf' });
    const d = today();

    if (away > 0) {
      root.appendChild(el('div', { class: 'welcome-back' }, [
        el('b', { text: 'You were away ' + plural(away, 'day') + '.' }),
        el('p', { text:
          'Nothing was lost, because there was never anything set up to be lost. ' +
          'No streak broke. Your shelf is exactly as you left it, ' +
          plural(state.pieces.length, 'thing') + ' and counting.' })
      ]));
    }

    /* --- the ladders ------------------------------------------------------ */
    const ladders = el('div', { class: 'ladders' });
    ['draw', 'write', 'beat'].forEach(id => {
      const craft = C.CRAFTS[id];
      const n = S.craftCount(state, id);
      const { cur, next } = S.levelFor(n);
      const prac = C.PRACTICE[id] || [];
      const doneN = prac.filter(p => S.practiceDone(state, p.id)).length;

      const card = el('div', { class: 'ladder' }, [
        el('div', { class: 'ladder-head' }, [
          el('span', { class: 'craft-mark', text: craft.mark }),
          el('div', {}, [
            el('b', { text: craft.name }),
            el('span', { class: 'muted tiny', text: ' · ' + cur.name })
          ])
        ]),
        el('p', { class: 'muted small', text: n
          ? plural(n, 'piece') + '. ' + (next
              ? plural(next.at - n, 'more') + ' and this becomes "' + next.name + '".'
              : 'You have been at this a while.')
          : 'Nothing yet. That is where everyone starts.' })
      ]);

      const list = el('ul', { class: 'practice' });
      prac.forEach(p => {
        const done = S.practiceDone(state, p.id);
        list.appendChild(el('li', { class: done ? 'done' : '' }, [
          el('span', { class: 'tick', text: done ? '✓' : '○' }),
          el('div', {}, [
            el('b', { text: p.name }),
            el('span', { class: 'muted tiny', text: ' — ' + p.note }),
            done ? el('span', { class: 'muted tiny', text:
              ' (' + dayShort(state.practice[p.id]) + ')' }) : null
          ])
        ]));
      });
      card.appendChild(list);
      card.appendChild(el('p', { class: 'muted tiny', text: doneN === prac.length
        ? 'All four. These do not reset.'
        : 'Nobody is told about these but you. They are checked from the work itself.' }));
      ladders.appendChild(card);
    });

    root.appendChild(el('h1', { class: 'sec big', text: 'What your hands can do' }));
    root.appendChild(ladders);

    /* --- the pile ---------------------------------------------------------- */
    root.appendChild(el('h1', { class: 'sec big', text: state.pieces.length
      ? plural(state.pieces.length, 'thing') + ', since ' + dayShort(state.createdDay)
      : 'Your shelf' }));

    if (!state.pieces.length) {
      root.appendChild(el('p', { class: 'muted', text:
        'Empty for now. Whatever you keep in the studio lands here and stays here.' }));
      return root;
    }

    let lastDay = null;
    const pieces = state.pieces.slice().reverse();
    for (const p of pieces) {
      if (p.day !== lastDay) {
        lastDay = p.day;
        const gap = d - p.day;
        root.appendChild(el('div', { class: 'day-sep' }, [
          el('b', { text: dayShort(p.day) }),
          el('span', { class: 'muted tiny', text: ' · ' + agoWords(gap) }),
          el('span', { class: 'muted tiny sep-prompt', text: C.PROMPTS[p.prompt]
            ? ' · ' + C.PROMPTS[p.prompt].t : '' })
        ]));
      }
      root.appendChild(K.make.pieceCard(state, p, onChange));
    }

    root.appendChild(el('p', { class: 'muted small pad', text:
      'This list only ever gets longer. Nothing here expires, and nothing here ' +
      'is worth more because it is recent.' }));

    return root;
  }

  K.shelf = { build };
})(window.Kiln = window.Kiln || {});
