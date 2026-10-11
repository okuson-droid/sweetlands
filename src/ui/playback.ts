// 出来事列の再生（ui_design §8）とログの文（§10）
import { useEffect, useRef, useState } from 'react';
import { AREAS, PROS_TRACKS } from '../game/boards';
import { CARDS } from '../game/cards';
import type { GameEvent, GameState } from '../game/types';
import { PLAYBACK_MAX_MS } from './constants';
import { cssMs, prefersReducedMotion } from './theme';
import { sound } from './sound';

const REASON_TEXT: Record<string, string> = {
  handCost: '手札コストとして捨てた',
  payCost: '支払いとして捨てた',
  discardEffect: '効果で捨てた',
  cleanup: 'クリーンナップで捨てた',
  draw: '市民デッキから引いた',
  search: '市民デッキから探して手札に加えた',
  draft: 'ドラフトで取った',
  play: 'プレイした',
  automate: 'オートメーション化した',
};
const ROW_NAME = { agr: '農業', for: '林業', min: '鉱業' } as const;
const TERRAIN_NAME: Record<string, string> = { W: '麦畑', F: '森林', M: '鉱山', S: '海', special: '特殊地形' };
const BLD: Record<string, string> = { tent: 'テント駒', house: '家駒', bldg: 'ビル駒', lab: '研究所駒', shop: 'ショップ駒', clock: '時計塔駒' };
const RES: Record<string, string> = { gold: 'G', wheat: '麦', wood: '木材', iron: '鉄' };
const SCORE: Record<string, string> = { vp: '勝利点', cp: '都市点', ip: '工業点' };

/** 見えていない情報を伏せる：他人が引いた・探した・ドラフトしたカードの中身（§2-6, §10） */
export function redact(e: GameEvent, viewer: number): GameEvent {
  if (e.t === 'card' && e.p !== viewer && (e.reason === 'draw' || e.reason === 'search' || e.reason === 'draft')) return { ...e, card: null };
  return e;
}

/** ログの1行。null は書かない出来事 */
export function eventText(s: GameState, e: GameEvent): string | null {
  const who = 'p' in e ? s.players[e.p].name : '';
  switch (e.t) {
    case 'disc':
      return `${who}：アクションエリア ${AREAS[e.area].id.replace(/\d/, '')}「${AREAS[e.area].label}」に${e.own ? '手元の' : ''}ディスクを置いた`;
    case 'tile':
      return `${who}：${TERRAIN_NAME[e.kind]}タイルを置いた`;
    case 'flip':
      return `${who}：地形タイルが裏返った`;
    case 'road':
      return `${who}：道駒を置いた`;
    case 'drawArea':
      return `${who}：追加ドローエリアをアクティブ化した`;
    case 'building':
      return `${who}：${BLD[e.type]}を置いた`;
    case 'rabbit':
      return `${who}：クッキーラビット駒を置いた`;
    case 'food':
      return null;
    case 'industry':
      return null;
    case 'locomotive':
      return `${who}：機関車駒を得た`;
    case 'pros':
      return e.firstToEnd ? `${who}：繁栄トラック（${PROS_TRACKS[e.track].label}）の右端に最初に到達した` : null;
    case 'card':
      if (e.card === null) return `${who}：カードを1枚${e.reason === 'draw' ? '引いた' : '手札に加えた'}`;
      return `${who}：${CARDS[e.card].nameJa}を${REASON_TEXT[e.reason]}${e.row ? `（${ROW_NAME[e.row]}列）` : ''}`;
    case 'reshuffle':
      return '捨て札を混ぜて市民デッキにした';
    case 'skill':
      return `${who}：スキルタイルを得た`;
    case 'skillFlip':
      return `${who}：スキルタイルをフリップした`;
    case 'ib':
      return `${who}：${ROW_NAME[e.row]}の産業ボーナスを得た`;
    case 'milestone':
      return `${who}：マイルストーンを獲得した`;
    case 'wonder':
      return `${who}：ワンダーアイコンを得た`;
    case 'support':
      return `${who}：ラウンド支援駒を${e.col + 1}列目に置いた`;
    case 'pass':
      return `${who}：パスした`;
    case 'delta': {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(e.res)) parts.push(`${RES[k]}${v! > 0 ? '+' : ''}${v}`);
      if (e.diamond) parts.push(`ダイヤ${e.diamond > 0 ? '+' : ''}${e.diamond}`);
      for (const [k, v] of Object.entries(e.income)) parts.push(`${RES[k]}の収入${v! > 0 ? '+' : ''}${v}`);
      for (const [k, v] of Object.entries(e.score)) parts.push(`${SCORE[k]}${v! > 0 ? '+' : ''}${v}`);
      if (e.discs) parts.push(`手元のディスク${e.discs > 0 ? '+' : ''}${e.discs}`);
      return parts.length ? `${who}：${parts.join('、')}` : null;
    }
    case 'phase':
      return e.phase === 'income' ? `第${e.round}ラウンド：収入フェイズ` : `第${e.round}ラウンド：アクションフェイズ`;
    case 'gameEnd':
      return 'ゲーム終了';
  }
}

/** 見せ場（§8.3）の札 */
export function showcaseText(s: GameState, e: GameEvent): string | null {
  if (e.t === 'building' && e.type === 'clock') return `${s.players[e.p].name}さんが時計塔駒を置いた`;
  if (e.t === 'milestone') return `${s.players[e.p].name}さんがマイルストーンを獲得`;
  if (e.t === 'pros' && e.firstToEnd) return `${s.players[e.p].name}さんが繁栄トラックの右端へ`;
  if (e.t === 'locomotive') return `${s.players[e.p].name}さんが機関車駒を獲得`;
  return null;
}

const BEAT_VAR: Partial<Record<GameEvent['t'], string>> = {
  disc: '--beat-disc',
  tile: '--beat-tile',
  flip: '--beat-flip',
  road: '--beat-road',
  building: '--beat-building',
  rabbit: '--beat-rabbit',
  food: '--beat-step',
  industry: '--beat-step',
  pros: '--beat-step',
  card: '--beat-card',
  ib: '--beat-chain',
  delta: '--beat-res',
  pass: '--beat-pass',
  drawArea: '--beat-drawarea',
  support: '--beat-disc',
};

function flashKey(e: GameEvent): string | null {
  switch (e.t) {
    case 'tile':
    case 'flip':
    case 'building':
    case 'rabbit':
      return `${e.p}|hex:${e.hex}`;
    case 'road':
      return `${e.p}|edge:${e.edge}`;
    case 'disc':
      return `area:${e.area}`;
    case 'delta':
      return `res:${e.p}`;
    default:
      return null;
  }
}

/** 前の盤面の写しに出来事を1つ当てる（駒・タイル・トラックだけ。残りは最後に真の盤面で描き直す） */
function applyVisual(v: GameState, e: GameEvent): void {
  switch (e.t) {
    case 'tile':
      v.players[e.p].hexes[e.hex].tile = { kind: e.kind, specialId: e.specialId, flipped: false };
      return;
    case 'flip': {
      const t = v.players[e.p].hexes[e.hex].tile;
      if (t) t.flipped = true;
      return;
    }
    case 'road':
      v.players[e.p].roads.push(e.edge);
      return;
    case 'building':
      v.players[e.p].hexes[e.hex].building = e.type;
      return;
    case 'rabbit':
      v.players[e.p].hexes[e.hex].rabbit = true;
      return;
    case 'food':
      v.players[e.p].food = e.pos;
      return;
    case 'industry':
      if (e.marker === 'carriage') v.players[e.p].carriage = e.pos;
      else v.players[e.p].loco = e.pos;
      return;
    case 'locomotive':
      v.players[e.p].loco = 0;
      return;
    case 'pros':
      v.players[e.p].pros[e.track] = e.pos;
      return;
    case 'disc':
      if (v.areas[e.area]) v.areas[e.area].slots[e.slot] = e.p;
      return;
  }
}

export interface Playback {
  display: GameState;
  playing: boolean;
  flash: Set<string>;
  showcase: string | null;
  skip: () => void;
}

export function usePlayback(state: GameState, prev: GameState | null, viewer: number, enabled: boolean, wasUndo: boolean): Playback {
  const [display, setDisplay] = useState(state);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [showcase, setShowcase] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);

  const finish = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setDisplay(state);
    setPlaying(false);
  };

  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const events = state.events.map((e) => redact(e, viewer));
    const actor = prev?.pending?.player ?? -1;
    if (!prev || wasUndo || !enabled || prefersReducedMotion() || events.length === 0) {
      setDisplay(state);
      setPlaying(false);
      const keys = new Set(events.map(flashKey).filter((k): k is string => !!k));
      setFlash(keys);
      const sc = events.map((e) => showcaseText(state, e)).find(Boolean) ?? null;
      setShowcase(sc);
      timers.current.push(window.setTimeout(() => setFlash(new Set()), 700));
      if (sc) timers.current.push(window.setTimeout(() => setShowcase(null), cssMs('--showcase', 1000)));
      return;
    }
    // 自分の操作は短く、他人の操作は標準の長さ
    const factor = actor === viewer ? 0.5 : 1;
    const beats = events.map((e) => ({ e, ms: (BEAT_VAR[e.t] ? cssMs(BEAT_VAR[e.t]!) : 0) * factor }));
    const total = beats.reduce((a, b) => a + b.ms, 0);
    const scale = total > PLAYBACK_MAX_MS ? PLAYBACK_MAX_MS / total : 1; // 上限を超える分は早回し
    const visual: GameState = structuredClone(prev);
    visual.pending = null; // 演出中は入力を止める
    setDisplay(structuredClone(visual));
    setPlaying(true);
    let t = 0;
    for (const { e, ms } of beats) {
      timers.current.push(
        window.setTimeout(() => {
          applyVisual(visual, e);
          setDisplay(structuredClone(visual));
          const k = flashKey(e);
          if (k) setFlash(new Set([k]));
          sound(e);
          const sc = showcaseText(state, e);
          if (sc) {
            setShowcase(sc);
            timers.current.push(window.setTimeout(() => setShowcase(null), cssMs('--showcase', 1000)));
          }
        }, t),
      );
      t += ms * scale;
    }
    timers.current.push(
      window.setTimeout(() => {
        setDisplay(state);
        setPlaying(false);
        setFlash(new Set());
      }, t + 60),
    );
    return () => timers.current.forEach((x) => window.clearTimeout(x));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return { display, playing, flash, showcase, skip: finish };
}
