// キャラクターの上方修正（ヴァリアント、docs/decisions_16）
import { describe, expect, it } from 'vitest';
import { printedAuto } from '../src/game/boards';
import { applyMove, getOptions, withEffects } from '../src/game/engine';
import { cities, count, neighbors, passedIp, tagCounts } from '../src/game/queries';
import type { BuildingType, GameState, PlayerState } from '../src/game/types';
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

describe('アリス・ティーローズの上方修正：都市の分け方', () => {
  /** アリスの地図に建物駒を置いた盤面。cells は [hex, 種類] の列 */
  function alice(): PlayerState {
    const s = structuredClone(setupGame(2, ['アリス・ティーローズ']));
    return s.players.find((p) => p.character === 'アリス・ティーローズ')!;
  }
  /** 首都でないヘクスから、つながった n 個を選ぶ（乱数 r で広げ方を変える） */
  function blob(p: PlayerState, n: number, r: number): string[] {
    const keys = Object.keys(p.hexes).filter((k) => p.hexes[k].terrain !== 'C');
    const order = [keys[(r * 7) % keys.length]];
    const seen = new Set(order);
    while (order.length < n) {
      const cand = order.flatMap((k) => neighbors(p, k)).filter((k) => !seen.has(k) && p.hexes[k].terrain !== 'C');
      r = (r * 1103515245 + 12345) & 0x7fffffff;
      const k = cand[r % cand.length];
      seen.add(k);
      order.push(k);
    }
    return order;
  }
  /** 総当たり：互いに重ならない「つながった3種類以上の組」の最大数 */
  function brute(p: PlayerState, keys: string[]): number {
    const n = keys.length;
    const idx = new Map(keys.map((k, i) => [k, i]));
    const adj = keys.map((k) => neighbors(p, k).reduce((m, x) => (idx.has(x) ? m | (1 << idx.get(x)!) : m), 0));
    const valid: number[] = [];
    for (let m = 1; m < 1 << n; m++) {
      const vs = keys.map((_, i) => i).filter((i) => m & (1 << i));
      if (new Set(vs.map((i) => p.hexes[keys[i]].building)).size < 3) continue;
      let reach = 1 << vs[0];
      for (let grow = true; grow; ) {
        const next = vs.reduce((a, i) => (reach & (1 << i) ? a | adj[i] : a), reach) & m;
        grow = next !== reach;
        reach = next;
      }
      if (reach === m) valid.push(m);
    }
    const best = (used: number, from: number): number => {
      let b = 0;
      for (let j = from; j < valid.length; j++) if ((valid[j] & used) === 0) b = Math.max(b, 1 + best(used | valid[j], j + 1));
      return b;
    };
    return best(0, 0);
  }

  it('同じ種類だけの3個は都市にならず、隣接した2組は2つの都市になる', () => {
    const p = alice();
    const keys = blob(p, 6, 3);
    for (const k of keys.slice(0, 3)) p.hexes[k].building = 'tent';
    expect(cities(p, true)).toHaveLength(0);
    expect(cities(p, false)).toHaveLength(1); // 通常の基本能力では都市
    const types: BuildingType[] = ['tent', 'house', 'bldg', 'tent', 'house', 'bldg'];
    keys.forEach((k, i) => (p.hexes[k].building = types[i]));
    expect(cities(p, true).length).toBe(brute(p, keys));
    expect(cities(p, false)).toHaveLength(1);
  });

  it('時計塔駒は単独で1つの都市になる', () => {
    const p = alice();
    const keys = blob(p, 4, 5);
    const types: BuildingType[] = ['tent', 'house', 'bldg', 'clock'];
    keys.forEach((k, i) => (p.hexes[k].building = types[i]));
    p.clockPlaced = true;
    expect(cities(p, true)).toHaveLength(2);
  });

  it('無作為な配置で、総当たりの最大値と一致する', () => {
    const kinds: BuildingType[] = ['tent', 'house', 'bldg', 'lab', 'shop'];
    for (let r = 1; r <= 60; r++) {
      const p = alice();
      const n = 6 + (r % 7); // 6〜12個
      const keys = blob(p, n, r);
      keys.forEach((k, i) => (p.hexes[k].building = kinds[(i * 3 + r * (i + 1)) % (2 + (r % 4))]));
      const got = cities(p, true);
      expect(got.length, `r=${r}`).toBe(brute(p, keys));
      // 取り出した都市は重ならず、それぞれ3種類以上でつながっている
      const all = got.flat();
      expect(new Set(all).size).toBe(all.length);
      for (const c of got) expect(new Set(c.map((k) => p.hexes[k].building)).size).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('サクラ・モチの上方修正', () => {
  it('特性の和菓子タグが2個になる（上方修正なしでは1個）', () => {
    const on = game('サクラ・モチ', true);
    const off = game('サクラ・モチ', false);
    const p = on.s.players[on.seat];
    expect(tagCounts(p, true).和菓子).toBe(2);
    expect(tagCounts(p, false).和菓子).toBe(1);
    // ほかのキャラクターの特性は変わらない
    const q = { ...p, character: 'セナ・デライト' };
    expect(tagCounts(q, true)).toEqual(tagCounts(q, false));
    // カードの条件などで数える「タグ」は、局面の採用状況に従う
    expect(count(on.s, p, { k: 'tag', tag: '和菓子' })).toBe(2);
    expect(count(off.s, off.s.players[off.seat], { k: 'tag', tag: '和菓子' })).toBe(1);
  });
});
