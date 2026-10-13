// 対局画面の共通部品（横長・スマートフォンの各レイアウトで使う）：上の札・相手の帯・設定・ログ
import { useState } from 'react';
import type { GameState } from '../game/types';
import { downloadRecord } from './recordFile';
import { playerColor } from './theme';
import type { GameSession } from './useGame';
import { phaseLabel } from './components/Band';
import { Icons } from './icons/EffIcons';

export interface ViewSettings {
  animation: boolean;
  sound: boolean;
  log: boolean;
}

export interface LogLine {
  group: number; // その行を出した手の番号（手の列の長さ）。取り消しで手の列が縮んだら、それより後の行を消す
  text: string;
  player: number | null; // 出来事の主体の席（ラウンドの区切りなど主体のない行は null）
}

export interface LayoutProps {
  s: GameState; // 表示中の盤面（演出中は写し）
  live: GameState; // 真の盤面
  viewer: number;
  session: GameSession;
  pulse: boolean;
  log: LogLine[];
  settings: ViewSettings;
  setSettings: (v: ViewSettings) => void;
  onExit: () => void;
  flash: Set<string>;
  style: React.CSSProperties;
}

export function mapFlash(flash: Set<string>, seat: number): Set<string> {
  return new Set([...flash].filter((k) => k.startsWith(`${seat}|`)).map((k) => k.split('|')[1]));
}

export function TopBar({ s, viewer, onLog, onPeople, onSettings, onExit }: { s: GameState; viewer: number; onLog: () => void; onPeople: () => void; onSettings: () => void; onExit: () => void }) {
  return (
    <header className="topbar">
      <span>
        R{s.round} {phaseLabel(s)}
      </span>
      <span className="order">
        手番順{' '}
        {s.turnOrder.map((seat, i) => (
          <span key={seat} className={`chip ${s.pending?.player === seat ? 'now' : ''} ${s.players[seat].passed ? 'passed' : ''}`} style={{ marginLeft: i ? 4 : 0 }}>
            {s.players[seat].name}
          </span>
        ))}
      </span>
      <span>スタート：{s.players[s.startPlayer].name}</span>
      {s.round === 5 && <span className="chip">最終ラウンド：手札を使い切れます</span>}
      <span className="spacer" />
      <span className="mycolor" style={{ background: playerColor(viewer) }} title="あなたの色" />
      <button onClick={onPeople}>みんな</button>
      <button onClick={onLog}>ログ</button>
      <button onClick={onSettings}>設定</button>
      <button onClick={onExit}>ロビー</button>
    </header>
  );
}

export function Opponents({ s, viewer, viewing, setViewing }: { s: GameState; viewer: number; viewing: number; setViewing: (n: number) => void }) {
  return (
    <div className="opponents" role="list">
      {s.players.map((p) => (
        <button key={p.seat} role="listitem" className={`opp ${viewing === p.seat ? 'viewing' : ''}`} onClick={() => setViewing(p.seat)}>
          <span className="dot" style={{ background: playerColor(p.seat) }} />
          <b>{p.seat === viewer ? `${p.name}（あなた）` : p.name}</b>
          <Icons toks={[{ g: 'gold', n: p.res.gold }, { g: 'wheat', n: p.res.wheat }, { g: 'wood', n: p.res.wood }, { g: 'iron', n: p.res.iron }, { g: 'diamond', n: p.diamond }, { g: 'disc', n: p.discs }, { g: 'handCard', n: p.hand.length }]} size={15} />
          <Icons className="scores" toks={[{ g: 'vp', n: p.score.vp }, { g: 'cp', n: p.score.cp }, { g: 'ip', n: p.score.ip }]} size={15} />
          {p.passed && <span className="busy">パス済み</span>}
          {s.pending?.player === p.seat && p.seat !== viewer && <span className="busy">操作中</span>}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({ session, settings, setSettings, close }: { session: GameSession; settings: ViewSettings; setSettings: (v: ViewSettings) => void; close: () => void }) {
  const a = session.auto;
  const row = (label: string, v: boolean, set: (v: boolean) => void) => (
    <label className="setting">
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  );
  return (
    <div className="modal-back" onPointerDown={close}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="設定">
        <h2>設定</h2>
        <h3>自動化（既定は切）</h3>
        {row('候補が1つだけの選択を自動で選ぶ', a.single, (v) => session.setAuto({ ...a, single: v }))}
        {row('基礎資源の支払いの内訳を自動で決める', a.payBasic, (v) => session.setAuto({ ...a, payBasic: v }))}
        {row('できることがパスしかないとき自動でパスする', a.pass, (v) => session.setAuto({ ...a, pass: v }))}
        <h3>表示</h3>
        {row('演出', settings.animation, (v) => setSettings({ ...settings, animation: v }))}
        {row('音', settings.sound, (v) => setSettings({ ...settings, sound: v }))}
        {row('ログ', settings.log, (v) => setSettings({ ...settings, log: v }))}
        <h3>記録</h3>
        <button className="btn" onClick={() => downloadRecord(session.record)}>
          記録を書き出す（JSON）
        </button>
        <div className="modal-actions">
          <button className="btn primary" onClick={close}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

export function LogPanel({ s, log, close }: { s: GameState; log: LogLine[]; close: () => void }) {
  // 表示するプレイヤー（null はすべて）。主体のない行（ラウンドの区切りなど）は絞り込み中も出す
  const [who, setWho] = useState<number | null>(null);
  const shown = who === null ? log : log.filter((l) => l.player === who || l.player === null);
  return (
    <aside className="logpanel" aria-label="ログ">
      <div className="loghead">
        <b>ログ（新しい順）</b>
        <select value={who ?? ''} onChange={(e) => setWho(e.target.value === '' ? null : Number(e.target.value))} aria-label="表示するプレイヤー">
          <option value="">全員</option>
          {s.players.map((p) => (
            <option key={p.seat} value={p.seat}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={close}>
          閉じる
        </button>
      </div>
      {[...shown].reverse().map((l, i) => (
        <div key={i} className="logline" style={l.player !== null ? { borderLeftColor: playerColor(l.player) } : undefined}>
          {l.text}
        </div>
      ))}
    </aside>
  );
}

export function usePanels() {
  const [panel, setPanel] = useState<'log' | 'settings' | null>(null);
  return { panel, setPanel };
}
