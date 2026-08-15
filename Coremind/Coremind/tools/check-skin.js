const fs = require('fs');
const files = ['style.css', 'index.html', 'js/organism.js', 'js/colony.js', 'js/render.js', 'js/ui.js', 'js/peel.js'];
let hits = [];
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  if (/#33e6b0/i.test(t)) hits.push(f + ' #33e6b0');
  if (/rgba\(\s*51,\s*230,\s*176/.test(t)) hits.push(f + ' teal rgba leftover');
  if (/rgba\(11,\s*20,\s*29/.test(t)) hits.push(f + ' navy leftover');
}
if (hits.length) { console.error(hits.join('\n')); process.exit(1); }
console.log('skin check ok');
