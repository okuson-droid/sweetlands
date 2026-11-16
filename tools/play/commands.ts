// 対話プレイ用のコマンドの本体。引数の解釈と出力の組み立てだけを行い、記録の処理は record.ts、文字の組み立ては view.ts・ref.ts に任せる。
// 1回の呼び出しで完結し、入力待ちを作らない。出力は runCommand が文字列で返す（cli.ts が標準出力に書く。テストは直接呼ぶ）。

import { finalScores } from '../../src/game/scoring';
import type { GameState } from '../../src/game/types';
import {
  applyTokens,
  defaultConfig,
  DEFAULT_RECORD_PATH,
  extendReplay,
  FORMAT,
  isWaitingFor,
  PlayError,
  readRecord,
  readSeen,
  recordExists,
  recordStamp,
  replayRecord,
  waitingSeats,
  writeRecord,
  writeSeen,
  type PlayRecord,
  type Replayed,
} from './record';
import { refCards, refLines, REF_DEFAULT, REF_SECTIONS, type RefSection } from './ref';
import { handLines, mapLines, optionLines, ownEventText, playerDetail, playersBlock, scoreLines, sharedBlock, showLines, SHOW_SECTIONS, statusLine, stepText, turnLines, turnView, seatName, type ShowSection } from './view';

/** wait と --then-wait の既定の時間切れ（秒）。打ち手の道具の上限（約120秒）より短くする */
const WAIT_TIMEOUT = 100;
const POLL_MS = 400;

const HELP = `スイーツランドの対話プレイ用のコマンド（1回の呼び出しで完結する。局面は記録の手の列を再生して作る）

使い方: node <リポジトリ>/dist-play/cli.js <コマンド> [引数] [--file <記録>]（記録の既定は ${DEFAULT_RECORD_PATH}、呼び出したディレクトリからの相対）
席の番号は 0 始まり（P0・P1・P2）。選択肢は ID か、直前に出た番号（1始まり）で選ぶ。

  new --players <2-4> --seed <整数> [--names a,b,c] [--force]
      通常ルール（ヴァリアントなし）の記録を作る。既にあれば --force のときだけ上書きする。
  show [--seat N] [--only <欄,...>] [--player N]
      局面を出す。欄：${SHOW_SECTIONS.join('・')}（既定はすべて。--seat がなければ席に依らない欄だけ）。
      --player N はその席の個人ボードと地図（公開情報）。他の席の手札の中身は出さない。
  move <選択肢>... --seat N [--then-wait] [--round R] [--timeout 秒]
      選択肢 ID か番号を順に当てる。1つでも選べなければ記録を変えずに失敗し、2行目にその段の選択肢 ID を出す。
      道駒の辺は edge:<行>,<列>:<向き>（向き e w ne nw se sw）。出力は適用した選択・自分の増減・次の選択肢（または選択待ちの席）。
      --then-wait は、選択待ちが他の席に移ったらそのまま wait と同じく番を待つ。
  move --dry-run <選択肢>... --seat N
      記録を変えずに下見する（自分の増減・いま終わったときの計算の増減・次の選択待ち）。山札・乱数に触れる手の手前で止める。
  wait --seat N [--round R] [--timeout 秒]
      番が来るまで待つ（既定${WAIT_TIMEOUT}秒）。前回の表示の後の他の席の手番を1行ずつ出し、番が来たら局面の要約と選択肢を出す。
      --round R を付けると、局面がラウンド R より先へ進んでいれば「ラウンド R は終わった」と出して終える（準備は第1ラウンドに含める）。
      時間切れなら「まだ番ではない」と出して終わる（もう一度呼ぶ）。ゲームが終われば最終得点を出す。
  ref [--seat N] [--only <欄,...>] [--card <カード,...>]
      対局中に変わらない文言。欄：${REF_SECTIONS.join('・')}（既定は maps 以外。maps は準備で地図の面を選ぶとき）。--card はカードの全文。
  resume --seat N
      作り直した打ち手が最初に呼ぶ。局面・自分の個人ボードと地図・手札の効果文・自分のこれまでの手番・
      このラウンドの他の席の手番・いま終わったときの計算・（番なら）選択肢を1回で出す。
  score      最終得点の内訳（終局前は、いま終わったときの計算）。
  log [--from 手数] [--seat N]   記録の選択を1行ずつ（--seat の席の視点で、他の席の非公開の選択は伏せる）。
  --help     この説明。

例:
  node dist-play/cli.js new --players 3 --seed 7
  node dist-play/cli.js resume --seat 0
  node dist-play/cli.js wait --seat 0 --round 1
  node dist-play/cli.js move area:A card:p08-r3c1 hex:5,7 hex:5,9 stop endTurn --seat 0 --then-wait --round 1
  node dist-play/cli.js ref --only rules,ids`;

type Args = { positional: string[]; flags: Map<string, string | true> };
const VALUE_FLAGS = new Set(['file', 'players', 'seed', 'names', 'seat', 'player', 'only', 'card', 'round', 'timeout', 'from']);

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (VALUE_FLAGS.has(name)) {
        const v = argv[i + 1];
        if (v === undefined) throw new PlayError(`--${name} に値がない`);
        flags.set(name, v);
        i++;
      } else flags.set(name, true);
    } else positional.push(a);
  }
  return { positional, flags };
}
const str = (a: Args, n: string) => {
  const v = a.flags.get(n);
  return typeof v === 'string' ? v : undefined;
};
const int = (a: Args, n: string): number | undefined => {
  const v = str(a, n);
  if (v === undefined) return undefined;
  if (!/^-?\d+$/.test(v)) throw new PlayError(`--${n} は整数で指定すること：${v}`);
  return Number(v);
};
const seatArg = (a: Args, s: GameState, required: boolean): number | null => {
  const n = int(a, 'seat');
  if (n === undefined) {
    if (required) throw new PlayError('--seat <席の番号> を付けること');
    return null;
  }
  if (n < 0 || n >= s.players.length) throw new PlayError(`席の番号は 0〜${s.players.length - 1}：${n}`);
  return n;
};
function listArg<T extends string>(a: Args, name: string, allowed: readonly T[]): T[] | undefined {
  const v = str(a, name);
  if (v === undefined) return undefined;
  const parts = v.split(',').map((x) => x.trim()).filter(Boolean);
  const bad = parts.filter((x) => !(allowed as readonly string[]).includes(x));
  if (bad.length) throw new PlayError(`知らない欄：${bad.join(',')}（使える欄：${allowed.join(',')}）`);
  return parts as T[];
}

let sink: string[] = [];
let stream: ((text: string) => void) | null = null;
const print = (lines: string[] | string) => {
  const text = (Array.isArray(lines) ? lines.join('\n') : lines) + '\n';
  if (stream) stream(text);
  else sink.push(text);
};

// ---- 記録の読み込み（wait の見張りでは前回の再生を使い回す） ----
// 同じプロセスで続けて呼ぶ（テスト・wait の見張り）ときは、前回の再生の続きから再生する。指紋が同じでも中身は読み直して確かめる
let cache: { path: string; rec: PlayRecord; rep: Replayed; stamp: string } | null = null;
function load(path: string): { rec: PlayRecord; rep: Replayed } {
  const stamp = recordStamp(path);
  if (cache && cache.path === path && cache.stamp === stamp && stamp !== '') return cache;
  const rec = readRecord(path);
  const rep = extendReplay(cache && cache.path === path ? cache : null, rec);
  cache = { path, rec, rep, stamp };
  return cache;
}

// ---- 他の席の手番の要約 ----
function othersSince(rep: Replayed, seat: number, from: number): string[] {
  const steps = rep.steps.slice(from);
  if (steps.length === 0) return [];
  const lines = turnLines(rep.state, steps, seat, { others: true, max: 30 });
  return lines.length ? ['== 他の席の手番（前回の表示の後）', ...lines] : [];
}

type WaitResult = 'turn' | 'roundEnd' | 'finished' | 'timeout';

async function waitFor(path: string, seat: number, round: number | undefined, timeoutSec: number): Promise<{ kind: WaitResult; rec: PlayRecord; rep: Replayed }> {
  const start = Date.now();
  for (;;) {
    const { rec, rep } = load(path);
    const s = rep.state;
    if (s.finished) return { kind: 'finished', rec, rep };
    if (round !== undefined && s.round > round) return { kind: 'roundEnd', rec, rep };
    if (isWaitingFor(s, seat)) return { kind: 'turn', rec, rep };
    if (Date.now() - start >= timeoutSec * 1000) return { kind: 'timeout', rec, rep };
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function waitOutput(path: string, seat: number, round: number | undefined, res: { kind: WaitResult; rec: PlayRecord; rep: Replayed }): string[] {
  const { rec, rep } = res;
  const s = rep.state;
  const out = othersSince(rep, seat, readSeen(path, seat));
  writeSeen(path, seat, rec.moves.length);
  switch (res.kind) {
    case 'finished':
      out.push(...scoreLines(s), 'ゲーム終了。知見を書いて終えること。');
      break;
    case 'roundEnd':
      out.push(statusLine(s), `ラウンド ${round} は終わった（いまは第${s.round}ラウンド）。ノートを書いて終えること。`);
      break;
    case 'turn':
      out.push(...turnView(s, seat));
      break;
    case 'timeout':
      out.push(`まだ番ではない（選択待ち：${waitingSeats(s).map((x) => seatName(s, x)).join('・')}）。もう一度 wait を呼ぶ。`);
      break;
  }
  return out;
}

// ---- コマンド ----

function cmdNew(a: Args, path: string): void {
  const players = int(a, 'players');
  const seed = int(a, 'seed');
  if (players === undefined || players < 2 || players > 4) throw new PlayError('--players は 2〜4 で指定すること');
  if (seed === undefined) throw new PlayError('--seed <整数> を付けること');
  if (recordExists(path) && !a.flags.has('force')) throw new PlayError(`記録が既にある：${path}（上書きは --force）`);
  const names = str(a, 'names')?.split(',');
  const rec: PlayRecord = { format: FORMAT, seed, config: defaultConfig(players, names), moves: [] };
  writeRecord(path, rec);
  const { state } = replayRecord(rec);
  print([`記録を作った：${path}（${players}人、シード ${seed}、通常ルール）`, statusLine(state), `最初の選択待ち：${waitingSeats(state).map((x) => `P${x}`).join('・')}`]);
}

function cmdShow(a: Args, path: string): void {
  const { rep } = load(path);
  const s = rep.state;
  const seat = seatArg(a, s, false);
  const player = int(a, 'player');
  if (player !== undefined) {
    if (player < 0 || player >= s.players.length) throw new PlayError(`席の番号は 0〜${s.players.length - 1}`);
    print([...playerDetail(s, player), ...mapLines(s, player)]);
    return;
  }
  const only = listArg<ShowSection>(a, 'only', SHOW_SECTIONS);
  const secs = only ?? (seat === null ? (['status', 'players', 'areas', 'shared', 'options'] as ShowSection[]) : SHOW_SECTIONS);
  print(showLines(s, seat, secs));
}

async function cmdMove(a: Args, path: string): Promise<void> {
  const tokens = a.positional.slice(1);
  if (tokens.length === 0) throw new PlayError('選ぶ選択肢を1つ以上指定すること');
  const { rec, rep } = load(path);
  const s0 = rep.state;
  if (s0.finished) throw new PlayError('ゲームは終わっている');
  const seat = seatArg(a, s0, true)!;
  if (a.flags.has('dry-run')) return dryRun(s0, seat, tokens);
  const { state, applied } = applyTokens(s0, seat, tokens);
  // 読んだ後に他の席が書いていたら、やり直させる（同時に書けるのは同時に選ぶ場面だけ）
  const now = readRecord(path);
  if (now.moves.length !== rec.moves.length) throw new PlayError('記録が読んだ後に変わった。もう一度実行すること（記録は変えていない）');
  const next: PlayRecord = { ...rec, moves: [...rec.moves, ...applied.map((x) => x.id)] };
  writeRecord(path, next);
  if (cache) cache.stamp = ''; // 次の読み込みで読み直す（前回の再生の続きから）
  const out = ['== 適用した選択', ...applied.map((x) => `・${x.label}`)];
  const delta = ownEventText(state, seat, applied.flatMap((x) => x.events));
  if (delta) out.push(`増減：${delta}`);
  writeSeen(path, seat, next.moves.length);
  if (state.finished) out.push(...scoreLines(state), 'ゲーム終了。知見を書いて終えること。');
  else if (isWaitingFor(state, seat)) out.push(...turnView(state, seat));
  else if (a.flags.has('then-wait')) {
    print(out);
    const round = int(a, 'round');
    const res = await waitFor(path, seat, round, int(a, 'timeout') ?? WAIT_TIMEOUT);
    print(waitOutput(path, seat, round, res));
    return;
  } else out.push(`選択待ち：${waitingSeats(state).map((x) => seatName(state, x)).join('・')}`);
  print(out);
}

/** 記録を変えずに下見する。山札・乱数に触れる手（引く・探す・混ぜ直す）の手前で止め、その先を見せない */
function dryRun(s0: GameState, seat: number, tokens: string[]): void {
  let cur = s0;
  const out = ['== 下見（記録は変えていない）'];
  const events = [];
  for (let i = 0; i < tokens.length; i++) {
    let res;
    try {
      res = applyTokens(cur, seat, [tokens[i]]);
    } catch (e) {
      if (e instanceof PlayError) throw new PlayError(`${i + 1}個目の指定で止めた：${e.message}`, e.detail);
      throw e;
    }
    const next = res.state;
    const hidden = next.rng !== cur.rng || next.deck.length !== cur.deck.length || next.deck[0] !== cur.deck[0] || next.events.some((e) => e.t === 'card' && (e.reason === 'draw' || e.reason === 'search' || e.reason === 'draft'));
    if (hidden) {
      out.push(`・${res.applied[0].label} ← ここで山札か乱数に触れるため、この手から先は下見しない`);
      break;
    }
    out.push(`・${res.applied[0].label}`);
    events.push(...res.applied[0].events);
    cur = next;
    if (!isWaitingFor(cur, seat)) break;
  }
  const delta = ownEventText(cur, seat, events);
  if (delta) out.push(`増減：${delta}`);
  const before = finalScores(s0)[seat].total;
  const after = finalScores(cur)[seat].total;
  out.push(`いま終わったときの計算：${before} → ${after}（${after - before >= 0 ? '+' : ''}${after - before}）`);
  if (isWaitingFor(cur, seat)) out.push(`次の選択：${cur.pending!.prompt}`);
  else if (!cur.finished) out.push(`次の選択待ち：${waitingSeats(cur).map((x) => `P${x}`).join('・')}`);
  print(out);
}

async function cmdWait(a: Args, path: string): Promise<void> {
  const { rep } = load(path);
  const seat = seatArg(a, rep.state, true)!;
  const round = int(a, 'round');
  const res = await waitFor(path, seat, round, int(a, 'timeout') ?? WAIT_TIMEOUT);
  print(waitOutput(path, seat, round, res));
}

function cmdRef(a: Args, path: string): void {
  const { rep } = load(path);
  const s = rep.state;
  const seat = seatArg(a, s, false);
  const card = str(a, 'card');
  if (card) {
    print(refCards(s, card.split(',').map((x) => x.trim()).filter(Boolean)));
    return;
  }
  const only = listArg<RefSection>(a, 'only', REF_SECTIONS);
  print(refLines(s, seat, only ?? REF_DEFAULT));
}

function cmdResume(a: Args, path: string): void {
  const { rec, rep } = load(path);
  const s = rep.state;
  const seat = seatArg(a, s, true)!;
  const out = [statusLine(s), `あなたは ${seatName(s, seat)}。変わらない文言（ルールの要約・ID の型・個人ボード・トラック）は ref で引く。`];
  out.push(...playersBlock(s, seat), ...sharedBlock(s), ...playerDetail(s, seat), ...mapLines(s, seat), ...handLines(s, seat, true));
  const mine = rep.steps.filter((x) => x.player === seat);
  if (mine.length) out.push('== あなたのこれまでの手番', ...turnLines(s, mine, seat, { max: 12 }));
  const thisRound = rep.steps.filter((x) => x.round === s.round && x.player !== seat);
  if (thisRound.length) out.push('== このラウンドの他の席の手番', ...turnLines(s, thisRound, seat, { max: 20 }));
  if (!s.finished) out.push(...scoreLines(s));
  if (isWaitingFor(s, seat)) out.push(...optionLines(s, seat));
  else if (!s.finished) out.push(`選択待ち：${waitingSeats(s).map((x) => seatName(s, x)).join('・')}（wait で待つ）`);
  else out.push(...scoreLines(s));
  writeSeen(path, seat, rec.moves.length);
  print(out);
}

function cmdLog(a: Args, path: string): void {
  const { rep } = load(path);
  const seat = seatArg(a, rep.state, false);
  const from = int(a, 'from') ?? 0;
  print(rep.steps.slice(from).map((st) => `${String(st.index + 1).padStart(4)} R${st.round} P${st.player} ${stepText(st, seat)}`));
}

async function main(argv: string[]): Promise<void> {
  const a = parseArgs(argv);
  const cmd = a.positional[0];
  if (!cmd || a.flags.has('help') || cmd === 'help') {
    print(HELP);
    return;
  }
  const path = str(a, 'file') ?? DEFAULT_RECORD_PATH;
  switch (cmd) {
    case 'new':
      return cmdNew(a, path);
    case 'show':
      return cmdShow(a, path);
    case 'move':
      return cmdMove(a, path);
    case 'wait':
      return cmdWait(a, path);
    case 'ref':
      return cmdRef(a, path);
    case 'resume':
      return cmdResume(a, path);
    case 'score':
      print(scoreLines(load(path).rep.state));
      return;
    case 'log':
      return cmdLog(a, path);
    default:
      throw new PlayError(`知らないコマンド：${cmd}（--help で一覧）`);
  }
}

/** コマンドを1回実行し、出力と終了コードを返す。失敗は「失敗：」で始まる文（2行目にその段の選択肢など）と終了コード1 */
export async function runCommand(argv: string[], write?: (text: string) => void): Promise<{ out: string; code: number; error?: string }> {
  sink = [];
  stream = write ?? null;
  try {
    await main(argv);
    return { out: sink.join(''), code: 0 };
  } catch (e: unknown) {
    if (e instanceof PlayError) {
      print(`失敗：${e.message}${e.detail ? `\n${e.detail}` : ''}`);
      return { out: sink.join(''), code: 1, error: `失敗：${e.message}` };
    }
    print(`失敗（内部エラー）：${(e as Error).stack ?? e}`);
    return { out: sink.join(''), code: 1, error: `失敗（内部エラー）：${(e as Error).message}` };
  }
}
