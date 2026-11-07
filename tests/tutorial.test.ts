// 実践形式のチュートリアル（docs/decisions_13 §13.24）：台本の手が、固定のシードで最後まで合法に進むこと
import { describe, expect, it } from 'vitest';
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { guidedView, matchMoves } from '../src/ui/tutorial/guide';
import { TUTORIAL_CONFIG, TUTORIAL_SEED, TUTORIAL_STEPS } from '../src/ui/tutorial/script';

describe('チュートリアルの台本', () => {
  it('台本の手は、どの段でも本物の選択肢にあり、最後は第2ラウンドの手番になる', () => {
    let s = createGame(TUTORIAL_CONFIG, TUTORIAL_SEED);
    for (const step of TUTORIAL_STEPS) {
      if (!step.move) continue;
      expect(getOptions(s).map((o) => o.id), step.title).toContain(step.move);
      // 画面に渡す局面では、その手だけが選べる
      expect(getOptions(guidedView(s, step)).map((o) => o.id)).toEqual([step.move]);
      s = applyMove(s, step.move);
    }
    expect(s.round).toBe(2);
    expect(s.pending?.step).toBe('turn');
    expect(TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].move).toBeUndefined();
  });

  it('説明だけの段では何も選べない', () => {
    const s = createGame(TUTORIAL_CONFIG, TUTORIAL_SEED);
    expect(guidedView(s, TUTORIAL_STEPS[0]).pending).toBeNull();
  });

  it('台本と違う手は受け付けず、複数の手をまとめた操作は続く段と照らし合わせる', () => {
    const s = createGame(TUTORIAL_CONFIG, TUTORIAL_SEED);
    const first = TUTORIAL_STEPS.findIndex((x) => x.move);
    expect(matchMoves(TUTORIAL_STEPS, s, 0, ['char:アリス・ティーローズ'])).toBeNull();
    const ok = matchMoves(TUTORIAL_STEPS, s, 0, [TUTORIAL_STEPS[first].move!, TUTORIAL_STEPS[first + 1].move!]);
    expect(ok?.step).toBe(first + 2);
    // 2つ目が違えば、1つ目も適用しない
    expect(matchMoves(TUTORIAL_STEPS, s, 0, [TUTORIAL_STEPS[first].move!, 'map:B2'])).toBeNull();
  });
});
