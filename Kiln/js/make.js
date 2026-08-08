/* Kiln — the Studio. The front door of the app.
 *
 * The app opens here, on a blank canvas and a question, and not on other
 * people's work. Which screen an app opens on is the strongest statement it
 * makes about what it thinks you are for, and every feed-first app has
 * already decided you are an audience.
 *
 * Three things in this file are worth defending:
 *
 *   Audience defaults to "just me". Sharing is a separate, deliberate tap
 *   with a plain label. The default for a child's creative work should be
 *   private, and every app that defaults to public is relying on the fact
 *   that almost nobody changes a default.
 *
 *   Practice constraints are read off the finished piece, never announced
 *   in advance as a goal. You find out you did the hard thing after you did
 *   it, which is how it feels when it is real, and it means nobody makes a
 *   deliberately bad piece to farm a checkbox.
 *
 *   Nothing congratulates you for volume. Making a second piece is allowed
 *   and never suggested.
 */
(function (K) {
  'use strict';
  const { el, $, today, plural } = K.core;
  const C = K.content;
  const S = K.state;

  let draft = { craft: null, tool: null, title: '' };
  let node = null;

  function toolFor(craft) {
    return craft === 'draw' ? K.draw : craft === 'write' ? K.write : K.beat;
  }

  function build(state, onChange) {
    const day = today();
    const prompt = S.promptFor(day);
    const mine = S.piecesOn(state, day);

    const root = el('section', { class: 'view studio' });

    root.appendChild(el('div', { class: 'prompt-card' }, [
      el('div', { class: 'prompt-eyebrow' }, [
        el('span', { text: 'Today' }),
        el('span', { class: 'muted', text: K.core.dayLabel(day) })
      ]),
      el('h1', { class: 'prompt-text', text: prompt.t }),
      el('p', { class: 'muted small', text:
        'Everyone in your circle got this same prompt. Nobody is competing; you are ' +
        'just going to see seven other ways of reading one sentence.' })
    ]));

    /* --- craft chooser ---------------------------------------------------- */
    const chooser = el('div', { class: 'craft-pick', role: 'group', 'aria-label': 'What to make' });
    ['draw', 'write', 'beat'].forEach(id => {
      const craft = C.CRAFTS[id];
      const suits = prompt.c.indexOf(id) >= 0;
      const b = el('button', {
        type: 'button',
        class: 'craft' + (draft.craft === id ? ' on' : '') + (suits ? ' suits' : ''),
        'aria-pressed': draft.craft === id ? 'true' : 'false',
        onclick: () => { setCraft(id); }
      }, [
        el('span', { class: 'craft-mark', text: craft.mark }),
        el('b', { text: craft.name }),
        el('span', { class: 'muted tiny', text: craft.blurb }),
        suits ? el('span', { class: 'suits-tag', text: 'fits today' }) : null
      ]);
      chooser.appendChild(b);
    });
    root.appendChild(chooser);

    const toolHost = el('div', { class: 'tool-host' });
    root.appendChild(toolHost);

    const keepRow = el('div', { class: 'keep-row' });
    root.appendChild(keepRow);

    /* --- what you already made today -------------------------------------- */
    if (mine.length) {
      const list = el('div', { class: 'today-mine' }, [
        el('h2', { class: 'sec', text: mine.length === 1
          ? 'You made this today'
          : 'You made ' + plural(mine.length, 'thing') + ' today' })
      ]);
      for (const p of mine) list.appendChild(pieceCard(state, p, onChange));
      root.appendChild(list);
    }

    function setCraft(id) {
      if (draft.tool) { draft.tool.destroy(); draft.tool = null; }
      K.core.clear(toolHost);
      K.core.clear(keepRow);
      draft.craft = id;
      K.core.$$('.craft', chooser).forEach((b, i) => {
        const on = ['draw', 'write', 'beat'][i] === id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (!id) return;
      draft.tool = toolFor(id).mount(toolHost, null);
      buildKeep();
    }

    function buildKeep() {
      K.core.clear(keepRow);
      const title = el('input', {
        type: 'text', class: 'title-in', maxlength: '60',
        placeholder: 'Title it, or do not', 'aria-label': 'Title (optional)'
      });

      const audience = { to: 'self' };
      const audWrap = el('div', { class: 'aud', role: 'radiogroup', 'aria-label': 'Who sees this' });
      const opts = [
        { id: 'self', label: 'Just me', note: 'It goes on your shelf. Nobody else ever sees it.' },
        { id: 'circle', label: 'My circle', note: 'The eight people in your circle. Not a public.' }
      ];
      opts.forEach(o => {
        const b = el('button', {
          type: 'button', class: 'aud-opt' + (o.id === 'self' ? ' on' : ''),
          role: 'radio', 'aria-checked': o.id === 'self' ? 'true' : 'false',
          onclick: () => {
            audience.to = o.id;
            K.core.$$('.aud-opt', audWrap).forEach((x, i) => {
              const on = opts[i].id === o.id;
              x.classList.toggle('on', on);
              x.setAttribute('aria-checked', on ? 'true' : 'false');
            });
          }
        }, [el('b', { text: o.label }), el('span', { class: 'muted tiny', text: o.note })]);
        audWrap.appendChild(b);
      });

      const msg = el('p', { class: 'keep-msg', role: 'status' });

      const keep = el('button', {
        type: 'button', class: 'big-btn', onclick: () => {
          if (!draft.tool || draft.tool.empty()) {
            msg.textContent = 'Nothing on it yet.';
            return;
          }
          const piece = {
            id: K.core.uid('p'),
            day: today(),
            craft: draft.craft,
            prompt: S.promptIndex(today()),
            title: title.value.trim(),
            payload: draft.tool.payload(),
            audience: audience.to
          };
          const got = draft.tool.practice() || [];
          const fresh = got.filter(id => !S.practiceDone(state, id));
          for (const id of fresh) state.practice[id] = today();
          piece.practice = got;

          S.addPiece(state, piece);
          draft.tool.destroy();
          draft = { craft: null, tool: null, title: '' };
          onChange({ kept: piece, fresh });
        }
      }, ['Keep it']);

      keepRow.appendChild(el('div', { class: 'keep-inner' }, [
        title,
        el('div', { class: 'aud-wrap' }, [
          el('span', { class: 'lbl', text: 'Who sees it' }), audWrap
        ]),
        keep, msg
      ]));
    }

    if (draft.craft) {
      setCraft(draft.craft);
    } else {
      toolHost.appendChild(el('p', { class: 'empty-note', text:
        'Pick one. "Fits today" is a suggestion about the prompt, not a rule — ' +
        'answer it with whatever you want.' }));
    }

    return root;
  }

  /* A piece of yours, with whatever the circle said about it. Responses show
   * up the day after you shared, so there is nothing to sit and refresh for. */
  function pieceCard(state, piece, onChange) {
    const resp = K.peers.responsesFor(state, piece);
    const wrap = el('article', { class: 'card mine' });

    wrap.appendChild(el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('b', { text: piece.title || 'untitled' }),
        el('span', { class: 'muted tiny', text: ' · ' + C.CRAFTS[piece.craft].name.toLowerCase() })
      ]),
      el('span', { class: 'chip' + (piece.audience === 'circle' ? ' chip-out' : ''),
        text: piece.audience === 'circle' ? 'circle' : 'just me' })
    ]));

    wrap.appendChild(K.card.body(piece.craft, piece.payload));

    if (piece.practice && piece.practice.length) {
      const names = piece.practice
        .map(id => (C.PRACTICE[piece.craft] || []).find(p => p.id === id))
        .filter(Boolean);
      if (names.length) {
        wrap.appendChild(el('div', { class: 'practice-hit' }, [
          el('span', { class: 'muted tiny', text: 'you also did: ' }),
          el('span', { class: 'tiny', text: names.map(n => n.name).join(' · ') })
        ]));
      }
    }

    if (piece.audience === 'circle') {
      if (resp.length) {
        const list = el('div', { class: 'responses' }, [
          el('h3', { class: 'sec tiny', text: 'What people said' })
        ]);
        for (const r of resp) {
          const p = K.peers.peer(r.from);
          const pr = C.PRAISE.find(x => x.id === r.praise);
          list.appendChild(el('div', { class: 'resp' }, [
            el('span', { class: 'avatar small', style: '--hue:' + p.hue, text: p.mark }),
            el('div', {}, [
              el('b', { text: p.name }),
              el('span', { text: ' — ' + (pr ? pr.t : '') }),
              r.text ? el('div', { class: 'muted small', text: r.text }) : null
            ])
          ]));
        }
        list.appendChild(el('p', { class: 'muted tiny', text:
          'Only you can see these. There is no count, and nobody else knows who said what.' }));
        wrap.appendChild(list);
      } else if (K.core.today() <= piece.day) {
        wrap.appendChild(el('p', { class: 'muted tiny pad', text:
          'Your circle sees this tomorrow. Anything they say will be here then — ' +
          'there is nothing to check for today.' }));
      }
    }

    return wrap;
  }

  function reset() {
    if (draft.tool) draft.tool.destroy();
    draft = { craft: null, tool: null, title: '' };
  }

  K.make = { build, pieceCard, reset };
})(window.Kiln = window.Kiln || {});
