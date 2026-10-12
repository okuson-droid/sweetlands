// シミュレーション専用：structuredClone を、プレーンなデータ専用の高速な深いコピーに差し替える。
// GameState は JSON 相当のデータ（オブジェクト・配列・数値・文字列・真偽値・null・undefined）だけから成る。
function clone(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = clone(v[i]);
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const k in v as Record<string, unknown>) out[k] = clone((v as Record<string, unknown>)[k]);
  return out;
}
export function installFastClone(): void {
  (globalThis as { structuredClone: unknown }).structuredClone = clone;
}
export const fastClone = clone as <T>(v: T) => T;
