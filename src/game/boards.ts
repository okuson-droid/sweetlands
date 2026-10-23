// 静的データ：ボード・タイル・トラック（rules §6, §12）
import type { BuildingType, Cost, Eff, ProsColor, ResKind, Row, Terrain } from './types';

const inc = (res: ResKind, n: number): Eff => ({ k: 'income', res, n });
const gain = (r: Record<string, number>): Eff => ({ k: 'gain', res: r });

// ---- アクションエリア（§6.1） ----
export interface AreaDef {
  id: string;
  label: string;
  group: 'basic' | 'advanced' | 'special';
  spaces: number;
  cost: Cost;
  effect: Eff[];
  copy?: 'basic' | 'basicOrAdvanced';
  building?: boolean; // 「既定のコスト」で建物駒を置く
}

export const AREAS: Record<string, AreaDef> = {
  A: { id: 'A', label: '麦6 → 地形タイル3枚まで', group: 'basic', spaces: 3, cost: { wheat: 6 }, effect: [{ k: 'terrain', n: 3, kind: 'any' }] },
  B: { id: 'B', label: '麦4 → 食料トラック2歩まで', group: 'basic', spaces: 3, cost: { wheat: 4 }, effect: [{ k: 'food', n: 2 }] },
  C: { id: 'C', label: '麦4 → クッキーラビット駒1個', group: 'basic', spaces: 3, cost: { wheat: 4 }, effect: [{ k: 'rabbit', n: 1 }] },
  D: { id: 'D', label: '木材6 → 道駒3個まで', group: 'basic', spaces: 3, cost: { wood: 6 }, effect: [{ k: 'road', n: 3 }] },
  E: { id: 'E', label: '既定のコスト → 建物駒2個まで', group: 'basic', spaces: 3, cost: {}, effect: [{ k: 'building', n: 2, viaAction: true }], building: true },
  F: { id: 'F', label: '鉄3 → 工業トラック2歩まで', group: 'basic', spaces: 3, cost: { iron: 3 }, effect: [{ k: 'industry', n: 2 }] },
  M: { id: 'M', label: '麦8・木材8 → 地形タイル3枚まで＋道駒3個まで', group: 'advanced', spaces: 3, cost: { wheat: 8, wood: 8 }, effect: [{ k: 'mix', terrain: 3, road: 3 }] },
  N: { id: 'N', label: '麦7 → 食料トラック3歩まで', group: 'advanced', spaces: 3, cost: { wheat: 7 }, effect: [{ k: 'food', n: 3 }] },
  O: { id: 'O', label: '麦9 → クッキーラビット駒2個まで', group: 'advanced', spaces: 3, cost: { wheat: 9 }, effect: [{ k: 'rabbit', n: 2 }] },
  P: { id: 'P', label: '既定のコスト＋木材1 → 建物駒3個まで', group: 'advanced', spaces: 3, cost: { wood: 1 }, effect: [{ k: 'building', n: 3, viaAction: true }], building: true },
  Q: { id: 'Q', label: '鉄5 → 工業トラック3歩まで', group: 'advanced', spaces: 3, cost: { iron: 5 }, effect: [{ k: 'industry', n: 3 }] },
  G: { id: 'G', label: 'ダイヤ2 → 繁栄トラック合計2歩', group: 'special', spaces: 3, cost: { diamond: 2 }, effect: [{ k: 'pros', n: 2 }] },
  H: { id: 'H', label: 'アクションディスクを1枚取る', group: 'special', spaces: 1, cost: {}, effect: [{ k: 'disc' }] },
  I: { id: 'I', label: 'ダイヤ1個を得る', group: 'special', spaces: 1, cost: {}, effect: [gain({ diamond: 1 })] },
  J: { id: 'J', label: '市民カードを2枚引く', group: 'special', spaces: 1, cost: {}, effect: [{ k: 'draw', n: 2 }] },
  K: { id: 'K', label: '6ゴールドを得る', group: 'special', spaces: 1, cost: {}, effect: [gain({ gold: 6 })] },
  // 模倣ボード（3〜4人用）
  L1: { id: 'L1', label: '4ゴールド → 基本エリアをコピー', group: 'special', spaces: 3, cost: { gold: 4 }, effect: [], copy: 'basic' },
  K8: { id: 'K8', label: '8ゴールドを得る', group: 'special', spaces: 1, cost: {}, effect: [gain({ gold: 8 })] },
  J2: { id: 'J2', label: '市民カードを2枚引く', group: 'special', spaces: 1, cost: {}, effect: [{ k: 'draw', n: 2 }] },
  // 模倣ボード（4人用）
  L2: { id: 'L2', label: '4ゴールド → 基本／応用エリアをコピー', group: 'special', spaces: 3, cost: { gold: 4 }, effect: [], copy: 'basicOrAdvanced' },
  H2: { id: 'H2', label: 'アクションディスクを1枚取る', group: 'special', spaces: 1, cost: {}, effect: [{ k: 'disc' }] },
  I2: { id: 'I2', label: 'ダイヤ1個を得る', group: 'special', spaces: 1, cost: {}, effect: [gain({ diamond: 1 })] },
};

export const BASIC_AREAS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const ADVANCED_AREAS = ['M', 'N', 'O', 'P', 'Q'];
export const ROUND2_AREAS = ['N', 'P']; // ユーザー確認済み
export const ROUND3_AREAS = ['O', 'Q'];

export function areasForPlayers(players: number): string[] {
  const base = ['G', 'H', 'I', 'J', 'K', ...BASIC_AREAS, ...ADVANCED_AREAS];
  if (players >= 3) base.push('L1', 'K8', 'J2');
  if (players >= 4) base.push('L2', 'H2', 'I2');
  return base;
}

// ---- 個人ボード（§12.2b） ----
// 段は下から 1..5 の順に取る。index 0 = 最下段（5段目）
export const GRID_WOOD = [2, 3, 4, 5, 6];
export const GRID_IRON = 3;
export const SHOP_COST = { wood: 2, iron: 3 };
export const LAB_COST: Cost[] = [
  { wood: 3, iron: 1 },
  { wood: 3, iron: 3 },
  { iron: 6 },
  { iron: 8 },
];
export const BUILDING_ROW: Record<'tent' | 'house' | 'bldg', Row> = { tent: 'agr', house: 'for', bldg: 'min' };
export const ROW_BUILDING: Record<Row, 'tent' | 'house' | 'bldg'> = { agr: 'tent', for: 'house', min: 'bldg' };

export type BoardType = 'α' | 'β' | 'γ' | 'δ' | 'ε' | 'ζ' | 'η';

const wonder: Eff = { k: 'wonder' };
const skill1: Eff = { k: 'skill', n: 1 };
const dia2: Eff = gain({ diamond: 2 });
const draw1: Eff = { k: 'draw', n: 1 };
const roadTerr: Eff = { k: 'mix', terrain: 1, road: 1 };

/** 3段目・4段目の取得ボーナス（テント・家・ビル） */
export const GRID_MID: Record<BoardType, { r3: Eff[][]; r4: Eff[][] }> = {
  α: { r3: [[dia2], [wonder], [dia2]], r4: [[skill1], [roadTerr], [draw1]] },
  β: { r3: [[dia2], [dia2], [wonder]], r4: [[{ k: 'food', n: 1 }], [skill1], [{ k: 'disc' }]] },
  γ: { r3: [[wonder], [dia2], [dia2]], r4: [[draw1], [skill1], [{ k: 'industry', n: 1 }]] },
  δ: { r3: [[dia2], [dia2], [wonder]], r4: [[skill1], [{ k: 'road', n: 2 }], [inc('gold', 3)]] },
  ε: { r3: [[dia2], [wonder], [dia2]], r4: [[{ k: 'food', n: 1 }], [skill1], [draw1]] },
  ζ: { r3: [[wonder], [dia2], [dia2]], r4: [[inc('gold', 3)], [{ k: 'disc' }], [skill1]] },
  η: { r3: [[wonder], [dia2], [dia2]], r4: [[roadTerr], [skill1], [{ k: 'industry', n: 1 }]] },
};

/** 段ごとの取得ボーナス。taken = 取る前の取得数（0=最下段） */
export function gridBonus(type: BoardType, building: 'tent' | 'house' | 'bldg', taken: number): Eff[] {
  const col = building === 'tent' ? 0 : building === 'house' ? 1 : 2;
  switch (taken) {
    case 0: // 5段目
      return [
        [{ k: 'terrain', n: 1, kind: 'any' } as Eff],
        [inc('wheat', 1), inc('iron', 1)],
        [dia2],
      ][col];
    case 1: // 4段目
      return GRID_MID[type].r4[col];
    case 2: // 3段目
      return GRID_MID[type].r3[col];
    case 3: // 2段目
      return [[{ k: 'road', n: 2 } as Eff], [{ k: 'ib', row: 'for' } as Eff], [{ k: 'ib', row: 'min' } as Eff]][col];
    default: // 1段目：ゲーム終了時の得点（scoring.ts）
      return [];
  }
}

/** 産業列の帯の右端に印刷されたオートメーション時能力 */
export const PRINTED_AUTO: Record<BoardType, Record<Row, Eff[]>> = {
  α: { agr: [{ k: 'terrain', n: 1, kind: 'any' }], for: [gain({ wood: 1, wheat: 1 })], min: [gain({ gold: 3 })] },
  β: { agr: [{ k: 'terrain', n: 1, kind: 'any' }], for: [gain({ gold: 4 })], min: [gain({ iron: 1, wood: 1 })] },
  γ: { agr: [inc('wheat', 1)], for: [gain({ wood: 1, iron: 1 })], min: [inc('gold', 2)] },
  δ: { agr: [gain({ wheat: 1, wood: 1 })], for: [{ k: 'road', n: 1 }], min: [gain({ iron: 1 }), inc('gold', 1)] },
  ε: { agr: [inc('gold', 4)], for: [inc('wood', 1)], min: [gain({ iron: 1, wheat: 1 })] },
  ζ: { agr: [gain({ wheat: 1, iron: 1 })], for: [{ k: 'road', n: 1 }], min: [inc('gold', 2)] },
  η: { agr: [gain({ wheat: 1 }), inc('gold', 1)], for: [{ k: 'score', kind: 'cp', n: 1 }], min: [inc('iron', 1)] },
};

/** キャラクターの上方修正（ヴァリアント、docs/decisions_16）で差し替える印刷オートメーション */
const PRINTED_AUTO_BUFF: Partial<Record<BoardType, Partial<Record<Row, Eff[]>>>> = {
  γ: { min: [{ k: 'road', n: 1 }] },
  ε: { agr: [{ k: 'terrain', n: 1, kind: 'any' }] },
  η: { for: [{ k: 'road', n: 1 }] },
};
/** 産業列の印刷オートメーション。buff はキャラクターの上方修正を採用しているか */
export function printedAuto(board: BoardType, row: Row, buff: boolean): Eff[] {
  return (buff && PRINTED_AUTO_BUFF[board]?.[row]) || PRINTED_AUTO[board][row];
}

// ---- 地形タイル（§6.3） ----
export const TERRAIN_FLIP: Record<Terrain, Eff[]> = {
  W: [{ k: 'choice', options: [[inc('wheat', 1)], [{ k: 'pros', n: 1, color: 'O' }]] }],
  F: [{ k: 'choice', options: [[inc('wood', 1)], [{ k: 'pros', n: 1, color: 'G' }]] }],
  M: [{ k: 'choice', options: [[inc('iron', 1)], [{ k: 'pros', n: 1, color: 'Y' }]] }],
  S: [inc('gold', 2)],
};
export const TERRAIN_SUPPLY: Record<Terrain, number> = { W: 60, F: 52, M: 52, S: 28 };

/** 首都ヘクス：任意の収入1歩、または任意の繁栄1歩（§12.6） */
export const CAPITAL_BONUS: Eff[] = [
  {
    k: 'choice',
    options: [[{ k: 'special', id: 'incomeAny1' }], [{ k: 'pros', n: 1 }]],
  },
];

/** 特殊地形タイル（裏返したときの効果、§12.3）。id 1..6 */
export const SPECIAL_TILES: Record<number, { label: string; eff: Eff[] }> = {
  1: { label: '繁栄トラックを合計2歩', eff: [{ k: 'pros', n: 2 }] },
  2: { label: '工業トラック2歩まで＋鉄2', eff: [{ k: 'industry', n: 2 }, gain({ iron: 2 })] },
  3: { label: '地形タイル2枚まで＋麦2', eff: [{ k: 'terrain', n: 2, kind: 'any' }, gain({ wheat: 2 })] },
  4: { label: '道駒2個まで＋木材2', eff: [{ k: 'road', n: 2 }, gain({ wood: 2 })] },
  5: { label: '5ゴールド＋ゴールドの収入値+7', eff: [gain({ gold: 5 }), inc('gold', 7)] },
  6: { label: 'ダイヤ2＋市民カード1枚', eff: [gain({ diamond: 2 }), { k: 'draw', n: 1 }] },
};

/** 地図ヘクスのアイコン（地形タイルを置いたときに得る、§12.6） */
export const MAP_ICON: Record<string, (t: Terrain) => Eff[]> = {
  rab: () => [{ k: 'rabbit', n: 1 }],
  skill: () => [{ k: 'skill', n: 1 }],
  terr: () => [{ k: 'terrain', n: 1, kind: 'any' }],
  road: () => [{ k: 'road', n: 1 }],
  pros: () => [{ k: 'pros', n: 1 }],
  ind: () => [{ k: 'industry', n: 1 }],
  ib: (t) => [{ k: 'ib', row: t === 'W' ? 'agr' : t === 'F' ? 'for' : 'min' }],
  g5: () => [gain({ gold: 5 })],
  cp2: () => [{ k: 'score', kind: 'cp', n: 2 }],
  ip2: () => [{ k: 'score', kind: 'ip', n: 2 }],
};

// ---- 工業トラック（§12.13） ----
// index 0..17（0=開始マス）。color 'O'=オレンジ（馬車駒）, 'G'=緑（機関車駒）
export const INDUSTRY_TRACK: { color: 'O' | 'G'; eff: Eff[] }[] = [
  { color: 'O', eff: [] },
  { color: 'O', eff: [] },
  { color: 'O', eff: [roadTerr] },
  { color: 'G', eff: [skill1] },
  { color: 'O', eff: [draw1] },
  { color: 'G', eff: [{ k: 'terrain', n: 2, kind: 'any' }] },
  { color: 'O', eff: [inc('wheat', 2), inc('wood', 2)] },
  { color: 'G', eff: [{ k: 'ib', row: 'min' }] },
  { color: 'O', eff: [{ k: 'ib', row: 'min' }] },
  { color: 'G', eff: [{ k: 'road', n: 2 }] },
  { color: 'O', eff: [wonder] },
  { color: 'G', eff: [{ k: 'anyBasic', n: 3 }] },
  { color: 'O', eff: [{ k: 'ib', row: 'min' }] },
  { color: 'G', eff: [draw1] },
  { color: 'O', eff: [{ k: 'special', id: 'locomotive' }] },
  { color: 'G', eff: [{ k: 'building', n: 1, viaAction: false }] },
  { color: 'O', eff: [{ k: 'ib', row: 'min' }] },
  { color: 'O', eff: [{ k: 'pros', n: 2, color: 'Y' }] },
];
/** 研究所駒 k(0..3) は index labGap[k] と labGap[k]+1 の間にある */
export const LAB_GAPS = [5, 9, 13, 16];
/** 工業点アイコン：index gap と gap+1 の間、値 */
export const IP_ICONS = [
  { gap: 3, value: 1 },
  { gap: 7, value: 1 },
  { gap: 11, value: 2 },
  { gap: 16, value: 2 },
];
/** キャラクターの上方修正（docs/decisions_16）でのナタ・パステルの工業点アイコンの値（IP_ICONS と同じ順） */
export const IP_VALUES_NATA_BUFF = [1, 2, 3, 4];
export const INDUSTRY_END = 17;

// ---- 食料トラック（§12.13） ----
export const FOOD_END = 12;
export const FOOD_BONUS: Record<number, Eff[]> = {
  2: [roadTerr],
  5: [wonder],
  7: [{ k: 'special', id: 'woodDiscount1' }],
  9: [{ k: 'terrain', n: 2, kind: 'any' }],
  11: [{ k: 'special', id: 'woodDiscount2' }],
};
/** クッキーラビット駒 i(0..8) は food 位置 4+i の真上 */
export const RABBIT_POS = (i: number) => 4 + i;
export const RABBIT_BONUS: Record<number, Eff[]> = {
  0: [inc('wood', 2), inc('iron', 2)],
  3: [{ k: 'ib', row: 'agr' }],
  5: [{ k: 'pros', n: 1, color: 'O' }],
  7: [{ k: 'ib', row: 'agr' }],
};

// ---- 繁栄トラック（§12.12） ----
export interface ProsTrack {
  color: ProsColor;
  length: number; // 右端のマス番号
  rates: [number, number][]; // [区間1, 区間2, 右端] それぞれ [per, vp]（per 個につき vp 点）
  seg1End: number;
  bonus: Record<number, Eff[]>;
  endBonus: Eff[];
  label: string;
}
const lowerBonus = (incRes: ResKind, fourth: Eff): Record<number, Eff[]> => ({
  2: [inc(incRes, 1)],
  4: [fourth],
  6: [draw1],
  8: [{ k: 'anyBasic', n: 3 }],
});
export const PROS_TRACKS: ProsTrack[] = [
  { color: 'O', length: 5, seg1End: 2, rates: [[3, 1], [2, 1], [1, 1]], bonus: {}, endBonus: [{ k: 'terrain', n: 1, kind: 'any' }], label: '地形タイル' },
  { color: 'O', length: 9, seg1End: 4, rates: [[1, 4], [1, 5], [1, 7]], bonus: lowerBonus('wheat', { k: 'food', n: 1 }), endBonus: [{ k: 'score', kind: 'vp', n: 7 }], label: 'クッキーラビット駒' },
  { color: 'G', length: 5, seg1End: 2, rates: [[3, 1], [2, 1], [1, 1]], bonus: {}, endBonus: [{ k: 'road', n: 1 }], label: '道駒' },
  { color: 'G', length: 9, seg1End: 4, rates: [[2, 1], [1, 1], [1, 2]], bonus: lowerBonus('wood', { k: 'score', kind: 'cp', n: 1 }), endBonus: [{ k: 'score', kind: 'cp', n: 2 }], label: '建物駒' },
  { color: 'Y', length: 5, seg1End: 2, rates: [[1, 2], [1, 3], [1, 4]], bonus: {}, endBonus: [{ k: 'drawAutomate' }], label: 'オートメーション化したカード' },
  { color: 'Y', length: 9, seg1End: 4, rates: [[2, 1], [1, 1], [1, 2]], bonus: lowerBonus('iron', { k: 'industry', n: 1 }), endBonus: [{ k: 'score', kind: 'ip', n: 2 }], label: '工業点' },
];

// ---- 都市点（§6.11, §12.2） ----
export const CITY_RATE = [0, 1, 2, 3, 5, 7, 9];
export const LOTUS_CITY_RATE = [0, 1, 3, 5, 7, 9, 12];
/** キャラクターの上方修正（docs/decisions_16）でのロータス・チェーの都市点レート */
export const LOTUS_CITY_RATE_BUFF = [0, 1, 3, 6, 10, 15, 21];

// ---- 港（§9） ----
export const PORT_VP = [-40, -20, -10, -5, 10];

// ---- スキルタイル（§12.8）。id 1..12 ----
export interface SkillDef {
  id: number;
  kind: 'instant' | 'pass' | 'flip' | 'perm';
  label: string;
  eff: Eff[];
}
export const SKILLS: SkillDef[] = [
  { id: 1, kind: 'instant', label: 'オレンジ色の繁栄トラックを合計3歩', eff: [{ k: 'pros', n: 3, color: 'O' }] },
  { id: 2, kind: 'instant', label: '緑色の繁栄トラックを合計3歩', eff: [{ k: 'pros', n: 3, color: 'G' }] },
  { id: 3, kind: 'instant', label: '灰色の繁栄トラックを合計3歩', eff: [{ k: 'pros', n: 3, color: 'Y' }] },
  { id: 4, kind: 'pass', label: '3本の産業列に1/2/3枚ずつ → 6/12/24勝利点', eff: [] },
  { id: 5, kind: 'pass', label: '食料トラック3/6/9歩以上 → 3/5/7勝利点', eff: [] },
  { id: 6, kind: 'pass', label: '今回の工業点2/4/6/8以上 → 3/5/7/10勝利点', eff: [] },
  { id: 7, kind: 'flip', label: '麦1・木材1・鉄1＋任意の基礎資源1', eff: [gain({ wheat: 1, wood: 1, iron: 1 }), { k: 'anyBasic', n: 1 }] },
  { id: 8, kind: 'flip', label: 'ダイヤ1', eff: [gain({ diamond: 1 })] },
  { id: 9, kind: 'flip', label: '8ゴールド', eff: [gain({ gold: 8 })] },
  { id: 10, kind: 'perm', label: '建物駒を1個置くたび2勝利点', eff: [] },
  { id: 11, kind: 'perm', label: 'クッキーラビット駒を1個置くたび3勝利点', eff: [] },
  { id: 12, kind: 'perm', label: '産業ボーナスを1回得るたび3勝利点', eff: [] },
];

// ---- 上級スキルタイル（§12.9）。id 1..14 ----
export const ADV_SKILLS: SkillDef[] = [
  { id: 1, kind: 'pass', label: '都市1/3/5 → 3/7/15勝利点', eff: [] },
  { id: 2, kind: 'pass', label: '接続している港1/2/3/4 → 2/6/12/20勝利点', eff: [] },
  { id: 3, kind: 'pass', label: '最も多いスイーツタグ1個につき2勝利点', eff: [] },
  { id: 4, kind: 'flip', label: '鉄4 → 工業トラック3歩まで', eff: [{ k: 'pay', cost: { iron: 4 }, then: [{ k: 'industry', n: 3 }] }] },
  { id: 5, kind: 'flip', label: '麦4 → 食料1歩まで＋クッキーラビット駒1個まで', eff: [{ k: 'pay', cost: { wheat: 4 }, then: [{ k: 'food', n: 1 }, { k: 'rabbit', n: 1 }] }] },
  { id: 6, kind: 'flip', label: 'ゴールドの収入値+5', eff: [inc('gold', 5)] },
  { id: 7, kind: 'flip', label: '地形タイル1枚まで＋道駒1個まで', eff: [roadTerr] },
  { id: 8, kind: 'flip', label: '市民カード2枚引き、1枚捨てる', eff: [{ k: 'discardDraw', draw: 2, discard: 1 }] },
  { id: 9, kind: 'perm', label: 'ゴールドの収入値を上げるたび、上昇値の勝利点', eff: [] },
  { id: 10, kind: 'perm', label: 'すべてのカードにブラウニー割引', eff: [] },
  { id: 11, kind: 'perm', label: '産業列の上限+1（取得時：1枚引き1枚を無料オートメーション化）', eff: [{ k: 'drawAutomate' }] },
  { id: 12, kind: 'perm', label: '市民カードを1枚プレイするたび2勝利点', eff: [] },
  { id: 13, kind: 'perm', label: '道駒アクション（木材6）のコストを木材3に', eff: [] },
  { id: 14, kind: 'perm', label: '地形タイルアクション（麦6）のコストを麦4に', eff: [] },
];

/** キャラクターの上方修正（docs/decisions_16 §16.7）で差し替える上級スキルタイル。
 *  持続効果の割引をやめ、同じ交換率のフリップ能力（ラウンド1回、アクションエリアを使わない）にする */
const ADV_SKILLS_BUFF: Record<number, SkillDef> = {
  13: { id: 13, kind: 'flip', label: '木材3 → 道駒3個まで', eff: [{ k: 'pay', cost: { wood: 3 }, then: [{ k: 'road', n: 3 }] }] },
  14: { id: 14, kind: 'flip', label: '麦4 → 地形タイル3枚まで', eff: [{ k: 'pay', cost: { wheat: 4 }, then: [{ k: 'terrain', n: 3, kind: 'any' }] }] },
};
/** スキルタイルの定義。buff はキャラクターの上方修正を採用しているか（上級スキルタイル13・14が変わる） */
export function skillDef(id: number, adv: boolean, buff = false): SkillDef {
  if (!adv) return SKILLS[id - 1];
  return (buff && ADV_SKILLS_BUFF[id]) || ADV_SKILLS[id - 1];
}

// ---- ラウンド支援タイル（§12.4, §12.4b） ----
export interface SupportDef {
  id: number;
  kind: 'income' | 'perm' | 'pass';
  label: string;
  eff: Eff[];
}
export const SUPPORT_NORMAL: SupportDef[] = [
  { id: 1, kind: 'income', label: '麦の収入値+1', eff: [inc('wheat', 1)] },
  { id: 2, kind: 'income', label: '市民カード1枚', eff: [draw1] },
  { id: 3, kind: 'income', label: '工業トラック1歩', eff: [{ k: 'industry', n: 1 }] },
  { id: 4, kind: 'income', label: '任意の基礎資源3', eff: [{ k: 'anyBasic', n: 3 }] },
  { id: 5, kind: 'income', label: '地形タイル1枚', eff: [{ k: 'terrain', n: 1, kind: 'any' }] },
  { id: 6, kind: 'income', label: '任意の繁栄トラック1歩', eff: [{ k: 'pros', n: 1 }] },
  { id: 7, kind: 'income', label: '鉄の収入値+1', eff: [inc('iron', 1)] },
  { id: 8, kind: 'income', label: 'ダイヤ1', eff: [gain({ diamond: 1 })] },
  { id: 9, kind: 'income', label: '道駒1個', eff: [{ k: 'road', n: 1 }] },
  { id: 10, kind: 'income', label: '木材の収入値+1', eff: [inc('wood', 1)] },
  { id: 11, kind: 'income', label: '6ゴールド', eff: [gain({ gold: 6 })] },
  { id: 12, kind: 'income', label: 'ゴールドの収入値+2', eff: [inc('gold', 2)] },
  { id: 13, kind: 'perm', label: 'このラウンド：カードのコスト-3ゴールド', eff: [] },
  { id: 14, kind: 'perm', label: 'このラウンド：オートメーション化のダイヤ-1', eff: [] },
  { id: 15, kind: 'perm', label: 'このラウンド：建物駒1個ごとに鉄-1', eff: [] },
];
export const SUPPORT_PASS: SupportDef[] = [
  { id: 101, kind: 'pass', label: '都市1つにつき3勝利点', eff: [] },
  { id: 102, kind: 'pass', label: 'プレイしたカード1枚につき1勝利点', eff: [] },
  { id: 103, kind: 'pass', label: '最も多い1種類の地形タイル1枚につき1勝利点', eff: [] },
  { id: 104, kind: 'pass', label: '接続している港1つにつき3勝利点', eff: [] },
  { id: 105, kind: 'pass', label: '基礎資源の収入値のうち最小値の勝利点', eff: [] },
];
/** 人数ごとの使用列（0-indexed、7列中）。パス時タイルは列4〜6の上段 */
export function supportColumns(players: number): number[] {
  if (players >= 4) return [0, 1, 2, 3, 4, 5, 6];
  if (players === 3) return [1, 2, 3, 4, 5, 6];
  return [1, 2, 3, 4, 5];
}

// ---- マイルストーン（§12.10）、最終得点計算タイル（§12.11） ----
export const MILESTONE_LABEL: Record<string, string> = {
  '1a': '麦畑タイル＋海タイルが10枚以上',
  '1b': '森林タイル＋鉱山タイルが10枚以上',
  '2a': '建物駒が5個以上',
  '2b': '接続している港が2つ以上',
  '3a': '食料トラック7歩以上',
  '3b': '2個目のワンダーアイコンを得ている',
  '4a': '市民カードを6枚以上プレイ',
  '4b': 'ショートケーキタグ4個以上',
  '5a': 'ゴールドの収入値30以上',
  '5b': 'いずれかの色の繁栄トラック合計5歩以上',
  '6a': '工業マーカーが8歩以上',
  '6b': '勝利点15以上',
};
export const FINAL_TILES = [
  { id: 1, label: '最も多い1種類の地形タイルの枚数', neutral: 9 },
  { id: 2, label: '基礎資源の収入値のうち最大値', neutral: 10 },
  { id: 3, label: 'オートメーション化したカードの枚数', neutral: 4 },
  { id: 4, label: '地図ボードの外周の地形タイルの枚数', neutral: 12 },
];

export const CHAR_BOARD: Record<string, BoardType> = {
  'アリス・ティーローズ': 'α',
  'ロータス・チェー': 'α',
  'エリ・マカロン': 'β',
  'エルサ・スカイル': 'β',
  'ナタ・パステル': 'γ',
  'ビスキュイ・バステト': 'γ',
  'グレーテル・シュトーレン': 'δ',
  'サクラ・モチ': 'δ',
  'ソルビー・ショコラ': 'ε',
  'リッカ・ベリー': 'ε',
  'カルメン・メロ': 'ζ',
  'セナ・デライト': 'ζ',
  'コーラル・ライラ': 'η',
  'ジャスミン・メイ': 'η',
};
export const BUILDING_LABEL: Record<BuildingType, string> = {
  tent: 'テント駒',
  house: '家駒',
  bldg: 'ビル駒',
  lab: '研究所駒',
  shop: 'ショップ駒',
  clock: '時計塔駒',
};
