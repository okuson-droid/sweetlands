// 手札・手元のディスクとダイヤ・共通サプライ・捨て札置き場（ui_design §4.1）
import { SPECIAL_TILES, TERRAIN_FLIP } from '../../game/boards';
import { cardCost } from '../../game/engine';
import type { GameState, PlayerState, Terrain } from '../../game/types';
import { useInteraction, useSource, useTarget, useZoomBind } from '../interaction';
import { CardBack, CardFace, CardFull, SourceCard } from './Card';
import { CARDS } from '../../game/cards';
import { Glyph } from '../icons/Glyph';
import { Icons, effToks } from '../icons/EffIcons';
import { Fold } from './Fold';

const TERRAIN: [Terrain, string][] = [
  ['W', '麦畑'],
  ['F', '森林'],
  ['M', '鉱山'],
  ['S', '海'],
];

function Pile({ src, label, children, title, zoom }: { src: string; label: string; children: React.ReactNode; title?: string; zoom?: () => React.ReactNode }) {
  const s = useSource(src, label, { k: 'other' });
  const z = useZoomBind(zoom);
  return (
    <div className={`stackpile ${s.lit ? 'lit' : ''} ${s.held ? 'held' : ''}`} {...s.props} {...z.props} tabIndex={0} title={title ?? label}>
      {children}
    </div>
  );
}

function SpecialTile({ id }: { id: number }) {
  const src = useSource(`special:${id}`, `特殊地形タイル${id}`, { k: 'other' });
  return (
    <div className={`stackpile special ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} tabIndex={0} title={`特殊地形タイル：裏返すと ${SPECIAL_TILES[id].label}`}>
      <Glyph g={{ k: 'hex', kind: 'X' }} size={18} />
      <Icons toks={effToks(SPECIAL_TILES[id].eff)} size={11} />
    </div>
  );
}

/** 自分の手元のディスクとダイヤ */
export function MineSupply({ me }: { me: PlayerState }) {
  return (
    <div className="mine-supply">
      <Pile src="disc:own" label="手元のディスク">
        <Glyph g="disc" size={20} />
        <b>{me.discs}</b>
      </Pile>
      <Pile src="diamond" label="ダイヤ">
        <Glyph g="diamond" size={20} />
        <b>{me.diamond}</b>
      </Pile>
    </div>
  );
}

/** 横長レイアウトの手札：1列に重ねて並べ、カーソルを合わせたカードは手札の上の覗き窓に表面と文章を出す（ui_design §21） */
export function HandRow({ s, me, viewer }: { s: GameState; me: PlayerState; viewer: number }) {
  const c = useInteraction();
  const hand = useTarget('hand', { k: 'other' });
  const keep = useTarget('keep', { k: 'other' });
  const keeping = s.pending?.step === 'keep' && s.pending.player === viewer;
  return (
    <div className={`handrow ${c.held ? 'holding' : ''}`}>
      <div className={`hand ${hand.lit ? 'lit' : ''}`} {...hand.props} aria-label="手札">
        {keeping && (
          <div className={`keep-slot ${keep.lit ? 'lit' : ''}`} {...keep.props}>
            持ち越し枠
          </div>
        )}
        {viewer === me.seat
          ? me.hand.map((id) => (
              <span key={id} className="hslot">
                <SourceCard src={`card:${id}`} id={id} cost={cardCost(s, me, id)} why={{ k: 'handCard', card: id }} />
                <span className="hpeek" aria-hidden="true">
                  <span className={`card ${CARDS[id].type === 'pass' ? 'pass' : ''}`}>
                    <CardFace id={id} cost={cardCost(s, me, id)} />
                  </span>
                  <span className="hpeek-text">
                    <CardFull id={id} cost={cardCost(s, me, id)} />
                  </span>
                </span>
              </span>
            ))
          : me.hand.map((_, i) => (
              <span key={i} className="hslot">
                <CardBack />
              </span>
            ))}
        {me.hand.length === 0 && (
          <span className="empty">
            <Glyph g="handCard" size={18} /> 0
          </span>
        )}
      </div>
    </div>
  );
}

/** 横長レイアウトの共通サプライ：地形タイルの残り枚数は出さない。特殊地形タイルはクリックで展開する（ui_design §21） */
export function SharedSupply({ s, foldSide = 'up', contextual, hideIdleDisc }: { s: GameState; foldSide?: 'up' | 'down'; contextual?: boolean; hideIdleDisc?: boolean }) {
  const c = useInteraction();
  const discard = useTarget('discard', { k: 'other' });
  const top = s.discard[s.discard.length - 1];
  const topZoom = useZoomBind(() => (top ? <CardFull id={top} /> : <div>捨て札はありません</div>));
  const sources = [...c.aff.drags.keys(), ...c.aff.clicks.keys()];
  const specialWanted = sources.some((k) => k.startsWith('special:'));
  // contextual：通常の地形タイルと道駒は、置けるときだけ出す
  const showTiles = !contextual || sources.some((k) => k.startsWith('tile:')) || !!c.held?.startsWith('tile:');
  const showRoad = !contextual || sources.includes('road') || c.held === 'road';
  // hideIdleDisc（スマートフォン）：アクションディスクの山は、持ち上げられるときだけ出す（狭い列に置ける物を収めるため）
  const showDisc = !hideIdleDisc || sources.includes('disc:supply') || c.held === 'disc:supply';
  return (
    <div className="supply shared-supply" aria-label="共通サプライ">
      {showDisc && (
        <Pile src="disc:supply" label="アクションディスク">
          <Glyph g="disc" size={22} />
        </Pile>
      )}
      {showTiles && TERRAIN.map(([k, name]) => (
        <Pile
          key={k}
          src={`tile:${k}`}
          label={`${name}タイル`}
          zoom={() => (
            <div>
              <b>{name}タイル</b>
              <div>
                裏返すと：
                <Icons toks={effToks(TERRAIN_FLIP[k])} size={18} />
              </div>
            </div>
          )}
        >
          <Glyph g={{ k: 'hex', kind: k }} size={24} />
        </Pile>
      ))}
      <Fold name="special" side={foldSide} label={<Glyph g={{ k: 'hex', kind: 'X' }} size={22} />} summary="特殊" force={specialWanted} wide={260}>
        <div className="special-list">
          {s.specialSupply.map((id) => (
            <SpecialTile key={id} id={id} />
          ))}
          {s.specialSupply.length === 0 && <span className="empty">残っていません</span>}
        </div>
      </Fold>
      {showRoad && (
        <Pile src="road" label="道駒">
          <Glyph g="road" size={24} />
        </Pile>
      )}
      <div className={`dropzone discard ${discard.lit ? 'lit' : ''}`} {...discard.props} {...topZoom.props} title="捨て札置き場（表向き。マウスを重ねると一番上のカード）">
        <Glyph g="discard" size={20} />
        <b>{s.discard.length}</b>
      </div>
      <div className="deck" title="市民デッキ">
        <Glyph g="card" size={18} />
        <b>{s.deck.length}</b>
      </div>
    </div>
  );
}
