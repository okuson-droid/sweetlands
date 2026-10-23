// 調査用：v1 の局の第5ラウンドの頭で、計画器の計画（手の列と見込みの得点）を出す
import { installFastClone } from '../fastclone';
installFastClone();
import fs from 'node:fs';
import { Agent, DEFAULT_AGENT } from './ai';
import { conditionByName, determinize, newGame, Rng, scoreTotal, step } from './core';
const seed = Number(process.argv[2] ?? 58);
const d = fs.readFileSync('out/s0/games.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((x) => x.seed === seed);
const w = JSON.parse(fs.readFileSync('reports/pilot/weights/v1_eri_B.json', 'utf8')).weights;
let s = newGame(conditionByName('A'), seed);
const v1r5: string[] = [];
for (const id of d.moves) {
  if (s.phase === 'action' && s.round === 5 && s.pending?.step === 'turn' && v1r5.length === 0) v1r5.push('START');
  if (v1r5.length === 0) s = step(s, id);
  else v1r5.push(id);
}
const p = s.players[0];
console.log(`seed ${seed} 第5R頭 得点 ${scoreTotal(s)} 手札 ${p.hand.length} 資源 ${JSON.stringify(p.res)} ダイヤ ${p.diamond} ディスク ${p.discs}`);
console.log('v1 の第5R（最終', d.score, '）:', v1r5.slice(1).filter((x) => !x.startsWith('basic') && !x.startsWith('hex') && !x.startsWith('edge')).join(' '));
const a = new Agent({ ...DEFAULT_AGENT, kind: 'v1', weights: w, planR5: { W: 4, E: 6 } }, seed);
const real = a.planR5(s);
console.log('実際の山札での計画', real.score, real.path.join(' '));
for (let k = 0; k < 3; k++) {
  const r = a.planR5(determinize(s, new Rng(100 + k)));
  console.log(`決定化${k}での計画`, r.score, r.path.join(' '));
}
