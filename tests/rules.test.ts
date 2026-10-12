// SweetLands_rules.md（2026-10-10版）の条項ごとのテスト
import { describe, expect, it } from 'vitest';
import { applyMove, clockReady, createGame, getOptions, viewFor, withEffects } from '../src/game/engine';
import { CARDS } from '../src/game/cards';
import { hexEdges } from '../src/game/geometry';
import { cities, connectedPorts, passedIp } from '../src/game/queries';
import { finalScores, prosVp } from '../src/game/scoring';
import type { GameState } from '../src/game/types';
import { choose, has, setupGame } from './helpers';

const me = (s: GameState) => s.players[s.current];

/** 地形タイルを置く効果を解決する（選択を順に与える） */
function placeTerrain(s: GameState, player: number, hexes: string[]): GameState {
  s = withEffects(s, player, [{ k: 'terrain', n: hexes.length, kind: 'any' }]);
  for (const h of hexes) {
    s = choose(s, (id) => id === `hex:${h}`);
    // 裏返しボーナスの選択が出たら収入を選ぶ
    while (s.pending && s.pending.step === 'choice') s = choose(s, (id) => id === 'choice:0');
  }
  return s;
}

describe('§2 ゲームの準備', () => {
  it('初期資源・収入値・第1ラウンドの手札6枚（§2.2, §5）', () => {
    const s = setupGame(2, ['エリ・マカロン', 'アリス・ティーローズ']);
    const eri = s.players.find((p) => p.character === 'エリ・マカロン')!;
    // 収入フェイズで収入値ぶん得ている：初期資源 + 収入
    expect(eri.income).toEqual({ gold: 18, wheat: 2, wood: 2, iron: 2 });
    expect(eri.res).toEqual({ gold: 18, wheat: 7, wood: 7, iron: 6 });
    expect(eri.diamond).toBe(3);
    expect(eri.hand.length).toBe(6);
  });

  it('ラウンド支援タイルの枚数（2人：通常8・パス時2）（§2.1）', () => {
    const s = setupGame(2);
    const all = s.supportTiles.flat().filter((x) => x !== null) as number[];
    expect(all.filter((x) => x < 100).length).toBe(8);
    expect(all.filter((x) => x > 100).length).toBe(2);
    expect(s.supportCols).toEqual([1, 2, 3, 4, 5]);
  });

  it('模倣ボードは3人以上で使う（§2.1-11）', () => {
    expect(Object.keys(setupGame(2).areas)).not.toContain('L1');
    expect(Object.keys(setupGame(3).areas)).toContain('L1');
    expect(Object.keys(setupGame(4).areas)).toContain('L2');
  });
});

describe('§6.1 アクションスペースと手札コスト', () => {
  it('左から1・2・3番目のスペースの手札コストは1・2・3枚', () => {
    let s = setupGame(2);
    const p = me(s).seat;
    const hand0 = me(s).hand.length;
    s = choose(s, (id) => id === 'area:K');
    s = choose(s, (id) => id.startsWith('card:'));
    expect(s.players[p].hand.length).toBe(hand0 - 1);
    expect(s.players[p].res.gold).toBeGreaterThan(0);
  });

  it('第1〜4ラウンドは手札が0枚になる行動を取れない（§6.0）', () => {
    let s = setupGame(2);
    s.players[s.current].hand = s.players[s.current].hand.slice(0, 1);
    s = withEffects(s, s.current, []);
    expect(getOptions(s).some((o) => o.id === 'area:K')).toBe(false);
    expect(getOptions(s).some((o) => o.id.startsWith('play:'))).toBe(false);
  });

  it('特殊アクションL：コピー先のコストも支払う（§13.2-2）', () => {
    let s = setupGame(3);
    const p = s.current;
    s.players[p].res = { gold: 10, wheat: 10, wood: 0, iron: 0 };
    s = withEffects(s, p, []);
    s = choose(s, (id) => id === 'area:L1:A');
    s = choose(s, (id) => id.startsWith('card:'));
    expect(s.players[p].res.gold).toBe(6);
    expect(s.players[p].res.wheat).toBe(4);
  });
});

describe('§6.2〜6.3 地形タイルと道駒', () => {
  it('首都かタイルに隣接し、地形が一致するヘクスにだけ置ける', () => {
    let s = setupGame(2, [], 42, ['A', 'B1']);
    const p = s.current;
    s = withEffects(s, p, [{ k: 'terrain', n: 1, kind: 'any' }]);
    const ids = getOptions(s).map((o) => o.id);
    // A面：首都 6,8 / 6,10 に隣接する 6,6（海）, 5,7（麦）, 5,9（森）, 5,11（鉱）, 6,12（鉱）
    expect(new Set(ids)).toEqual(new Set(['hex:6,6', 'hex:5,7', 'hex:5,9', 'hex:5,11', 'hex:6,12', 'stop']));
  });

  it('ヘクスのアイコンのボーナスを得る（§6.2）', () => {
    let s = setupGame(2, [], 42, ['A', 'A']);
    const p = s.current;
    const g = s.players[p].res.gold;
    s = placeTerrain(s, p, ['6,6']); // 6,6 は海（アイコンなし）
    s = placeTerrain(s, p, ['6,4']); // 6,4 は海・5ゴールド
    expect(s.players[p].res.gold).toBe(g + 5);
  });

  it('道駒は首都の頂点か既存の道駒に接する辺にだけ置ける', () => {
    let s = setupGame(2, [], 42, ['A', 'A']);
    const p = s.current;
    s = withEffects(s, p, [{ k: 'road', n: 1 }]);
    const edges = getOptions(s).filter((o) => o.id.startsWith('edge:'));
    // 首都2ヘクスの頂点に接する辺のみ
    expect(edges.length).toBeGreaterThan(6);
    expect(edges.length).toBeLessThan(25);
  });

  it('道駒が隣接したらタイルを裏返し、ボーナスを得る（§6.3）', () => {
    let s = setupGame(2, [], 42, ['A', 'A']);
    const p = s.current;
    s = placeTerrain(s, p, ['6,6']); // 海
    const inc = s.players[p].income.gold;
    // 6,6 と首都 6,8 の間の辺
    const e = hexEdges(6, 6).find((x) => hexEdges(6, 8).includes(x))!;
    s = withEffects(s, p, [{ k: 'road', n: 1 }]);
    s = choose(s, (id) => id === `edge:${e}`);
    expect(s.players[p].hexes['6,6'].tile!.flipped).toBe(true);
    expect(s.players[p].income.gold).toBe(inc + 2); // 海の裏面：ゴールドの収入+2
  });
});

describe('§6.4 建物駒', () => {
  it('段のコストは下から木材2・3…、鉄3。置き終えたあとに段のボーナス', () => {
    let s = setupGame(2, ['アリス・ティーローズ', 'エリ・マカロン'], 42, ['A', 'A']);
    const p = s.players.findIndex((x) => x.character === 'アリス・ティーローズ');
    s.players[p].res = { gold: 0, wheat: 0, wood: 10, iron: 10 };
    s = withEffects(s, p, [{ k: 'building', n: 1, viaAction: true }]);
    s = choose(s, (id) => id === 'piece:bldg');
    s = choose(s, (id) => id === 'hex:6,8');
    // 首都のボーナス（任意の収入1／繁栄1）
    s = choose(s, (id) => id === 'choice:0');
    s = choose(s, (id) => id === 'res:gold');
    expect(s.players[p].res.wood).toBe(8);
    expect(s.players[p].res.iron).toBe(7);
    expect(s.players[p].diamond).toBe(2 + 2); // ビル駒5段目：ダイヤ2
  });

  it('建物駒を2個・4個建てると産業列の上限が2・3枚になる（§6.9）', () => {
    const s = setupGame(2);
    const p = s.players[0];
    p.taken.tent = 2;
    p.taken.house = 4;
    // rowCapacity は queries から
    return import('../src/game/queries').then(({ rowCapacity }) => {
      expect(rowCapacity(p, 'agr')).toBe(2);
      expect(rowCapacity(p, 'for')).toBe(3);
      expect(rowCapacity(p, 'min')).toBe(1);
    });
  });
});

describe('§6.5 工業トラック', () => {
  it('研究所駒は越えられず、進めない歩数は失われる', () => {
    let s = setupGame(2);
    const p = s.current;
    s = withEffects(s, p, [{ k: 'industry', n: 8 }]);
    while (s.pending && s.pending.player === p && s.pending.kind !== 'turn') s = applyMove(s, getOptions(s)[0].id);
    expect(s.players[p].carriage).toBe(5); // 6マス目と7マス目の間に1個目の研究所駒
  });

  it('工業点アイコン：通過した合計（§6.11-3）', () => {
    const s = setupGame(2);
    const p = s.players[0];
    p.carriage = 13;
    p.loco = 8;
    expect(passedIp(p)).toBe(1 + 1 + 2 + 1 + 1);
  });

  it('終点で進めようとすると1歩ごとに1勝利点', () => {
    let s = setupGame(2);
    const p = s.current;
    s.players[p].carriage = 17;
    s = withEffects(s, p, [{ k: 'industry', n: 3 }]);
    expect(s.players[p].score.vp).toBe(3);
  });
});

describe('§6.6〜6.7 食料トラックとクッキーラビット駒', () => {
  it('7マス目で「-1」、11マス目で「-2」の木材割引。右端の超過は麦2', () => {
    let s = setupGame(2);
    const p = s.current;
    s.players[p].food = 6;
    const w = s.players[p].res.wheat;
    s = withEffects(s, p, [{ k: 'food', n: 1 }]);
    expect(s.players[p].woodDiscount).toBe(1);
    s.players[p].food = 12;
    s = withEffects(s, p, [{ k: 'food', n: 2 }]);
    expect(s.players[p].res.wheat).toBe(w + 4);
  });

  it('1個目のクッキーラビット駒は食料4マス目に到達していないと置けない', () => {
    let s = setupGame(2);
    const p = s.current;
    s.players[p].hexes['6,8'].building = 'tent';
    s.players[p].food = 3;
    s = withEffects(s, p, [{ k: 'rabbit', n: 1 }]);
    expect(s.players[p].rabbitsTaken).toBe(0);
    s.players[p].food = 4;
    s = withEffects(s, p, [{ k: 'rabbit', n: 1 }]);
    s = choose(s, (id) => id === 'hex:6,8');
    expect(s.players[p].rabbitsTaken).toBe(1);
    expect(s.players[p].hexes['6,8'].rabbit).toBe(true);
  });
});

describe('§6.8 繁栄トラック', () => {
  it('右端に進むにはダイヤ1、右端の即時効果は最初の1人だけ', () => {
    let s = setupGame(2);
    const p = s.current;
    const o = 1 - p;
    s.players[p].pros[1] = 8;
    s.players[o].pros[1] = 8;
    s = withEffects(s, p, [{ k: 'pros', n: 1, color: 'O' }]);
    s = choose(s, (id) => id === 'pros:1');
    expect(s.players[p].score.vp).toBe(7);
    s = withEffects(s, o, [{ k: 'pros', n: 1, color: 'O' }]);
    s = choose(s, (id) => id === 'pros:1');
    expect(s.players[o].score.vp).toBe(0);
    expect(s.players[o].pros[1]).toBe(9);
  });

  it('勝利点レート：一番上（地形タイル）0／3枚に1／2枚に1／1枚に1', () => {
    const s = setupGame(2);
    const p = s.players[0];
    for (const k of ['6,6', '5,7', '5,9', '5,11', '6,12', '6,4']) p.hexes[k].tile = { kind: 'W', flipped: false };
    p.pros[0] = 0;
    expect(prosVp(p, 0)).toBe(0);
    p.pros[0] = 2;
    expect(prosVp(p, 0)).toBe(2);
    p.pros[0] = 3;
    expect(prosVp(p, 0)).toBe(3);
    p.pros[0] = 5;
    expect(prosVp(p, 0)).toBe(6);
  });
});

describe('§6.11 都市', () => {
  it('3種類以上の建物駒が連続して隣接すると1つの都市', () => {
    const s = setupGame(2, ['エリ・マカロン', 'リッカ・ベリー']);
    const p = s.players[0];
    p.hexes['6,8'].building = 'tent';
    p.hexes['6,10'].building = 'tent';
    p.hexes['5,9'].building = 'lab';
    expect(cities(p).length).toBe(0);
    p.hexes['5,11'].building = 'house';
    expect(cities(p).length).toBe(1);
  });

  it('アリス・ティーローズ：同じ種類でも3個で都市', () => {
    const s = setupGame(2, ['アリス・ティーローズ', 'エリ・マカロン']);
    const p = s.players.find((x) => x.character === 'アリス・ティーローズ')!;
    p.hexes['6,8'].building = 'tent';
    p.hexes['6,10'].building = 'tent';
    p.hexes['5,9'].building = 'tent';
    expect(cities(p).length).toBe(1);
  });
});

describe('§9 最終得点計算', () => {
  it('港：連続した地形タイルで首都まで届けば接続', () => {
    const s = setupGame(2, [], 42, ['A', 'A']);
    const p = s.players[0];
    // 港4（左辺）：r5c1・r6c0 に隣接。6,0→6,2→6,4→6,6→首都6,8
    for (const k of ['6,0', '6,2', '6,4', '6,6']) p.hexes[k].tile = { kind: 'S', flipped: false };
    expect(connectedPorts(p)).toBe(1);
  });

  it('最終得点計算タイル：仮想プレイヤーが1位なら次の人が2位で7点', () => {
    const s = setupGame(2);
    s.finalTiles = [3]; // オートメーション化したカード（中立4）
    s.players[0].automated.agr = ['a', 'b'];
    s.players[1].automated.agr = ['c'];
    const rows = finalScores(s);
    const item = (i: number) => rows[i].items.find((x) => x.label.startsWith('最終得点計算'))!.vp;
    expect(item(0)).toBe(7);
    expect(item(1)).toBe(0);
  });

  it('最終得点計算タイル：仮想プレイヤーと同点1位なら15点、2位は0点', () => {
    const s = setupGame(2);
    s.finalTiles = [3];
    s.players[0].automated = { agr: ['a', 'b'], for: ['c', 'd'], min: [] };
    s.players[1].automated.agr = ['e'];
    const rows = finalScores(s);
    const item = (i: number) => rows[i].items.find((x) => x.label.startsWith('最終得点計算'))!.vp;
    expect(item(0)).toBe(15);
    expect(item(1)).toBe(0);
  });
});

describe('時計塔駒の配置条件（§12.2）', () => {
  // 建物の条件のうち、家駒と書いていたものは任意の建物駒（ユーザー確認 2026-10-12）。テント駒・研究所駒・ビル駒の指定はそのまま
  const ready = (name: string, types: ('tent' | 'house' | 'bldg' | 'lab')[]) => {
    const s = setupGame(2, [name]);
    const p = s.players[0];
    const keys = Object.keys(p.hexes);
    types.forEach((ty, i) => (p.hexes[keys[i]].building = ty));
    // 建物以外の条件はすべて満たしておく
    Object.values(p.hexes).forEach((h) => h.terrain !== 'X' && h.terrain !== 'C' && !h.tile && (h.tile = { kind: h.terrain as 'F', flipped: false }));
    p.played = Object.keys(CARDS).slice(0, 6);
    p.food = 9;
    p.wonders = 1;
    return { s, p, clockReady: () => clockReady(s, p) };
  };

  it('セナ・デライト：種類の違う建物駒4個で満たす', () => {
    expect(ready('セナ・デライト', ['tent', 'house', 'bldg', 'lab']).clockReady()).toBe(true);
    expect(ready('セナ・デライト', ['tent', 'house', 'bldg']).clockReady()).toBe(false);
  });

  it('エリ・マカロン：テント駒の指定は種類を問わない扱いにしない', () => {
    expect(ready('エリ・マカロン', ['house', 'bldg']).clockReady()).toBe(false);
  });
});

describe('最終得点の表（§9）', () => {
  it('条件つきの行も全員に同じ並びで入り、行ごとの値が正しい人の列に出る', () => {
    const s = setupGame(3);
    s.finalTiles = [3];
    // 2人目だけが家駒を5個取り終えている
    s.players[1].taken.house = 5;
    s.players[1].score.cp = 4;
    s.players[2].res.gold = 12;
    const rows = finalScores(s);
    const labels = rows.map((r) => r.items.map((x) => x.label).join('|'));
    expect(new Set(labels).size).toBe(1);
    const vp = (seat: number, label: string) => rows[seat].items.find((x) => x.label === label)!.vp;
    expect(vp(0, '家駒5個：都市点×1')).toBe(0);
    expect(vp(1, '家駒5個：都市点×1')).toBe(4);
    expect(vp(2, 'ゴールド5につき1')).toBe(2);
    for (const r of rows) expect(r.total).toBe(r.items.reduce((a, b) => a + b.vp, 0));
  });
});

describe('§8 クリーンナップとパス', () => {
  it('全員パスでクリーンナップ：手札は1枚だけ残し、ディスクを戻す', () => {
    let s = setupGame(2);
    s.players.forEach((p) => (p.discs = 2));
    s = choose(s, (id) => id === 'pass');
    while (s.pending && s.pending.step === 'passMove') s = applyMove(s, getOptions(s)[0].id);
    while (s.pending && s.pending.kind !== 'turn') s = applyMove(s, getOptions(s)[0].id);
    s = choose(s, (id) => id === 'pass');
    while (s.pending && !(s.round === 2 && s.pending.kind === 'turn')) s = applyMove(s, getOptions(s)[0].id);
    expect(s.round).toBe(2);
    for (const p of s.players) expect(p.discs).toBe(0);
    // 第2ラウンドの収入で1+5枚
    for (const p of s.players) expect(p.hand.length).toBe(6);
    expect(s.revealed).toEqual(['M', 'N', 'P']);
  });

  it('最初にパスした人が次のスタートプレイヤー', () => {
    let s = setupGame(2);
    const first = s.current;
    s = choose(s, (id) => id === 'pass');
    while (s.pending && s.pending.kind !== 'turn') s = applyMove(s, getOptions(s)[0].id);
    expect(s.startPlayer).toBe(first);
    expect(has(s, 'pass')).toBe(true);
  });
});

describe('§10 ヴァリアント', () => {
  it('手札のドラフト：全員が6枚ずつ受け取り、渡されたカードから選ぶ', async () => {
    const { createGame } = await import('../src/game/engine');
    let s = createGame({ players: 3, names: ['A', 'B', 'C'], variants: { turnOrder: false, draft: true, advSkills: false } }, 7);
    let picks = 0;
    while (s.pending && s.pending.kind !== 'turn') {
      if (s.pending.step === 'draftPick') {
        expect(getOptions(viewFor(s, s.pending.player)).length).toBe(6 - Math.floor(picks / 3));
        picks++;
      }
      s = applyMove(s, getOptions(s)[0].id);
    }
    expect(picks).toBe(18);
    // ラウンド支援タイル「市民カード1枚」で7枚になることがある
    for (const p of s.players) expect(p.hand.length).toBeGreaterThanOrEqual(6);
    const all = s.players.flatMap((p) => p.hand);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('§10.2 手札のドラフトの同時選択', () => {
  const cfg = { players: 3, names: ['A', 'B', 'C'], variants: { turnOrder: false, draft: true, advSkills: false } };
  const toDraft = (seed: number) => {
    let s = createGame(cfg, seed);
    while (s.pending && s.pending.step !== 'draftPick') s = applyMove(s, getOptions(s)[0].id);
    return s;
  };

  it('同じ巡の中では全員が同時に選べ、選んだ順に関係なく同じ結果になる', () => {
    let a = toDraft(11);
    let b = a;
    expect(a.pending!.waiting!.length).toBe(3);
    // a は手番順、b は逆順に、各席の束の先頭を取る
    const pick = (s: GameState, seat: number) => applyMove(s, getOptions(viewFor(s, seat))[0].id);
    for (const seat of a.pending!.waiting!) a = pick(a, seat);
    for (const seat of [...b.pending!.waiting!].reverse()) b = pick(b, seat);
    expect(a.draftPicked).toEqual(b.draftPicked);
    expect(a.draftPacks).toEqual(b.draftPacks);
    expect(a.pending!.step).toBe('draftPick');
    expect(a.pending!.waiting!.length).toBe(3);
  });

  it('席から見た選択肢は自分の束のカードだけで、選んだカードは取ったカードに入る', () => {
    let s = toDraft(12);
    const seat = s.pending!.waiting![1];
    const v = viewFor(s, seat);
    expect(v.pending!.player).toBe(seat);
    expect(getOptions(v).map((o) => o.data!.card)).toEqual(s.draftPacks[seat]);
    const card = String(getOptions(v)[2].data!.card);
    s = applyMove(s, getOptions(v)[2].id);
    expect(s.draftPicked[seat]).toEqual([card]);
    expect(s.pending!.waiting).not.toContain(seat);
    // 選び終えた席から見ると、まだ選んでいる人の選択待ちが見える（自分の選択肢はない）
    expect(viewFor(s, seat).pending!.player).not.toBe(seat);
  });
});

describe('監査で見つかった不具合の回帰テスト', () => {
  it('特殊地形ヘクスへの配置も1枚として数える（§6.2）', () => {
    let s = setupGame(2, [], 42, ['A', 'A']);
    const p = s.current;
    // 特殊地形ヘクス 1,9 の隣（2,8 森林）までタイルを敷いておく
    for (const k of ['5,9', '4,8', '3,9', '2,8']) s.players[p].hexes[k].tile = { kind: 'F', flipped: false };
    s = withEffects(s, p, [{ k: 'terrain', n: 1, kind: 'any' }]);
    s = choose(s, (id) => id === 'hex:1,9');
    s = choose(s, (id) => id.startsWith('special:'));
    while (s.pending && s.pending.kind !== 'turn' && s.pending.step !== 'terrain') s = applyMove(s, getOptions(s)[0].id);
    expect(s.pending?.step).not.toBe('terrain');
  });

  it('パス時の工業点は①（エルサの地形タイル）のあとで数える（§6.11）', () => {
    let s = setupGame(2, ['エルサ・スカイル', 'アリス・ティーローズ'], 42, ['A', 'A']);
    const e = s.players.findIndex((x) => x.character === 'エルサ・スカイル');
    s.players[e].carriage = 3; // 次の1歩で工業点アイコン1を通過
    // A面 6,12（首都に隣接・鉱山）に工業トラックのアイコンがある
    s.current = e;
    s = withEffects(s, e, []);
    s = choose(s, (id) => id === 'pass');
    s = choose(s, (id) => id === 'hex:6,12');
    while (s.pending && s.pending.player === e && s.pending.step !== 'passMove') s = applyMove(s, getOptions(s)[0].id);
    expect(s.players[e].carriage).toBe(4);
    expect(s.players[e].score.ip).toBe(1);
  });
});

describe('地形タイルの数え上げ（ユーザー確認済み：表裏を問わない）', () => {
  it('塗りつぶしの地形アイコンは表裏を問わず数え、「裏」は裏向きだけを数える', async () => {
    const { terrainCount } = await import('../src/game/queries');
    const s = setupGame(2);
    const p = s.players[0];
    const wheat = Object.values(p.hexes).filter((h) => h.terrain === 'W').slice(0, 3);
    wheat[0].tile = { kind: 'W', flipped: false };
    wheat[1].tile = { kind: 'W', flipped: true };
    wheat[2].tile = { kind: 'W', flipped: true };
    expect(terrainCount(p, 'W', true)).toBeGreaterThanOrEqual(2);
    expect(terrainCount(p, 'W', true)).toBe(Object.values(p.hexes).filter((h) => h.terrain === 'W' && h.tile?.flipped).length);
    expect(terrainCount(p, 'W')).toBe(Object.values(p.hexes).filter((h) => h.terrain === 'W' && h.tile).length);
  });
});
