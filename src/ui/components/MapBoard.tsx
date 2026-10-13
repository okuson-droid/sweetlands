// 地図ボード（ui_design §4.1, §5.3）。ヘクス・辺・駒を SVG で描く
import { useMemo, useRef, useState } from 'react';
import { edgeVertices, hexCenter, hexVertices, parseHexKey, vertexPoint } from '../../game/geometry';
import { virtualAreas, legalRoadEdges, cities, portStatus } from '../../game/queries';
import { CAPITAL_BONUS, CITY_RATE, LOTUS_CITY_RATE, PORT_VP, TERRAIN_FLIP } from '../../game/boards';
import { Icons, effToks as effToks2 } from '../icons/EffIcons';
import { SPECIAL_TILES } from '../../game/boards';
import type { PlayerState } from '../../game/types';
import { useInteraction, useTarget, useZoomBind } from '../interaction';
import { PieceShape } from './Icons';
import { GlyphAt, type GlyphSpec } from '../icons/Glyph';
import { MAP_ICON } from '../../game/boards';
import { effToks } from '../icons/EffIcons';
import type { Terrain } from '../../game/types';

const FILL: Record<string, [string, string]> = {
  W: ['var(--wheat)', 'var(--wheat-deep)'],
  F: ['var(--forest)', 'var(--forest-deep)'],
  M: ['var(--mine)', 'var(--mine-deep)'],
  S: ['var(--sea)', 'var(--sea-deep)'],
  X: ['url(#p-special-map)', '#b3306f'],
  C: ['var(--capital)', '#c9a43a'],
};
const TERRAIN_NAME: Record<string, string> = { W: '麦畑', F: '森林', M: '鉱山', S: '海', X: '特殊地形', C: '首都' };
const ICON_TEXT: Record<string, [string, string]> = {
  rab: ['兎', 'クッキーラビット駒を1個置く'],
  skill: ['技', 'スキルタイルを1枚得る'],
  terr: ['地', '地形タイルを1枚置く'],
  road: ['道', '道駒を1個置く'],
  pros: ['繁', '繁栄トラックを1歩進める'],
  ind: ['工', '工業トラックを1歩進める'],
  ib: ['産', 'この地形の産業ボーナスを得る'],
  g5: ['5G', '5ゴールドを得る'],
  cp2: ['都2', '2都市点を得る'],
  ip2: ['工2', '2工業点を得る'],
};

function pointsOf(r: number, c: number): string {
  return hexVertices(r, c)
    .map((v) => vertexPoint(v).join(','))
    .join(' ');
}

export function MapBoard({ p, color, flashKeys }: { p: PlayerState; color: string; flashKeys: Set<string> }) {
  const c = useInteraction();
  const [view, setView] = useState(HOME_VIEW);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  // 2本指の拡大縮小（ui_design §22.4）。指ごとの位置と、つまみ始めの距離・表示範囲を持つ
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; v0: typeof HOME_VIEW } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const virtual = useMemo(() => (p.mapId ? virtualAreas(p.mapId) : { ports: [], draws: [] }), [p.mapId]);
  const held = c.held;
  const holding = held?.startsWith('tile:') || held?.startsWith('special:') ? 'tile' : held === 'piece:rabbit' ? 'rabbit' : held === 'piece:clock' ? 'clock' : held?.startsWith('piece:') ? 'building' : null;
  const tileKind = held?.startsWith('tile:') ? (held.slice(5) as 'W') : held?.startsWith('special:') ? 'X' : undefined;
  const roadMode = held === 'road' || [...c.aff.clicks.keys()].some((k) => k.startsWith('edge:'));
  const legalEdges = useMemo(() => (roadMode && c.active ? legalRoadEdges(p) : []), [roadMode, c.active, p]);

  if (!p.mapId) return <div className="empty">地図ボードはまだ選ばれていません</div>;

  /** 表示範囲を k 倍にする。画面上の点 (cx, cy) の位置を動かさない */
  const zoomAt = (v: typeof HOME_VIEW, k: number, cx: number, cy: number) => {
    const w = Math.min(24, Math.max(6, v.w * k));
    const h = (v.h / v.w) * w;
    const rect = svg.current!.getBoundingClientRect();
    const fx = (cx - rect.left) / rect.width;
    const fy = (cy - rect.top) / rect.height;
    return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
  };
  const onWheel = (e: React.WheelEvent) => {
    const k = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    setView((v) => zoomAt(v, k, e.clientX, e.clientY));
  };
  const zoomCenter = (k: number) => {
    const r = svg.current!.getBoundingClientRect();
    setView((v) => zoomAt(v, k, r.left + r.width / 2, r.top + r.height / 2));
  };
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };

  const cityGroups = cities(p);
  const ports = portStatus(p);
  const lotus = p.lotusRate || (p.character === 'ロータス・チェー' && p.clockPlaced);
  const rate = lotus ? LOTUS_CITY_RATE : CITY_RATE;
  const nCity = Math.min(6, cityGroups.length);
  const nPort = ports.filter(Boolean).length;
  return (
    <div className="maparea">
      <div className="mapstats">
        <span title={`都市 ${cityGroups.length}つ：パス時に${rate[nCity]}都市点（都市点レート ${rate.slice(1).join('/')}）`}>
          <Icons toks={[{ g: { k: 'city' }, n: cityGroups.length }, { g: 'condOnce' }, { g: 'cp', n: rate[nCity] }]} size={15} />
        </span>
        <span title={`接続している港 ${nPort}/4：ゲーム終了時 ${PORT_VP[nPort]}勝利点`}>
          <Icons toks={[{ g: 'portLink', n: `${nPort}/4` }, { g: 'condOnce' }, { g: 'vp', n: PORT_VP[nPort] }]} size={15} />
        </span>
        <span title={`アクティブな追加ドローエリア ${p.drawAreas.filter(Boolean).length}/2：収入フェイズに引く枚数が増える`}>
          <Icons toks={[{ g: { k: 'draw', n: 1 }, n: `+${p.drawAreas.filter(Boolean).length}` }]} size={15} />
        </span>
      </div>
    <svg
      ref={svg}
      className="mapsvg"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={(e) => {
        if (e.pointerType === 'touch') {
          touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (touches.current.size === 2) {
            pan.current = null;
            pinch.current = { d0: spread().d, v0: view };
            return;
          }
        }
        if ((e.target as Element).closest('[data-dest]') || e.button !== 0) return;
        pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      }}
      onPointerMove={(e) => {
        if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pc = pinch.current;
        if (pc && touches.current.size === 2) {
          const sp = spread();
          if (sp.d > 0) setView(zoomAt(pc.v0, pc.d0 / sp.d, sp.cx, sp.cy));
          return;
        }
        const pn = pan.current;
        if (!pn || c.dragging) return;
        const rect = svg.current!.getBoundingClientRect();
        const sx = view.w / rect.width;
        setView((v) => ({ ...v, x: pn.vx - (e.clientX - pn.x) * sx, y: pn.vy - (e.clientY - pn.y) * sx }));
      }}
      onPointerUp={(e) => {
        touches.current.delete(e.pointerId);
        if (touches.current.size < 2) pinch.current = null;
        pan.current = null;
      }}
      onPointerCancel={(e) => {
        touches.current.delete(e.pointerId);
        pinch.current = null;
        pan.current = null;
      }}
      onPointerLeave={() => (pan.current = null)}
      role="img"
      aria-label={`${p.name}の地図ボード`}
    >
      {virtual.ports.map(([r, cc], i) => (
        <VirtualSpot key={`port${i}`} r={r} c={cc} glyph="port" active={ports[i]} title={ports[i] ? '港（首都とつながっている）' : '港（まだつながっていない）'} />
      ))}
      {virtual.draws.map(([r, cc], i) => (
        <VirtualSpot key={`draw${i}`} r={r} c={cc} glyph={{ k: 'draw', n: 1 }} active={p.drawAreas[i]} title={p.drawAreas[i] ? '追加ドローエリア（アクティブ）' : '追加ドローエリア（隣のヘクスにタイル＋囲む辺に道駒でアクティブ）'} />
      ))}
      {Object.entries(p.hexes).map(([key, h]) => (
        <Hex key={key} k={key} h={h} holding={holding} tileKind={tileKind} flash={flashKeys.has(`hex:${key}`)} color={color} />
      ))}
      {p.roads.map((e) => {
        const [a, b] = edgeVertices(e).map(vertexPoint);
        return <line key={e} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={flashKeys.has(`edge:${e}`) ? 'road flash' : 'road'} />;
      })}
      {cityGroups.map((g, i) => (
        <g key={i} pointerEvents="none" className="cityline">
          {g.map((k) => {
            const [r, cc] = parseHexKey(k);
            return <polygon key={k} points={pointsOf(r, cc)} fill="none" />;
          })}
        </g>
      ))}
      {legalEdges.map((e) => (
        <EdgeSpot key={e} e={e} />
      ))}
    </svg>
      <div className="mapzoom" aria-label="地図の拡大縮小">
        <button className="btn" onClick={() => zoomCenter(1 / 1.25)} aria-label="地図を拡大">
          ＋
        </button>
        <button className="btn" onClick={() => zoomCenter(1.25)} aria-label="地図を縮小">
          −
        </button>
        <button className="btn" onClick={() => setView(HOME_VIEW)} aria-label="地図の全体を表示">
          全体
        </button>
      </div>
    </div>
  );
}

/** 地図の最初の表示範囲（盤面全体が入る） */
const HOME_VIEW = { x: -2.1, y: -3.0, w: 18.2, h: 14.6 };

function VirtualSpot({ r, c, glyph, active, title }: { r: number; c: number; glyph: GlyphSpec; active?: boolean; title: string }) {
  const [x, y] = hexCenter(r, c);
  return (
    <g className="virtual">
      <title>{title}</title>
      <circle cx={x} cy={y} r={0.66} fill={active ? 'var(--me)' : 'var(--biscuit-deep)'} stroke={active ? 'var(--me)' : 'var(--crust)'} strokeWidth={0.08} />
      <GlyphAt g={glyph} x={x} y={y} size={0.9} />
    </g>
  );
}

function Hex({ k, h, holding, tileKind, flash, color }: { k: string; h: PlayerState['hexes'][string]; holding: 'tile' | 'building' | 'rabbit' | 'clock' | null; tileKind?: 'W' | 'X'; flash: boolean; color: string }) {
  const [r, c] = parseHexKey(k);
  const [x, y] = hexCenter(r, c);
  const t = useTarget(`hex:${k}`, { k: 'hex', hex: k, holding, tileKind });
  const [base, deep] = FILL[h.terrain];
  const tile = h.tile;
  const special = tile?.kind === 'special' ? SPECIAL_TILES[tile.specialId!] : null;
  const fill = tile ? (tile.flipped ? deep : base) : 'var(--sugar)';
  const z = useZoomBind(() => (
    <div>
      <b>{TERRAIN_NAME[h.terrain]}のヘクス</b>
      <div>{tile ? (tile.flipped ? '地形タイル（裏向き）' : '地形タイル（表向き）') : 'タイルなし'}</div>
      {special && <div>特殊地形タイル：裏返すと {special.label}</div>}
      {h.icon && !h.iconTaken && <div>タイルを置くと：{ICON_TEXT[h.icon][1]}</div>}
      {h.terrain === 'C' ? (
        <div>
          建物駒を置くと：
          <Icons toks={effToks2(CAPITAL_BONUS)} size={18} />
        </div>
      ) : h.terrain !== 'X' ? (
        <div>
          裏返すと（建物駒を置いたときも）：
          <Icons toks={effToks2(TERRAIN_FLIP[h.terrain as Terrain])} size={18} />
        </div>
      ) : special ? (
        <div>
          裏返すと：
          <Icons toks={effToks2(special.eff)} size={18} />
        </div>
      ) : null}
      {h.building && <div>建物駒あり</div>}
      {h.rabbit && <div>クッキーラビット駒あり</div>}
    </div>
  ));
  return (
    <g {...t.props} {...z.props} className={flash ? 'flash' : undefined}>
      <polygon points={pointsOf(r, c)} fill={fill} stroke={tile ? deep : base} strokeWidth={tile ? 0.06 : 0.14} className={t.lit ? 'lit-svg' : undefined} />
      {!tile && h.terrain !== 'C' && <polygon points={pointsOf(r, c)} fill={base} opacity={0.22} pointerEvents="none" />}
      {tile?.flipped && <circle cx={x} cy={y} r={0.78} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.08} pointerEvents="none" />}
      {h.terrain === 'C' && !h.building && (
        <g pointerEvents="none">
          <GlyphAt g={{ k: 'income', res: 'any' }} x={x - 0.36} y={y} size={0.6} />
          <text x={x} y={y + 0.15} textAnchor="middle" fontSize={0.4} fontWeight={800} fill="#3a261c">
            /
          </text>
          <GlyphAt g={{ k: 'pros' }} x={x + 0.36} y={y} size={0.6} />
        </g>
      )}
      {special && !tile!.flipped && !h.building && <SpecialIcons id={tile!.specialId!} x={x} y={y} />}
      {h.icon && !h.iconTaken && <HexIcon icon={h.icon} terrain={h.terrain as Terrain} x={x} y={y} />}
      {h.building && (
        <g pointerEvents="none">
          <PieceShape type={h.building} x={x} y={y} r={0.5} color={color} />
        </g>
      )}
      {h.rabbit && (
        <g pointerEvents="none">
          <PieceShape type="rabbit" x={x + 0.5} y={y + 0.45} r={0.32} color={color} />
        </g>
      )}
    </g>
  );
}

/** ヘクスに印刷されたボーナス（数字＋アイコン） */
function HexIcon({ icon, terrain, x, y }: { icon: string; terrain: Terrain; x: number; y: number }) {
  const toks = effToks(MAP_ICON[icon](terrain));
  const t = toks[0];
  if (!t || 'sep' in t) return null;
  const showN = t.n !== undefined && t.n !== 1;
  return (
    <g pointerEvents="none">
      <GlyphAt g={t.g} x={showN ? x + 0.2 : x} y={y} size={0.95} />
      {showN && (
        <text x={x - 0.42} y={y + 0.22} textAnchor="middle" fontSize={0.55} fontWeight={800} fill="#3a261c">
          {t.n}
        </text>
      )}
    </g>
  );
}

function SpecialIcons({ id, x, y }: { id: number; x: number; y: number }) {
  const toks = effToks(SPECIAL_TILES[id].eff).filter((t): t is { g: GlyphSpec; n?: number | string } => !('sep' in t));
  return (
    <g pointerEvents="none">
      {toks.slice(0, 2).map((t, i) => (
        <GlyphAt key={i} g={t.g} x={x + (i - (Math.min(2, toks.length) - 1) / 2) * 0.72} y={y} size={0.66} />
      ))}
    </g>
  );
}

function EdgeSpot({ e }: { e: string }) {
  const [a, b] = edgeVertices(e).map(vertexPoint);
  const t = useTarget(`edge:${e}`, { k: 'edge', edge: e });
  if (!t.lit) return null;
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  return (
    <g {...t.props}>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--me)" strokeWidth={0.12} strokeOpacity={0.45} />
      <circle cx={mx} cy={my} r={0.26} fill="var(--sugar)" className="lit-svg" strokeWidth={0.09} />
    </g>
  );
}
