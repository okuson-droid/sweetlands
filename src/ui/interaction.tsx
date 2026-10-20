// 所作の受け付け（ui_design §2-1〜§2-4, §6）。
// 入力は Pointer Events の1経路。(a) ドラッグ／タップで持ち上げ→置き先、(b) クリック、(c) ボタン。
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { explain, type ExplainTarget } from '../game/explain';
import type { GameState } from '../game/types';
import { CLICK_SWALLOW_MS, DRAG_START_PX, HOVER_ZOOM_MS, LONG_PRESS_MS, REASON_TOAST_MS, SNAP_PX } from './constants';
import { destsOf, type Affordances, type Move } from './gestures';

interface Toast {
  text: string;
  x: number;
  y: number;
  key: number;
}

interface Zoom {
  node: ReactNode;
  x: number;
  y: number;
}

interface Ctx {
  state: GameState;
  viewer: number;
  aff: Affordances;
  active: boolean; // 自分が選ぶ番で、演出中でない
  held: string | null;
  setHeld: (k: string | null) => void;
  copyKey: string | null;
  cancelCopy: () => void;
  /** コピー（特殊アクションL）：ディスクをエリアに置いたあと、コピー先を選ぶ段階に入る */
  startCopy: (key: string) => void;
  run: (m: Move) => void;
  reason: (t: ExplainTarget, x: number, y: number) => void;
  showZoom: (z: Zoom | null) => void;
  dragging: { src: string; label: string; x: number; y: number } | null;
  startPointer: (src: string, label: string, e: React.PointerEvent) => void;
  /** タップだけで操作する（スマートフォン）。ドラッグはせず、指を動かしたら画面のスクロールに任せる */
  tapOnly: boolean;
}

const InteractionCtx = createContext<Ctx | null>(null);

export function useInteraction(): Ctx {
  const c = useContext(InteractionCtx);
  if (!c) throw new Error('InteractionProvider の外です');
  return c;
}

export function InteractionProvider(props: {
  state: GameState;
  viewer: number;
  aff: Affordances;
  active: boolean;
  perform: (m: Move) => void;
  /** タップだけで操作する（スマートフォン、ui_design §22.4） */
  tapOnly?: boolean;
  children: ReactNode;
}) {
  const { state, viewer, aff, active, perform } = props;
  const tapOnly = !!props.tapOnly;
  const [held, setHeld] = useState<string | null>(null);
  const [copyKey, setCopyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [confirm, setConfirm] = useState<Move | null>(null);
  const [dragging, setDragging] = useState<Ctx['dragging']>(null);
  const toastTimer = useRef<number>();

  // 状態が変わったら持ち上げ・コピー待ちを解く
  useEffect(() => {
    setHeld(null);
    setCopyKey(null);
  }, [state]);

  const reason = useCallback(
    (t: ExplainTarget, x: number, y: number) => {
      window.clearTimeout(toastTimer.current);
      setToast({ text: explain(state, viewer, t), x, y, key: Date.now() });
      toastTimer.current = window.setTimeout(() => setToast(null), REASON_TOAST_MS);
    },
    [state, viewer],
  );

  const run = useCallback(
    (m: Move) => {
      setHeld(null);
      if (m.ids.length === 0) return;
      if (m.confirm) {
        setConfirm(m);
        return;
      }
      setCopyKey(null);
      perform(m);
    },
    [perform],
  );

  // ---- ドラッグ（Pointer Events） ----
  const drag = useRef<{ src: string; label: string; x0: number; y0: number; moved: boolean; id: number } | null>(null);
  const startPointer = useCallback(
    (src: string, label: string, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      drag.current = { src, label, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
    },
    [],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_START_PX) {
        // タップだけの操作では、指が動いたらタップではない（手札などのスクロール）。持ち上げずに見送る
        if (tapOnly) {
          drag.current = null;
          return;
        }
        d.moved = true;
        setHeld(d.src);
      }
      if (d.moved) setDragging({ src: d.src, label: d.label, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      setDragging(null);
      if (!d.moved) {
        // タップのあとに来るクリックは捨てる。持ち上げたり手を送ったりすると、スマートフォンでは表示中の面やシートが切り替わり、
        // 同じ位置へ遅れて届くクリックが別の要素（置き先のヘクスなど）に当たって、意図しない操作になるため（ui_design §22.5）
        swallowNextClick();
        // タップ：直接触る所作があればそれ、なければ持ち上げる／下ろす
        const direct = aff.clicks.get(d.src);
        if (direct) run(direct);
        else setHeld((h) => (h === d.src ? null : d.src));
        return;
      }
      const dest = findDest(e.clientX, e.clientY, d.src, aff);
      const m = dest ? destsOf(aff, d.src).get(dest) : undefined;
      if (m) {
        if (m.ids.length === 0) {
          setCopyKey(`${d.src}>${dest!.slice(5)}`);
          setHeld(null);
        } else run(m);
      } else {
        setHeld(null);
        if (dest) {
          const el = document.querySelector(`[data-dest="${CSS.escape(dest)}"]`);
          const t = el?.getAttribute('data-explain');
          if (t) reason(JSON.parse(t), e.clientX, e.clientY);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    // ブラウザがスクロールなどに指を引き取ったとき（pointercancel）は、タップとしても置いたとしても扱わない
    const cancel = (e: PointerEvent) => {
      if (drag.current?.id !== e.pointerId) return;
      drag.current = null;
      setDragging(null);
    };
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [aff, run, reason, tapOnly]);

  // Esc で持ち上げ・小窓を解く
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHeld(null);
        setCopyKey(null);
        setZoom(null);
        setConfirm(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ state, viewer, aff, active, held, setHeld, copyKey, cancelCopy: () => setCopyKey(null), startCopy: (k: string) => (setCopyKey(k), setHeld(null)), run, reason, showZoom: setZoom, dragging, startPointer, tapOnly }),
    [state, viewer, aff, active, held, copyKey, run, reason, dragging, startPointer, tapOnly],
  );

  return (
    <InteractionCtx.Provider value={value}>
      {props.children}
      {dragging && (
        <div className="drag-ghost" style={{ left: dragging.x, top: dragging.y }}>
          {dragging.label}
        </div>
      )}
      {toast && (
        <div key={toast.key} className="reason-toast" role="status" style={{ left: Math.min(toast.x, window.innerWidth - 300), top: Math.max(8, toast.y - 52) }}>
          {toast.text}
        </div>
      )}
      {zoom && (
        <div className="zoom" style={zoomPos(zoom)} onPointerDown={() => setZoom(null)}>
          {zoom.node}
        </div>
      )}
      {confirm && (
        <div className="modal-back confirm" onPointerDown={() => setConfirm(null)}>
          <div className="modal" role="dialog" aria-modal="true" onPointerDown={(e) => e.stopPropagation()}>
            <p>{confirm.confirm}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirm(null)}>
                やめる
              </button>
              <button
                className="btn primary"
                autoFocus
                onClick={() => {
                  const m = confirm;
                  setConfirm(null);
                  perform(m);
                }}
              >
                {confirm.confirmOk ?? confirm.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </InteractionCtx.Provider>
  );
}

function swallowNextClick(): void {
  const f = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', f, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', f, { capture: true }), CLICK_SWALLOW_MS);
}

function zoomPos(z: Zoom): React.CSSProperties {
  // 拡大表示の幅の上限（styles.css の .zoom：max-width 320px＋左右の padding 24px＋枠 4px）。
  // 実際の幅より小さく見積もると、画面の右寄りでは拡大表示がポインタの上に重なり、
  // ポインタが要素から外れた扱いになって表示と消去を繰り返す
  const w = 348;
  const left = z.x + 16 + w > window.innerWidth ? Math.max(8, z.x - w - 16) : z.x + 16;
  const top = Math.min(Math.max(8, z.y - 40), window.innerHeight - 260);
  return { left, top };
}

/** ポインタ位置の置き先。道駒の受け皿は近くにあれば吸い付く */
function findDest(x: number, y: number, src: string, aff: Affordances): string | null {
  // 重なった要素を上から順に見て、置ける置き先を探す（展開した一覧などが置き先の上にかぶさっていても落とせるように）
  const under = document.elementsFromPoint(x, y).map((e) => e.closest('[data-dest]')?.getAttribute('data-dest') ?? null);
  const legal = under.find((k) => k && destsOf(aff, src).has(k));
  if (legal) return legal;
  const direct = under[0] ?? null; // 置けない場所なら、いちばん上の要素を返す（呼び出し側が理由の説明に使う）
  if (src === 'road') {
    let best: string | null = null;
    let bd = SNAP_PX;
    document.querySelectorAll<SVGElement>('[data-dest^="edge:"]').forEach((n) => {
      const r = n.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      const k = n.getAttribute('data-dest')!;
      if (d < bd && destsOf(aff, src).has(k)) (bd = d), (best = k);
    });
    if (best) return best;
  }
  return direct;
}

// ---- 部品が使うフック ----

/** 持ち上げられる要素（出発点） */
export function useSource(key: string, label: string, why: ExplainTarget) {
  const c = useInteraction();
  const liftable = c.active && c.aff.drags.has(key);
  const clickMove = c.active ? c.aff.clicks.get(key) : undefined;
  const isHeld = c.held === key;
  const lit = liftable || !!clickMove;
  const zoomBind = useZoomBind();
  return {
    lit,
    held: isHeld,
    props: {
      'data-src': key,
      onPointerDown: (e: React.PointerEvent) => {
        zoomBind.cancel();
        if (liftable) {
          // タップだけの操作（スマートフォン）では既定の動作を止めない。指を動かしたら、手札や盤面の枠がスクロールする
          if (!c.tapOnly) e.preventDefault();
          c.startPointer(key, label, e);
        }
      },
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation(); // 置き先（手札の枠など）へ伝わって持ち上げが解けないように
        if (liftable) return; // ドラッグ／タップは pointer で処理済み
        if (clickMove) c.run(clickMove);
        else c.reason(why, e.clientX, e.clientY);
      },
    },
  };
}

/** 置き先・直接触る対象 */
export function useTarget(key: string, why: ExplainTarget) {
  const c = useInteraction();
  const dests = destsOf(c.aff, c.held);
  const dropMove = c.held ? dests.get(key) : undefined;
  const clickMove = !c.held && c.active ? c.aff.clicks.get(key) : undefined;
  // コピー（特殊アクションL）のコピー先
  const copyMove = c.copyKey && key.startsWith('area:') ? c.aff.copies.get(c.copyKey)?.get(key.slice(5)) : undefined;
  const lit = c.active && (!!dropMove || !!clickMove || !!copyMove);
  return {
    lit,
    props: {
      'data-dest': key,
      'data-explain': JSON.stringify(why),
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        if (copyMove) return c.run(copyMove);
        if (dropMove) {
          if (dropMove.ids.length === 0) {
            // コピーするエリアに置いた（クリックで置いたときも、ドラッグと同じくコピー先を選ぶ段階に入る）
            if (key.startsWith('area:')) c.startCopy(`${c.held}>${key.slice(5)}`);
            else c.setHeld(null);
            return;
          }
          return c.run(dropMove);
        }
        if (clickMove) return c.run(clickMove);
        if (c.held) c.setHeld(null);
        c.reason(why, e.clientX, e.clientY);
      },
    },
  };
}

/** マウスを重ねる（タッチは長押し）と拡大表示 */
export function useZoomBind(node?: () => ReactNode) {
  const c = useContext(InteractionCtx);
  const timer = useRef<number>();
  const cancel = () => window.clearTimeout(timer.current);
  if (!c || !node)
    return { cancel, props: {} as Record<string, unknown> };
  return {
    cancel,
    props: {
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.pointerType !== 'mouse' || c.dragging) return;
        const { clientX: x, clientY: y } = e;
        timer.current = window.setTimeout(() => c.showZoom({ node: node(), x, y }), HOVER_ZOOM_MS);
      },
      onPointerLeave: () => {
        cancel();
        c.showZoom(null);
      },
      onPointerDownCapture: (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        const { clientX: x, clientY: y } = e;
        timer.current = window.setTimeout(() => c.showZoom({ node: node(), x, y }), LONG_PRESS_MS);
      },
      onPointerUpCapture: cancel,
      onPointerCancelCapture: cancel,
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        c.showZoom({ node: node(), x: e.clientX, y: e.clientY });
      },
    },
  };
}
