// オンライン対戦の対局フック。正本は共有ドキュメントの手の列で、各画面はそれを再生して盤面を作る。
// 書き込むのは選択待ちの席の人だけ（ひと操作ごと。ui_design §2-11）。取り消しは手の列から最後の1手を消す。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyMove, createGame, viewFor } from '../game/engine';
import { isCheckpoint, type GameRecord } from '../game/history';
import type { GameState } from '../game/types';
import type { Move } from '../ui/gestures';
import { autoAnswer, type AutoSettings, type GameSession } from '../ui/useGame';
import type { GameDoc, Room } from './room';

interface Built {
  moves: string[];
  state: GameState;
  prev: GameState | null;
  cpIndex: number;
  lastWasUndo: boolean;
}

/** 手の列から盤面とチェックポイントを作る。前の結果の続きなら、増えた分だけ適用する */
function build(doc: GameDoc, before: Built | null): Built {
  const m = doc.moves;
  const isPrefix = !!before && before.moves.length <= m.length && before.moves.every((x, i) => x === m[i]);
  let s: GameState;
  let cpIndex: number;
  let from: number;
  if (before && isPrefix) {
    s = before.state;
    cpIndex = before.cpIndex;
    from = before.moves.length;
  } else {
    s = createGame(doc.config, doc.seed);
    cpIndex = 0;
    from = 0;
  }
  for (let i = from; i < m.length; i++) {
    const next = applyMove(s, m[i]);
    if (isCheckpoint(s, next)) cpIndex = i + 1;
    s = next;
  }
  const shorter = !!before && m.length < before.moves.length && m.every((x, i) => x === before.moves[i]);
  return { moves: [...m], state: s, prev: before && !shorter ? before.state : null, cpIndex, lastWasUndo: shorter };
}

export function useOnlineGame(room: Room, doc: GameDoc, seat: number | null, onWriteError: (msg: string) => void): GameSession {
  const [built, setBuilt] = useState<Built>(() => build(doc, null));
  const builtRef = useRef(built);
  builtRef.current = built;

  // 共有ドキュメントが変わったら盤面を作り直す（自分の書き込みが戻ってきたときは何もしない）
  useEffect(() => {
    const cur = builtRef.current;
    if (cur.moves.length === doc.moves.length && cur.moves.every((x, i) => x === doc.moves[i])) return;
    setBuilt(build(doc, cur));
  }, [doc]);

  // 書き込みは1つずつ順に送る（同じドキュメントへの同時書き込みを避ける）
  const queue = useRef<Promise<void>>(Promise.resolve());
  const docRef = useRef(doc);
  docRef.current = doc;
  const version = useRef(doc.version);
  useEffect(() => {
    version.current = Math.max(version.current, doc.version);
  }, [doc.version]);
  const push = useCallback(
    (moves: string[]) => {
      version.current += 1;
      const next: GameDoc = { ...docRef.current, moves, version: version.current };
      queue.current = queue.current.then(() => room.write(next)).catch((e) => onWriteError(`手を送れませんでした（${(e as { code?: string }).code ?? 'error'}）。通信を確かめて、もう一度操作してください。`));
    },
    [room, onWriteError],
  );

  const mine = useCallback((s: GameState) => seat !== null && !!s.pending && viewFor(s, seat).pending!.player === seat && !s.finished, [seat]);

  // 同時に選べる選択待ち（手札のドラフト）では、ほかの人の手と競合しうる。読んだ時点の手の列に自分の手がまだ合法なら、
  // その末尾へ足す（同じ巡のピックは順番に依らず同じ結果になる）。合法でなければ送らない（届いた手の列で盤面が作り直される）
  const pushConcurrent = useCallback(
    (ids: string[]) => {
      queue.current = queue.current
        .then(async () => {
          const ok = await room.transact((d) => {
            let s = build(d, null).state;
            for (const id of ids) {
              if (!s.pending || !s.pending.options.some((o) => o.id === id)) return null;
              s = applyMove(s, id);
            }
            version.current = Math.max(version.current, d.version) + 1;
            return { ...d, moves: [...d.moves, ...ids], version: version.current };
          });
          if (!ok) onWriteError('ほかの人の操作と重なり、手を送れませんでした。盤面を確かめて、もう一度操作してください。');
        })
        .catch((e) => onWriteError(`手を送れませんでした（${(e as { code?: string }).code ?? 'error'}）。通信を確かめて、もう一度操作してください。`));
    },
    [room, onWriteError],
  );

  // 自分の手を盤面に当てて（先に画面へ出す）、手の列を共有ドキュメントへ送る
  const applyLocal = useCallback(
    (ids: string[]) => {
      const cur = builtRef.current;
      if (!mine(cur.state)) return;
      const concurrent = !!cur.state.pending?.waiting;
      const next = build({ ...docRef.current, moves: [...cur.moves, ...ids] }, cur);
      builtRef.current = next;
      setBuilt(next);
      if (concurrent) pushConcurrent(ids);
      else push(next.moves);
    },
    [mine, push, pushConcurrent],
  );

  const prefill = useRef<{ step: string; id: string } | null>(null);
  const [auto, setAuto] = useState<AutoSettings>({ single: false, payBasic: false, pass: false });

  const perform = useCallback(
    (m: Move) => {
      if (m.ids.length === 0) return;
      prefill.current = m.prefill ?? null;
      applyLocal(m.ids);
    },
    [applyLocal],
  );

  const undo = useCallback(() => {
    prefill.current = null;
    const cur = builtRef.current;
    if (!mine(cur.state) || cur.moves.length <= cur.cpIndex) return;
    const next = build({ ...docRef.current, moves: cur.moves.slice(0, -1) }, cur);
    builtRef.current = next;
    setBuilt(next);
    push(next.moves);
  }, [mine, push]);

  // 先回りの回答と自動化：自分の選択待ちのときだけ
  useEffect(() => {
    const s = built.state;
    if (!mine(s)) return;
    const pf = prefill.current;
    if (pf) {
      prefill.current = null;
      if (s.pending!.step === pf.step && viewFor(s, seat!).pending!.options.some((o) => o.id === pf.id)) {
        applyLocal([pf.id]);
        return;
      }
    }
    if (built.lastWasUndo) return;
    const a = autoAnswer(viewFor(s, seat!), auto);
    if (a) applyLocal([a]);
  }, [built, auto, mine, applyLocal]);

  const record = useMemo<GameRecord>(() => ({ config: doc.config, seed: doc.seed, moves: built.moves }), [doc.config, doc.seed, built.moves]);
  const undoCount = built.moves.length - built.cpIndex;
  return {
    state: built.state,
    prev: built.prev,
    record,
    canUndo: undoCount > 0 && mine(built.state),
    undoCount,
    lastWasUndo: built.lastWasUndo,
    perform,
    undo,
    auto,
    setAuto,
  };
}
