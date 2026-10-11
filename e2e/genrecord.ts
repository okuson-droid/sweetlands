// 途中局面の記録を作る（見た目の確認用）
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { nextRandom } from '../src/game/rng';
const [players, seed, round] = process.argv.slice(2).map(Number);
const config = { players, names: ['いちご', 'みかん', 'ぶどう', 'ミント'].slice(0, players), variants: { turnOrder: false, draft: false, advSkills: true } };
let s = createGame(config, seed);
let r = seed;
const moves: string[] = [];
while (!s.finished && !(s.round >= round && s.pending?.step === 'turn' && !s.turnMainDone && s.players.every((p) => !p.passed))) {
  const o = getOptions(s);
  const [x, n] = nextRandom(r);
  r = n;
  const non = o.filter((k) => !['stop', 'skip', 'pass'].includes(k.id) && !k.id.startsWith('fa'));
  const pickFrom = non.length && x < 0.93 ? non : o;
  const ch = pickFrom[Math.floor(x * 9973) % pickFrom.length];
  moves.push(ch.id);
  s = applyMove(s, ch.id);
}
console.log(JSON.stringify({ config, seed, moves }));
