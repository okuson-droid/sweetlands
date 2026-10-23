// カードを引く手の前の確認（docs/decisions_13 §13.15）
import { describe, expect, it } from 'vitest';
import { getOptions } from '../src/game/engine';
import { drawsCard } from '../src/ui/interaction';
import { setupGame } from './helpers';

describe('カードを引く手の見分け', () => {
  it('15ゴールド → 市民カード1枚は引く手、基礎資源 → ゴールドは引かない手', () => {
    const s = structuredClone(setupGame(2));
    s.players[s.pending!.player].res.gold = 20;
    const ids = getOptions(s).map((o) => o.id);
    expect(ids).toContain('fa2');
    expect(drawsCard(s, ['fa2'])).toBe('draw');
    expect(drawsCard(s, ['fa5'])).toBeNull();
  });

  it('仮に進められない手は引かないとみなす', () => {
    const s = setupGame(2);
    expect(drawsCard(s, ['no-such-move'])).toBeNull();
  });
});
