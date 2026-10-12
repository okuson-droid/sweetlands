// 局の記録（初期シードと手の列）を JSON ファイルとして書き出す。シミュレーターの人の基準プレイ（sim/PLAN.md §6.7）で使う
import type { GameRecord } from '../game/history';

export function downloadRecord(record: GameRecord): void {
  const blob = new Blob([JSON.stringify(record)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  a.href = url;
  a.download = `sweetlands_seed${record.seed}_${record.moves.length}moves_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
