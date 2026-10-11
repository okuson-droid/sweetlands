// 効果・コスト・条件をアイコンの並びで表す（原作と同じ基準：支払いは赤い数字、得るものは黒い数字、
// 「〜を支払い」は赤い矢印、「〜を満たしているならば」は白抜きの矢印、回数分は矢印に輪）
import { Fragment } from 'react';
import type { Cost, Counter, CondItem, Eff, ResKind } from '../../game/types';
import { Glyph, type GlyphSpec } from './Glyph';

export type Tok = { g: GlyphSpec; n?: number | string; cost?: boolean; was?: number } | { sep: string };

const RES: ResKind[] = ['gold', 'wheat', 'wood', 'iron'];

export function counterGlyph(c: Counter): GlyphSpec {
  switch (c.k) {
    case 'tag':
      return { k: 'tag', tag: c.tag };
    case 'terrain':
      return { k: 'hex', kind: c.kind, back: c.backOnly };
    case 'bldOn':
      return { k: 'building', on: c.kind };
    case 'bld':
      return { k: 'building', type: c.type };
    case 'city':
      return { k: 'city' };
    case 'rabbit':
      return 'rabbit';
    case 'played':
      return { k: 'played', row: c.row };
    case 'auto':
      return 'automated';
    case 'food':
      return 'food';
    case 'score':
      return c.kind === 'vp' ? 'vp' : c.kind === 'cp' ? 'cp' : 'ip';
    case 'income':
      return { k: 'income', res: c.res as 'gold' };
    case 'res':
      return c.res as 'gold';
  }
}

/** 割引後のコスト。割り引かれた資源には元の値（was）を持たせる */
export function discountedCostToks(base: Cost, actual: Cost): Tok[] {
  const out: Tok[] = [];
  for (const r of [...RES, 'diamond'] as const) {
    const b = base[r] ?? 0;
    const a = actual[r] ?? 0;
    if (!b && !a) continue;
    out.push({ g: r, n: a, cost: true, was: a !== b ? b : undefined });
  }
  return out;
}

export function costToks(c: Cost): Tok[] {
  const out: Tok[] = [];
  for (const r of RES) if (c[r]) out.push({ g: r, n: c[r], cost: true });
  if (c.diamond) out.push({ g: 'diamond', n: c.diamond, cost: true });
  if (c.anyBasic) out.push({ g: 'anyBasic', n: c.anyBasic, cost: true });
  if (c.hand) out.push({ g: 'handCard', n: c.hand, cost: true });
  if (c.disc) out.push({ g: 'disc', n: c.disc, cost: true });
  if (c.income) for (const [k, v] of Object.entries(c.income)) if (v) out.push({ g: { k: 'income', res: k as 'gold' }, n: v, cost: true });
  return out;
}

function condToks(items: CondItem[]): Tok[] {
  const out: Tok[] = [];
  items.forEach((it, i) => {
    if (i > 0) out.push({ sep: '+' });
    out.push({ g: counterGlyph(it.counter), n: it.n > 1 || it.counter.k === 'terrain' ? it.n : undefined });
  });
  return out;
}

export function effToks(effs: Eff[]): Tok[] {
  const out: Tok[] = [];
  effs.forEach((e) => out.push(...oneEff(e)));
  return out;
}

function oneEff(e: Eff): Tok[] {
  switch (e.k) {
    case 'gain': {
      const out: Tok[] = [];
      for (const r of RES) if (e.res[r]) out.push({ g: r, n: e.res[r] });
      if (e.res.diamond) out.push({ g: 'diamond', n: e.res.diamond });
      return out;
    }
    case 'anyBasic':
      return [{ g: 'anyBasic', n: e.n }];
    case 'income':
      return [{ g: { k: 'income', res: e.res as 'gold' }, n: e.n }];
    case 'terrain':
      return [{ g: { k: 'hex', kind: e.kind }, n: e.n }];
    case 'road':
      return [{ g: 'roadPlace', n: e.n }];
    case 'mix':
      return [{ g: { k: 'hex', kind: 'any' }, n: e.terrain }, { g: 'roadPlace', n: e.road }];
    case 'building':
      return [{ g: { k: 'building', place: true, on: e.onTerrain }, n: e.n }];
    case 'food':
      return [{ g: 'foodAdvance', n: e.n }];
    case 'industry':
      return [{ g: 'indAdvance', n: e.n }];
    case 'pros':
      return [{ g: { k: 'pros', color: e.color }, n: e.n }];
    case 'rabbit':
      return [{ g: 'rabbitPlace', n: e.n }];
    case 'draw':
      return [{ g: { k: 'draw', n: e.n } }];
    case 'skill':
      return [{ g: 'skill', n: e.n }];
    case 'ib':
      return [{ g: { k: 'ib', row: e.row } }];
    case 'score':
      return [{ g: e.kind === 'vp' ? 'vp' : e.kind === 'cp' ? 'cp' : 'ip', n: e.n }];
    case 'wonder':
      return [{ g: 'wonder' }];
    case 'disc':
      return [{ g: 'disc' }];
    case 'choice': {
      const out: Tok[] = [];
      e.options.forEach((o, i) => {
        if (i > 0) out.push({ sep: '/' });
        out.push(...effToks(o));
      });
      return out;
    }
    case 'pay':
      return [...costToks(e.cost), { g: e.repeat ? 'payRepeat' : 'payOnce' }, ...effToks(e.then)];
    case 'cond':
      return [...condToks(e.items), { g: e.each ? 'condEach' : 'condOnce' }, ...effToks(e.then)];
    case 'search':
      return [{ g: { k: 'search', what: e.pass ? 'pass' : e.tag! }, n: e.n }];
    case 'flipAny':
      return [{ g: 'hexFlip' }];
    case 'drawAutomate':
      return [{ g: 'drawAutomate' }];
    case 'discardDraw':
      return [{ g: { k: 'draw', n: e.draw } }, { g: 'discard', n: e.discard }];
    case 'special':
      if (e.id === 'incomeAny1') return [{ g: { k: 'income', res: 'any' }, n: 1 }];
      if (e.id === 'locomotive') return [{ g: 'loco' }];
      if (e.id === 'woodDiscount1') return [{ g: 'wood', n: '-1' }];
      if (e.id === 'woodDiscount2') return [{ g: 'wood', n: '-2' }];
      return [];
  }
}

/** アイコンの並び。label は読み上げ用・拡大表示用の文章 */
export function Icons({ toks, size = 16, label, className }: { toks: Tok[]; size?: number; label?: string; className?: string }) {
  return (
    <span className={`icons ${className ?? ''}`} role={label ? 'img' : undefined} aria-label={label} title={label}>
      {toks.map((t, i) =>
        'sep' in t ? (
          <span key={i} className="isep">
            {t.sep}
          </span>
        ) : (
          <Fragment key={i}>
            <span className="itok">
              {t.n !== undefined && (
                <b className={`n ${t.cost ? 'cost' : ''} ${t.was !== undefined ? 'discounted' : ''}`} title={t.was !== undefined ? `割引後（元のコスト ${t.was}）` : undefined}>
                  {t.n}
                </b>
              )}
              <Glyph g={t.g} size={size} />
            </span>
          </Fragment>
        ),
      )}
    </span>
  );
}

/** コスト → 効果（アクションエリアなど） */
export function costEffToks(cost: Cost, effs: Eff[]): Tok[] {
  const c = costToks(cost);
  return c.length ? [...c, { g: 'payOnce' }, ...effToks(effs)] : effToks(effs);
}
