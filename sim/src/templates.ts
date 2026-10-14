// 打ち方の型（戦略テンプレート）：局全体の方針を、ラウンドごとの「評価関数の重みの倍率」と「今の得点の倍率」で表す。
// 型の中の細かい手は v1 と同じ方法で選ぶ。どの型で打つかは、型ごとに対局の終わりまで模擬して決める（ai.ts の selectTemplate）。
// 計画書 §4 の「戦略を人が書かない」からの逸脱であり、マスターの承認を得て導入した（報告書 §5C）。
// 型の中身は、人の基準プレイの1局目（§5A）の流れ（序盤に収入・カード・オートメーション・時計塔駒を作り、終盤に駒と繁栄トラックで得点に変える）を参考にした。
import { WEIGHT_NAMES, type Weights } from './evaluate';

export type WeightName = (typeof WEIGHT_NAMES)[number];

/** 型の1区間：until ラウンドまで（その値を含む）に使う倍率 */
export interface TemplatePhase {
  until: number;
  /** 重みの倍率（書いていない重みは1倍） */
  mul: Partial<Record<WeightName, number>>;
  /** 「今終わった場合の得点」の倍率（省略時は1）。投資の区間で小さくし、目先の得点に引っぱられないようにする */
  score?: number;
  /** 得点のうちゴールドの分（5ゴールドにつき1点）の倍率（省略時は1）。0 にすると、ゴールドを貯めずに使う打ち方になる */
  goldVp?: number;
}

export interface Template {
  name: string;
  /** until の小さい順。どの区間にも入らないラウンドは倍率なし（v1 と同じ） */
  phases: TemplatePhase[];
}

/** 収入・カード・オートメーション・時計塔駒を重く見る倍率（投資の区間の共通部分） */
const ENGINE: Partial<Record<WeightName, number>> = {
  incGold: 4,
  incWheat: 3,
  incWood: 3,
  incIron: 3,
  hand: 2,
  played: 3,
  automated: 4,
  clock: 3,
  skills: 2,
  portReach: 0.3,
};

/** ゴールドを貯めない倍率（ゴールドの重みを小さくする。得点のゴールドの分は goldVp で外す） */
const SPEND: Partial<Record<WeightName, number>> = { gold: 0.15 };
/** 基礎資源の収入・カード・オートメーション・時計塔駒を重く見る倍率（ゴールドの収入は重くしない） */
const BASIC: Partial<Record<WeightName, number>> = { ...SPEND, incWheat: 3, incWood: 3, incIron: 3, played: 2, automated: 3, clock: 3 };

export const TEMPLATES: Template[] = [
  { name: 'base', phases: [] },
  { name: 'engine2', phases: [{ until: 2, mul: ENGINE, score: 0.3 }] },
  { name: 'engine3', phases: [{ until: 3, mul: ENGINE, score: 0.3 }] },
  { name: 'spend4', phases: [{ until: 4, mul: SPEND, goldVp: 0 }] },
  { name: 'basic2', phases: [{ until: 2, mul: BASIC, goldVp: 0 }, { until: 4, mul: SPEND, goldVp: 0 }] },
  { name: 'basic3', phases: [{ until: 3, mul: BASIC, goldVp: 0 }, { until: 4, mul: SPEND, goldVp: 0 }] },
  {
    name: 'rabbit',
    phases: [
      { until: 2, mul: { ...ENGINE, food: 3 }, score: 0.3 },
      { until: 5, mul: { food: 3, rabbits: 3 } },
    ],
  },
  {
    name: 'build',
    phases: [
      { until: 2, mul: ENGINE, score: 0.3 },
      { until: 5, mul: { buildings: 3, cities: 2, industry: 3, openTiles: 2 } },
    ],
  },
];

export function templateByName(name: string): Template {
  const t = TEMPLATES.find((x) => x.name === name);
  if (!t) throw new Error(`不明な型: ${name}`);
  return t;
}

/** 型を当てはめた、ラウンド round の重みと得点の倍率 */
export function applyTemplate(base: Weights, t: Template | undefined, round: number): { w: Weights; score: number; goldVp: number } {
  const ph = t?.phases.find((p) => round <= p.until);
  if (!ph) return { w: base, score: 1, goldVp: 1 };
  const w = base.slice();
  for (const [k, m] of Object.entries(ph.mul)) w[WEIGHT_NAMES.indexOf(k as WeightName)] *= m!;
  return { w, score: ph.score ?? 1, goldVp: ph.goldVp ?? 1 };
}
