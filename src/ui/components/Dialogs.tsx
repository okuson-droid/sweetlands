// 小窓：市民デッキから探す・ドラフトの候補（§5.5）、準備のキャラクター・地図ボードの選択（§3）
import { useState, type ReactNode } from 'react';
import { BUFF_NOTES, CHARACTERS, basicTextOf, isBuffed } from '../../game/characters';
import { CARDS } from '../../game/cards';
import type { GameState } from '../../game/types';
import { useInteraction, useTarget } from '../interaction';
import { SourceCard } from './Card';
import { PublicTiles, SupportBoard } from './MainBoard';
import { MapBoard } from './MapBoard';
import { PersonalBoard } from './PersonalBoard';
import { characterPreview, mapPreview } from '../../game/engine';
import { playerColor } from '../theme';

export function CandidateWindow({ s, viewer }: { s: GameState; viewer: number }) {
  const pd = s.pending;
  if (!pd || (pd.step !== 'search' && pd.step !== 'draftPick')) return null;
  const mine = pd.player === viewer;
  const draft = pd.step === 'draftPick';
  if (!mine && !draft) return null;
  // ドラフトで取ったカードはドラフトの終わりまで手札に入らないため、ここに出す（他人の分は出さない）
  const picked = draft ? s.draftPicked[viewer] ?? [] : [];
  return (
    <div className="window" role="dialog" aria-label="候補のカード">
      <h2>{!draft ? '市民デッキから手札に加えるカード' : mine ? 'ドラフト：手札に加えるカード' : 'ドラフト：ほかの人が選び終わるのを待っています'}</h2>
      {mine && <p className="hint">カードを手札へ動かすか、クリックしてください。{draft && '全員が同時に選び、全員が選び終えると残りの束を左隣へ渡します。'}</p>}
      {mine && (
        <div className="cards">
          {pd.options.map((o) => {
            const id = String(o.data!.card);
            return <SourceCard key={id} src={`${draft ? 'draft' : 'search'}:${id}`} id={id} why={{ k: 'other' }} />;
          })}
        </div>
      )}
      {draft && (
        <>
          <h3 className="picked-head">取ったカード（{picked.length}枚。ドラフトの終わりに手札に入る）</h3>
          <div className="cards picked">
            {picked.length === 0 ? <p className="hint">まだありません</p> : picked.map((id) => <SourceCard key={id} src={`picked:${id}`} id={id} why={{ k: 'other' }} />)}
          </div>
        </>
      )}
    </div>
  );
}

function CharChoice({ s, name, taken, onPreview }: { s: GameState; name: string; taken: boolean; onPreview: (name: string) => void }) {
  const t = useTarget(`setupChar:${name}`, { k: 'other' });
  const ch = CHARACTERS[name];
  return (
    <div className={`charcard ${t.lit ? 'lit' : ''} ${taken ? 'taken' : ''}`} {...t.props} tabIndex={0} aria-disabled={!t.lit}>
      <button
        className="btn charpeek"
        onClick={(e) => {
          e.stopPropagation();
          onPreview(name);
        }}
      >
        キャラボードを見る
      </button>
      <h3>{name}</h3>
      <div className="start">
        {isBuffed(s.config, name) && <span className="buff-mark lead">上方修正</span>}
        初期：G{ch.startRes.gold} 麦{ch.startRes.wheat} 木{ch.startRes.wood} 鉄{ch.startRes.iron} ダイヤ{ch.startDiamond}
      </div>
      <div className="txt">
        <b>基本能力</b>
        {basicTextOf(s.config, name)}
      </div>
      <div className="txt">
        <b>時計塔能力</b>
        {ch.clockText}
      </div>
      {isBuffed(s.config, name) && (
        <div className="txt buff">
          <b>上方修正</b>
          {BUFF_NOTES[name].join('／')}
        </div>
      )}
    </div>
  );
}

/** キャラクターを選ぶ前に、そのキャラボード（建物駒置き場・産業列・時計塔の条件など）を確認する */
function CharPreview({ s, seat, name, close }: { s: GameState; seat: number; name: string; close: () => void }) {
  const t = useTarget(`setupChar:${name}`, { k: 'other' });
  const p = characterPreview(s, seat, name);
  return (
    <div className="charpreview" role="dialog" aria-label={`${name}のキャラボード`}>
      <div className="charpreview-head">
        <b>{name}のキャラボード</b>
        <span className="spacer" />
        {t.lit && (
          <button className="btn primary" {...t.props}>
            このキャラクターを選ぶ
          </button>
        )}
        <button className="btn" onClick={close}>
          閉じる
        </button>
      </div>
      <div className="charpreview-body">
        <PersonalBoard s={s} p={p} withTableau={false} />
      </div>
    </div>
  );
}

function CharGrid({ s, seat, open }: { s: GameState; seat: number; open: Set<string> }) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <>
      <div className="chargrid">
        {Object.keys(CHARACTERS).map((n) => (
          <CharChoice key={n} s={s} name={n} taken={!open.has(n)} onPreview={setPreview} />
        ))}
      </div>
      {preview && <CharPreview s={s} seat={seat} name={preview} close={() => setPreview(null)} />}
    </>
  );
}

function MapChoice({ id, label }: { id: string; label: string }) {
  const t = useTarget(`setupMap:${id}`, { k: 'other' });
  return (
    <button className={`btn ${t.lit ? 'lit' : ''}`} {...t.props}>
      {label}
    </button>
  );
}

const NO_FLASH = new Set<string>();

/** 地図ボードの選択肢を面ごとにまとめ、各面の地図を見せながら選ぶ（A面は5枚とも同じ地図なので1つにまとめる） */
function MapGrid({ s, seat, options }: { s: GameState; seat: number; options: { id: string; label: string }[] }) {
  const maps = options.filter((o) => o.id.startsWith('map:'));
  const faces = [...new Set(maps.map((o) => (o.id.startsWith('map:A@') ? 'A' : o.id.slice(4))))].sort();
  return (
    <div className="mapgrid">
      {faces.map((face) => (
        <div key={face} className="mapface">
          <h3>{face === 'A' ? 'A面（5枚とも同じ）' : `${face}面`}</h3>
          <div className="mappreview">
            <MapBoard p={mapPreview(s, seat, face)} color={playerColor(seat)} flashKeys={NO_FLASH} />
          </div>
          <div className="mapface-actions">
            {maps
              .filter((o) => (face === 'A' ? o.id.startsWith('map:A@') : o.id === `map:${face}`))
              .map((o) => (
                <MapChoice key={o.id} id={o.id.slice(4)} label={o.label} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 準備の小窓の上部：この卓のタイル（マイルストーン・最終得点計算・上級スキル）を開いて確認できる */
function TableTiles({ s }: { s: GameState }) {
  return (
    <details className="tabletiles">
      <summary>この卓のマイルストーン・最終得点計算{s.advSkills.length > 0 && '・上級スキルタイル'}を見る</summary>
      <PublicTiles s={s} />
    </details>
  );
}

type PickKind = 'char' | 'map' | 'support';
const PICK_LABEL: Record<PickKind, string> = { char: 'キャラクター', map: '地図ボード', support: 'ラウンド支援駒' };

/** 準備のドラフトの順番（rules v1.1 §10.5）：N…1, 1…N, N…1 */
function draftOrder(s: GameState): number[] {
  const n = s.players.length;
  const one = Array.from({ length: n }, (_, i) => (s.startPlayer + i) % n);
  const rev = [...one].reverse();
  return [...rev, ...one, ...rev];
}

function pickedOf(s: GameState, seat: number): Partial<Record<PickKind, string>> {
  const p = s.players[seat];
  return {
    ...(p.character ? { char: p.character } : {}),
    ...(p.mapId ? { map: p.mapId === 'A' ? `A面（${p.mapBoard}）` : `${p.mapId}面` } : {}),
    ...(p.supportSpace !== null ? { support: `${s.supportCols.indexOf(p.supportSpace) + 1}列目` } : {}),
  };
}

/** 準備の小窓の枠。「閉じて盤面を見る」で小窓を畳み、盤面（メインボード・個人ボードなど）を見られるようにする。
 *  畳んでいる間は、画面の上に「開く」ボタンだけを出す。選ぶ人や段階が変わると、key が変わって開いた状態に戻る */
function SetupShell({ label, heading, className = '', children }: { label: string; heading: string; className?: string; children: ReactNode }) {
  const [folded, setFolded] = useState(false);
  if (folded)
    return (
      <button className="btn primary setup-reopen" onClick={() => setFolded(false)} aria-label={`${label}を開く`}>
        {label}を開く
      </button>
    );
  return (
    <div className="modal-back setup">
      <div className={`modal wide ${className}`} role="dialog" aria-label={label}>
        <div className="setup-head">
          <h2>{heading}</h2>
          <button className="btn setup-fold" onClick={() => setFolded(true)}>
            閉じて盤面を見る
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 準備のドラフト：まだ選んでいない種類をタブで切り替えて選ぶ */
function DraftWindow({ s, viewer }: { s: GameState; viewer: number }) {
  const pd = s.pending!;
  const mine = pd.player === viewer;
  const picked = pickedOf(s, pd.player);
  const open = (['char', 'map', 'support'] as PickKind[]).filter((k) => !picked[k]);
  const [tab, setTab] = useState<PickKind>(open[0]);
  const shown = open.includes(tab) ? tab : open[0];
  const order = draftOrder(s);
  const done = s.players.reduce((n, _, i) => n + Object.keys(pickedOf(s, i)).length, 0);
  const openChars = new Set(pd.options.filter((o) => o.id.startsWith('char:')).map((o) => o.id.slice(5)));
  return (
    <SetupShell className="draft" label="準備のドラフト" heading={mine ? '準備のドラフト：まだ選んでいないものから1つを選んでください' : `${s.players[pd.player].name}さんが選んでいます`}>
        <TableTiles s={s} />
        <ol className="draft-order" aria-label="ピックの順番">
          {order.map((seat, i) => (
            <li key={i} className={i < done ? 'done' : i === done ? 'now' : ''} style={{ ['--pc' as string]: playerColor(seat) }} title={s.players[seat].name}>
              {s.players[seat].name}
            </li>
          ))}
        </ol>
        <div className="draft-picks">
          {s.players.map((p, i) => {
            const pk = pickedOf(s, i);
            return (
              <div key={i} className={`draft-pl ${i === pd.player ? 'now' : ''}`}>
                <span className="dot" style={{ background: playerColor(i) }} />
                <b>{p.name}</b>
                {(['char', 'map', 'support'] as PickKind[]).map((k) => (
                  <span key={k} className={`chip ${pk[k] ? 'got' : ''}`}>
                    {PICK_LABEL[k]}：{pk[k] ?? '—'}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
        <div className="draft-tabs" role="tablist">
          {(['char', 'map', 'support'] as PickKind[]).map((k) => (
            <button key={k} role="tab" data-kind={k} aria-selected={shown === k} className={`btn ${shown === k ? 'on' : ''}`} disabled={!open.includes(k)} onClick={() => setTab(k)}>
              {PICK_LABEL[k]}
              {!open.includes(k) && '（選択済み）'}
            </button>
          ))}
        </div>
        <div className="draft-body">
          {shown === 'char' && <CharGrid s={s} seat={pd.player} open={openChars} />}
          {shown === 'map' && <MapGrid s={s} seat={pd.player} options={pd.options} />}
          {shown === 'support' && <SupportBoard s={s} />}
        </div>
    </SetupShell>
  );
}

export function SetupWindow({ s, viewer }: { s: GameState; viewer: number }) {
  const c = useInteraction();
  const pd = s.pending;
  if (pd?.step === 'setupPick') return <DraftWindow key={`${pd.player}:${pd.options.length}`} s={s} viewer={viewer} />;
  if (!pd || (pd.step !== 'setupChar' && pd.step !== 'setupMap')) return null;
  const mine = pd.player === viewer;
  if (pd.step === 'setupChar') {
    const open = new Set(pd.options.map((o) => o.id.slice(5)));
    return (
      <SetupShell key={`char:${pd.player}`} label="キャラクターの選択" heading={mine ? 'キャラクターを選んでください' : `${s.players[pd.player].name}さんがキャラクターを選んでいます`}>
        <TableTiles s={s} />
        <CharGrid s={s} seat={pd.player} open={open} />
      </SetupShell>
    );
  }
  return (
    <SetupShell key={`map:${pd.player}`} label="地図ボードの選択" heading={mine ? '地図ボードと面を選んでください' : `${s.players[pd.player].name}さんが地図ボードを選んでいます`}>
        <p>地図ボードは5枚で、表はどれも同じA面、裏はボードごとに違うB面です。A面を選ぶときも、どのボードを使うかを選びます（そのボードのB面はほかの人が選べなくなります）。最初のゲームでは、全員がA面を使うのがおすすめです。</p>
        <TableTiles s={s} />
        <MapGrid s={s} seat={pd.player} options={c.state.pending!.options} />
    </SetupShell>
  );
}

export function cardName(id: string): string {
  return CARDS[id].nameJa;
}
