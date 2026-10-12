// 対局画面（ui_design §4, §7, §10, §12）
import { useEffect, useMemo, useRef, useState } from 'react';
import { viewFor } from '../game/engine';
import type { GameState } from '../game/types';
import { NARROW_WIDTH, NOTICE_MS } from './constants';
import { buildAffordances } from './gestures';
import { InteractionProvider, useInteraction } from './interaction';
import { eventText, redact, usePlayback } from './playback';
import { chime, setSoundEnabled } from './sound';
import { playerColor } from './theme';
import type { GameSession } from './useGame';
import { Band, phaseLabel } from './components/Band';
import { CandidateWindow, SetupWindow } from './components/Dialogs';
import { HandBar, HandRow, MineSupply, SharedSupply } from './components/HandBar';
import { Fold } from './components/Fold';
import { Icons } from './icons/EffIcons';
import { IndustryBoard } from './components/IndustryBoard';
import { FreeActions, MainBoard, ProsBoard, SideBoard, SideStrip, SkillPiles, SupportBoard } from './components/MainBoard';
import { MapBoard } from './components/MapBoard';
import { PersonalBoard, TableauBar } from './components/PersonalBoard';

export interface ViewSettings {
  animation: boolean;
  sound: boolean;
  log: boolean;
}

interface LogLine {
  group: number;
  text: string;
  undone: boolean;
}

const UPPER_KEYS = ['area:', 'pros:', 'free:', 'skillpile:', 'milestone:', 'support:', 'advskill:', 'marker:support'];
const LOWER_KEYS = ['hex:', 'edge:', 'piece:', 'row:', 'tableau', 'marker:carriage', 'marker:loco', 'income:', 'skills', 'char:', 'skill:'];

function sideOf(keys: string[]): 'upper' | 'lower' | null {
  const up = keys.some((k) => UPPER_KEYS.some((p) => k.startsWith(p)));
  const lo = keys.some((k) => LOWER_KEYS.some((p) => k.startsWith(p)));
  if (up && !lo) return 'upper';
  if (lo && !up) return 'lower';
  return null;
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW_WIDTH || window.innerHeight < 600);
  useEffect(() => {
    const f = () => setNarrow(window.innerWidth < NARROW_WIDTH || window.innerHeight < 600);
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return narrow;
}

export function Game({ session, hotseat, fixedViewer, onExit, onFinished }: { session: GameSession; hotseat: boolean; fixedViewer?: number; onExit: () => void; onFinished: () => void }) {
  const raw = session.state;
  const [lastViewer, setLastViewer] = useState(0);
  const viewer = hotseat ? raw.pending?.player ?? lastViewer : fixedViewer ?? 0;
  // 同時に選べる選択待ち（手札のドラフト）は、見ている席の分だけに絞る
  const s = useMemo(() => viewFor(raw, viewer), [raw, viewer]);
  useEffect(() => {
    if (s.pending) setLastViewer(s.pending.player);
  }, [s.pending]);
  const [settings, setSettings] = useState<ViewSettings>(() => ({ animation: !new URLSearchParams(location.search).has('noanim'), sound: !new URLSearchParams(location.search).has('noanim'), log: true }));
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  const pb = usePlayback(s, session.prev, viewer, settings.animation, session.lastWasUndo);
  const display = pb.display;
  const active = !pb.playing && !!s.pending && s.pending.player === viewer && !s.finished;
  const aff = useMemo(() => (active ? buildAffordances(s) : buildAffordances({ ...s, pending: null })), [s, active]);

  // ログ（§10）
  const [log, setLog] = useState<LogLine[]>([]);
  useEffect(() => {
    if (session.lastWasUndo) {
      setLog((l) => {
        const g = Math.max(-1, ...l.filter((x) => !x.undone).map((x) => x.group));
        return l.map((x) => (x.group === g ? { ...x, undone: true } : x));
      });
      return;
    }
    const g = session.record.moves.length;
    const lines = s.events.map((e) => eventText(s, redact(e, viewer))).filter((x): x is string => !!x);
    if (lines.length) setLog((l) => [...l, ...lines.map((text) => ({ group: g, text, undone: false }))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // 選択権が来たときの通知（§7.2）
  const [notice, setNotice] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const lastPending = useRef<number | null>(null);
  useEffect(() => {
    const now = s.pending?.player ?? null;
    if (now !== null && now !== lastPending.current && now === viewer && !session.lastWasUndo) {
      const turn = s.pending!.step === 'turn';
      setNotice(hotseat ? `${s.players[now].name}さん、${turn ? 'あなたの手番です' : 'あなたが選ぶ番です'}` : turn ? 'あなたの手番です' : 'あなたが選ぶ番です');
      setPulse(true);
      if (settings.sound) chime(turn);
      const t1 = window.setTimeout(() => setNotice(null), NOTICE_MS);
      const t2 = window.setTimeout(() => setPulse(false), 1800);
      lastPending.current = now;
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    lastPending.current = now;
  }, [s.pending?.player, viewer, hotseat]);

  // ブラウザのタブが裏にあるとき（§7.2）
  useEffect(() => {
    const mine = s.pending?.player === viewer;
    document.title = mine && document.hidden ? '● あなたの手番 - スイーツランド' : 'スイーツランド';
    const f = () => (document.title = !document.hidden || !mine ? 'スイーツランド' : '● あなたの手番 - スイーツランド');
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [s.pending?.player, viewer]);

  // Ctrl+Z で取り消し
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && session.canUndo && s.pending?.player === viewer) {
        e.preventDefault();
        session.undo();
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [session, s.pending?.player, viewer]);

  useEffect(() => {
    if (s.finished && !pb.playing) onFinished();
  }, [s.finished, pb.playing, onFinished]);

  // 受け入れ検査用の観測点（読み取り専用。自動プレイヤーは盤面の所作だけで操作する）
  useEffect(() => {
    (window as unknown as { __sl: unknown }).__sl = {
      finished: s.finished,
      step: s.pending?.step ?? null,
      viewer,
      moves: session.record.moves.length,
      fallback: active ? aff.fallback.map((o) => `${s.pending!.step}:${o.id}`) : [],
      otherHands: s.players.filter((p) => p.seat !== viewer).flatMap((p) => p.hand),
      sources: active ? [...aff.clicks.keys(), ...aff.drags.keys()] : [],
      // 盤面の指紋（オンライン対戦の検査で、全員の画面が同じ盤面かを比べる。公開情報だけ）
      // 選択待ちの席は、席ごとに絞る前の局面で比べる（手札のドラフトでは同時に選べる席ごとに見え方が違う）
      waiting: raw.pending?.waiting ?? null,
      digest: JSON.stringify([s.round, s.phase, raw.pending?.player ?? null, s.players.map((p) => [p.score, p.res, p.income, p.hand.length, Object.values(p.hexes).filter((h) => h.tile).length])]),
    };
  });

  const narrow = useNarrow();
  const meStyle = { ['--me' as string]: playerColor(viewer) } as React.CSSProperties;
  return (
    <InteractionProvider state={s} viewer={viewer} aff={aff} active={active} perform={session.perform}>
      <div className="portrait-guard">横向きにしてください。スイーツランドは横長の画面で遊びます。</div>
      {narrow ? (
        <NarrowLayout s={display} live={s} viewer={viewer} session={session} pulse={pulse} log={log} settings={settings} setSettings={setSettings} onExit={onExit} flash={pb.flash} style={meStyle} />
      ) : (
        <WideLayout s={display} live={s} viewer={viewer} session={session} pulse={pulse} log={log} settings={settings} setSettings={setSettings} onExit={onExit} flash={pb.flash} style={meStyle} />
      )}
      {pb.playing && <div className="skip-layer" onPointerDown={pb.skip} aria-label="演出を飛ばす" />}
      {notice && (
        <div className="notice" style={meStyle}>
          {notice}
        </div>
      )}
      {pb.showcase && (
        <div className="showcase" style={meStyle}>
          {pb.showcase}
        </div>
      )}
    </InteractionProvider>
  );
}

interface LayoutProps {
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

function mapFlash(flash: Set<string>, seat: number): Set<string> {
  return new Set([...flash].filter((k) => k.startsWith(`${seat}|`)).map((k) => k.split('|')[1]));
}

function TopBar({ s, viewer, onLog, onPeople, onSettings, onExit }: { s: GameState; viewer: number; onLog: () => void; onPeople: () => void; onSettings: () => void; onExit: () => void }) {
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

function Opponents({ s, viewer, viewing, setViewing }: { s: GameState; viewer: number; viewing: number; setViewing: (n: number) => void }) {
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

function SettingsPanel({ session, settings, setSettings, close }: { session: GameSession; settings: ViewSettings; setSettings: (v: ViewSettings) => void; close: () => void }) {
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
        <div className="modal-actions">
          <button className="btn primary" onClick={close}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function LogPanel({ log, close }: { log: LogLine[]; close: () => void }) {
  return (
    <aside className="logpanel" aria-label="ログ">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <b>ログ（新しい順）</b>
        <button className="btn" onClick={close}>
          閉じる
        </button>
      </div>
      {[...log].reverse().map((l, i) => (
        <div key={i} className={l.undone ? 'undone' : ''}>
          {l.text}
        </div>
      ))}
    </aside>
  );
}

function usePanels() {
  const [panel, setPanel] = useState<'log' | 'settings' | null>(null);
  return { panel, setPanel };
}

type Tab = 'shared' | 'mine' | 'hand' | 'people';

function NarrowLayout(props: LayoutProps) {
  const { s, live, viewer, session, pulse, flash, style } = props;
  const c = useInteraction();
  const [tab, setTab] = useState<Tab>('mine');
  const { panel, setPanel } = usePanels();
  const [viewing, setViewing] = useState(viewer);
  useEffect(() => setViewing(viewer), [viewer, live.pending?.player]);
  const keys = c.held ? [...(c.aff.drags.get(c.held)?.keys() ?? [])] : [...c.aff.clicks.keys(), ...c.aff.drags.keys()];
  const want = (t: Tab) => {
    if (t === 'shared') return keys.some((k) => UPPER_KEYS.some((p) => k.startsWith(p))) || !!c.copyKey;
    if (t === 'mine') return keys.some((k) => LOWER_KEYS.some((p) => k.startsWith(p)));
    if (t === 'hand') return keys.some((k) => k.startsWith('card:') || k === 'discard' || k === 'hand' || k === 'keep' || k.startsWith('tile:') || k.startsWith('disc:') || k === 'road' || k === 'diamond' || k.startsWith('special:'));
    return false;
  };
  // 合法な対象がある側へ自動で切り替える
  useEffect(() => {
    const order: Tab[] = c.held ? ['shared', 'mine', 'hand'] : ['hand', 'shared', 'mine'];
    if (want(tab)) return;
    const t = order.find(want);
    if (t) setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.pending, c.held, c.copyKey]);
  const p = s.players[viewing];
  const tabs: [Tab, string][] = [
    ['shared', '共通の場'],
    ['mine', '自分の場'],
    ['hand', '手札'],
    ['people', 'みんな'],
  ];
  return (
    <div className="game narrow" style={style}>
      <TopBar s={s} viewer={viewer} onLog={() => setPanel(panel === 'log' ? null : 'log')} onPeople={() => setTab('people')} onSettings={() => setPanel('settings')} onExit={props.onExit} />
      <nav className="vtabs">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            className={`${tab === t ? 'on' : ''} ${want(t) && tab !== t ? 'wants' : ''}`}
            onClick={() => setTab(t)}
            onPointerEnter={() => c.held && setTab(t)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="narrow-pane">
        {tab === 'shared' && (
          <div className="narrow-stack">
            <div className="board">
              <MainBoard s={s} flashKeys={flash} />
            </div>
            <div className="board">
              <SideBoard s={s} flashKeys={flash} />
            </div>
          </div>
        )}
        {tab === 'mine' && (
          <div className="narrow-mine">
            <div className="board mapboard">
              <MapBoard p={p} color={playerColor(p.seat)} flashKeys={mapFlash(flash, p.seat)} />
            </div>
            <div className="board">
              <PersonalBoard s={s} p={p} />
            </div>
            <div className="board">
              <IndustryBoard s={s} p={p} />
            </div>
          </div>
        )}
        {tab === 'hand' && <HandBar s={s} me={s.players[viewer]} viewer={viewer} />}
        {tab === 'people' && (
          <div className="people">
            <Opponents
              s={s}
              viewer={viewer}
              viewing={viewing}
              setViewing={(n) => {
                setViewing(n);
                setTab('mine');
              }}
            />
            <LogPanel log={props.log} close={() => setTab('mine')} />
          </div>
        )}
      </div>
      <Band s={live} viewer={viewer} canUndo={session.canUndo} undo={session.undo} pulse={pulse} />
      <CandidateWindow s={live} viewer={viewer} />
      <SetupWindow s={live} viewer={viewer} />
      {panel === 'log' && <LogPanel log={props.log} close={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel session={session} settings={props.settings} setSettings={props.setSettings} close={() => setPanel(null)} />}
    </div>
  );
}

// ---- 横長（PC）レイアウト（ui_design §21） ----
// 左半分：共有ボード（メインボード・模倣ボードなどの帯・手札と共通サプライ）。右半分：個人ボード（工業ボード・マップ・キャラボード）。
// フリーアクション・スキルタイル・ラウンド支援ボード・特殊タイル・プレイしたカードはクリックで展開する。
// 繁栄トラックは左半分に、マップ・キャラボード・工業ボードは右半分に、それぞれその側の中だけを覆って拡大表示する。
type Enlarged = 'map' | 'char' | 'industry';
const ENLARGED_TITLE: Record<Enlarged, string> = { map: 'マップ', char: 'キャラボード（個人ボード）', industry: '工業発展ボード' };

/** 画面確認用（e2e のスクリーンショット）：URL の enlarge= で最初から拡大しておく */
function initialEnlarged(): Enlarged | null {
  const v = new URLSearchParams(location.search).get('enlarge');
  return v === 'map' || v === 'char' || v === 'industry' ? v : null;
}
function initialProsEnlarged(): boolean {
  return new URLSearchParams(location.search).get('enlarge') === 'pros';
}

function MagButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="mag" onClick={(e) => { e.stopPropagation(); onClick(); }} title="右半分に拡大して表示">
      ⤢ 拡大
    </button>
  );
}

function WideLayout(props: LayoutProps) {
  const { s, live, viewer, session, pulse, flash, style } = props;
  const c = useInteraction();
  const [viewing, setViewing] = useState(viewer);
  const [enlarged, setEnlarged] = useState<Enlarged | null>(initialEnlarged);
  const [prosEnlarged, setProsEnlarged] = useState(initialProsEnlarged);
  const { panel, setPanel } = usePanels();
  useEffect(() => setViewing(viewer), [viewer, live.pending?.player]);
  const sources = [...c.aff.clicks.keys(), ...c.aff.drags.keys()];
  const dests = c.held ? [...(c.aff.drags.get(c.held)?.keys() ?? [])] : [];
  const keys = [...sources, ...dests];
  const supportWanted = keys.some((k) => k.startsWith('support:') || k === 'marker:support');
  // プレイしたカードの展開：カードの置き先になったとき、またはプレイしたカードを動かす場面（オートメーション化）で自動で開く
  // プレイしたカードの一覧：オートメーション化（プレイしたカードを動かす場面）で自動で開く。カードをプレイするときは帯そのものが置き先になる
  // ただし一覧は個人ボードの産業列（オートメーション化の置き先）にかぶさるため、置き先の列をクリックで選べる場面では自動で開かない
  const tableauUsable = sources.some((k) => k.startsWith('tableau:'));
  const tableauWanted = tableauUsable && !sources.some((k) => k.startsWith('row:'));
  // フリーアクションは手番中ほぼ常に使えるので、自動で開くのはディスクの置き先になったときだけ
  const freeUsable = sources.some((k) => k.startsWith('free:'));
  const freeWanted = dests.some((k) => k.startsWith('free:'));
  // スキルタイルは、獲得を選ぶ場面（アクションエリアを選ぶ場面ではない）でだけ自動で開く
  const skillUsable = sources.some((k) => k.startsWith('skillpile:') || k.startsWith('advskill:'));
  const skillWanted = skillUsable && !sources.some((k) => k.startsWith('area:'));
  const p = s.players[viewing];
  const me = s.players[viewer];

  const chips = (
    <div className="wide-chips">
      <Fold name="support" label="ラウンド支援ボード" summary={`${s.supportCols.length}列`} force={supportWanted} side="down">
        <SupportBoard s={s} />
      </Fold>
      <Fold name="free" label="フリーアクション" hint={freeUsable} force={freeWanted} side="down" wide={420}>
        <h3>フリーアクション</h3>
        <FreeActions />
      </Fold>
      <Fold name="skills" label="スキルタイル" summary={s.advSkills.length > 0 ? '基本・上級' : undefined} hint={skillUsable} force={skillWanted} side="down" wide={560}>
        <h3>スキルタイル</h3>
        <SkillPiles s={s} withAdv />
      </Fold>
    </div>
  );

  return (
    <div className="game wide" style={style}>
      <TopBar s={s} viewer={viewer} onLog={() => setPanel(panel === 'log' ? null : 'log')} onPeople={() => setViewing(viewer)} onSettings={() => setPanel('settings')} onExit={props.onExit} />
      <Opponents s={s} viewer={viewer} viewing={viewing} setViewing={setViewing} />
      <Band s={live} viewer={viewer} canUndo={session.canUndo} undo={session.undo} pulse={pulse} onResize={() => undefined} />
      <div className="wide-body">
        <section className="wide-shared" aria-label="共有ボード">
          <div className="board wide-main">
            <MainBoard s={s} flashKeys={flash} freeSlot={chips} prosExtra={<MagButton onClick={() => setProsEnlarged(true)} />} />
          </div>
          <div className="board wide-side">
            <SideStrip s={s} flashKeys={flash} withAdv={false} />
          </div>
          <div className="wide-hand" aria-label="手札と共通サプライ">
            <div className="lefthand-side">
              <MineSupply me={me} />
              <SharedSupply s={s} contextual foldSide="up" />
            </div>
            <HandRow s={s} me={me} viewer={viewer} />
          </div>
          {prosEnlarged && (
            <div className="enlarged enlarged-pros" role="dialog" aria-label="繁栄トラックの拡大表示">
              <div className="enlarged-head">
                <b>繁栄トラック（拡大）</b>
                <span className="spacer" />
                <button className="btn" onClick={() => setProsEnlarged(false)}>
                  閉じる
                </button>
              </div>
              <div className="enlarged-body">
                <ProsBoard s={s} />
              </div>
            </div>
          )}
        </section>
        <section className="wide-personal" aria-label="個人ボード">
          {viewing !== viewer && (
            <div className="viewing-banner">
              {p.name}さんの場を表示中
              <button className="btn" onClick={() => setViewing(viewer)}>
                自分に戻る
              </button>
            </div>
          )}
          <div className="board mapboard wide-map">
            <MagButton onClick={() => setEnlarged('map')} />
            <MapBoard p={p} color={playerColor(p.seat)} flashKeys={mapFlash(flash, p.seat)} />
          </div>
          <div className="wide-pcol">
            <div className="board wide-pboard">
              <MagButton onClick={() => setEnlarged('char')} />
              <PersonalBoard s={s} p={p} withTableau={false} />
            </div>
            <TableauBar p={p} openForce={tableauWanted} hint={tableauUsable && !tableauWanted} />
          </div>
          <div className="board wide-industry">
            <MagButton onClick={() => setEnlarged('industry')} />
            <IndustryBoard s={s} p={p} />
          </div>
          {enlarged && (
            <div className={`enlarged enlarged-${enlarged}`} role="dialog" aria-label={`${ENLARGED_TITLE[enlarged]}の拡大表示`}>
              <div className="enlarged-head">
                <b>{ENLARGED_TITLE[enlarged]}（拡大）</b>
                <span className="spacer" />
                <button className="btn" onClick={() => setEnlarged(null)}>
                  閉じる
                </button>
              </div>
              <div className="enlarged-body">
                {enlarged === 'map' && <MapBoard p={p} color={playerColor(p.seat)} flashKeys={mapFlash(flash, p.seat)} />}
                {enlarged === 'char' && <PersonalBoard s={s} p={p} withTableau={false} />}
                {enlarged === 'industry' && <IndustryBoard s={s} p={p} />}
              </div>
            </div>
          )}
        </section>
      </div>
      <CandidateWindow s={live} viewer={viewer} />
      <SetupWindow s={live} viewer={viewer} />
      {panel === 'log' && props.settings.log && <LogPanel log={props.log} close={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel session={session} settings={props.settings} setSettings={props.setSettings} close={() => setPanel(null)} />}
    </div>
  );
}
