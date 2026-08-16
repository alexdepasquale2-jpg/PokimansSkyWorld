/* Inline every stylesheet and script into one self-contained HTML file.
 *
 *   node tools/build.mjs                       -> dist/doomspire.html
 *   node tools/build.mjs out.html              -> out.html
 *   node tools/build.mjs --fragment out.html   -> same, without the document
 *                                                 wrapper
 *
 * The result opens from the filesystem with no server and no network access
 * — which is also what an Android WebView shell (Capacitor/Cordova/Trusted
 * Web Activity) needs: point it at one HTML file and it's the whole game.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const target = args.find(a => !a.startsWith('--'));
const out = resolve(target || join(ROOT, 'dist', fragment ? 'doomspire.fragment.html' : 'doomspire.html'));

let html = readFileSync(join(ROOT, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(ROOT, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(ROOT, src), 'utf8')}\n</script>`);

if (/<script src=|<link rel="stylesheet"/.test(html)) {
  console.error('build: an external reference survived inlining');
  process.exit(1);
}

if (fragment) {
  const title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  const styles = html.match(/<style>[\s\S]*?<\/style>/g) || [];
  html = [title, ...styles, body].join('\n');
  if (/<\/?(html|head|body)\b|<!DOCTYPE/i.test(html)) {
    console.error('build: a document-level tag survived the fragment build');
    process.exit(1);
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${out} (${(html.length / 1024).toFixed(1)} kB)`);
