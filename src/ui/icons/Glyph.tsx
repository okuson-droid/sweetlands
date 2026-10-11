// アイコン（ui_design §1, §14）。原作のアイコン一覧と同じ意味づけ・同じ区別の仕方で描いた、オリジナルの簡素な図形。
// 収入＝資源を枠で囲む、任意＝「?」、支払い＝赤の矢印、条件＝白抜きの矢印、繰り返し＝矢印の輪、など。
import type { ReactNode } from 'react';
import type { BuildingType, ProsColor, Row, Tag, Terrain } from '../../game/types';

export type GlyphName =
  | 'gold' | 'wheat' | 'wood' | 'iron' | 'diamond' | 'anyBasic'
  | 'payOnce' | 'payRepeat' | 'condOnce' | 'condEach'
  | 'road' | 'roadPlace' | 'rabbit' | 'rabbitPlace'
  | 'indTrack' | 'indAdvance' | 'ip' | 'ipThisPass' | 'carriage' | 'loco' | 'food' | 'foodAdvance'
  | 'vp' | 'cp' | 'card' | 'handCard' | 'automated' | 'rowSet' | 'drawAutomate' | 'discard' | 'passCardPlay'
  | 'trait' | 'pass' | 'perm' | 'instant' | 'once' | 'incomePhase' | 'flip' | 'endgame'
  | 'wonder' | 'disc' | 'skill' | 'advSkill' | 'port' | 'portLink' | 'cube' | 'hexFlip' | 'noAdjacency' | 'milestone';

export type GlyphSpec =
  | GlyphName
  | { k: 'income'; res: 'gold' | 'wheat' | 'wood' | 'iron' | 'any' }
  | { k: 'hex'; kind: Terrain | 'X' | 'any'; back?: boolean }
  | { k: 'building'; type?: BuildingType; place?: boolean; on?: Terrain }
  | { k: 'city'; with?: 'clock' | 'lab' | 'rabbit' }
  | { k: 'draw'; n: number }
  | { k: 'played'; row?: Row | 'all' }
  | { k: 'ib'; row?: Row }
  | { k: 'pros'; color?: ProsColor }
  | { k: 'tag'; tag: Tag }
  | { k: 'search'; what: 'pass' | Tag };

const ROW_COLOR: Record<Row | 'all', string> = { agr: 'var(--wheat)', for: 'var(--forest)', min: 'var(--mine)', all: 'url(#g-rainbow)' };
const TERRAIN_COLOR: Record<string, [string, string]> = {
  W: ['var(--wheat)', 'var(--wheat-deep)'],
  F: ['var(--forest)', 'var(--forest-deep)'],
  M: ['var(--mine)', 'var(--mine-deep)'],
  S: ['var(--sea)', 'var(--sea-deep)'],
  X: ['url(#p-special-icon)', 'var(--special-deep)'],
  any: ['var(--sugar)', 'var(--cocoa-soft)'],
};
const PROS_COLOR: Record<ProsColor, string> = { O: 'var(--wheat)', G: 'var(--forest)', Y: 'var(--mine)' };
const INK = '#3a261c';
const st = (w = 1.4) => ({ stroke: INK, strokeWidth: w, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const });

/** 特殊地形の印（中央の星）。鉱山の灰色と色だけで区別しないように形でも示す */
const STAR = 'M12 6.2L13.6 10.2L17.8 10.4L14.5 13L15.7 17.1L12 14.7L8.3 17.1L9.5 13L6.2 10.4L10.4 10.2Z';

function hexPath(cx: number, cy: number, r: number): string {
  const pts = Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 180) * (60 * k - 90);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  });
  return `M${pts.join('L')}Z`;
}
const q = (x: number, y: number, size = 9) => (
  <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight={800} fill={INK} fontFamily="inherit">
    ?
  </text>
);
const plus = (x = 18, y = 18) => (
  <g>
    <circle cx={x} cy={y} r={4.6} fill="#fff" {...st(1.1)} />
    <path d={`M${x - 2.4} ${y}H${x + 2.4}M${x} ${y - 2.4}V${y + 2.4}`} {...st(1.4)} />
  </g>
);
const advance = () => <path d="M3 21.5H17M14 18.8L17.5 21.5L14 24" fill="none" {...st(1.6)} />;
const laurel = () => (
  <g fill="none" stroke="#5f7d3a" strokeWidth={1.6}>
    <path d="M5 8C2.5 12 3.5 17 8 20" />
    <path d="M19 8C21.5 12 20.5 17 16 20" />
  </g>
);

function body(spec: GlyphSpec): ReactNode {
  if (typeof spec !== 'string') {
    switch (spec.k) {
      case 'income':
        return (
          <g>
            <rect x={1.5} y={1.5} width={21} height={21} rx={3} fill="#efe1c8" stroke="#8a5a2b" strokeWidth={1.8} />
            <g transform="translate(3.6 3.6) scale(0.7)">{spec.res === 'any' ? q(12, 16, 14) : body(spec.res)}</g>
          </g>
        );
      case 'hex': {
        const [f, d] = TERRAIN_COLOR[spec.kind];
        return (
          <g>
            <path d={hexPath(12, 12, 10)} fill={f} stroke={d} strokeWidth={1.6} />
            {spec.back && <path d={hexPath(12, 12, 5.6)} fill="none" stroke="#fff" strokeWidth={1.8} />}
            {spec.kind === 'any' && q(12, 15.5, 11)}
            {spec.kind === 'X' && <path d={STAR} fill="#fff" stroke="var(--special-deep)" strokeWidth={0.9} strokeLinejoin="round" />}
          </g>
        );
      }
      case 'building': {
        const t = spec.type;
        const shape =
          t === 'tent' ? <path d="M3 18L12 5L21 18Z" fill="#f2c84b" {...st()} /> :
          t === 'bldg' ? <rect x={7} y={4} width={10} height={15} rx={1.5} fill="#7b4a2c" {...st()} /> :
          t === 'lab' ? <path d="M10 4H14V9L19 18H5L10 9Z" fill="#f4f6f8" {...st()} /> :
          t === 'shop' ? <path d="M5 7H17V14A4 4 0 0 1 13 18H9A4 4 0 0 1 5 14Z M17 9H19.5V12H17" fill="#a26b43" {...st()} /> :
          t === 'clock' ? <g><path d="M8.5 11L12 21L15.5 11Z" fill="#e3b778" {...st()} /><circle cx={12} cy={8} r={5} fill="#f6c9d6" {...st()} /></g> :
          <path d="M4 19V10L12 4L20 10V19Z" fill="#f7e2b6" {...st()} />;
        return (
          <g>
            {spec.on && <path d={hexPath(12, 14, 9)} fill={TERRAIN_COLOR[spec.on][0]} stroke={TERRAIN_COLOR[spec.on][1]} strokeWidth={1.4} />}
            <g transform={spec.on ? 'translate(4.5 3.5) scale(0.62)' : undefined}>{shape}</g>
            {spec.place && plus()}
          </g>
        );
      }
      case 'city':
        return (
          <g>
            <path d="M2 21V12L7 8L12 12V21Z" fill="#f7e2b6" {...st()} />
            <path d="M11 21V8L16 4L21 8V21Z" fill="#f7e2b6" {...st()} />
            {spec.with === 'clock' && <circle cx={16} cy={13} r={3} fill="#f6c9d6" {...st(1)} />}
            {spec.with === 'lab' && <path d="M15 10H17V13L19 17H13L15 13Z" fill="#fff" {...st(1)} />}
            {spec.with === 'rabbit' && <circle cx={16} cy={14} r={3} fill="#c98a4b" {...st(1)} />}
          </g>
        );
      case 'draw':
        return (
          <g>
            <rect x={3} y={5} width={11} height={15} rx={2} fill="#f2ead9" {...st()} transform="rotate(-12 8 12)" />
            <rect x={8} y={3} width={11} height={15} rx={2} fill="#7fb36b" {...st()} />
            <path d="M13.5 6.5V13M10.8 10.5L13.5 13.2L16.2 10.5" fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
            {spec.n > 1 && (
              <text x={17} y={23} fontSize={8} fontWeight={800} fill={INK} textAnchor="middle">
                ×{spec.n}
              </text>
            )}
          </g>
        );
      case 'played':
        return (
          <g>
            <rect x={6} y={3} width={12} height={18} rx={2} fill="#f6e7e1" {...st()} />
            {spec.row && <path d="M6 3H13L6 10Z" fill={ROW_COLOR[spec.row]} stroke={INK} strokeWidth={1} />}
          </g>
        );
      case 'ib':
        return (
          <g>
            <rect x={2} y={4} width={17} height={16} rx={2} fill="#efe6d4" {...st()} />
            <rect x={2} y={4} width={17} height={5} rx={1.5} fill={spec.row ? ROW_COLOR[spec.row] : 'url(#g-rainbow)'} {...st(1)} />
            <path d="M5 13H15M5 16.5H12" stroke={INK} strokeWidth={1.2} />
            <path d="M21 6V14" stroke="#4aa64a" strokeWidth={2.6} strokeLinecap="round" />
            <circle cx={21} cy={18} r={1.5} fill="#4aa64a" />
          </g>
        );
      case 'pros':
        return (
          <g>
            <path d="M5 9L8 5L12 8L16 5L19 9Z" fill="#e9b83f" {...st(1.1)} />
            <path d="M12 21C5 16 3 13 3 10.5A4.3 4.3 0 0 1 12 9A4.3 4.3 0 0 1 21 10.5C21 13 19 16 12 21Z" fill={spec.color ? PROS_COLOR[spec.color] : 'url(#g-rainbow)'} {...st()} />
          </g>
        );
      case 'tag':
        return tagGlyph(spec.tag);
      case 'search':
        return (
          <g>
            <rect x={2} y={6} width={10} height={14} rx={2} fill={spec.what === 'pass' ? '#c7a3dd' : '#f2ead9'} {...st()} transform="rotate(-14 7 13)" />
            <rect x={7} y={4} width={10} height={14} rx={2} fill={spec.what === 'pass' ? '#c7a3dd' : '#f2ead9'} {...st()} />
            {spec.what !== 'pass' && <g transform="translate(7.5 6) scale(0.4)">{tagGlyph(spec.what)}</g>}
            <circle cx={17} cy={16} r={4} fill="#fff" {...st(1.4)} />
            <path d="M20 19L22.5 21.5" {...st(2)} />
          </g>
        );
    }
  }
  switch (spec) {
    case 'gold':
      return (
        <g>
          <ellipse cx={9} cy={13} rx={7} ry={6} fill="#e8c33a" stroke="#8a6a12" strokeWidth={1.4} />
          <ellipse cx={15} cy={11} rx={7} ry={6} fill="#f3d55a" stroke="#8a6a12" strokeWidth={1.4} />
          <ellipse cx={15} cy={11} rx={3.4} ry={2.8} fill="none" stroke="#8a6a12" strokeWidth={1.1} />
        </g>
      );
    case 'wheat':
      return (
        <g>
          <path d="M5 21L14 9" stroke="#b7741a" strokeWidth={1.8} strokeLinecap="round" />
          <path d="M14 9C13 5 15 3 18 2C19 6 17 8 14 9Z M11 12C9 9 10 7 13 5.5C14.5 8.5 13.5 10.5 11 12Z M14 9C17 8 19.5 9 21 11.5C18 13 16 12 14 9Z M11 12C14 11.5 16.5 12.5 17.5 15C14.5 16 12.5 15 11 12Z" fill="#e9a23b" stroke="#a6661a" strokeWidth={1} />
        </g>
      );
    case 'wood':
      return (
        <g>
          <path d="M5 8H17V17H5Z" fill="#a8703f" {...st(1.2)} />
          <ellipse cx={17} cy={12.5} rx={3.2} ry={4.5} fill="#e2b98a" {...st(1.2)} />
          <ellipse cx={5} cy={12.5} rx={3.2} ry={4.5} fill="#a8703f" {...st(1.2)} />
          <ellipse cx={17} cy={12.5} rx={1.2} ry={1.8} fill="none" stroke="#8a5a2b" strokeWidth={1} />
        </g>
      );
    case 'iron':
      return (
        <g>
          <path d="M3 15L8 6H17L21 11L16 19H7Z" fill="#6f8399" {...st(1.2)} />
          <path d="M8 6L11 12L16 19M11 12H21" fill="none" stroke="#c9d6e3" strokeWidth={1.1} />
        </g>
      );
    case 'diamond':
      return (
        <g>
          <path d="M3 9L7 4H17L21 9L12 21Z" fill="#7fd3e8" stroke="#2f7d93" strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M3 9H21M9 9L12 21L15 9M7 4L9 9M17 4L15 9" fill="none" stroke="#2f7d93" strokeWidth={0.9} />
        </g>
      );
    case 'anyBasic':
      return (
        <g>
          <circle cx={12} cy={12} r={9.5} fill="#fbeee0" stroke="#c25555" strokeWidth={1.6} />
          {q(12, 16, 13)}
        </g>
      );
    case 'payOnce':
      return <path d="M3 8H12V3.5L21 12L12 20.5V16H3Z" fill="#e05a47" stroke="#9b2c22" strokeWidth={1.2} strokeLinejoin="round" />;
    case 'payRepeat':
      return (
        <g>
          <path d="M3 10H12V6L20 13L12 20V16H3Z" fill="#e05a47" stroke="#9b2c22" strokeWidth={1.2} strokeLinejoin="round" />
          <path d="M5 6C5 2 10 2 10 5" fill="none" stroke="#9b2c22" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      );
    case 'condOnce':
      return <path d="M3 8H12V3.5L21 12L12 20.5V16H3Z" fill="#fff" stroke="#c25555" strokeWidth={1.5} strokeLinejoin="round" />;
    case 'condEach':
      return (
        <g>
          <path d="M3 10H12V6L20 13L12 20V16H3Z" fill="#fff" stroke="#c25555" strokeWidth={1.5} strokeLinejoin="round" />
          <path d="M5 6C5 2 10 2 10 5" fill="none" stroke="#c25555" strokeWidth={1.5} strokeLinecap="round" />
        </g>
      );
    case 'road':
    case 'roadPlace':
      return (
        <g>
          <path d="M2 15C6 9 11 10 14 12C17 14 20 13 22 11L22 15C20 17 17 18 14 16C11 14 6 13 3 18Z" fill="#b07a4f" {...st(1.1)} />
          {spec === 'roadPlace' && plus(18, 6)}
        </g>
      );
    case 'rabbit':
    case 'rabbitPlace':
      return (
        <g>
          <ellipse cx={9} cy={6} rx={2} ry={4.5} fill="#c98a4b" {...st(1.1)} />
          <ellipse cx={14} cy={6} rx={2} ry={4.5} fill="#c98a4b" {...st(1.1)} />
          <path d="M5 21C5 14 7 10 11.5 10C16 10 18 14 18 21Z" fill="#c98a4b" {...st(1.1)} />
          <circle cx={9.5} cy={14} r={0.9} fill={INK} />
          <circle cx={13.5} cy={14} r={0.9} fill={INK} />
          {spec === 'rabbitPlace' && plus(19, 18)}
        </g>
      );
    case 'indTrack':
    case 'indAdvance':
      return (
        <g>
          <path d="M8 4H16V7L18 9V20H6V9L8 7Z" fill="#dfe6ee" {...st(1.2)} />
          <rect x={8.5} y={12} width={7} height={5} rx={1} fill="#4c6fd6" />
          {spec === 'indAdvance' && advance()}
        </g>
      );
    case 'ip':
    case 'ipThisPass':
      return (
        <g>
          {laurel()}
          <path d="M9 4H15V6L16.5 7.5V17H7.5V7.5L9 6Z" fill="#dfe6ee" {...st(1.1)} />
          {spec === 'ipThisPass' && (
            <text x={12} y={15} fontSize={8} fontWeight={800} textAnchor="middle" fill={INK}>
              N
            </text>
          )}
        </g>
      );
    case 'carriage':
      return (
        <g>
          <rect x={4} y={8} width={14} height={8} rx={3} fill="#e8915c" {...st(1.2)} />
          <circle cx={8} cy={18} r={2.5} fill="#fff" {...st(1.1)} />
          <circle cx={15} cy={18} r={2.5} fill="#fff" {...st(1.1)} />
        </g>
      );
    case 'loco':
      return (
        <g>
          <path d="M3 16V9H12V5H18V16Z" fill="#3f9a8a" {...st(1.2)} />
          <circle cx={7} cy={18} r={2.5} fill="#fff" {...st(1.1)} />
          <circle cx={15} cy={18} r={2.5} fill="#fff" {...st(1.1)} />
        </g>
      );
    case 'food':
    case 'foodAdvance':
      return (
        <g>
          <path d="M3 13C3 7 8 5 12 5C17 5 21 7 21 13Z" fill="#e3b77a" {...st(1.2)} />
          <path d="M3 13H21V15H3Z" fill="#c98a4b" {...st(1)} />
          <circle cx={9} cy={9} r={1} fill={INK} />
          <circle cx={14} cy={8.5} r={1} fill={INK} />
          {spec === 'foodAdvance' && advance()}
        </g>
      );
    case 'vp':
      return (
        <g>
          {laurel()}
          <path d="M7 4H17V7C17 11 14.5 13 12 13C9.5 13 7 11 7 7Z" fill="#e8b33a" {...st(1.2)} />
          <path d="M12 13V16M8.5 18H15.5" {...st(1.6)} />
        </g>
      );
    case 'cp':
      return (
        <g>
          {laurel()}
          <path d="M7 18V11L12 7L17 11V18Z" fill="#f7e2b6" {...st(1.2)} />
          <rect x={10.5} y={13} width={3} height={5} fill="#c25555" />
        </g>
      );
    case 'card':
      return <rect x={6} y={3} width={12} height={18} rx={2} fill="#f6e7e1" {...st()} />;
    case 'handCard':
      return (
        <g>
          <rect x={5} y={3} width={12} height={17} rx={2} fill="#f6e7e1" {...st()} />
          <path d="M14 22V16C14 14.5 16.5 14.5 16.5 16V13.5C16.5 12 19 12 19 13.5V22Z" fill={INK} />
        </g>
      );
    case 'automated':
      return (
        <g>
          <rect x={6} y={5} width={12} height={17} rx={2} fill="#f6e7e1" {...st()} />
          <path d="M12 16V2M8.5 5.5L12 2L15.5 5.5" fill="none" stroke="#4aa64a" strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case 'rowSet':
      return (
        <g>
          <rect x={1.5} y={5} width={7} height={14} rx={1.5} fill="var(--wheat)" {...st(1)} />
          <rect x={8.5} y={5} width={7} height={14} rx={1.5} fill="var(--forest)" {...st(1)} />
          <rect x={15.5} y={5} width={7} height={14} rx={1.5} fill="var(--mine)" {...st(1)} />
        </g>
      );
    case 'drawAutomate':
      return (
        <g>
          <g transform="translate(-3 0) scale(0.85)">{body({ k: 'draw', n: 1 })}</g>
          <g transform="translate(9 1) scale(0.6)">{body('automated')}</g>
        </g>
      );
    case 'discard':
      return (
        <g>
          <rect x={6} y={3} width={12} height={16} rx={2} fill="#f6e7e1" {...st()} />
          <path d="M12 8V21M8.5 17.5L12 21L15.5 17.5" fill="none" stroke="#c25555" strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case 'passCardPlay':
      return (
        <g>
          <rect x={6} y={3} width={12} height={18} rx={2} fill="#c7a3dd" {...st()} />
          <path d="M6 3H13L6 10Z" fill="#7fb36b" stroke={INK} strokeWidth={1} />
        </g>
      );
    case 'trait':
      return (
        <g>
          <circle cx={12} cy={12} r={4} fill={INK} />
          <path d="M12 2V5M12 19V22M2 12H5M19 12H22M5 5L7 7M17 17L19 19M19 5L17 7M5 19L7 17" {...st(1.8)} />
        </g>
      );
    case 'pass':
      return (
        <g>
          <circle cx={12} cy={13} r={7.5} fill="#fff" {...st(2)} />
          <path d="M12 9V13L15 15M5 5L8 3M19 5L16 3" fill="none" {...st(1.8)} />
        </g>
      );
    case 'perm':
      return <path d="M12 12C9 8 4 8 4 12C4 16 9 16 12 12C15 8 20 8 20 12C20 16 15 16 12 12Z" fill="none" {...st(2.4)} />;
    case 'instant':
      return <path d="M14 2L5 13H11L9 22L19 10H13Z" fill={INK} />;
    case 'once':
      return <path d="M4 12L10 18L20 6" fill="none" {...st(3)} />;
    case 'incomePhase':
      return (
        <g>
          <rect x={2} y={2} width={20} height={20} rx={2} fill="#fff" {...st(2)} />
          <circle cx={12} cy={12} r={6} fill="none" {...st(1.6)} />
          <path d="M12 8.5V12L14.5 13.5" fill="none" {...st(1.6)} />
        </g>
      );
    case 'flip':
      return <path d="M4 16C4 8 15 6 18 12M18 12L19.5 7M18 12L13 11" fill="none" {...st(2.4)} />;
    case 'endgame':
      return <path d="M15 3A9 9 0 1 0 21 15A7 7 0 1 1 15 3Z" fill={INK} />;
    case 'wonder':
      return <path d="M12 2L14.2 7.6L20 6.5L16.6 11.4L20.5 16L14.6 15.6L12 21L9.4 15.6L3.5 16L7.4 11.4L4 6.5L9.8 7.6Z" fill="#f4d061" {...st(1.2)} />;
    case 'disc':
      return <ellipse cx={12} cy={12} rx={9} ry={6.5} fill="#e9a861" {...st(1.4)} />;
    case 'skill':
      return <path d="M3 8A3 3 0 0 1 6 5H18A3 3 0 0 1 21 8V19H3Z" fill="#2f6f73" {...st(1.2)} />;
    case 'advSkill':
      return (
        <g>
          <path d="M3 8A3 3 0 0 1 6 5H18A3 3 0 0 1 21 8V19H3Z" fill="#7d2a33" {...st(1.2)} />
          <circle cx={12} cy={12.5} r={2.6} fill="#f4d061" />
        </g>
      );
    case 'port':
      return <path d="M2 9C5 6 7 12 10 9C13 6 15 12 18 9C20 7 21 8 22 9M2 15C5 12 7 18 10 15C13 12 15 18 18 15C20 13 21 14 22 15" fill="none" {...st(1.8)} />;
    case 'portLink':
      return (
        <g>
          <path d="M1 10C3 8 5 12 7 10C9 8 10 11 11 10" fill="none" {...st(1.5)} />
          <rect x={12} y={8} width={10} height={6} rx={3} fill="#b07a4f" {...st(1)} />
          <path d="M1 16C3 14 5 18 7 16C9 14 10 17 11 16" fill="none" {...st(1.5)} />
        </g>
      );
    case 'cube':
      return <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5Z M4 7.5L12 12L20 7.5M12 12V21" fill="#cfe3d8" {...st(1.2)} />;
    case 'hexFlip':
      return (
        <g>
          <path d={hexPath(11, 13, 9)} fill="var(--sugar)" stroke="var(--cocoa-soft)" strokeWidth={1.4} />
          {q(11, 16.5, 10)}
          <path d="M16 4C19 4 21 6 21 9M21 9L19 7.5M21 9L22.5 7" fill="none" stroke="#4aa64a" strokeWidth={1.8} strokeLinecap="round" />
        </g>
      );
    case 'noAdjacency':
      return (
        <g>
          <path d={hexPath(7, 15, 5.5)} fill="var(--wheat)" {...st(1)} />
          <path d={hexPath(17, 7, 5.5)} fill="var(--forest)" {...st(1)} />
        </g>
      );
    case 'milestone':
      return (
        <g>
          <path d="M5 3V21" {...st(1.8)} />
          <path d="M6 4H19L16 8.5L19 13H6Z" fill="#e05a47" {...st(1.2)} />
        </g>
      );
  }
  return null;
}

function tagGlyph(tag: Tag): ReactNode {
  switch (tag) {
    case 'ショートケーキ':
      return (
        <g>
          <path d="M3 18L20 10V18Z" fill="#fff4e6" {...st(1.1)} />
          <path d="M3 14.5L20 7V10L3 18Z" fill="#f7d7c4" {...st(1)} />
          <circle cx={16} cy={6} r={3} fill="#e0384f" {...st(1)} />
        </g>
      );
    case 'タルト':
      return (
        <g>
          <path d="M2 13H22L19 19H5Z" fill="#d6964f" {...st(1.1)} />
          <circle cx={7} cy={11} r={2.5} fill="#e0384f" {...st(0.9)} />
          <circle cx={12} cy={10} r={2.5} fill="#f2b632" {...st(0.9)} />
          <circle cx={17} cy={11} r={2.5} fill="#5aa55a" {...st(0.9)} />
        </g>
      );
    case 'ティラミス':
      return (
        <g>
          <rect x={3} y={7} width={18} height={11} rx={2} fill="#f3e3c3" {...st(1.1)} />
          <rect x={3} y={7} width={18} height={3.5} rx={1.5} fill="#7a4a2c" />
          <path d="M3 14H21" stroke="#c99a68" strokeWidth={1.5} />
        </g>
      );
    case 'ブラウニー':
      return <path d="M3 17L7 7H20L21 17Z" fill="#5b3523" {...st(1.1)} />;
    case 'マカロン':
      return (
        <g>
          <ellipse cx={12} cy={8} rx={8} ry={4} fill="#d65c7a" {...st(1.1)} />
          <rect x={4.5} y={10.5} width={15} height={3} fill="#fff3f5" {...st(1)} />
          <ellipse cx={12} cy={16.5} rx={8} ry={4} fill="#d65c7a" {...st(1.1)} />
        </g>
      );
    case '和菓子':
      return (
        <g>
          <circle cx={12} cy={13} r={8} fill="#f4c7d3" {...st(1.1)} />
          <path d="M12 5C14 2 18 2 19 4C16 6 14 6 12 5Z" fill="#5aa55a" {...st(1)} />
        </g>
      );
  }
}

/** HTML の中で使う単体のアイコン */
export function Glyph({ g, size = 18, title }: { g: GlyphSpec; size?: number; title?: string }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {body(g)}
    </svg>
  );
}

/** SVG（地図ボード）の中で使うアイコン */
export function GlyphAt({ g, x, y, size }: { g: GlyphSpec; x: number; y: number; size: number }) {
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {body(g)}
    </svg>
  );
}

/** グラデーション定義（任意の色を表す虹色）。ページに1回だけ置く */
export function GlyphDefs() {
  return (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {/* 特殊地形：濃いピンクと白の斜めの縞（キャンディの包み紙）。ほかの地形・プレイヤー色と重ならない */}
        <pattern id="p-special-icon" patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
          <rect width={5} height={5} fill="#f7c6dc" />
          <rect width={2.5} height={5} fill="#e05a9a" />
        </pattern>
        <pattern id="p-special-map" patternUnits="userSpaceOnUse" width={0.3} height={0.3} patternTransform="rotate(45)">
          <rect width={0.3} height={0.3} fill="#f7c6dc" />
          <rect width={0.15} height={0.3} fill="#e05a9a" />
        </pattern>
        <linearGradient id="g-rainbow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e9a23b" />
          <stop offset="0.33" stopColor="#e9a23b" />
          <stop offset="0.33" stopColor="#5e9e62" />
          <stop offset="0.66" stopColor="#5e9e62" />
          <stop offset="0.66" stopColor="#8c8a9b" />
          <stop offset="1" stopColor="#8c8a9b" />
        </linearGradient>
      </defs>
    </svg>
  );
}
