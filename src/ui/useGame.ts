// 対局の進行を持つフック：記録・チェックポイント・取り消し・先回りの回答・自動化（ui_design §2-11, §5, §11）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyMove, createGame, getOptions } from '../game/engine';
import { isCheckpoint, undoLast, type GameRecord } from '../game/history';
import type { GameConfig, GameState } from '../game/types';
import { buildAffordances, type Move } from './gestures';

export interface AutoSettings {
  single: boolean; // 候補が1つだけの選択を自動で選ぶ
  payBasic: boolean; // 基礎資源の支払いの内訳を自動で決める
  pass: boolean; // 合法手がパスしかないとき自動でパス
  /** 同時に起きた効果の処理順を自動で決める席（docs/decisions_13 §13.14）。席ごとに、試合中いつでも切り替えられる */
  orderAuto?: number[];
}

const ORDER_AUTO_KEY = 'sweetlands.orderAuto.v1';

/** 自動化の設定の初期値。処理順の自動の席だけは、この端末のブラウザに保存した値を使う */
export function initialAuto(): AutoSettings {
  let orderAuto: number[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(ORDER_AUTO_KEY) ?? '[]') as unknown;
    if (Array.isArray(v)) orderAuto = v.filter((x): x is number => typeof x === 'number');
  } catch {
    /* 読めない環境では既定値（どの席も自分で選ぶ）を使う */
  }
  return { single: false, payBasic: false, pass: false, orderAuto };
}

/** 自動化の設定を変える。処理順の自動の席は保存する（失敗しても遊べる） */
export function saveAuto(a: AutoSettings): void {
  try {
    localStorage.setItem(ORDER_AUTO_KEY, JSON.stringify(a.orderAuto ?? []));
  } catch {
    /* 保存できない環境でも遊べる */
  }
}

export interface GameSession {
  state: GameState;
  prev: GameState | null; // 直前の状態（演出の起点）
  record: GameRecord;
  canUndo: boolean;
  undoCount: number;
  lastWasUndo: boolean;
  perform: (m: Move) => void;
  undo: () => void;
  /** 取り消せる手をまとめて取り消す（手番の最初、またはその後のチェックポイントまで戻る） */
  undoAll: () => void;
  /** 取り消した手を1手ずつ進め直す（ローカルのみ。docs/decisions_13 §13.17）。オンラインでは未定義 */
  redo?: () => void;
  redoCount?: number;
  auto: AutoSettings;
  setAuto: (a: AutoSettings) => void;
}

export interface Inner {
  state: GameState;
  prev: GameState | null;
  moves: string[];
  cpState: GameState;
  cpIndex: number;
  lastWasUndo: boolean;
  /** 取り消した手（やり直しの順に、次に進め直す手が末尾） */
  redo: string[];
  /** 進め直した直後で、自動の回答を止めているか（続けて進め直せるように） */
  holdAuto?: boolean;
}

const IRREVERSIBLE_STEPS = new Set(['keep', 'turn']);

/** 自動化の入／切に従って、いまの選択待ちに機械的に答える合法手（なければ null）。ルールは変えない（§11） */
export function autoAnswer(s: GameState, auto: AutoSettings): string | null {
  const pd = s.pending;
  if (!pd || s.finished) return null;
  const opts = getOptions(s);
  if (auto.pass && pd.step === 'turn' && opts.length > 0 && opts.every((o) => o.id === 'pass' || o.id.startsWith('fa'))) {
    if (!opts.some((o) => o.id.startsWith('fa'))) return 'pass';
  }
  // 両替のフリーアクションの一括（払う数をプレイヤーが決める）は自動にしない
  if (auto.payBasic && pd.step === 'payBasic' && !pd.resume.ctx?.bulk) {
    const p = s.players[pd.player];
    // 多く持っている資源から払う：支払い後の最小値が最大になる内訳
    let best = opts[0];
    let bestScore = -Infinity;
    for (const o of opts) {
      const d = o.data as Record<'wheat' | 'wood' | 'iron', number>;
      const left = [p.res.wheat - d.wheat, p.res.wood - d.wood, p.res.iron - d.iron];
      const score = Math.min(...left) * 1000 + left.reduce((x, y) => x + y, 0);
      if (score > bestScore) (bestScore = score), (best = o);
    }
    return best.id;
  }
  // 処理順を自動で決める席：従来どおり、並んだ順（起きた順）に解決する
  if (pd.step === 'orderBundles' && auto.orderAuto?.includes(pd.player) && opts.length > 0) return opts[0].id;
  if (auto.single && opts.length === 1 && !IRREVERSIBLE_STEPS.has(pd.step)) return opts[0].id;
  return null;
}

/** 手を進める（純粋関数） */
export function applyInner(cur: Inner, ids: string[]): Inner {
  let s = cur.state;
  let { cpState, cpIndex } = cur;
  const moves = [...cur.moves];
  // 取り消した手と同じ手を進めたときは、やり直しの手を1つ使ったものとして残りを保つ。別の手なら残りは捨てる
  let redo = [...cur.redo];
  for (const id of ids) {
    if (redo.length && redo[redo.length - 1] === id) redo.pop();
    else redo = [];
    const next = applyMove(s, id);
    moves.push(id);
    if (isCheckpoint(s, next)) {
      cpState = next;
      cpIndex = moves.length;
    }
    s = next;
  }
  return { state: s, prev: cur.state, moves, cpState, cpIndex, lastWasUndo: false, redo };
}

/** 1手取り消す（純粋関数） */
export function undoInner(cur: Inner): Inner {
  if (cur.moves.length <= cur.cpIndex) return cur;
  const since = cur.moves.slice(cur.cpIndex);
  const { state } = undoLast(cur.cpState, since);
  return { ...cur, state, prev: null, moves: cur.moves.slice(0, -1), lastWasUndo: true, redo: [...cur.redo, cur.moves[cur.moves.length - 1]] };
}

/** 取り消せる手をまとめて取り消す（純粋関数） */
export function undoAllInner(cur: Inner): Inner {
  if (cur.moves.length <= cur.cpIndex) return cur;
  const undone = cur.moves.slice(cur.cpIndex).reverse(); // 最初に取り消した手（最も新しい手）が下、次に進め直す手が上
  return { ...cur, state: cur.cpState, prev: null, moves: cur.moves.slice(0, cur.cpIndex), lastWasUndo: true, redo: [...cur.redo, ...undone] };
}

/** 取り消した手を1手進め直す（純粋関数）。取り消した手は同じ局面から同じ結果になる（乱数・山札も同じ）ため、そのまま適用する */
export function redoInner(cur: Inner): Inner {
  if (!cur.redo.length) return cur;
  const id = cur.redo[cur.redo.length - 1];
  if (!getOptions(cur.state).some((o) => o.id === id)) return { ...cur, redo: [] };
  const next = applyMove(cur.state, id);
  const moves = [...cur.moves, id];
  const cp = isCheckpoint(cur.state, next);
  // 進め直した直後は自動の回答をしない（続けて進め直せるように）
  return { ...cur, state: next, prev: cur.state, moves, cpState: cp ? next : cur.cpState, cpIndex: cp ? moves.length : cur.cpIndex, lastWasUndo: false, holdAuto: cur.redo.length > 1, redo: cur.redo.slice(0, -1) };
}

export function useGame(config: GameConfig, seed: number, initialMoves: string[] = []): GameSession {
  const [inner, setInner] = useState<Inner>(() => {
    let s = createGame(config, seed);
    for (const m of initialMoves) s = applyMove(s, m);
    return { state: s, prev: null, moves: [...initialMoves], cpState: s, cpIndex: initialMoves.length, lastWasUndo: false, redo: [] };
  });
  const [auto, setAutoState] = useState<AutoSettings>(initialAuto);
  const setAuto = useCallback((a: AutoSettings) => {
    setAutoState(a);
    saveAuto(a);
  }, []);
  const prefill = useRef<{ step: string; id: string } | null>(null);

  const applyIds = useCallback((ids: string[]) => setInner((cur) => applyInner(cur, ids)), []);

  const perform = useCallback(
    (m: Move) => {
      if (m.ids.length === 0) return;
      prefill.current = m.prefill ?? null;
      applyIds(m.ids);
    },
    [applyIds],
  );

  const undo = useCallback(() => {
    prefill.current = null;
    setInner(undoInner);
  }, []);

  const undoAll = useCallback(() => {
    prefill.current = null;
    setInner(undoAllInner);
  }, []);

  const redo = useCallback(() => {
    prefill.current = null;
    setInner(redoInner);
  }, []);

  // 先回りの回答と自動化（合法手から機械的に選ぶだけ。ルールは変えない）
  useEffect(() => {
    const s = inner.state;
    const pd = s.pending;
    if (!pd || s.finished) return;
    const opts = getOptions(s);
    const pf = prefill.current;
    if (pf) {
      prefill.current = null;
      if (pd.step === pf.step && opts.some((o) => o.id === pf.id)) {
        applyIds([pf.id]);
        return;
      }
    }
    if (inner.lastWasUndo || inner.holdAuto) return;
    const a = autoAnswer(s, auto);
    if (a) applyIds([a]);
  }, [inner.state, inner.lastWasUndo, inner.holdAuto, auto, applyIds]);

  const record = useMemo<GameRecord>(() => ({ config, seed, moves: inner.moves }), [config, seed, inner.moves]);
  const undoCount = inner.moves.length - inner.cpIndex;
  return {
    state: inner.state,
    prev: inner.prev,
    record,
    canUndo: undoCount > 0 && !inner.state.finished,
    undoCount,
    lastWasUndo: inner.lastWasUndo,
    perform,
    undo,
    undoAll,
    redo,
    redoCount: inner.state.finished ? 0 : inner.redo.length,
    auto,
    setAuto,
  };
}

export { buildAffordances };
