// チュートリアルの進行の判定（純粋関数。docs/decisions_13 §13.24）
import { applyMove } from '../../game/engine';
import type { GameState } from '../../game/types';
import type { TutorialStep } from './script';

/** 台本の段 i より先で、手のある最初の段の番号（手が多段の操作をまとめて受け付けるため、説明だけの段は飛ばして数える） */
function nextMoveStep(steps: TutorialStep[], i: number): number {
  let k = i;
  while (k < steps.length && steps[k].move === undefined) k++;
  return k;
}

/**
 * 画面に渡す局面：手のある段では、選択肢を台本の手1つに絞る（ほかの要素は光らない）。説明だけの段では選択待ちを隠す（何も操作できない）。
 * 判定と進行は絞る前の本物の局面で行う
 */
export function guidedView(s: GameState, step: TutorialStep | undefined): GameState {
  if (!s.pending) return s;
  if (!step?.move) return { ...s, pending: null };
  return { ...s, pending: { ...s.pending, options: s.pending.options.filter((o) => o.id === step.move) } };
}

/**
 * 操作の手の列 ids を、台本の段 i から当てる。すべて台本どおりなら、適用後の局面と次の段の番号を返す。
 * 1つでも違えば null（何も適用しない）。ドラッグ1回で複数の手になる操作（建物駒を選んで置くなど）は、続く段とまとめて照らし合わせる
 */
export function matchMoves(steps: TutorialStep[], s: GameState, i: number, ids: string[]): { state: GameState; step: number } | null {
  let k = i;
  let cur = s;
  for (const id of ids) {
    k = nextMoveStep(steps, k);
    if (k >= steps.length || steps[k].move !== id) return null;
    cur = applyMove(cur, id);
    k++;
  }
  return { state: cur, step: k };
}
