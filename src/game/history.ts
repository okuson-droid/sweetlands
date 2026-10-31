// 対局の記録・取り消し・リプレイ（ui_design §2-11, §3, §15）
import { applyMove, createGame } from './engine';
import type { GameConfig, GameState } from './types';

export interface GameRecord {
  config: GameConfig;
  seed: number;
  moves: string[]; // 選んだ合法手 ID の列
}

/**
 * prev → next の1手が「チェックポイント」になるか（以後この手より前に取り消せない）。
 * 新しい情報が出る（乱数の消費・山札の公開）か、選択権が別のプレイヤーへ移ったとき。
 */
export function isCheckpoint(prev: GameState, next: GameState): boolean {
  if (prev.rng !== next.rng) return true;
  if (prev.deck.length !== next.deck.length || prev.deck[0] !== next.deck[0]) return true;
  if (next.events.some((e) => e.t === 'card' && (e.reason === 'draw' || e.reason === 'search' || e.reason === 'draft'))) return true;
  const step = next.pending?.step;
  if (step === 'search' || step === 'draftPick') return true; // 山札の中身や他人の束が見える
  if ((prev.pending?.player ?? -1) !== (next.pending?.player ?? -1)) return true;
  if (prev.round !== next.round || prev.phase !== next.phase || next.finished) return true;
  if (prev.pending?.step === 'turn' && next.pending?.step === 'turn' && !next.turnActive) return true;
  return false;
}

/** 記録から対局を再現する（upTo 手目まで） */
export function replay(record: GameRecord, upTo = record.moves.length): GameState {
  let s = createGame(record.config, record.seed);
  for (let i = 0; i < upTo; i++) s = applyMove(s, record.moves[i]);
  return s;
}

/** リプレイ用の索引：手の列を1回だけ通して再生し、every 手ごとの局面と、各ラウンドが始まった手数を覚える */
export interface Timeline {
  every: number;
  /** snaps[k] は every*k 手まで進めた局面 */
  snaps: GameState[];
  /** 各ラウンドの最初の局面の手数（第1ラウンドから順） */
  roundStarts: number[];
}

export function buildTimeline(record: GameRecord, every = 20): Timeline {
  let s = createGame(record.config, record.seed);
  const snaps = [s];
  const roundStarts: number[] = [];
  let round = 0;
  for (let i = 0; i <= record.moves.length; i++) {
    if (s.round !== round) roundStarts.push(i), (round = s.round);
    if (i === record.moves.length) break;
    s = applyMove(s, record.moves[i]);
    if ((i + 1) % every === 0) snaps.push(s);
  }
  return { every, snaps, roundStarts };
}

/** 索引を使って upTo 手まで進めた局面を作る（近い局面から、every 手未満だけ進める）。replay と同じ結果になる */
export function stateAt(record: GameRecord, tl: Timeline, upTo: number): GameState {
  const k = Math.min(Math.floor(upTo / tl.every), tl.snaps.length - 1);
  let s = tl.snaps[k];
  for (let i = k * tl.every; i < upTo; i++) s = applyMove(s, record.moves[i]);
  return s;
}

/** チェックポイントの状態と、それ以降の手から、最後の1手を取り消した状態を作る */
export function undoLast(checkpoint: GameState, movesSince: string[]): { state: GameState; moves: string[] } {
  const moves = movesSince.slice(0, -1);
  let s = checkpoint;
  for (const m of moves) s = applyMove(s, m);
  return { state: s, moves };
}
