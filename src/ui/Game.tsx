// 対局画面（ui_design §4, §7, §10, §12, §21, §22）
import { useEffect, useMemo, useRef, useState } from 'react';
import { viewFor } from '../game/engine';
import { NOTICE_MS } from './constants';
import { buildAffordances } from './gestures';
import { InteractionProvider, useInteraction } from './interaction';
import { eventText, redact, usePlayback } from './playback';
import { chime, setSoundEnabled } from './sound';
import { playerColor } from './theme';
import type { GameSession } from './useGame';
import { Band } from './components/Band';
import { CandidateWindow, SetupWindow } from './components/Dialogs';
import { HandRow, MineSupply, SharedSupply } from './components/HandBar';
import { Fold } from './components/Fold';
import { IndustryBoard } from './components/IndustryBoard';
import { FreeActions, MainBoard, ProsBoard, SideStrip, SkillPiles, SupportBoard } from './components/MainBoard';
import { MapBoard } from './components/MapBoard';
import { PersonalBoard, TableauBar } from './components/PersonalBoard';
import { LogPanel, mapFlash, Opponents, SettingsPanel, TopBar, usePanels, type LayoutProps, type LogLine, type ViewSettings } from './GameParts';
import { LandscapeLayout, PortraitLayout, useLayoutMode } from './MobileLayout';

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
    const g = session.record.moves.length;
    if (session.lastWasUndo) {
      // 取り消した手の行はログから消す（1手の取り消しでも、手番の最初に戻したときでも）
      setLog((l) => l.filter((x) => x.group <= g));
      return;
    }
    const lines = s.events
      .map((e) => ({ text: eventText(s, redact(e, viewer)), player: 'p' in e ? e.p : null }))
      .filter((x): x is { text: string; player: number | null } => !!x.text);
    if (lines.length) setLog((l) => [...l, ...lines.map((x) => ({ group: g, ...x }))]);
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

  const mode = useLayoutMode();
  const meStyle = { ['--me' as string]: playerColor(viewer) } as React.CSSProperties;
  return (
    <InteractionProvider state={s} viewer={viewer} aff={aff} active={active} perform={session.perform} tapOnly={mode !== 'wide'}>
      {mode === 'portrait' && <PortraitLayout s={display} live={s} viewer={viewer} session={session} pulse={pulse} log={log} settings={settings} setSettings={setSettings} onExit={onExit} flash={pb.flash} style={meStyle} />}
      {mode === 'landscape' && <LandscapeLayout s={display} live={s} viewer={viewer} session={session} pulse={pulse} log={log} settings={settings} setSettings={setSettings} onExit={onExit} flash={pb.flash} style={meStyle} />}
      {mode === 'wide' && <WideLayout s={display} live={s} viewer={viewer} session={session} pulse={pulse} log={log} settings={settings} setSettings={setSettings} onExit={onExit} flash={pb.flash} style={meStyle} />}
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
      <Band s={live} viewer={viewer} canUndo={session.canUndo} undo={session.undo} undoCount={session.undoCount} undoAll={session.undoAll} pulse={pulse} onResize={() => undefined} />
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
      {panel === 'log' && props.settings.log && <LogPanel s={s} log={props.log} close={() => setPanel(null)} />}
      {panel === 'settings' && <SettingsPanel session={session} settings={props.settings} setSettings={props.setSettings} close={() => setPanel(null)} />}
    </div>
  );
}
