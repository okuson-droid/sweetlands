// 調査用：記録を再生できるか、終局の得点と第5ラウンドの頭の得点を出す
import fs from 'node:fs';
import { createGame } from '../../src/game/engine';
import { scoreTotal, step } from './core';
for (const f of process.argv.slice(2)) {
  const rec = JSON.parse(fs.readFileSync(f, 'utf8'));
  let s = createGame(rec.config, rec.seed);
  let r5: number | null = null;
  try {
    for (const id of rec.moves) {
      if (r5 === null && s.phase === 'action' && s.round === 5 && s.pending?.step === 'turn') r5 = scoreTotal(s);
      s = step(s, id);
    }
    console.log(f, 'OK', s.players[0].character, s.players[0].mapId, 'R5頭', r5, '終局', s.finished ? scoreTotal(s) : '未終局', JSON.stringify(rec.config.variants));
  } catch (e) {
    console.log(f, 'NG', (e as Error).message);
  }
}
