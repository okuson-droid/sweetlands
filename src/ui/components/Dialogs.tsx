// 小窓：市民デッキから探す・ドラフトの候補（§5.5）、準備のキャラクター・地図ボードの選択（§3）
import { useState } from 'react';
import { CHARACTERS } from '../../game/characters';
import { CARDS } from '../../game/cards';
import type { GameState } from '../../game/types';
import { useInteraction, useTarget } from '../interaction';
import { SourceCard } from './Card';
import { SupportBoard } from './MainBoard';
import { PersonalBoard } from './PersonalBoard';
import { characterPreview } from '../../game/engine';
import { playerColor } from '../theme';

export function CandidateWindow({ s, viewer }: { s: GameState; viewer: number }) {
  const pd = s.pending;
  if (!pd || pd.player !== viewer || (pd.step !== 'search' && pd.step !== 'draftPick')) return null;
  const from = pd.step === 'search' ? 'search' : 'draft';
  return (
    <div className="window" role="dialog" aria-label="候補のカード">
      <h2>{pd.step === 'search' ? '市民デッキから手札に加えるカード' : 'ドラフト：手札に加えるカード'}</h2>
      <p className="hint">カードを手札へ動かすか、クリックしてください。</p>
      <div className="cards">
        {pd.options.map((o) => {
          const id = String(o.data!.card);
          return <SourceCard key={id} src={`${from}:${id}`} id={id} why={{ k: 'other' }} />;
        })}
      </div>
    </div>
  );
}

function CharChoice({ name, taken, onPreview }: { name: string; taken: boolean; onPreview: (name: string) => void }) {
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
        初期：G{ch.startRes.gold} 麦{ch.startRes.wheat} 木{ch.startRes.wood} 鉄{ch.startRes.iron} ダイヤ{ch.startDiamond}
      </div>
      <div className="txt">
        <b>基本能力</b>
        {ch.basicText}
      </div>
      <div className="txt">
        <b>時計塔能力</b>
        {ch.clockText}
      </div>
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
          <CharChoice key={n} name={n} taken={!open.has(n)} onPreview={setPreview} />
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
    <div className="modal-back setup">
      <div className="modal wide draft" role="dialog" aria-label="準備のドラフト">
        <h2>{mine ? '準備のドラフト：まだ選んでいないものから1つを選んでください' : `${s.players[pd.player].name}さんが選んでいます`}</h2>
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
          {shown === 'map' && (
            <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {pd.options
                .filter((o) => o.id.startsWith('map:'))
                .map((o) => (
                  <MapChoice key={o.id} id={o.id.slice(4)} label={o.label} />
                ))}
            </div>
          )}
          {shown === 'support' && <SupportBoard s={s} />}
        </div>
      </div>
    </div>
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
      <div className="modal-back setup">
        <div className="modal wide" role="dialog" aria-label="キャラクターの選択">
          <h2>{mine ? 'キャラクターを選んでください' : `${s.players[pd.player].name}さんがキャラクターを選んでいます`}</h2>
          <CharGrid s={s} seat={pd.player} open={open} />
        </div>
      </div>
    );
  }
  return (
    <div className="modal-back setup">
      <div className="modal" role="dialog" aria-label="地図ボードの選択">
        <h2>{mine ? '地図ボードと面を選んでください' : `${s.players[pd.player].name}さんが地図ボードを選んでいます`}</h2>
        <p>地図ボードは5枚で、表はどれも同じA面、裏はボードごとに違うB面です。A面を選ぶときも、どのボードを使うかを選びます（そのボードのB面はほかの人が選べなくなります）。最初のゲームでは、全員がA面を使うのがおすすめです。</p>
        <div className="modal-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {c.state.pending!.options.map((o) => (
            <MapChoice key={o.id} id={o.id.slice(4)} label={o.label} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function cardName(id: string): string {
  return CARDS[id].nameJa;
}
