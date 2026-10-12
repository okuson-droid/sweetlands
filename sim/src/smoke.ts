// 動作確認用：14キャラクターで1局ずつ v1 を回し、例外や異常がないことを確かめる
import { CHARACTERS } from '../../src/game/characters';
import { DEFAULT_AGENT } from './ai';
import { DEFAULT_WEIGHTS } from './evaluate';
import { Pool } from './pool';
const file = process.argv[2];
const kind = (process.argv[3] ?? 'v1') as 'v1';
(async () => {
  const pool = new Pool(4, file);
  const rs = await Promise.all(Object.keys(CHARACTERS).map((char, i) => pool.run({ cond: 'A', char, seed: 10001 + i, cfg: { ...DEFAULT_AGENT, kind, weights: DEFAULT_WEIGHTS }, aiSeed: 1 }).then((r) => `${char} ${r.score} ${Math.round(r.ms)}ms ${r.anomalies.join('/')}`, (e) => `${char} 例外 ${e.message.split('\n')[0]}`)));
  console.log(rs.join('\n'));
  await pool.close();
})();
