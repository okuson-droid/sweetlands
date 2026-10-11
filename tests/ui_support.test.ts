// UI 用の追加（ui_design §15）：出来事列・対象参照・理由の文・チェックポイント・記録
// 準拠：SweetLands_rules.md（2026-10-10 版）、ui_design.md 第3版
import { describe, expect, it } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { explain } from '../src/game/explain';
import { isCheckpoint, replay, undoLast, type GameRecord } from '../src/game/history';
import { nextRandom } from '../src/game/rng';
import { targetOf } from '../src/game/targets';
import type { GameConfig, GameState, Option } from '../src/game/types';
import { setupGame } from './helpers';

function pickRandom(opts: Option[], r: number): Option {
  const nonStop = opts.filter((o) => o.id !== 'stop' && o.id !== 'skip' && o.id !== 'pass');
  if (nonStop.length && r < 0.9) return nonStop[Math.floor(r * 997) % nonStop.length];
  return opts[Math.floor(r * 991) % opts.length];
}

function randomGame(players: number, seed: number, variants: GameConfig['variants'] = { turnOrder: false, draft: false, advSkills: false }) {
  const config = { players, names: ['A', 'B', 'C', 'D'].slice(0, players), variants };
  let s = createGame(config, seed);
  let rng = seed ^ 0x5bd1e995;
  const moves: string[] = [];
  const states: GameState[] = [s];
  while (!s.finished && moves.length < 20000) {
    const opts = getOptions(s);
    const [r, nr] = nextRandom(rng);
    rng = nr;
    const o = pickRandom(opts, r);
    moves.push(o.id);
    s = applyMove(s, o.id);
    states.push(s);
  }
  return { record: { config, seed, moves } as GameRecord, states };
}

describe('対象参照（§5：安全網に落ちる合法手を0件にする）', () => {
  it('乱択の複数局で、すべての選択待ちのすべての合法手に対象参照がある', () => {
    const missing = new Set<string>();
    const cases: [number, boolean][] = [
      [2, false],
      [3, false],
      [4, false],
      [3, true],
      [4, true],
    ];
    cases.forEach(([n, v], i) => {
      // ヴァリアントありの局では、準備の自由選択とドラフト（rules v1.1 §10.4・§10.5）も含める
      const { states } = randomGame(n, 101 + i * 17, { turnOrder: v, draft: v, advSkills: v, freeChar: v, setupDraft: v });
      for (const s of states) for (const o of getOptions(s)) if (!targetOf(s, o)) missing.add(`${s.pending!.step}:${o.id}`);
    });
    expect([...missing]).toEqual([]);
  });
});

describe('出来事列（§8.1）', () => {
  it('アクションエリアを使うとディスクの出来事が出て、資源の差分が最後に来る', () => {
    let s = setupGame(2);
    const opt = getOptions(s).find((o) => o.id === 'area:K')!;
    s = applyMove(s, opt.id);
    const p = s.pending!.player;
    expect(s.events[0]).toMatchObject({ t: 'disc', area: 'K', slot: 0, own: false });
    // 手札コストを払うまでゴールドはまだ増えない
    s = applyMove(s, getOptions(s).find((o) => o.id.startsWith('card:'))!.id);
    expect(s.events.some((e) => e.t === 'card' && e.reason === 'handCost')).toBe(true);
    const delta = s.events.find((e) => e.t === 'delta' && e.p === p);
    expect(delta).toMatchObject({ t: 'delta', res: { gold: 6 } });
  });
  it('出来事列は次の applyMove で入れ替わる', () => {
    const { states } = randomGame(2, 7);
    const withEvents = states.filter((s) => s.events.length > 0).length;
    expect(withEvents).toBeGreaterThan(states.length / 2);
  });
});

describe('理由の文（§6.2）', () => {
  it('手番でないプレイヤーには手番の人の名前を出す', () => {
    const s = setupGame(2);
    const other = 1 - s.pending!.player;
    expect(explain(s, other, { k: 'area', area: 'A' })).toBe(`いまは${s.players[s.pending!.player].name}さんの手番です`);
  });
  it('第2ラウンドまで使えない応用エリアを触ると理由が出る', () => {
    const s = setupGame(2);
    expect(explain(s, s.pending!.player, { k: 'area', area: 'N' })).toBe('第2ラウンドから使えます');
    expect(explain(s, s.pending!.player, { k: 'area', area: 'O' })).toBe('第3ラウンドから使えます');
  });
  it('首都に地形タイルは置けない', () => {
    const s = setupGame(2);
    const me = s.pending!.player;
    const cap = Object.keys(s.players[me].hexes).find((k) => s.players[me].hexes[k].terrain === 'C')!;
    expect(explain(s, me, { k: 'hex', hex: cap, holding: 'tile' })).toBe('首都には置けません');
  });
});

describe('チェックポイント・取り消し・リプレイ（§2-11, §3）', () => {
  it('記録から再生すると同じ盤面になる', () => {
    const { record, states } = randomGame(3, 55);
    const final = replay(record);
    expect(JSON.stringify(final)).toBe(JSON.stringify(states[states.length - 1]));
  });
  it('カードを引く手と手番の交代はチェックポイントになる', () => {
    const { record, states } = randomGame(2, 9);
    for (let i = 1; i < states.length; i++) {
      const prev = states[i - 1];
      const next = states[i];
      if (next.events.some((e) => e.t === 'card' && e.reason === 'draw')) expect(isCheckpoint(prev, next)).toBe(true);
      if ((prev.pending?.player ?? -1) !== (next.pending?.player ?? -1)) expect(isCheckpoint(prev, next)).toBe(true);
    }
    expect(record.moves.length).toBe(states.length - 1);
  });
  it('チェックポイント以降の手を1つ取り消すと、1手前の盤面に戻る', () => {
    const { states, record } = randomGame(2, 13);
    // チェックポイントでない手が2つ以上続く区間を探す
    let cp = -1;
    for (let i = 1; i + 2 < states.length; i++) {
      if (isCheckpoint(states[i - 1], states[i]) && !isCheckpoint(states[i], states[i + 1]) && !isCheckpoint(states[i + 1], states[i + 2])) {
        cp = i;
        break;
      }
    }
    expect(cp).toBeGreaterThan(0);
    const moves = record.moves.slice(cp, cp + 2);
    const { state, moves: rest } = undoLast(states[cp], moves);
    expect(rest).toEqual([record.moves[cp]]);
    expect(JSON.stringify({ ...state, events: [] })).toBe(JSON.stringify({ ...states[cp + 1], events: [] }));
  });
});

describe('割引後のコスト（上級スキル13・14、ユーザー指示：表示は割引後の値）', () => {
  it('上級スキル14で地形タイルのアクションエリアAは麦4、13で道駒のアクションエリアDは木材3になる', async () => {
    const { areaCost } = await import('../src/game/engine');
    const s = setupGame(2);
    const p = s.players[s.pending!.player];
    expect(areaCost(s, p, 'A').wheat).toBe(6);
    p.skills.push({ id: 14, adv: true, flipped: false }, { id: 13, adv: true, flipped: false });
    expect(areaCost(s, p, 'A').wheat).toBe(4);
    expect(areaCost(s, p, 'D').wood).toBe(3);
  });
});
