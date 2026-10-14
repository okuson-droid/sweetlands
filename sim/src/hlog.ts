// 調査用：記録（初期シードと手の列）を再生し、ラウンドの頭の状態と、手番の行動・細かい選択を1行ずつ出す
import fs from 'node:fs';
import { createGame, applyMove, getOptions } from '../../src/game/engine';
import { scoreTotal } from './core';
const rec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let s = createGame(rec.config, rec.seed);
let r = 0;
for (const id of rec.moves) {
  if (s.round !== r) { const p = s.players[0]; console.log(`=== R${s.round} score=${s.phase==='setup'?0:scoreTotal(s)} res=${JSON.stringify(p.res)} inc=${JSON.stringify(p.income)} pros=${p.pros} food=${p.food} hand=${p.hand.length} discs=${p.discs}`); r = s.round; }
  const st = s.pending?.step;
  const lab = getOptions(s).find((o) => o.id === id)?.label ?? id;
  if (st === 'turn' && id !== 'endTurn') console.log(`${id}｜${lab}`);
  else if (st !== 'turn') console.log(`   [${st}] ${lab}`);
  s = applyMove(s, id);
}
console.log('final', scoreTotal(s));
