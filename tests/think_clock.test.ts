// 思考時間（docs/decisions_13 §13.19）
import { describe, expect, it } from 'vitest';
import { accrue, formatThink, thinkers } from '../src/ui/useGame';
import { setupGame } from './helpers';

describe('思考時間', () => {
  it('選択を待っている席を数える（ゲームが終わっていれば数えない）', () => {
    const s = setupGame(2);
    expect(thinkers(s)).toEqual([s.pending!.player]);
    expect(thinkers({ ...s, pending: { ...s.pending!, waiting: [1, 0] } })).toEqual([1, 0]);
    expect(thinkers({ ...s, finished: true } as typeof s)).toEqual([]);
  });

  it('待っていた席にだけ経過時間を足す', () => {
    expect(accrue([1000, 0, 0], [1], 5000, 8000)).toEqual([1000, 3000, 0]);
    expect(accrue([0, 0], [0, 1], 100, 600)).toEqual([500, 500]);
    // 時計が戻っても減らさない
    expect(accrue([10, 0], [0], 900, 800)).toEqual([10, 0]);
  });

  it('分:秒（1時間以上は 時:分:秒）で表示する', () => {
    expect(formatThink(0)).toBe('0:00');
    expect(formatThink(65_999)).toBe('1:05');
    expect(formatThink(3_725_000)).toBe('1:02:05');
  });
});
