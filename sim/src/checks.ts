// P0 の検査（sim/PLAN.md §6.6）：決定性・等価性・情報漏れ・マイルストーン。異常系は本測定の CSV からも数える
import fs from 'node:fs';
import path from 'node:path';
import { Agent, DEFAULT_AGENT, type AgentConfig } from './ai';
import { Rng, conditionByName, forcedSetupMove, newGame, step } from './core';
import { DEFAULT_WEIGHTS } from './evaluate';
import type { GameResult } from './play';
import { Pool, type Job } from './pool';

function same(a: GameResult, b: GameResult): string | null {
  if (a.moves.length !== b.moves.length || a.moves.some((m, i) => m !== b.moves[i])) {
    const i = a.moves.findIndex((m, k) => m !== b.moves[k]);
    return `手の列が ${i} 手目で違う（${a.moves[i]} / ${b.moves[i]}）`;
  }
  if (a.score !== b.score) return `最終得点が違う（${a.score} / ${b.score}）`;
  if (JSON.stringify(a.breakdown) !== JSON.stringify(b.breakdown)) return '得点の内訳が違う';
  return null;
}

export async function cmdCheck(o: Record<string, string>, file: string): Promise<void> {
  const w = o.weights ? JSON.parse(fs.readFileSync(o.weights, 'utf8')).weights : DEFAULT_WEIGHTS;
  const kinds = (o.ai ?? 'v1').split(',') as AgentConfig['kind'][];
  const n = Number(o.games ?? 30);
  const report: Record<string, unknown> = {};

  for (const kind of kinds) {
    const cfg: AgentConfig = { ...DEFAULT_AGENT, kind, weights: w };
    const jobs: Job[] = Array.from({ length: n }, (_, i) => ({ cond: i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B2' : 'A+adv5', seed: 1 + i, cfg, aiSeed: 1000 + i }));
    // 2. 決定性：同じ版・同じシード・同じ AI 乱数で2回
    const fast = new Pool(4, file, true);
    const r1 = await Promise.all(jobs.map((j) => fast.run(j)));
    const r2 = await Promise.all(jobs.map((j) => fast.run(j)));
    await fast.close();
    const detFail = r1.map((a, i) => same(a, r2[i])).filter(Boolean);
    // 3. 等価性：structuredClone のまま（ログも残す）の版と、高速な複製＋ログを空にする版
    const slow = new Pool(4, file, false);
    const r3 = await Promise.all(jobs.map((j) => slow.run(j)));
    await slow.close();
    const eqFail = r1.map((a, i) => same(a, r3[i])).filter(Boolean);
    const msFast = r1.reduce((a, r) => a + r.ms, 0) / n;
    const msSlow = r3.reduce((a, r) => a + r.ms, 0) / n;
    // 1・5. 異常系とマイルストーン
    const anomalies = r1.flatMap((r) => r.anomalies.map((x) => `${r.cond} seed=${r.seed}: ${x}`));
    const milestones = r1.reduce((a, r) => a + r.milestoneMoves, 0);
    report[kind] = { games: n, determinism: { fail: detFail.length, detail: detFail.slice(0, 3) }, equivalence: { fail: eqFail.length, detail: eqFail.slice(0, 3), msFastClone: Math.round(msFast), msStructuredClone: Math.round(msSlow) }, anomalies, milestoneMoves: milestones };
    console.log(kind, JSON.stringify(report[kind]));
  }

  // 4. 情報漏れ：判断の直前に、市民デッキの残りを別の並びに差し替えても、同じ判断になるか
  {
    const cfg: AgentConfig = { ...DEFAULT_AGENT, kind: 'v1', weights: w };
    let decisions = 0;
    let diffs = 0;
    const games = Number(o.leakGames ?? 3);
    for (let g = 0; g < games; g++) {
      const cond = conditionByName('A');
      let s = newGame(cond, 1 + g);
      const player = new Agent(cfg, 77 + g);
      const shuffleRng = new Rng(999 + g);
      let k = 0;
      while (s.pending && !s.finished && k < Number(o.leakMoves ?? 120)) {
        const forced = forcedSetupMove(s, cond);
        if (!forced) {
          const seedA = 5000 + k;
          const a = new Agent(cfg, seedA).choose(s);
          const t = structuredClone(s);
          for (let i = t.deck.length - 1; i > 0; i--) {
            const j = shuffleRng.int(i + 1);
            [t.deck[i], t.deck[j]] = [t.deck[j], t.deck[i]];
          }
          t.rng = (t.rng * 7 + 12345) >>> 0;
          const b = new Agent(cfg, seedA).choose(t);
          decisions++;
          if (a !== b) diffs++;
        }
        const id = forced ?? player.choose(s);
        s = step(s, id);
        k++;
      }
    }
    report.leak = { decisions, diffs };
    console.log('leak', JSON.stringify(report.leak));
  }
  const out = o.out ?? 'out/checks.json';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 1));
}
