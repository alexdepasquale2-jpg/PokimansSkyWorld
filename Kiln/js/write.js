/* Kiln — the writing tool.
 *
 * A box and a word count. No character limit, because a character limit is a
 * format decision that became a thinking limit: a generation learned to have
 * only thoughts that fit, and then to mistake the fit for the thought.
 *
 * The word count is information, never a target. It does not go red, there
 * is no minimum to unlock anything, and nothing in the interface implies
 * that longer is better. It is there because knowing how long a thing is
 * helps you shape it, the same way a musician wants to know the bar count.
 */
(function (K) {
  'use strict';
  const { el, plural } = K.core;

  /* Common describing words, for the "no adjectives" practice. The check is
   * approximate and the interface says so — a constraint you can game is
   * fine, because the person gaming it is the person it was for. */
  const ADJ = ('big small large tiny huge little old new young bright dark ' +
    'beautiful ugly pretty nice good bad great awful terrible lovely happy sad ' +
    'angry quiet loud soft hard warm cold hot cool wet dry clean dirty long ' +
    'short tall wide narrow thick thin heavy light fast slow strange weird odd ' +
    'normal perfect broken empty full open closed sharp dull smooth rough deep ' +
    'shallow rich poor strong weak sweet bitter sour fresh stale ancient modern ' +
    'red orange yellow green blue purple pink brown black white grey gray silver ' +
    'golden scary funny serious silly clever stupid kind cruel gentle fierce ' +
    'calm wild busy lazy tired awake hungry thirsty lonely crowded distant near ' +
    'far early late final first last only real fake true false')
    .split(' ');
  const ADJSET = {};
  for (const a of ADJ) ADJSET[a] = 1;

  function words(text) {
    const t = String(text || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }

  function mount(host, initial) {
    const area = el('textarea', {
      class: 'write-area',
      rows: 12,
      spellcheck: 'true',
      placeholder: 'Start anywhere. You can delete the first line later.',
      'aria-label': 'Your writing'
    });
    area.value = (initial && initial.text) || '';

    const meter = el('div', { class: 'write-meter' });
    const hint = el('p', { class: 'write-hint', text:
      'No length limit, in either direction. Six words is a piece. So is nine hundred.' });

    function sync() {
      const w = words(area.value);
      meter.textContent = w ? plural(w, 'word') : '';
    }
    area.addEventListener('input', sync);

    host.appendChild(el('div', { class: 'write' }, [area, meter, hint]));
    sync();
    requestAnimationFrame(() => area.focus());

    return {
      craft: 'write',
      payload() { return { text: area.value.trim() }; },
      empty() { return !area.value.trim(); },
      practice() {
        const text = area.value.trim();
        const w = words(text);
        const done = [];
        if (w > 0 && w < 40) done.push('w-short');
        if (w >= 200) done.push('w-long');
        if (w >= 15) {
          const toks = text.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/);
          if (!toks.some(t => ADJSET[t])) done.push('w-noadj');
        }
        if (w >= 15) {
          const quoted = (text.match(/["“][^"”]+["”]/g) || []).join(' ');
          if (words(quoted) > w * 0.8) done.push('w-dial');
        }
        return done;
      },
      destroy() {}
    };
  }

  K.write = { mount, words };
})(window.Kiln = window.Kiln || {});
