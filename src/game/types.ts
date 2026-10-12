// ゲーム状態と効果言語の型（rules 準拠。条項番号はコメントで示す）
import type { EdgeKey, HexKey } from './geometry';

export type Basic = 'wheat' | 'wood' | 'iron';
export type ResKind = 'gold' | Basic;
export type Terrain = 'W' | 'F' | 'M' | 'S'; // 麦畑・森林・鉱山・海
export type Row = 'agr' | 'for' | 'min'; // 産業列：農業・林業・鉱業（§6.9）
export type ProsColor = 'O' | 'G' | 'Y'; // オレンジ・緑・灰（§6.8）
export type BuildingType = 'tent' | 'house' | 'bldg' | 'lab' | 'shop' | 'clock';
export type Tag = 'ショートケーキ' | 'タルト' | 'ブラウニー' | 'ティラミス' | 'マカロン' | '和菓子';
export const TAGS: Tag[] = ['ショートケーキ', 'タルト', 'ブラウニー', 'ティラミス', 'マカロン', '和菓子'];
export type ScoreKind = 'vp' | 'cp' | 'ip';

export type Res = Record<ResKind, number>;

/** 支払い（§2.3, §6.1） */
export interface Cost {
  gold?: number;
  wheat?: number;
  wood?: number;
  iron?: number;
  diamond?: number;
  anyBasic?: number; // 任意の基礎資源（組み合わせ自由）
  hand?: number; // 手札を捨てる
  income?: Partial<Res>; // 収入値を下げる
  disc?: number; // 手元のアクションディスクを戻す
}

/** 条件・数え上げの対象 */
export type Counter =
  | { k: 'tag'; tag: Tag }
  | { k: 'terrain'; kind: Terrain | 'any'; backOnly?: boolean }
  | { k: 'bldOn'; kind: Terrain }
  | { k: 'bld'; type?: BuildingType }
  | { k: 'city' }
  | { k: 'rabbit' }
  | { k: 'played'; row?: Row | 'all' }
  | { k: 'auto' }
  | { k: 'food' }
  | { k: 'score'; kind: ScoreKind }
  | { k: 'income'; res: ResKind }
  | { k: 'res'; res: ResKind | 'diamond' };

export interface CondItem {
  counter: Counter;
  n: number;
}

/** 効果言語。データとして持ち、エンジンが1つずつ解決する（decisions §4.2） */
export type Eff =
  | { k: 'gain'; res: Partial<Res> & { diamond?: number } }
  | { k: 'anyBasic'; n: number }
  | { k: 'income'; res: ResKind; n: number }
  | { k: 'terrain'; n: number; kind: Terrain | 'any' } // n枚まで置く
  | { k: 'road'; n: number } // n個まで置く
  | { k: 'mix'; terrain: number; road: number } // 任意の順で
  | { k: 'building'; n: number; viaAction: boolean; onTerrain?: Terrain; extraWood?: number }
  | { k: 'food'; n: number }
  | { k: 'industry'; n: number }
  | { k: 'pros'; n: number; color?: ProsColor }
  | { k: 'rabbit'; n: number }
  | { k: 'draw'; n: number }
  | { k: 'skill'; n: number }
  | { k: 'ib'; row?: Row }
  | { k: 'score'; kind: ScoreKind; n: number }
  | { k: 'wonder' }
  | { k: 'disc' }
  | { k: 'choice'; options: Eff[][] }
  | { k: 'pay'; cost: Cost; then: Eff[]; repeat?: boolean }
  | { k: 'cond'; items: CondItem[]; each: boolean; then: Eff[] }
  | { k: 'search'; tag?: Tag; pass?: boolean; n: number }
  | { k: 'flipAny' }
  | { k: 'drawAutomate' } // 1枚引き、手札から1枚を無料でオートメーション化（即時能力は発動しない）
  | { k: 'discardDraw'; draw: number; discard: number }
  | { k: 'special'; id: string };

// ---- カード ----
export interface CardDef {
  id: string;
  nameJa: string;
  nameEn: string;
  type: 'immediate' | 'pass';
  cost: number;
  brownie: boolean;
  tags: Partial<Record<Tag, number>>;
  industry: Row | 'all' | null;
  main: Eff[]; // 即時能力（パス時カードはパス時能力）
  auto: Eff[] | null;
  mainText: string;
  autoText: string | null;
}

// ---- 選択待ち ----
export interface Option {
  id: string; // 一意な識別子（UI が盤面の要素と対応付ける）
  label: string;
  data?: Record<string, unknown>;
}

export interface Pending {
  player: number;
  kind: string; // 'turn' | 'hex' | 'edge' | 'pick' | ...
  prompt: string;
  options: Option[];
  resume: Task; // 回答を受けて続きを解決するタスク
  step: string; // タスク内のどの段階の選択か
  /** 同時に選べる席（手札のドラフトのみ）。このとき options は全員分の和で、各選択肢の data.player が選ぶ席を表す。
   *  player は waiting の先頭（ホットシートではこの順に回答する） */
  waiting?: number[];
}

// ---- タスク（効果の解決単位） ----
export interface Task {
  player: number;
  eff: Eff;
  src?: string; // 由来（ログ用）
  ctx?: Record<string, unknown>;
}

export interface MapHex {
  terrain: Terrain | 'X' | 'C'; // X=特殊地形ヘクス, C=首都
  icon: string | null;
  iconTaken: boolean;
  tile: null | { kind: Terrain | 'special'; specialId?: number; flipped: boolean };
  building: BuildingType | null;
  rabbit: boolean;
}

export interface PlayerState {
  seat: number;
  name: string;
  character: string | null;
  mapId: string | null; // 使う面（'A' または 'B1'〜'B5'）
  mapBoard: string | null; // 受け取った地図ボード（B面の仮番号 'B1'〜'B5' で呼ぶ。rules v1.1 §2.2）
  res: Res;
  diamond: number;
  income: Res;
  hand: string[];
  played: string[]; // 手元の即時カード（非オートメーション）とパス時カード
  automated: Record<Row, string[]>;
  taken: Record<'tent' | 'house' | 'bldg' | 'lab', number>; // 個人ボード・工業発展ボードから取った数
  shopsTaken: Row[];
  clockPlaced: boolean;
  rabbitsTaken: number;
  food: number;
  carriage: number;
  loco: number | null;
  pros: number[]; // 6本
  score: Record<ScoreKind, number>;
  discs: number;
  skills: { id: number; adv: boolean; flipped: boolean }[];
  woodDiscount: number;
  wonders: number;
  usedFree: string[]; // ラウンドに1回のフリーアクション
  carmenCubes: number;
  lotusRate: boolean;
  hexes: Record<HexKey, MapHex>;
  roads: EdgeKey[];
  drawAreas: boolean[];
  passed: boolean;
  passOrder: number | null;
  supportSpace: number | null;
  ipThisPass: number;
  gretelBonus: number;
}

export interface ActionSpaceState {
  area: string; // 'A'..'Q', 'G'.., 'L1','L2','K8','J2','H2','I2'
  slots: (number | null)[]; // 置いたプレイヤー
}

export interface GameConfig {
  players: number; // 2〜4
  names: string[];
  /** freeChar：キャラクターの自由選択（rules v1.1 §10.4）。setupDraft：準備のドラフト（§10.5）。
   *  2つは後から足したため省略可（以前の記録では未定義＝不採用） */
  variants: { turnOrder: boolean; draft: boolean; advSkills: boolean; freeChar?: boolean; setupDraft?: boolean };
}

export type Phase = 'setup' | 'start' | 'income' | 'action' | 'cleanup' | 'end';

/** 1回の applyMove の中で起きた出来事（UI の演出とログ用。ui_design §8, §10） */
export type CardMoveReason = 'handCost' | 'payCost' | 'discardEffect' | 'cleanup' | 'draw' | 'search' | 'draft' | 'play' | 'automate';
export type GameEvent =
  | { t: 'disc'; p: number; area: string; slot: number; own: boolean }
  | { t: 'tile'; p: number; hex: HexKey; kind: Terrain | 'special'; specialId?: number }
  | { t: 'flip'; p: number; hex: HexKey }
  | { t: 'road'; p: number; edge: EdgeKey }
  | { t: 'drawArea'; p: number; index: number }
  | { t: 'building'; p: number; hex: HexKey; type: BuildingType }
  | { t: 'rabbit'; p: number; hex: HexKey }
  | { t: 'food'; p: number; pos: number }
  | { t: 'industry'; p: number; marker: 'carriage' | 'loco'; pos: number; over: boolean }
  | { t: 'locomotive'; p: number }
  | { t: 'pros'; p: number; track: number; pos: number; firstToEnd: boolean }
  | { t: 'card'; p: number; card: string | null; reason: CardMoveReason; row?: Row } // card=null は非公開
  | { t: 'reshuffle' }
  | { t: 'skill'; p: number; id: number; adv: boolean }
  | { t: 'skillFlip'; p: number; id: number; adv: boolean }
  | { t: 'ib'; p: number; row: Row }
  | { t: 'milestone'; p: number; idx: number }
  | { t: 'wonder'; p: number }
  | { t: 'support'; p: number; col: number }
  | { t: 'pass'; p: number }
  | { t: 'delta'; p: number; res: Partial<Res>; diamond: number; income: Partial<Res>; score: Partial<Record<ScoreKind, number>>; discs: number }
  | { t: 'phase'; round: number; phase: Phase }
  | { t: 'gameEnd' };

export interface GameState {
  config: GameConfig;
  rng: number;
  round: number;
  phase: Phase;
  startPlayer: number;
  turnOrder: number[];
  current: number;
  players: PlayerState[];
  deck: string[];
  discard: string[];
  areas: Record<string, ActionSpaceState>;
  revealed: string[]; // 公開済みの応用エリア
  supportTiles: (number | null)[][]; // [列][0=上段,1=下段] タイルID（パス時は 100+）
  supportMarkers: (number | null)[]; // 列ごとに置かれたプレイヤー
  supportCols: number[]; // 使用する列
  skillPiles: number[]; // 12種の残数
  advSkills: number[]; // 場に並んだ上級スキルタイル
  milestones: { id: number; side: 'a' | 'b'; takenBy: number | null }[];
  milestonesClosed: boolean;
  finalTiles: number[];
  specialSupply: number[];
  terrainSupply: Record<Terrain, number>;
  prosEndClaimed: (number | null)[];
  queue: Task[];
  pending: Pending | null;
  turnMainDone: boolean;
  turnActive: boolean;
  ibDepth: number;
  ibDeferred: Task[];
  draftPacks: string[][]; // 手札のドラフト（ヴァリアント）
  draftPicked: string[][];
  passCount: number;
  log: string[];
  events: GameEvent[]; // 直前の applyMove で起きた出来事
  setupStep: number;
  finished: boolean;
}
