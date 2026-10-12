// 「合法手の種類 → 所作」の対応表（ui_design §5）。
// 合法手（getOptions）と対象参照（targetOf）だけから、画面で使える所作を機械的に組み立てる。
// 画面側で合法性は計算しない。2つの選択に一度に答える所作は、ゲーム処理で1手先を読んで作る。
import { applyMove, getOptions } from '../game/engine';
import { targetOf, type Target } from '../game/targets';
import type { GameState, Option } from '../game/types';

/** 1つの所作が送る合法手 ID の列。prefill は後で来る選択への先回りの回答 */
export interface Move {
  ids: string[];
  prefill?: { step: string; id: string };
  label: string;
  confirm?: string; // 取り消せない操作の確認文
}

export type DeclareKind = 'basicGain' | 'basicPay' | 'woodSplit' | 'choice';

export interface Affordances {
  /** (a) 持って置く：出発点 → 置き先 → 所作 */
  drags: Map<string, Map<string, Move>>;
  /** (b) 直接触る：対象 → 所作 */
  clicks: Map<string, Move>;
  /** (c) 宣言する：ボタン */
  buttons: { role: string; move: Move }[];
  /** 内訳や選択肢のパネル */
  declare: { kind: DeclareKind; moves: { move: Move; split?: Record<string, number> }[] } | null;
  /** コピー（特殊アクションL）：エリア → コピー先 → 所作 */
  copies: Map<string, Map<string, Move>>;
  /** 安全網：上のどれにも当たらなかった合法手 */
  fallback: Option[];
}

const BUTTON_LABEL: Record<string, string> = {
  pass: 'パス',
  endTurn: '手番を終える',
  stop: 'ここで終える',
  skip: 'しない',
  pay: '支払う',
};

function addDrag(a: Affordances, src: string, dest: string, move: Move): void {
  if (!a.drags.has(src)) a.drags.set(src, new Map());
  a.drags.get(src)!.set(dest, move);
}

/** 1手先の合法手（2つの選択に一度に答える所作のため） */
function lookahead(s: GameState, id: string): { s: GameState; opts: Option[] } | null {
  try {
    const n = applyMove(s, id);
    if (!n.pending || n.pending.player !== s.pending!.player) return null;
    return { s: n, opts: getOptions(n) };
  } catch {
    return null;
  }
}

export function buildAffordances(s: GameState): Affordances {
  const a: Affordances = { drags: new Map(), clicks: new Map(), buttons: [], declare: null, copies: new Map(), fallback: [] };
  const pd = s.pending;
  if (!pd) return a;
  const step = pd.step;
  for (const opt of getOptions(s)) {
    const t = targetOf(s, opt);
    if (!t || !place(s, a, t, opt, step)) a.fallback.push(opt);
  }
  return a;
}

function place(s: GameState, a: Affordances, t: Target, opt: Option, step: string): boolean {
  const one = (label = opt.label): Move => ({ ids: [opt.id], label });
  switch (t.k) {
    case 'placeDisc': {
      const src = t.own ? 'disc:own' : 'disc:supply';
      if (t.copyTarget) {
        const key = `${src}>${t.area}`;
        if (!a.copies.has(key)) a.copies.set(key, new Map());
        a.copies.get(key)!.set(t.copyTarget, one());
        addDrag(a, src, `area:${t.area}`, { ids: [], label: 'コピー先を選ぶ' });
      } else addDrag(a, src, `area:${t.area}`, one());
      return true;
    }
    case 'cardToTableau':
      addDrag(a, `card:${t.card}`, 'tableau', one());
      return true;
    case 'cardToDiscard':
      addDrag(a, `card:${t.card}`, 'discard', one());
      // 手札で払う場面（フリーアクションなどの支払い）では、カードをクリックしても選べる
      if (step === 'payHand') a.clicks.set(`card:${t.card}`, one());
      return true;
    case 'cardToRow':
      addDrag(a, t.from === 'hand' ? `card:${t.card}` : `tableau:${t.card}`, `row:${t.row}`, one());
      // プレイしたばかりのカード（オートメーション化の申し出）は1枚だけなので、置き先の列をクリックしても選べる
      if (t.from === 'tableau') a.clicks.set(`row:${t.row}`, one());
      return true;
    case 'cardToHand': {
      const src = `${t.from}:${t.card}`;
      addDrag(a, src, 'hand', one());
      a.clicks.set(src, one());
      return true;
    }
    case 'cardToKeep':
      addDrag(a, `card:${t.card}`, 'keep', { ...one(), confirm: '残りの手札を捨てて、このカードを次のラウンドに残します。よろしいですか' });
      return true;
    case 'cardToFree':
      // 手札を使うフリーアクションは、先にフリーアクションのマス（サクラは能力）をクリックし、
      // そのあとの支払い（payHand）で手札のカードを選ぶ
      a.clicks.set(t.slot === 'sakura' ? 'char:sakura' : t.slot === 'fa1' ? 'free:fa1' : 'free:fa7', one());
      return true;
    case 'discToFree':
      addDrag(a, 'disc:own', 'free:fa7', one());
      return true;
    case 'diamondToDisc':
      addDrag(a, 'diamond', 'discard', one('ダイヤで払う'));
      return true;
    case 'tileToHex': {
      if (t.kind === 'X') {
        // 特殊地形ヘクス：特殊地形タイルを選んで置く（2つの選択に一度に答える）
        const la = lookahead(s, opt.id);
        if (la)
          for (const o of la.opts) {
            const tt = targetOf(la.s, o);
            if (tt?.k === 'specialTile') addDrag(a, `special:${tt.id}`, `hex:${t.hex}`, { ids: [opt.id, o.id], label: o.label });
          }
      } else addDrag(a, `tile:${t.kind}`, `hex:${t.hex}`, one());
      a.clicks.set(`hex:${t.hex}`, one());
      return true;
    }
    case 'specialTile':
      a.clicks.set(`special:${t.id}`, one());
      return true;
    case 'roadToEdge':
      addDrag(a, 'road', `edge:${t.edge}`, one());
      a.clicks.set(`edge:${t.edge}`, one());
      return true;
    case 'pieceTake': {
      const la = lookahead(s, opt.id);
      if (!la) return false;
      for (const o of la.opts) {
        const tt = targetOf(la.s, o);
        if (tt?.k === 'pieceToHex') addDrag(a, `piece:${t.piece}`, `hex:${tt.hex}`, { ids: [opt.id, o.id], label: opt.label });
      }
      return true;
    }
    case 'pieceToHex':
      // bldSpot は通常 pieceTake の先読みで答えるが、単独で来た場合もドラッグとクリックで受ける
      addDrag(a, `piece:${t.piece}`, `hex:${t.hex}`, one());
      a.clicks.set(`hex:${t.hex}`, one());
      return true;
    case 'clockTake': {
      const la = lookahead(s, opt.id);
      if (!la) return false;
      for (const o of la.opts) {
        const tt = targetOf(la.s, o);
        if (tt?.k === 'pieceToHex') addDrag(a, 'piece:clock', `hex:${tt.hex}`, { ids: [opt.id, o.id], label: '時計塔駒を置く' });
      }
      return true;
    }
    case 'supportMarker':
      addDrag(a, 'marker:support', `support:${t.col}`, one());
      a.clicks.set(`support:${t.col}`, one());
      return true;
    case 'skillTake': {
      const src = t.adv ? `advskill:${t.id}` : `skillpile:${t.id}`;
      addDrag(a, src, 'skills', one());
      a.clicks.set(src, one());
      return true;
    }
    case 'skillFlip':
      a.clicks.set(`skill:${t.adv ? 'a' : 's'}${t.id}`, one());
      return true;
    case 'hexFlip':
      a.clicks.set(`hex:${t.hex}`, one());
      return true;
    case 'industryMarker':
      a.clicks.set(`marker:${t.marker}`, one());
      return true;
    case 'prosMarker':
      a.clicks.set(`pros:${t.track}`, one());
      return true;
    case 'incomeTrack':
      a.clicks.set(`income:${t.res}`, one());
      return true;
    case 'industryRow':
      a.clicks.set(`row:${t.row}`, one());
      return true;
    case 'freeSlot':
      a.clicks.set(`free:${t.slot}`, one());
      return true;
    case 'milestone':
      a.clicks.set(`milestone:${t.idx}`, one());
      return true;
    case 'charAbility':
      a.clicks.set(`char:${t.key}`, one());
      return true;
    case 'effectLine':
      a.clicks.set(`effect:${t.idx}`, one());
      return true;
    case 'setupChar':
      a.clicks.set(`setupChar:${t.name}`, one());
      return true;
    case 'setupMap':
      a.clicks.set(`setupMap:${t.id}`, one());
      return true;
    case 'basicSplit': {
      const kind: DeclareKind = t.mode === 'gain' ? 'basicGain' : 'basicPay';
      if (!a.declare) a.declare = { kind, moves: [] };
      a.declare.moves.push({ move: one(), split: { wheat: t.wheat, wood: t.wood, iron: t.iron } });
      return true;
    }
    case 'woodSplit':
      if (!a.declare) a.declare = { kind: 'woodSplit', moves: [] };
      a.declare.moves.push({ move: one(), split: { wheat: t.wheat, wood: t.wood } });
      return true;
    case 'choice':
      if (!a.declare) a.declare = { kind: 'choice', moves: [] };
      a.declare.moves.push({ move: one(t.label) });
      return true;
    case 'button': {
      let label = BUTTON_LABEL[t.role];
      if (t.role === 'skip' && step === 'automateOffer') label = 'オートメーション化しない';
      if (t.role === 'skip' && step === 'payConfirm') label = opt.label;
      if (t.role === 'skip' && step === 'freeAutomate') label = 'オートメーション化しない';
      const move: Move = { ...one(label) };
      if (t.role === 'pass') move.confirm = 'パスすると、このラウンドはもう手番がありません。パスしますか';
      a.buttons.push({ role: t.role, move });
      return true;
    }
  }
  return false;
}

/** 出発点として持ち上げられるか */
export const canLift = (a: Affordances, src: string) => a.drags.has(src);
/** 持ち上げた出発点を置ける先 */
export const destsOf = (a: Affordances, src: string | null) => (src ? a.drags.get(src) ?? new Map<string, Move>() : new Map<string, Move>());
