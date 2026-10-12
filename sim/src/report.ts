// 報告書の数値部分を作る：node dist/report.cjs <計測の出力ディレクトリ> <報告書の出力ディレクトリ>
// 出力：numbers.md（表）、numbers.json（判定に使った数値）、sample_games/（棋譜）、games.csv（生データの写し）
import fs from 'node:fs';
import path from 'node:path';
import { PILOT_CONDITIONS } from './core';
import { actionTable, advTable, bhQ, bootstrapRanks, breakdownTable, ci, effectTable, mean, pairCorrelation, pairedEffect, pairedSd, readCsv, robustness, sd, summaryTable, type Effect } from './analyze';

const [mdir = 'out/measure', rdir = 'reports/pilot'] = process.argv.slice(2);
const rows = readCsv(path.join(mdir, 'games.csv'));
// 頑健さの関門の5構成（第5版 §5.5）と、順位相関を判定に使う4組
const GATE = ['v1-eri-A', 'v1-eri-B', 'v2-S', 'v2-M', 'v2-L'];
const RHO_PAIRS: [string, string][] = [['v1-eri-A', 'v1-eri-B'], ['v1-eri-A', 'v2-M'], ['v2-S', 'v2-M'], ['v2-M', 'v2-L']];
const ALL = [...GATE, 'v1-common-A'];
const JUDGE = 'v2-M';
const effConds = PILOT_CONDITIONS.filter((c) => c !== 'A' && rows.some((r) => r.cond === c));
const out: string[] = [];
const json: Record<string, unknown> = {};
const f1 = (x: number) => x.toFixed(1);

// ---- 異常系 ----
const anomalies = rows.filter((r) => r.anomalies && r.anomalies !== '""');
out.push(`## 異常系（本測定の全 ${rows.length} 局）\n\n異常のあった局：${anomalies.length}局${anomalies.length ? '\n\n' + anomalies.slice(0, 10).map((r) => `- ${r.config} ${r.cond} seed=${r.seed}: ${r.anomalies}`).join('\n') : ''}\n`);
json.anomalies = anomalies.length;

// ---- P0：版の比較 ----
out.push('## P0：版の比較（エリ・マカロン × A面、シード 1〜100）\n');
out.push(summaryTable(rows, ['v0', 'v1-common-A', 'v1-common-B', 'v1-eri-A', 'v1-eri-B', 'v1-eri-A-norules', 'v2-S', 'v2-M', 'v2-L'], ['A']));
const ruleEff = pairedEffect(rows.map((r) => (r.config === 'v1-eri-A-norules' ? { ...r, config: 'cmp', cond: 'X' } : r.config === 'v1-eri-A' && r.cond === 'A' ? { ...r, config: 'cmp' } : r)), 'cmp', 'X', 'A');
if (ruleEff) out.push(`\n決め打ちのフリーアクションを外した版 − 外さない版（v1-eri-A、対の差）：${f1(ruleEff.mean)}（95%信頼区間 ${f1(ruleEff.lo)}〜${f1(ruleEff.hi)}、${ruleEff.n}局）\n`);
json.ruleEffect = ruleEff;

// ---- 条件ごとの最終得点 ----
out.push('## 条件ごとの最終得点\n');
out.push(summaryTable(rows, ALL, PILOT_CONDITIONS));

// ---- P2・P3：対の差と頑健さの関門 ----
const effects = new Map<string, Effect[]>();
for (const c of GATE) effects.set(c, effConds.map((cond) => pairedEffect(rows, c, cond)!));
out.push('\n## P2・P3：基準（A面・上級スキルなし）との対の差\n\n＋／− は 95%信頼区間が0を含まない（有意な）効果。\n');
out.push(effectTable(GATE.map((c) => effects.get(c)!), GATE));
const common = effConds.map((cond) => pairedEffect(rows, 'v1-common-A', cond)!);
out.push('\n共通の重み版（参考）\n');
out.push(effectTable([common], ['v1-common-A']));
const rob = robustness(effects, RHO_PAIRS);
out.push(`\n### 頑健さの関門（第5版）\n\n- 符号の入れ替わり（5構成のどの2つの間でも）：${rob.flips.length}件${rob.flips.length ? '（' + rob.flips.join('、') + '）' : ''}\n- P3 の14効果の順位相関（スピアマン、判定に使う4組）：${rob.rho.map((r) => `${r.a}×${r.b} = ${r.rho.toFixed(2)}`).join('、')}\n- 判定：${rob.pass ? '合格' : '不合格'}\n- 追試の対象（信頼区間の端が0に近い効果）：${rob.borderline.length ? rob.borderline.join('、') : 'なし'}\n`);
out.push(`参考（判定には使わない）\n\n- ケンドールの順位相関：${rob.rho.map((r) => `${r.a}×${r.b} = ${r.tau.toFixed(2)}`).join('、')}\n`);
const p3conds = effConds.filter((c) => c.startsWith('A+adv'));
if (p3conds.length) {
  const lines = ['| 上級スキル | ' + GATE.map((c) => `${c}：順位の95%区間／q 値`).join(' | ') + ' |', '| --- | ' + GATE.map(() => '---').join(' | ') + ' |'];
  const br = new Map(GATE.map((c) => [c, bootstrapRanks(rows, c, p3conds)]));
  const qs = new Map(GATE.map((c) => [c, bhQ(effects.get(c)!.filter((e) => p3conds.includes(e.cond)), (e) => pairedSd(rows, c, e.cond))]));
  for (const cond of p3conds) lines.push(`| ${cond.replace('A+adv', '')} | ${GATE.map((c) => { const r = br.get(c)!.get(cond)!; return `${r[0]}〜${r[1]}位／${qs.get(c)!.get(cond)!.toFixed(3)}`; }).join(' | ')} |`);
  out.push('P3 の14効果の順位のブートストラップ95%区間（シードを単位に1000回）と、Benjamini-Hochberg 法の q 値\n');
  out.push(lines.join('\n'));
}
const rhoCrn = GATE.map((c) => ({ c, rho: pairCorrelation(rows, c, 'A', 'B1') }));
out.push(`\n共通乱数の効き目（A面と B1面の同じシードの得点の相関 ρ）：${rhoCrn.map((x) => `${x.c} ${x.rho.toFixed(2)}`).join('、')}。対の差の分散は条件ごとの分散のおよそ (1−ρ) 倍になる。\n`);
json.crnRho = rhoCrn;
json.robustness = rob;
json.effects = Object.fromEntries([...effects].map(([k, v]) => [k, v]));

// ---- 追試 ----
if (fs.existsSync(path.join(mdir, 'retest.csv'))) {
  const rt = readCsv(path.join(mdir, 'retest.csv'));
  const conds = [...new Set(rt.map((r) => r.cond))].filter((c) => c !== 'A');
  const res = GATE.map((c) => conds.map((cond) => pairedEffect(rt, c, cond)).filter((e): e is Effect => !!e));
  out.push('\n### 追試（シード 101〜200）\n');
  if (conds.length) out.push(effectTable(res, GATE));
  json.retest = res;
}

// ---- P3：取得率 ----
out.push('\n## P3：上級スキルタイルの取得率と取得ラウンド\n');
out.push(advTable(rows, ALL));

// ---- 内訳と行動 ----
out.push('\n## 得点の内訳の平均（A面）\n');
out.push(breakdownTable(rows, ['v0', ...ALL], 'A'));
out.push('\n## 行動の統計（A面、1局あたりの平均）\n');
out.push(actionTable(rows, ['v0', ...ALL], 'A'));

// ---- 調整の雑音・追加調整の寄与 ----
const condA = (c: string) => rows.filter((r) => r.config === c && r.cond === 'A').map((r) => Number(r.score));
const noise = (a: string, b: string) => {
  const x = condA(a);
  const y = condA(b);
  const d = rows.filter((r) => r.config === a && r.cond === 'A').map((r) => Number(r.score) - Number(rows.find((q) => q.config === b && q.cond === 'A' && q.seed === r.seed)?.score ?? NaN)).filter(Number.isFinite);
  const [lo, hi] = ci(d);
  return `${a} ${f1(mean(x))} / ${b} ${f1(mean(y))}、差 ${f1(mean(d))}（対の差の95%信頼区間 ${f1(lo)}〜${f1(hi)}）`;
};
out.push('\n## 調整の雑音と追加調整の寄与（A面）\n');
out.push(`- 調整の雑音（追加調整）：${noise('v1-eri-A', 'v1-eri-B')}`);
out.push(`- 調整の雑音（共通の重み）：${noise('v1-common-A', 'v1-common-B')}`);
out.push(`- 追加調整の寄与（調整帯 A）：${noise('v1-eri-A', 'v1-common-A')}`);

// ---- 時間 ----
out.push('\n## 1局あたりの時間（1コアあたりの秒）\n');
out.push('| 構成 | 平均 | 中央値 | 最大 |\n| --- | --- | --- | --- |');
const times: Record<string, number> = {};
for (const c of ['v0', ...ALL]) {
  const t = rows.filter((r) => r.config === c).map((r) => Number(r.ms) / 1000);
  if (!t.length) continue;
  times[c] = mean(t);
  const s = [...t].sort((a, b) => a - b);
  out.push(`| ${c} | ${f1(mean(t))} | ${f1(s[Math.floor(s.length / 2)])} | ${f1(s[s.length - 1])} |`);
}
json.times = times;

// ---- 強さの関門 ----
const hai = path.join(mdir, 'human_ai.csv');
const hh = path.join(rdir, 'human.csv');
if (fs.existsSync(hai)) {
  const ai = readCsv(hai);
  out.push('\n## 強さの関門：AI 側（シード 1〜5、AI 乱数 1〜5 の平均）\n');
  out.push('| 構成 | ' + [1, 2, 3, 4, 5].map((s) => `シード${s}`).join(' | ') + ' | 平均 |\n| --- | ' + [1, 2, 3, 4, 5].map(() => '---').join(' | ') + ' | --- |');
  const perSeed: Record<string, number[]> = {};
  for (const c of GATE) {
    perSeed[c] = [1, 2, 3, 4, 5].map((s) => mean(ai.filter((r) => r.config === c && Number(r.seed) === s).map((r) => Number(r.score))));
    if (perSeed[c].some((v) => Number.isNaN(v))) continue;
    out.push(`| ${c} | ${perSeed[c].map(f1).join(' | ')} | ${f1(mean(perSeed[c]))} |`);
  }
  json.humanAi = perSeed;
  if (fs.existsSync(hh)) {
    const human = readCsv(hh).filter((r) => r.ok === '1');
    const hs = [1, 2, 3, 4, 5].map((s) => human.find((r) => Number(r.seed) === s));
    if (hs.every(Boolean)) {
      const H = hs.map((r) => Number(r!.score));
      out.push(`\n人の得点：${H.join(' / ')}（平均 ${f1(mean(H))}）\n`);
      for (const c of GATE) {
        const d = perSeed[c].map((v, i) => v - H[i]);
        const [lo, hi] = ci(d);
        const m = mean(d);
        const verdict = m >= 0 ? '合格' : m >= -0.15 * mean(H) ? '条件付き合格' : '不合格';
        out.push(`- ${c}${c === JUDGE ? '（判定に使う構成）' : '（参考）'}：d の平均 ${f1(m)}（95%信頼区間 ${f1(lo)}〜${f1(hi)}）、d の標準偏差 ${f1(sd(d))}、閾値 −0.15×人の平均 = ${f1(-0.15 * mean(H))} → ${verdict}`);
      }
    } else out.push('\n人の基準プレイの記録がまだそろっていない（判定は保留）。\n');
  } else out.push('\n人の基準プレイの記録がまだない（判定は保留）。\n');
}

fs.mkdirSync(rdir, { recursive: true });
fs.writeFileSync(path.join(rdir, 'numbers.md'), out.join('\n') + '\n');
fs.writeFileSync(path.join(rdir, 'numbers.json'), JSON.stringify(json, null, 1));
fs.copyFileSync(path.join(mdir, 'games.csv'), path.join(rdir, 'games.csv'));

// ---- 棋譜 ----
const sdir = path.join(rdir, 'sample_games');
fs.mkdirSync(sdir, { recursive: true });
interface G { config: string; cond: string; seed: number; aiSeed: number; score: number; moves: string[]; rounds: { round: number; actions: string[]; scoreAtEnd: number }[] }
const games: G[] = fs.readFileSync(path.join(mdir, 'games.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const write = (g: G, name: string, note: string) => {
  const lines = [`# 棋譜：${g.config}・${g.cond}・シード ${g.seed}（AI 乱数 ${g.aiSeed}）`, '', note, '', `最終得点：${g.score}（マイルストーン・最終得点計算タイルを除く）`, '', '各ラウンドの主行動と置いた場所、ラウンドの終わりの得点（今ゲームが終わった場合の得点）。「└」はその行動の中の細かい選択。', ''];
  for (const r of g.rounds) lines.push(`## 第${r.round}ラウンド（終わりの得点 ${r.scoreAtEnd}）`, '', ...r.actions.map((a) => `- ${a}`), '');
  lines.push('## 手の列（再生用）', '', '```json', JSON.stringify({ seed: g.seed, moves: g.moves }), '```', '');
  fs.writeFileSync(path.join(sdir, name), lines.join('\n'));
};
for (const c of GATE) {
  const gs = games.filter((g) => g.config === c && g.cond === 'A');
  if (!gs.length) continue;
  const sorted = [...gs].sort((a, b) => a.score - b.score);
  const med = sorted[Math.floor(sorted.length / 2)];
  write(med, `${c}_A_median_seed${med.seed}.md`, `P1（A面）の得点が中央値の局（${gs.length}局中）。`);
  write(sorted[0], `${c}_A_min_seed${sorted[0].seed}.md`, `P1（A面）の得点が最低の局（${gs.length}局中）。`);
}
const hg: G[] = fs.existsSync(path.join(mdir, 'human_ai.jsonl')) ? fs.readFileSync(path.join(mdir, 'human_ai.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
for (const g of hg.filter((x) => x.aiSeed === 1)) write(g, `human_seed${g.seed}_${g.config}.md`, '人の基準プレイと同じシードの AI の棋譜（AI 乱数 1）。');
console.log(`numbers.md を書いた（${rows.length}局）。標準偏差の例：A面 v1-eri-A ${f1(sd(condA('v1-eri-A')))}`);
