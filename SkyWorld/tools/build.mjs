/* Inline every stylesheet and script into one self-contained HTML file.
 *
 *   node tools/build.mjs            -> dist/skyward-reach.html
 *   node tools/build.mjs out.html   -> out.html
 *
 * The result opens from the filesystem with no server and no network access,
 * which is also what a strict-CSP host needs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(ROOT, 'dist', 'skyward-reach.html'));

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(ROOT, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(ROOT, src), 'utf8')}\n</script>`);

if (/<script src=|<link rel="stylesheet"/.test(html)) {
  console.error('build: an external reference survived inlining');
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${out} (${(html.length / 1024).toFixed(1)} kB)`);
