// 評価関数（sim/PLAN.md §6.3）：今ゲームが終わった場合の得点＋資源・収入の見込み＋盤面の見込み。
// キャラクター固有の知識は持たせない（時計塔駒の条件の進み具合は、キャラクターのデータから一般的な形で読む）。
import { CHARACTERS, type ClockReq } from '../../src/game/characters';
import { buildingCount, cities, neighbors, passedIp, playedCount, terrainCount, virtualAreas } from '../../src/game/queries';
import { hexKey, neighborCoords } from '../../src/game/geometry';
import type { GameState, PlayerState } from '../../src/game/types';
import { scoreTotal } from './core';

/** 重みの名前（並びが重みベクトルの添字） */
export const WEIGHT_NAMES = [
  'gold', // 0 ゴールド
  'wheat', // 1 麦
  'wood', // 2 木材
  'iron', // 3 鉄
  'diamond', // 4 ダイヤ（得点の1点に上乗せする分）
  'hand', // 5 手札の枚数
  'discs', // 6 手元のアクションディスク
  'incGold', // 7 ゴールドの収入値 × 残りの収入フェイズ数
  'incWheat', // 8
  'incWood', // 9
  'incIron', // 10
  'passGain', // 11 いまパスしたときに得る得点 × 残りのパスの回数（上位の候補だけで計算する）
  'unflipped', // 12 表向きの地形タイル（裏返すと効果を得る）
  'openTiles', // 13 建物駒の置かれていない地形タイル（建物駒の置き場の目安）
  'cities', // 14 都市の数
  'buildings', // 15 建物駒の数
  'food', // 16 食料トラックの位置
  'industry', // 17 工業マーカーの位置（貨車＋機関車）
  'pros', // 18 繁栄トラックの歩数の合計
  'clock', // 19 時計塔駒の条件の進み具合（0〜1、置いたら1）
  'automated', // 20 オートメーション化したカード × 残りの収入フェイズ数
  'played', // 21 手元のカード
  'skills', // 22 スキルタイル
  'rabbits', // 23 地図上のクッキーラビット駒
  'roads', // 24 道駒
  'portReach', // 25 港までの近さ：港ごとに、首都から地形タイルでつなぐのに要る残りの枚数（上限6）の合計にマイナスを付けたもの
] as const;
export type Weights = number[];

/** 初期値（調整の出発点）。単位はおおよその勝利点 */
export const DEFAULT_WEIGHTS: Weights = [0.1, 0.4, 0.4, 0.4, 0.3, 1.0, 1.0, 0.15, 0.4, 0.4, 0.4, 0.8, 0.5, 0.3, 1.0, 0.5, 0.4, 0.4, 0.2, 4.0, 0.3, 0.3, 0.5, 0.5, 0.2, 2.5];

/** 収入フェイズがあと何回あるか（5ラウンド制） */
export function incomesLeft(s: GameState): number {
  if (s.phase === 'setup') return 5;
  return 5 - s.round;
}

/** パスがあと何回あるか（このラウンドでまだパスしていなければ、このラウンドの分を含む） */
export function passesLeft(s: GameState): number {
  if (s.finished) return 0;
  const p = s.players[0];
  const thisRound = s.phase === 'setup' || ((s.phase === 'action' || s.phase === 'income' || s.phase === 'start') && !p.passed) ? 1 : 0;
  return 5 - s.round + thisRound;
}

function reqProgress(p: PlayerState, r: ClockReq): number {
  const f = (have: number, need: number) => Math.min(1, have / need);
  switch (r.k) {
    case 'terrain':
      return f(terrainCount(p, r.kind), r.n);
    case 'bld':
      return f(buildingCount(p, r.type), r.n);
    case 'played':
      return f(r.row === 'any' ? playedCount(p) : playedCount(p, r.row), r.n);
    case 'food':
      return f(p.food, r.n);
    case 'ipPassed':
      return f(passedIp(p), r.n);
    case 'wonder':
      return f(p.wonders, 1);
  }
}

/** 時計塔駒の条件の進み具合：条件の枠ごとに（「／」はよいほう）達成率を出し、平均する */
export function clockProgress(p: PlayerState): number {
  if (p.clockPlaced) return 1;
  if (!p.character) return 0;
  const groups = CHARACTERS[p.character].clock;
  return groups.reduce((a, alts) => a + Math.max(...alts.map((r) => reqProgress(p, r))), 0) / groups.length;
}

/** 地図の面ごとの隣接表（ヘクスの並びは initialHexes と同じ。評価のたびに隣を計算し直さないため） */
interface MapGraph {
  keys: string[];
  nbr: number[][];
  capitals: number[];
  portAdj: number[][];
}
const GRAPHS = new Map<string, MapGraph>();
function graphOf(p: PlayerState): MapGraph {
  const id = p.mapId!;
  let g = GRAPHS.get(id);
  if (g) return g;
  const keys = Object.keys(p.hexes);
  const index = new Map(keys.map((k, i) => [k, i]));
  const nbr = keys.map((k) => neighbors(p, k).map((n) => index.get(n)!));
  const capitals = keys.flatMap((k, i) => (p.hexes[k].terrain === 'C' ? [i] : []));
  const portAdj = virtualAreas(id).ports.map(([r, c]) => neighborCoords(r, c).flatMap(([a, b]) => (index.has(hexKey(a, b)) ? [index.get(hexKey(a, b))!] : [])));
  g = { keys, nbr, capitals, portAdj };
  GRAPHS.set(id, g);
  return g;
}

/** 港ごとに、首都とつなぐのに要る地形タイルの残りの枚数（0-1 BFS。タイルのあるヘクスは0、ないヘクスは1） */
export function portDistances(p: PlayerState): number[] {
  if (!p.mapId) return [];
  const g = graphOf(p);
  const n = g.keys.length;
  const cost = g.keys.map((k) => (p.hexes[k].tile ? 0 : 1));
  const dist = new Array<number>(n).fill(Infinity);
  const dq: number[] = new Array(n * 4);
  let head = n * 2;
  let tail = n * 2;
  for (const c of g.capitals) {
    dist[c] = 0;
    dq[tail++] = c;
  }
  while (head < tail) {
    const u = dq[head++];
    for (const v of g.nbr[u]) {
      if (g.capitals.includes(v)) continue;
      const nd = dist[u] + cost[v];
      if (nd < dist[v]) {
        dist[v] = nd;
        if (cost[v] === 0) dq[--head] = v;
        else dq[tail++] = v;
      }
    }
  }
  return g.portAdj.map((adj) => Math.min(Infinity, ...adj.map((i) => dist[i])));
}

/** 評価の特徴量（passGain は呼び出し側で別に足すため 0 にしておく） */
export function features(s: GameState): number[] {
  const p = s.players[0];
  const L = incomesLeft(s);
  const live = passesLeft(s) > 0 ? 1 : 0;
  let unflipped = 0;
  let openTiles = 0;
  let rabbits = 0;
  for (const h of Object.values(p.hexes)) {
    if (h.tile && !h.tile.flipped) unflipped++;
    if (h.tile && !h.building) openTiles++;
    if (h.rabbit) rabbits++;
  }
  // クリーンナップ中の手札は1枚しか残らない
  const hand = s.phase === 'cleanup' ? Math.min(1, p.hand.length) : p.hand.length;
  const automated = p.automated.agr.length + p.automated.for.length + p.automated.min.length;
  return [
    p.res.gold * live,
    p.res.wheat * live,
    p.res.wood * live,
    p.res.iron * live,
    p.diamond * live,
    hand * live,
    p.discs * live,
    p.income.gold * L,
    p.income.wheat * L,
    p.income.wood * L,
    p.income.iron * L,
    0,
    unflipped * live,
    openTiles * live,
    cities(p).length * live,
    buildingCount(p) * live,
    p.food * live,
    (p.carriage + (p.loco ?? 0)) * live,
    p.pros.reduce((a, b) => a + b, 0) * live,
    clockProgress(p) * live,
    automated * L,
    p.played.length * live,
    p.skills.length * live,
    rabbits * live,
    p.roads.length * live,
    -portDistances(p).reduce((a, d) => a + Math.min(6, d), 0) * live,
  ];
}

/** 基本の評価値：今ゲームが終わった場合の得点＋重み付きの特徴量。終局ではちょうど得点になる */
export function baseEval(s: GameState, w: Weights): number {
  const score = scoreTotal(s);
  if (s.finished) return score;
  const f = features(s);
  let v = score;
  for (let i = 0; i < f.length; i++) v += w[i] * f[i];
  return v;
}
