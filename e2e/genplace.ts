// 地形タイルか道駒を置ける局面の記録を作る（レイアウト案の画面確認用）
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { nextRandom } from '../src/game/rng';
import { buildAffordances } from '../src/ui/gestures';
const [players, seed, minRound] = process.argv.slice(2).map(Number);
const config = { players, names: ['いちご', 'みかん', 'ぶどう', 'ミント'].slice(0, players), variants: { turnOrder: false, draft: false, advSkills: true } };
let s = createGame(config, seed);
let r = seed;
const moves: string[] = [];
for (let i = 0; i < 5000 && !s.finished; i++) {
  if (s.round >= minRound && s.pending?.player === 0) {
    const keys = [...buildAffordances(s).drags.keys()];
    if (keys.some((k) => k.startsWith('tile:'))) break;
  }
  const o = getOptions(s);
  const [x, n] = nextRandom(r);
  r = n;
  const non = o.filter((k) => !['stop', 'skip', 'pass'].includes(k.id) && !k.id.startsWith('fa'));
  const pickFrom = non.length && x < 0.93 ? non : o;
  const ch = pickFrom[Math.floor(x * 9973) % pickFrom.length];
  moves.push(ch.id);
  s = applyMove(s, ch.id);
}
console.error('round', s.round, 'step', s.pending?.step, 'keys', [...buildAffordances(s).drags.keys()].join(','));
console.log(JSON.stringify({ config, seed, moves }));
