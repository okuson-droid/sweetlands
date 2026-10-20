// 「何回でも」の支払い（→*）をまとめて行う
import { describe, expect, it } from 'vitest';
import { applyMove, getOptions, withEffects } from '../src/game/engine';
import type { Eff, GameState } from '../src/game/types';
import { setupGame } from './helpers';

const REPEAT: Eff = { k: 'pay', cost: { wood: 1 }, then: [{ k: 'gain', res: { gold: 2 } }], repeat: true };

function start(wood: number): { s: GameState; seat: number } {
  const base = structuredClone(setupGame(2));
  const seat = base.pending!.player;
  base.players[seat].res = { gold: 0, wheat: 0, wood, iron: 0 };
  return { s: withEffects(base, seat, [REPEAT]), seat };
}

describe('何回でもの支払い', () => {
  it('払える回数まで pay:k を選べる', () => {
    const { s } = start(4);
    expect(s.pending!.step).toBe('payConfirm');
    expect(getOptions(s).map((o) => o.id)).toEqual(['pay', 'skip', 'pay:2', 'pay:3', 'pay:4']);
  });

  it('pay:k は k 回分をまとめて払い、聞き直さない', () => {
    const { s, seat } = start(4);
    const after = applyMove(s, 'pay:3');
    expect(after.players[seat].res).toMatchObject({ wood: 1, gold: 6 });
    expect(after.pending!.step).not.toBe('payConfirm');
  });

  it('1回ずつ払う従来の手順もそのまま使える', () => {
    let { s, seat } = start(3);
    s = applyMove(s, 'pay');
    expect(s.pending!.step).toBe('payConfirm');
    s = applyMove(s, 'pay');
    s = applyMove(s, 'skip');
    expect(s.players[seat].res).toMatchObject({ wood: 1, gold: 4 });
  });

  it('1回しか払えないときは pay:k を出さない', () => {
    const { s } = start(1);
    expect(getOptions(s).map((o) => o.id)).toEqual(['pay', 'skip']);
  });
});
