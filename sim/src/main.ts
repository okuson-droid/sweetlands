// パイロットの実行口（sim/PLAN.md §6）。node sim/dist/main.cjs <コマンド> [--オプション 値 ...]
//   run   ：条件 × シードを回して CSV（1局1行）と JSONL（手の列・ラウンドごとの記録）に書く
//   tune  ：重みを CEM で調整する（§6.4）
//   check ：P0 の検査（§6.6）
//   human ：人の基準プレイの記録を再生し、初期状態の一致とマイルストーンを確かめて得点を出す（§6.7）
import { isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import { installFastClone } from '../fastclone';
import { setKeepLog } from './core';
if (!isMainThread && workerData?.fast) installFastClone();
// 等価性の検査で、高速な複製を使わないワーカーはログも空にしない（エンジン本来の動き）
if (!isMainThread && workerData?.worker && !workerData.fast) setKeepLog(true);
import { DEFAULT_AGENT, V2_LADDER, type AgentConfig } from './ai';
import { conditionByName, PILOT_CONDITIONS, TARGET_CHAR } from './core';
import { DEFAULT_WEIGHTS, DEFAULT_WEIGHTS_2, EVAL2_EXTRA, WEIGHT_NAMES, type Weights } from './evaluate';
import { playGame, csvHeader, csvRow, type GameResult } from './play';
import { Pool, type Job } from './pool';
import { CHARACTERS } from '../../src/game/characters';

// ---- 引数 ----
function args(): Record<string, string> {
  const a = process.argv.slice(3);
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 2) out[a[i].replace(/^--/, '')] = a[i + 1];
  return out;
}
function range(spec: string): number[] {
  return spec.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number);
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });
}

export interface WeightFile {
  name: string;
  ai: 'v1' | 'v2';
  weights: Weights;
  names: readonly string[];
  protocol?: Record<string, unknown>;
  history?: unknown[];
}
/** 重みを読む。'default'：第1版の初期値、'default2'：第2版の初期値、'<ファイル>+eval2'：第1版の重みに第2版の初期値を足したもの */
function loadWeights(spec: string | undefined): { name: string; w: Weights } {
  if (!spec || spec === 'default') return { name: 'default', w: [...DEFAULT_WEIGHTS] };
  if (spec === 'default2') return { name: 'default2', w: [...DEFAULT_WEIGHTS_2] };
  const extend = spec.endsWith('+eval2');
  const f = JSON.parse(fs.readFileSync(extend ? spec.slice(0, -6) : spec, 'utf8')) as WeightFile;
  return extend ? { name: `${f.name}+eval2`, w: [...f.weights, ...EVAL2_EXTRA] } : { name: f.name, w: f.weights };
}
function agentConfig(o: Record<string, string>, w: Weights): AgentConfig {
  const rules = { ...DEFAULT_AGENT.rules };
  for (const kv of (o.rules ?? '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    (rules as Record<string, boolean>)[k] = v === '1';
  }
  return {
    ...DEFAULT_AGENT,
    ...(o.ladder ? V2_LADDER[o.ladder as keyof typeof V2_LADDER] : {}),
    kind: (o.ai ?? 'v1') as AgentConfig['kind'],
    weights: w,
    rules,
    ...(o.K ? { determinizations: Number(o.K) } : {}),
    ...(o.beamWidth ? { beamWidth: Number(o.beamWidth) } : {}),
    ...(o.beamDepth ? { beamDepth: Number(o.beamDepth) } : {}),
    ...(o.beamExpand ? { beamExpand: Number(o.beamExpand) } : {}),
    ...(o.template ? { template: o.template } : {}),
    ...(o.templates ? { templates: o.templates.split(',') } : {}),
    ...(o.templateK ? { templateK: Number(o.templateK) } : {}),
  };
}

const FILE = __filename;

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const o = args();
  if (cmd === 'run') return cmdRun(o);
  if (cmd === 'tune') return cmdTune(o);
  if (cmd === 'select') return cmdSelect(o);
  if (cmd === 'check') return (await import('./checks')).cmdCheck(o, FILE);
  if (cmd === 'human') return (await import('./human')).cmdHuman(o);
  console.error('使い方: main.cjs run|tune|check|human --オプション 値 ...');
  process.exit(2);
}

// ---- run ----
async function cmdRun(o: Record<string, string>): Promise<void> {
  const { name: wname, w } = loadWeights(o.weights);
  const cfg = agentConfig(o, w);
  const config = o.config ?? `${cfg.kind}-${wname}`;
  const conds = o.conds === 'all' || !o.conds ? PILOT_CONDITIONS : o.conds.split(',');
  const seeds = range(o.seeds ?? '1-100');
  // AI の乱数：既定は「シードと同じ値」。aiseeds を指定すると各シードをその数だけ回す
  const aiSeeds = o.aiseeds ? range(o.aiseeds) : null;
  const out = o.out ?? 'out/games.csv';
  const jsonl = o.jsonl ?? out.replace(/\.csv$/, '.jsonl');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!fs.existsSync(out)) fs.writeFileSync(out, csvHeader() + '\n');
  // 途中から再開できるように、書き出し済みの局を飛ばす
  const done = new Set(
    fs
      .readFileSync(out, 'utf8')
      .split('\n')
      .slice(1)
      .filter(Boolean)
      .map((l) => l.split(',').slice(0, 5).join(',')),
  );
  const pool = new Pool(Number(o.jobs ?? 4), FILE, o.fast !== '0');
  const jobs: Job[] = [];
  for (const cond of conds)
    for (const seed of seeds)
      for (const aiSeed of aiSeeds ?? [seed]) {
        const key = [cond, seed, config, cfg.kind, aiSeed].join(',');
        if (!done.has(key)) jobs.push({ cond, seed, cfg, aiSeed });
      }
  const t0 = Date.now();
  let n = 0;
  console.log(`${config}: ${jobs.length}局（済み ${done.size}局）`);
  await Promise.all(
    jobs.map((j) =>
      pool.run(j).then((r) => {
        fs.appendFileSync(out, csvRow(r, config) + '\n');
        fs.appendFileSync(jsonl, JSON.stringify({ config, cond: r.cond, seed: r.seed, aiSeed: r.aiSeed, score: r.score, moves: r.moves, rounds: r.rounds, anomalies: r.anomalies, picks: r.picks }) + '\n');
        n++;
        if (n % 20 === 0 || n === jobs.length) console.log(`  ${n}/${jobs.length}  ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
      }),
    ),
  );
  await pool.close();
}

// ---- tune（CEM） ----
async function cmdTune(o: Record<string, string>): Promise<void> {
  const ai = (o.ai ?? 'v1') as 'v1' | 'v2';
  const band = o.band ?? 'A';
  const bandStart = band === 'A' ? 10001 : 20001;
  // 調整に使うシードの先頭（第5版：調整帯 A は 10001〜18999、B は 20001〜28999。調整ごとに重ならないように区切る）
  const seedStart = Number(o.seedStart ?? bandStart);
  const floor = Number(o.floor ?? 0.05);
  const chars = o.chars === 'all' ? Object.keys(CHARACTERS) : [TARGET_CHAR];
  const init = loadWeights(o.init);
  const iters = Number(o.iters ?? 15);
  const pop = Number(o.pop ?? 16);
  const elite = Number(o.elite ?? 4);
  const games = Number(o.games ?? 8);
  const sigmaFrac = Number(o.sigma ?? 0.5);
  const seed0 = Number(o.rngseed ?? bandStart);
  const out = o.out!;
  const dim = init.w.length;
  let mean = [...init.w];
  let sigma = mean.map((x) => sigmaFrac * Math.max(Math.abs(x), 0.2));
  // 候補の生成に使う乱数（シードで決める）
  let t = seed0 >>> 0;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const pool = new Pool(Number(o.jobs ?? 4), FILE);
  const history: unknown[] = [];
  const protocol = { method: 'CEM', ai, band, seedStart, sigmaFloor: floor, ladder: o.ladder ?? 'M', chars: o.chars === 'all' ? 'all14' : 'target', iters, pop, elite, games, sigmaFrac, init: init.name, rngseed: seed0, objective: 'mean final score (milestones/final tiles excluded)', meanCandidate: 'iteration mean is always evaluated as candidate 0' };
  const ladder = o.ladder ? V2_LADDER[o.ladder as keyof typeof V2_LADDER] : {};
  const t0 = Date.now();
  let bestEver = { score: -Infinity, w: mean };
  for (let it = 0; it < iters; it++) {
    // 同じ反復の候補は、同じシード・同じキャラクターで比べる（共通乱数）
    const seeds = Array.from({ length: games }, (_, g) => seedStart + it * games + g);
    const cands: Weights[] = [mean.map((m) => m)];
    while (cands.length < pop) cands.push(mean.map((m, i) => m + sigma[i] * gauss()));
    const scores = await Promise.all(
      cands.map(async (w) => {
        const rs = await Promise.all(seeds.map((seed, g) => pool.run({ cond: 'A', char: chars[(it * games + g) % chars.length], seed, cfg: { ...DEFAULT_AGENT, ...ladder, kind: ai, weights: w }, aiSeed: seed })));
        return rs.reduce((a, r) => a + r.score, 0) / rs.length;
      }),
    );
    const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
    const el = order.slice(0, elite).map((i) => cands[i]);
    if (scores[order[0]] > bestEver.score) bestEver = { score: scores[order[0]], w: cands[order[0]] };
    mean = Array.from({ length: dim }, (_, i) => el.reduce((a, w) => a + w[i], 0) / elite);
    sigma = Array.from({ length: dim }, (_, i) => Math.max(floor, Math.sqrt(el.reduce((a, w) => a + (w[i] - mean[i]) ** 2, 0) / elite)));
    // 最終選考（select）のため、反復ごとの上位2候補の重みも残す
    const top = order.slice(0, 2).map((i) => ({ score: scores[i], weights: cands[i] }));
    const rec = { it, seeds: [seeds[0], seeds[seeds.length - 1]], meanScoreOfMeanCand: scores[0], best: scores[order[0]], eliteMean: order.slice(0, elite).reduce((a, i) => a + scores[i], 0) / elite, top, sec: Math.round((Date.now() - t0) / 1000) };
    history.push(rec);
    console.log(JSON.stringify({ ...rec, top: rec.top.map((x) => x.score) }));
    const f: WeightFile = { name: path.basename(out, '.json'), ai, weights: mean, names: WEIGHT_NAMES, protocol, history };
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(f, null, 1));
  }
  await pool.close();
}

// ---- select：最終選考（第5版 §6.4） ----
// 調整の最終の平均の重みと、最後の数反復の上位候補（合わせて最大 n 本）を、最終選考帯で同じシードの集合で回して比べ、最良を採る
async function cmdSelect(o: Record<string, string>): Promise<void> {
  const f = JSON.parse(fs.readFileSync(o.weights!, 'utf8')) as Omit<WeightFile, 'history'> & { history: { it: number; top: { score: number; weights: Weights }[] }[] };
  const lastIters = Number(o.lastIters ?? 3);
  const n = Number(o.n ?? 5);
  const games = Number(o.games ?? 50);
  const seedStart = Number(o.seedStart!);
  const chars = o.chars === 'all' ? Object.keys(CHARACTERS) : [TARGET_CHAR];
  const ladder = o.ladder ? V2_LADDER[o.ladder as keyof typeof V2_LADDER] : {};
  const pool = new Pool(Number(o.jobs ?? 4), FILE);
  const recent = f.history.slice(-lastIters).flatMap((h) => h.top.map((x) => ({ from: `反復${h.it}の上位（調整中の値 ${x.score.toFixed(2)}）`, score: x.score, weights: x.weights })));
  recent.sort((a, b) => b.score - a.score);
  const cands = [{ from: '最終の平均', weights: f.weights }, ...recent.slice(0, n - 1).map((x) => ({ from: x.from, weights: x.weights }))];
  const seeds = Array.from({ length: games }, (_, g) => seedStart + g);
  const results = [];
  for (const c of cands) {
    const rs = await Promise.all(seeds.map((seed, g) => pool.run({ cond: 'A', char: chars[g % chars.length], seed, cfg: { ...DEFAULT_AGENT, ...ladder, kind: f.ai, weights: c.weights }, aiSeed: seed })));
    const sc = rs.map((r) => r.score);
    const m = sc.reduce((a, b) => a + b, 0) / sc.length;
    results.push({ from: c.from, mean: m, scores: sc });
    console.log(JSON.stringify({ from: c.from, mean: m }));
  }
  await pool.close();
  const best = results.reduce((a, b) => (b.mean > a.mean ? b : a));
  const chosen = cands[results.indexOf(best)];
  const outFile = o.out!;
  const g: WeightFile & { selection?: unknown } = { ...f, name: path.basename(outFile, '.json'), weights: chosen.weights, selection: { seeds: [seeds[0], seeds[seeds.length - 1]], chars: o.chars === 'all' ? 'all14' : 'target', games, chosen: best.from, results: results.map((r) => ({ from: r.from, mean: r.mean })) } };
  fs.writeFileSync(outFile, JSON.stringify(g, null, 1));
}

export type { GameResult };

// ---- ワーカー／本体の振り分け（定義をすべて読み込んだあとに行う） ----
if (!isMainThread && workerData?.worker) {
  parentPort!.on('message', (job: Job) => {
    try {
      parentPort!.postMessage(playGame(conditionByName(job.cond, job.char ?? TARGET_CHAR), job.seed, job.cfg, job.aiSeed));
    } catch (e) {
      parentPort!.postMessage({ error: `${(e as Error).message}（${job.cond} seed=${job.seed}）\n${(e as Error).stack}` });
    }
  });
} else if (isMainThread) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

