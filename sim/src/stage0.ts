// 段階0（計画書追補 2026-10-20 §4）の検査と診断
//   handover：人の記録を各ラウンドの最初の手番の選択待ちまで再生し、そこから AI に打たせる（0-2）
//   cards：市民カード207枚を中盤の局面でプレイし、v1 の方法で解決した前後の差分を出す（0-3。cardcheck.ts）
//   loss：第5ラウンドの末尾の損な両替の局面で、各手の評価値と特徴量の寄与を出す（0-4）
//   r5・trace・r5eval：段階1b・1c の最終ラウンドの計画器の計測（--plan W,E、--twoPly 1、--delta 3、--prefix 1）
//   --peek 1：診断専用。決定化せず実際の山札を見て判断する（情報漏れの規約の例外。測定の構成には使わない）
//   --record：人の記録（既定は human/seed1.json。条件は記録の config のまま使う）
// 使い方：node dist/stage0.cjs handover|cards|loss|r5|trace|r5eval --weights <重み.json> [--chain 0|1] [--out <csv>]
import { installFastClone } from '../fastclone';
installFastClone();
import fs from 'node:fs';
import path from 'node:path';
import { createGame } from '../../src/game/engine';
import { CARDS } from '../../src/game/cards';
import type { GameState } from '../../src/game/types';
import { cardEffectCheck } from './cardcheck';
import { eval3 } from './evaluate3';
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
const cfg: AgentConfig = { ...DEFAULT_AGENT, kind: 'v1', weights, chainSub: o.chain !== '0', ...(o.eval === '3' ? { evalVersion: 3 as const } : {}), ...(o.plan
    ? { planR5: { W: Number(o.plan.split(',')[0]), E: Number(o.plan.split(',')[1]), keepEven: o.keepEven === '1', twoPly: o.twoPly === '1', delta: Number(o.delta ?? 3), prefix: o.prefix === '1' } }
    : {}),
  // 診断専用（段階1c の (a')）：実際の山札を見て判断する。情報漏れの規約の例外で、測定には使わない
  ...(o.peek === '1' ? { peek: true } : {}) };
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
let lastAgent: Agent | null = null;
function playOut(s: GameState, aiSeed: number): GameState {
  const agent = new Agent(cfg, aiSeed);
  lastAgent = agent;
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
  const rows = ['round,aiSeed,chain,score,ms,planNodes'];
  for (const round of (o.rounds ?? '2,3,4,5').split(',').map(Number)) {
    const start = replayTo(round);
    const p = start.players[0];
    console.log(`第${round}R の頭：得点 ${scoreTotal(start)}、収入 ${JSON.stringify(p.income)}、繁栄 ${p.pros.join(',')}`);
    for (let aiSeed = 1; aiSeed <= 5; aiSeed++) {
      const t0 = performance.now();
      const end = playOut(start, aiSeed);
      const ms = Math.round(performance.now() - t0);
      rows.push([round, aiSeed, cfg.chainSub ? 1 : 0, scoreTotal(end), ms, lastAgent!.planStats.nodes].join(','));
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

/** 段階1b の (b)：v1 の自己対戦の局（jsonl の手の列）を第5ラウンドの最初の手番まで再生し、そこから AI（計画器つき）に打ち直させる */
function cmdR5(): void {
  const lines = fs
    .readFileSync(o.jsonl ?? 'out/s0/games.jsonl', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .sort((a, b) => a.seed - b.seed);
  const [from, to] = (o.seeds ?? '1-100').split('-').map(Number);
  const rows = ['seed,original,score,startScore,ms,planNodes,plans'];
  for (const d of lines.filter((x) => x.seed >= from && x.seed <= to)) {
    let s = newGame(conditionByName('A'), d.seed);
    for (const id of d.moves) {
      if (s.phase === 'action' && s.round === 5 && s.pending?.step === 'turn') break;
      s = step(s, id);
    }
    const t0 = performance.now();
    const end = playOut(s, d.seed);
    const ms = Math.round(performance.now() - t0);
    rows.push([d.seed, d.score, scoreTotal(end), scoreTotal(s), ms, lastAgent!.planStats.nodes, lastAgent!.planStats.plans].join(','));
    console.log(`seed ${d.seed}: 元の v1 ${d.score} → ${scoreTotal(end)}（第5Rの頭 ${scoreTotal(s)}、${ms}ms）`);
  }
  write(o.out ?? 'out/s1b/r5.csv', rows);
}

/** 段階1b の (c)：人の記録の第5ラウンドの手番ごとに、人の手が計画器の候補（パスしたら得る得点の順）の何番目か */
function cmdTrace(): void {
  let s = createGame(record.config, record.seed);
  const agent = new Agent(cfg, 1);
  const rows = ['turn,human,rank,candidates,humanScore,humanRankValue,bestScore,best,inE'];
  const E = cfg.planR5?.E ?? 6;
  let turn = 0;
  for (const id of record.moves) {
    if (s.phase === 'action' && s.round === 5 && s.pending?.step === 'turn') {
      turn++;
      const kids = agent.planChildren(s, [], agent.passScore(s));
      const rank = kids.findIndex((k) => k.path[0] === id) + 1;
      const h = kids[rank - 1];
      rows.push([turn, id, rank, kids.length, h ? h.score : '', h ? h.rank : '', kids[0].score, kids[0].path.join(' '), rank > 0 && rank <= E ? 1 : 0].join(','));
      console.log(`手番${turn}：人 ${id}（${rank}/${kids.length}位、${h?.score ?? '-'}点、順位の値 ${h?.rank ?? '-'}）｜最上位 ${kids[0].path.join(' ')}（${kids[0].score}点、順位の値 ${kids[0].rank}）`);
    }
    s = step(s, id);
  }
  write(o.out ?? 'out/s1b/trace.csv', rows);
}

/** 段階1b の報告項目：v1 の局の第5ラウンドの頭の局面での、第3版の評価値（計画器の到達点と並べるため） */
function cmdR5Eval(): void {
  const w3 = JSON.parse(fs.readFileSync(o.v3 ?? 'reports/pilot/weights/v3_eri_A.json', 'utf8')).weights;
  const rows = ['seed,startScore,eval3'];
  for (const l of fs.readFileSync(o.jsonl ?? 'out/s0/games.jsonl', 'utf8').split('\n').filter(Boolean)) {
    const d = JSON.parse(l);
    let s = newGame(conditionByName('A'), d.seed);
    for (const id of d.moves) {
      if (s.phase === 'action' && s.round === 5 && s.pending?.step === 'turn') break;
      s = step(s, id);
    }
    rows.push([d.seed, scoreTotal(s), eval3(s, w3).toFixed(1)].join(','));
  }
  write(o.out ?? 'out/s1b/r5_eval3.csv', rows);
}

const cmd = process.argv[2];
if (cmd === 'handover') cmdHandover();
else if (cmd === 'cards') cmdCards();
else if (cmd === 'loss') cmdLoss();
else if (cmd === 'r5') cmdR5();
else if (cmd === 'trace') cmdTrace();
else if (cmd === 'r5eval') cmdR5Eval();
else {
  console.error('使い方: stage0.cjs handover|cards --weights <重み.json> [--chain 0|1] [--out <csv>]');
  process.exit(2);
}
