// 調査用：市民カード207枚について、データの文面（main_text・auto_text）と、アイコン表記（main_icons・auto_icons）をエンジンが解釈した結果（describe）を並べて出す。
// 監査（文面 ↔ データ ↔ 実装の突き合わせ）の材料にする。
import fs from 'node:fs';
import { CARDS, CARD_IDS } from '../../src/game/cards';
import { describe } from '../../src/game/engine';
import raw from '../../src/data/citizen_cards.json';
const rawById = Object.fromEntries((raw as { id: string; main_icons: string; auto_icons: string | null; notes: string | null; verify: unknown[] }[]).map((c) => [c.id, c]));
const out: string[] = [];
for (const id of CARD_IDS) {
  const c = CARDS[id];
  const r = rawById[id];
  out.push(`## ${id} ${c.nameJa}（${c.nameEn}）｜${c.type === 'pass' ? 'パス時' : '即時'}｜コスト${c.cost}${c.brownie ? '（ブラウニー割引）' : ''}｜タグ ${JSON.stringify(c.tags)}｜産業 ${c.industry ?? 'なし'}`);
  out.push(`- 文面（主）: ${c.mainText}`);
  out.push(`- アイコン（主）: ${r.main_icons}`);
  out.push(`- 実装の解釈（主）: ${describe(c.main)}`);
  out.push(`- 構造（主）: ${JSON.stringify(c.main)}`);
  if (c.type !== 'pass') {
    out.push(`- 文面（オート）: ${c.autoText ?? 'なし'}`);
    out.push(`- アイコン（オート）: ${r.auto_icons ?? 'なし'}`);
    out.push(`- 実装の解釈（オート）: ${c.auto ? describe(c.auto) : 'なし'}`);
    out.push(`- 構造（オート）: ${JSON.stringify(c.auto)}`);
  }
  if (r.notes) out.push(`- メモ: ${r.notes}`);
  if (r.verify && (r.verify as unknown[]).length) out.push(`- 要確認: ${JSON.stringify(r.verify)}`);
  out.push('');
}
fs.writeFileSync(process.argv[2] ?? 'out/cardaudit.md', out.join('\n'));
console.log('書いた', process.argv[2] ?? 'out/cardaudit.md', CARD_IDS.length, '枚');
