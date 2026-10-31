// クリックで中身を展開する小さな見出し（ui_design §21）。
// 中身は body 直下に浮かせて表示する（盤面のスクロール枠や zoom に切られないように）。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** 画面確認用（e2e のスクリーンショット）：URL の open= に名前を並べると、その Fold を最初から開いておく */
function initiallyOpen(name: string): boolean {
  const open = new URLSearchParams(location.search).get('open') ?? '';
  return open.split(',').includes(name);
}

const GAP = 6;
const MARGIN = 8;

export function Fold({
  name,
  label,
  summary,
  children,
  side = 'down',
  align = 'left',
  wide,
  force,
  hint,
}: {
  name: string;
  label: React.ReactNode;
  summary?: React.ReactNode;
  children: React.ReactNode;
  side?: 'down' | 'up';
  align?: 'left' | 'right';
  wide?: number;
  /** 操作の対象になっているときは、閉じていても自動で開く */
  force?: boolean;
  /** 中に今使えるものがある（閉じていても印を出す） */
  hint?: boolean;
}) {
  const [manual, setOpen] = useState(() => initiallyOpen(name));
  const open = manual || !!force;
  const head = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  // 窓は見出しにかぶらない範囲（見出しの上側または下側の空き）に収め、はみ出す中身は窓の中でスクロールする。
  // 以前は中身が多いと窓が画面の端まで伸びて見出しを覆い、閉じられなくなっていた（2026-10-31）。中身の大きさが変わったら置き直す
  useLayoutEffect(() => {
    if (!open || !head.current || !pop.current) return;
    const place = () => {
      if (!head.current || !pop.current) return;
      const h = head.current.getBoundingClientRect();
      const p = pop.current.getBoundingClientRect();
      const maxHeight = Math.max(120, side === 'down' ? window.innerHeight - h.bottom - GAP - MARGIN : h.top - GAP - MARGIN);
      const height = Math.min(p.height, maxHeight);
      const left = Math.min(Math.max(MARGIN, align === 'left' ? h.left : h.right - p.width), window.innerWidth - p.width - MARGIN);
      const top = Math.min(Math.max(MARGIN, side === 'down' ? h.bottom + GAP : h.top - GAP - height), window.innerHeight - height - MARGIN);
      setPos((cur) => (cur && cur.left === left && cur.top === top && cur.maxHeight === maxHeight ? cur : { left, top, maxHeight }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(pop.current);
    return () => ro.disconnect();
  }, [open, side, align]);

  // Esc キーで閉じる（操作の対象になって自動で開いている間は閉じない）
  useEffect(() => {
    if (!manual) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [manual]);

  return (
    <div className={`fold ${open ? 'open' : ''} ${hint ? 'hint' : ''}`} data-fold={name}>
      <button ref={head} className="fold-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {hint && <span className="fold-dot" aria-label="使えるものがあります" />}
        <span className="fold-label">{label}</span>
        {summary && <span className="fold-sum">{summary}</span>}
        <span className="fold-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open &&
        createPortal(
          <div ref={pop} className="fold-pop" style={{ width: wide, left: pos?.left ?? -9999, top: pos?.top ?? -9999, maxHeight: pos?.maxHeight, overflowY: 'auto' }}>
            {children}
          </div>,
          document.querySelector('.game') ?? document.body,
        )}
    </div>
  );
}
