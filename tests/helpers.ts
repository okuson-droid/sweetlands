import { applyMove, createGame, getOptions } from '../src/game/engine';
import type { GameConfig, GameState } from '../src/game/types';

/** 準備を済ませ、第1ラウンドのアクションフェイズ最初の手番まで進める */
export function setupGame(players = 2, chars: string[] = [], seed = 42, maps: string[] = [], variants: GameConfig['variants'] = { turnOrder: false, draft: false, advSkills: false }): GameState {
  let s = createGame({ players, names: ['A', 'B', 'C', 'D'].slice(0, players), variants }, seed);
  let ci = 0;
  let mi = 0;
  while (s.pending && s.pending.kind !== 'turn') {
    const pd = s.pending;
    const opts = getOptions(s);
    let id = opts[0].id;
    // 地図ボード（rules v1.1 §2.2）：A面は、ほかの人が B面で指定していないボードのものを取る
    const wantedB = new Set(maps.filter((m) => m !== 'A'));
    const aFace = () => opts.find((o) => o.id.startsWith('map:A@') && !wantedB.has(o.id.slice(6)))!.id;
    if (pd.step === 'setupChar' && chars[ci]) id = `char:${chars[ci++]}`;
    else if (pd.step === 'setupMap' && maps[mi] && maps[mi] !== 'A') id = `map:${maps[mi++]}`;
    else if (pd.step === 'setupMap') {
      id = aFace();
      mi++;
    }
    s = applyMove(s, id);
  }
  return s;
}

export function choose(s: GameState, pred: (id: string, label: string) => boolean): GameState {
  const o = getOptions(s).find((x) => pred(x.id, x.label));
  if (!o) throw new Error(`選択肢が見つかりません: ${s.pending?.prompt} / ${getOptions(s).map((x) => x.id).join(',')}`);
  return applyMove(s, o.id);
}

export const has = (s: GameState, id: string) => getOptions(s).some((o) => o.id === id);
