// スマートフォンのレイアウト（ui_design §22）
// 縦持ち（案A）：上に札・自分の資源・帯、中央に盤面1枚、下に手元のシートと盤面の切り替えタブ。
// 横持ち（案D）：左に共通サプライ、中央に地図（常に表示）、右に切り替えパネル、下に帯。
// どちらも盤面の部品（MapBoard・PersonalBoard など）は横長レイアウトと同じものを使い、合法性は計算しない（設計原則3）。
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cardCost } from '../game/engine';
import type { GameState, PlayerState } from '../game/types';
import { NARROW_WIDTH } from './constants';
import { destsOf } from './gestures';
import { useInteraction, useTarget } from './interaction';
import { playerColor } from './theme';
import { Band, phaseLabel } from './components/Band';
import { CardBack, SourceCard } from './components/Card';
import { CandidateWindow, SetupWindow } from './components/Dialogs';
import { MineSupply, SharedSupply } from './components/HandBar';
import { IndustryBoard } from './components/IndustryBoard';
import { MainBoard, SideBoard } from './components/MainBoard';
import { MapBoard } from './components/MapBoard';
import { PersonalBoard } from './components/PersonalBoard';
import { Glyph } from './icons/Glyph';
import { Icons } from './icons/EffIcons';
import { LogPanel, mapFlash, Opponents, SettingsPanel, usePanels, type LayoutProps } from './GameParts';
import type { ThinkClock } from './useGame';

export type LayoutMode = 'wide' | 'landscape' | 'portrait';

function modeNow(): LayoutMode {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w >= NARROW_WIDTH && h >= 600) return 'wide';
  return h > w ? 'portrait' : 'landscape';
}

/** 画面の大きさと向きから、使うレイアウトを決める。端末を回したら切り替わる */
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState(modeNow);
  useEffect(() => {
    const f = () => setMode(modeNow());
    window.addEventListener('resize', f);
    window.addEventListener('orientationchange', f);
    return () => {
      window.removeEventListener('resize', f);
      window.removeEventListener('orientationchange', f);
    };
  }, []);
  return mode;
}

// ---- 合法手の対象が、どの面（タブ）にあるか ----

type Pane = 'shared' | 'town' | 'char' | 'industry' | 'hand' | 'people';

const SHARED_KEYS = ['area:', 'pros:', 'free:', 'skillpile:', 'advskill:', 'milestone:', 'support:', 'marker:support'];
const INDUSTRY_KEYS = ['piece:lab', 'piece:rabbit', 'marker:carriage', 'marker:loco'];
const CHAR_KEYS = ['piece:', 'tableau', 'skills', 'char:', 'income:', 'row:', 'skill:'];
const HAND_KEYS = ['card:', 'hand', 'keep', 'discard', 'tile:', 'special:', 'road', 'disc:', 'diamond'];

function paneOf(k: string): Pane | null {
  if (SHARED_KEYS.some((p) => k.startsWith(p))) return 'shared';
  if (k.startsWith('hex:') || k.startsWith('edge:')) return 'town';
  if (INDUSTRY_KEYS.some((p) => k.startsWith(p))) return 'industry';
  if (CHAR_KEYS.some((p) => k.startsWith(p))) return 'char';
  if (HAND_KEYS.some((p) => k === p || k.startsWith(p))) return 'hand';
  return null;
}

/** いま光っている対象（持ち上げ中なら置き先、そうでなければ出発点と直接触る対象）がある面 */
function useWantedPanes(): { wants: Set<Pane>; keys: string[] } {
  const c = useInteraction();
  const keys = c.held ? [...destsOf(c.aff, c.held).keys()] : c.active ? [...c.aff.clicks.keys(), ...c.aff.drags.keys()] : [];
  const wants = new Set<Pane>();
  keys.forEach((k) => {
    const p = paneOf(k);
    if (p) wants.add(p);
  });
  if (c.copyKey) wants.add('shared');
  return { wants, keys };
}

/** 対象がいまの面にないとき、対象のある面へ自動で切り替える（ui_design §4.2 を引き継ぐ） */
function useAutoPane<T extends Pane>(pane: T, setPane: (p: T) => void, order: T[], wants: Set<Pane>, deps: unknown[]) {
  useEffect(() => {
    if (wants.has(pane) || wants.size === 0) return;
    const to = order.find((p) => wants.has(p));
    if (to) setPane(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---- 部品 ----

/** 中身を横幅に合わせて縮める（拡大はしない）。CSS の zoom を使うので、縮めても操作はそのままできる。
 *  design を渡すと、中身をその幅以上（空きがあれば空きいっぱい）で組み、足りないぶんだけ縮める。
 *  渡さないと、中身の本来の幅（max-content）を測って縮める */
function Fit({ children, min = 0.5, design, className = '' }: { children: ReactNode; min?: number; design?: number; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const [box, setBox] = useState<{ zoom: number; width?: number }>({ zoom: 1 });
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const avail = o.clientWidth;
      if (avail <= 0) return;
      if (design) {
        const z = Math.max(min, Math.min(1, avail / design));
        zoomRef.current = z;
        setBox((b) => (Math.abs(b.zoom - z) < 0.005 && b.width === Math.floor(avail / z) ? b : { zoom: z, width: Math.floor(avail / z) }));
        return;
      }
      const natural = i.getBoundingClientRect().width / zoomRef.current;
      if (natural <= 0) return;
      const z = Math.max(min, Math.min(1, avail / natural));
      if (Math.abs(z - zoomRef.current) > 0.01) {
        zoomRef.current = z;
        setBox({ zoom: z });
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    if (!design) ro.observe(i);
    return () => ro.disconnect();
  }, [min, design]);
  return (
    <div ref={outer} className={`fit ${className}`}>
      <div ref={inner} className={`fit-inner ${design ? 'designed' : ''}`} style={{ zoom: box.zoom, width: box.width }}>
        {children}
      </div>
    </div>
  );
}

/** 自分の資源と得点（縦持ちの2段目・横持ちの上の札） */
function MyStatus({ p }: { p: PlayerState }) {
  return (
    <div className="mstatus" aria-label="あなたの資源と得点">
      <Icons toks={[{ g: 'gold', n: p.res.gold }, { g: 'wheat', n: p.res.wheat }, { g: 'wood', n: p.res.wood }, { g: 'iron', n: p.res.iron }, { g: 'diamond', n: p.diamond }, { g: 'disc', n: p.discs }, { g: 'handCard', n: p.hand.length }]} size={15} />
      <Icons className="scores" toks={[{ g: 'vp', n: p.score.vp }, { g: 'cp', n: p.score.cp }, { g: 'ip', n: p.score.ip }]} size={14} />
    </div>
  );
}

/** ラウンド・手番順・メニュー */
function MobileTop({ s, viewer, onMenu, children }: { s: GameState; viewer: number; onMenu: () => void; children?: ReactNode }) {
  return (
    <header className="mtop">
      <span className="mround">
        R{s.round}
        <small>{phaseLabel(s)}</small>
      </span>
      <span className="morder" aria-label="手番順">
        {s.turnOrder.map((seat) => (
          <span key={seat} className={`chip ${s.pending?.player === seat ? 'now' : ''} ${s.players[seat].passed ? 'passed' : ''}`} style={{ ['--pc' as string]: playerColor(seat) }}>
            {s.players[seat].name}
            {seat === viewer && <span className="sr-only">（あなた）</span>}
          </span>
        ))}
      </span>
      {children}
      <span className="spacer" />
      <button className="mmenu-btn" onClick={onMenu} aria-label="メニュー（ログ・設定・ロビー）">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
    </header>
  );
}

/** メニュー：ログ・設定・全画面・ロビー */
function MobileMenu({ onLog, onSettings, onExit, close }: { onLog: () => void; onSettings: () => void; onExit: () => void; close: () => void }) {
  const canFull = typeof document.documentElement.requestFullscreen === 'function' && document.fullscreenEnabled;
  const item = (label: string, f: () => void) => (
    <button
      className="btn"
      onClick={() => {
        close();
        f();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="mmenu-back" onPointerDown={close}>
      <div className="mmenu" role="menu" onPointerDown={(e) => e.stopPropagation()}>
        {item('ログ', onLog)}
        {item('設定', onSettings)}
        {canFull &&
          item(document.fullscreenElement ? '全画面をやめる' : '全画面', () => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen().catch(() => undefined);
          })}
        {item('ロビーに戻る', onExit)}
      </div>
    </div>
  );
}

/** 手札（タップで持ち上げ、長押しで拡大）。持ち越し枠と、候補を手札へ動かす置き先を兼ねる */
function HandStrip({ s, me, viewer }: { s: GameState; me: PlayerState; viewer: number }) {
  const hand = useTarget('hand', { k: 'other' });
  const keep = useTarget('keep', { k: 'other' });
  const keeping = s.pending?.step === 'keep' && s.pending.player === viewer;
  return (
    <div className={`mhand hand ${hand.lit ? 'lit' : ''}`} {...hand.props} aria-label="手札">
      {keeping && (
        <div className={`keep-slot ${keep.lit ? 'lit' : ''}`} {...keep.props}>
          持ち越し枠
        </div>
      )}
      {viewer === me.seat
        ? me.hand.map((id) => <SourceCard key={id} src={`card:${id}`} id={id} cost={cardCost(s, me, id)} why={{ k: 'handCard', card: id }} />)
        : me.hand.map((_, i) => <CardBack key={i} />)}
      {me.hand.length === 0 && (
        <span className="empty">
          <Glyph g="handCard" size={18} /> 手札はありません
        </span>
      )}
    </div>
  );
}

/** 他人の場を見ているときの帯 */
function ViewingBanner({ p, back }: { p: PlayerState; back: () => void }) {
  return (
    <div className="viewing-banner">
      {p.name}さんの場を表示中
      <button className="btn" onClick={back}>
        自分に戻る
      </button>
    </div>
  );
}

function SharedPane({ s, flash }: { s: GameState; flash: Set<string> }) {
  return (
    <div className="mshared">
      <MainBoard s={s} flashKeys={flash} />
      <SideBoard s={s} flashKeys={flash} />
    </div>
  );
}

function PeoplePane({ s, clock, viewer, viewing, pick }: { s: GameState; clock: ThinkClock; viewer: number; viewing: number; pick: (n: number) => void }) {
  return (
    <div className="people">
      <p className="mhint">名前を押すと、その人の街・キャラボード・工業ボードを表示します。</p>
      <Opponents s={s} clock={clock} viewer={viewer} viewing={viewing} setViewing={pick} />
    </div>
  );
}

function useViewing(viewer: number, pendingPlayer: number | undefined) {
  const [viewing, setViewing] = useState(viewer);
  // 自分に選択が来たら自分の場に戻す（§4.1）
  useEffect(() => setViewing(viewer), [viewer, pendingPlayer]);
  return [viewing, setViewing] as const;
}

const TAB_ICON: Record<Exclude<Pane, 'hand'>, ReactNode> = {
  shared: <path d="M3 5.5a1.5 1.5 0 0 1 1.5-1.5h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5zM3 10h18M9 10v10" />,
  town: <path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" />,
  char: <path d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5" />,
  industry: <path d="M3 17h18M5 17V9l4 3V9l4 3V6h6v11" />,
  people: <path d="M11 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19.5 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM2.5 19c.8-3.2 3-4.8 5.5-4.8s4.7 1.6 5.5 4.8M11 15.2c1.4-.7 3.2-1 5.5-1 2.5 0 4.7 1.6 5.5 4.8" />,
};

// ---- 縦持ち（案A） ----

const PORTRAIT_TABS: [Exclude<Pane, 'hand'>, string][] = [
  ['shared', '共通'],
  ['town', '街'],
  ['char', 'キャラ'],
  ['industry', '工業'],
  ['people', 'みんな'],
];

export function PortraitLayout(props: LayoutProps) {
  const { s, live, viewer, session, pulse, flash, style } = props;
  const c = useInteraction();
  const { panel, setPanel } = usePanels();
  const [menu, setMenu] = useState(false);
  const [pane, setPane] = useState<Exclude<Pane, 'hand'>>('town');
  const [viewing, setViewing] = useViewing(viewer, live.pending?.player);
  const { wants, keys } = useWantedPanes();
  useAutoPane(pane, setPane, ['shared', 'town', 'char', 'industry'], wants, [live.pending, c.held, c.copyKey]);

  // 手元のシート：手札が主役の選択（捨てる・残す・候補を手札へ）と、持ち上げたものの置き先が手札の枠にあるときは自動で開く
  const [sheetManual, setSheetManual] = useState<boolean | null>(null);
  useEffect(() => setSheetManual(null), [live.pending, c.held]);
  const handOnly = !c.held && keys.length > 0 && keys.every((k) => paneOf(k) === 'hand') && keys.some((k) => k.startsWith('card:'));
  // 捨て札置き場は畳んだシートにも出ているので、開くのは手札の枠（候補を手札へ・持ち越し枠）が置き先のときだけ
  const heldToSheet = !!c.held && keys.some((k) => k === 'hand' || k === 'keep');
  const sheetOpen = sheetManual ?? (handOnly || heldToSheet);
  const handLit = keys.some((k) => k.startsWith('card:') || k === 'hand' || k === 'keep');

  const me = s.players[viewer];
  const p = s.players[viewing];
  const back = () => setViewing(viewer);
  return (
    <div className="game mobile portrait" style={style}>
      <MobileTop s={s} viewer={viewer} onMenu={() => setMenu(true)} />
      <MyStatus p={me} />
      <Band s={live} viewer={viewer} canUndo={session.canUndo} undo={session.undo} undoCount={session.undoCount} undoAll={session.undoAll} pulse={pulse} compact auto={session.auto} setAuto={session.setAuto} redo={session.redo} redoCount={session.redoCount} />
      <main className="mpane" aria-label={PORTRAIT_TABS.find(([t]) => t === pane)?.[1]}>
        {viewing !== viewer && (pane === 'town' || pane === 'char' || pane === 'industry') && <ViewingBanner p={p} back={back} />}
        {pane === 'shared' && (
          <Fit className="mfit-shared" min={0.6} design={360}>
            <SharedPane s={s} flash={flash} />
          </Fit>
        )}
        {pane === 'town' && (
          <div className="board mapboard mtown">
            <MapBoard p={p} color={playerColor(p.seat)} flashKeys={mapFlash(flash, p.seat)} />
          </div>
        )}
        {pane === 'char' && (
          <Fit min={0.55}>
            <div className="board">
              <PersonalBoard s={s} p={p} />
            </div>
          </Fit>
        )}
        {pane === 'industry' && (
          <Fit min={0.55}>
            <div className="board">
              <IndustryBoard s={s} p={p} />
            </div>
          </Fit>
        )}
        {pane === 'people' && (
          <PeoplePane
            s={s}
            clock={session.clock}
            viewer={viewer}
            viewing={viewing}
            pick={(n) => {
              setViewing(n);
              setPane('town');
            }}
          />
        )}
      </main>
      <section className={`msheet ${sheetOpen ? 'open' : ''}`} aria-label="手元">
        <button className={`msheet-head ${handLit && !sheetOpen ? 'wants' : ''}`} onClick={() => setSheetManual(!sheetOpen)} aria-expanded={sheetOpen}>
          <span className="grip" aria-hidden="true" />
          <span>手札 {me.hand.length}</span>
          <span className="caret">{sheetOpen ? '閉じる ▾' : '開く ▴'}</span>
        </button>
        <div className="msupply">
          <SharedSupply s={s} contextual hideIdleDisc foldSide="up" />
          <MineSupply me={me} />
        </div>
        {sheetOpen && <HandStrip s={s} me={me} viewer={viewer} />}
      </section>
      <nav className="mtabs" aria-label="盤面の切り替え">
        {PORTRAIT_TABS.map(([t, label]) => (
          <button key={t} className={`${pane === t ? 'on' : ''} ${wants.has(t) && pane !== t ? 'wants' : ''}`} onClick={() => setPane(t)} aria-current={pane === t ? 'page' : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              {TAB_ICON[t]}
            </svg>
            {label}
          </button>
        ))}
      </nav>
      <CandidateWindow s={live} viewer={viewer} />
      <SetupWindow s={live} viewer={viewer} />
      {menu && <MobileMenu onLog={() => setPanel('log')} onSettings={() => setPanel('settings')} onExit={props.onExit} close={() => setMenu(false)} />}
      {panel === 'log' && <LogPanel s={s} log={props.log} close={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel session={session} settings={props.settings} setSettings={props.setSettings} close={() => setPanel(null)} />}
    </div>
  );
}

// ---- 横持ち（案D） ----

type SidePane = 'shared' | 'char' | 'industry' | 'hand' | 'people';
const LANDSCAPE_TABS: [SidePane, string][] = [
  ['shared', '共通'],
  ['char', 'キャラ'],
  ['industry', '工業'],
  ['hand', '手札'],
  ['people', 'みんな'],
];

export function LandscapeLayout(props: LayoutProps) {
  const { s, live, viewer, session, pulse, flash, style } = props;
  const c = useInteraction();
  const { panel, setPanel } = usePanels();
  const [menu, setMenu] = useState(false);
  const [side, setSide] = useState<SidePane>('char');
  const [viewing, setViewing] = useViewing(viewer, live.pending?.player);
  const { wants, keys } = useWantedPanes();
  // 地図は常に見えているので、右のパネルは地図以外の対象を追う。手札は、カードが対象のときだけ追う
  const sideWants = new Set<Pane>([...wants].filter((p) => p !== 'town' && p !== 'hand'));
  if (keys.some((k) => k.startsWith('card:') || k === 'hand' || k === 'keep')) sideWants.add('hand');
  useAutoPane(side, setSide, ['shared', 'hand', 'char', 'industry'], sideWants, [live.pending, c.held, c.copyKey]);

  const me = s.players[viewer];
  const p = s.players[viewing];
  const label = `${phaseLabel(s)}`;
  return (
    <div className="game mobile landscape" style={style}>
      <MobileTop s={s} viewer={viewer} onMenu={() => setMenu(true)}>
        <MyStatus p={me} />
      </MobileTop>
      <aside className="mtray" aria-label="手元のディスク・ダイヤと共通サプライ">
        <SharedSupply s={s} contextual hideIdleDisc foldSide="down" />
        <MineSupply me={me} />
      </aside>
      <main className="mmap" aria-label={`${p.name}の街（${label}）`}>
        {viewing !== viewer && <ViewingBanner p={p} back={() => setViewing(viewer)} />}
        <div className="board mapboard">
          <MapBoard p={p} color={playerColor(p.seat)} flashKeys={mapFlash(flash, p.seat)} />
        </div>
      </main>
      <section className="mside" aria-label="切り替えパネル">
        <div className="mside-tabs" role="tablist">
          {LANDSCAPE_TABS.map(([t, name]) => (
            <button key={t} role="tab" aria-selected={side === t} className={`${side === t ? 'on' : ''} ${sideWants.has(t) && side !== t ? 'wants' : ''}`} onClick={() => setSide(t)}>
              {t === 'hand' ? `${name} ${me.hand.length}` : name}
            </button>
          ))}
        </div>
        <div className="mside-body">
          {side === 'shared' && (
            <Fit className="mfit-shared" min={0.6} design={360}>
              <SharedPane s={s} flash={flash} />
            </Fit>
          )}
          {side === 'char' && (
            <Fit min={0.5}>
              <div className="board">
                <PersonalBoard s={s} p={p} />
              </div>
            </Fit>
          )}
          {side === 'industry' && (
            <Fit min={0.5}>
              <div className="board">
                <IndustryBoard s={s} p={p} />
              </div>
            </Fit>
          )}
          {side === 'hand' && <HandStrip s={s} me={me} viewer={viewer} />}
          {side === 'people' && (
            <PeoplePane
              s={s}
              clock={session.clock}
              viewer={viewer}
              viewing={viewing}
              pick={(n) => {
                setViewing(n);
                setSide('char');
              }}
            />
          )}
        </div>
      </section>
      <Band s={live} viewer={viewer} canUndo={session.canUndo} undo={session.undo} undoCount={session.undoCount} undoAll={session.undoAll} pulse={pulse} compact auto={session.auto} setAuto={session.setAuto} redo={session.redo} redoCount={session.redoCount} />
      <CandidateWindow s={live} viewer={viewer} />
      <SetupWindow s={live} viewer={viewer} />
      {menu && <MobileMenu onLog={() => setPanel('log')} onSettings={() => setPanel('settings')} onExit={props.onExit} close={() => setMenu(false)} />}
      {panel === 'log' && <LogPanel s={s} log={props.log} close={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel session={session} settings={props.settings} setSettings={props.setSettings} close={() => setPanel(null)} />}
    </div>
  );
}
