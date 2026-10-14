// 調査用：jsonl の局を再生し、ラウンドの頭ごとの収入・資源・繁栄トラックを出す
import fs from 'node:fs';
import { conditionByName, newGame, scoreTotal, step } from './core';
const [file, cfgFilter, seedFilter] = process.argv.slice(2);
for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
  const d = JSON.parse(l);
  if (cfgFilter && !cfgFilter.split(',').includes(d.config)) continue;
  if (seedFilter && String(d.seed) !== seedFilter) continue;
  let s = newGame(conditionByName('A'), d.seed);
  const rows: string[] = [];
  let r = 0;
  for (const id of d.moves) {
    if (s.round !== r && s.phase !== 'setup') {
      r = s.round;
      const p = s.players[0];
      rows.push(`R${r}:${scoreTotal(s)} g${p.res.gold} inc${p.income.gold}/${p.income.wheat}/${p.income.wood}/${p.income.iron} pr${p.pros.join('')} pl${p.played.length} au${p.automated.agr.length + p.automated.for.length + p.automated.min.length}`);
    }
    s = step(s, id);
  }
  console.log(d.config, d.seed, d.score, '|', rows.join(' | '), d.picks ? d.picks.join(',') : '');
}
