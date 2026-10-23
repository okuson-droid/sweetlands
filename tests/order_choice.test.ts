// 同時に起きた効果の処理順を選ぶ（docs/decisions_13 §13.14）と、上方修正の第3弾（docs/decisions_16 §16.7）
import { describe, expect, it } from 'vitest';
import { applyMove, getOptions, withEffects } from '../src/game/engine';
import { skillDef } from '../src/game/boards';
import { rowCapacity } from '../src/game/queries';
import type { GameState } from '../src/game/types';
import { autoAnswer } from '../src/ui/useGame';
import { setupGame } from './helpers';

function game(name: string, opts: { order?: boolean; buff?: boolean } = {}): { s: GameState; seat: number } {
  const s = structuredClone(setupGame(2, [name]));
  s.config.orderChoice = opts.order;
  s.config.variants.charBuff = opts.buff;
  return { s, seat: s.players.findIndex((p) => p.character === name) };
}

describe('同時に起きた効果の処理順', () => {
  // アリス（ボードα）の農業列の印刷オートメーションは地形タイル1枚。オートメーション化したカード p01-r2c3 は繁栄1歩
  const ib = (order: boolean) => {
    const g = game('アリス・ティーローズ', { order });
    g.s.players[g.seat].automated.agr = ['p01-r2c3'];
    return { ...g, s: withEffects(g.s, g.seat, [{ k: 'ib', row: 'agr' }]) };
  };

  it('産業ボーナスの印刷オートメーションとカードの順番を選べる', () => {
    const { s } = ib(true);
    expect(s.pending!.step).toBe('orderBundles');
    expect(getOptions(s).map((o) => o.id)).toEqual(['bundle:0', 'bundle:1']);
    // カードを先に選ぶと、繁栄トラックの選択が先に来る
    const after = applyMove(s, 'bundle:1');
    expect(after.pending!.step).toBe('pros');
  });

  it('以前の記録（orderChoice なし）は従来どおり自動の順で解決する', () => {
    const { s } = ib(false);
    expect(s.pending!.step).not.toBe('orderBundles');
    expect(s.pending!.step).toBe('terrain');
  });

  it('処理順を自動にした席には、並んだ順（起きた順）で答える', () => {
    const { s, seat } = ib(true);
    expect(autoAnswer(s, { single: false, payBasic: false, pass: false, orderAuto: [seat] })).toBe('bundle:0');
    expect(autoAnswer(s, { single: false, payBasic: false, pass: false, orderAuto: [] })).toBeNull();
  });
});

describe('上方修正の第3弾', () => {
  it('上級スキルタイル13・14はフリップ能力になり、アクションの割引はなくなる', () => {
    expect(skillDef(13, true, true).kind).toBe('flip');
    expect(skillDef(14, true, true).kind).toBe('flip');
    expect(skillDef(13, true, false).kind).toBe('perm');
  });

  it('ナタ：工業トラックのエリアの手札コストが常に1枚', () => {
    for (const buff of [false, true]) {
      const g = game('ナタ・パステル', { buff });
      g.s.areas.F.slots[0] = 1 - g.seat; // 1つ目のスペースは相手が使った
      g.s.players[g.seat].res.iron = 9;
      const t = structuredClone(g.s);
      t.pending!.player = g.seat;
      t.current = g.seat;
      const opt = getOptions(withEffects(t, g.seat, [])).find((o) => o.id === 'area:F');
      expect(opt?.label).toContain(buff ? '（手札1枚）' : '（手札2枚）');
    }
  });

  it('カルメン：オートメーション化の上限が各列+1（上級スキルタイル11と重なる）', () => {
    const g = game('カルメン・メロ', { buff: true });
    const p = g.s.players[g.seat];
    expect(rowCapacity(p, 'agr', true)).toBe(2);
    expect(rowCapacity(p, 'agr', false)).toBe(1);
    p.taken.tent = 4;
    p.skills.push({ id: 11, adv: true, flipped: false });
    expect(rowCapacity(p, 'agr', true)).toBe(5);
  });
});
