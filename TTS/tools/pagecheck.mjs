/* Load the built page in a real browser and fail on anything it complains about.
 *
 *   node tools/pagecheck.mjs [file]      defaults to dist/aloud.html
 *
 * Drives the Chromium binary directly rather than through Playwright, so this
 * repo keeps its no-dependency rule. It answers one question the pure
 * self-test cannot: does the page boot without throwing, and does the script
 * actually reach the DOM.
 *
 * What it cannot answer: whether anything is audible. Headless Chromium
 * reports zero voices, so speech itself is only ever confirmed on a device.
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(process.argv[2] || join(ROOT, 'dist', 'aloud.html'));

if (!existsSync(target)) {
  console.error(`pagecheck: ${target} does not exist — run "node tools/build.mjs" first`);
  process.exit(1);
}

function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;

  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(base)) {
    const dirs = readdirSync(base).filter(d => d.startsWith('chromium')).sort().reverse();
    for (const d of dirs) {
      for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const p = join(base, d, exe);
        if (existsSync(p)) return p;
      }
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (existsSync(p)) return p;
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('pagecheck: no Chromium binary found; set CHROME=/path/to/chrome');
  process.exit(1);
}

function render(file) {
  let stdout = '';
  let stderr = '';
  try {
    stdout = execFileSync(chrome, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--enable-logging=stderr',
      '--virtual-time-budget=6000',
      '--dump-dom',
      'file://' + file
    ], { encoding: 'utf8', timeout: 90000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    stdout = (err.stdout || '').toString();
    stderr = (err.stderr || '').toString();
    if (!stdout) {
      console.error('pagecheck: the browser did not render ' + file);
      console.error(stderr.split('\n').slice(-25).join('\n'));
      process.exit(1);
    }
  }
  return { stdout, stderr };
}

const { stdout, stderr } = render(target);

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log('  ok   ' + name);
  } else {
    failures++;
    console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
  }
}

console.log('pagecheck  ' + target.replace(ROOT + '/', '') + '\n');

// Console errors and uncaught exceptions both surface on stderr.
const noisy = stderr.split('\n').filter(line =>
  /:ERROR:CONSOLE|Uncaught|SyntaxError|ReferenceError|TypeError/.test(line));

check('the page logged no errors', noisy.length === 0, noisy.slice(0, 6).join('\n         '));

// The script reached the DOM: this text only exists because reader.js wrote it.
check('the reader booted and rendered its empty state',
  stdout.includes('Nothing to read yet'),
  'the reading pane was never populated by script');

check('the transport rendered', /id="transport"/.test(stdout));
check('the settings sheet rendered', /id="sheet"/.test(stdout));
check('the voice select was populated by script',
  /Engine default/.test(stdout),
  'app.js never filled the voice list');
check('the capability note was written by script',
  /bench has not run|Measured on this device/.test(stdout),
  'app.js never painted the capability line');
check('the sentence counter was painted', /id="counter"/.test(stdout));

// Nothing may reach out to the network; a strict-CSP host would block it anyway.
check('no external references survive',
  !/(src|href)="(https?:)?\/\//.test(stdout),
  'an absolute URL is still referenced');

// --- drive it ----------------------------------------------------------------
// A second pass, on a copy of the page with a script appended that operates the
// interface and writes what it found back into the DOM. This is where the
// wiring gets tested: segmentation reaching the pane, tap-to-seek, the tabs,
// the sheet.

const DRIVER = `
<script>
window.addEventListener('load', function () {
  setTimeout(function () {
    var out = {};
    function q(s) { return document.querySelectorAll(s); }
    try {
      var source = 'Dr. Chen arrived at 3.14. He left.\\n\\nThen it was quiet.';
      var ta = document.getElementById('text');
      ta.value = source;
      ta.dispatchEvent(new Event('input', { bubbles: true }));

      out.chunks = q('#pane .chunk').length;
      out.paneMatchesSource = document.getElementById('pane').textContent === source;

      var spans = q('#pane .chunk');
      if (spans[1]) spans[1].click();
      out.current = q('#pane .chunk.is-current').length;
      out.counter = document.getElementById('counter').textContent;

      document.querySelector('.tabs button[data-tab="voices"]').click();
      out.voicesShown = document.getElementById('tab-voices').hidden === false;
      out.readHidden = document.getElementById('tab-read').hidden === true;
      out.transportHidden = document.getElementById('transport').hidden === true;

      document.getElementById('btn-settings').click();
      out.sheetOpen = document.getElementById('sheet').classList.contains('open');

      document.getElementById('btn-sheet-close').click();
      out.sheetClosed = !document.getElementById('sheet').classList.contains('open');

      // The narration path: a baked script, a mode chosen, read into the pane.
      document.querySelector('.tabs button[data-tab="session"]').click();
      out.sessionShown = document.getElementById('tab-session').hidden === false;
      out.baked = !!(window.TTS && window.TTS.NARRATION);
      out.modeButtons = q('#sess-modes .btn').length;
      out.previewBeats = q('#sess-preview .beat').length;
      out.sourceLine = document.getElementById('sess-source').textContent;

      // Condensed is the default; "every step" must show strictly more.
      out.condensedSummary = document.getElementById('sess-summary').textContent;
      out.condensedBeats = q('#sess-preview .beat').length;
      document.querySelector('[data-density="full"]').click();
      out.fullSummary = document.getElementById('sess-summary').textContent;
      document.querySelector('[data-density="condensed"]').click();

      // Note the doubled backslash: this whole script lives in a template
      // literal, where a lone \\d degrades to a literal "d".
      var readCount = function (s) { var m = /^(\\d+) beats/.exec(s || ''); return m ? +m[1] : -1; };
      out.condensedCount = readCount(out.condensedSummary);
      out.fullCount = readCount(out.fullSummary);
      out.saysMerged = /merged down from/.test(out.condensedSummary);

      if (out.modeButtons) {
        document.getElementById('sess-play').click();
        out.afterPlayTab = document.getElementById('tab-read').hidden === false;
        out.narratedChunks = q('#pane .chunk').length;
        out.beatLabels = q('#pane .beat-label').length;
        out.reconstructedMarks = q('#pane .beat-label i').length;
        var first = q('#pane .chunk')[0];
        out.narrationAnnounces = !!first && /^(The brief|Result|Verdict|Reconstructed|Thinking):/.test(first.textContent.trim());
        document.getElementById('t-stop').click();
      }

      document.querySelector('.tabs button[data-tab="read"]').click();
      document.getElementById('btn-clear').click();
      out.clearedChunks = q('#pane .chunk').length;
      out.ok = true;
    } catch (e) {
      out.error = String((e && e.stack) || e);
    }
    var el = document.createElement('div');
    el.id = 'probe-result';
    el.textContent = JSON.stringify(out);
    document.body.appendChild(el);
  }, 200);
});
<\/script>
`;

const work = mkdtempSync(join(tmpdir(), 'aloud-pagecheck-'));
const driven = join(work, 'driven.html');
writeFileSync(driven, readFileSync(target, 'utf8').replace('</body>', DRIVER + '</body>'));

const second = render(driven);
const found = second.stdout.match(/<div id="probe-result">([\s\S]*?)<\/div>/);

console.log('');
if (!found) {
  check('the interface driver ran', false, 'no result element was written back into the DOM');
} else {
  let probe = {};
  try {
    probe = JSON.parse(found[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  } catch (e) {
    check('the driver result parsed', false, found[1].slice(0, 200));
  }

  check('the driver ran without throwing', probe.ok === true, probe.error);
  check('typed text is segmented into the pane', probe.chunks === 3, 'got ' + probe.chunks + ' chunks, expected 3');
  check('the pane reproduces the source exactly', probe.paneMatchesSource === true);
  check('tapping a sentence makes it current', probe.current === 1, 'got ' + probe.current + ' current chunks');
  check('the counter tracks the position', /2\s*\/\s*3/.test(probe.counter || ''), 'counter read "' + probe.counter + '"');
  check('switching tabs shows the voices panel', probe.voicesShown === true && probe.readHidden === true);
  check('the transport hides outside the reading tab', probe.transportHidden === true);
  check('the settings sheet opens', probe.sheetOpen === true);
  check('the settings sheet closes', probe.sheetClosed === true);
  check('clearing empties the pane', probe.clearedChunks === 0, 'got ' + probe.clearedChunks);

  check('the session tab opens', probe.sessionShown === true);
  check('a narration is baked into the page', probe.baked === true,
    'window.TTS.NARRATION is missing — run "node tools/monologue.mjs all" then rebuild');
  check('the baked script is announced as built in',
    /built into this page/.test(probe.sourceLine || ''), 'source read "' + probe.sourceLine + '"');
  check('every mode gets a button', probe.modeButtons >= 2, 'got ' + probe.modeButtons);
  check('beats are previewed', probe.previewBeats > 5, 'got ' + probe.previewBeats);
  check('condensing is the default and cuts the beat count',
    probe.condensedCount > 0 && probe.fullCount > probe.condensedCount,
    'condensed ' + probe.condensedCount + ' vs full ' + probe.fullCount);
  check('the summary says it merged', probe.saysMerged === true, probe.condensedSummary);
  check('playing a narration switches to the reading tab', probe.afterPlayTab === true);
  check('the narration segments into the pane', probe.narratedChunks > 10, 'got ' + probe.narratedChunks);
  check('beats are labelled in the pane', probe.beatLabels > 5, 'got ' + probe.beatLabels);
  check('reconstructed beats are marked as such', probe.reconstructedMarks > 0,
    'no beat carried the "reconstructed" tag — inference would read as record');
  check('the narration announces the kind of beat', probe.narrationAnnounces === true,
    'first chunk read "' + (probe.sourceLine || '') + '"');
}

const drivenNoise = second.stderr.split('\n').filter(line =>
  /:ERROR:CONSOLE|Uncaught|SyntaxError|ReferenceError/.test(line));
check('driving the interface logged no errors', drivenNoise.length === 0,
  drivenNoise.slice(0, 6).join('\n         '));

console.log('');
if (failures) {
  console.log(failures + ' check(s) failed   <<< ATTENTION');
  process.exit(1);
}
console.log('all checks passed');
