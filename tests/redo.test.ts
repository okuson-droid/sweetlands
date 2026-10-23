// 取り消した手のやり直し（docs/decisions_13 §13.17）
import { describe, expect, it } from 'vitest';
import { getOptions } from '../src/game/engine';
import { applyInner, redoInner, undoAllInner, undoInner, type Inner } from '../src/ui/useGame';
import { setupGame } from './helpers';

function start(): Inner {
  const s = setupGame(1);
  return { state: s, prev: null, moves: [], cpState: s, cpIndex: 0, lastWasUndo: false, redo: [] };
}
/** 手番の最初から、フリーアクション❺で基礎資源1をゴールドに替える2手 */
function twoMoves(cur: Inner): Inner {
  cur = applyInner(cur, ['fa5']);
  return applyInner(cur, [getOptions(cur.state)[0].id]);
}

describe('やり直し', () => {
  it('1手ずつ取り消したあと、1手ずつ進め直すと元の局面に戻る', () => {
    const done = twoMoves(start());
    let cur = undoInner(undoInner(done));
    expect(cur.moves).toHaveLength(0);
    expect(cur.redo).toHaveLength(2);
    cur = redoInner(cur);
    expect(cur.moves).toEqual(done.moves.slice(0, 1));
    expect(cur.holdAuto).toBe(true);
    cur = redoInner(cur);
    expect(cur.moves).toEqual(done.moves);
    expect(cur.state).toEqual(done.state);
    expect(cur.redo).toHaveLength(0);
    expect(cur.holdAuto).toBe(false);
  });

  it('手番の最初に戻したあとも、同じ順に進め直せる', () => {
    const done = twoMoves(start());
    let cur = undoAllInner(done);
    cur = redoInner(redoInner(cur));
    expect(cur.moves).toEqual(done.moves);
  });

  it('取り消したあとに別の手を選ぶと、進め直しはできなくなる。同じ手なら残りを保つ', () => {
    const done = twoMoves(start());
    const undone = undoInner(undoInner(done));
    const same = applyInner(undone, [done.moves[0]]);
    expect(same.redo).toEqual([done.moves[1]]);
    const other = applyInner(undone, [getOptions(undone.state).find((o) => o.id !== done.moves[0])!.id]);
    expect(other.redo).toHaveLength(0);
  });
});
