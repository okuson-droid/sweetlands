// シミュレーターの土台：パイロットの条件での対局の作成、合法手の絞り込み、得点の集計、決定化（sim/PLAN.md §6.2・§6.3）
// エンジンの公開 API（createGame / getOptions / applyMove）と queries.ts・scoring.ts の関数だけを使う。
import { applyMove, createGame, getOptions } from '../../src/game/engine';
import { finalScores } from '../../src/game/scoring';
import type { GameConfig, GameState, Option } from '../../src/game/types';

export const TARGET_CHAR = 'エリ・マカロン';

/** 実験の条件。map は使う面、adv は場に出す上級スキルタイル（null はなし） */
export interface Condition {
  name: string;
  char: string;
  map: 'A' | 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
  adv: number | null;
}

export function conditionByName(name: string, char = TARGET_CHAR): Condition {
  if (name === 'A') return { name, char, map: 'A', adv: null };
  const b = /^B([1-5])$/.exec(name);
  if (b) return { name, char, map: name as Condition['map'], adv: null };
  const a = /^A\+adv(\d+)$/.exec(name);
  if (a) return { name, char, map: 'A', adv: Number(a[1]) };
  throw new Error(`不明な条件: ${name}`);
}

/** P1〜P3 の20条件（P1 の A面が P2・P3 の基準を兼ねる） */
export const PILOT_CONDITIONS = ['A', 'B1', 'B2', 'B3', 'B4', 'B5', ...Array.from({ length: 14 }, (_, i) => `A+adv${i + 1}`)];

/** 1人プレイの設定。アプリの ?auto=1&players=1 と同じ設定にし、同じシードで同じ初期状態になるようにする（§6.7） */
export function pilotConfig(adv: boolean): GameConfig {
  return { players: 1, names: ['いちご'], variants: { turnOrder: false, draft: false, advSkills: adv, freeChar: false, setupDraft: false } };
}

/** 条件どおりの対局を作る。上級スキルタイルは作成直後に対象の1種だけにする（§6.2） */
export function newGame(cond: Condition, seed: number): GameState {
  const s = createGame(pilotConfig(cond.adv !== null), seed);
  if (cond.adv !== null) s.advSkills = [cond.adv];
  return s;
}

/** 準備のうち、条件で固定する選択（キャラクター・地図ボード）。それ以外は null（AI が選ぶ） */
export function forcedSetupMove(s: GameState, cond: Condition): string | null {
  const pd = s.pending;
  if (!pd) return null;
  if (pd.step === 'setupChar') return `char:${cond.char}`;
  if (pd.step === 'setupMap') {
    if (cond.map === 'A') return pd.options.find((o) => o.id.startsWith('map:A@'))!.id;
    return `map:${cond.map}`;
  }
  return null;
}

/** AI が選べる合法手：マイルストーンの獲得（fa4:*）を外す（§6.2） */
export function legal(s: GameState): Option[] {
  return getOptions(s).filter((o) => !o.id.startsWith('fa4:'));
}

let keepLog = false;
/** 等価性の検査用：局面のログを空にしない（本来のエンジンの動きのまま進める） */
export function setKeepLog(v: boolean): void {
  keepLog = v;
}

/** 局面を進める。シミュレーターの中では局面のログを空にしてから進める（§6.2） */
export function step(s: GameState, id: string): GameState {
  if (!keepLog) s.log = [];
  return applyMove(s, id);
}

// ---- 得点 ----

export const SCORE_KEYS = ['vp', 'pros0', 'pros1', 'pros2', 'pros3', 'pros4', 'pros5', 'cp', 'tentBonus', 'houseBonus', 'bldgBonus', 'gold', 'diamond', 'ports'] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export type Breakdown = Record<ScoreKey, number> & { total: number };

/** 最終得点の内訳。マイルストーンと最終得点計算タイルの行を除いて合計する（§6.2）。
 *  finalScores の内訳は全員同じ並び（decisions §11.2）なので、並びの位置で項目を対応させる */
export function breakdown(s: GameState): Breakdown {
  const items = finalScores(s)[0].items.filter((x) => x.label !== 'マイルストーン' && !x.label.startsWith('最終得点計算'));
  if (items.length !== SCORE_KEYS.length) throw new Error(`得点の内訳の並びが想定と違う: ${items.map((x) => x.label).join(',')}`);
  const out = { total: 0 } as Breakdown;
  SCORE_KEYS.forEach((k, i) => {
    out[k] = items[i].vp;
    out.total += items[i].vp;
  });
  return out;
}

export function scoreTotal(s: GameState): number {
  return breakdown(s).total;
}

// ---- AI 用の乱数（mulberry32） ----

export class Rng {
  private t: number;
  constructor(seed: number) {
    this.t = seed >>> 0;
  }
  next(): number {
    let t = (this.t = (this.t + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/** AI の先読み用の仮の局面：市民デッキの残りを ID 順に並べ替えてから AI の乱数で混ぜ直し、
 *  エンジンの乱数の状態も AI の乱数で置き換える（実際の並びとその後の混ぜ直しを覗かない。§6.3） */
export function determinize(s: GameState, rng: Rng): GameState {
  const d = structuredClone(s);
  const deck = [...d.deck].sort();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  d.deck = deck;
  d.rng = Math.floor(rng.next() * 4294967296);
  return d;
}
