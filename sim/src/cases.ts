// 事例分析（sim/PLAN.md 第5版 §5.5）：人の基準プレイの記録を再生し、人の手番の判断ごとに AI（--ai v1|v2。v2 は中）が選ぶ手と比べる。
// 主行動が分かれた局面を、AI の評価で差が大きいものから各局数件ずつ書き出す（局面の要約、人の手、AI の手、AI の評価値の内訳）。
// node dist/cases.cjs --records a.json,b.json --weights reports/pilot/weights/v2_eri_A.json --out reports/pilot/cases.md
import fs from 'node:fs';
import path from 'node:path';
import { installFastClone } from '../fastclone';
installFastClone();
import type { GameRecord } from '../../src/game/history';
import { createGame } from '../../src/game/engine';
import type { GameState } from '../../src/game/types';
import { Agent, DEFAULT_AGENT, V2_LADDER } from './ai';
import { legal, scoreTotal, step } from './core';

const a = process.argv.slice(2);
const o: Record<string, string> = {};
for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
const weights = JSON.parse(fs.readFileSync(o.weights!, 'utf8')).weights;
const perGame = Number(o.perGame ?? 4);
const kind = (o.ai ?? 'v2') as 'v1' | 'v2';
const cfg = { ...DEFAULT_AGENT, ...V2_LADDER.M, kind, weights };
const label = (s: GameState, id: string) => `${id}｜${s.pending!.options.find((x) => x.id === id)?.label ?? ''}`;
const isMainish = (id: string) => /^(area:|play:|flip:|pass$|fa)/.test(id);
const fmt = (p: Record<string, number>) =>
  Object.entries(p)
    .filter(([, v]) => Math.abs(v) >= 0.05)
    .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
    .map(([k, v]) => `${k} ${v.toFixed(1)}`)
    .join('、');

const out: string[] = [`# 事例分析：人と AI（${kind === 'v2' ? 'v2 中' : 'v1'}）で主行動が分かれた局面`, '', 'AI の評価で「AI の手 − 人の手」の差が大きい局面から、各局で上位を書き出す。評価値は AI の評価関数によるもので、正しさの基準ではない（AI の見落としを探すための材料）。寄与は「重み × 特徴量」（passGain は「いまパスしたら得る得点 × 残りのパスの回数」に重みを掛けたもの）。', ''];
for (const f of (o.records ?? '').split(',').filter(Boolean)) {
  const rec = JSON.parse(fs.readFileSync(f, 'utf8')) as GameRecord;
  let s = createGame(rec.config, rec.seed);
  const cases: { gap: number; text: string[] }[] = [];
  for (let i = 0; i < rec.moves.length; i++) {
    const hm = rec.moves[i];
    if (s.pending?.step === 'turn' && isMainish(hm) && legal(s).length > 1) {
      const am = new Agent(cfg, rec.seed * 1000 + i).choose(s);
      if (am !== hm) {
        const ex = new Agent(cfg, 4242);
        const eh = ex.explainMove(s, hm);
        const ea = new Agent(cfg, 4242).explainMove(s, am);
        const p = s.players[0];
        cases.push({
          gap: ea.value - eh.value,
          text: [
            `### 第${s.round}ラウンド・${i + 1}手目（AI の評価の差 ${(ea.value - eh.value).toFixed(1)}）`,
            '',
            `- 局面：今終わった場合の得点 ${scoreTotal(s)}、G${p.res.gold} 麦${p.res.wheat} 木${p.res.wood} 鉄${p.res.iron} ダイヤ${p.diamond}、収入 G${p.income.gold}/麦${p.income.wheat}/木${p.income.wood}/鉄${p.income.iron}、手札${p.hand.length}枚、ディスク${p.discs}`,
            `- 人の手：${label(s, hm)}（AI の評価 ${eh.value.toFixed(1)}、うち得点 ${eh.score}）`,
            `  - 寄与：${fmt(eh.parts)}`,
            `- AI の手：${label(s, am)}（AI の評価 ${ea.value.toFixed(1)}、うち得点 ${ea.score}）`,
            `  - 寄与：${fmt(ea.parts)}`,
            '',
          ],
        });
      }
    }
    s = step(s, hm);
  }
  cases.sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
  out.push(`## ${path.basename(f)}（シード ${rec.seed}、主行動が分かれた局面 ${cases.length}件のうち上位 ${Math.min(perGame, cases.length)}件）`, '');
  for (const c of cases.slice(0, perGame)) out.push(...c.text);
}
fs.writeFileSync(o.out ?? 'out/cases.md', out.join('\n') + '\n');
console.log('書いた', o.out);
