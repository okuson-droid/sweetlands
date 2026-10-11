// プレイヤー色と、CSS 変数で持っている演出の時間の読み出し（ui_design §8.1：JS に数字を直書きしない）
export const playerColor = (seat: number) => `var(--p${seat})`;

export function cssMs(name: string, fallback = 200): number {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (Number.isNaN(n)) return fallback;
  return v.endsWith('ms') ? n : n * 1000;
}

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
