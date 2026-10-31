// リプレイの索引（buildTimeline / stateAt）：どの手数でも replay と同じ局面になる
import { describe, expect, it } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { buildTimeline, replay, stateAt, type GameRecord } from '../src/game/history';

function randomRecord(seed: number, players: number): GameRecord {
  const config = { players, names: ['A', 'B', 'C', 'D'].slice(0, players), variants: { turnOrder: false, draft: false, advSkills: false }, orderChoice: true };
  let s = createGame(config, seed);
  const moves: string[] = [];
  let r = seed;
  while (!s.finished && moves.length < 3000) {
    const o = getOptions(s);
    r = (r * 1103515245 + 12345) >>> 0;
    const pass = o.find((x) => x.id === 'pass');
    const id = pass && moves.length % 7 === 0 ? pass.id : o[r % o.length].id;
    s = applyMove(s, id);
    moves.push(id);
  }
  return { config, seed, moves };
}

describe('リプレイの索引', () => {
  it('どの手数でも replay と同じ局面になり、ラウンドの頭はその手数でラウンドが変わる', () => {
    const rec = randomRecord(77, 3);
    const tl = buildTimeline(rec, 20);
    for (const n of [0, 1, 19, 20, 21, 57, Math.floor(rec.moves.length / 2), rec.moves.length - 1, rec.moves.length]) {
      expect(JSON.stringify(stateAt(rec, tl, n)), `n=${n}`).toBe(JSON.stringify(replay(rec, n)));
    }
    expect(tl.roundStarts[0]).toBe(0);
    expect(tl.roundStarts.length).toBe(replay(rec).round);
    for (const i of tl.roundStarts.slice(1)) expect(replay(rec, i).round).toBe(replay(rec, i - 1).round + 1);
  });
});
