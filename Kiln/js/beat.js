/* Kiln — the beat tool: four voices, sixteen steps.
 *
 * A step sequencer is the fastest route from "I cannot make music" to a
 * thing that sounds like music, because it removes the two barriers that
 * stop most people — you do not need an instrument and you cannot play a
 * wrong note. Sixteen boxes and a tempo, and the first pattern anyone taps
 * in sounds better than they expected. That surprise is the point.
 *
 * Playback rules, which are the anti-pattern half of this file: pressing
 * play plays one bar and stops. Looping is a separate switch you have to
 * turn on yourself. Nothing here starts without a press, and stop is always
 * one press away and never asks a question.
 */
(function (K) {
  'use strict';
  const { el, $$, clamp } = K.core;
  const AU = K.audio;

  const VOICES = [
    { name: 'kick', mark: '●' },
    { name: 'snare', mark: '◆' },
    { name: 'hat', mark: '×' },
    { name: 'tone', mark: '▲' }
  ];

  function blank() {
    return { tempo: 96, tracks: [0, 1, 2, 3].map(() => new Array(16).fill(0)) };
  }

  function hits(pattern) {
    let n = 0;
    for (const t of pattern.tracks) for (const v of t) if (v) n++;
    return n;
  }

  /* A read-only player used by the feed and the shelf. Same rules as the
   * editor: one bar unless asked, stop always available. */
  function player(pattern, opts) {
    opts = opts || {};
    let handle = null;
    const btn = el('button', {
      type: 'button', class: 'beat-play', 'aria-label': 'Play this beat',
      onclick: () => {
        if (handle && handle.running) { handle.stop(); return; }
        handle = AU.play(pattern, {
          loop: false,
          onStep: opts.onStep,
          onEnd: () => { btn.classList.remove('on'); btn.textContent = '▶ Play'; }
        });
        btn.classList.add('on');
        btn.textContent = '■ Stop';
      }
    }, ['▶ Play']);
    return {
      node: btn,
      stop() { if (handle) handle.stop(); }
    };
  }

  function mount(host, initial) {
    const pattern = initial
      ? { tempo: initial.tempo, tracks: initial.tracks.map(t => t.slice()) }
      : blank();

    let handle = null;
    let loop = false;

    const gridWrap = el('div', { class: 'beat-grid', role: 'group', 'aria-label': 'Pattern' });
    const cells = [];

    VOICES.forEach((v, ti) => {
      const row = el('div', { class: 'beat-row' });
      row.appendChild(el('span', { class: 'beat-name', text: v.name }));
      const steps = el('div', { class: 'beat-steps' });
      const rowCells = [];
      for (let s = 0; s < 16; s++) {
        const on = !!pattern.tracks[ti][s];
        const b = el('button', {
          type: 'button',
          class: 'step' + (on ? ' on' : '') + (s % 4 === 0 ? ' beat1' : ''),
          'aria-label': v.name + ' step ' + (s + 1),
          'aria-pressed': on ? 'true' : 'false',
          onclick: () => {
            const now = pattern.tracks[ti][s] ? 0 : 1;
            pattern.tracks[ti][s] = now;
            b.classList.toggle('on', !!now);
            b.setAttribute('aria-pressed', now ? 'true' : 'false');
            if (now) AU.hit(ti, s);
            syncCount();
          }
        }, [el('i', { text: v.mark })]);
        rowCells.push(b);
        steps.appendChild(b);
      }
      cells.push(rowCells);
      row.appendChild(steps);
      gridWrap.appendChild(row);
    });

    const tempo = el('input', {
      type: 'range', min: '60', max: '150', step: '1', value: String(pattern.tempo),
      class: 'tempo', 'aria-label': 'Tempo',
      oninput: () => { pattern.tempo = +tempo.value; tempoLabel.textContent = tempo.value + ' bpm'; }
    });
    const tempoLabel = el('span', { class: 'tempo-label', text: pattern.tempo + ' bpm' });

    const playBtn = el('button', {
      type: 'button', class: 'tool-btn go', onclick: toggle
    }, ['▶ Play']);

    const loopBtn = el('button', {
      type: 'button', class: 'tool-btn', 'aria-pressed': 'false',
      onclick: () => {
        loop = !loop;
        loopBtn.classList.toggle('on', loop);
        loopBtn.setAttribute('aria-pressed', loop ? 'true' : 'false');
        if (handle && handle.running) { stop(); toggle(); }
      }
    }, ['Loop']);

    const clearBtn = el('button', {
      type: 'button', class: 'tool-btn quiet', onclick: () => {
        for (const t of pattern.tracks) t.fill(0);
        cells.forEach(row => row.forEach(b => {
          b.classList.remove('on'); b.setAttribute('aria-pressed', 'false');
        }));
        syncCount();
      }
    }, ['Clear']);

    const countLabel = el('span', { class: 'draw-count' });

    function syncCount() {
      const n = hits(pattern);
      countLabel.textContent = n ? K.core.plural(n, 'hit') : '';
    }

    function markStep(s) {
      $$('.step.now', gridWrap).forEach(b => b.classList.remove('now'));
      if (s < 0) return;
      cells.forEach(row => row[s].classList.add('now'));
    }

    function stop() {
      if (handle) handle.stop();
      handle = null;
      playBtn.textContent = '▶ Play';
      playBtn.classList.remove('on');
      markStep(-1);
    }

    function toggle() {
      if (handle && handle.running) { stop(); return; }
      if (!AU.available()) { playBtn.textContent = 'no audio here'; return; }
      handle = AU.play(pattern, {
        loop,
        onStep: markStep,
        onEnd: () => {
          playBtn.textContent = '▶ Play';
          playBtn.classList.remove('on');
          markStep(-1);
          handle = null;
        }
      });
      playBtn.textContent = '■ Stop';
      playBtn.classList.add('on');
    }

    host.appendChild(el('div', { class: 'beat' }, [
      gridWrap,
      el('div', { class: 'beat-bar' }, [
        playBtn, loopBtn, clearBtn,
        el('label', { class: 'tempo-wrap' }, [tempo, tempoLabel]),
        countLabel
      ]),
      el('p', { class: 'write-hint', text:
        'Play runs one bar and stops. Loop is a switch, not a default.' })
    ]));

    syncCount();

    return {
      craft: 'beat',
      payload() { return { tempo: pattern.tempo, tracks: pattern.tracks.map(t => t.slice()) }; },
      empty() { return hits(pattern) === 0; },
      practice() {
        const done = [];
        const n = hits(pattern);
        if (n > 0 && n <= 12) done.push('b-sparse');
        if (pattern.tracks.every(t => t.some(v => v))) done.push('b-full');
        const off = pattern.tracks.some(t => t.some((v, i) => v && i % 2 === 1));
        if (off && n > 0) done.push('b-odd');
        if (n > 0) {
          for (let s = 0; s <= 12; s++) {
            let quiet = true;
            for (let k = 0; k < 4 && quiet; k++) {
              if (pattern.tracks.some(t => t[s + k])) quiet = false;
            }
            if (quiet) { done.push('b-quiet'); break; }
          }
        }
        return done;
      },
      destroy() { stop(); }
    };
  }

  K.beat = { mount, player, blank, hits, VOICES };
})(window.Kiln = window.Kiln || {});
