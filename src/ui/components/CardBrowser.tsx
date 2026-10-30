// 市民カードの一覧（ロビーから開く）。全207枚を表面つきで並べ、名前・能力の文で探し、種類・産業・タグで絞り込む。
// カードをクリックすると、右の欄に拡大表示（CardFull）を出す。ゲームの局面には依存しない
import { useMemo, useState } from 'react';
import { CARDS } from '../../game/cards';
import { TAGS, type CardDef, type Tag } from '../../game/types';
import { CardFace, CardFull } from './Card';

type TypeFilter = 'all' | 'immediate' | 'pass';
type IndustryFilter = 'any' | 'agr' | 'for' | 'min' | 'all' | 'none';
type SortKey = 'id' | 'costAsc' | 'costDesc' | 'name';

const INDUSTRY_LABEL: Record<IndustryFilter, string> = { any: 'すべて', agr: '農業', for: '林業', min: '鉱業', all: 'オールマイティ', none: '産業なし' };
const SORT_LABEL: Record<SortKey, string> = { id: 'カード番号順', costAsc: 'コストの安い順', costDesc: 'コストの高い順', name: '名前順' };

const ALL_CARDS: CardDef[] = Object.values(CARDS);

function matches(c: CardDef, q: string, type: TypeFilter, industry: IndustryFilter, tag: Tag | 'any'): boolean {
  if (type !== 'all' && c.type !== type) return false;
  if (industry !== 'any' && (industry === 'none' ? c.industry !== null : c.industry !== industry)) return false;
  if (tag !== 'any' && !c.tags[tag]) return false;
  if (!q) return true;
  return [c.nameJa, c.nameEn, c.mainText, c.autoText ?? ''].some((t) => t.toLowerCase().includes(q));
}

export function CardBrowser({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [industry, setIndustry] = useState<IndustryFilter>('any');
  const [tag, setTag] = useState<Tag | 'any'>('any');
  const [sort, setSort] = useState<SortKey>('id');
  const [selected, setSelected] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = ALL_CARDS.filter((c) => matches(c, q, type, industry, tag));
    if (sort === 'costAsc') out.sort((a, b) => a.cost - b.cost);
    if (sort === 'costDesc') out.sort((a, b) => b.cost - a.cost);
    if (sort === 'name') out.sort((a, b) => a.nameJa.localeCompare(b.nameJa, 'ja'));
    return out;
  }, [query, type, industry, tag, sort]);

  return (
    <main className="card-browser">
      <header className="cb-bar">
        <button className="btn" onClick={onBack}>
          ← ロビーに戻る
        </button>
        <h1>市民カード一覧</h1>
        <input className="cb-search" type="search" value={query} placeholder="名前・能力の文で探す" onChange={(e) => setQuery(e.target.value)} aria-label="カードを探す" />
        <label className="field">
          種類
          <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
            <option value="all">すべて</option>
            <option value="immediate">即時カード</option>
            <option value="pass">パス時カード</option>
          </select>
        </label>
        <label className="field">
          産業
          <select value={industry} onChange={(e) => setIndustry(e.target.value as IndustryFilter)}>
            {(Object.keys(INDUSTRY_LABEL) as IndustryFilter[]).map((k) => (
              <option key={k} value={k}>
                {INDUSTRY_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          タグ
          <select value={tag} onChange={(e) => setTag(e.target.value as Tag | 'any')}>
            <option value="any">すべて</option>
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          並べ方
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <span className="cb-count">
          {list.length} / {ALL_CARDS.length}枚
        </span>
      </header>
      <div className="cb-body">
        <div className="cb-grid">
          {list.map((c) => (
            <button key={c.id} className={`card ${c.type === 'pass' ? 'pass' : ''} ${selected === c.id ? 'selected' : ''}`} onClick={() => setSelected(c.id)} aria-label={c.nameJa} aria-pressed={selected === c.id}>
              <CardFace id={c.id} />
            </button>
          ))}
          {list.length === 0 && <p className="hint">条件に合うカードはありません。</p>}
        </div>
        {/* 広い画面では右の欄、狭い画面（スマートフォン）ではカードを選んだときだけ下から出す窓（CSS で切り替える） */}
        <aside className={`cb-detail ${selected ? 'has-card' : ''}`} aria-label="選んだカード">
          {selected ? (
            <>
              <button className="btn cb-close" onClick={() => setSelected(null)}>
                閉じる
              </button>
              <CardFull id={selected} />
            </>
          ) : (
            <p className="hint">カードをクリックすると、ここに詳しい内容を出します。</p>
          )}
        </aside>
      </div>
    </main>
  );
}
