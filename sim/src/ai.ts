// プレイ AI（sim/PLAN.md §6.3）
// v0：乱択。v1：手番の主行動を候補ごとに解決まで仮に進めて比べる（1手番の先読み）。
// v2：主行動の列を、現在のラウンドの終わり（パス）までビームで列挙する。
// 細かい選択（ヘクス・辺・繁栄トラックなど）は、v1・v2 とも1手ずつ評価関数で選ぶ。
// 先読みはすべて決定化した仮の局面（core.determinize）の上で行い、実際の市民デッキの並びは見ない。
import type { GameState } from '../../src/game/types';
import { Rng, determinize, legal, scoreTotal, step } from './core';
import { WEIGHT_NAMES, baseEval, features, passesLeft, type Weights } from './evaluate';

export interface AgentConfig {
  kind: 'v0' | 'v1' | 'v2';
  weights: Weights;
  /** 決め打ちのフリーアクション（§6.3）。clock：時計塔駒を置けるなら置く。prePass：パスの前にディスクと手札（1枚を残す）を基礎資源に替える */
  rules: { clock: boolean; prePass: boolean };
  /** passGain の項を計算する上位の候補数 */
  topK: number;
  /** v2 のビーム幅と深さ（主行動の数） */
  beamWidth: number;
  beamDepth: number;
  /** v2 で1つの局面から解決まで進める候補の数（1手だけ進めた評価の上位） */
  beamExpand: number;
  /** v2 の決定化の数 K（第5版 §6.3） */
  determinizations: number;
}

/** v2 のスキル梯子（第5版 §5.5・§6.5）：探索の量だけを変える3段階。中が調整に使う設定 */
export const V2_LADDER = {
  S: { beamWidth: 1, beamDepth: 4, beamExpand: 3, determinizations: 2 },
  M: { beamWidth: 2, beamDepth: 4, beamExpand: 4, determinizations: 2 },
  L: { beamWidth: 4, beamDepth: 4, beamExpand: 5, determinizations: 2 },
} as const;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

export const DEFAULT_AGENT: Omit<AgentConfig, 'kind' | 'weights'> = { rules: { clock: true, prePass: true }, topK: 4, ...V2_LADDER.M };

/** 両替にあたるフリーアクション（主行動の前に付けて候補を作る） */
const CONVERSIONS = new Set(['fa2', 'fa3', 'fa5', 'fa6', 'fa7d', 'fa7h']);
const isMain = (id: string) => id.startsWith('area:') || id.startsWith('play:') || id.startsWith('flip:');
/** 細かい選択のうち、次のラウンドの収入まで読まないと価値が分からないもの（ラウンド支援駒の置き場所） */
const DEEP_STEPS = new Set(['support', 'passMove']);
const EPS = 1e-6;
/** 主行動の前に使える両替の回数の上限（1手番あたり） */
const MAX_CONVERSIONS = 6;
const MAX_RESOLVE = 400;

export class Agent {
  readonly cfg: AgentConfig;
  private rng: Rng;
  /** 計測：評価関数を呼んだ回数 */
  evals = 0;
  constructor(cfg: AgentConfig, seed: number) {
    this.cfg = cfg;
    this.rng = new Rng(seed);
  }

  /** 主行動の前に使った両替（同じ手番の中で、逆向きの両替と行き来しないために覚える） */
  private freeUsed: string[] = [];

  /** 実際の局面で、次に選ぶ合法手 ID を返す */
  choose(s: GameState): string {
    const opts = legal(s);
    if (opts.length === 0) throw new Error('合法手がない');
    if (opts.length === 1) return opts[0].id;
    if (this.cfg.kind === 'v0') return opts[this.rng.int(opts.length)].id;
    const det = determinize(s, this.rng);
    if (s.pending!.step !== 'turn') return this.chooseSub(det, true);
    const id = this.chooseTurn(det);
    if (CONVERSIONS.has(id) && !s.turnMainDone) this.freeUsed.push(id);
    else if (!CONVERSIONS.has(id)) this.freeUsed = [];
    return id;
  }

  /** 主行動の前の両替として選んでよいか：同じ手番で逆向きの両替をしておらず、回数が上限未満 */
  private conversionAllowed(id: string): boolean {
    if (this.freeUsed.length >= MAX_CONVERSIONS) return false;
    const inverse: Record<string, string[]> = { fa3: ['fa5'], fa5: ['fa3', 'fa2'], fa2: ['fa5'] };
    return !(inverse[id] ?? []).some((x) => this.freeUsed.includes(x));
  }

  private ev(s: GameState): number {
    this.evals++;
    return baseEval(s, this.cfg.weights);
  }

  /** 同点を AI の乱数で崩して最大のものを選ぶ */
  private argmax<T>(items: T[], val: (x: T) => number): T {
    let best: T[] = [];
    let bv = -Infinity;
    for (const x of items) {
      const v = val(x);
      if (v > bv + EPS) (bv = v), (best = [x]);
      else if (Math.abs(v - bv) <= EPS) best.push(x);
    }
    return best.length === 1 ? best[0] : best[this.rng.int(best.length)];
  }

  // ---- 細かい選択 ----

  /** 手番以外の選択待ち：選択肢ごとに1手進めた局面を評価して選ぶ。deep はラウンド支援駒の置き場所を次の手番まで読むか */
  chooseSub(s: GameState, deep: boolean): string {
    const opts = legal(s);
    if (opts.length === 1) return opts[0].id;
    const st = s.pending!.step;
    if (deep && DEEP_STEPS.has(st)) return this.argmax(opts, (o) => this.ev(this.resolveToTurn(step(s, o.id)))).id;
    // スキルタイル（上級を含む）は、パス時の効果が価値の多くを占めるため、手番に戻るまで進めて passGain の項まで含めて比べる
    if (st === 'skill') return this.argmax(opts, (o) => this.fullEval(this.resolve(step(s, o.id)))).id;
    return this.argmax(opts, (o) => this.ev(step(s, o.id))).id;
  }

  /** 手番の選択待ちに戻るまで（またはクリーンナップ・終局まで）、細かい選択を1手ずつ評価して進める */
  resolve(s: GameState, deep = false): GameState {
    let n = 0;
    while (s.pending && !s.finished && s.pending.step !== 'turn' && s.phase !== 'cleanup') {
      if (++n > MAX_RESOLVE) throw new Error('解決が終わらない');
      s = step(s, this.chooseSub(s, deep));
    }
    return s;
  }

  /** 次の手番の選択待ちまで進める（ラウンドをまたぐ。ラウンド支援駒の置き場所の評価に使う） */
  private resolveToTurn(s: GameState): GameState {
    let n = 0;
    while (s.pending && !s.finished && s.pending.step !== 'turn') {
      if (++n > MAX_RESOLVE) throw new Error('解決が終わらない');
      s = step(s, this.chooseSub(s, false));
    }
    return s;
  }

  /** いまパスしたら得る得点（手番の選択待ちの局面でだけ計算する。主行動のあとなら手番を終えてからパスする） */
  passGain(s: GameState): number {
    if (s.finished || s.phase !== 'action' || s.pending?.step !== 'turn') return 0;
    const before = scoreTotal(s);
    let t = s;
    if (!legal(t).some((o) => o.id === 'pass')) {
      if (!legal(t).some((o) => o.id === 'endTurn')) return 0;
      t = this.resolve(step(t, 'endTurn'), false);
      if (t.pending?.step !== 'turn' || !legal(t).some((o) => o.id === 'pass')) return 0;
    }
    t = this.resolve(step(t, 'pass'), false);
    return scoreTotal(t) - before;
  }

  /** 評価値（passGain の項を含む） */
  private fullEval(s: GameState): number {
    const base = this.ev(s);
    if (s.finished) return base;
    return base + this.cfg.weights[11] * this.passGain(s) * passesLeft(s);
  }

  /** 事例分析用（判断には使わない）：ある手を選んで解決まで進めた局面の評価値と、特徴量ごとの寄与 */
  explainMove(s: GameState, id: string): { value: number; score: number; parts: Record<string, number> } {
    const det = determinize(s, this.rng);
    const c = this.resolve(step(det, id));
    const f = features(c);
    const parts: Record<string, number> = {};
    WEIGHT_NAMES.forEach((n, i) => {
      if (i !== 11 && f[i] !== 0) parts[n] = this.cfg.weights[i] * f[i];
    });
    const pg = this.passGain(c) * passesLeft(c);
    if (pg !== 0) parts.passGain = this.cfg.weights[11] * pg;
    const score = scoreTotal(c);
    return { value: score + Object.values(parts).reduce((a, b) => a + b, 0), score, parts };
  }

  // ---- 手番 ----

  private chooseTurn(det: GameState): string {
    const ids = legal(det).map((o) => o.id);
    if (this.cfg.rules.clock && ids.includes('fa8')) return 'fa8';
    let pick = this.cfg.kind === 'v2' && !det.turnMainDone ? this.beamK(det) : this.oneTurn(det, true);
    if (pick === 'pass' && this.cfg.rules.prePass) {
      if (ids.includes('fa7d')) pick = 'fa7d';
      else if (ids.includes('fa7h') && det.players[0].hand.length >= 2) pick = 'fa7h';
    }
    return pick;
  }

  /** 候補を1つずつ解決まで進めた局面（両替を前に付けた候補を含む）。value は passGain を含まない評価 */
  private candidates(det: GameState, root = false): { first: string; s: GameState; value: number }[] {
    const ids = legal(det)
      .map((o) => o.id)
      .filter((id) => !root || det.turnMainDone || !CONVERSIONS.has(id) || this.conversionAllowed(id));
    const out: { first: string; s: GameState; value: number }[] = [];
    for (const id of ids) {
      const c = this.resolve(step(det, id));
      out.push({ first: id, s: c, value: this.ev(c) });
      // 両替のあとにだけ選べるようになる主行動
      if (CONVERSIONS.has(id) && !det.turnMainDone && c.pending?.step === 'turn') {
        for (const m of legal(c).map((o) => o.id)) {
          if (!isMain(m) || ids.includes(m)) continue;
          const c2 = this.resolve(step(c, m));
          out.push({ first: id, s: c2, value: this.ev(c2) });
        }
      }
    }
    return out;
  }

  /** v1：1手番の先読み。root は実際の局面での判断か（両替の行き来の制限をかける） */
  private oneTurn(det: GameState, root = false): string {
    const cands = this.candidates(det, root);
    // 主行動のあと：フリーアクションは、手番を終える場合より良くなるときだけ選ぶ（同じ局面を行き来しない）
    if (det.turnMainDone) {
      const end = cands.find((c) => c.first === 'endTurn');
      if (end) {
        const better = cands.filter((c) => c.first !== 'endTurn' && c.value > end.value + EPS);
        if (better.length === 0) return 'endTurn';
      }
    }
    cands.sort((a, b) => b.value - a.value);
    const top = cands.slice(0, this.cfg.topK);
    return this.argmax(top, (c) => c.value + this.cfg.weights[11] * this.passGain(c.s) * passesLeft(c.s)).first;
  }

  // ---- v2：ラウンドの終わりまでの列挙 ----

  /** 列挙の中では、主行動のあとのフリーアクションは省いて手番を終え、次の手番の頭まで進める（計算量のため） */
  private finishTurn(s: GameState): GameState {
    if (s.pending?.step === 'turn' && s.turnMainDone && !s.finished && s.phase === 'action' && legal(s).some((o) => o.id === 'endTurn')) return this.resolve(step(s, 'endTurn'));
    return s;
  }

  private beam(det: GameState): Map<string, number> {
    const W = this.cfg.beamWidth;
    const D = this.cfg.beamDepth;
    type Node = { first: string; s: GameState; value: number };
    const leaves: Node[] = [];
    let frontier: Node[] = [{ first: '', s: det, value: 0 }];
    const seen = new Set<string>();
    const isLeaf = (s: GameState) => s.finished || s.phase !== 'action';
    for (let depth = 0; depth < D && frontier.length > 0; depth++) {
      const next: Node[] = [];
      for (const node of frontier) {
        // 1手だけ進めた局面の評価で候補を絞り、上位とパスだけを解決まで進める
        const opts = legal(node.s);
        const pre = opts.map((o) => ({ id: o.id, s: step(node.s, o.id) })).map((x) => ({ ...x, v: this.ev(x.s) }));
        pre.sort((a, b) => b.v - a.v);
        const keep = pre.filter((x, i) => i < this.cfg.beamExpand || x.id === 'pass');
        for (const o of keep) {
          let c = this.resolve(o.s);
          if (!isLeaf(c)) c = this.finishTurn(c);
          const first = node.first || o.id;
          if (isLeaf(c)) {
            leaves.push({ first, s: c, value: this.ev(c) });
            continue;
          }
          if (c.pending?.step !== 'turn') continue;
          const key = stateKey(c);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ first, s: c, value: this.ev(c) });
        }
      }
      next.sort((a, b) => b.value - a.value);
      frontier = next.slice(0, W);
    }
    // 深さの上限に達した列はそこでパスする
    for (const node of frontier) {
      if (!legal(node.s).some((o) => o.id === 'pass')) continue;
      const c = this.resolve(step(node.s, 'pass'));
      leaves.push({ first: node.first, s: c, value: this.ev(c) });
    }
    // 最初の手ごとに、その手から始まる列の最良の葉の評価値
    const best = new Map<string, number>();
    for (const l of leaves) if (l.value > (best.get(l.first) ?? -Infinity)) best.set(l.first, l.value);
    return best;
  }

  /** v2（第5版）：混ぜ直した並びを K 個作り、それぞれでビームの列挙を行って、最初の主行動ごとに葉の評価値を平均して選ぶ。
   *  ある並びの列挙に現れなかった最初の手には、その並びの葉の評価値の最小値を当てる（控えめに見る） */
  private beamK(det: GameState): string {
    const K = this.cfg.determinizations;
    const maps: Map<string, number>[] = [];
    for (let k = 0; k < K; k++) {
      const m = this.beam(k === 0 ? det : determinize(det, this.rng));
      if (m.size) maps.push(m);
    }
    if (maps.length === 0) return this.oneTurn(det, true);
    const firsts = [...new Set(maps.flatMap((m) => [...m.keys()]))];
    const avg = (f: string) => mean(maps.map((m) => m.get(f) ?? Math.min(...m.values())));
    return this.argmax(firsts, avg);
  }
}

/** 局面のハッシュ（順番違いで同じ局面に行き着いた列をまとめる） */
function stateKey(s: GameState): string {
  const p = s.players[0];
  return JSON.stringify([s.round, s.turnMainDone, p.res, p.diamond, p.income, p.hand, p.played, p.automated, p.discs, p.score, p.pros, p.food, p.carriage, p.loco, p.roads, p.skills, p.taken, p.usedFree, Object.entries(p.hexes).filter(([, h]) => h.tile || h.building || h.rabbit), s.areas, s.deck.length]);
}
