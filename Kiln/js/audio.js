/* Kiln — four sounds, synthesised, no files.
 *
 * Everything you hear is made by oscillators and a noise buffer at the
 * moment it plays. No samples, no downloads, no network — which is what lets
 * the whole app be one HTML file that works with the radio off.
 *
 * Nothing here ever starts on its own. There is no autoplay path in this
 * module: playback requires a call that only ever comes from a press, and a
 * pattern plays one bar and stops unless the person asked for a loop. See
 * the autoplay entry in the Watchtower for why that is not an oversight.
 */
(function (K) {
  'use strict';

  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ready() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function available() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }

  function env(node, t, a, d, peak) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g);
    g.connect(master);
    return g;
  }

  function kick(t) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    env(o, t, 0.004, 0.28, 0.9);
    o.start(t); o.stop(t + 0.35);
  }

  function snare(t) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    s.connect(bp);
    env(bp, t, 0.003, 0.16, 0.42);
    s.start(t); s.stop(t + 0.2);

    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    env(o, t, 0.002, 0.09, 0.22);
    o.start(t); o.stop(t + 0.12);
  }

  function hat(t) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7200;
    s.connect(hp);
    env(hp, t, 0.002, 0.045, 0.2);
    s.start(t); s.stop(t + 0.08);
  }

  function tone(t, step) {
    /* A pentatonic degree chosen by step position, so a pattern someone taps
     * in at random still lands somewhere musical. */
    const scale = [0, 3, 5, 7, 10, 12];
    const semis = scale[step % scale.length] + (step > 7 ? 12 : 0);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220 * Math.pow(2, semis / 12), t);
    const g = env(o, t, 0.006, 0.34, 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    g.disconnect(); g.connect(lp); lp.connect(master);
    o.start(t); o.stop(t + 0.42);
  }

  const VOICES = [kick, snare, hat, tone];
  const VOICE_NAMES = ['kick', 'snare', 'hat', 'tone'];

  function hit(track, step) {
    if (!ready()) return;
    const t = ctx.currentTime + 0.01;
    VOICES[track](t, step || 0);
  }

  /* A running pattern. `stop()` is always available and always immediate —
   * there is no "are you sure you want to stop the music" anywhere. */
  function play(pattern, opts) {
    if (!ready()) return { stop() {}, running: false };
    opts = opts || {};
    const stepDur = 60 / (pattern.tempo || 100) / 4;
    const tracks = pattern.tracks;
    let step = 0;
    let next = ctx.currentTime + 0.06;
    let stopped = false;
    let timer = null;
    const startedAt = next;

    function schedule() {
      if (stopped) return;
      while (next < ctx.currentTime + 0.12) {
        const s = step % 16;
        for (let tr = 0; tr < tracks.length; tr++) {
          if (tracks[tr][s]) VOICES[tr](next, s);
        }
        if (opts.onStep) {
          const at = next, cur = s;
          const delay = Math.max(0, (at - ctx.currentTime) * 1000);
          setTimeout(() => { if (!stopped) opts.onStep(cur); }, delay);
        }
        next += stepDur;
        step++;
        if (!opts.loop && step >= 16) {
          const endIn = Math.max(0, (next - ctx.currentTime) * 1000);
          setTimeout(() => { if (!stopped) { stopped = true; if (opts.onEnd) opts.onEnd(); } }, endIn);
          clearInterval(timer);
          return;
        }
      }
    }

    timer = setInterval(schedule, 25);
    schedule();

    return {
      get running() { return !stopped; },
      stop() {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
        if (opts.onEnd) opts.onEnd();
      },
      startedAt
    };
  }

  K.audio = { ready, available, play, hit, VOICE_NAMES };
})(window.Kiln = window.Kiln || {});
