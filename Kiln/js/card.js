/* Kiln — how a made thing is shown, wherever it is shown.
 *
 * One renderer for the feed, the shelf, and the studio preview. Your work
 * and a peer's work go through identical code and come out looking the same
 * size, in the same frame, with the same amount of room. No "featured", no
 * "trending", no boosted card, no visual weight bought or earned. A feed
 * where some cards are bigger is a feed that has already told you who
 * matters before you have read a word.
 */
(function (K) {
  'use strict';
  const { el, esc } = K.core;

  /* The work itself: canvas, prose, or a bar of music. */
  function body(craft, payload, opts) {
    opts = opts || {};
    if (craft === 'draw') {
      const canvas = el('canvas', { class: 'work-canvas', role: 'img',
        'aria-label': 'A drawing' });
      const wrap = el('div', { class: 'work-draw' }, [canvas]);
      const paintIt = () => {
        const w = wrap.clientWidth || 320;
        K.art.paint(canvas, payload, w, Math.round(w * 0.72));
      };
      requestAnimationFrame(paintIt);
      window.addEventListener('resize', paintIt);
      if (window.ResizeObserver) new ResizeObserver(paintIt).observe(wrap);
      return wrap;
    }

    if (craft === 'write') {
      const text = String(payload.text || '');
      const p = el('div', { class: 'work-write' });
      for (const para of text.split(/\n{2,}/)) {
        if (!para.trim()) continue;
        p.appendChild(el('p', { text: para.trim() }));
      }
      return p;
    }

    // beat
    const wrap = el('div', { class: 'work-beat' });
    const strip = el('div', { class: 'beat-strip', 'aria-hidden': 'true' });
    const marks = [];
    for (let s = 0; s < 16; s++) {
      const on = payload.tracks.some(t => t[s]);
      const cell = el('span', { class: 'strip-cell' + (on ? ' on' : '') });
      marks.push(cell);
      strip.appendChild(cell);
    }
    const pl = K.beat.player(payload, {
      onStep: s => {
        marks.forEach((m, i) => m.classList.toggle('now', i === s));
      }
    });
    wrap.appendChild(strip);
    wrap.appendChild(el('div', { class: 'beat-foot' }, [
      pl.node,
      el('span', { class: 'muted', text: payload.tempo + ' bpm' })
    ]));
    return wrap;
  }

  /* A peer's identity chip. Deliberately not a link to a profile with
   * counts on it — there are no profiles, because a profile is where a
   * person becomes a set of numbers other people can compare. */
  function who(peer, sub) {
    return el('div', { class: 'who' }, [
      el('span', { class: 'avatar', style: '--hue:' + peer.hue, text: peer.mark }),
      el('div', { class: 'who-text' }, [
        el('b', { text: peer.name }),
        sub ? el('span', { class: 'muted', text: sub }) : null
      ])
    ]);
  }

  K.card = { body, who };
})(window.Kiln = window.Kiln || {});
