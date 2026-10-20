// 調査用：記録ファイルの現在局面の地図を文字で出す（LLM プレイヤーの補助）
import fs from 'node:fs';
import { createGame } from '../../src/game/engine';
import { step } from './core';
import { hexEdges, parseHexKey, hexKey, neighborCoords } from '../../src/game/geometry';
import { legalRoadEdges, hexesOnEdge } from '../../src/game/queries';
const rec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let s = createGame(rec.config, rec.seed);
for (const id of rec.moves) s = step(s, id);
const p = s.players[0];
const roads = new Set(p.roads);
for (let r = 0; r <= 6; r++) {
  let line = r % 2 ? ' ' : '';
  for (let c = 0; c <= 14; c++) {
    const k = hexKey(r, c);
    const h = p.hexes[k];
    if (!h) { line += (c % 2 === r % 2) ? '      ' : ''; continue; }
    const rd = hexEdges(r, c).filter((e) => roads.has(e)).length;
    const t = h.tile ? (h.tile.flipped ? 'X' : 'o') : '.';
    const b = h.building ? h.building.slice(0, 1) : '-';
    line += `${String(c).padStart(2)}${h.terrain}${t}${b}${rd}${h.rabbit ? 'R' : ' '}`.padEnd(6);
  }
  console.log(String(r) + ' ' + line);
}
console.log('roads', p.roads.length, 'legal road edges that would flip an unflipped tile:');
for (const e of legalRoadEdges(p)) {
  const hx = hexesOnEdge(p, e).filter((k) => p.hexes[k].tile && !p.hexes[k].tile!.flipped);
  if (hx.length) console.log(' ', e, '->', hx.join(' '));
}
console.log('buildings', Object.entries(p.hexes).filter(([, h]) => h.building).map(([k, h]) => `${k}:${JSON.stringify(h.building)}`).join(' '));
console.log('all legal edges -> hexes');
for (const e of legalRoadEdges(p)) console.log(' ', e, '->', hexesOnEdge(p, e).map((k) => `${k}${p.hexes[k].tile ? (p.hexes[k].tile!.flipped ? 'X' : 'o') : '.'}`).join(' '));
