// 1局を回し、得点・内訳・行動の統計・異常を記録する（sim/PLAN.md §6.6・§7）
import { connectedPorts } from '../../src/game/queries';
import type { GameState } from '../../src/game/types';
import { Agent, type AgentConfig } from './ai';
import { SCORE_KEYS, breakdown, forcedSetupMove, legal, newGame, step, type Breakdown, type Condition } from './core';

export const MAX_MOVES = 3000;

export interface GameResult {
  cond: string;
  seed: number;
  ai: string;
  aiSeed: number;
  score: number;
  breakdown: Breakdown;
  moves: string[];
  ms: number;
  evals: number;
  /** 行動の統計 */
  areaUse: Record<string, number>;
  cardsPlayed: number;
  automations: number;
  clockRound: number | null;
  ports: number;
  advTaken: boolean;
  advRound: number | null;
  milestoneMoves: number;
  /** 異常（合法手のない局面、手数超過、負の資源など） */
  anomalies: string[];
  /** ラウンドごとの記録（棋譜用） */
  rounds: { round: number; actions: string[]; scoreAtEnd: number }[];
}

function negatives(s: GameState): string | null {
  const p = s.players[0];
  for (const [k, v] of Object.entries(p.res)) if (v < 0) return `負の資源 ${k}=${v}`;
  if (p.diamond < 0) return `負のダイヤ ${p.diamond}`;
  if (p.discs < 0) return `負のディスク ${p.discs}`;
  return null;
}

/** 1局を回す。onDecision は検査用（各判断の局面と選んだ手を受け取る） */
export function playGame(cond: Condition, seed: number, cfg: AgentConfig, aiSeed: number, onDecision?: (s: GameState, id: string) => void): GameResult {
  const t0 = performance.now();
  const agent = new Agent(cfg, aiSeed);
  let s = newGame(cond, seed);
  const moves: string[] = [];
  const anomalies: string[] = [];
  const areaUse: Record<string, number> = {};
  let cardsPlayed = 0;
  let automations = 0;
  let clockRound: number | null = null;
  let advRound: number | null = null;
  let milestoneMoves = 0;
  const rounds: GameResult['rounds'] = [];
  let cur: GameResult['rounds'][number] = { round: 1, actions: [], scoreAtEnd: 0 };
  while (s.pending && !s.finished) {
    if (moves.length >= MAX_MOVES) {
      anomalies.push(`手数が ${MAX_MOVES} を超えた`);
      break;
    }
    if (legal(s).length === 0) {
      anomalies.push(`合法手のない局面（${s.pending.step}）`);
      break;
    }
    const id = forcedSetupMove(s, cond) ?? agent.choose(s);
    onDecision?.(s, id);
    const st = s.pending.step;
    const round = s.round;
    if (st === 'turn') {
      if (id.startsWith('area:')) {
        const a = id.split(':')[1];
        areaUse[a] = (areaUse[a] ?? 0) + 1;
      }
      if (id.startsWith('play:')) cardsPlayed++;
      if (id === 'fa8') clockRound = round;
      if (id.startsWith('fa4:')) milestoneMoves++;
      if (id !== 'endTurn') cur.actions.push(`${id}｜${s.pending.options.find((o) => o.id === id)?.label ?? ''}`);
    } else if (['terrain', 'road', 'mix', 'bldSpot', 'rabbit', 'clockPlace', 'pros', 'skill', 'automateOffer', 'freeAutomate'].includes(st) && id !== 'skip' && id !== 'stop') {
      cur.actions.push(`  └ ${s.pending.options.find((o) => o.id === id)?.label ?? id}`);
    }
    if ((st === 'automateOffer' || st === 'freeAutomate') && id.startsWith('auto:')) automations++;
    if (st === 'skill' && id.startsWith('adv:')) advRound = round;
    moves.push(id);
    s = step(s, id);
    const neg = negatives(s);
    if (neg) anomalies.push(`${neg}（${moves.length}手目）`);
    if (s.round !== round || s.finished) {
      cur.scoreAtEnd = breakdown(s).total;
      rounds.push(cur);
      cur = { round: s.round, actions: [], scoreAtEnd: 0 };
    }
  }
  if (!s.finished && anomalies.length === 0) anomalies.push('終局しなかった');
  const bd = breakdown(s);
  return {
    cond: cond.name,
    seed,
    ai: cfg.kind,
    aiSeed,
    score: bd.total,
    breakdown: bd,
    moves,
    ms: performance.now() - t0,
    evals: agent.evals,
    areaUse,
    cardsPlayed,
    automations,
    clockRound,
    ports: connectedPorts(s.players[0]),
    advTaken: advRound !== null,
    advRound,
    milestoneMoves,
    anomalies,
    rounds,
  };
}

export const CSV_AREAS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'];

export function csvHeader(): string {
  return ['cond', 'seed', 'config', 'ai', 'aiSeed', 'score', ...SCORE_KEYS.map((k) => `s_${k}`), 'cardsPlayed', 'automations', 'clockRound', 'ports', 'advTaken', 'advRound', ...CSV_AREAS.map((a) => `area_${a}`), 'moves', 'ms', 'anomalies'].join(',');
}

export function csvRow(r: GameResult, config: string): string {
  // 模倣ボードのエリア（L1・K8 など）は先頭の文字でまとめる
  const area: Record<string, number> = {};
  for (const [k, v] of Object.entries(r.areaUse)) area[k[0]] = (area[k[0]] ?? 0) + v;
  return [r.cond, r.seed, config, r.ai, r.aiSeed, r.score, ...SCORE_KEYS.map((k) => r.breakdown[k]), r.cardsPlayed, r.automations, r.clockRound ?? '', r.ports, r.advTaken ? 1 : 0, r.advRound ?? '', ...CSV_AREAS.map((a) => area[a] ?? 0), r.moves.length, Math.round(r.ms), JSON.stringify(r.anomalies.join(' / ')).replace(/,/g, '、')].join(',');
}
