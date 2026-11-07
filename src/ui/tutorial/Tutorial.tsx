// 実践形式のチュートリアル（docs/decisions_13 §13.24）。本物の対局画面（Game）に、台本どおりの手しか選べないセッションを渡し、
// 画面の隅に説明の吹き出しを重ねる。台本が終わったら、同じ局面からふつうのローカル対局として続きを遊べる
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGame } from '../../game/engine';
import type { GameRecord } from '../../game/history';
import type { GameState } from '../../game/types';
import { Game } from '../Game';
import type { Move } from '../gestures';
import type { AutoSettings, GameSession, ThinkClock } from '../useGame';
import { guidedView, matchMoves } from './guide';
import { TUTORIAL_CONFIG, TUTORIAL_SEED, TUTORIAL_STEPS } from './script';

const NO_AUTO: AutoSettings = { single: false, payBasic: false, pass: false, orderAuto: [] };

interface TutorialInner {
  state: GameState;
  prev: GameState | null;
  moves: string[];
  step: number;
  missed: boolean;
}

function useTutorialSession(): { session: GameSession; step: number; missed: boolean; next: () => void } {
  const [inner, setInner] = useState<TutorialInner>(() => ({ state: createGame(TUTORIAL_CONFIG, TUTORIAL_SEED), prev: null, moves: [], step: 0, missed: false }));
  const current = TUTORIAL_STEPS[inner.step];
  const view = useMemo(() => guidedView(inner.state, current), [inner.state, current]);

  const perform = useCallback((m: Move) => {
    setInner((cur) => {
      const r = matchMoves(TUTORIAL_STEPS, cur.state, cur.step, m.ids);
      if (!r) return { ...cur, missed: true };
      return { state: r.state, prev: cur.state, moves: [...cur.moves, ...m.ids], step: r.step, missed: false };
    });
  }, []);
  // 説明だけの段を進める
  const next = useCallback(() => setInner((cur) => (TUTORIAL_STEPS[cur.step]?.move === undefined ? { ...cur, step: cur.step + 1, missed: false } : cur)), []);

  const record = useMemo<GameRecord>(() => ({ config: TUTORIAL_CONFIG, seed: TUTORIAL_SEED, moves: inner.moves }), [inner.moves]);
  const clock = useMemo<ThinkClock>(() => ({ totals: [0], since: Date.now(), thinking: [] }), []);
  const session: GameSession = {
    state: view,
    prev: inner.prev,
    record,
    canUndo: false,
    undoCount: 0,
    lastWasUndo: false,
    perform,
    undo: () => undefined,
    undoAll: () => undefined,
    auto: NO_AUTO,
    setAuto: () => undefined,
    clock,
  };
  return { session, step: inner.step, missed: inner.missed, next };
}

type Corner = 'br' | 'bl' | 'tr' | 'tl';
const CORNERS: Corner[] = ['br', 'bl', 'tr', 'tl'];
const EDGE = 16;
/** 上側に置くときの、帯の下までの高さ（帯を隠さない） */
const TOP_OFFSET = 120;

/** 吹き出しを、光っている要素（いま操作してほしい場所）に重ならない画面の隅へ置く。どこでも重なるときは右下 */
function useAvoidLit(dep: unknown): { ref: React.RefObject<HTMLElement>; corner: Corner } {
  const ref = useRef<HTMLElement>(null);
  const [corner, setCorner] = useState<Corner>('br');
  useEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const lit = [...document.querySelectorAll('.lit, .lit-svg, .held')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
      const rectOf = (c: Corner) => {
        const left = c === 'br' || c === 'tr' ? W - EDGE - w : EDGE;
        const top = c === 'br' || c === 'bl' ? H - EDGE - h : TOP_OFFSET;
        return { left, top, right: left + w, bottom: top + h };
      };
      const free = CORNERS.find((c) => {
        const b = rectOf(c);
        return !lit.some((r) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top);
      });
      setCorner(free ?? 'br');
    };
    place();
    // 持ち上げると置き先が光るため、しばらくのあいだ置き直す
    const id = window.setInterval(place, 400);
    return () => window.clearInterval(id);
  }, [dep]);
  return { ref, corner };
}

/** チュートリアルの画面。onContinue は台本の手の列から、ふつうのローカル対局として続きを遊ぶ */
export function TutorialScreen({ onExit, onContinue }: { onExit: () => void; onContinue: (record: GameRecord) => void }) {
  const { session, step, missed, next } = useTutorialSession();
  const s = TUTORIAL_STEPS[step];
  const last = step === TUTORIAL_STEPS.length - 1;
  const moveCount = TUTORIAL_STEPS.length;
  const { ref, corner } = useAvoidLit(step);
  return (
    <>
      <Game session={session} hotseat onExit={onExit} onFinished={() => undefined} />
      {s && (
        <aside ref={ref} className={`tutorial-bubble ${corner} ${s.move ? 'doing' : ''}`} role="dialog" aria-label="チュートリアル">
          <div className="tb-head">
            <span className="tb-count">
              {step + 1} / {moveCount}
            </span>
            <b>{s.title}</b>
          </div>
          <p>{s.text}</p>
          {missed && <p className="tb-miss">ここでは、光っている場所を操作してください。</p>}
          <div className="tb-actions">
            {!s.move && !last && (
              <button className="btn primary" onClick={next}>
                次へ
              </button>
            )}
            {last && (
              <button className="btn primary" onClick={() => onContinue(session.record)}>
                続きを自由に遊ぶ
              </button>
            )}
            <button className="btn" onClick={onExit}>
              {last ? 'ロビーに戻る' : 'チュートリアルをやめる'}
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
