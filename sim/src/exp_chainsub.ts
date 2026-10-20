// 実験（Cowork 2026-10-20）：細かい選択のうち効果が次の選択待ちで現れるもの（道駒・建物駒の置き場所・支払い確認・オートメーション化）を「連鎖の終わりまで解決して評価」に変えた v1 の得点を測る（計画書追補 §4 段階0 の 0-1 の見込み）。
// 使い方：node build.mjs exp_chainsub && node dist/exp_chainsub.cjs chain <from> <to>（base を渡すと元の v1）。結果は out/exp_chainsub_<mode>_<from>-<to>.csv
import fs from 'node:fs';
import { Agent, DEFAULT_AGENT } from './ai';
import { playGame } from './play';
import { step, legal } from './core';
import type { GameState } from '../../src/game/types';
const proto: any = Agent.prototype;
const origChooseSub = proto.chooseSub;
const mode = process.argv[2] ?? 'chain';
const from = Number(process.argv[3] ?? 1), to = Number(process.argv[4] ?? 30);
if (mode === 'chain') {
  proto.chooseSub = function (s: GameState, deep: boolean): string {
    const opts = legal(s);
    if (opts.length === 1) return opts[0].id;
    const st = s.pending!.step;
    if ((deep && (st === 'support' || st === 'passMove')) || st === 'skill') return origChooseSub.call(this, s, deep);
    if (this._chainDepth > 0) return origChooseSub.call(this, s, deep);
    if (!['road', 'bldSpot', 'payConfirm', 'automateOffer'].includes(st)) return origChooseSub.call(this, s, deep);
    this._chainDepth = (this._chainDepth ?? 0) + 1;
    try {
      return this.argmax(opts, (o: any) => this.ev(this.resolve(step(s, o.id)))).id;
    } finally { this._chainDepth--; }
  };
}
const w = JSON.parse(fs.readFileSync('reports/pilot/weights/v1_eri_B.json', 'utf8')).weights;
const cfg: any = { ...DEFAULT_AGENT, kind: 'v1', weights: w };
const cond = { name: 'A', char: 'エリ・マカロン', map: 'A' as const, adv: null };
const rows: string[] = [];
for (let seed = from; seed <= to; seed++) {
  const t0 = performance.now();
  const r: any = playGame(cond, seed, cfg, seed);
  const sec = ((performance.now() - t0) / 1000).toFixed(1);
  rows.push(`${mode},${seed},${r.score},${sec},${JSON.stringify(r.breakdown ?? {})}`);
  console.log(mode, seed, r.score, sec + 's');
}
fs.writeFileSync(`out/exp_chainsub_${mode}_${from}-${to}.csv`, rows.join('\n') + '\n');
