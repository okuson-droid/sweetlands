// キャラクターの上方修正（ヴァリアント、docs/decisions_16）
import { describe, expect, it } from 'vitest';
import { printedAuto } from '../src/game/boards';
import { applyMove, getOptions, withEffects } from '../src/game/engine';
import { passedIp } from '../src/game/queries';
import type { GameState } from '../src/game/types';
import { setupGame } from './helpers';

/** 先手に name を選ばせ、上方修正の採用を切り替えた局面（準備は上方修正に関係しない） */
function game(name: string, buff: boolean): { s: GameState; seat: number } {
  const s = structuredClone(setupGame(2, [name]));
  s.config.variants.charBuff = buff;
  const seat = s.players.findIndex((p) => p.character === name);
  return { s, seat };
}
/** 手番の選択待ちを seat に向ける（テスト用） */
function turnOf(s: GameState, seat: number): GameState {
  const t = structuredClone(s);
  t.pending!.player = seat;
  t.pending!.resume = { ...t.pending!.resume, player: seat };
  t.current = seat;
  return withEffects(t, seat, []);
}

describe('キャラクターの上方修正', () => {
  it('印刷オートメーション：γ鉱業・ε農業・η林業だけを差し替える', () => {
    expect(printedAuto('γ', 'min', true)).toEqual([{ k: 'road', n: 1 }]);
    expect(printedAuto('ε', 'agr', true)).toEqual([{ k: 'terrain', n: 1, kind: 'any' }]);
    expect(printedAuto('η', 'for', true)).toEqual([{ k: 'road', n: 1 }]);
    expect(printedAuto('γ', 'min', false)).not.toEqual([{ k: 'road', n: 1 }]);
    expect(printedAuto('γ', 'agr', true)).toEqual(printedAuto('γ', 'agr', false));
    expect(printedAuto('δ', 'for', true)).toEqual(printedAuto('δ', 'for', false));
  });

  it('産業ボーナスで、差し替えた印刷オートメーションを解決する', () => {
    const on = game('ナタ・パステル', true);
    const after = withEffects(on.s, on.seat, [{ k: 'ib', row: 'min' }]);
    expect(after.pending!.step).toBe('road');
    const off = game('ナタ・パステル', false);
    const inc = off.s.players[off.seat].income.gold;
    const afterOff = withEffects(off.s, off.seat, [{ k: 'ib', row: 'min' }]);
    expect(afterOff.players[off.seat].income.gold).toBe(inc + 2);
  });

  it('ナタ：工業点アイコンは 1/2/3/4（両方のマーカー）', () => {
    const { s, seat } = game('ナタ・パステル', true);
    const p = { ...s.players[seat], carriage: 17, loco: 8 };
    expect(passedIp(p, false)).toBe(6 + 2);
    expect(passedIp(p, true)).toBe(10 + 3);
    // ナタ以外には効かない
    const q = { ...p, character: 'ビスキュイ・バステト' };
    expect(passedIp(q, true)).toBe(8);
  });

  it('ビスキュイ：研究所駒1個につき工業トラック1歩（都市でなくてもよい）', () => {
    for (const buff of [false, true]) {
      const g = game('ビスキュイ・バステト', buff);
      const p = g.s.players[g.seat];
      const keys = Object.keys(p.hexes).filter((k) => p.hexes[k].terrain !== 'C' && !p.hexes[k].building);
      p.hexes[keys[0]].building = 'lab';
      p.hexes[keys[keys.length - 1]].building = 'lab';
      p.taken.lab = 4; // 工業トラックの研究所駒をすべて取り除いた扱い（マーカーがさえぎられないように）
      const s = turnOf(g.s, g.seat);
      const opt = getOptions(s).find((o) => o.id === 'faC:biscuit');
      if (!buff) {
        expect(opt).toBeUndefined();
        continue;
      }
      expect(opt?.label).toBe('研究所1個につき工業トラック1歩');
      const before = s.players[g.seat].carriage;
      const after = applyMove(s, 'faC:biscuit');
      expect(after.players[g.seat].carriage).toBe(before + 2);
    }
  });

  it('リッカ：クッキーラビット駒のエリアの麦をゴールドで払える', () => {
    const g = game('リッカ・ベリー', true);
    g.s.players[g.seat].res = { gold: 5, wheat: 1, wood: 9, iron: 0 };
    let s = turnOf(g.s, g.seat);
    const area = getOptions(s).find((o) => o.id.startsWith('area:') && (o.data as { area: string }).area === 'C');
    expect(area).toBeDefined();
    s = applyMove(s, area!.id);
    while (s.pending!.step !== 'areaCost') s = applyMove(s, getOptions(s)[0].id);
    expect(getOptions(s).map((o) => o.label)).toEqual(['麦1・ゴールド3', '麦0・ゴールド4']);
    s = applyMove(s, 'split:3');
    expect(s.players[g.seat].res).toMatchObject({ gold: 2, wheat: 0, wood: 9 });
  });

  it('リッカ：上方修正なしでは従来どおり木材で払う', () => {
    const g = game('リッカ・ベリー', false);
    g.s.players[g.seat].res = { gold: 5, wheat: 1, wood: 9, iron: 0 };
    let s = turnOf(g.s, g.seat);
    const area = getOptions(s).find((o) => o.id.startsWith('area:') && (o.data as { area: string }).area === 'C');
    s = applyMove(s, area!.id);
    while (s.pending!.step !== 'areaCost') s = applyMove(s, getOptions(s)[0].id);
    expect(getOptions(s).map((o) => o.label)).toEqual(['麦1・木材3', '麦0・木材4']);
  });
});
