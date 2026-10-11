// 市民カード（rules §12.14）。アイコン表記を効果言語に変換する。
import raw from '../data/citizen_cards.json';
import type { CardDef, CondItem, Cost, Counter, Eff, Row, Tag, Terrain } from './types';

interface RawCard {
  id: string;
  name_en: string | null;
  name_ja: string | null;
  type: 'immediate' | 'pass';
  cost: number | null;
  brownie_discount: boolean;
  main_icons: string;
  main_text: string;
  tags: Record<string, number>;
  auto_icons: string | null;
  auto_text: string | null;
  industry: string | null;
}

const TAG_TOKEN: Record<string, Tag> = {
  tShort: 'ショートケーキ',
  tTart: 'タルト',
  tBrownie: 'ブラウニー',
  tTiramisu: 'ティラミス',
  tMacaron: 'マカロン',
  tWagashi: '和菓子',
};
const RES_TOKEN: Record<string, 'gold' | 'wheat' | 'wood' | 'iron'> = { G: 'gold', W: 'wheat', Wd: 'wood', I: 'iron' };
const TERR: Record<string, Terrain> = { W: 'W', F: 'F', M: 'M', S: 'S' };
const INDUSTRY: Record<string, Row | 'all'> = { 農業: 'agr', 林業: 'for', 鉱業: 'min', オールマイティ: 'all' };

interface Item {
  n: number;
  tok: string;
}

function items(seg: string): Item[] {
  const t = seg.trim().split(/\s+/).filter(Boolean);
  const out: Item[] = [];
  let pending: number | null = null;
  for (const x of t) {
    if (/^\d+$/.test(x)) {
      pending = Number(x);
      continue;
    }
    out.push({ n: pending ?? 1, tok: x });
    pending = null;
  }
  return out;
}

/** 月桂樹アイコン（VP1, CP2, IP1 など）の内側の数字 */
function laurel(tok: string): { kind: 'vp' | 'cp' | 'ip'; inner: number } | null {
  const m = /^(VP|CP|IP)(\d+)$/.exec(tok);
  if (!m) return null;
  return { kind: m[1].toLowerCase() as 'vp' | 'cp' | 'ip', inner: Number(m[2]) };
}

export class ParseError extends Error {}

/** 得る側のアイコン */
function gainEff(it: Item): Eff[] {
  const { n, tok } = it;
  if (RES_TOKEN[tok]) return [{ k: 'gain', res: { [RES_TOKEN[tok]]: n } }];
  if (tok === 'D') return [{ k: 'gain', res: { diamond: n } }];
  if (tok === 'R?') return [{ k: 'anyBasic', n }];
  const inc = /^\[(G|W|Wd|I)\]$/.exec(tok);
  if (inc) return [{ k: 'income', res: RES_TOKEN[inc[1]], n }];
  const hex = /^hex([WFMS?])$/.exec(tok);
  if (hex) return [{ k: 'terrain', n, kind: hex[1] === '?' ? 'any' : TERR[hex[1]] }];
  if (tok === 'placeRoad') return [{ k: 'road', n }];
  if (tok === 'placeBld') return [{ k: 'building', n, viaAction: false }];
  const pb = /^placeBld([WFMS])$/.exec(tok);
  if (pb) return [{ k: 'building', n, viaAction: false, onTerrain: TERR[pb[1]] }];
  if (tok === 'placeRabbit') return [{ k: 'rabbit', n }];
  if (tok === 'foodAdv') return [{ k: 'food', n }];
  if (tok === 'indAdv') return [{ k: 'industry', n }];
  const pros = /^pros([OGY?])$/.exec(tok);
  if (pros) return [{ k: 'pros', n, color: pros[1] === '?' ? undefined : (pros[1] as 'O' | 'G' | 'Y') }];
  const draw = /^draw(\d)$/.exec(tok);
  if (draw) return [{ k: 'draw', n: n * Number(draw[1]) }];
  const ib = /^ib(Agr|For|Min|\?)$/.exec(tok);
  if (ib) {
    const row = ib[1] === '?' ? undefined : (ib[1].toLowerCase() as Row);
    return Array.from({ length: n }, () => ({ k: 'ib', row }) as Eff);
  }
  const l = laurel(tok);
  if (l) return [{ k: 'score', kind: l.kind, n: n * l.inner }];
  if (tok === 'searchMacaron2') return [{ k: 'search', tag: 'マカロン', n: 2 }];
  throw new ParseError(`得る側の未知のアイコン: ${tok}`);
}

/** 支払う側のアイコン */
function addCost(cost: Cost, it: Item): void {
  const { n, tok } = it;
  if (RES_TOKEN[tok]) cost[RES_TOKEN[tok]] = (cost[RES_TOKEN[tok]] ?? 0) + n;
  else if (tok === 'D') cost.diamond = (cost.diamond ?? 0) + n;
  else if (tok === 'R?') cost.anyBasic = (cost.anyBasic ?? 0) + n;
  else if (tok === 'hand') cost.hand = (cost.hand ?? 0) + n;
  else {
    const inc = /^\[(G|W|Wd|I)\]$/.exec(tok);
    if (!inc) throw new ParseError(`支払う側の未知のアイコン: ${tok}`);
    cost.income = cost.income ?? {};
    const r = RES_TOKEN[inc[1]];
    cost.income[r] = (cost.income[r] ?? 0) + n;
  }
}

/** 条件側のアイコン（数える対象） */
function counter(it: Item): CondItem {
  const { n, tok } = it;
  const mk = (c: Counter, nn = n): CondItem => ({ counter: c, n: nn });
  if (TAG_TOKEN[tok]) return mk({ k: 'tag', tag: TAG_TOKEN[tok] });
  const hex = /^hex([WFMS?])(裏)?$/.exec(tok);
  if (hex) return mk({ k: 'terrain', kind: hex[1] === '?' ? 'any' : TERR[hex[1]], backOnly: !!hex[2] });
  const bo = /^bldOn([WFMS])$/.exec(tok);
  if (bo) return mk({ k: 'bldOn', kind: TERR[bo[1]] });
  if (tok === 'bld') return mk({ k: 'bld' });
  if (tok === 'city') return mk({ k: 'city' });
  if (tok === 'rabbit') return mk({ k: 'rabbit' });
  if (tok === 'auto') return mk({ k: 'auto' });
  if (tok === 'food') return mk({ k: 'food' });
  const pl = /^played(All|Agr|For|Min)?$/.exec(tok);
  if (pl) return mk({ k: 'played', row: pl[1] ? (pl[1] === 'All' ? 'all' : (pl[1].toLowerCase() as Row)) : undefined });
  const inc = /^\[(G|W|Wd|I)\]$/.exec(tok);
  if (inc) return mk({ k: 'income', res: RES_TOKEN[inc[1]] });
  if (RES_TOKEN[tok]) return mk({ k: 'res', res: RES_TOKEN[tok] });
  if (tok === 'D') return mk({ k: 'res', res: 'diamond' });
  const l = laurel(tok);
  if (l) return mk({ k: 'score', kind: l.kind }, n * l.inner);
  throw new ParseError(`条件側の未知のアイコン: ${tok}`);
}

/** 1行（点線で区切られた1つの効果）を変換する */
export function parseLine(line: string): Eff[] {
  let s = line.trim();
  if (s.startsWith('clock')) s = s.slice(5).trim(); // パス時アイコン
  // 矢印で分割（->* / -> / =>* / =>）
  const parts = s.split(/\s*(->\*|->|=>\*|=>)\s*/);
  const segs: string[] = [];
  const arrows: string[] = [];
  parts.forEach((p, i) => (i % 2 === 0 ? segs.push(p) : arrows.push(p)));
  if (arrows.length === 0) return items(segs[0]).flatMap(gainEff);
  // 右から組み立てる
  let tail: Eff[] = items(segs[segs.length - 1]).flatMap(gainEff);
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    const left = items(segs[i]);
    if (a === '->' || a === '->*') {
      const cost: Cost = {};
      left.forEach((it) => addCost(cost, it));
      tail = [{ k: 'pay', cost, then: tail, repeat: a === '->*' }];
    } else {
      tail = [{ k: 'cond', items: left.map(counter), each: a === '=>*', then: tail }];
    }
  }
  return tail;
}

export function parseIcons(s: string | null): Eff[] | null {
  if (!s) return null;
  return s.split('|').flatMap((line) => parseLine(line));
}

function convert(c: RawCard): CardDef {
  return {
    id: c.id,
    nameJa: c.name_ja ?? '',
    nameEn: c.name_en ?? '',
    type: c.type,
    cost: c.cost ?? 0,
    brownie: c.brownie_discount,
    tags: c.tags as Partial<Record<Tag, number>>,
    industry: c.industry ? INDUSTRY[c.industry] : null,
    main: parseIcons(c.main_icons) ?? [],
    auto: c.type === 'pass' ? null : parseIcons(c.auto_icons),
    mainText: c.main_text,
    autoText: c.auto_text,
  };
}

export const CARDS: Record<string, CardDef> = Object.fromEntries((raw as unknown as RawCard[]).map((c) => [c.id, convert(c)]));
export const CARD_IDS: string[] = (raw as unknown as RawCard[]).map((c) => c.id);
