// 合法手の対象参照（ui_design §5, §15）。
// 合法手 1つが盤面のどの要素に当たるかを返す。UI はこの参照だけを見て所作を決める。
// ルールの判定は行わない（合法かどうかは getOptions が正）。
import type { BuildingType, GameState, Option, ResKind, Row } from './types';

export type PieceKind = 'tent' | 'house' | 'bldg' | 'lab' | `shop:${Row}`;

export type Target =
  // (a) 持って置く
  | { k: 'placeDisc'; area: string; copyTarget: string | null; own: boolean } // ディスク → アクションエリア
  | { k: 'cardToTableau'; card: string } // 手札 → 手元
  | { k: 'cardToDiscard'; card: string } // 手札 → 捨て札置き場
  | { k: 'cardToRow'; card: string; row: Row; from: 'hand' | 'tableau' } // カード → 産業列
  | { k: 'cardToHand'; card: string; from: 'search' | 'draft' } // 小窓 → 手札
  | { k: 'cardToKeep'; card: string } // 手札 → 持ち越し枠
  | { k: 'cardToFree'; slot: 'fa1' | 'fa7h' | 'sakura' } // 手札 → フリーアクションのマス（カードは後の payHand で先回り回答）
  | { k: 'discToFree' } // 手元のディスク → ❼
  | { k: 'diamondToDisc' } // ダイヤ → ディスクの上（グレーテル）
  | { k: 'tileToHex'; hex: string; kind: 'W' | 'F' | 'M' | 'S' | 'X' }
  | { k: 'specialTile'; id: number } // 特殊地形タイル（ヘクスは直前の選択で決まっている）
  | { k: 'roadToEdge'; edge: string }
  | { k: 'pieceTake'; piece: PieceKind } // 建物駒を取る（続く bldSpot で置き先）
  | { k: 'pieceToHex'; hex: string; piece: BuildingType | 'rabbit' }
  | { k: 'clockTake' } // 時計塔駒を取る（fa8）
  | { k: 'supportMarker'; col: number }
  | { k: 'skillTake'; id: number; adv: boolean }
  // (b) 直接触る
  | { k: 'skillFlip'; id: number; adv: boolean }
  | { k: 'hexFlip'; hex: string }
  | { k: 'industryMarker'; marker: 'carriage' | 'loco'; over: boolean }
  | { k: 'prosMarker'; track: number }
  | { k: 'incomeTrack'; res: ResKind }
  | { k: 'industryRow'; row: Row }
  | { k: 'freeSlot'; slot: 'fa2' | 'fa3' | 'fa5' | 'fa6' }
  | { k: 'milestone'; idx: number }
  | { k: 'charAbility'; key: string }
  | { k: 'effectLine'; idx: number }
  | { k: 'setupChar'; name: string }
  | { k: 'setupMap'; id: string }
  // (c) 宣言する
  | { k: 'basicSplit'; wheat: number; wood: number; iron: number; mode: 'gain' | 'pay' }
  | { k: 'woodSplit'; wheat: number; wood: number }
  | { k: 'choice'; idx: number; label: string }
  | { k: 'button'; role: 'pass' | 'endTurn' | 'stop' | 'skip' | 'pay' };

/** 合法手の対象参照。対応が分からないものは null（UI は安全網に落とす） */
export function targetOf(s: GameState, opt: Option): Target | null {
  const pd = s.pending;
  if (!pd) return null;
  const id = opt.id;
  const d = (opt.data ?? {}) as Record<string, unknown>;
  const step = pd.step;

  // 共通のボタン
  if (id === 'stop') return { k: 'button', role: 'stop' };
  if (id === 'skip') return { k: 'button', role: 'skip' };

  switch (step) {
    case 'turn':
      return turnTarget(id, d);
    case 'terrain':
    case 'road':
    case 'mix': {
      if (id.startsWith('hex:')) {
        const hex = String(d.hex);
        const h = s.players[pd.player].hexes[hex];
        return { k: 'tileToHex', hex, kind: h.terrain as 'W' | 'F' | 'M' | 'S' | 'X' };
      }
      if (id.startsWith('edge:')) return { k: 'roadToEdge', edge: String(d.edge) };
      return null;
    }
    case 'special':
      return { k: 'specialTile', id: Number(id.split(':')[1]) };
    case 'bldPiece':
      return { k: 'pieceTake', piece: d.piece as PieceKind };
    case 'bldSpot': {
      const piece = (pd.resume.ctx as Record<string, unknown> | undefined)?.piece as PieceKind | undefined;
      const type: BuildingType = !piece ? 'tent' : piece.startsWith('shop') ? 'shop' : (piece as BuildingType);
      return { k: 'pieceToHex', hex: String(d.hex), piece: type };
    }
    case 'clockPlace':
      return { k: 'pieceToHex', hex: String(d.hex), piece: 'clock' };
    case 'rabbit':
      return { k: 'pieceToHex', hex: String(d.hex), piece: 'rabbit' };
    case 'flipAny':
      return { k: 'hexFlip', hex: String(d.hex) };
    case 'support':
    case 'passMove':
      return { k: 'supportMarker', col: Number(d.col) };
    case 'industry':
      return { k: 'industryMarker', marker: d.marker as 'carriage' | 'loco', over: id.endsWith(':over') };
    case 'pros':
      return { k: 'prosMarker', track: Number(d.track) };
    case 'incomeAny':
      return { k: 'incomeTrack', res: id.split(':')[1] as ResKind };
    case 'ibRow':
      return { k: 'industryRow', row: id.split(':')[1] as Row };
    case 'skill':
      return { k: 'skillTake', id: Number(d.id), adv: Boolean(d.adv) };
    case 'handCost':
      if (id === 'diamond') return { k: 'diamondToDisc' };
      return { k: 'cardToDiscard', card: String(d.card) };
    case 'payHand':
    case 'discard':
      return { k: 'cardToDiscard', card: String(d.card) };
    case 'automateOffer': {
      const card = String((pd.resume.ctx as Record<string, unknown>).card);
      return { k: 'cardToRow', card, row: d.row as Row, from: 'tableau' };
    }
    case 'freeAutomate':
      return { k: 'cardToRow', card: String(d.card), row: d.row as Row, from: 'hand' };
    case 'sakuraPlay':
      return { k: 'cardToTableau', card: String(d.card) };
    case 'keep':
      return { k: 'cardToKeep', card: String(d.card) };
    case 'search':
      return { k: 'cardToHand', card: String(d.card), from: 'search' };
    case 'draftPick':
      return { k: 'cardToHand', card: String(d.card), from: 'draft' };
    case 'anyBasic':
    case 'payBasic': {
      const c = d as { wheat: number; wood: number; iron: number };
      return { k: 'basicSplit', wheat: c.wheat, wood: c.wood, iron: c.iron, mode: step === 'anyBasic' ? 'gain' : 'pay' };
    }
    case 'areaCost':
      return { k: 'woodSplit', wheat: Number(d.wheat), wood: Number(d.wood) };
    case 'choice':
      return { k: 'choice', idx: Number(id.split(':')[1]), label: opt.label };
    case 'payConfirm':
      return id === 'pay' ? { k: 'button', role: 'pay' } : null;
    case 'orderEffects':
      return { k: 'effectLine', idx: Number(id.split(':')[1]) };
    case 'setupChar':
      return { k: 'setupChar', name: id.slice(5) };
    case 'setupMap':
      return { k: 'setupMap', id: id.slice(4) };
    case 'setupPick':
      // 準備のドラフト（rules v1.1 §10.5）：種類ごとに、通常の準備と同じ対象を指す
      if (id.startsWith('char:')) return { k: 'setupChar', name: id.slice(5) };
      if (id.startsWith('map:')) return { k: 'setupMap', id: id.slice(4) };
      return { k: 'supportMarker', col: Number(d.col) };
  }
  return null;
}

function turnTarget(id: string, d: Record<string, unknown>): Target | null {
  if (id === 'pass') return { k: 'button', role: 'pass' };
  if (id === 'endTurn') return { k: 'button', role: 'endTurn' };
  if (id.startsWith('area:')) return { k: 'placeDisc', area: String(d.area), copyTarget: (d.target as string | null) ?? null, own: Boolean(d.disc) };
  if (id.startsWith('play:')) return { k: 'cardToTableau', card: String(d.card) };
  if (id.startsWith('flip:')) return { k: 'skillFlip', id: Number(d.id), adv: Boolean(d.adv) };
  if (id === 'fa1' || id === 'fa7h') return { k: 'cardToFree', slot: id };
  if (id === 'fa2' || id === 'fa3' || id === 'fa5' || id === 'fa6') return { k: 'freeSlot', slot: id };
  if (id === 'fa7d') return { k: 'discToFree' };
  if (id === 'fa8') return { k: 'clockTake' };
  if (id.startsWith('fa4:')) return { k: 'milestone', idx: Number(d.idx) };
  if (id === 'faC:sakura') return { k: 'cardToFree', slot: 'sakura' };
  if (id.startsWith('faC:')) return { k: 'charAbility', key: id.slice(4) };
  return null;
}
