// rules §12.14：市民カード207枚がすべて効果言語に変換できること
import { describe, expect, it } from 'vitest';
import { CARDS, CARD_IDS, parseLine } from '../src/game/cards';

describe('市民カードの変換', () => {
  it('207枚すべて変換できる', () => {
    expect(CARD_IDS.length).toBe(207);
    for (const id of CARD_IDS) {
      const c = CARDS[id];
      expect(c.main.length, `${c.nameJa} の能力が空`).toBeGreaterThan(0);
      if (c.type === 'immediate' && c.industry) expect(c.auto, `${c.nameJa}`).not.toBeNull();
    }
  });

  it('内訳：即時193・パス時14、産業タグ付きはオートメーション能力を持つ', () => {
    const list = CARD_IDS.map((id) => CARDS[id]);
    expect(list.filter((c) => c.type === 'pass').length).toBe(14);
    expect(list.filter((c) => c.industry !== null).length).toBe(176);
    expect(list.filter((c) => c.auto !== null).length).toBe(176);
  });

  it('連鎖矢印：コストを1回払い、条件の回数分得る（ユーザー確認済み）', () => {
    expect(parseLine('2 W -> 2 tWagashi =>* 1 prosO')).toEqual([
      {
        k: 'pay',
        cost: { wheat: 2 },
        repeat: false,
        then: [
          { k: 'cond', items: [{ counter: { k: 'tag', tag: '和菓子' }, n: 2 }], each: true, then: [{ k: 'pros', n: 1, color: 'O' }] },
        ],
      },
    ]);
  });

  it('収入値のコスト', () => {
    expect(parseLine('2 [W] -> 1 placeBldW')).toEqual([
      { k: 'pay', cost: { income: { wheat: 2 } }, repeat: false, then: [{ k: 'building', n: 1, viaAction: false, onTerrain: 'W' }] },
    ]);
  });
});
