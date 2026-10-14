// 効果言語で表していないタイル・欄のアイコン表記（原作の印刷と同じ並び：条件 → 白抜き矢印 → 得点）
import { ADV_SKILLS, SKILLS, SUPPORT_NORMAL } from '../../game/boards';
import { effToks, type Tok } from './EffIcons';

const vp = (n: number | string): Tok => ({ g: 'vp', n });
const arrow: Tok = { g: 'condOnce' };
const each: Tok = { g: 'condEach' };

/** スキルタイル（id 1..12）：種類のアイコン＋内容 */
export function skillToks(id: number, adv = false): Tok[] {
  const def = adv ? ADV_SKILLS[id - 1] : SKILLS[id - 1];
  const kind: Tok = { g: def.kind === 'instant' ? 'instant' : def.kind === 'pass' ? 'pass' : def.kind === 'flip' ? 'flip' : 'perm' };
  if (def.eff.length && !(adv && id === 11)) return [kind, ...effToks(def.eff)];
  if (!adv)
    switch (id) {
      case 4:
        return [kind, { g: 'rowSet', n: '1〜3' }, arrow, vp('6〜24')];
      case 5:
        return [kind, { g: 'food', n: '3〜9' }, arrow, vp('3〜7')];
      case 6:
        return [kind, { g: 'ipThisPass', n: '2〜8' }, arrow, vp('3〜10')];
      case 10:
        return [kind, { g: { k: 'building', place: true } }, each, vp(2)];
      case 11:
        return [kind, { g: 'rabbitPlace' }, each, vp(3)];
      case 12:
        return [kind, { g: { k: 'ib' } }, each, vp(3)];
    }
  switch (id) {
    case 1:
      return [kind, { g: { k: 'city' }, n: '1〜5' }, arrow, vp('3〜15')];
    case 2:
      return [kind, { g: 'portLink', n: '1〜4' }, arrow, vp('2〜20')];
    case 3:
      return [kind, { g: { k: 'tag', tag: 'ショートケーキ' }, n: '最多' }, each, vp(2)];
    case 9:
      return [kind, { g: { k: 'income', res: 'gold' }, n: '+N' }, each, vp('N')];
    case 10:
      return [kind, { g: { k: 'tag', tag: 'ブラウニー' } }, { sep: '×' }, { g: 'gold', n: '-1', cost: true }];
    case 11:
      return [kind, { g: 'automated', n: '上限+1' }, { sep: '・' }, { g: 'drawAutomate' }];
    case 12:
      return [kind, { g: 'card' }, each, vp(2)];
    case 13:
      return [kind, { g: 'wood', n: 3, cost: true }, { g: 'payOnce' }, { g: 'roadPlace', n: 3 }];
    case 14:
      return [kind, { g: 'wheat', n: 4, cost: true }, { g: 'payOnce' }, { g: { k: 'hex', kind: 'any' }, n: 3 }];
  }
  return [kind];
}

/** ラウンド支援タイル */
export function supportToks(id: number): Tok[] {
  if (id > 100) {
    const pass: Tok = { g: 'pass' };
    switch (id) {
      case 101:
        return [pass, { g: { k: 'city' } }, each, vp(3)];
      case 102:
        return [pass, { g: { k: 'played' } }, each, vp(1)];
      case 103:
        return [pass, { g: { k: 'hex', kind: 'any' }, n: '最多' }, each, vp(1)];
      case 104:
        return [pass, { g: 'portLink' }, each, vp(3)];
      case 105:
        return [pass, { g: { k: 'income', res: 'any' }, n: '最小' }, arrow, vp('=')];
    }
  }
  const def = SUPPORT_NORMAL[id - 1];
  if (def.kind === 'income') return [{ g: 'incomePhase' }, ...effToks(def.eff)];
  if (id === 13) return [{ g: 'perm' }, { g: 'card' }, { g: 'gold', n: '-3', cost: true }];
  if (id === 14) return [{ g: 'perm' }, { g: 'automated' }, { g: 'diamond', n: '-1', cost: true }];
  return [{ g: 'perm' }, { g: { k: 'building', place: true } }, { g: 'iron', n: '-1', cost: true }];
}

/** マイルストーン（条件 → 10勝利点） */
export function milestoneToks(key: string): Tok[] {
  const c: Record<string, Tok[]> = {
    '1a': [{ g: { k: 'hex', kind: 'W' } }, { sep: '+' }, { g: { k: 'hex', kind: 'S' }, n: 10 }],
    '1b': [{ g: { k: 'hex', kind: 'F' } }, { sep: '+' }, { g: { k: 'hex', kind: 'M' }, n: 10 }],
    '2a': [{ g: { k: 'building' }, n: 5 }],
    '2b': [{ g: 'portLink', n: 2 }],
    '3a': [{ g: 'food', n: 7 }],
    '3b': [{ g: 'wonder', n: 2 }],
    '4a': [{ g: { k: 'played' }, n: 6 }],
    '4b': [{ g: { k: 'tag', tag: 'ショートケーキ' }, n: 4 }],
    '5a': [{ g: { k: 'income', res: 'gold' }, n: 30 }],
    '5b': [{ g: { k: 'pros' }, n: '同色5' }],
    '6a': [{ g: 'indTrack', n: 8 }],
    '6b': [{ g: 'vp', n: 15 }],
  };
  return [...(c[key] ?? []), arrow, vp(10)];
}

/** 最終得点計算タイル（ゲーム終了時：1位15・2位7） */
export function finalToks(id: number): Tok[] {
  const c: Record<number, Tok[]> = {
    1: [{ g: { k: 'hex', kind: 'any' }, n: '最多' }],
    2: [{ g: { k: 'income', res: 'any' }, n: '最大' }],
    3: [{ g: 'automated' }],
    4: [{ g: { k: 'hex', kind: 'any' }, n: '外周' }],
  };
  return [{ g: 'endgame' }, ...c[id], arrow, vp('15/7')];
}

/** 繁栄トラックの対象（数えるもの） */
export const PROS_SUBJECT: Tok[] = [
  { g: { k: 'hex', kind: 'any' } },
  { g: 'rabbit' },
  { g: 'road' },
  { g: { k: 'building' } },
  { g: 'automated' },
  { g: 'ip' },
];

/** キャラクター固有のフリーアクション */
export const CHAR_ABILITY_TOKS: Record<string, Tok[]> = {
  biscuit: [{ g: { k: 'city', with: 'lab' } }, each, { g: 'indAdvance', n: 1 }],
  lotus: [{ g: 'hexFlip' }],
  solbee3: [{ g: 'food', n: 3 }, arrow, { g: 'wheat', n: 1 }],
  solbee5: [{ g: 'food', n: 5 }, arrow, { g: 'roadPlace', n: 1 }],
  solbee9: [{ g: 'food', n: 9 }, arrow, { g: { k: 'pros' }, n: 1 }],
  sakura: [{ g: 'handCard', n: 1, cost: true }, { g: 'payOnce' }, { g: 'disc' }],
};
/** キャラクターの上方修正（docs/decisions_16）で書き換わるもの */
export const CHAR_ABILITY_TOKS_BUFF: Record<string, Tok[]> = {
  biscuit: [{ g: { k: 'building', type: 'lab' } }, each, { g: 'indAdvance', n: 1 }],
};

/** メインボードのフリーアクション欄 */
export const FREE_TOKS: Record<string, Tok[]> = {
  fa1: [{ g: 'handCard', n: 1, cost: true }, { g: 'anyBasic', n: 3, cost: true }, { g: 'payOnce' }, { g: { k: 'hex', kind: 'any' }, n: 1 }, { sep: '/' }, { g: 'roadPlace', n: 1 }],
  fa2: [{ g: 'gold', n: 15, cost: true }, { g: 'payOnce' }, { g: { k: 'draw', n: 1 } }],
  fa3: [{ g: 'gold', n: 4, cost: true }, { g: 'payOnce' }, { g: 'anyBasic', n: 1 }],
  fa4: [{ g: 'milestone' }],
  fa5: [{ g: 'anyBasic', n: 1, cost: true }, { g: 'payOnce' }, { g: 'gold', n: 1 }],
  fa6: [{ g: 'anyBasic', n: 3, cost: true }, { g: 'payOnce' }, { g: 'anyBasic', n: 1 }],
  fa7: [{ g: 'disc', n: 1, cost: true }, { sep: '/' }, { g: 'handCard', n: 1, cost: true }, { g: 'payOnce' }, { g: 'anyBasic', n: 2 }],
  fa8: [{ g: { k: 'building', type: 'clock', place: true } }],
};

