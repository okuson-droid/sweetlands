// シード付き擬似乱数（mulberry32）。状態は GameState.rng に保持する。
export function nextRandom(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) >>> 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, next];
}

export function shuffle<T>(arr: T[], seed: number): [T[], number] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    const [v, ns] = nextRandom(s);
    s = ns;
    const j = Math.floor(v * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return [a, s];
}
