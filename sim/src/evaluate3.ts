// 評価関数の第3版（計画書追補 2026-10-20 §4 段階1）：確定得点 ＋ 残りのラウンドの収支の見込み ＋ 盤面の線形項。
// V ＝ 確定得点 ＋ Σ_r γ^(r−今) × Proj_r ＋ 線形項（passGain の項は ai.ts で足す）
// Proj_r は、ラウンド r に使える資源（手持ち＋収入）と主行動の回数で、アクションエリアと手札のカードを
// 「行動1回あたりの勝利点」の高い順に貪欲に選んだときの勝利点である。資源の価値は、残りの主行動で変換できる分に限る
// （要件A。最終ラウンドの使い残しの基礎資源は0点、ゴールドは5につき1点のまま）。
// キャラクター固有の知識は持たない。変換の表は AREAS・PROS_TRACKS・カードのデータから機械的に作る。
import { AREAS, PROS_TRACKS, ROUND2_AREAS, ROUND3_AREAS } from '../../src/game/boards';
import { CARDS } from '../../src/game/cards';
import { cardCost, pieceCostAt, type Piece } from '../../src/game/engine';
import { buildingCount, condTimes, terrainCount } from '../../src/game/queries';
import type { Eff, GameState, PlayerState } from '../../src/game/types';
import { scoreTotal } from './core';
import { features, passesLeft, type Weights } from './evaluate';

/** 第3版のパラメータの名前（並びがパラメータの添字） */
export const PARAM3_NAMES = [
  'gamma', // 0 将来のラウンドの割引
  'aNext', // 1 次のラウンド以降の主行動の回数
  'cJ', // 2 手札にない将来のカード1枚をプレイしたときの勝利点（コストは平均のゴールド）。J で引いたカードは主行動2回として数える
  'portReach', // 3 以下、第1版と同じ特徴量の線形項
  'unflipped', // 4
  'openTiles', // 5
  'cities', // 6
  'clock', // 7
  'discs', // 8
  'hand', // 9 クリーンナップで残す1枚
  'passGain', // 10 いまパスしたときに得る得点 × 残りのパスの回数（ai.ts で足す）
  'rho', // 11 繁栄トラックが1ラウンドに進む歩数の見込み。駒を置く価値は、残りのラウンドでこの歩数だけ進んだ位置のレートで見る
  'kappa', // 12 繁栄トラックの対象（駒など）が1ラウンドに増える数の見込み。トラックを1歩進める価値は、残りのラウンドでこの数だけ増えた対象の数で見る
] as const;

/** 初期値：γ 0.8、A_next 7、c_J 4、線形項は v1 追加調整 B の値（ディスクは主行動の回数に入るため0）、ρ 1、κ 1.5 */
export const DEFAULT_PARAMS3: Weights = [0.8, 7, 4, 0.8416, 0.6237, 0.2899, 0.8087, 4.9477, 0, 1.744, 0.7451, 1, 1.5];

/** 食料トラック1歩の価値（クッキーラビット駒1個分のレートに対する比）。食料はラビット駒を置ける数の上限を1つ上げる */
const FOOD_SHARE = 0.5;
/** 主行動の前に使える両替の回数の上限（ai.ts の MAX_CONVERSIONS と同じ） */
const MAX_CONVERSIONS = 6;
const FA3_GOLD = 4;
/** 市民カード207枚のコストの平均（ゴールド）。手札にない将来のカードのコストに使う */
const AVG_CARD_COST = Object.values(CARDS).reduce((a, c) => a + c.cost, 0) / Object.keys(CARDS).length;
const BASICS = ['wheat', 'wood', 'iron'] as const;
type Basic = (typeof BASICS)[number];

/** 繁栄トラック i の、位置 pos での対象1つあたりの勝利点 */
function rateAt(i: number, pos: number): number {
  const tr = PROS_TRACKS[i];
  if (pos <= 0) return 0;
  const seg = pos >= tr.length ? 2 : pos <= tr.seg1End ? 0 : 1;
  const [per, vp] = tr.rates[seg];
  return vp / per;
}

/** 見込みの計算に使う、仮の盤面の状態（数だけを持つ） */
interface Sim {
  gold: number;
  wheat: number;
  wood: number;
  iron: number;
  diamond: number;
  pros: number[];
  /** 繁栄トラックの対象の数（地形タイル・ラビット・道・建物・オートメーション・工業点） */
  count: number[];
  food: number;
  unflipped: number;
  /** 建物駒を置ける場所（裏返したタイルと首都の空き） */
  spots: number;
  /** 次に置く建物駒の費用（最も安いもの。以後も同じとみなす） */
  bld: { wood: number; iron: number } | null;
  /** 駒を置く価値に使う、繁栄トラックの見込みの位置の上乗せ（ρ × 残りのラウンド数。ラウンドごとに設定する） */
  ahead: number;
  /** トラックを進める価値に使う、対象の数の見込みの上乗せ（κ × 残りのラウンド数。ラウンドごとに設定する） */
  aheadCount: number;
  /** 変換で増えた主行動の回数（J で引いたカード） */
  bonusA: number;
  /** 最終ラウンドの見込みか（食料の価値を「置けるラビット駒が増える分」に限る） */
  finalRound: boolean;
  /** 収入（裏返しで増える） */
  income: { gold: number; wheat: number; wood: number; iron: number };
  /** 計画の中で得た、繁栄トラックとゴールド・ダイヤ以外の勝利点（カードの効果の見積もり） */
  vp: number;
}

/** 仮の盤面の得点（繁栄トラックのレート × 対象の数（端数を切り捨てない）＋ゴールド5につき1点＋ダイヤ＋計画の中の勝利点）。
 *  見込みは、計画を打ち終えた仮の盤面とこの値の差で数える（行動の価値の見積もりは計画の順番を決めるだけに使う） */
function endScore(m: Sim): number {
  let v = m.vp + m.gold / 5 + m.diamond;
  for (let i = 0; i < 6; i++) v += rateAt(i, m.pros[i]) * m.count[i];
  return v;
}

/** 駒（対象）1つの価値：繁栄トラック i が見込みの位置まで進んだときのレート。今のレートが0でも、後で進めれば点になる */
function pieceRate(m: Sim, i: number): number {
  return rateAt(i, Math.min(PROS_TRACKS[i].length, m.pros[i] + m.ahead));
}

function simOf(s: GameState): Sim {
  const p = s.players[0];
  let unflipped = 0;
  let spots = 0;
  let rabbits = 0;
  for (const h of Object.values(p.hexes)) {
    if (h.tile && !h.tile.flipped) unflipped++;
    if (!h.building && (h.terrain === 'C' || h.tile?.flipped)) spots++;
    if (h.rabbit) rabbits++;
  }
  return {
    gold: p.res.gold,
    wheat: p.res.wheat,
    wood: p.res.wood,
    iron: p.res.iron,
    diamond: p.diamond,
    pros: [...p.pros],
    count: [terrainCount(p, 'any'), rabbits, p.roads.length, buildingCount(p), p.automated.agr.length + p.automated.for.length + p.automated.min.length, p.score.ip],
    food: p.food,
    unflipped,
    spots,
    bld: cheapestPiece(s, p),
    ahead: 0,
    aheadCount: 0,
    bonusA: 0,
    finalRound: false,
    income: { ...p.income },
    vp: 0,
  };
}

/** 置ける建物駒のうち、最も安いものの費用（木材＋鉄の合計で比べる） */
function cheapestPiece(s: GameState, p: PlayerState): { wood: number; iron: number } | null {
  const pieces: [Piece, number][] = [];
  for (const b of ['tent', 'house', 'bldg'] as const) if (p.taken[b] < 5) pieces.push([b, p.taken[b]]);
  if (p.taken.lab < 4) pieces.push(['lab', p.taken.lab]);
  for (const r of ['agr', 'for', 'min'] as const) if (!p.shopsTaken.includes(r)) pieces.push([`shop:${r}`, 0]);
  let best: { wood: number; iron: number } | null = null;
  for (const [pc, idx] of pieces) {
    const c = pieceCostAt(s, p, pc, idx);
    const x = { wood: c.wood ?? 0, iron: c.iron ?? 0 };
    if (!best || x.wood + x.iron < best.wood + best.iron) best = x;
  }
  return best;
}

/** 繁栄トラック i を1歩進めたときの勝利点の増え方（対象の数は、今の数に残りのラウンドで増える見込みを足したもの） */
function prosStepGain(m: Sim, i: number): number {
  return (rateAt(i, m.pros[i] + 1) - rateAt(i, m.pros[i])) * (m.count[i] + m.aheadCount);
}
function bestProsStep(m: Sim): { i: number; vp: number } {
  let best = { i: 0, vp: -Infinity };
  for (let i = 0; i < 6; i++) {
    if (m.pros[i] >= PROS_TRACKS[i].length) continue;
    // 右端のマスに入るにはダイヤ1個が要る（ダイヤ1個＝1点を失う）
    const toEnd = m.pros[i] + 1 >= PROS_TRACKS[i].length;
    if (toEnd && m.diamond < 1) continue;
    const vp = prosStepGain(m, i) - (toEnd ? 1 : 0);
    if (vp > best.vp) best = { i, vp };
  }
  return best.vp === -Infinity ? { i: -1, vp: 0 } : best;
}

/** 繁栄トラック i を1歩進める（右端のマスに入るときはダイヤ1個を払う） */
function advancePros(m: Sim, i: number): void {
  if (m.pros[i] + 1 >= PROS_TRACKS[i].length) m.diamond--;
  m.pros[i]++;
}

/** アクションエリア1回分の変換 */
interface Conv {
  id: string;
  cost: { gold?: number; wheat?: number; wood?: number; iron?: number; diamond?: number };
  /** 変換を実際に行う（m を書き換え、得た勝利点を返す。できなければ null） */
  apply: (m: Sim, ctx: Ctx) => number | null;
}

/** 1ラウンドの見込みの計算に共通の値 */
interface Ctx {
  /** 裏返し1回の価値（収入+1 か 繁栄1歩のよいほう）の目安 */
  flip: number;
  /** 基礎資源1個の価値の目安と、残りの収入フェイズ数（裏返しで収入と繁栄のどちらを選ぶかに使う） */
  unit: number;
  incomeLeft: number;
  /** カード1枚の価値 */
  cJ: number;
}

/** 裏返し1回：収入+1（最も少ない基礎資源）と繁栄トラック1歩の、見積もりの高いほうを計画に入れる */
const flipOnce = (m: Sim, ctx: Ctx) => {
  const inc = ctx.unit * ctx.incomeLeft;
  const pr = bestProsStep(m);
  if (pr.i >= 0 && pr.vp >= inc) {
    advancePros(m, pr.i);
    return pr.vp;
  }
  const b = BASICS.reduce((a, x) => (m.income[x] < m.income[a] ? x : a), BASICS[0] as Basic);
  m.income[b]++;
  return inc;
};
const flipN = (m: Sim, n: number, ctx: Ctx) => {
  const k = Math.min(n, m.unflipped);
  m.unflipped -= k;
  m.spots += k;
  let vp = 0;
  for (let i = 0; i < k; i++) vp += flipOnce(m, ctx);
  return vp;
};
const tiles = (m: Sim, n: number) => {
  const vp = n * pieceRate(m, 0);
  m.count[0] += n;
  m.unflipped += n;
  return vp;
};
const roads = (m: Sim, n: number, ctx: Ctx) => {
  const vp = n * pieceRate(m, 2);
  m.count[2] += n;
  return vp + flipN(m, n, ctx);
};
const rabbits = (m: Sim, n: number) => {
  // ラビット駒 i（0 から）は食料 4+i 以上で置ける
  const cap = Math.max(0, m.food - 3 - m.count[1]);
  const k = Math.min(n, cap);
  if (k === 0) return null;
  m.count[1] += k;
  return k * pieceRate(m, 1);
};
const food = (m: Sim, n: number) => {
  // 最終ラウンドでは、置けるラビット駒の上限が増える分だけに価値がある（ラビット駒 i は食料 4+i 以上で置ける。9個まで）
  const cap = () => Math.max(0, Math.min(m.food - 3, 9) - m.count[1]);
  const before = cap();
  m.food += n;
  const k = m.finalRound ? cap() - before : n;
  return k * FOOD_SHARE * pieceRate(m, 1);
};
const industry = (m: Sim, n: number) => {
  m.count[5] += n;
  return n * pieceRate(m, 5);
};
/** 建物駒を n 個まで（費用は1個ずつ払う）。extraWood はエリア P の木材1 */
const buildings = (m: Sim, n: number, ctx: Ctx) => {
  if (!m.bld) return null;
  let k = 0;
  let vp = 0;
  while (k < n && m.spots > 0 && m.wood >= m.bld.wood && m.iron >= m.bld.iron) {
    m.wood -= m.bld.wood;
    m.iron -= m.bld.iron;
    m.spots--;
    m.count[3]++;
    // 建物駒を置いたタイルの裏面の効果をもう一度得る
    vp += pieceRate(m, 3) + flipOnce(m, ctx);
    k++;
  }
  return k === 0 ? null : vp;
};

const CONVS: Conv[] = [
  { id: 'A', cost: { wheat: 6 }, apply: (m) => tiles(m, 3) },
  { id: 'B', cost: { wheat: 4 }, apply: (m) => food(m, 2) },
  { id: 'C', cost: { wheat: 4 }, apply: (m) => rabbits(m, 1) },
  { id: 'D', cost: { wood: 6 }, apply: (m, c) => roads(m, 3, c) },
  { id: 'E', cost: {}, apply: (m, c) => buildings(m, 2, c) },
  { id: 'F', cost: { iron: 3 }, apply: (m) => industry(m, 2) },
  { id: 'M', cost: { wheat: 8, wood: 8 }, apply: (m, c) => tiles(m, 3) + roads(m, 3, c) },
  { id: 'N', cost: { wheat: 7 }, apply: (m) => food(m, 3) },
  { id: 'O', cost: { wheat: 9 }, apply: (m) => rabbits(m, 2) },
  { id: 'P', cost: { wood: 1 }, apply: (m, c) => buildings(m, 3, c) },
  { id: 'Q', cost: { iron: 5 }, apply: (m) => industry(m, 3) },
  {
    id: 'G',
    cost: { diamond: 2 },
    apply: (m) => {
      let vp = -2; // ダイヤ1個＝1点を失う
      for (let k = 0; k < 2; k++) {
        const b = bestProsStep(m);
        if (b.i < 0) break;
        vp += b.vp;
        advancePros(m, b.i);
      }
      return vp;
    },
  },
  {
    id: 'I',
    cost: {},
    apply: (m) => {
      m.diamond++;
      return 1;
    },
  },
  {
    id: 'J',
    cost: {},
    apply: (m, c) => {
      // 2枚引く＝主行動が2回増える（このエリアに払う手札1枚と差し引きで1回）。カードの価値はプレイしたときに数える
      m.bonusA += 2;
      return 0.5 * c.cJ;
    },
  },
  {
    id: 'K',
    cost: {},
    apply: (m) => {
      m.gold += 6;
      return 6 / 5;
    },
  },
];

/** 費用を払えるか。基礎資源の不足は、4ゴールドにつき1個で両替の上限まで補う。払えるなら払い、ゴールドの減り（勝利点）を返す */
function pay(m: Sim, cost: Conv['cost']): number | null {
  let need = 0;
  for (const b of BASICS) need += Math.max(0, (cost[b] ?? 0) - m[b]);
  const gold = (cost.gold ?? 0) + need * FA3_GOLD;
  if (need > MAX_CONVERSIONS || m.gold < gold || m.diamond < (cost.diamond ?? 0)) return null;
  for (const b of BASICS) m[b] = Math.max(0, m[b] - (cost[b] ?? 0));
  m.gold -= gold;
  m.diamond -= cost.diamond ?? 0;
  return gold / 5;
}

const cloneSim = (m: Sim): Sim => ({ ...m, pros: [...m.pros], count: [...m.count], income: { ...m.income } });

/** カードの効果の勝利点の見積もり（静的。手札のカードの価値に使う） */
function effVP(s: GameState, p: PlayerState, effs: Eff[], m: Sim, ctx: Ctx, basicVP: number, incomeLeft: number): number {
  let vp = 0;
  for (const e of effs) {
    switch (e.k) {
      case 'gain':
        vp += (e.res.gold ?? 0) / 5 + (e.res.diamond ?? 0) + ((e.res.wheat ?? 0) + (e.res.wood ?? 0) + (e.res.iron ?? 0)) * basicVP;
        break;
      case 'anyBasic':
        vp += e.n * basicVP;
        break;
      case 'income':
        vp += e.n * incomeLeft * (e.res === 'gold' ? 1 / 5 : basicVP);
        break;
      case 'terrain':
        vp += e.n * pieceRate(m, 0);
        break;
      case 'road':
        vp += e.n * pieceRate(m, 2) + Math.min(e.n, m.unflipped) * ctx.flip;
        break;
      case 'mix':
        vp += e.terrain * pieceRate(m, 0) + e.road * pieceRate(m, 2) + Math.min(e.road, m.unflipped) * ctx.flip;
        break;
      case 'building':
        vp += Math.min(e.n, m.spots) * (pieceRate(m, 3) + ctx.flip);
        break;
      case 'food':
        vp += e.n * FOOD_SHARE * pieceRate(m, 1);
        break;
      case 'industry':
        vp += e.n * pieceRate(m, 5);
        break;
      case 'pros':
        vp += e.n * Math.max(0, bestProsStep(m).vp);
        break;
      case 'rabbit':
        vp += Math.min(e.n, Math.max(0, m.food - 3 - m.count[1])) * pieceRate(m, 1);
        break;
      case 'draw':
        vp += e.n * ctx.cJ;
        break;
      case 'score':
        vp += e.kind === 'cp' ? 2 * e.n : e.kind === 'ip' ? e.n * pieceRate(m, 5) : e.n;
        break;
      case 'choice':
        vp += Math.max(0, ...e.options.map((o) => effVP(s, p, o, m, ctx, basicVP, incomeLeft)));
        break;
      case 'pay': {
        const c = e.cost;
        const costVP = (c.gold ?? 0) / 5 + (c.diamond ?? 0) + ((c.wheat ?? 0) + (c.wood ?? 0) + (c.iron ?? 0) + (c.anyBasic ?? 0)) * basicVP + (c.hand ?? 0) * ctx.cJ;
        vp += Math.max(0, effVP(s, p, e.then, m, ctx, basicVP, incomeLeft) - costVP);
        break;
      }
      case 'cond':
        vp += Math.min(e.each ? condTimes(s, p, e.items) : Math.min(1, condTimes(s, p, e.items)), 6) * effVP(s, p, e.then, m, ctx, basicVP, incomeLeft);
        break;
      default:
        break;
    }
  }
  return vp;
}

/** 基礎資源1個あたりの勝利点の最大値（変換の表の中で、そのラウンドに使えるエリアだけ。再帰にしない）。
 *  消費した基礎資源は、変換の前後の差で数える（建物駒の費用のように、エリアの費用の外で払うものを含める） */
function basicUnitVP(m: Sim, ctx: Ctx, open: (id: string) => boolean): number {
  let best = 0;
  for (const c of CONVS) {
    if (!open(c.id)) continue;
    const t = cloneSim(m);
    t.wheat = t.wood = t.iron = 99;
    t.food = Math.max(t.food, t.count[1] + 5); // 食料の不足は考えない（上限の見積もり）
    if (pay(t, c.cost) === null) continue;
    const vp = c.apply(t, ctx);
    const units = 3 * 99 - (t.wheat + t.wood + t.iron);
    if (vp !== null && units > 0) best = Math.max(best, vp / units);
  }
  return best;
}

/** 見込み：ラウンドごとの勝利点を割引して足したもの */
export function projection(s: GameState, w: Weights, trace?: string[]): number {
  const p = s.players[0];
  const gamma = w[0];
  const aNext = Math.max(0, w[1]);
  const cJ = w[2];
  const cur = s.phase === 'setup' ? 1 : s.round;
  const m = simOf(s);
  // 収入の受け取りが残っているラウンド：準備中は第1ラウンドの収入も残っている
  const incomeFrom = s.phase === 'setup' ? 1 : cur + 1;
  let total = 0;
  for (let r = cur; r <= 5; r++) {
    const before = endScore(m);
    let vp = 0;
    if (r >= incomeFrom) {
      m.gold += m.income.gold;
      m.wheat += m.income.wheat;
      m.wood += m.income.wood;
      m.iron += m.income.iron;
    }
    // 主行動の回数：今のラウンドは手札＋ディスク（パス済み・クリーンナップ中は0）、以後は aNext
    const nowRound = r === cur && s.phase !== 'setup';
    let A = nowRound ? (s.phase === 'action' && !p.passed ? p.hand.length + p.discs : 0) : aNext;
    const incomeLeft = 5 - r;
    m.ahead = Math.max(0, w[11] ?? 1) * (5 - r + 1);
    m.finalRound = r === 5;
    m.aheadCount = Math.max(0, w[12] ?? 1.5) * (5 - r + 1);
    // 裏返しの価値：収入+1（資源1個 × 残りの収入フェイズ、表の最高の変換率で勝利点に）か、繁栄1歩
    const ctx: Ctx = { flip: 0, cJ, unit: 0, incomeLeft };
    const open = (id: string) => (ROUND2_AREAS.includes(id) ? r >= 2 : ROUND3_AREAS.includes(id) ? r >= 3 : true);
    // 資源1個あたりの勝利点は、裏返しの価値を0として出す（裏返しの価値の計算に自分自身が戻らないように）
    const unit = basicUnitVP(m, ctx, open);
    ctx.unit = unit;
    ctx.flip = Math.max(unit * incomeLeft, bestProsStep(m).vp, 0);
    // エリアの使用回数（今のラウンドは盤面の空き、以後は全部）。2回目は手札2枚、3回目は3枚
    const used: Record<string, number> = {};
    const slotCost = (id: string): number | null => {
      const spaces = AREAS[id].spaces;
      const taken = nowRound ? (s.areas[id]?.slots.filter((x) => x !== null).length ?? spaces) : 0;
      const k = taken + (used[id] ?? 0);
      return k >= spaces ? null : k + 1;
    };
    // 手札のカード（今のラウンドだけ）：静的な効果の見積もり − コストのゴールド
    const cards = nowRound ? p.hand.map((id) => ({ id, value: cardValue(s, p, id, m, ctx, unit, incomeLeft) })) : [];
    // 次のラウンド以降は手札が分からないので、平均的なカードを主行動1回でプレイできるものとする（ラウンドに3枚まで）
    let generic = nowRound ? 0 : 3;
    /** 主行動1回で得られる見積もりの最大（手札1枚で使えるエリアだけ） */
    const bestAction = (t: Sim): number => {
      let b = -Infinity;
      for (const c of CONVS) {
        if (!open(c.id) || slotCost(c.id) !== 1) continue;
        const tt = cloneSim(t);
        const spent = pay(tt, c.cost);
        if (spent === null) continue;
        const got = c.apply(tt, ctx);
        if (got !== null) b = Math.max(b, got - spent);
      }
      return b;
    };
    // 主行動が尽きたあと、fa2（15ゴールド → カード1枚＝主行動1回）で買い足せる回数（最終ラウンドに限る。1手番の両替の上限まで）
    let fa2 = r === 5 ? MAX_CONVERSIONS : 0;
    for (;;) {
      if (A <= 0) {
        if (fa2 <= 0 || m.gold < 15) break;
        // 買い足すのは、1回分の行動の見積もりが15ゴールド（3点）を上回るときだけ
        const t = cloneSim(m);
        t.gold -= 15;
        if (bestAction(t) <= 3) break;
        m.gold -= 15;
        A += 1;
        fa2--;
        trace?.push(`R${r} fa2（15ゴールド → カード1枚）`);
      }
      let best: { gain: number; per: number; act: number; next: Sim; card?: string; area?: string } | null = null;
      for (const c of CONVS) {
        if (!open(c.id)) continue;
        const act = slotCost(c.id);
        if (act === null || act > A) continue;
        const t = cloneSim(m);
        const spent = pay(t, c.cost);
        if (spent === null) continue;
        const got = c.apply(t, ctx);
        if (got === null) continue;
        const gain = got - spent;
        const per = gain / act;
        if (!best || per > best.per) best = { gain, per, act, next: t, area: c.id };
      }
      for (const c of cards) {
        if (c.value === null) continue;
        const cost = cardCost(s, p, c.id);
        if (m.gold < cost) continue;
        const t = cloneSim(m);
        t.gold -= cost;
        t.vp += c.value;
        const gain = c.value - cost / 5;
        if (!best || gain > best.per) best = { gain, per: gain, act: 1, next: t, card: c.id };
      }
      if (generic > 0 && m.gold >= AVG_CARD_COST) {
        const gain = cJ - AVG_CARD_COST / 5;
        if (!best || gain > best.per) {
          const t = cloneSim(m);
          t.gold -= AVG_CARD_COST;
          t.vp += cJ;
          best = { gain, per: gain, act: 1, next: t, card: '*' };
        }
      }
      if (!best || best.per <= 0) break;
      trace?.push(`R${r} ${best.area ?? best.card} +${best.gain.toFixed(2)}（行動${best.act}）`);
      vp += best.gain;
      A -= best.act;
      Object.assign(m, best.next);
      A += m.bonusA;
      m.bonusA = 0;
      if (best.area) used[best.area] = (used[best.area] ?? 0) + 1;
      if (best.card === '*') generic--;
      else if (best.card) cards.splice(cards.findIndex((x) => x.id === best!.card), 1);
    }
    trace?.push(`R${r} 計 ${(endScore(m) - before).toFixed(2)}（目安 ${vp.toFixed(1)}、A=${A} 残り、資源 G${m.gold} 麦${m.wheat} 木${m.wood} 鉄${m.iron}、裏返し ${ctx.flip.toFixed(2)}、資源1個 ${unit.toFixed(2)}）`);
    // この回の見込み：計画を打ち終えた仮の盤面の得点の増え方（行動の価値の見積もり vp は計画の順番を決めるためだけに使った）
    total += Math.pow(gamma, r - cur) * (endScore(m) - before);
  }
  return total;
}

/** 手札のカード1枚の価値（即時能力は1回、パス時能力は残りのパスの回数ぶん） */
function cardValue(s: GameState, p: PlayerState, id: string, m: Sim, ctx: Ctx, unit: number, incomeLeft: number): number {
  const c = CARDS[id];
  const v = effVP(s, p, c.main, m, ctx, unit, incomeLeft);
  return c.type === 'pass' ? v * Math.max(1, passesLeft(s)) : v;
}

/** 第3版の評価値（passGain の項を除く）。終局ではちょうど得点になる */
export function eval3(s: GameState, w: Weights): number {
  const score = scoreTotal(s);
  if (s.finished) return score;
  const f = features(s);
  const cleanupHand = s.phase === 'cleanup' ? f[5] : 0;
  const linear = w[3] * f[25] + w[4] * f[12] + w[5] * f[13] + w[6] * f[14] + w[7] * f[19] + w[8] * f[6] + w[9] * cleanupHand;
  return score + projection(s, w) + linear;
}
