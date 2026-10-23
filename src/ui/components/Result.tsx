// リザルト：最終得点計算の見せ場（ui_design §8.3）
import { useEffect, useMemo, useState } from 'react';
import { finalScores } from '../../game/scoring';
import type { GameState } from '../../game/types';
import { cssMs, playerColor, prefersReducedMotion } from '../theme';

/** 得点を1行ずつ出す演出を見せたゲーム（同じゲームのリザルトに戻ったときは演出せず、最初から全部出す） */
const SHOWN_KEY = 'sweetlands.resultShown.v1';
const shownGames = new Set<string>();
function alreadyShown(key: string): boolean {
  if (shownGames.has(key)) return true;
  try {
    return (JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]') as string[]).includes(key);
  } catch {
    return false;
  }
}
function markShown(key: string): void {
  shownGames.add(key);
  try {
    const list = (JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? '[]') as string[]).filter((k) => k !== key);
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...list, key].slice(-20)));
  } catch {
    /* 保存できない環境では、この画面を開いている間だけ覚える */
  }
}

/** animKey：ゲームを見分ける文字列。同じ animKey のリザルトは、演出を1回目だけにする */
export function Result({ s, onReplay, onLobby, onExport, animKey }: { s: GameState; onReplay: (at: 'start' | 'end') => void; onLobby: () => void; onExport?: () => void; animKey?: string }) {
  const rows = useMemo(() => finalScores(s), [s]);
  const items = rows[0].items.length;
  const [shown, setShown] = useState(() => (prefersReducedMotion() || (animKey !== undefined && alreadyShown(animKey)) ? items : 0));
  useEffect(() => {
    if (animKey !== undefined) markShown(animKey);
  }, [animKey]);
  useEffect(() => {
    if (shown >= items) return;
    const t = window.setTimeout(() => setShown((n) => n + 1), cssMs('--showcase', 1000) * 0.5);
    return () => window.clearTimeout(t);
  }, [shown, items]);
  const done = shown >= items;
  const total = (r: (typeof rows)[number]) => r.items.slice(0, shown).reduce((a, b) => a + b.vp, 0);
  return (
    <div className="result" onClick={() => setShown(items)}>
      <h1>最終得点</h1>
      <div className="result-grid" style={{ gridTemplateColumns: `minmax(180px, 1.4fr) repeat(${rows.length}, minmax(90px, 1fr))`, ['--n' as string]: rows.length }}>
        <span />
        {rows.map((r) => (
          <b key={r.seat} className="rname">
            <span className="dot" style={{ background: playerColor(r.seat) }} /> {r.name}
          </b>
        ))}
        {rows[0].items.slice(0, shown).map((it, i) => (
          <Row key={i} label={it.label} vals={rows.map((r) => r.items[i].vp)} />
        ))}
        <span className="total-label">合計</span>
        {rows.map((r) => (
          <b key={r.seat} className="total">
            {total(r)}
          </b>
        ))}
      </div>
      {done && (
        <div className="ranks">
          {[...rows]
            .sort((a, b) => a.rank - b.rank)
            .map((r) => (
              <div key={r.seat} className={`rank r${r.rank}`} style={{ borderColor: playerColor(r.seat) }}>
                <span>{r.rank}位</span>
                <b>{r.name}</b>
                <span>
                  {r.total}点（クッキーラビット駒 {r.rabbits}個）
                </span>
              </div>
            ))}
          <p className="hint">同点のときは、地図ボード上のクッキーラビット駒が多い人が上位です。</p>
        </div>
      )}
      <div className="modal-actions" style={{ justifyContent: 'center' }}>
        {!done && <button className="btn">飛ばす</button>}
        <button className="btn" onClick={() => onReplay('end')}>
          最終盤面を見る
        </button>
        <button className="btn" onClick={() => onReplay('start')}>
          リプレイを見る
        </button>
        {onExport && (
          <button className="btn" onClick={onExport}>
            記録を書き出す
          </button>
        )}
        <button className="btn primary" onClick={onLobby}>
          ロビーに戻る
        </button>
      </div>
    </div>
  );
}

function Row({ label, vals }: { label: string; vals: number[] }) {
  return (
    <>
      <span className="ilabel">{label}</span>
      {vals.map((v, i) => (
        <span key={i} className="ival">
          {v}
        </span>
      ))}
    </>
  );
}
