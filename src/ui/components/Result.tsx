// リザルト：最終得点計算の見せ場（ui_design §8.3）
import { useEffect, useMemo, useState } from 'react';
import { finalScores } from '../../game/scoring';
import type { GameState } from '../../game/types';
import { cssMs, playerColor, prefersReducedMotion } from '../theme';

export function Result({ s, onReplay, onLobby, onExport }: { s: GameState; onReplay: (at: 'start' | 'end') => void; onLobby: () => void; onExport?: () => void }) {
  const rows = useMemo(() => finalScores(s), [s]);
  const items = rows[0].items.length;
  const [shown, setShown] = useState(prefersReducedMotion() ? items : 0);
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
      <div className="result-grid" style={{ gridTemplateColumns: `minmax(180px, 1.4fr) repeat(${rows.length}, minmax(90px, 1fr))` }}>
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
