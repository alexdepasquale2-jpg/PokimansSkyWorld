/* DoomSpire — one frame: the raycast scene, sprites with nameplates and
 * health bars, the crosshair/target reticle, and the minimap. Everything
 * else (bars, buttons, panels) is DOM and lives in ui.js.
 */
(function (DS) {
  'use strict';
  const C = DS.core;
  const K = DS.content;
  const E = DS.engine;

  let scene = null, sceneCtx = null, mini = null, miniCtx = null;
  let W = 320, H = 240;

  function init(sceneCanvas, miniCanvas) {
    scene = sceneCanvas; sceneCtx = scene.getContext('2d');
    mini = miniCanvas; miniCtx = mini.getContext('2d');
    resize();
  }

  function resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const rect = scene.getBoundingClientRect();
    W = scene.width = Math.max(160, Math.round(rect.width * dpr));
    H = scene.height = Math.max(120, Math.round(rect.height * dpr));
    const mr = mini.getBoundingClientRect();
    mini.width = Math.round(mr.width * dpr);
    mini.height = Math.round(mr.height * dpr);
  }

  const NPC_COLORS = { vendor: '#e8b23a', trainer: '#7fb8e0', proftrainer: '#7fb8e0', quest: '#e0a83f', companion: '#79c07a' };

  function npcMarker(npc, player) {
    if (npc.kind === 'quest' || npc.kind === 'companion') {
      const give = DS.world.questsOffered(player, npc.id).length;
      const turn = DS.world.questsToTurnIn(player, npc.id).length;
      const prog = DS.world.questsInProgress(player, npc.id).length;
      if (turn) return { glyph: '❓', color: '#f0d34a' };
      if (give) return { glyph: '❗', color: '#f0a52e' };
      if (prog) return { glyph: '…', color: '#8d9ab2' };
    }
    return null;
  }

  function drawBarAbove(ctx, screenX, top, size, ratio, color) {
    const w = Math.max(14, size * 0.7), h = Math.max(2, size * 0.06);
    const x = screenX - w / 2, y = top - h - 3;
    ctx.fillStyle = 'rgba(6,10,18,0.75)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * C.clamp(ratio, 0, 1), h);
  }
  function drawGlyphAbove(ctx, screenX, top, size, glyph, color) {
    ctx.font = `${Math.max(10, size * 0.35)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = color;
    ctx.fillText(glyph, screenX, top - 3);
  }

  function frame(game, dt) {
    if (!scene) return;
    const player = game.player;
    sceneCtx.clearRect(0, 0, W, H);
    if (!player.alive) {
      sceneCtx.fillStyle = '#1a0608';
      sceneCtx.fillRect(0, 0, W, H);
      sceneCtx.fillStyle = '#c0392b';
      sceneCtx.textAlign = 'center'; sceneCtx.font = `${Math.round(H * 0.07)}px sans-serif`;
      sceneCtx.fillText('YOU HAVE FALLEN', W / 2, H / 2);
      return;
    }
    const zone = K.ZONES[player.zone];
    const rt = DS.state.currentRuntime(game);
    const zbuffer = E.castWalls(sceneCtx, W, H, zone, player);

    const companions = Object.values(game.companionsActive).filter(c => player.companions[c.defId] && player.companions[c.defId].recruited && c.zone === player.zone);
    const sprites = [];
    rt.mobs.filter(m => m.alive).forEach(m => sprites.push({ x: m.x, y: m.y, icon: m.icon, ring: m.boss ? '#7a1030' : m.elite ? '#a9432c' : '#c0392b', kind: 'mob', ref: m, height: m.boss ? 1.5 : m.elite ? 1.15 : 0.9 }));
    companions.forEach(c => sprites.push({ x: c.x, y: c.y, icon: c.icon, ring: '#2f6f4a', kind: 'companion', ref: c, height: 0.95 }));
    rt.npcs.forEach(n => { if (n.kind === 'companion' && player.companions[n.companion] && player.companions[n.companion].recruited) return; sprites.push({ x: n.x, y: n.y, icon: n.icon, ring: NPC_COLORS[n.kind] || '#8d9ab2', kind: 'npc', ref: n, height: 1.0 }); });
    rt.nodes.forEach(n => { if (n.harvested) return; sprites.push({ x: n.x, y: n.y, icon: n.kind === 'mining' ? '⛏️' : '🌿', ring: '#5f8a4a', kind: 'node', ref: n, height: 0.55, footOffset: 0.15 }); });
    if (zone.portal) sprites.push({ x: zone.portal.x, y: zone.portal.y, icon: '🌀', ring: '#6a3a9a', kind: 'portal', ref: zone.portal, height: 1.2 });

    const withDepth = sprites.map(s => Object.assign(s, { proj: E.project(player, W, H, s.x, s.y) })).filter(s => s.proj.visible);
    withDepth.sort((a, b) => b.proj.depth - a.proj.depth);
    withDepth.forEach(s => {
      const spriteOpts = { icon: s.icon, ring: s.ring, height: s.height, footOffset: s.footOffset };
      if (s.ref && s.ref.anim) spriteOpts.anim = s.ref.anim;
      const drawn = E.drawSprite(sceneCtx, W, H, zbuffer, s.proj, spriteOpts);
      if (!drawn) return;
      if (s.kind === 'mob') {
        const m = s.ref;
        if (m.hp.current < m.hp.max) drawBarAbove(sceneCtx, drawn.screenX, drawn.top, drawn.size, m.hp.current / m.hp.max, m.boss ? '#c0392b' : '#d8564a');
        if (game.target === m) {
          sceneCtx.strokeStyle = '#f0d34a'; sceneCtx.lineWidth = Math.max(1, drawn.size * 0.03);
          sceneCtx.beginPath(); sceneCtx.ellipse(drawn.screenX, drawn.cy - drawn.size * 0.5, drawn.size * 0.46, drawn.size * 0.54, 0, 0, Math.PI * 2); sceneCtx.stroke();
        }
      } else if (s.kind === 'npc') {
        const marker = npcMarker(s.ref, player);
        if (marker) drawGlyphAbove(sceneCtx, drawn.screenX, drawn.top, drawn.size, marker.glyph, marker.color);
      }
    });

    // crosshair
    sceneCtx.strokeStyle = game.target ? '#f0d34a' : 'rgba(230,236,247,0.55)';
    sceneCtx.lineWidth = 1.5;
    const cx = W / 2, cy = H / 2, r = 6;
    sceneCtx.beginPath();
    sceneCtx.moveTo(cx - r, cy); sceneCtx.lineTo(cx - 2, cy);
    sceneCtx.moveTo(cx + 2, cy); sceneCtx.lineTo(cx + r, cy);
    sceneCtx.moveTo(cx, cy - r); sceneCtx.lineTo(cx, cy - 2);
    sceneCtx.moveTo(cx, cy + 2); sceneCtx.lineTo(cx, cy + r);
    sceneCtx.stroke();

    const mapEntities = rt.mobs.filter(m => m.alive).map(m => ({ x: m.x, y: m.y, color: m.boss ? '#c0392b' : m.elite ? '#e0655a' : '#a9432c' }))
      .concat(rt.npcs.filter(n => !(n.kind === 'companion' && player.companions[n.companion] && player.companions[n.companion].recruited)).map(n => ({ x: n.x, y: n.y, color: NPC_COLORS[n.kind] || '#8d9ab2' })))
      .concat(companions.map(c => ({ x: c.x, y: c.y, color: '#79c07a' })));
    E.minimap(miniCtx, mini, zone, player, mapEntities);
  }

  DS.render = { init, resize, frame };
})(window.DS = window.DS || {});
