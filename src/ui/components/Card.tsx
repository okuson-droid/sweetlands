// 市民カードの表示（手札・手元・小窓）と拡大表示（ui_design §13）
import { CARDS } from '../../game/cards';
import type { ExplainTarget } from '../../game/explain';
import { useSource, useZoomBind } from '../interaction';
import { Icons, effToks } from '../icons/EffIcons';
import { Glyph } from '../icons/Glyph';
import type { Tag } from '../../game/types';

const ROW_SHORT = { agr: '農', for: '林', min: '鉱', all: '全' } as const;

export function tagText(id: string): string {
  const c = CARDS[id];
  return Object.entries(c.tags)
    .map(([t, n]) => (n && n > 1 ? `${t}×${n}` : t))
    .join('・');
}

export function CardFull({ id, cost }: { id: string; cost?: number }) {
  const c = CARDS[id];
  return (
    <div className="cardfull">
      <h3>{c.nameJa}</h3>
      <div>
        {c.type === 'pass' ? 'パス時カード' : '即時カード'}・コスト {cost ?? c.cost}ゴールド
        {cost !== undefined && cost !== c.cost && (
          <span className="was">
            （元のコスト {c.cost}ゴールド、割引 −{c.cost - cost}）
          </span>
        )}
        {c.brownie && <div className="was">ブラウニー割引：自分が持っているブラウニータグ1個につき1ゴールド安い（このカード自身のタグは数えない）</div>}
      </div>
      <div className="sec">
        <b>{c.type === 'pass' ? 'パス時能力' : '即時能力'}</b>
        <Icons toks={effToks(c.main)} size={20} />
        {c.mainText || '（なし）'}
      </div>
      {c.autoText && (
        <div className="sec">
          <b>オートメーション能力</b>
          {c.auto && <Icons toks={effToks(c.auto)} size={20} />}
          {c.autoText}
        </div>
      )}
      <div className="sec">
        <b>タグ</b>
        {tagText(id)}
        {c.industry ? `／産業：${{ agr: '農業', for: '林業', min: '鉱業', all: 'オールマイティ' }[c.industry]}` : ''}
      </div>
    </div>
  );
}

const IND_COLOR = { agr: 'var(--wheat)', for: 'var(--forest)', min: 'var(--mine)', all: 'linear-gradient(90deg, var(--wheat) 0 33%, var(--forest) 33% 66%, var(--mine) 66%)' } as const;

/** カードの表面：原作と同じく、コスト・名前・能力のアイコン・タグ・産業タグとオートメーション能力 */
export function CardFace({ id, cost }: { id: string; cost?: number }) {
  const c = CARDS[id];
  const tags = Object.entries(c.tags).flatMap(([t, n]) => Array.from({ length: n ?? 0 }, () => t as Tag));
  return (
    <>
      <span className="chead">
        <span className="cost">
          <b className={cost !== undefined && cost !== c.cost ? 'discounted' : undefined} title={cost !== undefined && cost !== c.cost ? `割引後（元のコスト ${c.cost}）` : undefined}>
            {cost ?? c.cost}
          </b>
          <Glyph g="gold" size={12} />
        </span>
        <span className="name">{c.nameJa}</span>
      </span>
      <span className="cmain">
        {c.type === 'pass' && <Glyph g="pass" size={12} />}
        <Icons toks={effToks(c.main)} size={13} />
      </span>
      <span className="tags">
        {tags.map((t, i) => (
          <Glyph key={i} g={{ k: 'tag', tag: t }} size={13} title={t} />
        ))}
      </span>
      {c.industry && c.auto && (
        <span className="cauto" style={{ background: IND_COLOR[c.industry] }}>
          <Icons toks={effToks(c.auto)} size={12} />
        </span>
      )}
    </>
  );
}

/** 持ち上げられるカード（手札・手元・小窓の候補） */
export function SourceCard({ src, id, cost, why }: { src: string; id: string; cost?: number; why: ExplainTarget }) {
  const c = CARDS[id];
  const s = useSource(src, c.nameJa, why);
  const z = useZoomBind(() => <CardFull id={id} cost={cost} />);
  return (
    <div className={`card ${c.type === 'pass' ? 'pass' : ''} ${s.lit ? 'lit' : ''} ${s.held ? 'held' : ''}`} {...s.props} {...z.props} tabIndex={0} aria-label={c.nameJa}>
      <CardFace id={id} cost={cost} />
    </div>
  );
}

/** 裏向きのカード（他人の手札。中身の識別子を DOM に持たせない：§2-6） */
export function CardBack() {
  return <div className="card back" aria-label="裏向きのカード" />;
}

/** 見るだけのカード（オートメーション化したカード・捨て札の一覧）。マウスを重ねる／長押しで拡大表示する。操作の対象にはならない */
export function ViewCard({ id }: { id: string }) {
  const z = useZoomBind(() => <CardFull id={id} />);
  return (
    <div className={`card view ${CARDS[id].type === 'pass' ? 'pass' : ''}`} {...z.props} tabIndex={0} aria-label={CARDS[id].nameJa}>
      <CardFace id={id} />
    </div>
  );
}

/** 見るだけのカードを並べる。newestFirst は末尾（最も新しいもの）から並べる */
export function CardList({ ids, empty, newestFirst = false }: { ids: string[]; empty: string; newestFirst?: boolean }) {
  const list = newestFirst ? [...ids].reverse() : ids;
  return (
    <div className="card-list">
      {list.map((id) => (
        <ViewCard key={id} id={id} />
      ))}
      {list.length === 0 && <span className="empty">{empty}</span>}
    </div>
  );
}
