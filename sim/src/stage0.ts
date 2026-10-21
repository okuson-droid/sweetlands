// 段階0（計画書追補 2026-10-20 §4）の検査と診断
//   handover：人の記録を各ラウンドの最初の手番の選択待ちまで再生し、そこから AI に打たせる（0-2）
//   cards：市民カード207枚を中盤の局面でプレイし、v1 の方法で解決した前後の差分を出す（0-3。cardcheck.ts）
//   loss：第5ラウンドの末尾の損な両替の局面で、各手の評価値と特徴量の寄与を出す（0-4）
// 使い方：node dist/stage0.cjs handover|cards --weights <重み.json> [--chain 0|1] [--out <csv>]
import { installFastClone } from '../fastclone';
installFastClone();
import fs from 'node:fs';
import path from 'node:path';
import { createGame } from '../../src/game/engine';
import { CARDS } from '../../src/game/cards';
import type { GameState } from '../../src/game/types';
import { cardEffectCheck } from './cardcheck';
import { Agent, DEFAULT_AGENT, type AgentConfig } from './ai';
import { conditionByName, legal, newGame, scoreTotal, step } from './core';

function args(): Record<string, string> {
  const a = process.argv.slice(3);
  const o: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  return o;
}

const o = args();
const weights = JSON.parse(fs.readFileSync(o.weights ?? 'reports/pilot/weights/v1_eri_B.json', 'utf8')).weights;
const cfg: AgentConfig = { ...DEFAULT_AGENT, kind: 'v1', weights, chainSub: o.chain !== '0', ...(o.eval === '3' ? { evalVersion: 3 as const } : {}) };
const record = JSON.parse(fs.readFileSync(o.record ?? 'reports/pilot/human/seed1.json', 'utf8'));

/** 記録を、round ラウンドの最初の手番の選択待ちまで再生する */
function replayTo(round: number): GameState {
  let s = createGame(record.config, record.seed);
  for (const id of record.moves) {
    if (s.phase === 'action' && s.round === round && s.pending?.step === 'turn') return s;
    s = step(s, id);
  }
  throw new Error(`第${round}ラウンドの手番に届かない`);
}

/** 局面から AI に終局まで打たせる */
function playOut(s: GameState, aiSeed: number): GameState {
  const agent = new Agent(cfg, aiSeed);
  let n = 0;
  while (s.pending && !s.finished) {
    if (++n > 3000) throw new Error('手数が多すぎる');
    s = step(s, agent.choose(s));
  }
  return s;
}

function write(out: string, rows: string[]): void {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rows.join('\n') + '\n');
  console.log(`→ ${out}`);
}

function cmdHandover(): void {
  const rows = ['round,aiSeed,chain,score,ms'];
  for (const round of [2, 3, 4, 5]) {
    const start = replayTo(round);
    const p = start.players[0];
    console.log(`第${round}R の頭：得点 ${scoreTotal(start)}、収入 ${JSON.stringify(p.income)}、繁栄 ${p.pros.join(',')}`);
    for (let aiSeed = 1; aiSeed <= 5; aiSeed++) {
      const t0 = performance.now();
      const end = playOut(start, aiSeed);
      const ms = Math.round(performance.now() - t0);
      rows.push([round, aiSeed, cfg.chainSub ? 1 : 0, scoreTotal(end), ms].join(','));
      console.log(`  AI乱数 ${aiSeed}: ${scoreTotal(end)}点（${ms}ms）`);
    }
  }
  write(o.out ?? 'out/stage0/handover.csv', rows);
}

/** 0-4：jsonl の局を再生し、第5ラウンドの最後の fa3 の連続が始まる局面で、各手の評価値と特徴量の寄与を出す */
function cmdLoss(): void {
  const seed = Number(o.seed ?? 3);
  const line = fs
    .readFileSync(o.jsonl ?? 'out/regress/games.jsonl', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .find((d) => d.seed === seed);
  const moves: string[] = line.moves;
  // 第5ラウンドの手番の手のうち、パスの直前から遡って fa3・fa6 が続く区間の先頭
  let s = newGame(conditionByName('A'), seed);
  const states: { s: GameState; id: string }[] = [];
  for (const id of moves) {
    if (s.round === 5 && s.pending?.step === 'turn') states.push({ s, id });
    s = step(s, id);
  }
  let i = states.length - 1;
  while (i > 0 && ['fa3', 'fa6'].includes(states[i - 1].id)) i--;
  const at = states[i].s;
  const agent = new Agent(cfg, seed);
  const p = at.players[0];
  console.log(`seed ${seed} 第5ラウンド：局面の得点 ${scoreTotal(at)}、資源 ${JSON.stringify(p.res)}、ダイヤ ${p.diamond}、手札 ${p.hand.length}、主行動済み ${at.turnMainDone}`);
  console.log(`実際の手：${states.slice(i).map((x) => x.id).join(' → ')}`);
  for (const opt of legal(at)) {
    const e = agent.explainMove(at, opt.id);
    const parts = Object.entries(e.parts)
      .filter(([, v]) => Math.abs(v) > 0.05)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join('、');
    console.log(`  ${opt.id.padEnd(10)} 評価 ${e.value.toFixed(2)}（得点 ${e.score}）｜${parts}`);
  }
}

function cmdCards(): void {
  const r = cardEffectCheck(cfg, record);
  console.log(`カード ${Object.keys(CARDS).length}枚：プレイできない ${r.unplayable}枚、支払い確認で「支払わない」を選んだ ${r.skippedCards}枚 ${JSON.stringify(r.reasons)}`);
  write(o.out ?? `out/stage0/cards_chain${cfg.chainSub ? 1 : 0}.csv`, r.rows);
}

const cmd = process.argv[2];
if (cmd === 'handover') cmdHandover();
else if (cmd === 'cards') cmdCards();
else if (cmd === 'loss') cmdLoss();
else {
  console.error('使い方: stage0.cjs handover|cards --weights <重み.json> [--chain 0|1] [--out <csv>]');
  process.exit(2);
}
