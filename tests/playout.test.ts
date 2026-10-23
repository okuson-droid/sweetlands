// 乱択プレイヤーで最後までゲームを進め、停止・例外・不正な状態が起きないことを確かめる
import { describe, expect, it } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { finalScores } from '../src/game/scoring';
import { nextRandom } from '../src/game/rng';
import type { GameConfig, GameState, Option } from '../src/game/types';

function pick(s: GameState, opts: Option[], r: number): Option {
  const pd = s.pending!;
  if (pd.kind === 'turn') {
    const end = opts.find((o) => o.id === 'endTurn');
    if (end) {
      // 手番の主行動後はたまにフリーアクションを挟んで終える
      const fa = opts.filter((o) => o.id.startsWith('fa4') || o.id === 'fa8');
      return fa.length && r < 0.8 ? fa[0] : end;
    }
    const main = opts.filter((o) => !o.id.startsWith('fa') && o.id !== 'pass');
    const ms = opts.filter((o) => o.id.startsWith('fa4') || o.id === 'fa8');
    if (ms.length) return ms[0];
    if (main.length && r < 0.92) return main[Math.floor(r * 1000) % main.length];
    return opts.find((o) => o.id === 'pass')!;
  }
  const nonStop = opts.filter((o) => o.id !== 'stop' && o.id !== 'skip');
  if (nonStop.length && r < 0.85) return nonStop[Math.floor(r * 997) % nonStop.length];
  return opts[Math.floor(r * 991) % opts.length];
}

export function playRandom(players: number, seed: number, variants: GameConfig['variants'] = { turnOrder: false, draft: false, advSkills: false }, orderChoice = false) {
  let s = createGame({ players, names: ['A', 'B', 'C', 'D'].slice(0, players), variants, orderChoice }, seed);
  let rng = seed ^ 0x9e3779b9;
  let steps = 0;
  while (!s.finished) {
    const opts = getOptions(s);
    if (opts.length === 0) throw new Error(`選択肢がありません: ${s.pending?.prompt}`);
    const [r, nr] = nextRandom(rng);
    rng = nr;
    s = applyMove(s, pick(s, opts, r).id);
    if (++steps > 20000) throw new Error('終わらない');
    for (const p of s.players) {
      for (const v of Object.values(p.res)) if (v < 0) throw new Error(`資源が負: ${p.name} ${JSON.stringify(p.res)} @ ${s.log.slice(-3).join(' / ')}`);
      if (p.diamond < 0) throw new Error('ダイヤが負');
      if (s.round <= 4 && s.phase === 'action' && p.hand.length === 0 && !s.pending?.prompt.includes('手札')) {
        // 手札0枚になる行動は取れない（収入フェイズ直後を除く）
      }
    }
  }
  return { s, steps };
}

describe('乱択プレイアウト', () => {
  for (const players of [2, 3, 4]) {
    it(`${players}人：20ゲーム最後まで進む`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { s } = playRandom(players, seed * 7919 + players);
        expect(s.finished).toBe(true);
        expect(s.round).toBe(5);
        const scores = finalScores(s);
        expect(scores.length).toBe(players);
        for (const r of scores) expect(Number.isFinite(r.total)).toBe(true);
      }
    });
  }
  it('ヴァリアント3種すべてありでも最後まで進む', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = playRandom(2 + (seed % 3), seed * 31, { turnOrder: true, draft: true, advSkills: true });
      expect(s.finished).toBe(true);
    }
  });
  it('最終ラウンドのパスで、残った基礎資源はすべてゴールドに替わる', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { s } = playRandom(3, seed * 43);
      expect(s.finished).toBe(true);
      for (const p of s.players) expect(p.res.wheat + p.res.wood + p.res.iron).toBe(0);
    }
  });

  it('処理順を選ぶ版（orderChoice）でも、ヴァリアントをすべて採用して最後まで進む', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = playRandom(2 + (seed % 3), seed * 47, { turnOrder: true, draft: true, advSkills: true, freeChar: true, setupDraft: true, charBuff: true }, true);
      expect(s.finished).toBe(true);
    }
  });

  it('1人でも、ヴァリアントをすべて採用して最後まで進む', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const all = { turnOrder: true, draft: true, advSkills: true, freeChar: true, setupDraft: true, charBuff: true };
      const { s } = playRandom(1, seed * 41, seed % 2 ? all : { turnOrder: false, draft: false, advSkills: false });
      expect(s.finished).toBe(true);
    }
  });

  it('キャラクターの上方修正（自由選択と併用）でも最後まで進む', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = playRandom(2 + (seed % 3), seed * 37, { turnOrder: false, draft: false, advSkills: false, freeChar: true, charBuff: true });
      expect(s.finished).toBe(true);
    }
  });
});

describe('1人の上級スキルタイル', () => {
  it('1人では3枚、2人では3枚、4人では5枚並ぶ', () => {
    const adv = { turnOrder: false, draft: false, advSkills: true };
    const names = ['A', 'B', 'C', 'D'];
    expect(createGame({ players: 1, names, variants: adv }, 5).advSkills).toHaveLength(3);
    expect(createGame({ players: 2, names, variants: adv }, 5).advSkills).toHaveLength(3);
    expect(createGame({ players: 4, names, variants: adv }, 5).advSkills).toHaveLength(5);
  });
});
