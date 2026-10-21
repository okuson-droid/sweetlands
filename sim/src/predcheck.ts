// 調査用：jsonl の局を再生し、各ラウンドの頭の評価値（第3版・第1版）と最終得点を並べる（評価の楽観・悲観の偏りを見る）
import fs from 'node:fs';
import { conditionByName, newGame, scoreTotal, step } from './core';
import { DEFAULT_PARAMS3, eval3, projection } from './evaluate3';
import { baseEval } from './evaluate';
const [file, wfile] = process.argv.slice(2);
const w3 = wfile ? JSON.parse(fs.readFileSync(wfile, 'utf8')).weights : DEFAULT_PARAMS3;
const w1 = JSON.parse(fs.readFileSync('reports/pilot/weights/v1_eri_B.json', 'utf8')).weights;
const sum: number[][] = [[], [], [], [], [], []];
for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
  const d = JSON.parse(l);
  let s = newGame(conditionByName('A'), d.seed);
  let r = 0;
  const row: string[] = [];
  for (const id of d.moves) {
    if (s.phase === 'action' && s.pending?.step === 'turn' && s.round !== r) {
      r = s.round;
      const e3 = eval3(s, w3);
      row.push(`R${r} 得点${scoreTotal(s)} 第3版${e3.toFixed(0)} 第1版${baseEval(s, w1).toFixed(0)}`);
      sum[r].push(e3 - d.score);
      if (process.env.TRACE_SEED === String(d.seed) && process.env.TRACE_R === String(r)) {
        const t: string[] = [];
        projection(s, w3, t);
        const p = s.players[0];
        console.log(`[trace] seed ${d.seed} R${r} 手札 ${p.hand.join(',')} 資源 ${JSON.stringify(p.res)} ダイヤ${p.diamond} 繁栄 ${p.pros} 食料${p.food}\n` + t.join('\n'));
      }
    }
    s = step(s, id);
  }
  console.log(`seed ${d.seed} 最終 ${d.score} | ${row.join(' | ')}`);
}
console.log('第3版 − 最終得点 の平均（ラウンドの頭ごと）', sum.slice(1).map((a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)).join(' / '));
