// 人の基準プレイ（sim/PLAN.md §6.7）：アプリで書き出した記録（初期シードと手の列）を再生し、
// (1) 初期状態が AI の同じシードの対局と一致すること、(2) マイルストーンを取っていないこと、を確かめてから
// AI と同じ集計で得点を出す。
import fs from 'node:fs';
import path from 'node:path';
import { replay, type GameRecord } from '../../src/game/history';
import { createGame } from '../../src/game/engine';
import { SCORE_KEYS, TARGET_CHAR, breakdown, conditionByName, newGame, pilotConfig } from './core';

export async function cmdHuman(o: Record<string, string>): Promise<void> {
  const files = (o.records ?? '').split(',').filter(Boolean);
  const out = o.out ?? 'out/human.csv';
  const rows: string[] = [['file', 'seed', 'ok', 'problems', 'score', ...SCORE_KEYS.map((k) => `s_${k}`)].join(',')];
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(f, 'utf8')) as GameRecord;
    const problems: string[] = [];
    // 条件：1人・ヴァリアントなし（アプリの ?auto=1&players=1 と同じ設定）
    const want = pilotConfig(false);
    if (rec.config.players !== 1) problems.push(`人数が ${rec.config.players}`);
    for (const [k, v] of Object.entries(want.variants)) if (Boolean((rec.config.variants as Record<string, unknown>)[k]) !== v) problems.push(`ヴァリアント ${k} が違う`);
    // (1) 初期状態：市民デッキの並び・ラウンド支援タイルの配置・スタートプレイヤー
    const h0 = createGame(rec.config, rec.seed);
    const a0 = newGame(conditionByName('A'), rec.seed);
    if (JSON.stringify(h0.deck) !== JSON.stringify(a0.deck)) problems.push('市民デッキの並びが AI の対局と違う');
    if (JSON.stringify(h0.supportTiles) !== JSON.stringify(a0.supportTiles)) problems.push('ラウンド支援タイルの配置が違う');
    if (h0.startPlayer !== a0.startPlayer) problems.push('スタートプレイヤーが違う');
    let s;
    try {
      s = replay(rec);
    } catch (e) {
      problems.push(`記録を再生できない（${(e as Error).message}）`);
      rows.push([path.basename(f), rec.seed, 0, JSON.stringify(problems.join(' / ')).replace(/,/g, '、'), '', ...SCORE_KEYS.map(() => '')].join(','));
      console.log(path.basename(f), rec.seed, problems.join(' / '));
      continue;
    }
    const p = s.players[0];
    if (p.character !== TARGET_CHAR) problems.push(`キャラクターが ${p.character}`);
    if (p.mapId !== 'A') problems.push(`地図が ${p.mapId}`);
    // (2) マイルストーン
    if (s.milestones.some((m) => m.takenBy !== null)) problems.push('マイルストーンを取っている');
    if (!s.finished) problems.push('終局していない');
    const bd = breakdown(s);
    rows.push([path.basename(f), rec.seed, problems.length === 0 ? 1 : 0, JSON.stringify(problems.join(' / ')).replace(/,/g, '、'), bd.total, ...SCORE_KEYS.map((k) => bd[k])].join(','));
    console.log(path.basename(f), rec.seed, problems.length ? problems.join(' / ') : 'OK', bd.total);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, rows.join('\n') + '\n');
}
