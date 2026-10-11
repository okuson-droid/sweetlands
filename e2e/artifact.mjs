// dist/index.html を Artifact の本文形式（doctype・html・head・body タグなし）にする
import fs from 'node:fs';
let h = fs.readFileSync('dist/index.html', 'utf8');
h = h.replace(/<!doctype html>/i, '').replace(/<\/?html[^>]*>/gi, '').replace(/<\/?head>/gi, '').replace(/<\/?body>/gi, '');
h = h.replace(/<meta charset="UTF-8" \/>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
const title = h.match(/<title>.*?<\/title>/)[0];
h = title + '\n' + h.replace(title, '');
fs.writeFileSync('dist/sweetlands.html', h.trim() + '\n');
console.log(fs.statSync('dist/sweetlands.html').size);
