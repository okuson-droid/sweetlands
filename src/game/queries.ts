// 盤面の数え上げ・判定（rules §6.2〜§6.11, §9）
import mapsRaw from '../data/maps.json';
import { CARDS } from './cards';
import { BUFF_TRAIT_TAGS, CHARACTERS, isBuffed } from './characters';
import { hexEdges, hexKey, hexVertices, neighborCoords, parseHexKey, sharedEdge, edgeVertices } from './geometry';
import type { HexKey } from './geometry';
import { IP_ICONS, IP_VALUES_NATA_BUFF, PROS_TRACKS } from './boards';
import type { BuildingType, CondItem, Counter, GameState, MapHex, PlayerState, Row, Tag, Terrain } from './types';
import { TAGS } from './types';

interface RawMap {
  hexes: { row: number; col: number; terrain: string; icon: string | null }[];
  virtual: Record<string, { pos: [number, number]; adjacentHexes: string[] }>;
}
export const MAPS = mapsRaw as unknown as Record<string, RawMap>;

export function initialHexes(mapId: string): Record<HexKey, MapHex> {
  const out: Record<HexKey, MapHex> = {};
  for (const h of MAPS[mapId].hexes) {
    out[hexKey(h.row, h.col)] = {
      terrain: h.terrain as MapHex['terrain'],
      icon: h.icon,
      iconTaken: false,
      tile: null,
      building: null,
      rabbit: false,
    };
  }
  return out;
}

/** 港・追加ドローエリアの仮想位置 */
export function virtualAreas(mapId: string) {
  const v = MAPS[mapId].virtual;
  const ports: [number, number][] = [];
  const draws: [number, number][] = [];
  for (const [name, d] of Object.entries(v)) (name.startsWith('港') ? ports : draws).push(d.pos);
  return { ports, draws };
}

export function neighbors(p: PlayerState, key: HexKey): HexKey[] {
  const [r, c] = parseHexKey(key);
  return neighborCoords(r, c)
    .map(([a, b]) => hexKey(a, b))
    .filter((k) => k in p.hexes);
}

export const isCapital = (h: MapHex) => h.terrain === 'C';

// ---- 地形タイル（§6.2） ----
export function canPlaceTerrain(p: PlayerState, key: HexKey, kind: Terrain | 'any', ignoreAdjacency: boolean): boolean {
  const h = p.hexes[key];
  if (!h || h.tile || h.terrain === 'C') return false;
  if (kind !== 'any' && h.terrain !== kind) return false;
  if (ignoreAdjacency) return true;
  return neighbors(p, key).some((n) => p.hexes[n].terrain === 'C' || p.hexes[n].tile !== null);
}

// ---- 道駒（§6.3） ----
export function allEdges(p: PlayerState): string[] {
  const s = new Set<string>();
  for (const key of Object.keys(p.hexes)) {
    const [r, c] = parseHexKey(key);
    hexEdges(r, c).forEach((e) => s.add(e));
  }
  return [...s];
}

export function legalRoadEdges(p: PlayerState): string[] {
  const roads = new Set(p.roads);
  const anchor = new Set<string>();
  for (const [key, h] of Object.entries(p.hexes)) {
    if (h.terrain !== 'C') continue;
    const [r, c] = parseHexKey(key);
    hexVertices(r, c).forEach((v) => anchor.add(v));
  }
  for (const e of p.roads) edgeVertices(e).forEach((v) => anchor.add(v));
  return allEdges(p).filter((e) => !roads.has(e) && edgeVertices(e).some((v) => anchor.has(v)));
}

export function hexesOnEdge(p: PlayerState, e: string): HexKey[] {
  return Object.keys(p.hexes).filter((k) => {
    const [r, c] = parseHexKey(k);
    return hexEdges(r, c).includes(e);
  });
}

export function hexHasRoad(p: PlayerState, key: HexKey): boolean {
  const [r, c] = parseHexKey(key);
  const roads = new Set(p.roads);
  return hexEdges(r, c).some((e) => roads.has(e));
}

/** 追加ドローエリア i がアクティブ化の条件を満たしているか（§6.3） */
export function drawAreaReady(p: PlayerState, i: number): boolean {
  if (!p.mapId) return false;
  const pos = virtualAreas(p.mapId).draws[i];
  const [r, c] = pos;
  const adj = neighborCoords(r, c)
    .map(([a, b]) => hexKey(a, b))
    .filter((k) => k in p.hexes);
  const hasTile = adj.some((k) => p.hexes[k].tile !== null);
  const roads = new Set(p.roads);
  const hasRoad = adj.some((k) => {
    const e = sharedEdge(pos, parseHexKey(k));
    return e !== null && roads.has(e);
  });
  return hasTile && hasRoad;
}

/** 接続している港の数（§9-7） */
export function connectedPorts(p: PlayerState): number {
  return portStatus(p).filter(Boolean).length;
}

/** 港ごとに、首都まで地形タイルでつながっているか（表示用。connectedPorts と同じ判定） */
export function portStatus(p: PlayerState): boolean[] {
  if (!p.mapId) return [];
  const { ports } = virtualAreas(p.mapId);
  const out: boolean[] = [];
  for (const [r, c] of ports) {
    const start = neighborCoords(r, c)
      .map(([a, b]) => hexKey(a, b))
      .filter((k) => k in p.hexes && p.hexes[k].tile !== null);
    const seen = new Set(start);
    const stack = [...start];
    let ok = false;
    while (stack.length && !ok) {
      const k = stack.pop()!;
      for (const n of neighbors(p, k)) {
        if (p.hexes[n].terrain === 'C') ok = true;
        else if (p.hexes[n].tile && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    out.push(ok);
  }
  return out;
}

// ---- 都市（§6.11-2） ----
/** 自分の都市。buff はキャラクターの上方修正を採用しているか（アリス・ティーローズの数え方が変わる。docs/decisions_16） */
export function cities(p: PlayerState, buff = false): HexKey[][] {
  if (buff && p.character === 'アリス・ティーローズ') return aliceBuffCities(p);
  const alice = p.character === 'アリス・ティーローズ';
  const aliceClock = alice && p.clockPlaced;
  const keys = Object.keys(p.hexes).filter((k) => p.hexes[k].building);
  const seen = new Set<string>();
  const out: HexKey[][] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    const comp: HexKey[] = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const n of neighbors(p, x))
        if (p.hexes[n].building && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
    }
    const types = new Set(comp.map((x) => p.hexes[x].building));
    const isCity =
      types.size >= 3 || (alice && comp.length >= 3) || (aliceClock && types.has('clock'));
    if (isCity) out.push(comp);
  }
  return out;
}

/** 建物駒のつながった集まり（keys に含まれる建物駒だけでつなぐ） */
function buildingGroups(p: PlayerState, keys: HexKey[]): HexKey[][] {
  const inKeys = new Set(keys);
  const seen = new Set<string>();
  const out: HexKey[][] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    const comp: HexKey[] = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const x = stack.pop()!;
      comp.push(x);
      for (const n of neighbors(p, x))
        if (inKeys.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
    }
    out.push(comp);
  }
  return out;
}

/** アリス・ティーローズの上方修正（docs/decisions_16）：つながった建物駒の集まりを、
 *  建物駒が3種類以上あるつながった組に分け、組の数が最も多くなる分け方を都市とする。
 *  時計塔駒を置いていれば、時計塔駒は単独で1つの都市である（時計塔能力）。
 *  どの組にも入らない建物駒は残してよい（隣の組に足しても条件は崩れないため、都市の数は変わらない） */
function aliceBuffCities(p: PlayerState): HexKey[][] {
  let keys = Object.keys(p.hexes).filter((k) => p.hexes[k].building);
  const out: HexKey[][] = [];
  if (p.clockPlaced) {
    // 時計塔駒をほかの組に使っても、単独の都市にした場合より都市は増えない
    for (const k of keys) if (p.hexes[k].building === 'clock') out.push([k]);
    keys = keys.filter((k) => p.hexes[k].building !== 'clock');
  }
  for (const comp of buildingGroups(p, keys)) out.push(...packCities(p, comp));
  return out;
}

const PACK_CACHE = new Map<string, HexKey[][]>();
const PACK_CACHE_MAX = 2000;

/** つながった建物駒の集まり comp から、3種類以上を含むつながった組を互いに重ならないように最も多く取り出す（厳密解）。
 *  建物駒は1人23個までのため、組の候補を「3種類目が入った時点で広げるのをやめる」ことで絞れば十分に速い */
function packCities(p: PlayerState, comp: HexKey[]): HexKey[][] {
  const n = comp.length;
  if (n < 3 || new Set(comp.map((k) => p.hexes[k].building)).size < 3) return [];
  const cacheKey = comp.map((k) => `${k}=${p.hexes[k].building}`).sort().join('|');
  const hit = PACK_CACHE.get(cacheKey);
  if (hit) return hit;

  const index = new Map(comp.map((k, i) => [k, i]));
  const adj = comp.map((k) => neighbors(p, k).reduce((m, x) => (index.has(x) ? m | (1 << index.get(x)!) : m), 0));
  const typeOf = comp.map((k) => p.hexes[k].building);
  const bits = (m: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (m & (1 << i)) out.push(i);
    return out;
  };
  const typeCount = (m: number) => new Set(bits(m).map((i) => typeOf[i])).size;
  const popcount = (m: number) => bits(m).length;
  /** avail から取り出せる組の数の上限。組は3個以上で、どの2種類にも属さない建物駒を少なくとも1個含む */
  const upper = (m: number): number => {
    const per = new Map<string | null, number>();
    for (const i of bits(m)) per.set(typeOf[i], (per.get(typeOf[i]) ?? 0) + 1);
    const counts = [...per.values()].sort((a, b) => b - a);
    const total = counts.reduce((a, b) => a + b, 0);
    return Math.min(Math.floor(total / 3), total - (counts[0] ?? 0) - (counts[1] ?? 0));
  };

  /** v を含む組の候補：つながった組を1個ずつ広げ、3種類以上になったところで広げるのをやめたもののうち、
   *  ほかの候補を含まないもの（組は含まれる小さな組に縮めても都市の数が減らないため、極小の組だけを考えれば足りる）。
   *  avail に左右されないため、v ごとに1回だけ求める */
  const groupCache = new Map<number, number[]>();
  const groupsOf = (v: number): number[] => {
    const cached = groupCache.get(v);
    if (cached) return cached;
    const found: number[] = [];
    const seen = new Set<number>();
    const stack = [1 << v];
    while (stack.length) {
      const m = stack.pop()!;
      if (seen.has(m)) continue;
      seen.add(m);
      if (typeCount(m) >= 3) {
        found.push(m);
        continue;
      }
      let frontier = 0;
      for (const i of bits(m)) frontier |= adj[i];
      frontier &= ~m;
      for (const u of bits(frontier)) stack.push(m | (1 << u));
    }
    found.sort((a, b) => popcount(a) - popcount(b));
    const minimal: number[] = [];
    for (const g of found) if (!minimal.some((h) => (h & g) === h)) minimal.push(g);
    groupCache.set(v, minimal);
    return minimal;
  };

  const memo = new Map<number, number[]>();
  /** avail の建物駒から取り出せる組（数が最大のもの） */
  const best = (avail: number): number[] => {
    const ub = upper(avail);
    if (ub <= 0) return [];
    const cached = memo.get(avail);
    if (cached) return cached;
    // 珍しい種類の建物駒は必ずどれかの組の決め手になるため、最も少ない種類の建物駒 v から分ける
    const per = new Map<string | null, number>();
    for (const i of bits(avail)) per.set(typeOf[i], (per.get(typeOf[i]) ?? 0) + 1);
    const v = bits(avail).reduce((a, i) => (per.get(typeOf[i])! < per.get(typeOf[a])! ? i : a));
    // v を含む組を1つ取る場合と、v をどの組にも入れない場合を比べる
    let res: number[] = [];
    for (const g of groupsOf(v)) {
      if ((g & ~avail) !== 0) continue;
      const rest = best(avail & ~g);
      if (rest.length + 1 > res.length) res = [g, ...rest];
      if (res.length >= ub) break; // これ以上は増えない
    }
    if (res.length < ub && upper(avail & ~(1 << v)) > res.length) {
      const skip = best(avail & ~(1 << v));
      if (skip.length > res.length) res = skip;
    }
    memo.set(avail, res);
    return res;
  };

  const result = best((1 << n) - 1).map((m) => bits(m).map((i) => comp[i]));
  if (PACK_CACHE.size >= PACK_CACHE_MAX) PACK_CACHE.clear();
  PACK_CACHE.set(cacheKey, result);
  return result;
}

// ---- 数え上げ ----
// 地形タイルの数。表裏を問わず数える（ユーザー確認済み）。backOnly のときだけ裏向きに限る
export function terrainCount(p: PlayerState, kind: Terrain | 'any', backOnly = false): number {
  return Object.values(p.hexes).filter(
    (h) => h.tile && h.tile.kind !== 'special' && (kind === 'any' || h.terrain === kind) && (!backOnly || h.tile.flipped),
  ).length + (kind === 'any' ? Object.values(p.hexes).filter((h) => h.tile?.kind === 'special' && (!backOnly || h.tile.flipped)).length : 0);
}

export function buildingCount(p: PlayerState, type?: BuildingType): number {
  return Object.values(p.hexes).filter((h) => h.building && (!type || h.building === type)).length;
}

export function allPlayed(p: PlayerState): string[] {
  return [...p.played, ...p.automated.agr, ...p.automated.for, ...p.automated.min];
}

/** 所持しているスイーツタグの数。buff はキャラクターの上方修正を採用しているか（サクラ・モチの特性の和菓子タグが2個になる。docs/decisions_16） */
export function tagCounts(p: PlayerState, buff = false): Record<Tag, number> {
  const out = Object.fromEntries(TAGS.map((t) => [t, 0])) as Record<Tag, number>;
  const trait = p.character ? (buff && BUFF_TRAIT_TAGS[p.character]) || CHARACTERS[p.character].traitTags : undefined;
  if (trait) for (const [t, n] of Object.entries(trait)) out[t as Tag] += n ?? 0;
  for (const id of allPlayed(p)) for (const [t, n] of Object.entries(CARDS[id].tags)) out[t as Tag] += n ?? 0;
  return out;
}

export function playedCount(p: PlayerState, row?: Row | 'all'): number {
  const list = allPlayed(p).map((id) => CARDS[id]);
  if (!row) return list.length;
  if (row === 'all') return list.filter((c) => c.industry === 'all').length;
  // 特定の産業タグ：オールマイティも含める（実装判断。decisions.md に記録）
  return list.filter((c) => c.industry === row || c.industry === 'all').length;
}

/** 画面の集計表示用：置いた地形タイルの枚数（地形ごと・特殊地形タイル）、道駒の本数、
 *  プレイしたカード（オートメーション化したものを含む）の産業タグごとの枚数。
 *  産業タグはカードの産業そのもので数え、オールマイティは農業・林業・鉱業に重ねず別に数える */
export interface Tally {
  tiles: Record<Terrain | 'special', number>;
  roads: number;
  cards: Record<Row | 'all' | 'none', number>;
  cardsTotal: number;
}
export function tally(p: PlayerState): Tally {
  const tiles = { W: 0, F: 0, M: 0, S: 0, special: 0 };
  for (const h of Object.values(p.hexes)) {
    if (!h.tile) continue;
    if (h.tile.kind === 'special') tiles.special++;
    else tiles[h.terrain as Terrain]++;
  }
  const cards = { agr: 0, for: 0, min: 0, all: 0, none: 0 };
  const list = allPlayed(p);
  for (const id of list) cards[CARDS[id].industry ?? 'none']++;
  return { tiles, roads: p.roads.length, cards, cardsTotal: list.length };
}

export function automatedCount(p: PlayerState): number {
  return p.automated.agr.length + p.automated.for.length + p.automated.min.length;
}

/** 工業マーカーが通過した工業点アイコンの合計（§6.11-3）。buff はキャラクターの上方修正を採用しているか
 *  （採用時、ナタ・パステルのアイコンの値は 1/2/3/4。docs/decisions_16） */
export function passedIp(p: PlayerState, buff = false): number {
  const values = buff && p.character === 'ナタ・パステル' ? IP_VALUES_NATA_BUFF : IP_ICONS.map((ic) => ic.value);
  let sum = 0;
  for (const pos of [p.carriage, p.loco]) {
    if (pos === null) continue;
    IP_ICONS.forEach((ic, i) => {
      if (pos > ic.gap) sum += values[i];
    });
  }
  return sum;
}

export function count(state: GameState, p: PlayerState, c: Counter): number {
  switch (c.k) {
    case 'tag':
      return tagCounts(p, isBuffed(state.config, p.character))[c.tag];
    case 'terrain':
      return terrainCount(p, c.kind, c.backOnly);
    case 'bldOn':
      return Object.values(p.hexes).filter((h) => h.building && h.terrain === c.kind).length;
    case 'bld':
      return buildingCount(p, c.type);
    case 'city':
      return cities(p, isBuffed(state.config, p.character)).length;
    case 'rabbit':
      return Object.values(p.hexes).filter((h) => h.rabbit).length;
    case 'played':
      return playedCount(p, c.row);
    case 'auto':
      return automatedCount(p);
    case 'food':
      return p.food;
    case 'score':
      return p.score[c.kind];
    case 'income':
      return p.income[c.res];
    case 'res':
      return c.res === 'diamond' ? p.diamond : p.res[c.res];
  }
}

export function condTimes(state: GameState, p: PlayerState, items: CondItem[]): number {
  return Math.min(...items.map((it) => Math.floor(count(state, p, it.counter) / it.n)));
}

/** 色ごとの繁栄トラック合計歩数 */
export function prosByColor(p: PlayerState): Record<'O' | 'G' | 'Y', number> {
  const out = { O: 0, G: 0, Y: 0 };
  PROS_TRACKS.forEach((t, i) => (out[t.color] += p.pros[i]));
  return out;
}

/** 産業列の上限（§6.9 オートメーション化） */
/** 産業列のオートメーション化の上限。buff はキャラクターの上方修正を採用しているか（カルメン・メロは各列+1） */
export function rowCapacity(p: PlayerState, row: Row, buff = false): number {
  const b = row === 'agr' ? 'tent' : row === 'for' ? 'house' : 'bldg';
  const t = p.taken[b];
  let cap = 1 + (t >= 2 ? 1 : 0) + (t >= 4 ? 1 : 0);
  if (buff && p.character === 'カルメン・メロ') cap += 1;
  if (p.skills.some((s) => s.adv && s.id === 11)) cap += 1;
  return cap;
}

/** 外周の地形タイル（最終得点計算タイル④） */
export function outerTiles(p: PlayerState): number {
  return Object.keys(p.hexes).filter((k) => {
    const h = p.hexes[k];
    if (!h.tile) return false;
    const [r, c] = parseHexKey(k);
    return neighborCoords(r, c).some(([a, b]) => !(hexKey(a, b) in p.hexes));
  }).length;
}

export function maxTerrainKind(p: PlayerState): number {
  return Math.max(...(['W', 'F', 'M', 'S'] as Terrain[]).map((t) => terrainCount(p, t)));
}
