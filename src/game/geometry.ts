// 地図の幾何（rules §6.2, §6.3, §12.6）
// ヘクスはダブル列座標 (r, c)。隣接6方向は (r, c±2), (r±1, c±1)。
// 尖った頂点が上を向くヘクス（pointy-top）として頂点・辺を計算する。

export type HexKey = string; // "r,c"
export type VertexKey = string;
export type EdgeKey = string; // 2頂点キーを辞書順に連結

export const hexKey = (r: number, c: number): HexKey => `${r},${c}`;

export function parseHexKey(key: HexKey): [number, number] {
  const [r, c] = key.split(',').map(Number);
  return [r, c];
}

export function neighborCoords(r: number, c: number): [number, number][] {
  return [
    [r, c - 2],
    [r, c + 2],
    [r - 1, c - 1],
    [r - 1, c + 1],
    [r + 1, c - 1],
    [r + 1, c + 1],
  ];
}

const SQRT3 = Math.sqrt(3);
const SIZE = 2 / SQRT3; // 中心から頂点までの距離（横の隣接距離を2とする）

export function hexCenter(r: number, c: number): [number, number] {
  return [c, r * SQRT3];
}

function round3(v: number): string {
  const x = Math.round(v * 1000) / 1000;
  return (Object.is(x, -0) ? 0 : x).toFixed(3);
}

export function hexVertices(r: number, c: number): VertexKey[] {
  const [cx, cy] = hexCenter(r, c);
  const out: VertexKey[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * (30 + 60 * k);
    out.push(`${round3(cx + SIZE * Math.cos(a))}:${round3(cy + SIZE * Math.sin(a))}`);
  }
  return out;
}

export function edgeKey(a: VertexKey, b: VertexKey): EdgeKey {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function hexEdges(r: number, c: number): EdgeKey[] {
  const v = hexVertices(r, c);
  return v.map((x, i) => edgeKey(x, v[(i + 1) % 6]));
}

export function edgeVertices(e: EdgeKey): [VertexKey, VertexKey] {
  const [a, b] = e.split('|');
  return [a, b];
}

/** 2つのヘクス（または仮想ヘクス）が共有する辺。隣接していなければ null。 */
export function sharedEdge(a: [number, number], b: [number, number]): EdgeKey | null {
  const ea = new Set(hexEdges(a[0], a[1]));
  for (const e of hexEdges(b[0], b[1])) if (ea.has(e)) return e;
  return null;
}

export function vertexPoint(v: VertexKey): [number, number] {
  const [x, y] = v.split(':').map(Number);
  return [x, y];
}
