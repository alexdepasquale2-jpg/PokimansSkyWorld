/* Kiln — the drawing tool.
 *
 * Twelve colours, four brush sizes, five papers, undo. That is the whole
 * instrument, and the shortness of that list is the design. A tool with
 * every option makes choosing the work; a tool with twelve colours makes
 * drawing the work. Every kid who has ever been handed a big box of pencils
 * and a small box of pencils knows which one they actually made things with.
 *
 * There is no filter, no template, no auto-enhance, and nothing that
 * improves a drawing on the maker's behalf. A tool that finishes your work
 * for you teaches you that your work needed finishing.
 */
(function (K) {
  'use strict';
  const { el, $, clamp } = K.core;
  const A = K.art;

  function mount(host, initial) {
    const art = initial
      ? { paper: initial.paper, strokes: initial.strokes.slice() }
      : A.blank();

    let colour = 0, size = 1;
    let drawing = null;
    const redo = [];

    const canvas = el('canvas', { class: 'draw-canvas', 'aria-label': 'Drawing canvas' });
    const stage = el('div', { class: 'draw-stage' }, [canvas]);

    const swatches = el('div', { class: 'swatches', role: 'group', 'aria-label': 'Colour' });
    A.PALETTE.forEach((hex, i) => {
      const b = el('button', {
        type: 'button', class: 'swatch' + (i === colour ? ' on' : ''),
        style: 'background:' + hex, 'aria-label': 'Colour ' + (i + 1),
        'aria-pressed': i === colour ? 'true' : 'false',
        onclick: () => { colour = i; sync(); }
      });
      b.dataset.i = i;
      swatches.appendChild(b);
    });

    const sizes = el('div', { class: 'sizes', role: 'group', 'aria-label': 'Brush size' });
    A.SIZES.forEach((px, i) => {
      const b = el('button', {
        type: 'button', class: 'size' + (i === size ? ' on' : ''),
        'aria-label': 'Brush ' + (i + 1), 'aria-pressed': i === size ? 'true' : 'false',
        onclick: () => { size = i; sync(); }
      }, [el('i', { style: 'width:' + (px + 2) + 'px;height:' + (px + 2) + 'px' })]);
      b.dataset.i = i;
      sizes.appendChild(b);
    });

    const papers = el('div', { class: 'papers', role: 'group', 'aria-label': 'Paper' });
    A.PAPERS.forEach((hex, i) => {
      const b = el('button', {
        type: 'button', class: 'paper' + (i === art.paper ? ' on' : ''),
        style: 'background:' + hex, 'aria-label': 'Paper ' + (i + 1),
        'aria-pressed': i === art.paper ? 'true' : 'false',
        onclick: () => { art.paper = i; sync(); paint(); }
      });
      b.dataset.i = i;
      papers.appendChild(b);
    });

    const btnUndo = el('button', {
      type: 'button', class: 'tool-btn', onclick: undo, text: 'Undo'
    });
    const btnRedo = el('button', {
      type: 'button', class: 'tool-btn', onclick: () => {
        if (!redo.length) return;
        art.strokes.push(redo.pop());
        paint(); sync();
      }, text: 'Redo'
    });
    const btnClear = el('button', {
      type: 'button', class: 'tool-btn quiet', onclick: () => {
        if (!art.strokes.length) return;
        for (let i = art.strokes.length - 1; i >= 0; i--) redo.push(art.strokes[i]);
        art.strokes.length = 0;
        paint(); sync();
      }, text: 'Clear'
    });

    const count = el('span', { class: 'draw-count' });

    host.appendChild(el('div', { class: 'draw' }, [
      stage,
      el('div', { class: 'draw-bar' }, [swatches]),
      el('div', { class: 'draw-bar split' }, [
        sizes, papers,
        el('div', { class: 'draw-acts' }, [btnUndo, btnRedo, btnClear, count])
      ])
    ]));

    function sync() {
      K.core.$$('.swatch', swatches).forEach(b => {
        const on = +b.dataset.i === colour;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      K.core.$$('.size', sizes).forEach(b => {
        const on = +b.dataset.i === size;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      K.core.$$('.paper', papers).forEach(b => {
        const on = +b.dataset.i === art.paper;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      btnUndo.disabled = !art.strokes.length;
      btnRedo.disabled = !redo.length;
      btnClear.disabled = !art.strokes.length;
      const n = art.strokes.length;
      count.textContent = n ? K.core.plural(n, 'stroke') + ', ' +
        K.core.plural(A.coloursUsed(art), 'colour') : '';
    }

    function undo() {
      if (!art.strokes.length) return;
      redo.push(art.strokes.pop());
      paint(); sync();
    }

    function box() {
      const r = stage.getBoundingClientRect();
      return r;
    }

    function paint() {
      const r = box();
      A.paint(canvas, art, r.width, r.height);
      if (drawing && drawing.pts.length >= 2) {
        // The live stroke is already in art.strokes while drawing.
      }
    }

    function pos(ev) {
      const r = box();
      return [
        clamp((ev.clientX - r.left) / r.width, 0, 1),
        clamp((ev.clientY - r.top) / r.height, 0, 1)
      ];
    }

    function down(ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      const [x, y] = pos(ev);
      drawing = { c: colour, s: size, pts: [round(x), round(y)] };
      art.strokes.push(drawing);
      redo.length = 0;
      paint(); sync();
      ev.preventDefault();
    }

    function move(ev) {
      if (!drawing) return;
      const [x, y] = pos(ev);
      const p = drawing.pts;
      const lx = p[p.length - 2], ly = p[p.length - 1];
      /* Sample by distance, not by event. Fast phones fire pointermove far
       * more often than a line needs, and every extra point is bytes in a
       * save file that has to last years. */
      if (Math.abs(x - lx) + Math.abs(y - ly) < 0.006) return;
      p.push(round(x), round(y));
      paint();
      ev.preventDefault();
    }

    function up() {
      if (!drawing) return;
      if (drawing.pts.length < 2) art.strokes.pop();
      drawing = null;
      paint(); sync();
    }

    const round = v => Math.round(v * 1000) / 1000;

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
    canvas.style.touchAction = 'none';

    const onResize = () => paint();
    window.addEventListener('resize', onResize);
    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => paint());
      ro.observe(stage);
    }

    requestAnimationFrame(() => { paint(); sync(); });

    return {
      craft: 'draw',
      payload() { return { paper: art.paper, strokes: art.strokes.slice() }; },
      empty() { return art.strokes.length === 0; },
      /* Which deliberate-practice constraints this piece satisfies. Checked
       * from the work itself, never self-reported. */
      practice() {
        const done = [];
        if (art.strokes.length && A.coloursUsed(art) <= 3) done.push('d-three');
        if (art.strokes.length === 1 && art.strokes[0].pts.length >= 12) done.push('d-nolift');
        const cov = A.coverage(art);
        if (art.strokes.length && cov.minx < 0.06 && cov.miny < 0.06 &&
            cov.maxx > 0.94 && cov.maxy > 0.94) done.push('d-big');
        if (art.strokes.length >= 2 && cov.area > 0 && cov.area < 0.3) done.push('d-empty');
        return done;
      },
      destroy() {
        window.removeEventListener('resize', onResize);
        if (ro) ro.disconnect();
      }
    };
  }

  K.draw = { mount };
})(window.Kiln = window.Kiln || {});
