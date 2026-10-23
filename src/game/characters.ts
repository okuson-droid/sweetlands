// キャラクター（rules §12.2, §12.2b）
import raw from '../data/characters.json';
import { CHAR_BOARD, type BoardType } from './boards';
import type { BuildingType, GameConfig, Res, Row, Tag, Terrain } from './types';

/** 時計塔駒の配置条件。groups の各要素はすべて満たす必要があり、alt はそのどれか1つを満たせばよい（「A／B」＝AまたはB、ユーザー確認済み） */
export type ClockReq =
  | { k: 'terrain'; kind: Terrain | 'any'; n: number }
  | { k: 'bld'; type?: BuildingType; n: number } // type なし＝任意の建物駒
  | { k: 'played'; row: Row | 'all' | 'any'; n: number }
  | { k: 'food'; n: number }
  | { k: 'ipPassed'; n: number }
  | { k: 'wonder' };

export interface CharacterDef {
  name: string;
  board: BoardType;
  startRes: Res;
  startDiamond: number;
  startIncome: Res;
  clock: ClockReq[][]; // 外側＝すべて、内側＝どれか
  traitTags?: Partial<Record<Tag, number>>;
  basicText: string;
  clockText: string;
}

const W = (n: number): ClockReq => ({ k: 'terrain', kind: 'W', n });
const F = (n: number): ClockReq => ({ k: 'terrain', kind: 'F', n });
const M = (n: number): ClockReq => ({ k: 'terrain', kind: 'M', n });
const ANY = (n: number): ClockReq => ({ k: 'terrain', kind: 'any', n });
const B = (type: BuildingType, n: number): ClockReq => ({ k: 'bld', type, n });
/** 任意の建物駒（種類を問わない。ユーザー確認済み 2026-10-12：以前は家駒に限っていた） */
const ANYB = (n: number): ClockReq => ({ k: 'bld', n });
const P = (row: Row | 'all' | 'any', n: number): ClockReq => ({ k: 'played', row, n });
const WONDER: ClockReq[] = [{ k: 'wonder' }];

const CLOCK: Record<string, ClockReq[][]> = {
  'アリス・ティーローズ': [[F(5)], [ANYB(4)], [P('for', 2), P('any', 4)], WONDER],
  'ロータス・チェー': [[F(5)], [ANYB(4)], [P('for', 2), P('any', 4)], WONDER],
  'エリ・マカロン': [[W(6)], [B('tent', 2)], [P('agr', 2), P('any', 4)], WONDER],
  'エルサ・スカイル': [[ANY(9)], [ANYB(4)], [P('any', 5)], WONDER],
  'ナタ・パステル': [[M(4)], [B('lab', 2)], [P('min', 2), P('any', 4)], WONDER],
  'ビスキュイ・バステト': [[M(4)], [B('bldg', 2)], [P('min', 2), P('any', 4)], WONDER],
  'グレーテル・シュトーレン': [[W(6)], [B('tent', 3)], [P('agr', 2), P('any', 4)], WONDER],
  'サクラ・モチ': [[ANY(8)], [ANYB(4)], [P('any', 4)], WONDER],
  'ソルビー・ショコラ': [[W(7)], [B('tent', 2)], [P('agr', 2), P('any', 4)], WONDER],
  'リッカ・ベリー': [[W(6)], [B('tent', 2)], [P('agr', 2), P('any', 4)], WONDER],
  'カルメン・メロ': [[ANY(8)], [ANYB(4)], [P('all', 2), P('any', 4)], WONDER],
  'セナ・デライト': [[ANY(8)], [ANYB(4)], [P('any', 4)], WONDER],
  'コーラル・ライラ': [[{ k: 'food', n: 4 }], [ANYB(4)], [{ k: 'ipPassed', n: 1 }], WONDER],
  'ジャスミン・メイ': [[{ k: 'food', n: 3 }], [ANYB(3)], [{ k: 'ipPassed', n: 1 }, P('any', 4)], WONDER],
};

const TEXT: Record<string, [string, string]> = {
  'ビスキュイ・バステト': ['フリーアクション（ラウンド1回）：研究所駒がある自分の都市1つにつき工業トラックを1歩進める。', 'パス時：研究所駒が1個以上ある自分の都市1つにつき1工業点。'],
  'ナタ・パステル': ['永続：「工業トラックを進める」アクションエリアのコストが鉄1個少ない。', 'パス時：今回のパスで得る1工業点につき1勝利点。'],
  'ソルビー・ショコラ': ['フリーアクション（各ラウンド1回）：食料3歩以上→麦1／5歩以上→道駒1個／9歩以上→任意の繁栄1歩。', 'パス時：地図上のクッキーラビット駒1個につき1勝利点。'],
  'リッカ・ベリー': ['永続：「クッキーラビット駒を置く」アクションエリアのコストの麦を、好きな個数だけ木材で払える。', 'パス時：クッキーラビット駒がある自分の都市1つにつき1都市点。'],
  'ロータス・チェー': ['フリーアクション（ラウンド1回）：表向きの地形タイルを1枚裏返し、その効果を得る。', '即時：専用の都市点レートタイルを使う（1/3/5/7/9/12都市点）。'],
  'アリス・ティーローズ': ['永続：任意の建物駒3個が連続して隣接していれば、同じ種類を含んでも都市とみなす。', '永続：時計塔駒は単独でも都市になる。パス時：自分の都市1つにつき1勝利点。'],
  'エルサ・スカイル': ['永続：地形タイルを他の地形タイルに隣接していないヘクスにも置ける。パス時：地形タイルを1枚置く。', 'パス時：接続している港1つにつき2勝利点。'],
  'エリ・マカロン': ['特性：開始時の収入値が多い。', 'パス時：基礎資源の収入値のうち最小値に等しい勝利点。'],
  'セナ・デライト': ['特性：6種類のスイーツタグを1個ずつ持つ。永続：市民カードを1枚プレイするたびゴールドの収入値+1。', '永続：市民カードを1枚プレイするたび2勝利点。'],
  'カルメン・メロ': ['単発：第1ラウンドの収入時、カードを2枚多く引き、手札から2枚を無料でオートメーション化。永続：産業ボーナスを得るたびキューブ1個をボードに置く。', 'パス時：ボード上のキューブ1個につき1勝利点。'],
  'サクラ・モチ': ['特性：和菓子タグを1個持つ。フリーアクション（ラウンド1回）：手札1枚を捨ててアクションディスクを1枚取る。', '即時：市民デッキからパス時カードを2枚探して手札に加え、1枚を無料でプレイする。'],
  'グレーテル・シュトーレン': ['収入時：ダイヤ1個。永続：アクションスペースの手札コストを同じ個数のダイヤで払える。', '永続：その方法でダイヤを払うたび、1個につき3勝利点。'],
  'ジャスミン・メイ': ['永続：「スキルタイルを1枚得る」ボーナスで2枚得る。', 'パス時：手元のスキルタイル1枚につき1勝利点。'],
  'コーラル・ライラ': ['収入時：繁栄の合計歩数が最も少ない1色を合計2歩進める。', 'パス時：最も少ない1色の合計歩数1歩につき2勝利点。'],
};

/** キャラクターの上方修正（ヴァリアント、docs/decisions_16）の対象と変更点。画面の説明に使う */
export const BUFF_NOTES: Record<string, string[]> = {
  'サクラ・モチ': ['特性：和菓子タグ1個 → 2個', '追加のフリーアクション（ラウンド1回）：手札2枚を捨てて市民カードを2枚引く'],
  'アリス・ティーローズ': ['基本能力：同じ種類を含んでも都市 → 隣接した建物駒を、3種類以上の組に分けて都市の数が最も多くなるように数える', '追加の能力：建物駒のコストの鉄が常に1少ない', '時計塔能力：パス時の自分の都市1つにつき1勝利点 → 1都市点'],
  'ナタ・パステル': ['鉱業列の印刷オートメーション：ゴールドの収入値+2 → 道駒1個', 'パス時の工業点アイコンの値：1/1/2/2 → 1/2/3/4', '追加の能力：「工業トラックを進める」アクションエリア（F・Q）の手札コストが常に1枚'],
  'カルメン・メロ': ['追加の能力：産業列のオートメーション化の上限が各列+1（最初から2枚、最大4枚）'],
  'ビスキュイ・バステト': ['鉱業列の印刷オートメーション：ゴールドの収入値+2 → 道駒1個', '追加の能力：研究所駒を置くたび、工業トラックを2歩進める'],
  'ソルビー・ショコラ': ['農業列の印刷オートメーション：ゴールドの収入値+4 → 地形タイル1枚', '追加のフリーアクション（ラウンド1回）：食料7歩以上 → 地形タイル1枚'],
  'リッカ・ベリー': ['農業列の印刷オートメーション：ゴールドの収入値+4 → 地形タイル1枚', '基本能力：麦を木材で払える → 麦をゴールドで払える', '時計塔能力：クッキーラビット駒がある都市1つにつき1都市点 → クッキーラビット駒1個につき2勝利点'],
  'グレーテル・シュトーレン': ['基本能力：収入時のダイヤ1個 → 2個'],
  'ロータス・チェー': ['時計塔能力：都市点レート 1/3/5/7/9/12 → 1/3/6/10/15/21'],
  'コーラル・ライラ': ['林業列の印刷オートメーション：1都市点 → 道駒1個'],
  'ジャスミン・メイ': ['林業列の印刷オートメーション：1都市点 → 道駒1個', '初期：ゴールドの収入値10 → 14、麦・木材を1個ずつ多く持つ'],
};
/** 上方修正で書き換わる特性のスイーツタグ */
export const BUFF_TRAIT_TAGS: Record<string, Partial<Record<Tag, number>>> = { 'サクラ・モチ': { 和菓子: 2 } };
/** 上方修正で書き換わる基本能力の文 */
const BUFF_BASIC_TEXT: Record<string, string> = {
  'サクラ・モチ': '特性：和菓子タグを2個持つ。フリーアクション（ラウンド1回）：手札1枚を捨ててアクションディスクを1枚取る。フリーアクション（ラウンド1回）：手札2枚を捨てて市民カードを2枚引く。',
  'アリス・ティーローズ': '永続：つながった建物駒を、建物駒が3種類以上あるつながった組に分けてよい。都市の数は、組の数が最も多くなる分け方で数える（都市どうしが隣接していてもよい）。永続：建物駒のコストの鉄が1少ない。',
  'ビスキュイ・バステト': 'フリーアクション（ラウンド1回）：研究所駒がある自分の都市1つにつき工業トラックを1歩進める。永続：研究所駒を1個置くたび、工業トラックを2歩進める。',
  'グレーテル・シュトーレン': '収入時：ダイヤ2個。永続：アクションスペースの手札コストを同じ個数のダイヤで払える。',
  'ソルビー・ショコラ': 'フリーアクション（各ラウンド1回）：食料3歩以上→麦1／5歩以上→道駒1個／7歩以上→地形タイル1枚／9歩以上→任意の繁栄1歩。',
  'リッカ・ベリー': '永続：「クッキーラビット駒を置く」アクションエリアのコストの麦を、好きな個数だけゴールドで払える（麦1個につき1ゴールド）。',
  'ナタ・パステル': '永続：「工業トラックを進める」アクションエリアのコストが鉄1個少なく、手札コストが常に1枚。',
  'カルメン・メロ': '単発：第1ラウンドの収入時、カードを2枚多く引き、手札から2枚を無料でオートメーション化。永続：産業ボーナスを得るたびキューブ1個をボードに置く。永続：産業列のオートメーション化の上限が各列1多い。',
};

/** 上方修正で書き換わる時計塔能力の文 */
const BUFF_CLOCK_TEXT: Record<string, string> = {
  'リッカ・ベリー': 'パス時：地図上のクッキーラビット駒1個につき2勝利点。',
  'アリス・ティーローズ': '永続：時計塔駒は単独でも都市になる。パス時：自分の都市1つにつき1都市点。',
  'ロータス・チェー': '即時：専用の都市点レートタイルを使う（1/3/6/10/15/21都市点）。',
};

/** 上方修正で書き換わる初期の資源・収入（通常の値に足す） */
const BUFF_START: Record<string, { res?: Partial<Res>; income?: Partial<Res> }> = {
  'ジャスミン・メイ': { res: { wheat: 1, wood: 1 }, income: { gold: 4 } },
};
/** 初期の資源・ダイヤ・収入（上方修正を反映する） */
export function startOf(config: GameConfig, name: string): { res: Res; diamond: number; income: Res } {
  const c = CHARACTERS[name];
  const add = (isBuffed(config, name) && BUFF_START[name]) || {};
  const plus = (base: Res, d: Partial<Res> = {}): Res => ({ gold: base.gold + (d.gold ?? 0), wheat: base.wheat + (d.wheat ?? 0), wood: base.wood + (d.wood ?? 0), iron: base.iron + (d.iron ?? 0) });
  return { res: plus(c.startRes, add.res), diamond: c.startDiamond, income: plus(c.startIncome, add.income) };
}

/** このキャラクターに上方修正が効いているか */
export function isBuffed(config: GameConfig, name: string | null): boolean {
  return !!config.variants.charBuff && name !== null && name in BUFF_NOTES;
}
/** 時計塔能力の文（上方修正を反映する） */
export function clockTextOf(config: GameConfig, name: string): string {
  return (isBuffed(config, name) && BUFF_CLOCK_TEXT[name]) || CHARACTERS[name].clockText;
}
/** 基本能力の文（上方修正を反映する） */
export function basicTextOf(config: GameConfig, name: string): string {
  return (isBuffed(config, name) && BUFF_BASIC_TEXT[name]) || CHARACTERS[name].basicText;
}

interface RawChar {
  name: string;
  startResources: { gold: number; wheat: number; wood: number; iron: number; diamond: number };
  startIncome: Res;
}

export const CHARACTERS: Record<string, CharacterDef> = Object.fromEntries(
  (raw as unknown as RawChar[]).map((c) => {
    const def: CharacterDef = {
      name: c.name,
      board: CHAR_BOARD[c.name],
      startRes: { gold: c.startResources.gold, wheat: c.startResources.wheat, wood: c.startResources.wood, iron: c.startResources.iron },
      startDiamond: c.startResources.diamond,
      startIncome: c.startIncome,
      clock: CLOCK[c.name],
      basicText: TEXT[c.name][0],
      clockText: TEXT[c.name][1],
    };
    if (c.name === 'セナ・デライト')
      def.traitTags = { ショートケーキ: 1, タルト: 1, ブラウニー: 1, ティラミス: 1, マカロン: 1, 和菓子: 1 };
    if (c.name === 'サクラ・モチ') def.traitTags = { 和菓子: 1 };
    return [c.name, def];
  }),
);

/** 両面7枚の組み合わせ（推定。同じボードを2人が使えないようにする） */
export const BOARD_PAIRS: [string, string][] = [
  ['アリス・ティーローズ', 'ロータス・チェー'],
  ['エリ・マカロン', 'エルサ・スカイル'],
  ['ナタ・パステル', 'ビスキュイ・バステト'],
  ['グレーテル・シュトーレン', 'サクラ・モチ'],
  ['ソルビー・ショコラ', 'リッカ・ベリー'],
  ['カルメン・メロ', 'セナ・デライト'],
  ['コーラル・ライラ', 'ジャスミン・メイ'],
];
