/* Attest — a capture-and-sign prototype.
 *
 * Two premises from ../03-product-concept.md, made concrete enough to hand to
 * a technician:
 *
 *   1. Capture must complete with the radio off. Everything below writes to
 *      IndexedDB first and syncs opportunistically. There is no spinner on the
 *      critical path and no request the technician has to wait for.
 *   2. Nothing is filed without a person attesting to it. The review screen
 *      shows what was said, what was extracted, what it was grounded in, and
 *      what the system is unsure about — and refuses to sign until every item
 *      has been dispositioned.
 *
 * Deliberately no framework and no build step: this is disposable, like the
 * Gate 2 harness. If the gates pass, ../02-stack-and-costs.md describes what
 * gets built properly, and none of this survives.
 */

'use strict';

/* --- storage --------------------------------------------------------------
 * One IndexedDB, three stores. Media blobs live beside their inspection so a
 * capture is self-contained on the device until it syncs.
 */

const DB_NAME = 'attest';
const STORES = { inspections: 'id', media: 'id', drafts: 'inspectionId' };

let _db;
function db() {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const [name, key] of Object.entries(STORES)) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: key });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _db;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  });
}

const put = (store, value) => tx(store, 'readwrite', (s) => s.put(value));
const get = (store, key) => tx(store, 'readonly', (s) => s.get(key));
const all = (store) => tx(store, 'readonly', (s) => s.getAll());
const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));

/* --- helpers --------------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function when(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

const objectUrls = [];
function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}
function releaseUrls() {
  while (objectUrls.length) URL.revokeObjectURL(objectUrls.pop());
}

/* --- connection state ------------------------------------------------------
 * Shown, never enforced. Every capture path works identically offline; the
 * indicator exists so the technician knows why the queue is not draining.
 */

function paintNet() {
  const el = $('#net');
  el.textContent = navigator.onLine ? 'online' : 'offline';
  el.classList.toggle('on', navigator.onLine);
}
addEventListener('online', () => { paintNet(); drainQueue(); });
addEventListener('offline', paintNet);

/* --- routing --------------------------------------------------------------- */

const routes = [
  [/^\/field$/, () => viewBuildings()],
  [/^\/capture\/(.+)$/, (id) => viewCapture(id)],
  [/^\/review$/, () => viewInbox()],
  [/^\/attest\/(.+)$/, (id) => viewAttest(id)],
  [/^\/queue$/, () => viewQueue()],
];

async function router() {
  releaseUrls();
  const path = location.hash.slice(1) || '/field';
  for (const [re, handler] of routes) {
    const m = path.match(re);
    if (m) {
      document.querySelectorAll('#tabs a').forEach((a) => {
        a.classList.toggle('active', path.startsWith(a.getAttribute('href').slice(1)));
      });
      $('#back').hidden = !/^\/(capture|attest)\//.test(path);
      await handler(m[1]);
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/field';
}
addEventListener('hashchange', router);
$('#back').onclick = () => history.back();

function render(title, html) {
  $('#title').textContent = title;
  $('#view').innerHTML = html;
}

/* --- field: buildings ------------------------------------------------------ */

async function viewBuildings() {
  const list = (await all('inspections')).sort((a, b) => b.startedAt - a.startedAt);

  render('Inspections', `
    <button class="primary wide" id="new">Start an inspection</button>
    ${list.length === 0 ? `
      <p class="empty">Nothing captured yet.<br>Start one — it works with the radio off.</p>
    ` : list.map((i) => `
      <a class="card" href="#/capture/${i.id}" style="display:block;text-decoration:none;color:inherit">
        <div class="row">
          <h3>${esc(i.building)}</h3>
          <span class="spacer"></span>
          <span class="pill ${i.status === 'signed' ? 'ok' : ''}">${i.status}</span>
        </div>
        <p class="muted">${esc(i.jurisdiction || 'no jurisdiction set')} · ${when(i.startedAt)}
           · ${i.photos || 0} photo(s) · ${i.clips || 0} clip(s)</p>
      </a>
    `).join('')}
  `);

  $('#new').onclick = viewNewInspection;
}

function viewNewInspection() {
  render('New inspection', `
    <div class="card">
      <label class="field"><span>Building</span>
        <input type="text" id="b" placeholder="Northgate Distribution, Bldg C" autocomplete="off"></label>
      <label class="field"><span>Address</span>
        <input type="text" id="a" placeholder="1400 Northgate Way" autocomplete="off"></label>
      <label class="field"><span>Authority having jurisdiction</span>
        <input type="text" id="j" placeholder="Travis County Fire Marshal" autocomplete="off"></label>
      <button class="primary wide" id="go">Begin capture</button>
      <p class="muted" style="margin-bottom:0">Typed once, at the truck. Everything after
        this is voice and camera.</p>
    </div>
  `);
  $('#title').textContent = 'New inspection';
  $('#b').focus();
  $('#go').onclick = async () => {
    const building = $('#b').value.trim();
    if (!building) return toast('Building name is required');
    const rec = {
      id: uid(),
      building,
      address: $('#a').value.trim(),
      jurisdiction: $('#j').value.trim(),
      startedAt: Date.now(),
      status: 'capturing',
      photos: 0,
      clips: 0,
    };
    await put('inspections', rec);
    location.hash = `#/capture/${rec.id}`;
  };
}

/* --- field: capture --------------------------------------------------------
 * Hold to talk. Photos through the OS camera. No form, no field list, nothing
 * to type — that is the whole premise, so the UI must not quietly reintroduce
 * a keyboard.
 */

let recorder = null;
let chunks = [];

async function viewCapture(id) {
  const insp = await get('inspections', id);
  if (!insp) { location.hash = '#/field'; return; }

  const media = (await all('media')).filter((m) => m.inspectionId === id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const clips = media.filter((m) => m.kind === 'audio');
  const photos = media.filter((m) => m.kind === 'photo');
  const locked = insp.status !== 'capturing';

  render(insp.building, `
    <p class="muted">${esc(insp.address || '')}${insp.address && insp.jurisdiction ? ' · ' : ''}${esc(insp.jurisdiction || '')}</p>

    ${locked ? `<div class="card"><p class="muted" style="margin:0">
      Capture closed — this inspection is <b>${insp.status}</b>.</p></div>` : `
      <button id="rec"><span class="dot" hidden></span><span id="rec-label">Hold to talk</span></button>
      <p class="muted" style="text-align:center">
        Talk the way you would to another tech. Don't tidy it up.</p>

      <div class="row" style="gap:8px;margin:14px 0">
        <label class="btn" style="flex:1;display:flex;align-items:center;justify-content:center">
          Add photo
          <input type="file" id="cam" accept="image/*" capture="environment" multiple hidden>
        </label>
        <button id="done" class="primary" style="flex:1">Finish</button>
      </div>
    `}

    <div class="card">
      <h3>Narration <span class="muted">(${clips.length})</span></h3>
      ${clips.length === 0 ? '<p class="muted">Nothing recorded yet.</p>' :
        clips.map((c) => `
          <div class="clip">
            <audio controls preload="none" src="${blobUrl(c.blob)}"></audio>
            ${locked ? '' : `<button class="danger" data-drop="${c.id}" style="min-height:40px;padding:0 12px">×</button>`}
          </div>`).join('')}
    </div>

    <div class="card">
      <h3>Photos <span class="muted">(${photos.length})</span></h3>
      ${photos.length === 0 ? '<p class="muted">No photos yet.</p>' :
        `<div class="thumbs">${photos.map((p) => `
          <img src="${blobUrl(p.blob)}" alt="${esc(p.name)}" title="${esc(p.name)}">`).join('')}</div>`}
    </div>
  `);

  if (locked) return;

  media.forEach(() => {});
  document.querySelectorAll('[data-drop]').forEach((btn) => {
    btn.onclick = async () => {
      await del('media', btn.dataset.drop);
      await recount(id);
      router();
    };
  });

  $('#cam').onchange = async (e) => {
    const files = [...e.target.files];
    for (const file of files) {
      await put('media', {
        id: uid(), inspectionId: id, kind: 'photo',
        name: file.name || `photo-${uid()}.jpg`,
        blob: file, createdAt: Date.now(),
      });
    }
    e.target.value = '';
    await recount(id);
    toast(`${files.length} photo(s) stored on device`);
    router();
  };

  wireRecorder(id);

  $('#done').onclick = async () => {
    if (clips.length === 0 && photos.length === 0) return toast('Nothing captured yet');
    insp.status = 'queued';
    insp.queuedAt = Date.now();
    await put('inspections', insp);
    toast(navigator.onLine ? 'Queued — syncing' : 'Queued — will send when there is signal');
    drainQueue();
    location.hash = '#/field';
  };
}

function wireRecorder(inspectionId) {
  const btn = $('#rec');
  if (!btn) return;
  const label = $('#rec-label');
  const dot = btn.querySelector('.dot');

  const start = async (ev) => {
    ev.preventDefault();
    if (recorder) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast('No microphone access — check permissions');
    }
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      recorder = null;
      if (blob.size < 1200) return toast('Too short — hold the button while you talk');
      await put('media', {
        id: uid(), inspectionId, kind: 'audio',
        name: `clip-${Date.now()}.webm`, blob, createdAt: Date.now(),
      });
      await recount(inspectionId);
      router();
    };
    recorder.start();
    btn.classList.add('live');
    dot.hidden = false;
    label.textContent = 'Recording — release to stop';
  };

  const stop = (ev) => {
    ev.preventDefault();
    btn.classList.remove('live');
    dot.hidden = true;
    label.textContent = 'Hold to talk';
    if (recorder && recorder.state === 'recording') recorder.stop();
  };

  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('pointerleave', stop);
}

async function recount(id) {
  const insp = await get('inspections', id);
  const media = (await all('media')).filter((m) => m.inspectionId === id);
  insp.photos = media.filter((m) => m.kind === 'photo').length;
  insp.clips = media.filter((m) => m.kind === 'audio').length;
  await put('inspections', insp);
}

/* --- sync -----------------------------------------------------------------
 * Opportunistic and idempotent. A failure leaves the inspection queued and
 * says so; it never blocks capture and never loses the media.
 */

async function drainQueue() {
  const queued = (await all('inspections')).filter((i) => i.status === 'queued');
  if (!queued.length || !navigator.onLine) return paintQueueCount();

  for (const insp of queued) {
    try {
      const media = (await all('media')).filter((m) => m.inspectionId === insp.id);
      const form = new FormData();
      form.append('meta', JSON.stringify({
        id: insp.id, building: insp.building, address: insp.address,
        jurisdiction: insp.jurisdiction, inspection_date: new Date(insp.startedAt).toISOString(),
      }));
      for (const m of media) form.append(m.kind, m.blob, m.name);

      const res = await fetch('api/draft', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`${res.status}`);
      const draft = await res.json();

      await put('drafts', {
        inspectionId: insp.id,
        deficiencies: draft.deficiencies || [],
        uncertain_items: draft.uncertain_items || [],
        transcript: draft.transcript || '',
        receivedAt: Date.now(),
      });
      insp.status = 'drafted';
      await put('inspections', insp);
      toast(`Draft ready — ${insp.building}`);
    } catch (err) {
      console.warn('sync failed', err);
      toast('Sync failed — still queued');
      break;
    }
  }
  paintQueueCount();
  if (/^#\/(queue|review|field)/.test(location.hash)) router();
}

async function paintQueueCount() {
  const n = (await all('inspections')).filter((i) => i.status === 'queued').length;
  const el = $('#queue-count');
  el.textContent = n;
  el.hidden = n === 0;
}

async function viewQueue() {
  const list = (await all('inspections')).filter((i) => i.status === 'queued');
  render('Queue', `
    <div class="card">
      <div class="row">
        <div>
          <h3>${list.length} waiting to send</h3>
          <p class="muted" style="margin:0">Nothing is lost while offline. Media stays on the
            device until the server confirms it.</p>
        </div>
      </div>
      <button class="wide primary" id="sync" style="margin-top:12px"
        ${navigator.onLine ? '' : 'disabled'}>
        ${navigator.onLine ? 'Send now' : 'No connection'}</button>
    </div>
    ${list.map((i) => `
      <div class="card">
        <h3>${esc(i.building)}</h3>
        <p class="muted" style="margin:0">${i.clips || 0} clip(s), ${i.photos || 0} photo(s)
          · queued ${when(i.queuedAt || i.startedAt)}</p>
      </div>`).join('')}
  `);
  const btn = $('#sync');
  if (btn) btn.onclick = () => { toast('Sending…'); drainQueue(); };
}

/* --- review: inbox --------------------------------------------------------- */

async function viewInbox() {
  const list = (await all('inspections'))
    .filter((i) => i.status === 'drafted' || i.status === 'signed')
    .sort((a, b) => b.startedAt - a.startedAt);

  render('Review', list.length === 0 ? `
    <p class="empty">No drafts yet.<br>Capture an inspection and send it.</p>
  ` : list.map((i) => `
      <a class="card" href="#/attest/${i.id}" style="display:block;text-decoration:none;color:inherit">
        <div class="row">
          <h3>${esc(i.building)}</h3>
          <span class="spacer"></span>
          <span class="pill ${i.status === 'signed' ? 'ok' : 'major'}">
            ${i.status === 'signed' ? 'signed' : 'needs review'}</span>
        </div>
        <p class="muted">${esc(i.jurisdiction || '')} · ${when(i.startedAt)}</p>
      </a>`).join(''));
}

/* --- review: attest -------------------------------------------------------
 * The non-negotiable screen. Every finding shows its provenance — what was
 * said, what evidenced it, and the procedure it was grounded in — and the
 * signature is blocked until each one has been dispositioned.
 */

async function viewAttest(id) {
  const insp = await get('inspections', id);
  const draft = await get('drafts', id);
  if (!insp || !draft) { location.hash = '#/review'; return; }

  const media = (await all('media')).filter((m) => m.inspectionId === id && m.kind === 'photo');
  const photoUrl = {};
  for (const m of media) photoUrl[m.name] = blobUrl(m.blob);

  const decisions = insp.decisions || {};
  const signed = insp.status === 'signed';

  const findingHtml = (d) => {
    const state = decisions[d.id] || {};
    const evidence = (d.evidence_photo_ids || []).filter((n) => photoUrl[n]);
    return `
    <div class="card finding ${state.verdict === 'accept' ? (state.text ? 'edited' : 'accepted') : ''}${state.verdict === 'reject' ? 'rejected' : ''}" data-id="${d.id}">
      <div class="row wrap" style="gap:6px">
        <span class="pill ${esc(d.severity)}">${esc(d.severity)}</span>
        ${d.confidence === 'low' ? '<span class="pill low">low confidence</span>' : ''}
        <span class="pill">${esc(d.source)}</span>
        <span class="spacer"></span>
        <span class="mono muted">${esc(d.id)}</span>
      </div>

      <h3 style="margin-top:10px">${esc(d.description)}</h3>
      <p class="muted" style="margin:0">${esc(d.location)} · ${esc(d.device)}</p>

      <div class="basis">
        <span class="src">Grounded in</span>
        ${d.procedure_id
          ? `<span class="mono">${esc(d.procedure_id)}</span> → clause <span class="mono">${esc(d.standard_clause)}</span>
             <p style="margin:6px 0 0">${esc(d.requirement_basis)}</p>`
          : '<b style="color:var(--warn)">No procedure in the library covers this.</b> ' +
            'Recorded as an observation — the reviewer decides.'}
      </div>

      ${evidence.length ? `<div class="thumbs">${evidence
        .map((n) => `<img src="${photoUrl[n]}" alt="${esc(n)}" title="${esc(n)}">`).join('')}</div>` : ''}

      ${signed ? `<p class="muted" style="margin:10px 0 0">
          Signed as <b>${esc(state.verdict || 'accepted')}</b>${state.text ? ' (edited)' : ''}.</p>`
        : `
        <div class="decide">
          <button class="acc" data-v="accept" aria-pressed="${state.verdict === 'accept' && !state.text}">Accept</button>
          <button class="edt" data-v="edit"   aria-pressed="${!!state.text}">Edit</button>
          <button class="rej" data-v="reject" aria-pressed="${state.verdict === 'reject'}">Reject</button>
        </div>
        <div class="editor" hidden style="margin-top:10px">
          <textarea placeholder="Correct the wording that will be filed">${esc(state.text || d.description)}</textarea>
        </div>`}
    </div>`;
  };

  const undecided = () => draft.deficiencies.filter((d) => !(decisions[d.id] || {}).verdict).length;

  render('Attest', `
    <div class="card">
      <h3>${esc(insp.building)}</h3>
      <p class="muted" style="margin:0">${esc(insp.jurisdiction || 'no AHJ set')} ·
        ${draft.deficiencies.length} finding(s) · ${draft.uncertain_items.length} flagged as unclear</p>
    </div>

    ${draft.transcript ? `<details class="card"><summary class="muted">What the technician said</summary>
      <p style="margin:10px 0 0;white-space:pre-wrap">${esc(draft.transcript)}</p></details>` : ''}

    ${draft.deficiencies.map(findingHtml).join('')}

    ${draft.uncertain_items.length ? `
      <div class="card" style="border-color:rgba(210,153,34,.45)">
        <h3>Not filed — too ambiguous to record</h3>
        <p class="muted">Surfaced deliberately. If one of these is real, it belongs in the report
          and the system did not put it there.</p>
        <ul>${draft.uncertain_items.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
      </div>` : ''}

    ${signed ? `
      <div class="card">
        <h3>Signed</h3>
        <p class="muted" style="margin:0">${esc(insp.signedBy)} · ${new Date(insp.signedAt).toLocaleString()}</p>
        ${renderDiff(draft, insp.decisions)}
      </div>`
    : `
      <div class="attest">
        <label>
          <input type="checkbox" id="ack">
          <span>I reviewed each finding above against my own inspection, and I am
            attesting to this report under my licence. The system did not decide this.</span>
        </label>
        <label class="field" style="margin:14px 0 0"><span>Sign — name and licence number</span>
          <input type="text" id="who" placeholder="A. Rivera · LIC 44821" autocomplete="off"></label>
        <button class="primary wide" id="sign" style="margin-top:12px" disabled>
          Sign and file</button>
        <p class="muted" id="blocker" style="margin:10px 0 0"></p>
      </div>`}
  `);

  if (signed) return;

  const refreshGate = () => {
    const left = undecided();
    const ok = left === 0 && $('#ack').checked && $('#who').value.trim().length > 2;
    $('#sign').disabled = !ok;
    $('#blocker').textContent = left
      ? `${left} finding(s) still need a decision.`
      : (!$('#ack').checked ? 'Tick the attestation to sign.'
        : (!$('#who').value.trim() ? 'Add your name and licence number.' : ''));
  };

  document.querySelectorAll('.finding').forEach((card) => {
    const fid = card.dataset.id;
    const editor = card.querySelector('.editor');
    const area = editor && editor.querySelector('textarea');

    card.querySelectorAll('.decide button').forEach((btn) => {
      btn.onclick = async () => {
        const v = btn.dataset.v;
        const cur = decisions[fid] || {};
        if (v === 'edit') {
          editor.hidden = !editor.hidden;
          if (!editor.hidden) area.focus();
          return;
        }
        decisions[fid] = v === 'accept'
          ? { verdict: 'accept', text: cur.text || '' }
          : { verdict: 'reject' };
        if (v === 'reject' && editor) editor.hidden = true;
        insp.decisions = decisions;
        await put('inspections', insp);
        card.classList.toggle('accepted', v === 'accept' && !decisions[fid].text);
        card.classList.toggle('edited', v === 'accept' && !!decisions[fid].text);
        card.classList.toggle('rejected', v === 'reject');
        card.querySelectorAll('.decide button').forEach((b) => {
          b.setAttribute('aria-pressed', String(
            (b.dataset.v === 'accept' && v === 'accept' && !decisions[fid].text) ||
            (b.dataset.v === 'reject' && v === 'reject')));
        });
        refreshGate();
      };
    });

    if (area) {
      area.oninput = async () => {
        const original = draft.deficiencies.find((d) => d.id === fid).description;
        const text = area.value.trim();
        decisions[fid] = { verdict: 'accept', text: text === original ? '' : text };
        insp.decisions = decisions;
        await put('inspections', insp);
        card.classList.add('edited');
        card.classList.remove('rejected');
        card.querySelector('.edt').setAttribute('aria-pressed', String(!!decisions[fid].text));
        card.querySelector('.acc').setAttribute('aria-pressed', String(!decisions[fid].text));
        card.querySelector('.rej').setAttribute('aria-pressed', 'false');
        refreshGate();
      };
    }
  });

  $('#ack').onchange = refreshGate;
  $('#who').oninput = refreshGate;
  $('#sign').onclick = async () => {
    insp.status = 'signed';
    insp.signedBy = $('#who').value.trim();
    insp.signedAt = Date.now();
    insp.decisions = decisions;
    await put('inspections', insp);
    toast('Filed — the attestation is on the record');
    router();
  };
  refreshGate();
}

/* The reviewer's changes are the product's most valuable telemetry: the edit
 * rate is a Gate 4 health signal (../gate4-retention/01-health-signals.md), and
 * a reviewer who never edits is a reviewer who may not be reading. */
function renderDiff(draft, decisions) {
  const changes = draft.deficiencies.map((d) => {
    const s = decisions[d.id] || {};
    if (s.verdict === 'reject') return `<li><b>Removed</b> ${esc(d.id)} — <span class="was">${esc(d.description)}</span></li>`;
    if (s.text) return `<li><b>Edited</b> ${esc(d.id)} — <span class="was">${esc(d.description)}</span><br>${esc(s.text)}</li>`;
    return '';
  }).filter(Boolean);

  return `<div class="diff" style="margin-top:12px">
    <p class="muted" style="margin:0 0 6px">Reviewer changed ${changes.length} of
      ${draft.deficiencies.length} findings.</p>
    ${changes.length ? `<ul>${changes.join('')}</ul>`
      : '<p class="muted" style="margin:0">No edits. Worth asking how closely it was read.</p>'}
  </div>`;
}

/* --- boot ------------------------------------------------------------------ */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
paintNet();
paintQueueCount();
router();
drainQueue();
