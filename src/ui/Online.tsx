// オンライン対戦の画面：ゲームを作る → 席に座る → 開始 → 対局（自分の席に固定した視点） → リザルト
import { useCallback, useEffect, useState } from 'react';
import type { GameRecord } from '../game/history';
import type { GameDoc, Room } from '../net/room';
import { useOnlineGame } from '../net/useOnlineGame';
import { NewGameForm, ReplayScreen, ResultScreen } from './App';
import { Game } from './Game';
import { playerColor } from './theme';

const NAME_KEY = 'sweetlands.online.name';
const NAME_MAX = 12;
const cleanName = (n: string) => n.trim().slice(0, NAME_MAX);

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function saveName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* 覚えられなくても動く */
  }
}
const withName = (d: GameDoc, seat: number, name: string): GameDoc['config'] => (name ? { ...d.config, names: d.config.names.map((x, j) => (j === seat ? name : x)) } : d.config);

export function OnlineScreen({ room, onBack }: { room: Room; onBack: () => void }) {
  const [doc, setDoc] = useState<GameDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [inGame, setInGame] = useState(true);
  // 観戦（席のない人が、進行中のゲームを見るだけ。書き込まない）
  const [watching, setWatching] = useState(false);
  const [result, setResult] = useState<GameRecord | null>(null);
  // リザルトから開いたリプレイ（最初から／最終盤面から）
  const [replayAt, setReplayAt] = useState<'start' | 'end' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [myName, setMyName] = useState(loadName);
  useEffect(() => room.subscribe(setDoc, setError), [room]);

  const uid = room.uid;
  const mySeat = doc && uid ? doc.seats.indexOf(uid) : -1;
  const seat = mySeat >= 0 ? mySeat : null;
  const isCreator = !!doc && !!uid && doc.creator === uid;
  const act = useCallback(
    async (f: () => Promise<unknown>) => {
      setError(null);
      try {
        await f();
      } catch (e) {
        setError(`共有データに書き込めませんでした（${(e as { code?: string }).code ?? 'error'}）。通信状態を確かめて、もう一度試してください。`);
      }
    },
    [],
  );

  // 席を取る（入力した名前があれば、その席の名前にする）
  const claim = (i: number) =>
    act(async () => {
      const name = cleanName(myName);
      if (name) saveName(name);
      const ok = await room.transact((d) => (d.status !== 'lobby' || d.seats[i] !== null || !uid || d.seats.includes(uid) ? null : { ...d, seats: d.seats.map((x, j) => (j === i ? uid : x)), config: withName(d, i, name), version: d.version + 1 }));
      if (!ok) setError('ほかの人が先にこの席に座りました。別の席を選んでください。');
    });
  // 自分の席の名前を変える（開始前だけ）
  const rename = (i: number, raw: string) =>
    act(async () => {
      const name = cleanName(raw);
      if (!name) return;
      saveName(name);
      setMyName(name);
      await room.transact((d) => (d.status !== 'lobby' || d.seats[i] !== uid ? null : { ...d, config: withName(d, i, name), version: d.version + 1 }));
    });
  const leave = () => act(() => room.transact((d) => (d.status !== 'lobby' ? null : { ...d, seats: d.seats.map((x) => (x === uid ? null : x)), version: d.version + 1 })));
  const start = () => act(() => room.transact((d) => (d.status !== 'lobby' || d.creator !== uid || d.seats.some((x) => x === null) ? null : { ...d, status: 'playing', version: d.version + 1 })));

  if (result && replayAt) return <ReplayScreen record={result} at={replayAt} onBack={() => setReplayAt(null)} />;
  if (result)
    return (
      <ResultScreen
        record={result}
        onReplay={setReplayAt}
        onLobby={() => {
          setResult(null);
          setInGame(false);
          setWatching(false);
        }}
      />
    );

  if (doc?.status === 'playing' && seat !== null && inGame)
    return (
      <>
        <OnlineGame key={`${doc.seed}`} room={room} doc={doc} seat={seat} onExit={() => setInGame(false)} onFinished={setResult} onError={setError} />
        {error && (
          <div className="online-error floating" role="alert">
            {error}
            <button className="btn" onClick={() => setError(null)}>
              閉じる
            </button>
          </div>
        )}
      </>
    );

  if (doc?.status === 'playing' && seat === null && watching)
    return (
      <>
        <SpectateGame key={`${doc.seed}`} room={room} doc={doc} onExit={() => setWatching(false)} onFinished={setResult} onError={setError} />
        {error && (
          <div className="online-error floating" role="alert">
            {error}
            <button className="btn" onClick={() => setError(null)}>
              閉じる
            </button>
          </div>
        )}
      </>
    );

  return (
    <main className="lobby">
      <h1>スイーツランド：オンライン対戦</h1>
      <p>
        <button className="btn" onClick={onBack}>
          ← トップに戻る
        </button>
      </p>
      {error && <p className="online-error">{error}</p>}
      {!uid && <p className="online-error">利用者を確認できなかったため、閲覧だけになります。ページを読み込み直してください。</p>}
      {doc === undefined && <p className="hint">読み込んでいます…</p>}

      {doc === null && uid && (
        <section className="lobby-card">
          <h2>オンラインのゲームを作る</h2>
          <p className="hint">作った人は1番目の席に座ります。ほかの人は、このページを開いて空いている席に座ります。</p>
          <NewGameForm
            label="ゲームを作る"
            onSubmit={(config) =>
              act(() =>
                room.write({
                  status: 'lobby',
                  config,
                  seed: Math.floor(Math.random() * 2 ** 31),
                  seats: Array.from({ length: config.players }, (_, i) => (i === 0 ? uid : null)),
                  creator: uid,
                  moves: [],
                  version: 1,
                }),
              )
            }
          />
        </section>
      )}

      {doc && (
        <section className="lobby-card">
          <h2>{doc.status === 'lobby' ? '席を選んでください' : 'ゲームは進行中です'}</h2>
          {doc.status === 'lobby' && seat === null && uid && (
            <label className="seat-name">
              あなたの名前
              <input value={myName} maxLength={NAME_MAX} placeholder="席の名前のままにするなら空欄" onChange={(e) => setMyName(e.target.value)} />
            </label>
          )}
          <ul className="seats">
            {doc.seats.map((s, i) => (
              <li key={i}>
                <span className="dot" style={{ background: playerColor(i) }} />
                {doc.status === 'lobby' && s === uid ? <SeatName key={doc.config.names[i]} current={doc.config.names[i] ?? ''} onSave={(n) => rename(i, n)} /> : <b>{doc.config.names[i]}</b>}
                <span className="seat-state">{s === null ? '空席' : s === uid ? 'あなた' : '参加済み'}</span>
                {doc.status === 'lobby' && s === null && seat === null && uid && (
                  <button className="btn primary" onClick={() => claim(i)}>
                    この席に座る
                  </button>
                )}
                {doc.status === 'lobby' && s === uid && !isCreator && (
                  <button className="btn" onClick={leave}>
                    席を立つ
                  </button>
                )}
              </li>
            ))}
          </ul>
          {doc.status === 'lobby' && isCreator && (
            <button className="btn primary" disabled={doc.seats.some((x) => x === null)} onClick={start}>
              {doc.seats.some((x) => x === null) ? '全員がそろうのを待っています' : 'ゲームを始める'}
            </button>
          )}
          {doc.status === 'lobby' && !isCreator && seat !== null && <p className="hint">ゲームを作った人が開始するのを待っています。</p>}
          {doc.status === 'playing' && seat !== null && (
            <button className="btn primary" onClick={() => setInGame(true)}>
              対局に戻る
            </button>
          )}
          {doc.status === 'playing' && seat === null && (
            <>
              <p className="hint">このゲームは席がすべて埋まって進行中です。観戦できます（手札など伏せた情報は見えず、操作もできません）。</p>
              <button className="btn primary" onClick={() => setWatching(true)}>
                観戦する
              </button>
            </>
          )}
          {isCreator && (
            <p>
              {!confirmClear ? (
                <button className="btn" onClick={() => setConfirmClear(true)}>
                  このゲームを終了して消す
                </button>
              ) : (
                <span className="confirm-row">
                  全員の進行が失われます。消しますか？
                  <button
                    className="btn primary"
                    onClick={() => {
                      setConfirmClear(false);
                      act(() => room.clear());
                    }}
                  >
                    消す
                  </button>
                  <button className="btn" onClick={() => setConfirmClear(false)}>
                    やめる
                  </button>
                </span>
              )}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

/** 自分の席の名前の欄。入力して「名前を変える」か Enter で共有データに書く */
function SeatName({ current, onSave }: { current: string; onSave: (n: string) => void }) {
  const [v, setV] = useState(current);
  const changed = cleanName(v) !== '' && cleanName(v) !== current;
  return (
    <span className="seat-edit">
      <input value={v} maxLength={NAME_MAX} aria-label="自分の席の名前" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && changed && onSave(v)} />
      <button className="btn" disabled={!changed} onClick={() => onSave(v)}>
        名前を変える
      </button>
    </span>
  );
}

function OnlineGame({ room, doc, seat, onExit, onFinished, onError }: { room: Room; doc: GameDoc; seat: number; onExit: () => void; onFinished: (r: GameRecord) => void; onError: (m: string) => void }) {
  const session = useOnlineGame(room, doc, seat, onError);
  const finished = useCallback(() => onFinished(session.record), [onFinished, session.record]);
  return <Game session={session} hotseat={false} fixedViewer={seat} onExit={onExit} onFinished={finished} />;
}

/** 観戦：席を持たずに共有ドキュメントの手の列を再生して見る。選択待ちになることはないため、書き込まない */
function SpectateGame({ room, doc, onExit, onFinished, onError }: { room: Room; doc: GameDoc; onExit: () => void; onFinished: (r: GameRecord) => void; onError: (m: string) => void }) {
  const session = useOnlineGame(room, doc, null, onError);
  const finished = useCallback(() => onFinished(session.record), [onFinished, session.record]);
  return <Game session={session} hotseat={false} spectator onExit={onExit} onFinished={finished} />;
}
