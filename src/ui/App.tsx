// 画面の遷移（ui_design §3）：ロビー → 準備・対局 → リザルト → リプレイ
// ローカル版：1台で全員分を交代しながら操作する。オンライン版：各自の端末で自分の席を操作する（./Online.tsx）
import { useCallback, useEffect, useMemo, useState } from 'react';
import { replay, type GameRecord } from '../game/history';
import type { GameConfig } from '../game/types';
import { Game } from './Game';
import { downloadRecord } from './recordFile';
import { Result } from './components/Result';
import { useGame } from './useGame';
import { InteractionProvider } from './interaction';
import { buildAffordances } from './gestures';
import { MainBoard, SideBoard } from './components/MainBoard';
import { MapBoard } from './components/MapBoard';
import { PersonalBoard } from './components/PersonalBoard';
import { playerColor } from './theme';
import { GlyphDefs } from './icons/Glyph';
import { connectClaudeRoom, connectFakeRoom, type Room } from '../net/room';
import { connectSupabaseRoom, supabaseConfigured } from '../net/supabaseRoom';
import { OnlineScreen } from './Online';

const SAVE_KEY = 'sweetlands.local.v1';

type ScreenState = { k: 'online' } | { k: 'lobby' } | { k: 'game'; config: GameConfig; seed: number; moves: string[] } | { k: 'result'; record: GameRecord } | { k: 'replay'; record: GameRecord; at: 'start' | 'end' };

function loadSaved(): GameRecord | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as GameRecord) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<ScreenState>(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('auto')) {
      const n = Number(q.get('players') ?? 2);
      return { k: 'game', config: { players: n, names: ['いちご', 'みかん', 'ぶどう', 'ミント'].slice(0, n), variants: { turnOrder: q.get('v') === '1', draft: q.get('v') === '1', advSkills: q.get('v') === '1', freeChar: q.get('v') === '1', setupDraft: q.get('v') === '1', charBuff: q.get('v') === '1' }, orderChoice: true }, seed: Number(q.get('seed') ?? 1), moves: [] };
    }
    return { k: 'lobby' };
  });
  // オンライン対戦の接続（アーティファクトの共有データベース。?fakedb=1&uid=… は検査用の代わり）
  const [online, setOnline] = useState<Room | null | undefined>(undefined);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get('fakedb')) {
      setOnline(connectFakeRoom(q.get('uid') ?? 'u1'));
      return;
    }
    let alive = true;
    const sbCfg = supabaseConfigured();
    if (sbCfg) {
      // Supabase 版（GitHub Pages などに置いたページ）。失敗したら理由を出す
      connectSupabaseRoom(sbCfg)
        .then((r) => alive && setOnline(r))
        .catch((e) => {
          console.error(e);
          const err = e as { message?: string; code?: string; status?: number };
          onlineError = [err.status, err.code, err.message].filter((x) => x !== undefined && x !== '').join(' / ') || String(e);
          if (alive) setOnline(null);
        });
      return () => {
        alive = false;
      };
    }
    connectClaudeRoom()
      .then((r) => alive && setOnline(r))
      .catch(() => alive && setOnline(null));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <>
      <GlyphDefs />
      {screen.k === 'online' && online ? <OnlineScreen room={online} onBack={() => setScreen({ k: 'lobby' })} /> : <Screen screen={screen} setScreen={setScreen} online={online} />}
    </>
  );
}

function Screen({ screen, setScreen, online }: { screen: ScreenState; setScreen: (s: ScreenState) => void; online: Room | null | undefined }) {
  if (screen.k === 'lobby' || screen.k === 'online') return <Lobby start={(config, seed, moves = []) => setScreen({ k: 'game', config, seed, moves })} online={online} openOnline={() => setScreen({ k: 'online' })} />;
  if (screen.k === 'game')
    return <LocalGame key={screen.seed} config={screen.config} seed={screen.seed} moves={screen.moves} onExit={() => setScreen({ k: 'lobby' })} onFinished={(record) => setScreen({ k: 'result', record })} />;
  if (screen.k === 'result')
    return <ResultScreen record={screen.record} onReplay={(at) => setScreen({ k: 'replay', record: screen.record, at })} onLobby={() => setScreen({ k: 'lobby' })} />;
  return <ReplayScreen record={screen.record} at={screen.at} onBack={() => setScreen({ k: 'result', record: screen.record })} />;
}

function LocalGame({ config, seed, moves, onExit, onFinished }: { config: GameConfig; seed: number; moves: string[]; onExit: () => void; onFinished: (r: GameRecord) => void }) {
  const session = useGame(config, seed, moves);
  // 途中経過をこのブラウザに保存（再読み込みで続きから遊べるようにするための便宜。失敗しても遊べる）
  useEffect(() => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(session.record));
    } catch {
      /* 保存できない環境でも遊べる */
    }
  }, [session.record]);
  const finished = useCallback(() => onFinished(session.record), [onFinished, session.record]);
  return <Game session={session} hotseat onExit={onExit} onFinished={finished} />;
}

/** リザルト。onReplay の at は、リプレイを最初から見る（start）か、最終盤面から見る（end）か */
export function ResultScreen({ record, onReplay, onLobby }: { record: GameRecord; onReplay: (at: 'start' | 'end') => void; onLobby: () => void }) {
  const s = useMemo(() => replay(record), [record]);
  // 同じゲーム（設定・シード・手の数が同じ）のリザルトは、得点の演出を1回目だけにする
  const animKey = `${record.seed}:${record.moves.length}:${record.config.names.join(',')}`;
  return <Result s={s} onReplay={onReplay} onLobby={onLobby} onExport={() => downloadRecord(record)} animKey={animKey} />;
}

export function ReplayScreen({ record, at, onBack }: { record: GameRecord; at: 'start' | 'end'; onBack: () => void }) {
  const [n, setN] = useState(at === 'start' ? 0 : record.moves.length);
  const [seat, setSeat] = useState(0);
  const s = useMemo(() => replay(record, n), [record, n]);
  const empty = useMemo(() => buildAffordances({ ...s, pending: null }), [s]);
  const roundStarts = useMemo(() => {
    const out: number[] = [];
    let prevRound = 0;
    for (let i = 0; i <= record.moves.length; i += 25) {
      const r = replay(record, i).round;
      if (r !== prevRound) out.push(i), (prevRound = r);
    }
    return out;
  }, [record]);
  return (
    <InteractionProvider state={s} viewer={seat} aff={empty} active={false} perform={() => undefined}>
      <div className="replay" style={{ ['--me' as string]: playerColor(seat) }}>
        <div className="replay-bar">
          <button className="btn" onClick={onBack}>
            リザルトに戻る
          </button>
          <button className="btn" onClick={() => setN(Math.max(0, n - 1))}>
            1手戻す
          </button>
          <input type="range" min={0} max={record.moves.length} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="手数" />
          <button className="btn" onClick={() => setN(Math.min(record.moves.length, n + 1))}>
            1手送る
          </button>
          <span>
            {n}/{record.moves.length}手・R{s.round}
          </span>
          {roundStarts.map((i, k) => (
            <button key={i} className="btn" onClick={() => setN(i)}>
              R{k + 1}の頭
            </button>
          ))}
          <select value={seat} onChange={(e) => setSeat(Number(e.target.value))} aria-label="視点">
            {s.players.map((p) => (
              <option key={p.seat} value={p.seat}>
                {p.name}の視点
              </option>
            ))}
          </select>
        </div>
        <div className="replay-body">
          <div className="board">
            <MainBoard s={s} flashKeys={new Set()} />
          </div>
          <div className="board">
            <SideBoard s={s} flashKeys={new Set()} />
          </div>
          <div className="board">
            <PersonalBoard s={s} p={s.players[seat]} />
          </div>
          <div className="board mapboard">
            <MapBoard p={s.players[seat]} color={playerColor(seat)} flashKeys={new Set()} />
          </div>
        </div>
      </div>
    </InteractionProvider>
  );
}

/** オンライン対戦に接続できなかったときの理由（画面に出して原因を特定しやすくする） */
let onlineError = '';

function Lobby({ start, online, openOnline }: { start: (c: GameConfig, seed: number, moves?: string[]) => void; online: Room | null | undefined; openOnline: () => void }) {
  const saved = loadSaved();
  return (
    <main className="lobby">
      <h1>スイーツランド</h1>
      <section className="lobby-card">
        <h2>オンライン対戦</h2>
        {online === undefined && <p className="hint">共有データベースに接続しています…</p>}
        {online === null && <p className="hint">オンライン対戦に接続できませんでした。Supabase の設定（ページの設定欄）と、匿名ログインが有効になっているか、テーブルを作る SQL を実行したかを確かめてください。{onlineError && <><br />理由：{onlineError}</>}</p>}
        {online && (
          <>
            <p className="hint">それぞれが自分の端末でこのページのリンクを開き、自分の席に座って遊びます。アカウントは要りません。</p>
            <button className="btn primary" onClick={openOnline}>
              オンライン対戦へ
            </button>
          </>
        )}
      </section>
      {saved && (
        <section className="lobby-card">
          <h2>途中のゲーム（この端末）</h2>
          <p>
            {saved.config.names.join('・')}（{saved.moves.length}手まで）
          </p>
          <button className="btn primary" onClick={() => start(saved.config, saved.seed, saved.moves)}>
            続きから遊ぶ
          </button>
        </section>
      )}
      <section className="lobby-card">
        <h2>1台で遊ぶ（ローカル）</h2>
        <p className="hint">1台の画面で、全員が交代しながら遊びます。手番が来た人の手札が表示されます。人数を1人にすると、1人で遊べます（ソロモード専用のルールはなく、2人用の場で1人だけが進めます）。</p>
        <NewGameForm label="ゲーム開始" allowSolo onSubmit={(c) => start(c, Math.floor(Math.random() * 2 ** 31))} />
      </section>
    </main>
  );
}

/** 新しいゲームの設定（人数・名前・ヴァリアント）。ローカルとオンラインで共通。allowSolo のときだけ1人を選べる（ローカル） */
export function NewGameForm({ label, onSubmit, allowSolo = false }: { label: string; onSubmit: (c: GameConfig) => void; allowSolo?: boolean }) {
  const [players, setPlayers] = useState(3);
  const [names, setNames] = useState(['いちご', 'みかん', 'ぶどう', 'ミント']);
  const [variants, setVariants] = useState({ turnOrder: false, draft: false, advSkills: false, freeChar: false, setupDraft: false, charBuff: false });
  return (
    <>
        <label className="field">
          人数
          <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
            {(allowSolo ? [1, 2, 3, 4] : [2, 3, 4]).map((n) => (
              <option key={n} value={n}>
                {n}人
              </option>
            ))}
          </select>
        </label>
        <div className="names">
          {Array.from({ length: players }, (_, i) => (
            <label key={i} className="field">
              <span className="dot" style={{ background: playerColor(i) }} />
              <input value={names[i]} onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))} aria-label={`${i + 1}人目の名前`} />
            </label>
          ))}
        </div>
        <fieldset>
          <legend>ヴァリアントルール</legend>
          <label className="setting">
            <input type="checkbox" checked={variants.turnOrder} onChange={(e) => setVariants({ ...variants, turnOrder: e.target.checked })} /> 手番順の調整
          </label>
          <label className="setting">
            <input type="checkbox" checked={variants.draft} onChange={(e) => setVariants({ ...variants, draft: e.target.checked })} /> 手札のドラフト
          </label>
          <label className="setting">
            <input type="checkbox" checked={variants.advSkills} onChange={(e) => setVariants({ ...variants, advSkills: e.target.checked })} /> 上級スキルタイル
          </label>
          <label className="setting">
            <input type="checkbox" checked={variants.freeChar} onChange={(e) => setVariants({ ...variants, freeChar: e.target.checked })} /> キャラクターの自由選択（裏面のキャラクターも選べる）
          </label>
          <label className="setting">
            <input type="checkbox" checked={variants.setupDraft} onChange={(e) => setVariants({ ...variants, setupDraft: e.target.checked })} /> 準備のドラフト（キャラクター・地図ボード・ラウンド支援駒）
          </label>
          <label className="setting">
            <input type="checkbox" checked={variants.charBuff} onChange={(e) => setVariants({ ...variants, charBuff: e.target.checked })} /> キャラクターの上方修正（アリス・ロータス・エリ・ナタ・ビスキュイ・グレーテル・サクラ・ソルビー・リッカ・カルメン・コーラル・ジャスミン）
          </label>
        </fieldset>
        <button className="btn primary" onClick={() => onSubmit({ players, names: names.slice(0, players).map((n, i) => n.trim() || `プレイヤー${i + 1}`), variants, orderChoice: true })}>
          {label}
        </button>
    </>
  );
}
