// できない理由の文（ui_design §6.2）。
// 説明であって判定ではない：合法かどうかは getOptions が正で、ここが外れても対局は壊れない。
import { ADV_SKILLS, AREAS, INDUSTRY_END, LAB_GAPS, PROS_TRACKS, RABBIT_POS, ROUND2_AREAS, SKILLS } from './boards';
import { CARDS } from './cards';
import { areaCost, buildingSpots, canLoseCards, cardCost, clockReady } from './engine';
import { canPlaceTerrain, legalRoadEdges } from './queries';
import type { Cost, GameState, PlayerState, Terrain } from './types';

export type ExplainTarget =
  | { k: 'area'; area: string }
  | { k: 'handCard'; card: string }
  | { k: 'hex'; hex: string; holding: 'tile' | 'building' | 'rabbit' | 'clock' | null; tileKind?: Terrain | 'X' }
  | { k: 'edge'; edge: string }
  | { k: 'skill'; id: number; adv: boolean }
  | { k: 'industryMarker'; marker: 'carriage' | 'loco' }
  | { k: 'pros'; track: number }
  | { k: 'free'; slot: string }
  | { k: 'milestone'; idx: number }
  | { k: 'other' };

const RES_NAME: Record<string, string> = { gold: 'ゴールド', wheat: '麦', wood: '木材', iron: '鉄', diamond: 'ダイヤ' };
const TERRAIN_NAME: Record<string, string> = { W: '麦畑', F: '森林', M: '鉱山', S: '海', X: '特殊地形', C: '首都' };
const GENERIC = 'いまはこの操作はできません';

export function explain(s: GameState, viewer: number, el: ExplainTarget): string {
  const pd = s.pending;
  if (!pd) return GENERIC;
  const me = s.players[viewer];
  if (pd.player !== viewer) {
    const who = s.players[pd.player].name;
    return pd.step === 'turn' ? `いまは${who}さんの手番です` : `${who}さんの入力を待っています`;
  }
  const isMain = el.k === 'area' || el.k === 'handCard' || el.k === 'skill';
  if (pd.step === 'turn') {
    if (me.passed) return 'パスしたので、このラウンドはもう手番がありません';
    if (s.turnMainDone && isMain) return 'この手番はもう行動しました。フリーアクションを行うか、手番を終えてください';
  } else if (isMain || el.k === 'free' || el.k === 'milestone') {
    return `いまは「${pd.prompt}」の途中です`;
  }

  switch (el.k) {
    case 'area':
      return explainArea(s, me, el.area);
    case 'handCard':
      return explainCard(s, me, el.card);
    case 'hex':
      return explainHex(s, me, el.hex, el.holding, el.tileKind);
    case 'edge':
      if (me.roads.includes(el.edge)) return 'すでに道駒があります';
      if (!legalRoadEdges(me).includes(el.edge)) return '首都か道駒と点で接する辺にだけ置けます';
      return GENERIC;
    case 'skill': {
      const sk = me.skills.find((x) => x.id === el.id && x.adv === el.adv);
      if (!sk) return 'あなたのスキルタイルではありません';
      const def = el.adv ? ADV_SKILLS[el.id - 1] : SKILLS[el.id - 1];
      if (def.kind !== 'flip') return 'フリップ能力ではありません';
      if (sk.flipped) return 'すでにフリップ済みです';
      return GENERIC;
    }
    case 'industryMarker': {
      const pos = el.marker === 'carriage' ? me.carriage : me.loco;
      if (pos === null) return '機関車駒はまだ得ていません';
      const k = LAB_GAPS.indexOf(pos);
      if (pos < INDUSTRY_END && k >= 0 && me.taken.lab <= k) return '研究所駒の手前で止まっています';
      return GENERIC;
    }
    case 'pros': {
      const tr = PROS_TRACKS[el.track];
      if (me.pros[el.track] >= tr.length) return 'すでに右端です';
      if (me.pros[el.track] + 1 === tr.length && me.diamond < 1) return '右端へ進むにはダイヤが1個必要です';
      return GENERIC;
    }
    case 'free':
      return explainFree(s, me, el.slot);
    case 'milestone': {
      const m = s.milestones[el.idx];
      if (m.takenBy !== null) return `${s.players[m.takenBy].name}さんが獲得済みです`;
      if (s.milestonesClosed) return 'マイルストーンは3枚獲得されたので、もう獲得できません';
      return 'マイルストーンの条件を満たしていません';
    }
  }
  return GENERIC;
}

function shortage(p: PlayerState, c: Cost): string | null {
  for (const k of ['gold', 'wheat', 'wood', 'iron'] as const) {
    const need = c[k] ?? 0;
    if (need > p.res[k]) return `${RES_NAME[k]}が${need - p.res[k]}個足りません`;
  }
  if ((c.diamond ?? 0) > p.diamond) return `ダイヤが${(c.diamond ?? 0) - p.diamond}個足りません`;
  return null;
}

function explainArea(s: GameState, p: PlayerState, area: string): string {
  const a = s.areas[area];
  if (!a) return 'この人数では使いません';
  const def = AREAS[area];
  if (def.group === 'advanced' && !s.revealed.includes(area)) return `第${ROUND2_AREAS.includes(area) ? 2 : 3}ラウンドから使えます`;
  const slot = a.slots.indexOf(null);
  if (slot < 0) return 'スペースがすべて埋まっています';
  const c = areaCost(s, p, area);
  const lack = shortage(p, { ...c, gold: (c.gold ?? 0) });
  if (lack) return lack;
  const k = slot + 1;
  if (p.discs === 0) {
    const usable = s.round >= 5 ? p.hand.length : p.hand.length - 1;
    if (usable < k) return p.hand.length >= k ? '第1〜4ラウンドは手札を0枚にできません' : `手札が足りません（あと${k - p.hand.length}枚）`;
  }
  if (def.building && buildingSpots(p).length === 0) return '置ける場所がないため実行できません';
  return GENERIC;
}

function explainCard(s: GameState, p: PlayerState, card: string): string {
  if (!p.hand.includes(card)) return GENERIC;
  if (!canLoseCards(s, p, 1)) return '第1〜4ラウンドは手札を0枚にできません';
  const cost = cardCost(s, p, card);
  if (p.res.gold < cost) return `ゴールドが${cost - p.res.gold}足りません（割引後のコスト ${cost}）`;
  return `${CARDS[card].nameJa}はいまプレイできません`;
}

function explainHex(s: GameState, p: PlayerState, key: string, holding: string | null, tileKind?: Terrain | 'X'): string {
  const h = p.hexes[key];
  if (!h) return GENERIC;
  if (holding === 'tile') {
    if (h.terrain === 'C') return '首都には置けません';
    if (h.tile) return 'すでにタイルがあります';
    if (tileKind && tileKind !== h.terrain) return `このヘクスは${TERRAIN_NAME[h.terrain]}です（${TERRAIN_NAME[tileKind]}タイルは置けません）`;
    if (h.terrain !== 'X' && s.terrainSupply[h.terrain as Terrain] <= 0) return 'この種類のタイルが共通サプライに残っていません';
    if (!canPlaceTerrain(p, key, 'any', false)) return '首都か地形タイルに隣接するヘクスにだけ置けます';
    return GENERIC;
  }
  if (holding === 'building' || holding === 'clock') {
    if (h.building) return 'すでに建物駒があります';
    if (h.terrain !== 'C' && !(h.tile && h.tile.flipped)) return '裏向きの地形タイルか首都にだけ置けます';
    return GENERIC;
  }
  if (holding === 'rabbit') {
    if (RABBIT_POS(p.rabbitsTaken) > p.food) return `食料マーカーが${RABBIT_POS(p.rabbitsTaken)}マス目に届いていません`;
    if (!h.building || h.rabbit) return '建物駒があり、クッキーラビット駒がない場所にだけ置けます';
    return GENERIC;
  }
  return GENERIC;
}

function explainFree(s: GameState, p: PlayerState, slot: string): string {
  const basics = p.res.wheat + p.res.wood + p.res.iron;
  switch (slot) {
    case 'fa1':
      if (!canLoseCards(s, p, 1)) return '第1〜4ラウンドは手札を0枚にできません';
      if (basics < 3) return `基礎資源が${3 - basics}個足りません`;
      return '地形タイルも道駒も置ける場所がありません';
    case 'fa2':
      return `ゴールドが${15 - p.res.gold}足りません`;
    case 'fa3':
      return `ゴールドが${4 - p.res.gold}足りません`;
    case 'fa5':
      return '基礎資源がありません';
    case 'fa6':
      return `基礎資源が${3 - basics}個足りません`;
    case 'fa7':
      if (p.discs === 0 && !canLoseCards(s, p, 1)) return '手元のアクションディスクも、捨てられる手札もありません';
      return GENERIC;
    case 'fa8':
      if (p.clockPlaced) return '時計塔駒はもう置きました';
      if (!clockReady(s, p)) return '時計塔駒の条件を満たしていません';
      return '時計塔駒を置ける場所がありません';
  }
  if (p.usedFree.includes(slot)) return 'このラウンドはもう使いました';
  return GENERIC;
}
