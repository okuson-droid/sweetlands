// ヴァリアント「キャラクターの候補を絞る」（docs/decisions_13 §13.25）
import { describe, expect, it } from 'vitest';
import { BOARD_PAIRS } from '../src/game/characters';
import { applyMove, createGame, getOptions } from '../src/game/engine';
import type { GameConfig } from '../src/game/types';

const cfg = (players: number, extra: Partial<GameConfig['variants']> = {}): GameConfig => ({
  players,
  names: ['A', 'B', 'C', 'D'].slice(0, players),
  variants: { turnOrder: false, draft: false, advSkills: false, ...extra },
});
const charIds = (s: ReturnType<typeof createGame>) => getOptions(s).filter((o) => o.id.startsWith('char:')).map((o) => o.id.slice(5));

describe('キャラクターの候補を絞る', () => {
  it('候補は「人数＋2」人で、その中からだけ選べる（通常の準備・準備のドラフトの両方）', () => {
    for (const players of [1, 2, 3, 4]) {
      for (const setupDraft of [false, true]) {
        const s = createGame(cfg(players, { charPool: true, setupDraft }), 7);
        expect(s.charPool).toHaveLength(players + 2);
        expect(new Set(s.charPool).size).toBe(players + 2);
        expect(new Set(charIds(s))).toEqual(new Set(s.charPool));
      }
    }
  });

  it('同じボードの裏面のキャラクターも選べる', () => {
    // 候補にボードの表裏が両方入るシードを探し、片方を選んでももう片方が残ることを確かめる
    for (let seed = 1; seed < 500; seed++) {
      const s = createGame(cfg(4, { charPool: true }), seed);
      const pair = BOARD_PAIRS.find(([a, b]) => s.charPool!.includes(a) && s.charPool!.includes(b));
      if (!pair || !charIds(s).includes(pair[0])) continue;
      const next = applyMove(s, `char:${pair[0]}`);
      let t = next;
      while (t.pending && t.pending.step !== 'setupChar') t = applyMove(t, getOptions(t)[0].id);
      expect(charIds(t)).toContain(pair[1]);
      expect(charIds(t)).not.toContain(pair[0]);
      return;
    }
    throw new Error('表裏が両方入るシードが見つからない');
  });

  it('ヴァリアントのないゲームは、乱数の消費も候補も以前と同じ', () => {
    const a = createGame(cfg(3), 11);
    expect(a.charPool).toBeUndefined();
    expect(charIds(a).length).toBe(14);
    // 候補を絞っても、場の準備（山札・支援タイル・マイルストーンなど）は同じ
    const b = createGame(cfg(3, { charPool: true }), 11);
    expect(b.deck).toEqual(a.deck);
    expect(b.supportTiles).toEqual(a.supportTiles);
    expect(b.milestones).toEqual(a.milestones);
    expect(b.finalTiles).toEqual(a.finalTiles);
  });
});
