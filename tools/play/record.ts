// 対話プレイ用のコマンドの記録の処理。記録は { format, seed, config, moves } の JSON 1つで、
// 局面は常に replay と同じ手順（createGame から applyMove を順に当てる）で作る。GameState は保存しない。
// ルールは再実装しない。選択肢は getOptions（同時に選ぶ場面は viewFor）、進行は applyMove だけを使う。

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyMove, createGame, getOptions, viewFor } from '../../src/game/engine';
import { edgeAt, EDGE_DIRS, edgeInfo, type EdgeDir } from '../../src/game/queries';
import type { GameConfig, GameEvent, GameState, Option } from '../../src/game/types';

export const FORMAT = 'sweetlands-play/1';
export const DEFAULT_RECORD_PATH = '.play/game.json';

export interface PlayRecord {
  format: string;
  seed: number;
  config: GameConfig;
  moves: string[];
}

/** 利用者に見せる失敗。detail は2行目以降（その段の選択肢など） */
export class PlayError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
  }
}

/** 通常ルール（オンライン版のロビーの既定と同じ：ヴァリアントなし、処理順を選ぶ版） */
export function defaultConfig(players: number, names?: string[]): GameConfig {
  const base = ['P0', 'P1', 'P2', 'P3'];
  return {
    players,
    names: Array.from({ length: players }, (_, i) => names?.[i] ?? base[i]),
    variants: { turnOrder: false, draft: false, advSkills: false, freeChar: false, setupDraft: false, charBuff: false, charPool: false },
    orderChoice: true,
  };
}

export function recordExists(path: string): boolean {
  return existsSync(path);
}

export function readRecord(path: string): PlayRecord {
  if (!existsSync(path)) throw new PlayError(`記録がない：${path}（new で作る）`);
  let rec: PlayRecord;
  try {
    rec = JSON.parse(readFileSync(path, 'utf8')) as PlayRecord;
  } catch {
    throw new PlayError(`記録を読めない：${path}`);
  }
  if (rec.format !== FORMAT || !Array.isArray(rec.moves)) throw new PlayError(`記録の形式が違う：${path}`);
  return rec;
}

/** 書きかけを他の席が読まないよう、一時ファイルに書いてから置き換える */
export function writeRecord(path: string, rec: PlayRecord): void {
  mkdirSync(dirname(path) || '.', { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(rec, null, 1) + '\n');
  renameSync(tmp, path);
}

/** 記録の変化を見張るための指紋（更新時刻と大きさ） */
export function recordStamp(path: string): string {
  try {
    const st = statSync(path);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return '';
  }
}

// ---- 再生 ----

/** 1手の記録：誰が・どの段で・何を選び・何が起きたか */
export interface StepInfo {
  index: number; // 0始まりの手数
  player: number;
  step: string;
  prompt: string;
  id: string;
  label: string;
  events: GameEvent[];
  round: number; // 選んだときのラウンド
  roundAfter: number;
}

export interface Replayed {
  state: GameState;
  steps: StepInfo[];
}

/** 記録を最初から再生する。途中で選べない手があれば記録が壊れている */
export function replayRecord(rec: PlayRecord, upTo = rec.moves.length): Replayed {
  let s = createGame(rec.config, rec.seed);
  const steps: StepInfo[] = [];
  for (let i = 0; i < upTo; i++) {
    const id = rec.moves[i];
    const pd = s.pending;
    if (!pd) throw new PlayError(`記録の ${i + 1} 手目で選択待ちがない（記録が壊れている）`);
    const opt = pd.options.find((o) => o.id === id);
    const player = pd.waiting && opt?.data?.player !== undefined ? Number(opt.data.player) : pd.player;
    let next: GameState;
    try {
      next = applyMove(s, id);
    } catch (e) {
      throw new PlayError(`記録の ${i + 1} 手目「${id}」を再生できない（データかエンジンが変わったため）：${(e as Error).message}`);
    }
    steps.push({ index: i, player, step: pd.step, prompt: pd.prompt, id, label: opt?.label ?? id, events: next.events, round: s.round, roundAfter: next.round });
    s = next;
  }
  return { state: s, steps };
}

// ---- 視点と選択肢 ----

/** seat の席が答える選択待ちか（同時に選ぶ場面は waiting に含まれるか） */
export function isWaitingFor(s: GameState, seat: number): boolean {
  const pd = s.pending;
  if (!pd || s.finished) return false;
  return pd.waiting ? pd.waiting.includes(seat) : pd.player === seat;
}

/** いま答える席（同時に選ぶ場面は全員） */
export function waitingSeats(s: GameState): number[] {
  const pd = s.pending;
  if (!pd || s.finished) return [];
  return pd.waiting ?? [pd.player];
}

/** 山札の中身が見える段（山札を探す・ドラフト）。並びから山札の順序が分からないよう、表示はラベル順にする */
const DECK_ORDER_STEPS = new Set(['search', 'draftPick']);

/** seat の席に見せる選択肢（表示の順。番号はこの順の1始まり）。seat の番でなければ空 */
export function seatOptions(s: GameState, seat: number): Option[] {
  if (!isWaitingFor(s, seat)) return [];
  const v = viewFor(s, seat);
  const opts = [...getOptions(v)];
  if (DECK_ORDER_STEPS.has(v.pending!.step)) opts.sort((a, b) => a.label.localeCompare(b.label, 'ja') || a.id.localeCompare(b.id));
  return opts;
}

// ---- 道駒の辺の呼び名 ----
// エンジンの辺の ID（edge:頂点座標|頂点座標）は読めないため、コマンドでは「edge:ヘクス:向き」で見せ、受け付ける。
// 記録にはエンジンの ID を入れる。

export function edgeAlias(s: GameState, seat: number, id: string): string {
  if (!id.startsWith('edge:')) return id;
  const info = edgeInfo(s.players[seat], id.slice(5));
  return info ? `edge:${info.hex}:${info.dir}` : id;
}

/** 表示する ID（道駒の辺は呼び名にする） */
export function shownId(s: GameState, seat: number, opt: Option): string {
  return edgeAlias(s, seat, opt.id);
}

/** 指定（選択肢 ID・番号・辺の呼び名）を選択肢 ID に直す。選べなければ PlayError（2行目にその段の選択肢） */
export function resolveMove(s: GameState, seat: number, token: string): Option {
  const opts = seatOptions(s, seat);
  if (opts.length === 0) throw new PlayError(`P${seat} の番ではない（選択待ち：${waitingSeats(s).map((x) => `P${x}`).join('・') || 'なし'}）`);
  let opt: Option | undefined;
  if (/^\d+$/.test(token)) {
    opt = opts[Number(token) - 1];
  } else {
    const m = /^edge:(-?\d+,-?\d+):([a-z]+)$/.exec(token);
    if (m && (EDGE_DIRS as readonly string[]).includes(m[2])) {
      const e = edgeAt(s.players[seat], m[1], m[2] as EdgeDir);
      opt = e ? opts.find((o) => o.id === `edge:${e}`) : undefined;
    } else {
      opt = opts.find((o) => o.id === token);
    }
  }
  if (!opt) throw new PlayError(`選べない指定：${token}（${s.pending!.prompt}）`, `この段の選択肢：${stageOptionsLine(s, seat, opts)}`);
  return opt;
}

/** 失敗の文に添える、その段の選択肢 ID の1行 */
export function stageOptionsLine(s: GameState, seat: number, opts: Option[]): string {
  // 少なければ ID とラベルを、多ければ ID だけを並べる
  if (opts.length <= 12) return opts.map((o) => `${shownId(s, seat, o)}＝${o.label}`).join('／');
  const ids = opts.map((o) => shownId(s, seat, o));
  return ids.length > 40 ? `${ids.slice(0, 40).join(' ')} …ほか${ids.length - 40}個` : ids.join(' ');
}

export type Applied = { id: string; label: string; events: GameEvent[]; auto?: boolean };

/** 順番を選ぶ段（同時に起きた効果・即時能力の解決順） */
const ORDER_STEPS = new Set(['orderBundles', 'orderEffects']);
/** 順番を選ぶ段で、表示の先頭から順に解決させる指定（コマンドだけの指定で、記録には選んだ ID が入る） */
export const ORDER_AUTO = 'order:auto';

/** 打ち手の判断の余地がない段を進める：その席の番の間、選択肢が1つだけの段と、order:auto を指定した後の順番を選ぶ段（先頭を選ぶ）。
 *  ルールの判断はしない（選ぶのは getOptions の選択肢だけ）。進めた手は記録に普通の手として入る */
export function autoAdvance(s: GameState, seat: number, orderAuto: boolean): { state: GameState; applied: Applied[] } {
  let cur = s;
  const applied: Applied[] = [];
  for (let guard = 0; guard < 500 && isWaitingFor(cur, seat); guard++) {
    const opts = seatOptions(cur, seat);
    let opt: Option | undefined;
    if (opts.length === 1) opt = opts[0];
    else if (orderAuto && ORDER_STEPS.has(cur.pending!.step)) opt = opts[0];
    if (!opt) break;
    cur = applyMove(cur, opt.id);
    applied.push({ id: opt.id, label: opt.label, events: cur.events, auto: true });
  }
  return { state: cur, applied };
}

/** 選択を順に当てる。1つでも選べなければ例外を投げ、呼び出し側は記録を変えない。
 *  各指定の後に autoAdvance で判断の余地がない段を進める（order:auto の後は順番を選ぶ段も先頭から進める） */
export function applyTokens(s: GameState, seat: number, tokens: string[]): { state: GameState; applied: Applied[] } {
  let cur = s;
  const applied: Applied[] = [];
  let orderAuto = false;
  const advance = () => {
    const r = autoAdvance(cur, seat, orderAuto);
    cur = r.state;
    applied.push(...r.applied);
  };
  tokens.forEach((tok, i) => {
    if (tok === ORDER_AUTO) {
      orderAuto = true;
      advance();
      return;
    }
    let opt: Option;
    try {
      opt = resolveMove(cur, seat, tok);
    } catch (e) {
      // 番の初めに1択の段が残っていれば、それを進めてから指定を当てる
      const before = applied.length;
      advance();
      if (applied.length > before) {
        try {
          opt = resolveMove(cur, seat, tok);
        } catch (e2) {
          if (e2 instanceof PlayError) throw new PlayError(`${i + 1}個目の指定で止めた（記録は変えていない）：${e2.message}`, e2.detail);
          throw e2;
        }
      } else {
        if (e instanceof PlayError) throw new PlayError(`${i + 1}個目の指定で止めた（記録は変えていない）：${e.message}`, e.detail);
        throw e;
      }
    }
    cur = applyMove(cur, opt!.id);
    applied.push({ id: opt!.id, label: opt!.label, events: cur.events });
    advance();
  });
  return { state: cur, applied };
}

// ---- 席ごとの「どこまで見せたか」 ----
// wait・move・resume が他の席の手番を要約するとき、前回どこまで見せたかを覚える（記録とは別のファイル）。

function seenPath(recordPath: string, seat: number): string {
  return join(dirname(recordPath), `seen-P${seat}.json`);
}
export function readSeen(recordPath: string, seat: number): number {
  try {
    return Number(JSON.parse(readFileSync(seenPath(recordPath, seat), 'utf8')).moves) || 0;
  } catch {
    return 0;
  }
}
export function writeSeen(recordPath: string, seat: number, moves: number): void {
  try {
    mkdirSync(dirname(recordPath) || '.', { recursive: true });
    writeFileSync(seenPath(recordPath, seat), JSON.stringify({ moves }) + '\n');
  } catch {
    // 見せた位置を覚えられなくても、次回に多めに出るだけである
  }
}

/** 前回の再生の続きから再生する（記録が前回の手の列を延ばしただけなら、増えた分だけ当てる） */
export function extendReplay(prev: { rec: PlayRecord; rep: Replayed } | null, rec: PlayRecord): Replayed {
  if (!prev || prev.rec.seed !== rec.seed || prev.rec.moves.length > rec.moves.length || prev.rec.moves.some((m, i) => rec.moves[i] !== m)) return replayRecord(rec);
  let s = prev.rep.state;
  const steps = [...prev.rep.steps];
  for (let i = prev.rec.moves.length; i < rec.moves.length; i++) {
    const id = rec.moves[i];
    const pd = s.pending;
    if (!pd) throw new PlayError(`記録の ${i + 1} 手目で選択待ちがない（記録が壊れている）`);
    const opt = pd.options.find((o) => o.id === id);
    const player = pd.waiting && opt?.data?.player !== undefined ? Number(opt.data.player) : pd.player;
    const next = applyMove(s, id);
    steps.push({ index: i, player, step: pd.step, prompt: pd.prompt, id, label: opt?.label ?? id, events: next.events, round: s.round, roundAfter: next.round });
    s = next;
  }
  return { state: s, steps };
}
