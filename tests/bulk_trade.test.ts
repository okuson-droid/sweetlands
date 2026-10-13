// 両替のフリーアクション（❸❺❻）の一括
import { describe, expect, it } from 'vitest';
import { applyMove, getOptions } from '../src/game/engine';
import type { GameState } from '../src/game/types';
import { autoAnswer } from '../src/ui/useGame';
import { setupGame } from './helpers';

function withRes(gold: number, wheat: number, wood: number, iron: number): GameState {
  const s = structuredClone(setupGame(2));
  s.players[s.pending!.player].res = { gold, wheat, wood, iron };
  return s;
}
const me = (s: GameState) => s.players[s.pending?.player ?? s.current];
const totals = (s: GameState) => [...new Set(getOptions(s).map((o) => Number((o.data as { wheat: number }).wheat) + Number((o.data as { wood: number }).wood) + Number((o.data as { iron: number }).iron)))].sort((a, b) => a - b);

describe('両替の一括', () => {
  it('❻：3n 個を払い、n 個を得る', () => {
    const seat = setupGame(2).pending!.player;
    let s = withRes(0, 4, 3, 2);
    s = applyMove(s, 'fa6');
    expect(s.pending!.step).toBe('payBasic');
    expect(totals(s)).toEqual([3, 6, 9]);
    s = applyMove(s, 'basic:3-2-1');
    expect(s.pending!.step).toBe('anyBasic');
    expect(totals(s)).toEqual([2]);
    s = applyMove(s, 'basic:0-0-2');
    expect(s.players[seat].res).toEqual({ gold: 0, wheat: 1, wood: 1, iron: 3 });
    expect(s.pending!.step).toBe('turn');
  });

  it('❻：1単位分は以前と同じ選択肢 ID で進む', () => {
    const seat = setupGame(2).pending!.player;
    let s = withRes(0, 3, 0, 0);
    for (const m of ['fa6', 'basic:3-0-0', 'basic:0-1-0']) s = applyMove(s, m);
    expect(s.players[seat].res).toEqual({ gold: 0, wheat: 0, wood: 1, iron: 0 });
  });

  it('❺：払った個数だけゴールドを得る', () => {
    let s = withRes(2, 2, 1, 0);
    const seat = s.pending!.player;
    s = applyMove(s, 'fa5');
    expect(totals(s)).toEqual([1, 2, 3]);
    s = applyMove(s, 'basic:2-1-0');
    expect(s.players[seat].res).toEqual({ gold: 5, wheat: 0, wood: 0, iron: 0 });
  });

  it('❸：4ゴールドにつき1個、払える分まで得る', () => {
    let s = withRes(13, 0, 0, 0);
    const seat = s.pending!.player;
    s = applyMove(s, 'fa3');
    expect(s.pending!.step).toBe('anyBasic');
    expect(totals(s)).toEqual([1, 2, 3]);
    expect(me(s).res.gold).toBe(13);
    s = applyMove(s, 'basic:1-0-2');
    expect(s.players[seat].res).toEqual({ gold: 1, wheat: 1, wood: 0, iron: 2 });
  });

  it('支払いの内訳の自動化は、一括の支払いには答えない', () => {
    const s = applyMove(withRes(0, 4, 3, 2), 'fa6');
    expect(autoAnswer(s, { single: false, payBasic: true, pass: false })).toBeNull();
  });
});
