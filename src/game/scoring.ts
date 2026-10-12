// マイルストーンと最終得点計算（rules §7.3, §9, §12.10, §12.11）
import { FINAL_TILES, PORT_VP, PROS_TRACKS } from './boards';
import {
  automatedCount,
  buildingCount,
  connectedPorts,
  maxTerrainKind,
  outerTiles,
  playedCount,
  prosByColor,
  tagCounts,
  terrainCount,
} from './queries';
import type { GameState, PlayerState } from './types';

export function checkMilestone(s: GameState, p: PlayerState, key: string): boolean {
  switch (key) {
    case '1a':
      return terrainCount(p, 'W') + terrainCount(p, 'S') >= 10;
    case '1b':
      return terrainCount(p, 'F') + terrainCount(p, 'M') >= 10;
    case '2a':
      return buildingCount(p) >= 5;
    case '2b':
      return connectedPorts(p) >= 2;
    case '3a':
      return p.food >= 7;
    case '3b':
      return p.wonders >= 2;
    case '4a':
      return playedCount(p) >= 6;
    case '4b':
      return tagCounts(p).ショートケーキ >= 4;
    case '5a':
      return p.income.gold >= 30;
    case '5b': {
      const c = prosByColor(p);
      return Math.max(c.O, c.G, c.Y) >= 5;
    }
    case '6a':
      return Math.max(p.carriage, p.loco ?? 0) >= 8;
    case '6b':
      return p.score.vp >= 15;
  }
  return false;
}

/** 繁栄トラック i の勝利点（§6.8「繁栄トラックと最終得点」） */
export function prosVp(p: PlayerState, i: number): number {
  const tr = PROS_TRACKS[i];
  const pos = p.pros[i];
  if (pos === 0) return 0;
  const seg = pos >= tr.length ? 2 : pos <= tr.seg1End ? 0 : 1;
  const [per, vp] = tr.rates[seg];
  return Math.floor(prosBase(p, i) / per) * vp;
}

function prosBase(p: PlayerState, i: number): number {
  switch (i) {
    case 0:
      return terrainCount(p, 'any');
    case 1:
      return Object.values(p.hexes).filter((h) => h.rabbit).length;
    case 2:
      return p.roads.length;
    case 3:
      return buildingCount(p);
    case 4:
      return automatedCount(p);
    default:
      return p.score.ip;
  }
}

export function finalMetric(p: PlayerState, tileId: number): number {
  switch (tileId) {
    case 1:
      return maxTerrainKind(p);
    case 2:
      return Math.max(p.income.wheat, p.income.wood, p.income.iron);
    case 3:
      return automatedCount(p);
    default:
      return outerTiles(p);
  }
}

export interface ScoreBreakdown {
  seat: number;
  name: string;
  items: { label: string; vp: number }[];
  total: number;
  rabbits: number;
  rank: number;
}

export function finalScores(s: GameState): ScoreBreakdown[] {
  const rows: ScoreBreakdown[] = s.players.map((p) => {
    const items: { label: string; vp: number }[] = [];
    items.push({ label: 'ゲーム中の勝利点', vp: p.score.vp });
    PROS_TRACKS.forEach((tr, i) => items.push({ label: `繁栄（${tr.label}）`, vp: prosVp(p, i) }));
    items.push({ label: '都市点×2', vp: p.score.cp * 2 });
    const rabbits = Object.values(p.hexes).filter((h) => h.rabbit).length;
    // 表は行ごとに全員の値を並べるため、条件を満たさない人の行も 0 点として必ず入れ、行の並びと見出しを全員でそろえる
    items.push({ label: 'テント駒5個：クッキーラビット駒×2', vp: p.taken.tent >= 5 ? rabbits * 2 : 0 });
    items.push({ label: '家駒5個：都市点×1', vp: p.taken.house >= 5 ? p.score.cp : 0 });
    items.push({ label: 'ビル駒5個：工業点×1', vp: p.taken.bldg >= 5 ? p.score.ip : 0 });
    items.push({ label: 'ゴールド5につき1', vp: Math.floor(p.res.gold / 5) });
    items.push({ label: 'ダイヤ', vp: p.diamond });
    items.push({ label: '接続している港', vp: PORT_VP[connectedPorts(p)] });
    items.push({ label: 'マイルストーン', vp: 10 * s.milestones.filter((m) => m.takenBy === p.seat).length });
    return { seat: p.seat, name: p.name, items, total: 0, rabbits, rank: 0 };
  });
  // 最終得点計算タイル（中立スコアの仮想プレイヤーも順位付けに参加し、得点だけしない）
  for (const tid of s.finalTiles) {
    const def = FINAL_TILES.find((f) => f.id === tid)!;
    const entries = s.players.map((p) => ({ seat: p.seat as number | null, v: finalMetric(p, tid) }));
    entries.push({ seat: null, v: def.neutral });
    const values = [...new Set(entries.map((e) => e.v))].sort((a, b) => b - a);
    const first = entries.filter((e) => e.v === values[0]);
    const awards = new Map<number, number>();
    first.forEach((e) => e.seat !== null && awards.set(e.seat, 15));
    if (first.length === 1 && values.length > 1)
      entries.filter((e) => e.v === values[1]).forEach((e) => e.seat !== null && awards.set(e.seat, 7));
    rows.forEach((r) => r.items.push({ label: `最終得点計算：${def.label}`, vp: awards.get(r.seat) ?? 0 }));
  }
  rows.forEach((r) => (r.total = r.items.reduce((a, b) => a + b.vp, 0)));
  const sorted = [...rows].sort((a, b) => b.total - a.total || b.rabbits - a.rabbits);
  rows.forEach((r) => (r.rank = 1 + sorted.filter((x) => x.total > r.total || (x.total === r.total && x.rabbits > r.rabbits)).length));
  return rows;
}
