// 集計：games.csv から報告書（sim/PLAN.md §7）の数値を出す。結果は Markdown の断片と JSON に書く
import fs from 'node:fs';
import { PILOT_CONDITIONS, SCORE_KEYS } from './core';

type Row = Record<string, string>;

export function readCsv(file: string): Row[] {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').trim().split('\n');
  const keys = head.split(',');
  return lines.map((l) => {
    const v = l.split(',');
    return Object.fromEntries(keys.map((k, i) => [k, v[i]]));
  });
}

export const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
export const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1));
};
/** t 分布の 97.5% 点（自由度 df）。小さい標本（人の基準の5局など）で使う */
function t975(df: number): number {
  const table: Record<number, number> = { 1: 12.71, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 15: 2.131, 20: 2.086, 30: 2.042, 60: 2.0 };
  if (df >= 120) return 1.98;
  const ks = Object.keys(table).map(Number);
  const k = ks.filter((x) => x <= df).pop() ?? 1;
  return table[k];
}
export function ci(a: number[]): [number, number] {
  const m = mean(a);
  const h = (t975(a.length - 1) * sd(a)) / Math.sqrt(a.length);
  return [m - h, m + h];
}
export function quantile(a: number[], q: number): number {
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (pos - lo);
}
export function spearman(x: number[], y: number[]): number {
  const rank = (a: number[]) => {
    const idx = a.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(a.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(x);
  const ry = rank(y);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < x.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—');

export interface Effect {
  config: string;
  cond: string;
  n: number;
  mean: number;
  lo: number;
  hi: number;
}

/** 条件 cond と基準 base の、同じシード同士の差 */
export function pairedEffect(rows: Row[], config: string, cond: string, base = 'A', seedFilter?: (s: number) => boolean): Effect | null {
  const by = (c: string) => new Map(rows.filter((r) => r.config === config && r.cond === c && (!seedFilter || seedFilter(Number(r.seed)))).map((r) => [r.seed + ':' + r.aiSeed, Number(r.score)]));
  const a = by(cond);
  const b = by(base);
  const d: number[] = [];
  for (const [k, v] of a) if (b.has(k)) d.push(v - b.get(k)!);
  if (d.length < 2) return null;
  const [lo, hi] = ci(d);
  return { config, cond, n: d.length, mean: mean(d), lo, hi };
}

export function summaryTable(rows: Row[], configs: string[], conds: string[]): string {
  const out = ['| 構成 | 条件 | 局数 | 平均 | 標準偏差 | 95%信頼区間 | 中央値 | 最小 | 最大 | 10% | 90% |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const c of configs)
    for (const cond of conds) {
      const a = rows.filter((r) => r.config === c && r.cond === cond).map((r) => Number(r.score));
      if (!a.length) continue;
      const [lo, hi] = ci(a);
      out.push(`| ${c} | ${cond} | ${a.length} | ${f1(mean(a))} | ${f1(sd(a))} | ${f1(lo)}〜${f1(hi)} | ${f1(quantile(a, 0.5))} | ${Math.min(...a)} | ${Math.max(...a)} | ${f1(quantile(a, 0.1))} | ${f1(quantile(a, 0.9))} |`);
    }
  return out.join('\n');
}

export function effectTable(effects: Effect[][], configs: string[]): string {
  const conds = effects[0].map((e) => e.cond);
  const out = [`| 条件 | ${configs.map((c) => `${c}：差の平均（95%信頼区間）`).join(' | ')} |`, `| --- | ${configs.map(() => '---').join(' | ')} |`];
  conds.forEach((cond, i) => {
    out.push(`| ${cond} | ${effects.map((es) => { const e = es[i]; const sig = e.lo > 0 ? ' ＋' : e.hi < 0 ? ' −' : ''; return `${f1(e.mean)}（${f1(e.lo)}〜${f1(e.hi)}）${sig}`; }).join(' | ')} |`);
  });
  return out.join('\n');
}

/** 頑健さの関門（§5.5）：符号の入れ替わりと、P3 の14効果の順位相関 */
export function robustness(effectsByConfig: Map<string, Effect[]>) {
  const configs = [...effectsByConfig.keys()];
  const flips: string[] = [];
  const conds = effectsByConfig.get(configs[0])!.map((e) => e.cond);
  for (const cond of conds) {
    const es = configs.map((c) => effectsByConfig.get(c)!.find((e) => e.cond === cond)!);
    const pos = es.filter((e) => e.lo > 0).map((e) => e.config);
    const neg = es.filter((e) => e.hi < 0).map((e) => e.config);
    if (pos.length && neg.length) flips.push(`${cond}（正：${pos.join('・')}／負：${neg.join('・')}）`);
  }
  const p3 = conds.filter((c) => c.startsWith('A+adv'));
  const rho: { a: string; b: string; rho: number }[] = [];
  for (let i = 0; i < configs.length; i++)
    for (let j = i + 1; j < configs.length; j++) {
      const x = p3.map((c) => effectsByConfig.get(configs[i])!.find((e) => e.cond === c)!.mean);
      const y = p3.map((c) => effectsByConfig.get(configs[j])!.find((e) => e.cond === c)!.mean);
      rho.push({ a: configs[i], b: configs[j], rho: spearman(x, y) });
    }
  const borderline: string[] = [];
  // 差がまったくない効果（全局で差が0）は境界の結果に数えない
  for (const [c, es] of effectsByConfig) for (const e of es) if (!(e.lo === 0 && e.hi === 0) && ((e.lo >= 0 && e.lo <= 2) || (e.hi <= 0 && e.hi >= -2))) borderline.push(`${c}:${e.cond}`);
  const pass = flips.length === 0 && rho.every((r) => r.rho >= 0.7);
  return { flips, rho, borderline, pass };
}

export function breakdownTable(rows: Row[], configs: string[], cond: string): string {
  const labels: Record<string, string> = { vp: 'ゲーム中の勝利点', pros0: '繁栄：地形タイル', pros1: '繁栄：クッキーラビット駒', pros2: '繁栄：道駒', pros3: '繁栄：建物駒', pros4: '繁栄：オートメーション', pros5: '繁栄：工業点', cp: '都市点×2', tentBonus: 'テント駒5個', houseBonus: '家駒5個', bldgBonus: 'ビル駒5個', gold: 'ゴールド', diamond: 'ダイヤ', ports: '港' };
  const out = [`| 項目 | ${configs.join(' | ')} |`, `| --- | ${configs.map(() => '---').join(' | ')} |`];
  for (const k of SCORE_KEYS) out.push(`| ${labels[k]} | ${configs.map((c) => f1(mean(rows.filter((r) => r.config === c && r.cond === cond).map((r) => Number(r[`s_${k}`]))))).join(' | ')} |`);
  out.push(`| 合計 | ${configs.map((c) => f1(mean(rows.filter((r) => r.config === c && r.cond === cond).map((r) => Number(r.score))))).join(' | ')} |`);
  return out.join('\n');
}

export function actionTable(rows: Row[], configs: string[], cond: string): string {
  const areas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q'];
  const out = [`| 指標 | ${configs.join(' | ')} |`, `| --- | ${configs.map(() => '---').join(' | ')} |`];
  const m = (c: string, k: string) => f1(mean(rows.filter((r) => r.config === c && r.cond === cond).map((r) => Number(r[k] || 0))));
  for (const a of areas) out.push(`| エリア ${a} の使用回数 | ${configs.map((c) => m(c, `area_${a}`)).join(' | ')} |`);
  out.push(`| プレイしたカード数 | ${configs.map((c) => m(c, 'cardsPlayed')).join(' | ')} |`);
  out.push(`| オートメーション数 | ${configs.map((c) => m(c, 'automations')).join(' | ')} |`);
  out.push(`| 手数 | ${configs.map((c) => m(c, 'moves')).join(' | ')} |`);
  const dist = (c: string, k: string, vals: string[]) => {
    const rs = rows.filter((r) => r.config === c && r.cond === cond);
    return vals.map((v) => `${v === '' ? 'なし' : v}:${rs.filter((r) => r[k] === v).length}`).join(' ');
  };
  out.push(`| 時計塔駒を置いたラウンド（局数） | ${configs.map((c) => dist(c, 'clockRound', ['1', '2', '3', '4', '5', ''])).join(' | ')} |`);
  out.push(`| 接続した港の数（局数） | ${configs.map((c) => dist(c, 'ports', ['0', '1', '2', '3', '4'])).join(' | ')} |`);
  return out.join('\n');
}

export function advTable(rows: Row[], configs: string[]): string {
  const p3 = PILOT_CONDITIONS.filter((c) => c.startsWith('A+adv'));
  const out = [`| 上級スキルタイル | ${configs.map((c) => `${c}：取得率（取得ラウンド 1/2/3/4/5）`).join(' | ')} |`, `| --- | ${configs.map(() => '---').join(' | ')} |`];
  for (const cond of p3)
    out.push(
      `| ${cond.replace('A+adv', '')} | ${configs
        .map((c) => {
          const rs = rows.filter((r) => r.config === c && r.cond === cond);
          if (!rs.length) return '—';
          const taken = rs.filter((r) => r.advTaken === '1');
          return `${((taken.length / rs.length) * 100).toFixed(0)}%（${[1, 2, 3, 4, 5].map((k) => taken.filter((r) => r.advRound === String(k)).length).join('/')}）`;
        })
        .join(' | ')} |`,
    );
  return out.join('\n');
}
