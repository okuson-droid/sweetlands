// 対話プレイ用のコマンド（tools/play）の検査。
// 乱択の自己対戦で、コマンド経由の1局が最後まで進むこと、選択肢のラベルに内部の識別子が混ざらないこと、
// 視点の席の出力に他の席の手札の中身が出ないこと、選べない指定で記録が変わらないことを確かめる。
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCommand } from '../tools/play/commands';
import { extendReplay, readRecord, seatOptions, shownId, waitingSeats, type PlayRecord, type Replayed } from '../tools/play/record';
import { CARDS } from '../src/game/cards';
import { applyMove, createGame, getOptions } from '../src/game/engine';
import { nextRandom } from '../src/game/rng';
import type { GameConfig, GameState, Option } from '../src/game/types';

/** ラベルに混ざってはいけないもの：カード ID・辺の頂点座標・英字の内部名・未定義の値 */
const BAD_LABEL = [/p\d\d-r\dc\d/, /\d+\.\d{3}/, /undefined|NaN|null|\[object/, /[A-Za-z]{3,}/];
const badLabel = (o: Option) => BAD_LABEL.some((re) => re.test(o.label)) || o.label.trim() === '';

/** 乱択の選び方：手番は主行動の後すぐ終え、ときどきパスする。それ以外は一様に選ぶ */
function pickIndex(s: GameState, opts: Option[], r: number): number {
  if (s.pending!.step === 'turn') {
    const end = opts.findIndex((o) => o.id === 'endTurn');
    if (end >= 0) return end;
    if (r < 0.12 && s.round < 5) return opts.findIndex((o) => o.id === 'pass');
  }
  return Math.floor(r * opts.length) % opts.length;
}

describe('選択肢のラベル', () => {
  const configs: [GameConfig['variants'], number][] = [
    [{ turnOrder: false, draft: false, advSkills: false }, 8],
    [{ turnOrder: true, draft: true, advSkills: true, freeChar: true, setupDraft: true, charBuff: true, charPool: true }, 3],
  ];
  it('乱択プレイアウトで、どの選択肢のラベルにも内部の識別子が混ざらない', () => {
    const bad = new Map<string, string>();
    for (const [variants, games] of configs)
      for (let seed = 1; seed <= games; seed++) {
        let s = createGame({ players: 2 + (seed % 3), names: ['A', 'B', 'C', 'D'].slice(0, 2 + (seed % 3)), variants, orderChoice: true }, seed * 101);
        let rng = seed;
        for (let n = 0; !s.finished && n < 20000; n++) {
          const opts = getOptions(s);
          for (const o of opts) if (badLabel(o)) bad.set(`${s.pending!.step}:${o.id}`, o.label);
          const [r, nr] = nextRandom(rng);
          rng = nr;
          s = applyMove(s, opts[pickIndex(s, opts, r)].id);
        }
        expect(s.finished).toBe(true);
      }
    expect([...bad].slice(0, 10)).toEqual([]);
  }, 120_000);
});

describe('対話プレイ用のコマンド', () => {
  it('打ち手への指示は3KB以内', () => {
    expect(readFileSync(join(__dirname, '../docs/playtest/player-brief.md')).length).toBeLessThanOrEqual(3072);
  });

  it('コマンド経由の1局が最後まで進み、他の席の手札が出ず、選べない指定では記録が変わらない', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'play-cli-'));
    const file = join(dir, 'game.json');
    const run = async (...argv: string[]) => runCommand([...argv, '--file', file]);

    expect((await run('new', '--players', '3', '--seed', '29')).code).toBe(0);
    expect((await run('new', '--players', '3', '--seed', '29')).code).toBe(1); // 上書きは --force のときだけ

    let prev: { rec: PlayRecord; rep: Replayed } | null = null;
    const current = () => {
      const rec = readRecord(file);
      const rep = extendReplay(prev, rec);
      prev = { rec, rep };
      return rep.state;
    };
    /** 視点の席の出力に、他の席の手札のカード ID と名前が出ていないか */
    const leaks = (s: GameState, seat: number, text: string, names: boolean) =>
      s.players
        .filter((p) => p.seat !== seat)
        .flatMap((p) => p.hand)
        .filter((id) => text.includes(id) || (names && text.includes(CARDS[id].nameJa)));

    let rng = 77;
    let moves = 0;
    let checkedRoundEnd = false;
    let usedEdgeAlias = false;
    for (; moves < 6000; moves++) {
      const s = current();
      if (s.finished) break;
      const seat = waitingSeats(s)[0];
      const opts = seatOptions(s, seat);
      expect(opts.length).toBeGreaterThan(0);
      for (const o of opts) expect(badLabel(o), `${o.id} ${o.label}`).toBe(false);

      if (!checkedRoundEnd && s.round === 2) {
        const w = await run('wait', '--seat', String((seat + 1) % 3), '--round', '1', '--timeout', '0');
        expect(w.out).toContain('ラウンド 1 は終わった');
        checkedRoundEnd = true;
      }
      if (moves % 25 === 0) {
        for (let k = 0; k < 3; k++) {
          const show = await run('show', '--seat', String(k));
          expect(show.code).toBe(0);
          expect(leaks(s, k, show.out, true)).toEqual([]);
          for (const id of s.players[k].hand) expect(show.out).toContain(id); // 自分の手札は出る（検査が働いていることの確認）
          const w = await run('wait', '--seat', String(k), '--timeout', '0');
          expect(w.code).toBe(0);
          expect(leaks(s, k, w.out, false)).toEqual([]);
          if (k !== seat) expect(w.out).toContain('まだ番ではない');
        }
        // 選べない指定：記録は変わらず、2行目にその段の選択肢が出る
        const before = readFileSync(file, 'utf8');
        const bad = await run('move', '1', 'no-such-option', '--seat', String(seat));
        expect(bad.code).toBe(1);
        expect(bad.out).toContain('この段の選択肢');
        expect(readFileSync(file, 'utf8')).toBe(before);
        const wrongSeat = await run('move', '1', '--seat', String((seat + 1) % 3));
        expect(wrongSeat.code).toBe(1);
        expect(readFileSync(file, 'utf8')).toBe(before);
      }

      const [r, nr] = nextRandom(rng);
      rng = nr;
      const k = pickIndex(s, opts, r);
      // 番号・ID・辺の呼び名を混ぜて指定する
      const opt = opts[k];
      const token = opt.id.startsWith('edge:') ? shownId(s, seat, opt) : moves % 2 ? opt.id : String(k + 1);
      if (opt.id.startsWith('edge:')) usedEdgeAlias = true;
      const res = await run('move', token, '--seat', String(seat));
      expect(res.code, res.out).toBe(0);
      expect(leaks(current(), seat, res.out, true)).toEqual([]);
    }
    const s = current();
    expect(s.finished).toBe(true);
    expect(moves).toBeGreaterThan(200);
    expect(checkedRoundEnd).toBe(true);
    expect(usedEdgeAlias).toBe(true);
    const score = await run('score');
    expect(score.out).toContain('最終得点');
    const w = await run('wait', '--seat', '0', '--round', '5');
    expect(w.out).toContain('ゲーム終了');
    const resume = await run('resume', '--seat', '1');
    expect(resume.code).toBe(0);
    const ref = await run('ref', '--seat', '0');
    expect(ref.code).toBe(0);
    expect(ref.out).toContain('ルールの要約');
  }, 300_000);
});
