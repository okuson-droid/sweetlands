// 特殊地形タイルが地図に置かれ、手札があり、プレイしたカードがある局面の記録を作る（見た目の確認用）
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { nextRandom } from '../src/game/rng';
const [players, seed] = process.argv.slice(2).map(Number);
const config = { players, names: ['いちご', 'みかん', 'ぶどう', 'ミント'].slice(0, players), variants: { turnOrder: false, draft: false, advSkills: true } };
let s = createGame(config, seed);
let r = seed;
const moves: string[] = [];
const done = () => s.round >= 3 && s.pending?.step === 'turn' && !s.turnMainDone && s.pending.player === 0 && s.players[0].hand.length >= 4 && s.players[0].played.length >= 2 && Object.values(s.players[0].hexes).some((h) => h.tile?.kind === 'special');
for (let i = 0; i < 6000 && !s.finished && !done(); i++) {
  const o = getOptions(s);
  const [x, n] = nextRandom(r);
  r = n;
  // 特殊地形ヘクスへ置ける手があれば優先する
  const sp = o.filter((k) => k.id.includes('special'));
  const non = o.filter((k) => !['stop', 'skip', 'pass'].includes(k.id) && !k.id.startsWith('fa'));
  const pickFrom = sp.length ? sp : non.length && x < 0.93 ? non : o;
  const ch = pickFrom[Math.floor(x * 9973) % pickFrom.length];
  moves.push(ch.id);
  s = applyMove(s, ch.id);
}
console.error('round', s.round, 'done', done());
console.log(JSON.stringify({ config, seed, moves }));
