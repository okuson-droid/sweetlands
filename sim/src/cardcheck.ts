// カードの効果の検査（計画書追補 2026-10-20 §4 段階0 の 0-3）：市民カード207枚を中盤の局面でプレイし、
// AI の細かい選択の方法で解決した前後の差分を出す。支払い確認（payConfirm）で「支払わない」を選んだものは、
// 支払った場合の連鎖の終わりで実際に何か増えるか（評価で見送った）、何も増えないか（得るものがない）に分ける
import { createGame } from '../../src/game/engine';
import { CARDS } from '../../src/game/cards';
import type { GameRecord } from '../../src/game/history';
import { buildingCount, terrainCount } from '../../src/game/queries';
import type { GameState, PlayerState } from '../../src/game/types';
import { Agent, type AgentConfig } from './ai';
import { legal, scoreTotal, step } from './core';

/** 差分を取る項目 */
export function snapshot(s: GameState): Record<string, number> {
  const p: PlayerState = s.players[0];
  return {
    score: scoreTotal(s),
    gold: p.res.gold,
    wheat: p.res.wheat,
    wood: p.res.wood,
    iron: p.res.iron,
    diamond: p.diamond,
    incGold: p.income.gold,
    incWheat: p.income.wheat,
    incWood: p.income.wood,
    incIron: p.income.iron,
    tiles: terrainCount(p, 'any'),
    flipped: terrainCount(p, 'any', true),
    roads: p.roads.length,
    buildings: buildingCount(p),
    rabbits: Object.values(p.hexes).filter((h) => h.rabbit).length,
    pros: p.pros.reduce((a, b) => a + b, 0),
    food: p.food,
    industry: p.carriage + (p.loco ?? 0),
    automated: p.automated.agr.length + p.automated.for.length + p.automated.min.length,
    hand: p.hand.length,
    played: p.played.length,
    skills: p.skills.length,
  };
}

/** round ラウンドの最初の手番の選択待ちになる直前の局面と、そこで指した手（選択待ちの選択肢は立てた時点で作られるため、
 *  局面を書き換えてから最後の1手を指して、手番の選択肢を作り直させる） */
function replayBefore(record: GameRecord, round: number): { s: GameState; move: string } {
  let s = createGame(record.config, record.seed);
  for (const id of record.moves) {
    const next = step(s, id);
    if (next.phase === 'action' && next.round === round && next.pending?.step === 'turn') return { s, move: id };
    s = next;
  }
  throw new Error(`第${round}ラウンドの手番に届かない`);
}

export function cardEffectCheck(cfg: AgentConfig, record: GameRecord): { rows: string[]; skippedCards: number; reasons: Record<string, number>; unplayable: number } {
  const pre = replayBefore(record, 3);
  const base = step(pre.s, pre.move);
  const keys = Object.keys(snapshot(base));
  const rows = [['card', 'name', 'chain', 'playable', 'payConfirm', 'paySkipped', 'skipReason', 'steps', ...keys.map((k) => `d_${k}`)].join(',')];
  const reasons: Record<string, number> = {};
  let skippedCards = 0;
  let unplayable = 0;
  for (const id of Object.keys(CARDS).sort()) {
    // 中盤の標準的な局面：人のシード1の第3ラウンドの頭に、資源・ダイヤを十分に持たせ、対象のカードを手札に加える
    const s0 = structuredClone(pre.s);
    const p = s0.players[0];
    p.res = { gold: 100, wheat: 20, wood: 20, iron: 20 };
    p.diamond = 10;
    s0.deck = s0.deck.filter((x) => x !== id);
    s0.discard = s0.discard.filter((x) => x !== id);
    p.hand = [id, ...p.hand.filter((x) => x !== id)];
    const s = step(s0, pre.move);
    if (!s.players[0].hand.includes(id)) throw new Error(`${id} が手札にない`);
    const before = snapshot(s);
    const agent = new Agent(cfg, 1);
    if (!legal(s).some((x) => x.id === `play:${id}`)) {
      unplayable++;
      rows.push([id, CARDS[id].nameJa, cfg.chainSub ? 1 : 0, 0, 0, 0, '', 0, ...keys.map(() => '')].join(','));
      continue;
    }
    let t = step(s, `play:${id}`);
    let pay = 0;
    let skipped = 0;
    let reason = '';
    let n = 0;
    while (t.pending && !t.finished && t.pending.step !== 'turn' && t.phase !== 'cleanup') {
      if (++n > 400) throw new Error(`${id} の解決が終わらない`);
      const pick = agent.chooseSub(t, true);
      if (t.pending.step === 'payConfirm') {
        pay++;
        if (pick === 'skip') {
          skipped++;
          // 支払った場合の連鎖の終わりの局面を見て、効果が実際に得られるのに評価で見送ったのか、得るものがないのかを分ける
          const a = agent as unknown as { resolveChain(s: GameState, base: number, st: string): GameState; ev(s: GameState): number; chainDepth: number };
          a.chainDepth = 1;
          const paid = a.resolveChain(step(t, 'pay'), t.queue.length, 'payConfirm');
          const kept = step(t, 'skip');
          a.chainDepth = 0;
          const sp = snapshot(paid);
          const sk = snapshot(kept);
          const gained = ['score', 'incGold', 'incWheat', 'incWood', 'incIron', 'tiles', 'roads', 'buildings', 'rabbits', 'pros', 'food', 'industry', 'automated'].filter((k) => sp[k] > sk[k]);
          reason = gained.length === 0 ? '得るものがない' : `評価で見送り（${gained.join('・')}、評価差 ${(a.ev(paid) - a.ev(kept)).toFixed(2)}）`;
          reasons[gained.length === 0 ? '得るものがない' : '評価で見送り'] = (reasons[gained.length === 0 ? '得るものがない' : '評価で見送り'] ?? 0) + 1;
        }
      }
      t = step(t, pick);
    }
    if (skipped > 0) skippedCards++;
    const after = snapshot(t);
    rows.push([id, CARDS[id].nameJa, cfg.chainSub ? 1 : 0, 1, pay, skipped, reason, n, ...keys.map((k) => after[k] - before[k])].join(','));
  }
  return { rows, skippedCards, reasons, unplayable };
}

