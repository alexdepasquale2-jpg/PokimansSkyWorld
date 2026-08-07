/* Inline everything into one file, twice.
 *
 *   node tools/build.mjs
 *     -> dist/aloud.html      a complete document; opens from the filesystem,
 *                             copies to a phone, works with the network off
 *     -> dist/artifact.html   the same page as a body fragment, because the
 *                             Artifact host supplies its own doctype and head
 *
 * Same source for both. A strict-CSP host blocks every external request, so
 * the build fails rather than ship a page that silently loses its stylesheet.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(ROOT, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(ROOT, src), 'utf8')}\n</script>`);

if (/<script[^>]+src=|<link[^>]+href=/.test(html)) {
  console.error('build: an external reference survived inlining');
  process.exit(1);
}

// --- the fragment ------------------------------------------------------------
// Title and stylesheet come along; the doctype, <html>, <head> and <body> do
// not, because the host writes those itself.

const style = html.match(/<style>[\s\S]*?<\/style>/);
const title = html.match(/<title>([\s\S]*?)<\/title>/);
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/);

if (!style || !title || !body) {
  console.error('build: could not find the title, style or body to lift out');
  process.exit(1);
}

const fragment = [
  `<title>${title[1]}</title>`,
  style[0],
  body[1].trim(),
  ''
].join('\n');

// The lookahead matters: <header> is legitimate content, <head> is not.
if (/<!DOCTYPE|<html(?![a-z])|<head(?![a-z])|<body(?![a-z])/i.test(fragment)) {
  console.error('build: the fragment still carries document structure');
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, 'aloud.html'), html);
writeFileSync(join(DIST, 'artifact.html'), fragment);

const kb = (s) => (s.length / 1024).toFixed(1) + ' kB';
console.log(`built dist/aloud.html    (${kb(html)})`);
console.log(`built dist/artifact.html (${kb(fragment)})`);
