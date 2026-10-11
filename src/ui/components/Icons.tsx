// 資源・駒の簡素なオリジナルアイコン。色だけに頼らず形でも区別する（ui_design §1, §14）
import type { BuildingType } from '../../game/types';

export type ResIcon = 'gold' | 'wheat' | 'wood' | 'iron' | 'diamond' | 'card' | 'disc' | 'vp' | 'cp' | 'ip';

export const RES_SHORT: Record<ResIcon, string> = {
  gold: 'G',
  wheat: '麦',
  wood: '木',
  iron: '鉄',
  diamond: 'ダイヤ',
  card: '手札',
  disc: 'ディスク',
  vp: '勝利点',
  cp: '都市点',
  ip: '工業点',
};

export function Icon({ kind, size = 14 }: { kind: ResIcon; size?: number }) {
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 20 20', 'aria-hidden': true } as const;
  switch (kind) {
    case 'gold':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="8" fill="var(--gold)" stroke="#9a7a12" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="4.5" fill="none" stroke="#9a7a12" strokeWidth="1.2" />
        </svg>
      );
    case 'wheat':
      return (
        <svg {...common}>
          <path d="M10 2 C15 7 15 13 10 18 C5 13 5 7 10 2Z" fill="var(--wheat)" stroke="var(--wheat-deep)" strokeWidth="1.5" />
        </svg>
      );
    case 'wood':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="16" height="8" rx="4" fill="var(--forest)" stroke="var(--forest-deep)" strokeWidth="1.5" />
          <circle cx="14" cy="10" r="2" fill="none" stroke="var(--forest-deep)" />
        </svg>
      );
    case 'iron':
      return (
        <svg {...common}>
          <path d="M3 13 L6 6 H14 L17 13 Z" fill="var(--mine)" stroke="var(--mine-deep)" strokeWidth="1.5" />
        </svg>
      );
    case 'diamond':
      return (
        <svg {...common}>
          <path d="M10 2 L17 9 L10 18 L3 9 Z" fill="var(--diamond)" stroke="#2f8aa3" strokeWidth="1.5" />
        </svg>
      );
    case 'card':
      return (
        <svg {...common}>
          <rect x="4" y="2" width="12" height="16" rx="2.5" fill="var(--sugar)" stroke="var(--crust)" strokeWidth="1.5" />
        </svg>
      );
    case 'disc':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7.5" fill="var(--cocoa-soft)" stroke="var(--cocoa)" strokeWidth="1.5" />
        </svg>
      );
    case 'vp':
      return (
        <svg {...common}>
          <path d="M10 2 L12.4 7.4 L18 8 L13.7 11.8 L15 17.5 L10 14.6 L5 17.5 L6.3 11.8 L2 8 L7.6 7.4 Z" fill="var(--wheat)" stroke="var(--wheat-deep)" strokeWidth="1.2" />
        </svg>
      );
    case 'cp':
      return (
        <svg {...common}>
          <path d="M3 17 V9 L7 6 L11 9 V17 Z M11 17 V5 L15 2 L18 5 V17 Z" fill="var(--forest)" stroke="var(--forest-deep)" strokeWidth="1.2" />
        </svg>
      );
    case 'ip':
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="7" fill="var(--mine)" stroke="var(--mine-deep)" strokeWidth="1.2" />
          <path d="M10 5 V10 L13.5 12" stroke="#fff" strokeWidth="1.6" fill="none" />
        </svg>
      );
  }
}

export function Amount({ kind, n, label = true }: { kind: ResIcon; n: number | string; label?: boolean }) {
  return (
    <span className="amount" title={RES_SHORT[kind]}>
      <Icon kind={kind} />
      {label && <span className="amount-label">{RES_SHORT[kind]}</span>}
      <b>{n}</b>
    </span>
  );
}

/** 建物駒・クッキーラビット駒の形（地図ボードの SVG 内で使う） */
export function PieceShape({ type, x, y, r, color }: { type: BuildingType | 'rabbit'; x: number; y: number; r: number; color: string }) {
  const stroke = { stroke: '#2a1a12', strokeWidth: r * 0.12 };
  switch (type) {
    case 'tent':
      return <path d={`M${x - r} ${y + r * 0.7} L${x} ${y - r * 0.8} L${x + r} ${y + r * 0.7} Z`} fill={color} {...stroke} />;
    case 'house':
      return <path d={`M${x - r * 0.8} ${y + r * 0.7} V${y - r * 0.1} L${x} ${y - r * 0.85} L${x + r * 0.8} ${y - r * 0.1} V${y + r * 0.7} Z`} fill={color} {...stroke} />;
    case 'bldg':
      return <rect x={x - r * 0.55} y={y - r * 0.9} width={r * 1.1} height={r * 1.6} rx={r * 0.12} fill={color} {...stroke} />;
    case 'lab':
      return <path d={`M${x - r * 0.25} ${y - r * 0.85} H${x + r * 0.25} V${y - r * 0.2} L${x + r * 0.75} ${y + r * 0.7} H${x - r * 0.75} L${x - r * 0.25} ${y - r * 0.2} Z`} fill={color} {...stroke} />;
    case 'shop':
      return <path d={`M${x - r * 0.75} ${y - r * 0.55} H${x + r * 0.55} V${y + r * 0.35} A${r * 0.4} ${r * 0.4} 0 0 1 ${x + r * 0.15} ${y + r * 0.75} H${x - r * 0.35} A${r * 0.4} ${r * 0.4} 0 0 1 ${x - r * 0.75} ${y + r * 0.35} Z`} fill={color} {...stroke} />;
    case 'clock':
      return (
        <g>
          <path d={`M${x - r * 0.45} ${y - r * 0.1} L${x} ${y + r * 0.95} L${x + r * 0.45} ${y - r * 0.1} Z`} fill={color} {...stroke} />
          <circle cx={x} cy={y - r * 0.35} r={r * 0.5} fill={color} {...stroke} />
        </g>
      );
    case 'rabbit':
      return (
        <g>
          <ellipse cx={x - r * 0.28} cy={y - r * 0.55} rx={r * 0.17} ry={r * 0.4} fill="#c98a4b" {...stroke} />
          <ellipse cx={x + r * 0.28} cy={y - r * 0.55} rx={r * 0.17} ry={r * 0.4} fill="#c98a4b" {...stroke} />
          <circle cx={x} cy={y + r * 0.1} r={r * 0.55} fill="#c98a4b" {...stroke} />
        </g>
      );
  }
}

export const PIECE_LABEL: Record<string, string> = {
  tent: 'テント駒',
  house: '家駒',
  bldg: 'ビル駒',
  lab: '研究所駒',
  shop: 'ショップ駒',
  'shop:agr': 'ショップ駒（農業）',
  'shop:for': 'ショップ駒（林業）',
  'shop:min': 'ショップ駒（鉱業）',
  clock: '時計塔駒',
  rabbit: 'クッキーラビット駒',
};
