// 準備の選択（rules v1.1：§2.2 改訂・§10.4・§10.5）
import { describe, expect, it } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine';
import type { GameConfig, GameState } from '../src/game/types';

const NAMES = ['A', 'B', 'C', 'D'];
function game(players: number, v: Partial<GameConfig['variants']> = {}, seed = 7): GameState {
  return createGame({ players, names: NAMES.slice(0, players), variants: { turnOrder: false, draft: false, advSkills: false, ...v } }, seed);
}
const ids = (s: GameState) => getOptions(s).map((o) => o.id);
const pick = (s: GameState, id: string) => applyMove(s, id);

describe('rules v1.1 §2.2：地図ボードはボードと面を選ぶ', () => {
  it('A面を選ぶときもボードを選び、そのボードのB面は以降選べない', () => {
    let s = game(2);
    s = pick(s, getOptions(s).find((o) => o.id.startsWith('char:'))!.id);
    expect(s.pending!.step).toBe('setupMap');
    const first = ids(s);
    // 5枚のボードそれぞれについて A面・B面の2つ
    for (const b of ['B1', 'B2', 'B3', 'B4', 'B5']) {
      expect(first).toContain(`map:A@${b}`);
      expect(first).toContain(`map:${b}`);
    }
    expect(first).toHaveLength(10);
    s = pick(s, 'map:A@B3');
    expect(s.players.find((p) => p.mapBoard === 'B3')?.mapId).toBe('A');
    // 2人目：B3 のボードは受け取られているので、B3面も A@B3 も出ない
    s = pick(s, getOptions(s).find((o) => o.id.startsWith('char:'))!.id);
    const second = ids(s);
    expect(second).not.toContain('map:B3');
    expect(second).not.toContain('map:A@B3');
    expect(second).toContain('map:A@B1');
    expect(second).toHaveLength(8);
  });

  it('旧形式の記録（map:A）は、受け取られていない最初のボードのA面として読める', () => {
    let s = game(2);
    s = pick(s, getOptions(s).find((o) => o.id.startsWith('char:'))!.id);
    s = applyMove(s, 'map:A');
    const p = s.players.find((x) => x.mapId)!;
    expect(p.mapId).toBe('A');
    expect(p.mapBoard).toBe('B1');
  });
});

describe('rules v1.1 §10.4：キャラクターの自由選択', () => {
  it('採用しないとき、選ばれたキャラクターの裏面は選べない', () => {
    let s = game(2);
    s = pick(s, 'char:アリス・ティーローズ');
    s = pick(s, getOptions(s)[0].id); // 地図
    expect(ids(s)).not.toContain('char:アリス・ティーローズ');
    expect(ids(s)).not.toContain('char:ロータス・チェー');
  });
  it('採用するとき、裏面は選べるが、同じキャラクターは選べない', () => {
    let s = game(2, { freeChar: true });
    s = pick(s, 'char:アリス・ティーローズ');
    s = pick(s, getOptions(s)[0].id);
    expect(ids(s)).not.toContain('char:アリス・ティーローズ');
    expect(ids(s)).toContain('char:ロータス・チェー');
    expect(ids(s)).toHaveLength(13);
  });
});

/** スタートプレイヤーを1として時計回りに番号付けしたときの、ピックの番の並び */
function expectedOrder(s: GameState): number[] {
  const n = s.players.length;
  const one = Array.from({ length: n }, (_, i) => (s.startPlayer + i) % n); // 1, 2, …, N
  const rev = [...one].reverse();
  return [...rev, ...one, ...rev];
}

function runDraft(s: GameState, choose: (s: GameState) => string): { s: GameState; order: number[] } {
  const order: number[] = [];
  while (s.pending?.step === 'setupPick') {
    order.push(s.pending.player);
    s = applyMove(s, choose(s));
  }
  return { s, order };
}

describe('rules v1.1 §10.5：準備のドラフト', () => {
  for (const n of [2, 3, 4]) {
    it(`${n}人：N…1, 1…N, N…1 の順で 3N 回ピックし、全員が3種類をそろえて第1ラウンドへ進む`, () => {
      const s0 = game(n, { setupDraft: true }, 11 + n);
      expect(s0.pending!.step).toBe('setupPick');
      // 種類を毎回ずらして選ぶ（キャラクター → 地図 → 支援駒 の巡回）
      let k = 0;
      const { s, order } = runDraft(s0, (st) => {
        const opts = ids(st);
        const kinds = ['char:', 'map:', 'col:'];
        for (let j = 0; j < 3; j++) {
          const kind = kinds[(k + j) % 3];
          const o = opts.find((id) => id.startsWith(kind));
          if (o) {
            k++;
            return o;
          }
        }
        throw new Error('選べる手がない');
      });
      expect(order).toEqual(expectedOrder(s0));
      expect(order).toHaveLength(3 * n);
      for (const p of s.players) {
        expect(p.character).not.toBeNull();
        expect(p.mapId).not.toBeNull();
        expect(p.mapBoard).not.toBeNull();
        expect(p.supportSpace).not.toBeNull();
      }
      expect(s.phase).not.toBe('setup');
      // ボードは重複しない
      expect(new Set(s.players.map((p) => p.mapBoard)).size).toBe(n);
    });
  }

  it('自分がすでにピックした種類は、次の番では選べない', () => {
    let s = game(4, { setupDraft: true });
    const seat = s.pending!.player;
    s = pick(s, 'char:ナタ・パステル');
    // 次にこの人の番が来るまで進める（他の人は、キャラクター以外の選べるものを選ぶ）
    while (s.pending!.player !== seat) s = pick(s, ids(s).find((id) => !id.startsWith('char:')) ?? ids(s)[0]);
    expect(ids(s).some((id) => id.startsWith('char:'))).toBe(false);
    expect(ids(s).some((id) => id.startsWith('map:'))).toBe(true);
    expect(ids(s).some((id) => id.startsWith('col:'))).toBe(true);
  });

  it('自由選択なしのドラフトでも、選ばれたキャラクターの裏面は選べない／自由選択ありなら選べる', () => {
    let s = game(3, { setupDraft: true });
    s = pick(s, 'char:ナタ・パステル');
    expect(ids(s)).not.toContain('char:ビスキュイ・バステト');
    let f = game(3, { setupDraft: true, freeChar: true });
    f = pick(f, 'char:ナタ・パステル');
    expect(ids(f)).toContain('char:ビスキュイ・バステト');
    expect(ids(f)).not.toContain('char:ナタ・パステル');
  });

  it('ドラフトで選んだ支援スペースと地図ボードは、他の人の選択肢から消える', () => {
    let s = game(3, { setupDraft: true });
    const col = ids(s).find((id) => id.startsWith('col:'))!;
    s = pick(s, col);
    expect(ids(s)).not.toContain(col);
    s = pick(s, 'map:A@B2');
    expect(ids(s)).not.toContain('map:B2');
    expect(ids(s)).not.toContain('map:A@B2');
  });

  it('ドラフトを採用しないときは、従来どおりキャラクター・地図・支援駒の順に聞く', () => {
    const s = game(3);
    expect(s.pending!.step).toBe('setupChar');
  });
});
