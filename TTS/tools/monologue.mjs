/* Turn a development record into something a voice can read.
 *
 *   node tools/monologue.mjs session <file.jsonl>   a Claude Code transcript
 *   node tools/monologue.mjs git [rev-range]        commits and their diffstat
 *   node tools/monologue.mjs test                   run the suites, narrate them
 *   node tools/monologue.mjs all                    session + git + test
 *
 *   --out FILE     where to write (default narration.json)
 *   --limit N      cap the beats per mode
 *   --pretty       readable JSON
 *
 * A note on honesty, because it decides the whole shape of this file.
 *
 * Claude Code writes its session transcripts to
 * ~/.claude/projects/<slug>/<session>.jsonl, and those records DO carry
 * `thinking` content blocks — but the text is stripped before it lands on
 * disk. Every one is an empty string with a signature beside it. The literal
 * internal monologue is not recoverable, and no amount of parsing changes
 * that.
 *
 * What survives is better than nothing and worse than the real thing: every
 * tool call with its full input, every result, every visible message, in
 * order, with timestamps. So the monologue here is RECONSTRUCTED — narration
 * inferred from what was actually done and what actually came back. Where a
 * beat is inference rather than record, it is marked `inferred: true`, and the
 * player says so. Nothing here pretends to be a transcript of thought.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..');

// --- argument handling -------------------------------------------------------

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  } else positional.push(argv[i]);
}

const command = positional[0] || 'all';
const LIMIT = flags.limit ? parseInt(flags.limit, 10) : 400;

// --- beats -------------------------------------------------------------------

/* kind: brief | thought | action | result | say | verdict
 * tone: neutral | good | bad | warn                     */
function beat(kind, text, extra) {
  return Object.assign({ kind, text: String(text).replace(/\s+/g, ' ').trim(), tone: 'neutral' }, extra || {});
}

function clip(s, n) {
  s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:]+\S*$/, '') + '…' : s;
}

/* Speech, not a path. "js/split.js" read aloud is a mouthful of slashes. */
function sayPath(p) {
  if (!p) return 'a file';
  const name = basename(String(p));
  return name.replace(/\.(mjs|js|json|md|css|html|py)$/, (m) => ({
    '.mjs': ' (module)', '.js': '', '.json': ' (data)', '.md': '', '.css': ' (styles)', '.html': '', '.py': ' (python)'
  })[m] || '');
}

// --- source 1: a Claude Code session transcript ------------------------------

function findLatestSession() {
  const base = join(homedir(), '.claude', 'projects');
  if (!existsSync(base)) return null;
  let best = null;
  for (const dir of readdirSync(base)) {
    const full = join(base, dir);
    let entries = [];
    try { entries = readdirSync(full); } catch { continue; }
    for (const f of entries) {
      if (!f.endsWith('.jsonl')) continue;
      const p = join(full, f);
      const m = statSync(p).mtimeMs;
      if (!best || m > best.mtime) best = { path: p, mtime: m };
    }
  }
  return best && best.path;
}

function readTranscript(file) {
  return readFileSync(file, 'utf8').split('\n')
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/* Which tools produce an outcome rather than a payload. */
const REPORTING_TOOLS = { Bash: true, Agent: true, Skill: true };

/* What a tool call was actually doing, in the first person. */
function describeToolUse(name, input) {
  const i = input || {};
  switch (name) {
    case 'Bash':
      return i.description ? String(i.description).replace(/^[A-Z]/, c => c.toLowerCase()) : 'run ' + clip(i.command, 60);
    case 'Write': return 'write ' + sayPath(i.file_path);
    case 'Edit': return 'change ' + sayPath(i.file_path);
    case 'Read': return 'read ' + sayPath(i.file_path);
    case 'Glob': return 'look for files matching ' + clip(i.pattern, 40);
    case 'Grep': return 'search the code for ' + clip(i.pattern, 40);
    case 'Agent': return 'hand ' + clip(i.description || 'a task', 40) + ' to another agent';
    case 'Skill': return 'load the ' + clip(i.skill, 30) + ' skill';
    case 'Artifact': return 'publish the page';
    case 'AskUserQuestion': return 'stop and ask, rather than guess';
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return 'update the task list';
    case 'ToolSearch': return 'go looking for a tool I need';
    case 'SendUserFile': return 'send a file over';
    case 'ExitPlanMode': return 'put the plan up for approval';
    case 'WebFetch': case 'WebSearch': return 'look something up';
    default: {
      // An MCP tool is named server-then-tool in snake case, which is
      // unlistenable read out literally.
      const mcp = /^mcp__([a-z0-9_]+)__(.+)$/i.exec(name);
      if (mcp) return mcp[2].replace(/_/g, ' ') + ' on ' + mcp[1].replace(/_/g, ' ');
      return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    }
  }
}

/* Reconstruction, and the only place this file infers rather than reports.
 * Each rule keys off something the record actually contains. */
function inferThought(prev, result, isError) {
  const text = clip(result, 400);
  if (!text) return null;

  // Each rule needs a signal that could not plausibly be prose. An earlier
  // version keyed off the bare word "error", and duly announced that something
  // had thrown while reading a README that happened to contain it.
  if (/\bFAIL\b|<<< ATTENTION/.test(text) && !/\b0 failed\b/.test(text)) {
    return beat('thought', 'That failed. Before changing anything I want to know whether the code is wrong or the expectation is.', { tone: 'bad', inferred: true });
  }
  if (/\b0 failed\b|all checks passed/.test(text)) {
    return beat('thought', 'Green. That is the part I can trust; the rest still needs a real device.', { tone: 'good', inferred: true });
  }
  if (/\bENOENT\b|no such file or directory/i.test(text)) {
    return beat('thought', 'Wrong path. Worth fixing before it turns into a wild goose chase.', { tone: 'warn', inferred: true });
  }
  if (isError && /\b(Traceback|SyntaxError|TypeError|ReferenceError|command not found|exit code [1-9])\b/i.test(text)) {
    return beat('thought', 'Something threw. Read it properly rather than guessing at a fix.', { tone: 'warn', inferred: true });
  }
  return null;
}

/* Most command output is not speech. A list of paths, a bare hash or a lone
 * token tells a listener nothing and takes ten seconds to say, so only lines
 * that carry an outcome are worth a beat. */
function speakableResult(line) {
  const s = String(line || '').trim();
  if (s.length < 8 || s.length > 220) return false;
  if (/^[~./]?[\w./@-]+$/.test(s)) return false;              // a bare path
  if (/^[0-9a-f]{7,40}\b/.test(s)) return false;              // a commit hash
  if (/^[-=_*#]{3,}/.test(s)) return false;                   // a rule
  if (/^[dl-][rwxsStT-]{9}/.test(s)) return false;            // ls -l
  if (/\s{3,}/.test(s)) return false;                         // a table row
  if (/[{}<>|]/.test(s)) return false;                        // code or markup
  if (s.split(/\s+/).length < 4) return false;                // barely a phrase
  if (!/[a-z]{3}/.test(s)) return false;                      // no actual words

  // Only an outcome is worth saying out loud. A line that merely contains a
  // number is not an outcome — that was letting `ls` output through.
  return /\b(passed|failed|failure|error|errors|built|wrote|created|changed|updated|deleted|added|missing|found|clean|success|succeeded|complete|completed|exited?|aborted|skipped|installed|no such|not found|up to date|nothing to commit|all checks)\b/i.test(s);
}

function firstUseful(text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  return lines.find(speakableResult) || '';
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(c => c && c.type === 'text').map(c => c.text).join('\n');
}

function fromSession(file) {
  const records = readTranscript(file);
  const beats = [];
  const pendingTool = new Map();
  let meta = { branch: '', cwd: '', model: '', session: '' };
  let thinkingBlocks = 0;
  let thinkingChars = 0;

  for (const r of records) {
    if (r.gitBranch) meta.branch = r.gitBranch;
    if (r.cwd) meta.cwd = r.cwd;
    if (r.sessionId) meta.session = r.sessionId;
    if (r.message && r.message.model) meta.model = r.message.model;

    if (r.type === 'user' && r.message) {
      const content = r.message.content;

      // A tool result comes back wearing the user role.
      if (Array.isArray(content)) {
        const results = content.filter(c => c && c.type === 'tool_result');
        if (results.length) {
          for (const res of results) {
            const pending = pendingTool.get(res.tool_use_id) || {};
            const label = pending.label;
            pendingTool.delete(res.tool_use_id);
            const body = contentText(res.content) || (typeof res.content === 'string' ? res.content : '');

            // Only a command has an outcome. Read, Grep and Glob return file
            // contents, and a README sentence containing the word "built" is
            // not a result — it just looks like one to a regular expression.
            const reports = REPORTING_TOOLS[pending.tool] === true && !pending.reading;
            const line = reports ? firstUseful(body) : '';
            const previous = beats[beats.length - 1];
            const duplicate = previous && previous.kind === 'result' && previous.text === line;
            if (line && !duplicate) {
              beats.push(beat('result', clip(line, 200), {
                tone: res.is_error ? 'bad' : (/0 failed|all checks passed|passed/i.test(line) ? 'good' : 'neutral'),
                at: label || undefined
              }));
            }
            const thought = reports ? inferThought(label, body, !!res.is_error) : null;
            if (thought) beats.push(thought);
          }
          continue;
        }
      }

      const said = contentText(content);
      if (said && !/^<(command-name|local-command|system-reminder)/.test(said.trim())) {
        beats.push(beat('brief', clip(said, 500), { speaker: 'director' }));
      }
      continue;
    }

    if (r.type === 'assistant' && r.message && Array.isArray(r.message.content)) {
      for (const block of r.message.content) {
        if (!block) continue;

        if (block.type === 'thinking') {
          thinkingBlocks++;
          thinkingChars += String(block.thinking || '').length;
          continue;                       // always empty on disk; see the header
        }
        if (block.type === 'text' && block.text && block.text.trim()) {
          beats.push(beat('say', clip(block.text, 420)));
        }
        if (block.type === 'tool_use') {
          const label = describeToolUse(block.name, block.input);
          pendingTool.set(block.id, {
            label: label,
            tool: block.name,
            // `cat file` is a Read wearing Bash's clothes: its output is file
            // contents, and a README line containing "built" is not a result.
            // Anchoring this to the start of the command missed the common
            // `cd somewhere && sed -n …`, so look anywhere — but stand down if
            // the line also runs something that genuinely reports.
            reading: block.name === 'Bash' &&
              /\b(cat|head|tail|less|bat|sed\s+-n)\b/.test(String((block.input || {}).command || '')) &&
              !/\b(node|npm|git|python3?|pytest|make|curl)\b/.test(String((block.input || {}).command || ''))
          });
          beats.push(beat('action', 'Now I ' + label + '.', { at: block.name }));
        }
      }
    }
  }

  return {
    beats,
    meta,
    thinking: { blocks: thinkingBlocks, chars: thinkingChars }
  };
}

// --- source 2: git -----------------------------------------------------------

function git(args) {
  try { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function fromGit(range) {
  const sep = '';
  const raw = git(['log', '--no-merges', '--date=short', `--pretty=%h${sep}%ad${sep}%s${sep}%b${sep}`, range || '-25']);
  if (!raw) return { beats: [], meta: {} };

  const beats = [];
  for (const entry of raw.split(sep + '\n').filter(Boolean)) {
    const [hash, date, subject, body] = entry.split(sep);
    if (!hash) continue;

    const stat = git(['show', '--stat', '--oneline', hash]).split('\n').filter(l => /\|\s+\d+/.test(l));
    const files = stat.length;

    beats.push(beat('action', `On ${date} I committed: ${subject}.`, { at: hash.trim() }));
    if (files) {
      beats.push(beat('result', `${files} file${files === 1 ? '' : 's'} changed.`, { at: hash.trim() }));
    }

    // The commit body is the closest thing to written-down reasoning there is.
    const reasoning = String(body || '').split('\n')
      .map(l => l.trim())
      .filter(l => l && !/^(Co-Authored-By|Claude-Session|Generated with|🤖)/i.test(l))
      .join(' ');
    if (reasoning) beats.push(beat('thought', clip(reasoning, 600), { at: hash.trim() }));
  }
  return { beats, meta: { branch: git(['rev-parse', '--abbrev-ref', 'HEAD']), head: git(['rev-parse', '--short', 'HEAD']) } };
}

// --- source 3: the suites, narrated ------------------------------------------

function run(cmd, args) {
  try {
    return { code: 0, out: execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout: 180000 }) };
  } catch (e) {
    return { code: e.status == null ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

/* Read the harness output the way a commentator reads a scoreboard. */
function narrateSuite(title, res) {
  const beats = [beat('action', `Running ${title}.`, { at: title })];
  const lines = res.out.split('\n');

  let section = '';
  for (const line of lines) {
    const heading = line.match(/^([A-Z][^-\n]{3,60})$/);
    if (heading && !/^\s/.test(line)) { section = heading[1].trim(); continue; }

    const fail = line.match(/^\s*FAIL\s+(.*)$/);
    if (fail) {
      beats.push(beat('verdict', `${section ? section + ': ' : ''}${fail[1]} — failed.`, { tone: 'bad', at: section }));
      continue;
    }
    const ok = line.match(/^\s*ok\s+(.*)$/);
    if (ok) {
      beats.push(beat('verdict', ok[1] + '.', { tone: 'good', at: section }));
      continue;
    }
  }

  const tally = res.out.match(/(\d+)\s+passed,\s+(\d+)\s+failed/);
  if (tally) {
    const [, p, f] = tally;
    beats.push(beat('result', `${title}: ${p} passed, ${f} failed.`, { tone: f === '0' ? 'good' : 'bad', at: title }));
    beats.push(beat('thought', f === '0'
      ? 'All of it green — though none of these assertions can hear anything, so this is correctness, not audio.'
      : `${f} still failing. That is the next thing to look at.`,
      { tone: f === '0' ? 'good' : 'bad', inferred: true }));
  } else if (/all checks passed/.test(res.out)) {
    beats.push(beat('result', `${title}: all checks passed.`, { tone: 'good', at: title }));
  } else if (res.code !== 0) {
    beats.push(beat('result', `${title} exited with code ${res.code}.`, { tone: 'bad', at: title }));
  }
  return beats;
}

function fromTests() {
  const beats = [beat('brief', 'Test mode. Run the suites and tell me what happened.', { speaker: 'director' })];

  const self = run('node', ['tools/selftest.js', '--verbose']);
  beats.push(...narrateSuite('the self-test', self));

  const build = run('node', ['tools/build.mjs']);
  const built = build.out.match(/built .*?\(([\d.]+ kB)\)/);
  beats.push(beat('action', 'Rebuilding the single-file page.', { at: 'build' }));
  if (built) beats.push(beat('result', `The page comes out at ${built[1]}.`, { tone: 'good', at: 'build' }));

  const page = run('node', ['tools/pagecheck.mjs']);
  beats.push(...narrateSuite('the page check', page));

  const failed = self.code !== 0 || page.code !== 0 || build.code !== 0;
  beats.push(beat('verdict', failed
    ? 'Not everything passed. The run is not clean.'
    : 'Everything passed. Segmentation, the probe logic, the wiring and a clean boot are all verified — and not one word of it was spoken out loud, because headless has no voices.',
    { tone: failed ? 'bad' : 'good', at: 'summary' }));

  return { beats, meta: { exit: failed ? 1 : 0 } };
}

// --- assemble ----------------------------------------------------------------

function capBeats(beats, limit) {
  if (beats.length <= limit) return beats;
  // Keep the opening and the ending; the middle is where repetition lives.
  const head = Math.ceil(limit * 0.4);
  const tail = limit - head - 1;
  return [
    ...beats.slice(0, head),
    beat('say', `Skipping ${beats.length - limit} steps in the middle.`, { tone: 'warn' }),
    ...beats.slice(beats.length - tail)
  ];
}

const script = {
  version: 1,
  title: 'Aloud — the making of',
  generated: new Date().toISOString(),
  modes: {}
};

const notes = [];

if (command === 'session' || command === 'all') {
  const file = positional[1] || findLatestSession();
  if (!file || !existsSync(file)) {
    notes.push('no session transcript found');
  } else {
    const { beats, meta, thinking } = fromSession(file);
    script.modes.dev = {
      label: 'Development',
      source: { kind: 'session', file: basename(file), branch: meta.branch, cwd: meta.cwd, model: meta.model },
      caveat: thinking.blocks && !thinking.chars
        ? `The transcript carries ${thinking.blocks} thinking blocks and every one is empty — Claude Code strips the text before writing to disk. What follows is reconstructed from the actions and their results, not a record of thought.`
        : '',
      beats: capBeats(beats, LIMIT)
    };
    notes.push(`session: ${beats.length} beats from ${basename(file)} (${thinking.blocks} thinking blocks, ${thinking.chars} chars retained)`);
  }
}

if (command === 'git' || command === 'all') {
  const { beats, meta } = fromGit(positional[1]);
  if (beats.length) {
    script.modes.history = {
      label: 'Commit history',
      source: Object.assign({ kind: 'git' }, meta),
      caveat: 'Commit messages are written down rather than inferred, so this mode is the closest thing here to the real reasoning.',
      beats: capBeats(beats, LIMIT)
    };
    notes.push(`git: ${beats.length} beats`);
  } else notes.push('git: nothing to read');
}

if (command === 'test' || command === 'all') {
  const { beats, meta } = fromTests();
  script.modes.test = {
    label: 'Test run',
    source: { kind: 'test', at: new Date().toISOString(), exit: meta.exit },
    caveat: 'Every verdict here is a real assertion from a real run, not a summary of one.',
    beats: capBeats(beats, LIMIT)
  };
  notes.push(`test: ${beats.length} beats, exit ${meta.exit}`);
}

if (!Object.keys(script.modes).length) {
  console.error('monologue: nothing to narrate — ' + notes.join('; '));
  process.exit(1);
}

const out = resolve(flags.out || join(ROOT, 'narration.json'));
writeFileSync(out, JSON.stringify(script, null, flags.pretty ? 2 : 0));

const total = Object.values(script.modes).reduce((n, m) => n + m.beats.length, 0);
console.log(`wrote ${out.replace(REPO + '/', '')}`);
console.log(`  modes: ${Object.keys(script.modes).join(', ')}`);
console.log(`  beats: ${total}`);
for (const n of notes) console.log('  ' + n);
