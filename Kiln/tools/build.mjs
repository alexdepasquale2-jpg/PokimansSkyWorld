/* Inline every stylesheet and script into one self-contained HTML file.
 *
 *   node tools/build.mjs            -> dist/kiln.html
 *   node tools/build.mjs out.html   -> out.html
 *
 * The result opens from the filesystem with no server and no network, which
 * is also what a strict-CSP host needs.
 *
 * The build also enforces the app's central privacy claim. Kiln tells its
 * users, in the Watchtower and in the Audit tab, that it makes no network
 * requests of any kind. That is a promise a stylesheet cannot keep and a
 * README cannot keep, so it is checked here: if a network API turns up in
 * the bundle, the build fails and the file is not written. A claim you have
 * not automated is a claim you have merely made.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(ROOT, 'dist', 'kiln.html'));

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(ROOT, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(ROOT, src), 'utf8')}\n</script>`);

if (/<script src=|<link rel="stylesheet"/.test(html)) {
  console.error('build: an external reference survived inlining');
  process.exit(1);
}

/* The no-network guarantee, checked rather than asserted. Comments are
 * stripped first so that prose *about* these APIs — of which this app has a
 * great deal, since explaining them is half its purpose — does not trip it. */
const code = html
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const BANNED = [
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/navigator\s*\.\s*sendBeacon/, 'navigator.sendBeacon'],
  [/new\s+WebSocket/, 'WebSocket'],
  [/new\s+EventSource/, 'EventSource'],
  [/import\s*\(/, 'dynamic import()'],
  [/<img[^>]+src\s*=\s*["']https?:/i, 'remote image'],
  [/@import\s+url\(/, 'CSS @import'],
  [/https?:\/\/(?!www\.w3\.org)/, 'an absolute http(s) URL']
];

let failed = false;
for (const [re, name] of BANNED) {
  const m = code.match(re);
  if (m) {
    const at = code.slice(0, m.index).split('\n').length;
    console.error(`build: found ${name} near line ${at} — Kiln promises its users it makes no network requests`);
    failed = true;
  }
}
if (failed) process.exit(1);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${out} (${(html.length / 1024).toFixed(1)} kB), no network APIs present`);
