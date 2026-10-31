// ゲーム進行エンジン（rules §2〜§9）。純粋関数：applyMove は新しい state を返す。
import {
  ADV_SKILLS,
  skillDef,
  AREAS,
  BASIC_AREAS,
  BUILDING_LABEL,
  BUILDING_ROW,
  CAPITAL_BONUS,
  CITY_RATE,
  FINAL_TILES,
  FOOD_BONUS,
  FOOD_END,
  GRID_IRON,
  GRID_WOOD,
  INDUSTRY_END,
  INDUSTRY_TRACK,
  LAB_COST,
  LAB_GAPS,
  LOTUS_CITY_RATE,
  LOTUS_CITY_RATE_BUFF,
  MAP_ICON,
  printedAuto,
  PROS_TRACKS,
  RABBIT_BONUS,
  RABBIT_POS,
  ROUND2_AREAS,
  ROUND3_AREAS,
  SHOP_COST,
  SKILLS,
  SPECIAL_TILES,
  SUPPORT_NORMAL,
  SUPPORT_PASS,
  TERRAIN_FLIP,
  TERRAIN_SUPPLY,
  areasForPlayers,
  gridBonus,
  supportColumns,
} from './boards';
import { CARDS, CARD_IDS } from './cards';
import { BOARD_PAIRS, CHARACTERS, isBuffed, startOf } from './characters';
import { shuffle, nextRandom } from './rng';
import {
  automatedCount,
  buildingCount,
  canPlaceTerrain,
  cities,
  condTimes,
  connectedPorts,
  drawAreaReady,
  hexHasRoad,
  hexesOnEdge,
  initialHexes,
  legalRoadEdges,
  passedIp,
  playedCount,
  prosByColor,
  rowCapacity,
  tagCounts,
  terrainCount,
} from './queries';
import { checkMilestone } from './scoring';
import type {
  Basic,
  BuildingType,
  Cost,
  Eff,
  GameConfig,
  GameEvent,
  GameState,
  Option,
  Pending,
  PlayerState,
  ProsColor,
  Res,
  ResKind,
  Row,
  Task,
  Terrain,
} from './types';

const RES_LABEL: Record<ResKind | 'diamond', string> = { gold: 'ゴールド', wheat: '麦', wood: '木材', iron: '鉄', diamond: 'ダイヤ' };
const ROW_LABEL: Record<Row, string> = { agr: '農業', for: '林業', min: '鉱業' };
const COLOR_LABEL: Record<ProsColor, string> = { O: 'オレンジ', G: '緑', Y: '灰' };
const BASICS: Basic[] = ['wheat', 'wood', 'iron'];

const zeroRes = (): Res => ({ gold: 0, wheat: 0, wood: 0, iron: 0 });

// =====================================================================
// 公開 API
// =====================================================================

export function createGame(config: GameConfig, seed: number): GameState {
  let rng = seed >>> 0;
  const n = config.players;
  const [deck, r1] = shuffle(CARD_IDS, rng);
  rng = r1;
  const [startRand, r2] = nextRandom(rng);
  rng = r2;
  const startPlayer = Math.floor(startRand * n);

  // 場の準備（§2.1）
  const cols = supportColumns(n);
  const normalSlots: [number, number][] = [];
  const passSlots: [number, number][] = [];
  for (const c of cols) {
    normalSlots.push([c, 1]);
    if (c >= 4) passSlots.push([c, 0]);
    else normalSlots.push([c, 0]);
  }
  const [normals, r3] = shuffle(SUPPORT_NORMAL.map((s) => s.id), rng);
  const [passes, r4] = shuffle(SUPPORT_PASS.map((s) => s.id), r3);
  rng = r4;
  const supportTiles: (number | null)[][] = Array.from({ length: 7 }, () => [null, null]);
  normalSlots.forEach(([c, r], i) => (supportTiles[c][r] = normals[i]));
  passSlots.forEach(([c, r], i) => (supportTiles[c][r] = passes[i]));

  const [msOrder, r5] = shuffle([1, 2, 3, 4, 5, 6], rng);
  rng = r5;
  const milestones = msOrder.slice(0, 5).map((id) => {
    const [v, nr] = nextRandom(rng);
    rng = nr;
    return { id, side: (v < 0.5 ? 'a' : 'b') as 'a' | 'b', takenBy: null };
  });
  const [ftOrder, r6] = shuffle(FINAL_TILES.map((f) => f.id), rng);
  rng = r6;
  let advSkills: number[] = [];
  if (config.variants.advSkills) {
    const [adv, r7] = shuffle(ADV_SKILLS.map((a) => a.id), rng);
    rng = r7;
    // 人数＋1枚を並べる。1人のときは3枚（持ち主の指示、docs/decisions_13 §13.5）
    advSkills = adv.slice(0, n === 1 ? 3 : n + 1);
  }

  const areas: GameState['areas'] = {};
  for (const id of areasForPlayers(n)) areas[id] = { area: id, slots: Array(AREAS[id].spaces).fill(null) };

  const players: PlayerState[] = Array.from({ length: n }, (_, i) => newPlayer(i, config.names[i] ?? `プレイヤー${i + 1}`));

  const s: GameState = {
    config,
    rng,
    round: 1,
    phase: 'setup',
    startPlayer,
    turnOrder: clockwise(startPlayer, n),
    current: startPlayer,
    players,
    deck,
    discard: [],
    areas,
    revealed: ['M'],
    supportTiles,
    supportMarkers: Array(7).fill(null),
    supportCols: cols,
    skillPiles: Array(12).fill(3),
    advSkills,
    milestones,
    milestonesClosed: false,
    finalTiles: ftOrder.slice(0, 2),
    specialSupply: [1, 2, 3, 4, 5, 6],
    terrainSupply: { ...TERRAIN_SUPPLY },
    prosEndClaimed: Array(6).fill(null),
    queue: [],
    pending: null,
    turnMainDone: false,
    turnActive: false,
    ibDepth: 0,
    ibDeferred: [],
    draftPacks: [],
    draftPicked: [],
    passCount: 0,
    log: [],
    events: [],
    setupStep: 0,
    finished: false,
  };
  // 個人の準備：スタートプレイヤーの右隣から反時計回り（§2.2）
  const order = counterClockwiseFromRight(startPlayer, n);
  if (config.variants.setupDraft) {
    // 準備のドラフト（rules v1.1 §10.5）：N…1, 1…N, N…1 の順に、まだピックしていない種類から1つずつ
    const forward = clockwise(startPlayer, n);
    for (const p of [...order, ...forward, ...order]) s.queue.push(sp(p, 'setupPick'));
  } else {
    for (const p of order) s.queue.push(sp(p, 'setupChar'), sp(p, 'setupMap'));
    for (const p of order) s.queue.push(sp(p, 'setupSupport'));
  }
  s.queue.push(sp(startPlayer, 'beginGame'));
  log(s, `スタートプレイヤーは ${players[startPlayer].name}`);
  run(s);
  return s;
}

export function getOptions(s: GameState): Option[] {
  return s.pending ? s.pending.options : [];
}

/** seat の席から見た局面：同時に選べる選択待ち（pending.waiting）のうち、その席が答える分だけに絞る。
 *  その席が答えなくてよいときは、先頭の人の選択待ちのまま返す。画面とオンラインの操作権の判定に使う */
export function viewFor(s: GameState, seat: number): GameState {
  const pd = s.pending;
  if (!pd?.waiting) return s;
  const who = pd.waiting.includes(seat) ? seat : pd.player;
  return { ...s, pending: { ...pd, player: who, options: pd.options.filter((o) => o.data?.player === who) } };
}

export function applyMove(state: GameState, optionId: string): GameState {
  const s: GameState = structuredClone(state);
  const pd = s.pending;
  if (!pd) throw new Error('選択待ちがありません');
  const opt = pd.options.find((o) => o.id === legacyId(pd, optionId));
  if (!opt) throw new Error(`不正な選択: ${optionId}`);
  s.pending = null;
  s.events = [];
  const before = s.players.map(snapshotCounters);
  resume(s, pd.resume, pd.step, opt);
  run(s);
  s.players.forEach((p, i) => {
    const d = counterDelta(before[i], snapshotCounters(p), i);
    if (d) s.events.push(d);
  });
  return s;
}

/** 以前の記録の読み替え：地図ボードの A面が 'map:A'（ボード指定なし）だったころの記録は、
 *  受け取られていない最初のボードの A面として読む（rules v1.1 §2.2 の改訂前の記録を再生するため） */
function legacyId(pd: Pending, optionId: string): string {
  if (optionId !== 'map:A') return optionId;
  return pd.options.find((o) => o.id.startsWith('map:A@'))?.id ?? optionId;
}

// ---- 出来事列（ui_design §8.1） ----
type Counters = { res: Res; diamond: number; income: Res; score: Record<'vp' | 'cp' | 'ip', number>; discs: number };
function snapshotCounters(p: PlayerState): Counters {
  return { res: { ...p.res }, diamond: p.diamond, income: { ...p.income }, score: { ...p.score }, discs: p.discs };
}
function counterDelta(a: Counters, b: Counters, player: number): GameEvent | null {
  const diff = <K extends string>(x: Record<K, number>, y: Record<K, number>) => {
    const out: Partial<Record<K, number>> = {};
    for (const k of Object.keys(x) as K[]) if (y[k] !== x[k]) out[k] = y[k] - x[k];
    return out;
  };
  const res = diff(a.res, b.res);
  const income = diff(a.income, b.income);
  const score = diff(a.score, b.score);
  const diamond = b.diamond - a.diamond;
  const discs = b.discs - a.discs;
  if (!Object.keys(res).length && !Object.keys(income).length && !Object.keys(score).length && !diamond && !discs) return null;
  return { t: 'delta', p: player, res, income, score, diamond, discs };
}
function emit(s: GameState, e: GameEvent): void {
  s.events.push(e);
}

// =====================================================================
// 内部ヘルパー
// =====================================================================

// ---- 準備の選択肢（§2.2、rules v1.1 §2.2 改訂・§10.4） ----
const MAP_BOARDS = ['B1', 'B2', 'B3', 'B4', 'B5'];

function charOptions(s: GameState): Option[] {
  const taken = new Set(s.players.map((x) => x.character).filter(Boolean) as string[]);
  const blocked = new Set(taken);
  // 自由選択（§10.4）でなければ、選ばれたキャラクターと同じボードの裏面も選べない
  if (!s.config.variants.freeChar) for (const [a, b] of BOARD_PAIRS) if (taken.has(a) || taken.has(b)) (blocked.add(a), blocked.add(b));
  return Object.keys(CHARACTERS)
    .filter((c) => !blocked.has(c))
    .map((c) => ({ id: `char:${c}`, label: c }));
}

/** 地図ボード：まだ受け取られていないボードの A面・B面。A面もどのボードかを選ぶ */
function mapOptions(s: GameState): Option[] {
  const used = new Set(s.players.map((x) => x.mapBoard).filter(Boolean));
  const opts: Option[] = [];
  for (const b of MAP_BOARDS) {
    if (used.has(b)) continue;
    opts.push({ id: `map:A@${b}`, label: `A面（${b}のボード）`, data: { face: 'A', board: b } });
    opts.push({ id: `map:${b}`, label: `${b}面`, data: { face: b, board: b } });
  }
  return opts;
}

function supportOptions(s: GameState): Option[] {
  return s.supportCols
    .filter((c) => s.supportMarkers[c] === null)
    .map((c) => ({ id: `col:${c}`, label: supportLabel(s, c), data: { col: c } }));
}

/** 準備の画面で、まだ選んでいないキャラクターのキャラボードを見せるための写し（状態は変えない） */
export function characterPreview(s: GameState, seat: number, name: string): PlayerState {
  const p = newPlayer(seat, s.players[seat].name);
  const st = startOf(s.config, name);
  p.character = name;
  p.res = st.res;
  p.diamond = st.diamond;
  p.income = st.income;
  return p;
}

/** 地図ボードを選ぶ前に、その面の地図を確認するための仮のプレイヤー（状態は変えない） */
export function mapPreview(s: GameState, seat: number, face: string): PlayerState {
  const p = newPlayer(seat, s.players[seat].name);
  p.mapId = face;
  p.hexes = initialHexes(face);
  return p;
}

function applySetupChar(s: GameState, p: PlayerState, name: string): void {
  const st = startOf(s.config, name);
  p.character = name;
  p.res = st.res;
  p.diamond = st.diamond;
  p.income = st.income;
  log(s, `${p.name} が ${name} を選んだ`);
}

function applySetupMap(s: GameState, p: PlayerState, opt: Option): void {
  p.mapId = String(opt.data!.face);
  p.mapBoard = String(opt.data!.board);
  p.hexes = initialHexes(p.mapId);
  log(s, `${p.name} が地図ボード ${p.mapId === 'A' ? `A面（${p.mapBoard}のボード）` : `${p.mapId}面`} を選んだ`);
}

function applySupport(s: GameState, t: Task, p: PlayerState, col: number): void {
  s.supportMarkers[col] = t.player;
  p.supportSpace = col;
  emit(s, { t: 'support', p: t.player, col });
}

function newPlayer(seat: number, name: string): PlayerState {
  return {
    seat,
    name,
    character: null,
    mapId: null,
    mapBoard: null,
    res: zeroRes(),
    diamond: 0,
    income: zeroRes(),
    hand: [],
    played: [],
    automated: { agr: [], for: [], min: [] },
    taken: { tent: 0, house: 0, bldg: 0, lab: 0 },
    shopsTaken: [],
    clockPlaced: false,
    rabbitsTaken: 0,
    food: 0,
    carriage: 0,
    loco: null,
    pros: [0, 0, 0, 0, 0, 0],
    score: { vp: 0, cp: 0, ip: 0 },
    discs: 0,
    skills: [],
    woodDiscount: 0,
    wonders: 0,
    usedFree: [],
    carmenCubes: 0,
    lotusRate: false,
    hexes: {},
    roads: [],
    drawAreas: [false, false],
    passed: false,
    passOrder: null,
    supportSpace: null,
    ipThisPass: 0,
    gretelBonus: 0,
  };
}

const clockwise = (start: number, n: number) => Array.from({ length: n }, (_, i) => (start + i) % n);
const counterClockwiseFromRight = (start: number, n: number) => Array.from({ length: n }, (_, i) => (start - 1 - i + 2 * n) % n);

/** 同時に起きた効果のまとまり（処理順を選ぶ単位） */
type Bundle = { src: string; effs: Eff[] };
/** タスクの列を、由来（src）ごとのまとまりに分ける */
function bundlesOf(ts: Task[]): Bundle[] {
  const out: Bundle[] = [];
  for (const t of ts) {
    const last = out[out.length - 1];
    if (last && last.src === (t.src ?? '')) last.effs.push(t.eff);
    else out.push({ src: t.src ?? '', effs: [t.eff] });
  }
  return out;
}
function sp(player: number, id: string, ctx?: Record<string, unknown>): Task {
  return { player, eff: { k: 'special', id }, ctx };
}
function tasks(player: number, effs: Eff[], src?: string): Task[] {
  return effs.map((eff) => ({ player, eff, src }));
}
function front(s: GameState, ts: Task[]): void {
  s.queue.unshift(...ts);
}
function log(s: GameState, msg: string): void {
  s.log.push(`[R${s.round}] ${msg}`);
}
function ask(s: GameState, task: Task, step: string, prompt: string, options: Option[], kind = 'pick'): void {
  s.pending = { player: task.player, kind, prompt, options, resume: task, step };
}
const P = (s: GameState, t: Task) => s.players[t.player];
const hasChar = (p: PlayerState, name: string) => p.character === name;
/** キャラクターの上方修正（ヴァリアント、docs/decisions_16）がこのプレイヤーに効いているか */
const buffOn = (s: GameState, p: PlayerState) => isBuffed(s.config, p.character);
/** スキルタイルの上方修正（キャラクターの上方修正のヴァリアントに含める）が効いているか */
const skillBuff = (s: GameState) => !!s.config.variants.charBuff;
/** ビスキュイ・バステトのフリーアクションで進む歩数。上方修正では研究所駒1個につき、通常は研究所駒のある都市1つにつき */
const biscuitSteps = (_s: GameState, p: PlayerState) => cities(p).filter((c) => c.some((k) => p.hexes[k].building === 'lab')).length;
/** リッカ・ベリーが麦の代わりに払える資源。上方修正ではゴールド、通常は木材 */
const rikkaSub = (s: GameState, p: PlayerState): 'gold' | 'wood' => (buffOn(s, p) ? 'gold' : 'wood');
const clockOf = (p: PlayerState, name: string) => p.character === name && p.clockPlaced;
const hasSkill = (p: PlayerState, id: number, adv = false) => p.skills.some((x) => x.id === id && x.adv === adv);

export function canLoseCards(s: GameState, p: PlayerState, k: number): boolean {
  // 第1〜4ラウンドは手札が0枚になる行動を取れない（§6.0）
  return s.round >= 5 ? p.hand.length >= k : p.hand.length >= k + 1;
}

function supportActive(s: GameState, p: PlayerState, id: number): boolean {
  if (p.supportSpace === null) return false;
  return s.supportTiles[p.supportSpace].includes(id);
}

// ---- 資源 ----
function addRes(s: GameState, p: PlayerState, r: Partial<Res> & { diamond?: number }): void {
  for (const k of ['gold', 'wheat', 'wood', 'iron'] as ResKind[]) if (r[k]) p.res[k] += r[k]!;
  if (r.diamond) p.diamond += r.diamond;
}
function addIncome(s: GameState, p: PlayerState, res: ResKind, n: number): void {
  p.income[res] = Math.max(0, p.income[res] + n);
  if (res === 'gold' && n > 0 && hasSkill(p, 9, true)) addScore(s, p, 'vp', n);
}
function addScore(s: GameState, p: PlayerState, kind: 'vp' | 'cp' | 'ip', n: number): void {
  p.score[kind] += n;
}

function canAfford(s: GameState, p: PlayerState, c: Cost): boolean {
  if ((c.gold ?? 0) > p.res.gold) return false;
  for (const b of BASICS) if ((c[b] ?? 0) > p.res[b]) return false;
  if ((c.diamond ?? 0) > p.diamond) return false;
  const spareBasic = BASICS.reduce((a, b) => a + p.res[b] - (c[b] ?? 0), 0);
  if ((c.anyBasic ?? 0) > spareBasic) return false;
  if (c.hand && !canLoseCards(s, p, c.hand)) return false;
  if (c.disc && p.discs < c.disc) return false;
  if (c.income) for (const [k, v] of Object.entries(c.income)) if ((v ?? 0) > p.income[k as ResKind]) return false;
  return true;
}

/** 固定分を支払う（任意の基礎資源・手札は別途選択） */
function payFixed(s: GameState, p: PlayerState, c: Cost): void {
  p.res.gold -= c.gold ?? 0;
  for (const b of BASICS) p.res[b] -= c[b] ?? 0;
  p.diamond -= c.diamond ?? 0;
  p.discs -= c.disc ?? 0;
  if (c.income) for (const [k, v] of Object.entries(c.income)) p.income[k as ResKind] -= v ?? 0;
}

/** 任意の基礎資源 n 個の内訳の候補 */
function basicCombos(n: number, limit?: Res): Record<Basic, number>[] {
  const out: Record<Basic, number>[] = [];
  for (let a = 0; a <= n; a++)
    for (let b = 0; a + b <= n; b++) {
      const c = n - a - b;
      if (limit && (a > limit.wheat || b > limit.wood || c > limit.iron)) continue;
      out.push({ wheat: a, wood: b, iron: c });
    }
  return out;
}
/** 合計が unit の倍数（unit 以上 max 以下）になる内訳の候補。両替のフリーアクションを一括で行うために使う */
function bulkCombos(unit: number, max: number, limit?: Res): Record<Basic, number>[] {
  const out: Record<Basic, number>[] = [];
  for (let n = unit; n <= max; n += unit) out.push(...basicCombos(n, limit));
  return out;
}
const comboTotal = (c: Record<Basic, number>) => c.wheat + c.wood + c.iron;
/** 両替の効果を k 回分にまとめる（得る基礎資源・ゴールドの数を k 倍にする） */
function scaleEffs(effs: Eff[], k: number): Eff[] {
  return effs.map((e) => {
    if (e.k === 'anyBasic') return { ...e, n: e.n * k };
    if (e.k === 'gain') return { ...e, res: Object.fromEntries(Object.entries(e.res).map(([r, v]) => [r, (v ?? 0) * k])) };
    return e;
  });
}
/** 効果を k 回分にする。得る資源だけなら数を k 倍にし、それ以外は k 回並べる */
function repeatEffs(effs: Eff[], k: number): Eff[] {
  if (effs.every((e) => e.k === 'gain' || e.k === 'anyBasic')) return scaleEffs(effs, k);
  return Array.from({ length: k }, () => effs).flat();
}
/** コストを k 回分にする */
function scaleCost(c: Cost, k: number): Cost {
  const out: Cost = {};
  for (const [key, v] of Object.entries(c) as [keyof Cost, Cost[keyof Cost]][]) {
    if (key === 'income') out.income = Object.fromEntries(Object.entries(v as Partial<Res>).map(([r, n]) => [r, (n ?? 0) * k]));
    else (out as Record<string, number>)[key] = (v as number) * k;
  }
  return out;
}
const comboLabel = (c: Record<Basic, number>) =>
  BASICS.filter((b) => c[b] > 0)
    .map((b) => `${RES_LABEL[b]}${c[b]}`)
    .join('・') || 'なし';

// ---- カード ----
function drawCards(s: GameState, p: PlayerState, n: number): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (s.deck.length === 0) {
      if (s.discard.length === 0) break;
      const [d, r] = shuffle(s.discard, s.rng);
      s.deck = d;
      s.rng = r;
      s.discard = [];
      log(s, '捨て札を混ぜて市民デッキにしました');
      emit(s, { t: 'reshuffle' });
    }
    const card = s.deck.shift()!;
    p.hand.push(card);
    emit(s, { t: 'card', p: p.seat, card, reason: 'draw' });
    drawn++;
  }
  return drawn;
}

export function cardCost(s: GameState, p: PlayerState, id: string): number {
  const c = CARDS[id];
  let cost = c.cost;
  if (c.brownie || hasSkill(p, 10, true)) cost -= tagCounts(p, buffOn(s, p)).ブラウニー; // 自身のタグは含めない（手札にあるため）
  if (c.tags.和菓子 && hasChar(p, 'サクラ・モチ') && buffOn(s, p)) cost -= tagCounts(p, true).和菓子; // 上方修正のサクラ：和菓子割引（docs/decisions_16 §16.12）
  if (supportActive(s, p, 13)) cost -= 3;
  return Math.max(0, cost);
}

function automatableRows(s: GameState, p: PlayerState, id: string): Row[] {
  const c = CARDS[id];
  if (c.type !== 'immediate' || !c.industry || !c.auto) return [];
  const rows: Row[] = c.industry === 'all' ? ['agr', 'for', 'min'] : [c.industry];
  return rows.filter((r) => p.automated[r].length < rowCapacity(p, r, buffOn(s, p)));
}

// =====================================================================
// 実行ループ
// =====================================================================

function run(s: GameState): void {
  let guard = 0;
  while (!s.pending && !s.finished) {
    if (++guard > 100000) throw new Error('無限ループの疑い');
    const t = s.queue.shift();
    if (t) exec(s, t);
    else advance(s);
  }
}

/** キューが空のとき：アクションフェイズの手番を進める */
function advance(s: GameState): void {
  if (s.phase !== 'action') throw new Error(`進行が止まりました（${s.phase}）`);
  if (s.turnActive) {
    turnMenu(s);
    return;
  }
  // 次の手番
  const n = s.players.length;
  const idx = s.turnOrder.indexOf(s.current);
  for (let i = 1; i <= n; i++) {
    const cand = s.turnOrder[(idx + i) % n];
    if (!s.players[cand].passed) {
      startTurn(s, cand);
      return;
    }
  }
  // 全員パス
  if (s.round >= 5) s.queue.push(sp(s.startPlayer, 'finalScoring'));
  else s.queue.push(sp(s.startPlayer, 'cleanup'));
  s.phase = 'cleanup';
}

function startTurn(s: GameState, player: number): void {
  s.current = player;
  s.turnActive = true;
  s.turnMainDone = false;
  turnMenu(s);
}

function exec(s: GameState, t: Task): void {
  const p = P(s, t);
  const e = t.eff;
  switch (e.k) {
    case 'gain':
      addRes(s, p, e.res);
      return;
    case 'anyBasic': {
      if (e.n <= 0) return;
      const goldEach = Number(t.ctx?.goldEach ?? 0);
      if (goldEach > 0) {
        // フリーアクション❸の一括：goldEach ゴールドにつき1個、払える分まで何個でも得る
        const max = Math.floor(p.res.gold / goldEach);
        const opts = bulkCombos(1, max).map((c) => ({ id: `basic:${c.wheat}-${c.wood}-${c.iron}`, label: comboLabel(c), data: c }));
        ask(s, t, 'anyBasic', `得る基礎資源の内訳を選んでください（${goldEach}ゴールドにつき1個、最大${max}個）`, opts);
        return;
      }
      const opts = basicCombos(e.n).map((c) => ({ id: `basic:${c.wheat}-${c.wood}-${c.iron}`, label: comboLabel(c), data: c }));
      ask(s, t, 'anyBasic', `任意の基礎資源を${e.n}個得る：内訳を選んでください`, opts);
      return;
    }
    case 'income':
      addIncome(s, p, e.res, e.n);
      return;
    case 'terrain':
      return stepTerrain(s, t, e.n, e.kind);
    case 'road':
      return stepRoad(s, t, e.n);
    case 'mix':
      return stepMix(s, t, e.terrain, e.road);
    case 'building':
      return stepBuilding(s, t);
    case 'food': {
      const out: Task[] = [];
      for (let i = 0; i < e.n; i++) out.push(...foodStep(s, t.player));
      front(s, out);
      return;
    }
    case 'industry':
      return stepIndustry(s, t, e.n);
    case 'pros':
      return stepPros(s, t, e.n, e.color);
    case 'rabbit':
      return stepRabbit(s, t, e.n);
    case 'draw':
      drawCards(s, p, e.n);
      return;
    case 'skill':
      return stepSkill(s, t, hasChar(p, 'ジャスミン・メイ') && !t.ctx?.raw ? e.n * 2 : e.n);
    case 'ib':
      return startIb(s, t, e.row);
    case 'score':
      addScore(s, p, e.kind, e.n);
      return;
    case 'wonder':
      p.wonders += 1;
      emit(s, { t: 'wonder', p: t.player });
      if (p.wonders === 1) log(s, `${p.name} がワンダーアイコンを解放`);
      else front(s, tasks(t.player, [{ k: 'skill', n: 1 }]));
      return;
    case 'disc':
      p.discs += 1;
      return;
    case 'choice': {
      const opts = e.options.map((o, i) => ({ id: `choice:${i}`, label: describe(o) }));
      ask(s, t, 'choice', 'どちらかを選んでください', opts);
      return;
    }
    case 'pay':
      return stepPay(s, t);
    case 'cond': {
      const times = condTimes(s, p, e.items);
      const k = e.each ? times : Math.min(times, 1);
      const out: Task[] = [];
      for (let i = 0; i < k; i++) out.push(...tasks(t.player, e.then, t.src));
      front(s, out);
      return;
    }
    case 'search':
      return stepSearch(s, t, e.n, e.tag, e.pass);
    case 'flipAny':
      return stepFlipAny(s, t);
    case 'drawAutomate':
      drawCards(s, p, 1);
      return stepFreeAutomate(s, t, 1);
    case 'discardDraw':
      drawCards(s, p, e.draw);
      return stepDiscard(s, t, e.discard);
    case 'special':
      return execSpecial(s, t, e.id);
  }
}

// =====================================================================
// 選択への回答
// =====================================================================

function resume(s: GameState, t: Task, step: string, opt: Option): void {
  const p = P(s, t);
  const e = t.eff;
  const d = opt.data ?? {};
  switch (step) {
    case 'anyBasic': {
      const c = d as Record<Basic, number>;
      p.res.gold -= Number(t.ctx?.goldEach ?? 0) * comboTotal(c);
      addRes(s, p, c);
      return;
    }
    case 'choice': {
      if (e.k !== 'choice') return;
      const i = Number(opt.id.split(':')[1]);
      front(s, tasks(t.player, e.options[i], t.src));
      return;
    }
    case 'terrain':
    case 'road':
    case 'mix':
      return resumePlacement(s, t, step, opt);
    case 'special':
      return resumeSpecialTile(s, t, opt);
    case 'bldPiece':
    case 'bldSpot':
      return resumeBuilding(s, t, step, opt);
    case 'industry':
      return resumeIndustry(s, t, opt);
    case 'pros':
      return resumePros(s, t, opt);
    case 'rabbit':
      return resumeRabbit(s, t, opt);
    case 'skill':
      return resumeSkill(s, t, opt);
    case 'ibRow':
      return runIb(s, t, opt.id.split(':')[1] as Row);
    case 'payConfirm':
    case 'payBasic':
    case 'payHand':
      return resumePay(s, t, step, opt);
    case 'search':
      return resumeSearch(s, t, opt);
    case 'flipAny':
      return resumeFlipAny(s, t, opt);
    case 'freeAutomate':
      return resumeFreeAutomate(s, t, opt);
    case 'discard':
      return resumeDiscard(s, t, opt);
    default:
      return resumeSpecial(s, t, step, opt);
  }
}

// =====================================================================
// 地図への配置（§6.2, §6.3）
// =====================================================================

function terrainTargets(s: GameState, p: PlayerState, kind: Terrain | 'any'): string[] {
  const elsa = hasChar(p, 'エルサ・スカイル');
  return Object.keys(p.hexes).filter((k) => {
    const h = p.hexes[k];
    if (!canPlaceTerrain(p, k, kind, elsa)) return false;
    if (h.terrain === 'X') return s.specialSupply.length > 0 && kind === 'any';
    return s.terrainSupply[h.terrain as Terrain] > 0;
  });
}

function stepTerrain(s: GameState, t: Task, n: number, kind: Terrain | 'any'): void {
  if (n <= 0) return;
  const p = P(s, t);
  const targets = terrainTargets(s, p, kind);
  if (targets.length === 0) {
    log(s, `${p.name}：地形タイルを置ける場所がありません`);
    return;
  }
  t.ctx = { ...(t.ctx ?? {}), n, kind };
  const opts: Option[] = targets.map((k) => ({ id: `hex:${k}`, label: `ヘクス ${k}`, data: { hex: k } }));
  opts.push({ id: 'stop', label: 'ここで終える' });
  ask(s, t, 'terrain', `地形タイルを置くヘクスを選んでください（あと${n}枚まで）`, opts, 'hex');
}

function stepRoad(s: GameState, t: Task, n: number): void {
  if (n <= 0) return;
  const p = P(s, t);
  const edges = legalRoadEdges(p);
  if (edges.length === 0) return;
  t.ctx = { ...(t.ctx ?? {}), n };
  const opts: Option[] = edges.map((e) => ({ id: `edge:${e}`, label: '辺', data: { edge: e } }));
  opts.push({ id: 'stop', label: 'ここで終える' });
  ask(s, t, 'road', `道駒を置く辺を選んでください（あと${n}個まで）`, opts, 'edge');
}

function stepMix(s: GameState, t: Task, terr: number, road: number): void {
  if (terr <= 0 && road <= 0) return;
  const p = P(s, t);
  const opts: Option[] = [];
  if (terr > 0)
    for (const k of terrainTargets(s, p, 'any')) opts.push({ id: `hex:${k}`, label: `ヘクス ${k}`, data: { hex: k } });
  if (road > 0) for (const e of legalRoadEdges(p)) opts.push({ id: `edge:${e}`, label: '辺', data: { edge: e } });
  if (opts.length === 0) return;
  t.ctx = { ...(t.ctx ?? {}), terr, road };
  opts.push({ id: 'stop', label: 'ここで終える' });
  ask(s, t, 'mix', `地形タイル（あと${terr}枚まで）か道駒（あと${road}個まで）を置いてください`, opts, 'hexOrEdge');
}

function resumePlacement(s: GameState, t: Task, step: string, opt: Option): void {
  if (opt.id === 'stop') return;
  const p = P(s, t);
  const ctx = t.ctx as Record<string, number | string>;
  const next: Task[] = [];
  if (opt.id.startsWith('hex:')) {
    const key = String(opt.data!.hex);
    if (p.hexes[key].terrain === 'X') {
      // 特殊地形タイルを選ぶ
      const cont = continuation(t, step, 'terrain');
      const st: Task = { player: t.player, eff: { k: 'special', id: 'chooseSpecial' }, ctx: { hex: key } };
      front(s, [st, ...cont]);
      return;
    }
    next.push(...placeTile(s, t.player, key, { kind: p.hexes[key].terrain as Terrain }));
  } else {
    next.push(...placeRoad(s, t.player, String(opt.data!.edge)));
  }
  front(s, [...next, ...continuation(t, step, opt.id.startsWith('hex:') ? 'terrain' : 'road')]);
}

/** 残りの配置を続けるタスク */
function continuation(t: Task, step: string, used?: 'terrain' | 'road'): Task[] {
  const ctx = t.ctx as Record<string, number | string>;
  if (step === 'terrain') {
    if (!used) return [{ player: t.player, eff: { k: 'terrain', n: Number(ctx.n), kind: ctx.kind as Terrain | 'any' }, src: t.src }];
    return [{ player: t.player, eff: { k: 'terrain', n: Number(ctx.n) - 1, kind: ctx.kind as Terrain | 'any' }, src: t.src }];
  }
  if (step === 'road') return [{ player: t.player, eff: { k: 'road', n: Number(ctx.n) - (used ? 1 : 0) }, src: t.src }];
  // mix
  const terr = Number(ctx.terr) - (used === 'terrain' ? 1 : 0);
  const road = Number(ctx.road) - (used === 'road' ? 1 : 0);
  return [{ player: t.player, eff: { k: 'mix', terrain: terr, road }, src: t.src }];
}

function resumeSpecialTile(s: GameState, t: Task, opt: Option): void {
  const id = Number(opt.id.split(':')[1]);
  const key = String(t.ctx!.hex);
  s.specialSupply = s.specialSupply.filter((x) => x !== id);
  front(s, placeTile(s, t.player, key, { kind: 'special', specialId: id }));
}

/** 地形タイルを置く。続けて解決するタスクを返す */
function placeTile(s: GameState, player: number, key: string, tile: { kind: Terrain | 'special'; specialId?: number }): Task[] {
  const p = s.players[player];
  const h = p.hexes[key];
  h.tile = { kind: tile.kind, specialId: tile.specialId, flipped: false };
  if (tile.kind !== 'special') s.terrainSupply[tile.kind] -= 1;
  emit(s, { t: 'tile', p: player, hex: key, kind: tile.kind, specialId: tile.specialId });
  log(s, `${p.name} が地形タイルを ${key} に置いた`);
  const out: Task[] = [];
  if (h.icon && !h.iconTaken) {
    h.iconTaken = true;
    out.push(...tasks(player, MAP_ICON[h.icon](h.terrain as Terrain), `ヘクスのボーナス`));
  }
  if (hexHasRoad(p, key)) out.push(...flipTile(s, player, key));
  out.push(...checkDrawAreas(s, player));
  return out;
}

function flipEffects(h: PlayerState['hexes'][string]): Eff[] {
  if (!h.tile) return [];
  if (h.tile.kind === 'special') return SPECIAL_TILES[h.tile.specialId!].eff;
  return TERRAIN_FLIP[h.tile.kind];
}

function flipTile(s: GameState, player: number, key: string): Task[] {
  const p = s.players[player];
  const h = p.hexes[key];
  if (!h.tile || h.tile.flipped) return [];
  h.tile.flipped = true;
  emit(s, { t: 'flip', p: player, hex: key });
  log(s, `${p.name} の ${key} のタイルが裏返った`);
  return tasks(player, flipEffects(h), '地形タイルを裏返した');
}

function placeRoad(s: GameState, player: number, edge: string): Task[] {
  const p = s.players[player];
  p.roads.push(edge);
  emit(s, { t: 'road', p: player, edge });
  log(s, `${p.name} が道駒を置いた`);
  const out: Task[] = [];
  for (const k of hexesOnEdge(p, edge)) if (p.hexes[k].tile && !p.hexes[k].tile!.flipped) out.push(...flipTile(s, player, k));
  out.push(...checkDrawAreas(s, player));
  return out;
}

function checkDrawAreas(s: GameState, player: number): Task[] {
  const p = s.players[player];
  const out: Task[] = [];
  p.drawAreas.forEach((on, i) => {
    if (!on && drawAreaReady(p, i)) {
      p.drawAreas[i] = true;
      emit(s, { t: 'drawArea', p: player, index: i });
      log(s, `${p.name} が追加ドローエリアをアクティブ化`);
      out.push(...tasks(player, [{ k: 'draw', n: 1 }], '追加ドローエリア'));
    }
  });
  return out;
}

// =====================================================================
// 建物駒（§6.4）
// =====================================================================

export type Piece = 'tent' | 'house' | 'bldg' | 'lab' | `shop:${Row}`;

function pieceCost(s: GameState, p: PlayerState, piece: Piece): Cost {
  const idx = piece === 'lab' ? p.taken.lab : piece.startsWith('shop') ? 0 : p.taken[piece as 'tent'];
  return pieceCostAt(s, p, piece, idx);
}

/** 建物駒のコスト（割引後）。idx は取る順番（テント・家・ビルは 0=最下段、研究所駒は 0=1個目） */
export function pieceCostAt(s: GameState, p: PlayerState, piece: Piece, idx: number): Cost {
  let c: Cost;
  if (piece === 'lab') c = { ...LAB_COST[idx] };
  else if (piece.startsWith('shop')) c = { ...SHOP_COST };
  else c = { wood: GRID_WOOD[idx], iron: GRID_IRON };
  if (c.wood) c.wood = Math.max(0, c.wood - p.woodDiscount);
  if (c.iron && supportActive(s, p, 15)) c.iron = Math.max(0, c.iron - 1);
  if (c.iron && hasChar(p, 'アリス・ティーローズ') && buffOn(s, p)) c.iron = Math.max(0, c.iron - 1);
  return c;
}

function availablePieces(p: PlayerState): Piece[] {
  const out: Piece[] = [];
  for (const b of ['tent', 'house', 'bldg'] as const) if (p.taken[b] < 5) out.push(b);
  if (p.taken.lab < 4) out.push('lab');
  for (const r of ['agr', 'for', 'min'] as Row[]) if (!p.shopsTaken.includes(r)) out.push(`shop:${r}`);
  return out;
}

export function buildingSpots(p: PlayerState, onTerrain?: Terrain): string[] {
  return Object.keys(p.hexes).filter((k) => {
    const h = p.hexes[k];
    if (h.building) return false;
    if (h.terrain === 'C') return !onTerrain;
    if (!h.tile || !h.tile.flipped) return false;
    return !onTerrain || h.terrain === onTerrain;
  });
}

function pieceLabel(piece: Piece): string {
  if (piece.startsWith('shop')) return `ショップ駒（${ROW_LABEL[piece.split(':')[1] as Row]}）`;
  return BUILDING_LABEL[piece as BuildingType];
}

export function canBuildViaAction(s: GameState, p: PlayerState, extra: Cost = {}): boolean {
  if (buildingSpots(p).length === 0) return false;
  return availablePieces(p).some((pc) => {
    const c = pieceCost(s, p, pc);
    return canAfford(s, p, { wood: (c.wood ?? 0) + (extra.wood ?? 0), iron: c.iron });
  });
}

function stepBuilding(s: GameState, t: Task): void {
  const e = t.eff as Extract<Eff, { k: 'building' }>;
  const p = P(s, t);
  const ctx = (t.ctx = t.ctx ?? { left: e.n, placed: [] as Piece[] });
  const left = Number(ctx.left);
  const spots = buildingSpots(p, e.onTerrain);
  const pieces = availablePieces(p).filter((pc) => !e.viaAction || canAfford(s, p, pieceCost(s, p, pc)));
  if (left <= 0 || spots.length === 0 || pieces.length === 0) {
    finishBuilding(s, t);
    return;
  }
  const opts: Option[] = pieces.map((pc) => {
    const c = pieceCost(s, p, pc);
    const costLabel = e.viaAction ? `（木材${c.wood ?? 0}・鉄${c.iron ?? 0}）` : '';
    return { id: `piece:${pc}`, label: `${pieceLabel(pc)}${costLabel}`, data: { piece: pc } };
  });
  opts.push({ id: 'stop', label: 'ここで終える' });
  ask(s, t, 'bldPiece', `置く建物駒を選んでください（あと${left}個まで）`, opts);
}

function resumeBuilding(s: GameState, t: Task, step: string, opt: Option): void {
  const e = t.eff as Extract<Eff, { k: 'building' }>;
  const p = P(s, t);
  const ctx = t.ctx as { left: number; placed: Piece[]; piece?: Piece };
  if (opt.id === 'stop') {
    finishBuilding(s, t);
    return;
  }
  if (step === 'bldPiece') {
    ctx.piece = opt.data!.piece as Piece;
    const spots = buildingSpots(p, e.onTerrain);
    const opts = spots.map((k) => ({ id: `hex:${k}`, label: `ヘクス ${k}`, data: { hex: k } }));
    ask(s, t, 'bldSpot', `${pieceLabel(ctx.piece)}を置く場所を選んでください`, opts, 'hex');
    return;
  }
  // bldSpot
  const piece = ctx.piece!;
  const key = String(opt.data!.hex);
  if (e.viaAction) payFixed(s, p, pieceCost(s, p, piece));
  const out: Task[] = [];
  let type: BuildingType;
  if (piece === 'lab') {
    p.taken.lab += 1;
    type = 'lab';
  } else if (piece.startsWith('shop')) {
    p.shopsTaken.push(piece.split(':')[1] as Row);
    type = 'shop';
  } else {
    type = piece as BuildingType;
  }
  ctx.placed.push(piece);
  // 段のボーナスは置き終えたあと（取得数は finishBuilding でまとめて進める）
  if (piece === 'tent' || piece === 'house' || piece === 'bldg') {
    (ctx as Record<string, unknown>)[`pre_${ctx.placed.length - 1}`] = p.taken[piece];
    p.taken[piece] += 1;
  }
  const placed = placeBuildingAt(s, t.player, key, type);
  const biscuit: Task[] = piece === 'lab' && hasChar(p, 'ビスキュイ・バステト') && buffOn(s, p) ? tasks(t.player, [{ k: 'industry', n: 2 }], 'ビスキュイ・バステト') : [];
  if (s.config.orderChoice) {
    // 置いたヘクスの効果などは、置き終えたあとに段のボーナスとまとめて、処理順を選んで解決する
    const later = ((ctx as Record<string, unknown>).bundles ??= []) as Bundle[];
    for (const b of bundlesOf([...placed, ...biscuit])) later.push(b);
  } else out.push(...placed, ...biscuit);
  ctx.left -= 1;
  front(s, [...out, { ...t, ctx: { ...ctx, piece: undefined } }]);
}

function placeBuildingAt(s: GameState, player: number, key: string, type: BuildingType): Task[] {
  const p = s.players[player];
  const h = p.hexes[key];
  h.building = type;
  emit(s, { t: 'building', p: player, hex: key, type });
  log(s, `${p.name} が${BUILDING_LABEL[type]}を ${key} に置いた`);
  const out: Task[] = [];
  if (hasSkill(p, 10)) addScore(s, p, 'vp', 2);
  if (h.terrain === 'C') out.push(...tasks(player, CAPITAL_BONUS, '首都ヘクス'));
  else out.push(...tasks(player, flipEffects(h), '建物駒を置いた地形タイル'));
  return out;
}

function finishBuilding(s: GameState, t: Task): void {
  const p = P(s, t);
  const ctx = (t.ctx ?? { placed: [] }) as { placed: Piece[] } & Record<string, unknown>;
  const board = CHARACTERS[p.character!].board;
  const out: Task[] = [];
  const bundles: Bundle[] = [...((ctx.bundles as Bundle[] | undefined) ?? [])];
  ctx.placed.forEach((piece, i) => {
    if (piece === 'tent' || piece === 'house' || piece === 'bldg') {
      const pre = Number(ctx[`pre_${i}`]);
      bundles.push({ src: '個人ボードのボーナス', effs: gridBonus(board, piece, pre) });
    } else if (piece.startsWith('shop')) {
      bundles.push({ src: 'ショップ駒', effs: [{ k: 'ib', row: piece.split(':')[1] as Row }] });
    }
  });
  if (s.config.orderChoice) out.push(sp(t.player, 'orderBundles', { bundles }));
  else for (const b of bundles) out.push(...tasks(t.player, b.effs, b.src));
  front(s, out);
}

// =====================================================================
// 食料・工業・繁栄・クッキーラビット（§6.5〜§6.8）
// =====================================================================

function foodStep(s: GameState, player: number): Task[] {
  const p = s.players[player];
  if (p.food >= FOOD_END) {
    p.res.wheat += 2;
    return [];
  }
  p.food += 1;
  emit(s, { t: 'food', p: player, pos: p.food });
  const b = FOOD_BONUS[p.food];
  return b ? tasks(player, b, `食料トラック${p.food}マス目`) : [];
}

function labBlocked(p: PlayerState, pos: number): boolean {
  // pos から pos+1 へ進むとき、まだ取り除かれていない研究所駒があるか
  const k = LAB_GAPS.indexOf(pos);
  return k >= 0 && p.taken.lab <= k;
}

function stepIndustry(s: GameState, t: Task, n: number): void {
  if (n <= 0) return;
  const p = P(s, t);
  const opts: Option[] = [];
  const markers: ['carriage' | 'loco', number | null][] = [
    ['carriage', p.carriage],
    ['loco', p.loco],
  ];
  for (const [m, pos] of markers) {
    if (pos === null) continue;
    const name = m === 'carriage' ? '馬車駒' : '機関車駒';
    if (pos >= INDUSTRY_END) opts.push({ id: `ind:${m}:over`, label: `${name}（終点：1勝利点）`, data: { marker: m } });
    else if (!labBlocked(p, pos)) opts.push({ id: `ind:${m}`, label: `${name}を1歩進める`, data: { marker: m } });
  }
  if (opts.length === 0) {
    log(s, `${p.name}：研究所駒にさえぎられて工業トラックを進められません`);
    return;
  }
  t.ctx = { n };
  if (opts.length === 1) {
    resumeIndustry(s, t, opts[0]);
    return;
  }
  ask(s, t, 'industry', `工業マーカーを選んでください（あと${n}歩）`, opts);
}

function resumeIndustry(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  const n = Number(t.ctx!.n);
  const m = opt.data!.marker as 'carriage' | 'loco';
  const out: Task[] = [];
  if (opt.id.endsWith(':over')) {
    addScore(s, p, 'vp', 1);
    emit(s, { t: 'industry', p: t.player, marker: m, pos: m === 'carriage' ? p.carriage : p.loco!, over: true });
  } else {
    const pos = (m === 'carriage' ? p.carriage : p.loco!) + 1;
    if (m === 'carriage') p.carriage = pos;
    else p.loco = pos;
    emit(s, { t: 'industry', p: t.player, marker: m, pos, over: false });
    const sq = INDUSTRY_TRACK[pos];
    if ((sq.color === 'O' && m === 'carriage') || (sq.color === 'G' && m === 'loco'))
      out.push(...tasks(t.player, sq.eff, `工業トラック${pos + 1}マス目`));
  }
  out.push({ player: t.player, eff: { k: 'industry', n: n - 1 }, src: t.src });
  front(s, out);
}

function stepPros(s: GameState, t: Task, n: number, color?: ProsColor): void {
  if (n <= 0) return;
  const p = P(s, t);
  const opts: Option[] = [];
  PROS_TRACKS.forEach((tr, i) => {
    if (color && tr.color !== color) return;
    const pos = p.pros[i];
    if (pos >= tr.length) return;
    const toEnd = pos + 1 === tr.length;
    if (toEnd && p.diamond < 1) return;
    opts.push({
      id: `pros:${i}`,
      label: `${COLOR_LABEL[tr.color]}（${tr.label}）${toEnd ? '：右端へ（ダイヤ1）' : ''}`,
      data: { track: i },
    });
  });
  if (opts.length === 0) return;
  t.ctx = { n, color };
  ask(s, t, 'pros', `進める繁栄トラックを選んでください（あと${n}歩）`, opts, 'pros');
}

/** 繁栄トラックのマスのボーナス。上方修正のコーラル・ライラは、下段の最初のボーナス（収入値+1）で収入値が2上がる（docs/decisions_16） */
export function prosBonus(s: GameState, p: PlayerState, track: number, pos: number): Eff[] {
  const effs = PROS_TRACKS[track].bonus[pos] ?? [];
  if (!(hasChar(p, 'コーラル・ライラ') && buffOn(s, p))) return effs;
  // 収入値のボーナスは下段の最初のマスにだけある
  return effs.map((e) => (e.k === 'income' ? { ...e, n: 2 } : e));
}

function resumePros(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  const i = Number(opt.data!.track);
  const tr = PROS_TRACKS[i];
  const n = Number(t.ctx!.n);
  const out: Task[] = [];
  p.pros[i] += 1;
  const firstToEnd = p.pros[i] === tr.length && s.prosEndClaimed[i] === null;
  emit(s, { t: 'pros', p: t.player, track: i, pos: p.pros[i], firstToEnd });
  if (p.pros[i] === tr.length) {
    p.diamond -= 1;
    if (s.prosEndClaimed[i] === null) {
      s.prosEndClaimed[i] = t.player;
      out.push(...tasks(t.player, tr.endBonus, '繁栄トラック右端'));
    }
  } else if (tr.bonus[p.pros[i]]) out.push(...tasks(t.player, prosBonus(s, p, i, p.pros[i]), '繁栄トラック'));
  out.push({ player: t.player, eff: { k: 'pros', n: n - 1, color: t.ctx!.color as ProsColor | undefined }, src: t.src });
  front(s, out);
}

function rabbitSpots(p: PlayerState): string[] {
  return Object.keys(p.hexes).filter((k) => p.hexes[k].building && !p.hexes[k].rabbit);
}

function stepRabbit(s: GameState, t: Task, n: number): void {
  if (n <= 0) return;
  const p = P(s, t);
  if (p.rabbitsTaken >= 9) {
    addScore(s, p, 'vp', 6 * n);
    return;
  }
  if (RABBIT_POS(p.rabbitsTaken) > p.food) {
    log(s, `${p.name}：食料が足りずクッキーラビット駒を置けません`);
    return;
  }
  const spots = rabbitSpots(p);
  if (spots.length === 0) {
    log(s, `${p.name}：クッキーラビット駒を置ける場所がありません`);
    return;
  }
  t.ctx = { n };
  const opts: Option[] = spots.map((k) => ({ id: `hex:${k}`, label: `ヘクス ${k}`, data: { hex: k } }));
  opts.push({ id: 'stop', label: 'ここで終える' });
  ask(s, t, 'rabbit', `クッキーラビット駒を置く場所を選んでください（あと${n}個まで）`, opts, 'hex');
}

function resumeRabbit(s: GameState, t: Task, opt: Option): void {
  if (opt.id === 'stop') return;
  const p = P(s, t);
  const i = p.rabbitsTaken;
  p.rabbitsTaken += 1;
  p.hexes[String(opt.data!.hex)].rabbit = true;
  emit(s, { t: 'rabbit', p: t.player, hex: String(opt.data!.hex) });
  if (hasSkill(p, 11)) addScore(s, p, 'vp', 3);
  log(s, `${p.name} がクッキーラビット駒を置いた`);
  const out: Task[] = [];
  if (RABBIT_BONUS[i]) out.push(...tasks(t.player, RABBIT_BONUS[i], 'クッキーラビット駒'));
  out.push({ player: t.player, eff: { k: 'rabbit', n: Number(t.ctx!.n) - 1 }, src: t.src });
  front(s, out);
}

// =====================================================================
// スキルタイル（§6.10）
// =====================================================================

function stepSkill(s: GameState, t: Task, n: number): void {
  if (n <= 0) return;
  const p = P(s, t);
  const opts: Option[] = [];
  SKILLS.forEach((sk, i) => {
    if (s.skillPiles[i] > 0 && !hasSkill(p, sk.id)) opts.push({ id: `skill:${sk.id}`, label: sk.label, data: { id: sk.id, adv: false } });
  });
  if (s.config.variants.advSkills && p.diamond >= 1)
    for (const id of s.advSkills)
      if (!hasSkill(p, id, true)) opts.push({ id: `adv:${id}`, label: `上級：${skillDef(id, true, skillBuff(s)).label}（ダイヤ1）`, data: { id, adv: true } });
  if (opts.length === 0) return;
  t.ctx = { n };
  ask(s, t, 'skill', `スキルタイルを選んでください（あと${n}枚）`, opts);
}

function resumeSkill(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  const id = Number(opt.data!.id);
  const adv = Boolean(opt.data!.adv);
  const out: Task[] = [];
  if (adv) {
    p.diamond -= 1;
    s.advSkills = s.advSkills.filter((x) => x !== id);
    p.skills.push({ id, adv: true, flipped: false });
    emit(s, { t: 'skill', p: t.player, id, adv: true });
    const def = skillDef(id, true, skillBuff(s));
    if (id === 11) out.push(...tasks(t.player, def.eff, '上級スキルタイル'));
  } else {
    s.skillPiles[id - 1] -= 1;
    p.skills.push({ id, adv: false, flipped: false });
    emit(s, { t: 'skill', p: t.player, id, adv: false });
    const def = SKILLS[id - 1];
    if (def.kind === 'instant') out.push(...tasks(t.player, def.eff, 'スキルタイル'));
  }
  log(s, `${p.name} がスキルタイルを得た`);
  out.push({ player: t.player, eff: { k: 'skill', n: Number(t.ctx!.n) - 1 }, src: t.src, ctx: { raw: true } });
  front(s, out);
}

// =====================================================================
// 産業ボーナス（§6.9）
// =====================================================================

function startIb(s: GameState, t: Task, row?: Row): void {
  if (s.ibDepth > 0) {
    s.ibDeferred.push(t);
    return;
  }
  if (!row) {
    const opts = (['agr', 'for', 'min'] as Row[]).map((r) => ({ id: `row:${r}`, label: `${ROW_LABEL[r]}の産業ボーナス` }));
    ask(s, t, 'ibRow', 'どの産業列の産業ボーナスを得ますか', opts);
    return;
  }
  runIb(s, t, row);
}

function runIb(s: GameState, t: Task, row: Row): void {
  const p = P(s, t);
  if (hasChar(p, 'カルメン・メロ')) p.carmenCubes += 1;
  if (hasSkill(p, 12)) addScore(s, p, 'vp', 3);
  log(s, `${p.name} が${ROW_LABEL[row]}の産業ボーナスを得た`);
  emit(s, { t: 'ib', p: t.player, row });
  const board = CHARACTERS[p.character!].board;
  const chain: Task[] = [sp(t.player, 'ibStart')];
  const bundles: Bundle[] = [{ src: '産業列', effs: printedAuto(board, row, buffOn(s, p)) }];
  for (const id of p.automated[row]) bundles.push({ src: CARDS[id].nameJa, effs: CARDS[id].auto ?? [] });
  if (s.config.orderChoice) chain.push(sp(t.player, 'orderBundles', { bundles }));
  else for (const b of bundles) chain.push(...tasks(t.player, b.effs, b.src));
  chain.push(sp(t.player, 'ibEnd'));
  front(s, chain);
}

// =====================================================================
// 支払い（カードの「→」）
// =====================================================================

function stepPay(s: GameState, t: Task): void {
  const e = t.eff as Extract<Eff, { k: 'pay' }>;
  const p = P(s, t);
  if (t.ctx?.direct) {
    resumePay(s, t, 'payDirect', { id: 'direct', label: '' });
    return;
  }
  if (t.ctx?.forced) {
    t.ctx = {};
    resumePay(s, t, 'payConfirm', { id: 'pay', label: '' });
    return;
  }
  if (!canAfford(s, p, e.cost)) return;
  const opts: Option[] = [
    { id: 'pay', label: '支払う' },
    { id: 'skip', label: e.repeat ? 'もう支払わない' : '支払わない' },
  ];
  // 「何回でも」の支払い（→*）は、回数を選んでまとめて支払える（pay:k は k 回分を払って終える）。
  // 1回ずつの 'pay' も残すため、以前の手の列もそのまま再生できる
  if (e.repeat) {
    opts[0] = { id: 'pay', label: '1回支払う', data: { times: 1 } };
    for (let k = 2; k <= 99 && canAfford(s, p, scaleCost(e.cost, k)); k++) opts.push({ id: `pay:${k}`, label: `${k}回支払う`, data: { times: k } });
  }
  ask(s, t, 'payConfirm', e.repeat ? `${costLabel(e.cost)}を支払って「${describe(e.then)}」を得る回数を選んでください` : `${costLabel(e.cost)}を支払って「${describe(e.then)}」を得ますか`, opts, 'confirm');
}

function resumePay(s: GameState, t: Task, step: string, opt: Option): void {
  const e = t.eff as Extract<Eff, { k: 'pay' }>;
  const p = P(s, t);
  const ctx = (t.ctx = t.ctx ?? {});
  if (step === 'payDirect') {
    // フリーアクション：固定分なし、内訳の選択から始める
  } else if (step === 'payConfirm') {
    if (opt.id === 'skip') return;
    // pay:k は k 回分をまとめて支払い、そのあとは聞き直さない
    const k = opt.id.startsWith('pay:') ? Number(opt.id.slice(4)) : 1;
    const cost = k > 1 ? scaleCost(e.cost, k) : e.cost;
    payFixed(s, p, { ...cost, anyBasic: 0, hand: 0 });
    ctx.basicLeft = cost.anyBasic ?? 0;
    ctx.handLeft = cost.hand ?? 0;
    if (k > 1) (ctx.repeatTimes = k), (ctx.final = true);
  } else if (step === 'payBasic') {
    const c = opt.data as Record<Basic, number>;
    for (const b of BASICS) p.res[b] -= c[b];
    ctx.basicLeft = 0;
    if (ctx.bulk) ctx.times = comboTotal(c) / Number(ctx.bulk);
  } else if (step === 'payHand') {
    const id = String(opt.data!.card);
    p.hand = p.hand.filter((x) => x !== id);
    s.discard.push(id);
    emit(s, { t: 'card', p: t.player, card: id, reason: 'payCost' });
    ctx.handLeft = Number(ctx.handLeft) - 1;
  }
  if (Number(ctx.basicLeft) > 0) {
    if (ctx.bulk) {
      // 両替のフリーアクション（❺❻）の一括：bulk 個を1単位として、持っている分まで何単位でも払える
      const unit = Number(ctx.bulk);
      const opts = bulkCombos(unit, BASICS.reduce((a, b) => a + p.res[b], 0), p.res).map((c) => ({ id: `basic:${c.wheat}-${c.wood}-${c.iron}`, label: comboLabel(c), data: c }));
      ask(s, t, 'payBasic', `支払う基礎資源の内訳を選んでください（${unit}個につき${describe(e.then)}）`, opts);
      return;
    }
    const opts = basicCombos(Number(ctx.basicLeft), p.res).map((c) => ({ id: `basic:${c.wheat}-${c.wood}-${c.iron}`, label: comboLabel(c), data: c }));
    ask(s, t, 'payBasic', `支払う基礎資源${ctx.basicLeft}個の内訳を選んでください`, opts);
    return;
  }
  if (Number(ctx.handLeft) > 0) {
    const opts = p.hand.map((id) => ({ id: `card:${id}`, label: CARDS[id].nameJa, data: { card: id } }));
    ask(s, t, 'payHand', `捨てる手札を選んでください（あと${ctx.handLeft}枚）`, opts, 'card');
    return;
  }
  const times = Number(ctx.times ?? 1);
  const repeatTimes = Number(ctx.repeatTimes ?? 1);
  let then = times > 1 ? scaleEffs(e.then, times) : e.then;
  if (repeatTimes > 1) then = repeatEffs(then, repeatTimes);
  const out = tasks(t.player, then, t.src);
  if (e.repeat && !ctx.final) out.push({ player: t.player, eff: e, src: t.src });
  t.ctx = {};
  front(s, out);
}

function costLabel(c: Cost): string {
  const parts: string[] = [];
  for (const k of ['gold', 'wheat', 'wood', 'iron', 'diamond'] as const) if (c[k]) parts.push(`${RES_LABEL[k]}${c[k]}`);
  if (c.anyBasic) parts.push(`任意の基礎資源${c.anyBasic}`);
  if (c.hand) parts.push(`手札${c.hand}枚`);
  if (c.disc) parts.push(`アクションディスク${c.disc}`);
  if (c.income) for (const [k, v] of Object.entries(c.income)) parts.push(`${RES_LABEL[k as ResKind]}の収入${v}`);
  return parts.join('・') || 'なし';
}

// =====================================================================
// その他の効果
// =====================================================================

function stepSearch(s: GameState, t: Task, n: number, tag?: string, pass?: boolean): void {
  if (n <= 0) {
    const [d, r] = shuffle(s.deck, s.rng);
    s.deck = d;
    s.rng = r;
    return;
  }
  const cands = s.deck.filter((id) => (pass ? CARDS[id].type === 'pass' : (CARDS[id].tags as Record<string, number>)[tag!] > 0));
  if (cands.length === 0) {
    front(s, [{ ...t, eff: { k: 'search', tag: tag as never, pass, n: 0 } }]);
    return;
  }
  t.ctx = { n };
  ask(s, t, 'search', `市民デッキから手札に加えるカードを選んでください（あと${n}枚）`, cands.map((id) => ({ id: `card:${id}`, label: CARDS[id].nameJa, data: { card: id } })), 'card');
}

function resumeSearch(s: GameState, t: Task, opt: Option): void {
  const e = t.eff as Extract<Eff, { k: 'search' }>;
  const p = P(s, t);
  const id = String(opt.data!.card);
  s.deck = s.deck.filter((x) => x !== id);
  p.hand.push(id);
  emit(s, { t: 'card', p: t.player, card: id, reason: 'search' });
  front(s, [{ ...t, eff: { ...e, n: Number(t.ctx!.n) - 1 }, ctx: undefined }]);
}

function stepFlipAny(s: GameState, t: Task): void {
  const p = P(s, t);
  const keys = Object.keys(p.hexes).filter((k) => p.hexes[k].tile && !p.hexes[k].tile!.flipped);
  if (keys.length === 0) return;
  ask(s, t, 'flipAny', '裏返す表向きの地形タイルを選んでください', keys.map((k) => ({ id: `hex:${k}`, label: `ヘクス ${k}`, data: { hex: k } })), 'hex');
}

function resumeFlipAny(s: GameState, t: Task, opt: Option): void {
  front(s, flipTile(s, t.player, String(opt.data!.hex)));
}

function stepFreeAutomate(s: GameState, t: Task, n: number): void {
  const p = P(s, t);
  const cands = p.hand.filter((id) => automatableRows(s, p, id).length > 0);
  if (n <= 0 || cands.length === 0) return;
  t.ctx = { n };
  const opts: Option[] = [];
  for (const id of cands)
    for (const r of automatableRows(s, p, id)) opts.push({ id: `auto:${id}:${r}`, label: `${CARDS[id].nameJa} → ${ROW_LABEL[r]}列`, data: { card: id, row: r } });
  if (!(t.ctx as Record<string, unknown>).mandatory) opts.push({ id: 'skip', label: 'オートメーション化しない' });
  ask(s, t, 'freeAutomate', `無料でオートメーション化するカードを選んでください（あと${n}枚）`, opts, 'card');
}

function resumeFreeAutomate(s: GameState, t: Task, opt: Option): void {
  if (opt.id === 'skip') return;
  const p = P(s, t);
  const id = String(opt.data!.card);
  const row = opt.data!.row as Row;
  p.hand = p.hand.filter((x) => x !== id);
  p.automated[row].push(id);
  emit(s, { t: 'card', p: t.player, card: id, reason: 'automate', row });
  log(s, `${p.name} が ${CARDS[id].nameJa} をオートメーション化`);
  const n = Number(t.ctx!.n) - 1;
  if (n > 0) {
    t.ctx = { ...t.ctx, n };
    stepFreeAutomate(s, t, n);
  }
}

function stepDiscard(s: GameState, t: Task, n: number): void {
  const p = P(s, t);
  if (n <= 0 || p.hand.length === 0) return;
  t.ctx = { n };
  ask(s, t, 'discard', `捨てる手札を選んでください（あと${n}枚）`, p.hand.map((id) => ({ id: `card:${id}`, label: CARDS[id].nameJa, data: { card: id } })), 'card');
}

function resumeDiscard(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  const id = String(opt.data!.card);
  p.hand = p.hand.filter((x) => x !== id);
  s.discard.push(id);
  emit(s, { t: 'card', p: t.player, card: id, reason: 'discardEffect' });
  const n = Number(t.ctx!.n) - 1;
  if (n > 0) stepDiscard(s, t, n);
}

// =====================================================================
// 特別な処理（フロー・キャラクター）
// =====================================================================

function execSpecial(s: GameState, t: Task, id: string): void {
  const p = P(s, t);
  switch (id) {
    case 'incomeAny1':
      ask(s, t, 'incomeAny', 'どの収入値を1上げますか', (['gold', 'wheat', 'wood', 'iron'] as ResKind[]).map((r) => ({ id: `res:${r}`, label: `${RES_LABEL[r]}の収入` })));
      return;
    case 'locomotive':
      if (p.loco === null) p.loco = 0;
      emit(s, { t: 'locomotive', p: t.player });
      log(s, `${p.name} が機関車駒を得た`);
      return;
    case 'woodDiscount1':
      p.woodDiscount += 1;
      return;
    case 'woodDiscount2':
      p.woodDiscount += 2;
      return;
    case 'chooseSpecial': {
      const opts = s.specialSupply.map((x) => ({ id: `special:${x}`, label: SPECIAL_TILES[x].label }));
      ask(s, t, 'special', '置く特殊地形タイルを選んでください', opts);
      return;
    }
    case 'ibStart':
      s.ibDepth += 1;
      return;
    case 'ibEnd': {
      s.ibDepth -= 1;
      if (s.ibDepth === 0 && s.ibDeferred.length) {
        const d = s.ibDeferred;
        s.ibDeferred = [];
        front(s, d);
      }
      return;
    }
    // ---- 準備 ----
    case 'setupChar':
      ask(s, t, 'setupChar', `${p.name}：キャラクターを選んでください`, charOptions(s), 'character');
      return;
    case 'setupMap':
      ask(s, t, 'setupMap', `${p.name}：地図ボードと面を選んでください`, mapOptions(s), 'map');
      return;
    case 'setupSupport':
      ask(s, t, 'support', `${p.name}：ラウンド支援駒を置くスペースを選んでください`, supportOptions(s), 'support');
      return;
    case 'setupPick': {
      // まだピックしていない種類の選択肢をまとめて出す（rules v1.1 §10.5）
      const opts: Option[] = [];
      if (p.character === null) opts.push(...charOptions(s));
      if (p.mapId === null) opts.push(...mapOptions(s));
      if (p.supportSpace === null) opts.push(...supportOptions(s));
      ask(s, t, 'setupPick', `${p.name}：キャラクター・地図ボード・ラウンド支援駒のうち、まだ選んでいないものから1つを選んでください`, opts, 'setup');
      return;
    }
    case 'beginGame':
      s.phase = 'income';
      log(s, '第1ラウンド開始');
      emit(s, { t: 'phase', round: s.round, phase: 'income' });
      queueIncome(s);
      s.queue.push(sp(s.startPlayer, 'beginAction'));
      return;
    case 'startRound': {
      s.round += 1;
      s.phase = 'start';
      log(s, `第${s.round}ラウンド開始`);
      if (s.round === 2) s.revealed.push(...ROUND2_AREAS);
      if (s.round === 3) s.revealed.push(...ROUND3_AREAS);
      if (s.config.variants.turnOrder) {
        const order = [...s.players].sort((a, b) => (a.passOrder ?? 9) - (b.passOrder ?? 9)).map((x) => x.seat);
        s.turnOrder = order;
        s.startPlayer = order[0];
      } else s.turnOrder = clockwise(s.startPlayer, s.players.length);
      s.phase = 'income';
      emit(s, { t: 'phase', round: s.round, phase: 'income' });
      queueIncome(s);
      s.queue.push(sp(s.startPlayer, 'beginAction'));
      return;
    }
    case 'incomeSupport': {
      const col = p.supportSpace!;
      for (const tid of s.supportTiles[col]) {
        if (tid === null || tid > 100) continue;
        const def = SUPPORT_NORMAL[tid - 1];
        if (def.kind === 'income') front(s, tasks(t.player, def.eff, 'ラウンド支援タイル'));
      }
      return;
    }
    case 'incomeChar': {
      if (hasChar(p, 'グレーテル・シュトーレン')) p.diamond += buffOn(s, p) ? 2 : 1;
      if (hasChar(p, 'コーラル・ライラ')) {
        const by = prosByColor(p);
        const min = Math.min(by.O, by.G, by.Y);
        const colors = (['O', 'G', 'Y'] as ProsColor[]).filter((c) => by[c] === min);
        if (colors.length === 1) front(s, tasks(t.player, [{ k: 'pros', n: 2, color: colors[0] }], 'コーラル・ライラ'));
        else front(s, tasks(t.player, [{ k: 'choice', options: colors.map((c) => [{ k: 'pros', n: 2, color: c } as Eff]) }], 'コーラル・ライラ'));
      }
      // 上方修正のロータス・チェー：地形タイル（特殊地形タイルを含む）を1枚置く（docs/decisions_16）
      if (hasChar(p, 'ロータス・チェー') && buffOn(s, p)) front(s, tasks(t.player, [{ k: 'terrain', n: 1, kind: 'any' }], 'ロータス・チェー'));
      return;
    }
    case 'incomeTracks':
      addRes(s, p, p.income);
      return;
    case 'incomeDraw': {
      const base = s.round === 1 ? 6 : 5;
      const extra = p.drawAreas.filter(Boolean).length;
      drawCards(s, p, base + extra);
      if (s.round === 1 && hasChar(p, 'カルメン・メロ')) carmenRound1(s, t);
      return;
    }
    case 'incomeCarmen':
      if (hasChar(p, 'カルメン・メロ')) carmenRound1(s, t);
      return;
    case 'draftDeal':
      s.draftPacks = s.players.map(() => {
        const pack = s.deck.splice(0, 6);
        return pack;
      });
      s.draftPicked = s.players.map(() => []);
      return;
    case 'draftPick': {
      // 全員が同時に1枚ずつ選ぶ（§10.2）。カード ID は束をまたいで重複しないため、選択肢 ID だけで選んだ席が決まる
      const done = (t.ctx?.done as number[] | undefined) ?? [];
      const waiting = s.turnOrder.filter((pl) => !done.includes(pl) && s.draftPacks[pl].length > 0);
      if (waiting.length === 0) return;
      const options = waiting.flatMap((pl) => s.draftPacks[pl].map((id) => ({ id: `card:${id}`, label: CARDS[id].nameJa, data: { card: id, player: pl } })));
      s.pending = { player: waiting[0], kind: 'card', prompt: '手札に加えるカードを1枚選んでください', options, resume: t, step: 'draftPick', waiting };
      return;
    }
    case 'draftPass': {
      const n = s.players.length;
      // 全員同時に左隣（時計回りの次の席）へ渡す
      s.draftPacks = s.draftPacks.map((_, i) => s.draftPacks[(i - 1 + n) % n]);
      return;
    }
    case 'draftEnd':
      s.players.forEach((x, i) => x.hand.push(...s.draftPicked[i]));
      s.draftPacks = [];
      s.draftPicked = [];
      return;
    case 'beginAction':
      s.phase = 'action';
      emit(s, { t: 'phase', round: s.round, phase: 'action' });
      s.passCount = 0;
      for (const x of s.players) {
        x.passed = false;
        x.passOrder = null;
      }
      s.current = s.turnOrder[s.turnOrder.length - 1];
      s.turnActive = false;
      return;
    case 'cleanup':
      cleanup(s);
      return;
    case 'cleanupKeep': {
      if (p.hand.length <= 1) return;
      ask(s, t, 'keep', `${p.name}：次のラウンドに残す手札を1枚選んでください`, p.hand.map((id) => ({ id: `card:${id}`, label: CARDS[id].nameJa, data: { card: id } })), 'card');
      return;
    }
    case 'finalScoring':
      s.phase = 'end';
      s.finished = true;
      emit(s, { t: 'gameEnd' });
      log(s, 'ゲーム終了');
      return;
    // ---- 手番 ----
    case 'afterPlay':
      return afterPlay(s, t);
    case 'orderBundles': {
      // 同時に起きた効果のまとまり（建物駒を置いたヘクスの効果・段のボーナス、産業ボーナスの各オートメーション）を、
      // 選んだ順に1つずつ解決する（docs/decisions_13 §13.14）。順番で結果が変わりうるときだけ尋ねる
      const bundles = ((t.ctx!.bundles as Bundle[]) ?? []).filter((b) => b.effs.length > 0);
      if (bundles.length === 0) return;
      const simple = (e: Eff) => e.k === 'gain' || e.k === 'income' || e.k === 'score';
      if (bundles.length === 1 || bundles.every((b) => b.effs.every(simple))) {
        front(s, bundles.flatMap((b) => tasks(t.player, b.effs, b.src)));
        return;
      }
      t.ctx = { bundles };
      const opts = bundles.map((b, i) => ({ id: `bundle:${i}`, label: `${b.src}：${describe(b.effs)}` }));
      ask(s, t, 'orderBundles', '先に解決する効果を選んでください', opts);
      return;
    }
    case 'orderEffects': {
      // 即時能力は任意の順で解決できる（§6.9）。順番で結果が変わりうるときだけ尋ねる
      const effs = t.ctx!.effs as Eff[];
      const src = String(t.ctx!.src);
      if (effs.length === 0) return;
      const simple = (e: Eff) => e.k === 'gain' || e.k === 'income' || e.k === 'score';
      if (effs.length === 1 || effs.every(simple)) {
        front(s, tasks(t.player, effs, src));
        return;
      }
      const opts = effs.map((e, i) => ({ id: `eff:${i}`, label: describe([e]) }));
      ask(s, t, 'orderEffects', `${src}：先に解決する効果を選んでください`, opts);
      return;
    }
    case 'payHandCost':
      return payHandCost(s, t);
    case 'payAreaCost':
      return payAreaCost(s, t);
    case 'passScoring':
      return passScoring(s, t);
    case 'passRest':
      return passRest(s, t);
    case 'passDone': {
      // 最終ラウンド（第5ラウンド）のパスでは、残った基礎資源をフリーアクション❺（基礎資源1 → 1ゴールド）で
      // すべてゴールドに替える。基礎資源はゲーム終了時に得点にならず、ゴールドは5につき1勝利点になるため、
      // 替えて損をすることはない。パス時の効果（基礎資源をより高く替えるカードなど）を解決したあとに行う
      if (s.round >= 5) {
        const n = p.res.wheat + p.res.wood + p.res.iron;
        if (n > 0) {
          p.res.wheat = p.res.wood = p.res.iron = 0;
          p.res.gold += n;
          log(s, `${p.name}：残った基礎資源${n}個をゴールドに替えた（最終ラウンドのパス）`);
        }
      }
      p.passed = true;
      p.passOrder = s.passCount;
      if (s.passCount === 0) s.startPlayer = t.player;
      s.passCount += 1;
      s.turnActive = false;
      log(s, `${p.name} がパスした`);
      emit(s, { t: 'pass', p: t.player });
      return;
    }
    case 'clockPlace': {
      const opts = buildingSpots(p).map((k) => ({ id: `hex:${k}`, label: `ヘクス ${k}`, data: { hex: k } }));
      ask(s, t, 'clockPlace', '時計塔駒を置く場所を選んでください', opts, 'hex');
      return;
    }
    case 'passMove': {
      const opts = s.supportCols
        .filter((c) => s.supportMarkers[c] === null)
        .map((c) => ({ id: `col:${c}`, label: supportLabel(s, c), data: { col: c } }));
      ask(s, t, 'passMove', '次のラウンドのラウンド支援スペースを選んでください', opts, 'support');
      return;
    }
    case 'clockImmediate':
      if (hasChar(p, 'ロータス・チェー')) p.lotusRate = true;
      if (hasChar(p, 'サクラ・モチ'))
        front(s, [
          { player: t.player, eff: { k: 'search', pass: true, n: 2 } },
          sp(t.player, 'sakuraPlay'),
        ]);
      return;
    case 'sakuraPlay': {
      const cands = p.hand.filter((id) => CARDS[id].type === 'pass');
      if (cands.length === 0) return;
      ask(s, t, 'sakuraPlay', '無料でプレイするパス時カードを選んでください', cands.map((id) => ({ id: `card:${id}`, label: CARDS[id].nameJa, data: { card: id } })), 'card');
      return;
    }
    case 'endTurn':
      s.turnActive = false;
      return;
    default:
      throw new Error(`未知の特別処理: ${id}`);
  }
}

function resumeSpecial(s: GameState, t: Task, step: string, opt: Option): void {
  const p = P(s, t);
  switch (step) {
    case 'incomeAny':
      addIncome(s, p, opt.id.split(':')[1] as ResKind, 1);
      return;
    case 'setupChar':
      applySetupChar(s, p, opt.id.slice(5));
      return;
    case 'setupMap':
      applySetupMap(s, p, opt);
      return;
    case 'support':
      applySupport(s, t, p, Number(opt.data!.col));
      return;
    case 'setupPick':
      if (opt.id.startsWith('char:')) applySetupChar(s, p, opt.id.slice(5));
      else if (opt.id.startsWith('map:')) applySetupMap(s, p, opt);
      else applySupport(s, t, p, Number(opt.data!.col));
      return;
    case 'passMove': {
      const col = Number(opt.data!.col);
      if (p.supportSpace !== null) s.supportMarkers[p.supportSpace] = null;
      s.supportMarkers[col] = t.player;
      p.supportSpace = col;
      emit(s, { t: 'support', p: t.player, col });
      return;
    }
    case 'draftPick': {
      const id = String(opt.data!.card);
      const pl = Number(opt.data!.player);
      s.draftPacks[pl] = s.draftPacks[pl].filter((x) => x !== id);
      s.draftPicked[pl].push(id);
      emit(s, { t: 'card', p: pl, card: id, reason: 'draft' });
      // まだ選んでいない人がいれば、同じ巡の選択待ちを続ける
      front(s, [{ ...t, ctx: { done: [...((t.ctx?.done as number[] | undefined) ?? []), pl] } }]);
      return;
    }
    case 'keep': {
      const keep = String(opt.data!.card);
      for (const x of p.hand) if (x !== keep) emit(s, { t: 'card', p: t.player, card: x, reason: 'cleanup' });
      s.discard.push(...p.hand.filter((x) => x !== keep));
      p.hand = [keep];
      return;
    }
    case 'clockPlace': {
      p.clockPlaced = true;
      front(s, placeBuildingAt(s, t.player, String(opt.data!.hex), 'clock'));
      return;
    }
    case 'sakuraPlay': {
      const id = String(opt.data!.card);
      playCard(s, t.player, id, 0);
      log(s, `（${CARDS[id].nameJa} は無料でプレイ）`);
      return;
    }
    case 'orderBundles': {
      const bundles = t.ctx!.bundles as Bundle[];
      const i = Number(opt.id.split(':')[1]);
      const rest = bundles.filter((_, j) => j !== i);
      front(s, [...tasks(t.player, bundles[i].effs, bundles[i].src), sp(t.player, 'orderBundles', { bundles: rest })]);
      return;
    }
    case 'orderEffects': {
      const effs = t.ctx!.effs as Eff[];
      const i = Number(opt.id.split(':')[1]);
      const rest = effs.filter((_, j) => j !== i);
      front(s, [...tasks(t.player, [effs[i]], String(t.ctx!.src)), sp(t.player, 'orderEffects', { effs: rest, src: t.ctx!.src })]);
      return;
    }
    case 'turn':
      return resumeTurn(s, t, opt);
    case 'handCost':
      return resumeHandCost(s, t, opt);
    case 'areaCost':
      return resumeAreaCost(s, t, opt);
    case 'automateOffer':
      return resumeAutomateOffer(s, t, opt);
    default:
      throw new Error(`未知の選択段階: ${step}`);
  }
}

function supportLabel(s: GameState, col: number): string {
  const names = s.supportTiles[col]
    .filter((x): x is number => x !== null)
    .map((id) => (id > 100 ? `パス時：${SUPPORT_PASS[id - 101].label}` : SUPPORT_NORMAL[id - 1].label));
  return `列${col + 1}：${names.join(' ／ ')}`;
}

function queueIncome(s: GameState): void {
  const draft = s.round === 1 && s.config.variants.draft;
  for (const pl of s.turnOrder) {
    s.queue.push(sp(pl, 'incomeSupport'), sp(pl, 'incomeChar'), sp(pl, 'incomeTracks'));
    if (!draft) s.queue.push(sp(pl, 'incomeDraw'));
  }
  if (draft) {
    // 手札のドラフト（§10.2）：6枚引き、1枚取って左隣へ渡すのを繰り返す
    s.queue.push(sp(s.startPlayer, 'draftDeal'));
    for (let k = 0; k < 6; k++) {
      s.queue.push(sp(s.startPlayer, 'draftPick'));
      s.queue.push(sp(s.startPlayer, 'draftPass'));
    }
    s.queue.push(sp(s.startPlayer, 'draftEnd'));
    for (const pl of s.turnOrder) s.queue.push(sp(pl, 'incomeCarmen'));
  }
}

function carmenRound1(s: GameState, t: Task): void {
  const p = P(s, t);
  drawCards(s, p, 2);
  // 8枚の中にオートメーション化できるカードが2枚ない場合は引き直す
  let guard = 0;
  while (p.hand.filter((id) => automatableRows(s, p, id).length > 0).length < 2 && guard++ < 20) {
    s.deck.push(...p.hand);
    p.hand = [];
    drawCards(s, p, 8);
  }
  const task: Task = { player: t.player, eff: { k: 'special', id: 'carmen' }, ctx: { n: 2, mandatory: true } };
  stepFreeAutomate(s, task, 2);
}

function cleanup(s: GameState): void {
  for (const a of Object.values(s.areas)) a.slots = a.slots.map(() => null);
  for (const p of s.players) {
    p.discs = 0;
    p.usedFree = [];
    p.skills.forEach((x) => (x.flipped = false));
  }
  for (const pl of s.turnOrder) s.queue.push(sp(pl, 'cleanupKeep'));
  s.queue.push(sp(s.startPlayer, 'startRound'));
}

// =====================================================================
// 手番（§6）
// =====================================================================

function areaAvailable(s: GameState, id: string): boolean {
  if (!s.areas[id]) return false;
  if (AREAS[id].group === 'advanced' && !s.revealed.includes(id)) return false;
  return s.areas[id].slots.some((x) => x === null);
}

export function areaCost(s: GameState, p: PlayerState, id: string): Cost {
  const c: Cost = { ...AREAS[id].cost };
  if (hasChar(p, 'ナタ・パステル') && (id === 'F' || id === 'Q')) c.iron = Math.max(0, (c.iron ?? 0) - 1);
  // 上方修正では、上級スキルタイル13・14は割引でなくフリップ能力になる（docs/decisions_16 §16.7）
  if (hasSkill(p, 13, true) && id === 'D' && !skillBuff(s)) c.wood = 3;
  if (hasSkill(p, 14, true) && id === 'A' && !skillBuff(s)) c.wheat = 4;
  return c;
}

/** リッカ・ベリー：麦を木材（上方修正ではゴールド）で払える */
function areaCostAffordable(s: GameState, p: PlayerState, id: string, extra: Cost = {}): boolean {
  const c = areaCost(s, p, id);
  const total: Cost = { ...c, gold: (c.gold ?? 0) + (extra.gold ?? 0) };
  if (hasChar(p, 'リッカ・ベリー') && (id === 'C' || id === 'O')) {
    const w = c.wheat ?? 0;
    const sub = rikkaSub(s, p);
    // 代わりに払える数は、ほかのコストに充てた残り
    return p.res.wheat + p.res[sub] - (total[sub] ?? 0) >= w && canAfford(s, p, { ...total, wheat: 0 });
  }
  return canAfford(s, p, total);
}

function handCostOk(s: GameState, p: PlayerState, k: number, reserveDiamond = 0): boolean {
  const cards = s.round >= 5 ? p.hand.length : Math.max(0, p.hand.length - 1);
  const dia = hasChar(p, 'グレーテル・シュトーレン') ? Math.max(0, p.diamond - reserveDiamond) : 0;
  return cards + dia >= k;
}

function areaFeasible(s: GameState, p: PlayerState, id: string, extraGold = 0): boolean {
  if (!areaCostAffordable(s, p, id, { gold: extraGold })) return false;
  const def = AREAS[id];
  if (def.building) return canBuildViaAction(s, { ...p, res: { ...p.res, gold: p.res.gold - extraGold } } as PlayerState, { wood: def.cost.wood ?? 0 });
  return true;
}

/** アクションスペースの手札コスト（スペースの順番＝枚数）。上方修正のナタ・パステルは工業トラックのエリア（F・Q）で、
 *  リッカ・ベリーは食料トラックのエリア（B・N）で常に1枚（docs/decisions_16） */
function slotHandCost(s: GameState, p: PlayerState, area: string, slot: number): number {
  if (hasChar(p, 'ナタ・パステル') && buffOn(s, p) && (area === 'F' || area === 'Q')) return 1;
  if (hasChar(p, 'リッカ・ベリー') && buffOn(s, p) && (area === 'B' || area === 'N')) return 1;
  return slot + 1;
}

function turnMenu(s: GameState): void {
  const p = s.players[s.current];
  const t: Task = sp(s.current, 'turn');
  const opts: Option[] = [];
  if (!s.turnMainDone) {
    // ❶ アクションスペース
    for (const id of Object.keys(s.areas)) {
      if (!areaAvailable(s, id)) continue;
      const slot = s.areas[id].slots.indexOf(null);
      const k = slotHandCost(s, p, id, slot);
      const def = AREAS[id];
      const targets = def.copy ? copyTargets(s, def.copy) : [null];
      for (const tgt of targets) {
        const feasible = tgt ? areaFeasible(s, p, tgt, 4) && p.res.gold >= 4 : areaFeasible(s, p, id);
        if (!feasible) continue;
        const base = tgt ? `area:${id}:${tgt}` : `area:${id}`;
        const label = tgt ? `${def.label}：${AREAS[tgt].label}` : def.label;
        const reserve = areaCost(s, p, tgt ?? id).diamond ?? 0;
        if (handCostOk(s, p, k, reserve)) opts.push({ id: base, label: `${label}（手札${k}枚）`, data: { area: id, target: tgt, slot, disc: false } });
        if (p.discs > 0) opts.push({ id: `${base}:disc`, label: `${label}（アクションディスク使用）`, data: { area: id, target: tgt, slot, disc: true } });
      }
    }
    // ❷ 市民カードのプレイ
    if (canLoseCards(s, p, 1))
      for (const id of p.hand) {
        const cost = cardCost(s, p, id);
        if (p.res.gold >= cost) opts.push({ id: `play:${id}`, label: `${CARDS[id].nameJa}をプレイ（${cost}ゴールド）`, data: { card: id, cost } });
      }
    // ❸ フリップ能力
    for (const sk of p.skills) {
      const def = skillDef(sk.id, sk.adv, skillBuff(s));
      if (def.kind !== 'flip' || sk.flipped) continue;
      const payable = def.eff[0].k !== 'pay' || canAfford(s, p, (def.eff[0] as Extract<Eff, { k: 'pay' }>).cost);
      if (payable) opts.push({ id: `flip:${sk.adv ? 'a' : 's'}${sk.id}`, label: `フリップ：${def.label}`, data: { id: sk.id, adv: sk.adv } });
    }
    // ❹ パス
    opts.push({ id: 'pass', label: 'パスする' });
  } else {
    opts.push({ id: 'endTurn', label: '手番を終える' });
  }
  opts.push(...freeActionOptions(s, p));
  ask(s, t, 'turn', s.turnMainDone ? 'フリーアクションを行うか、手番を終えてください' : '行動を選んでください', opts, 'turn');
}

function copyTargets(s: GameState, kind: 'basic' | 'basicOrAdvanced'): string[] {
  const out = [...BASIC_AREAS];
  if (kind === 'basicOrAdvanced') out.push(...s.revealed);
  return out;
}

function resumeTurn(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  const id = opt.id;
  if (id === 'endTurn') {
    s.turnActive = false;
    return;
  }
  if (id === 'pass') {
    s.turnMainDone = true;
    s.queue.push(sp(t.player, 'passScoring'));
    return;
  }
  if (id.startsWith('area:')) {
    s.turnMainDone = true;
    const d = opt.data as { area: string; target: string | null; slot: number; disc: boolean };
    s.areas[d.area].slots[d.slot] = t.player;
    emit(s, { t: 'disc', p: t.player, area: d.area, slot: d.slot, own: d.disc });
    log(s, `${p.name} が「${AREAS[d.area].label}」を選んだ`);
    const k = slotHandCost(s, p, d.area, d.slot);
    if (d.disc) p.discs -= 1;
    else s.queue.push(sp(t.player, 'payHandCost', { n: k, reserve: areaCost(s, p, d.target ?? d.area).diamond ?? 0 }));
    s.queue.push(sp(t.player, 'payAreaCost', { area: d.area, target: d.target }));
    return;
  }
  if (id.startsWith('play:')) {
    s.turnMainDone = true;
    const card = String(opt.data!.card);
    playCard(s, t.player, card, Number(opt.data!.cost));
    return;
  }
  if (id.startsWith('flip:')) {
    s.turnMainDone = true;
    const adv = Boolean(opt.data!.adv);
    const sid = Number(opt.data!.id);
    const sk = p.skills.find((x) => x.id === sid && x.adv === adv)!;
    sk.flipped = true;
    emit(s, { t: 'skillFlip', p: t.player, id: sid, adv });
    const def = skillDef(sid, adv, skillBuff(s));
    const ts = tasks(t.player, def.eff, 'フリップ能力');
    ts.forEach((x) => x.eff.k === 'pay' && (x.ctx = { forced: true }));
    s.queue.push(...ts);
    return;
  }
  if (id.startsWith('fa')) {
    resumeFreeAction(s, t, opt);
    return;
  }
  throw new Error(`未知の手番の選択: ${id}`);
}

function payHandCost(s: GameState, t: Task): void {
  const p = P(s, t);
  const n = Number(t.ctx!.n);
  if (n <= 0) return;
  const opts: Option[] = [];
  if (canLoseCards(s, p, 1)) for (const id of p.hand) opts.push({ id: `card:${id}`, label: CARDS[id].nameJa, data: { card: id } });
  const reserve = Number(t.ctx!.reserve ?? 0);
  if (hasChar(p, 'グレーテル・シュトーレン') && p.diamond - reserve > 0) opts.push({ id: 'diamond', label: 'ダイヤで払う' });
  ask(s, t, 'handCost', `手札コスト：捨てるカードを選んでください（あと${n}枚）`, opts, 'card');
}

function resumeHandCost(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  if (opt.id === 'diamond') {
    p.diamond -= 1;
    if (clockOf(p, 'グレーテル・シュトーレン')) addScore(s, p, 'vp', 3);
  } else {
    const id = String(opt.data!.card);
    p.hand = p.hand.filter((x) => x !== id);
    s.discard.push(id);
    emit(s, { t: 'card', p: t.player, card: id, reason: 'handCost' });
  }
  front(s, [sp(t.player, 'payHandCost', { n: Number(t.ctx!.n) - 1, reserve: t.ctx!.reserve })]);
}

function payAreaCost(s: GameState, t: Task): void {
  const p = P(s, t);
  const area = String(t.ctx!.area);
  const target = t.ctx!.target ? String(t.ctx!.target) : null;
  const exec = target ?? area;
  if (target) p.res.gold -= 4;
  const c = areaCost(s, p, exec);
  if (hasChar(p, 'リッカ・ベリー') && (exec === 'C' || exec === 'O') && (c.wheat ?? 0) > 0) {
    const w = c.wheat!;
    const sub = rikkaSub(s, p);
    const spare = p.res[sub] - (c[sub] ?? 0);
    const opts: Option[] = [];
    // ID の数は代わりに払う個数。上方修正ではゴールド、通常は木材の個数を表す
    for (let n = 0; n <= w; n++) {
      const wheat = w - n;
      if (wheat <= p.res.wheat && n <= spare) opts.push({ id: `split:${n}`, label: `麦${wheat}・${RES_LABEL[sub]}${n}`, data: { [sub]: n, wheat } });
    }
    t.ctx = { ...t.ctx, exec };
    ask(s, t, 'areaCost', `麦の代わりに${RES_LABEL[sub]}で払う個数を選んでください`, opts);
    return;
  }
  payFixed(s, p, c);
  front(s, tasks(t.player, AREAS[exec].effect, AREAS[exec].label));
}

function resumeAreaCost(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  const exec = String(t.ctx!.exec);
  const c = areaCost(s, p, exec);
  const d = opt.data!;
  payFixed(s, p, { ...c, wheat: Number(d.wheat), wood: (c.wood ?? 0) + Number(d.wood ?? 0), gold: (c.gold ?? 0) + Number(d.gold ?? 0) });
  front(s, tasks(t.player, AREAS[exec].effect, AREAS[exec].label));
}

function playCard(s: GameState, player: number, id: string, cost: number): void {
  const p = s.players[player];
  const c = CARDS[id];
  p.res.gold -= cost;
  p.hand = p.hand.filter((x) => x !== id);
  p.played.push(id);
  emit(s, { t: 'card', p: player, card: id, reason: 'play' });
  log(s, `${p.name} が ${c.nameJa} をプレイ`);
  if (hasChar(p, 'セナ・デライト')) addIncome(s, p, 'gold', 1);
  if (clockOf(p, 'セナ・デライト')) addScore(s, p, 'vp', 2);
  if (hasSkill(p, 12, true)) addScore(s, p, 'vp', 2);
  if (c.type === 'immediate') {
    s.queue.push(sp(player, 'orderEffects', { effs: c.main, src: c.nameJa }));
    s.queue.push(sp(player, 'afterPlay', { card: id }));
  }
}

/** オートメーション化のダイヤ（割引後） */
export function automationPrice(s: GameState, p: PlayerState): number {
  return supportActive(s, p, 14) ? 0 : 1;
}

function afterPlay(s: GameState, t: Task): void {
  const p = P(s, t);
  const id = String(t.ctx!.card);
  if (!p.played.includes(id)) return;
  const rows = automatableRows(s, p, id);
  const price = automationPrice(s, p);
  if (rows.length === 0 || p.diamond < price) return;
  const opts: Option[] = rows.map((r) => ({ id: `auto:${r}`, label: `ダイヤ${price}で${ROW_LABEL[r]}列にオートメーション化`, data: { row: r, price } }));
  opts.push({ id: 'skip', label: 'オートメーション化しない' });
  ask(s, t, 'automateOffer', `${CARDS[id].nameJa}をオートメーション化しますか`, opts, 'confirm');
}

function resumeAutomateOffer(s: GameState, t: Task, opt: Option): void {
  if (opt.id === 'skip') return;
  const p = P(s, t);
  const id = String(t.ctx!.card);
  const row = opt.data!.row as Row;
  p.diamond -= Number(opt.data!.price);
  p.played = p.played.filter((x) => x !== id);
  p.automated[row].push(id);
  emit(s, { t: 'card', p: t.player, card: id, reason: 'automate', row });
  log(s, `${p.name} が ${CARDS[id].nameJa} をオートメーション化`);
}

// ---- パス（§6.11） ----
function passScoring(s: GameState, t: Task): void {
  const p = P(s, t);
  const ip = passedIp(p);
  p.ipThisPass = ip;
  const out: Task[] = [];
  const vp = (n: number) => n > 0 && addScore(s, p, 'vp', n);
  // ① キャラクター
  if (clockOf(p, 'ビスキュイ・バステト')) addScore(s, p, 'ip', cities(p, buffOn(s, p)).filter((c) => c.some((k) => p.hexes[k].building === 'lab')).length);
  if (clockOf(p, 'ナタ・パステル')) vp(ip);
  if (clockOf(p, 'ソルビー・ショコラ')) vp(Object.values(p.hexes).filter((h) => h.rabbit).length);
  if (clockOf(p, 'リッカ・ベリー')) {
    if (buffOn(s, p)) vp(2 * Object.values(p.hexes).filter((h) => h.rabbit).length);
    else addScore(s, p, 'cp', cities(p).filter((c) => c.some((k) => p.hexes[k].rabbit)).length);
  }
  if (clockOf(p, 'アリス・ティーローズ')) {
    const n = cities(p, buffOn(s, p)).length;
    if (buffOn(s, p)) addScore(s, p, 'cp', n);
    else vp(n);
  }
  if (hasChar(p, 'エルサ・スカイル')) out.push(...tasks(t.player, [{ k: 'terrain', n: 1, kind: 'any' }], 'エルサ・スカイル'));
  if (clockOf(p, 'エルサ・スカイル')) vp(2 * connectedPorts(p));
  if (clockOf(p, 'エリ・マカロン')) {
    // 上方修正では、基礎資源の収入値のうち最大値（通常は最小値）
    const inc = [p.income.wheat, p.income.wood, p.income.iron];
    vp(buffOn(s, p) ? Math.max(...inc) : Math.min(...inc));
  }
  if (clockOf(p, 'カルメン・メロ')) vp(p.carmenCubes);
  if (clockOf(p, 'ジャスミン・メイ')) vp(p.skills.length);
  if (clockOf(p, 'コーラル・ライラ')) {
    const by = prosByColor(p);
    vp(2 * Math.min(by.O, by.G, by.Y));
  }
  out.push(sp(t.player, 'passRest'));
  front(s, out);
}

function passRest(s: GameState, t: Task): void {
  const p = P(s, t);
  const vp = (n: number) => n > 0 && addScore(s, p, 'vp', n);
  // ② 都市点
  const nc = Math.min(6, cities(p, buffOn(s, p)).length);
  const rate = clockOf(p, 'ロータス・チェー') || p.lotusRate ? (buffOn(s, p) && hasChar(p, 'ロータス・チェー') ? LOTUS_CITY_RATE_BUFF : LOTUS_CITY_RATE) : CITY_RATE;
  addScore(s, p, 'cp', rate[nc]);
  // ③ 工業点（①でエルサ・スカイルが地形タイルを置いた場合に備えて数え直す）
  p.ipThisPass = passedIp(p);
  addScore(s, p, 'ip', p.ipThisPass);
  // ④ パス時支援タイル
  const up = s.supportTiles[p.supportSpace!][0];
  if (up !== null && up > 100) vp(passSupportVp(s, p, up));
  // ⑤ スキルタイル
  for (const sk of p.skills) vp(skillPassVp(s, p, sk.id, sk.adv));
  // ⑥ パス時市民カード
  const out: Task[] = [];
  for (const id of p.played) if (CARDS[id].type === 'pass') out.push(...tasks(t.player, CARDS[id].main, CARDS[id].nameJa));
  out.push(sp(t.player, 'passMove'), sp(t.player, 'passDone'));
  front(s, out);
}

function passSupportVp(s: GameState, p: PlayerState, id: number): number {
  switch (id) {
    case 101:
      return 3 * cities(p, buffOn(s, p)).length;
    case 102:
      return playedCount(p);
    case 103:
      return Math.max(...(['W', 'F', 'M', 'S'] as Terrain[]).map((k) => terrainCount(p, k)));
    case 104:
      return 3 * connectedPorts(p);
    case 105:
      return Math.min(p.income.wheat, p.income.wood, p.income.iron);
  }
  return 0;
}

function skillPassVp(s: GameState, p: PlayerState, id: number, adv: boolean): number {
  if (!adv) {
    if (id === 4) {
      const m = Math.min(p.automated.agr.length, p.automated.for.length, p.automated.min.length);
      return m >= 3 ? 24 : m >= 2 ? 12 : m >= 1 ? 6 : 0;
    }
    if (id === 5) return p.food >= 9 ? 7 : p.food >= 6 ? 5 : p.food >= 3 ? 3 : 0;
    if (id === 6) {
      const x = p.ipThisPass;
      return x >= 8 ? 10 : x >= 6 ? 7 : x >= 4 ? 5 : x >= 2 ? 3 : 0;
    }
    return 0;
  }
  if (id === 1) {
    const c = cities(p, buffOn(s, p)).length;
    return c >= 5 ? 15 : c >= 3 ? 7 : c >= 1 ? 3 : 0;
  }
  if (id === 2) return [0, 2, 6, 12, 20][connectedPorts(p)];
  if (id === 3) return 2 * Math.max(...Object.values(tagCounts(p, buffOn(s, p))));
  return 0;
}

// ---- フリーアクション（§7） ----
function freeActionOptions(s: GameState, p: PlayerState): Option[] {
  const out: Option[] = [];
  const basics = p.res.wheat + p.res.wood + p.res.iron;
  if (canLoseCards(s, p, 1) && basics >= 3 && (terrainTargets(s, p, 'any').length > 0 || legalRoadEdges(p).length > 0))
    out.push({ id: 'fa1', label: '手札1枚＋基礎資源3 → 地形タイル1枚か道駒1個' });
  if (p.res.gold >= 15) out.push({ id: 'fa2', label: '15ゴールド → 市民カード1枚' });
  if (p.res.gold >= 4) out.push({ id: 'fa3', label: '4ゴールド → 任意の基礎資源1' });
  s.milestones.forEach((m, i) => {
    if (m.takenBy === null && !s.milestonesClosed && checkMilestone(s, p, `${m.id}${m.side}`))
      out.push({ id: `fa4:${i}`, label: `マイルストーン${m.id}${m.side}を獲得`, data: { idx: i } });
  });
  if (basics >= 1) out.push({ id: 'fa5', label: '基礎資源1 → 1ゴールド' });
  if (basics >= 3) out.push({ id: 'fa6', label: '基礎資源3 → 任意の基礎資源1' });
  if (p.discs >= 1) out.push({ id: 'fa7d', label: 'アクションディスク1 → 任意の基礎資源2' });
  if (canLoseCards(s, p, 1)) out.push({ id: 'fa7h', label: '手札1枚 → 任意の基礎資源2' });
  if (!p.clockPlaced && clockReady(s, p) && buildingSpots(p).length > 0) out.push({ id: 'fa8', label: '時計塔駒を置く' });
  // キャラクター固有
  const used = (k: string) => p.usedFree.includes(k);
  if (hasChar(p, 'ビスキュイ・バステト') && !used('biscuit') && biscuitSteps(s, p) > 0)
    out.push({ id: 'faC:biscuit', label: '研究所のある都市1つにつき工業トラック1歩' });
  if (hasChar(p, 'ロータス・チェー') && !used('lotus') && Object.values(p.hexes).some((h) => h.tile && !h.tile.flipped))
    out.push({ id: 'faC:lotus', label: '表向きの地形タイルを1枚裏返す' });
  if (hasChar(p, 'ソルビー・ショコラ')) {
    if (p.food >= 3 && !used('solbee3')) out.push({ id: 'faC:solbee3', label: '麦1を得る' });
    if (p.food >= 5 && !used('solbee5')) out.push({ id: 'faC:solbee5', label: '道駒を1個置く' });
    if (buffOn(s, p) && p.food >= 7 && !used('solbee7') && terrainTargets(s, p, 'any').length > 0) out.push({ id: 'faC:solbee7', label: '地形タイルを1枚置く' });
    if (p.food >= 9 && !used('solbee9')) out.push({ id: 'faC:solbee9', label: '任意の繁栄トラック1歩' });
  }
  if (hasChar(p, 'サクラ・モチ') && !used('sakura') && canLoseCards(s, p, 1)) out.push({ id: 'faC:sakura', label: '手札1枚 → アクションディスク1枚' });
  return out;
}

export function clockReady(s: GameState, p: PlayerState): boolean {
  const c = CHARACTERS[p.character!];
  return c.clock.every((alts) =>
    alts.some((r) => {
      switch (r.k) {
        case 'terrain':
          return terrainCount(p, r.kind) >= r.n;
        case 'bld':
          return buildingCount(p, r.type) >= r.n;
        case 'played':
          return r.row === 'any' ? playedCount(p) >= r.n : playedCount(p, r.row) >= r.n;
        case 'food':
          return p.food >= r.n;
        case 'ipPassed':
          return passedIp(p) >= r.n;
        case 'wonder':
          return p.wonders >= 1;
      }
    }),
  );
}

function resumeFreeAction(s: GameState, t: Task, opt: Option): void {
  const p = P(s, t);
  const id = opt.id;
  const q = (effs: Eff[]) => s.queue.push(...tasks(t.player, effs, 'フリーアクション'));
  switch (id) {
    case 'fa1': {
      const choices: Eff[][] = [];
      if (terrainTargets(s, p, 'any').length) choices.push([{ k: 'terrain', n: 1, kind: 'any' }]);
      if (legalRoadEdges(p).length) choices.push([{ k: 'road', n: 1 }]);
      const then: Eff[] = choices.length === 1 ? choices[0] : [{ k: 'choice', options: choices }];
      q([{ k: 'pay', cost: { hand: 1, anyBasic: 3 }, then }]);
      // 支払い確認を省くため、直接支払い段階から始める
      s.queue[s.queue.length - 1].ctx = { basicLeft: 3, handLeft: 1, direct: true };
      return;
    }
    case 'fa2':
      p.res.gold -= 15;
      q([{ k: 'draw', n: 1 }]);
      return;
    // ❸❺❻の両替は、繰り返し使うのと同じ結果を1回の入力で得られるよう、何単位分でもまとめて行う。
    // 1単位分の内訳の選択肢 ID は以前と同じため、以前の手の列もそのまま再生できる
    case 'fa3':
      q([{ k: 'anyBasic', n: 1 }]);
      s.queue[s.queue.length - 1].ctx = { goldEach: 4 };
      return;
    case 'fa5':
      q([{ k: 'pay', cost: { anyBasic: 1 }, then: [{ k: 'gain', res: { gold: 1 } }] }]);
      s.queue[s.queue.length - 1].ctx = { basicLeft: 1, handLeft: 0, direct: true, bulk: 1 };
      return;
    case 'fa6':
      q([{ k: 'pay', cost: { anyBasic: 3 }, then: [{ k: 'anyBasic', n: 1 }] }]);
      s.queue[s.queue.length - 1].ctx = { basicLeft: 3, handLeft: 0, direct: true, bulk: 3 };
      return;
    case 'fa7d':
      p.discs -= 1;
      q([{ k: 'anyBasic', n: 2 }]);
      return;
    case 'fa7h':
      q([{ k: 'pay', cost: { hand: 1 }, then: [{ k: 'anyBasic', n: 2 }] }]);
      s.queue[s.queue.length - 1].ctx = { basicLeft: 0, handLeft: 1, direct: true };
      return;
    case 'fa8':
      s.queue.push({ player: t.player, eff: { k: 'special', id: 'clockPlace' } });
      s.queue.push(sp(t.player, 'clockImmediate'));
      return;
  }
  if (id.startsWith('fa4:')) {
    const i = Number(opt.data!.idx);
    s.milestones[i].takenBy = t.player;
    emit(s, { t: 'milestone', p: t.player, idx: i });
    log(s, `${p.name} がマイルストーンを獲得`);
    if (s.milestones.filter((m) => m.takenBy !== null).length >= 3) s.milestonesClosed = true;
    return;
  }
  if (id.startsWith('faC:')) {
    const k = id.slice(4);
    p.usedFree.push(k);
    if (k === 'biscuit') q([{ k: 'industry', n: biscuitSteps(s, p) }]);
    if (k === 'lotus') q([{ k: 'flipAny' }]);
    if (k === 'solbee3') q([{ k: 'gain', res: { wheat: 1 } }]);
    if (k === 'solbee5') q([{ k: 'road', n: 1 }]);
    if (k === 'solbee7') q([{ k: 'terrain', n: 1, kind: 'any' }]);
    if (k === 'solbee9') q([{ k: 'pros', n: 1 }]);
    if (k === 'sakura') {
      q([{ k: 'pay', cost: { hand: 1 }, then: [{ k: 'disc' }] }]);
      s.queue[s.queue.length - 1].ctx = { basicLeft: 0, handLeft: 1, direct: true };
    }
  }
}

// =====================================================================
// 効果の説明文（UI 用）
// =====================================================================

export function describe(effs: Eff[]): string {
  return effs.map(describeOne).join('、');
}

function describeOne(e: Eff): string {
  switch (e.k) {
    case 'gain':
      return Object.entries(e.res)
        .map(([k, v]) => `${RES_LABEL[k as ResKind]}${v}`)
        .join('・');
    case 'anyBasic':
      return `任意の基礎資源${e.n}`;
    case 'income':
      return `${RES_LABEL[e.res]}の収入+${e.n}`;
    case 'terrain':
      return `地形タイル${e.n}枚${e.kind === 'any' ? '' : `（${{ W: '麦畑', F: '森林', M: '鉱山', S: '海' }[e.kind]}）`}`;
    case 'road':
      return `道駒${e.n}個`;
    case 'mix':
      return `地形タイル${e.terrain}枚と道駒${e.road}個`;
    case 'building':
      return `建物駒${e.n}個`;
    case 'food':
      return `食料トラック${e.n}歩`;
    case 'industry':
      return `工業トラック${e.n}歩`;
    case 'pros':
      return `${e.color ? COLOR_LABEL[e.color] + 'の' : ''}繁栄トラック${e.n}歩`;
    case 'rabbit':
      return `クッキーラビット駒${e.n}個`;
    case 'draw':
      return `市民カード${e.n}枚`;
    case 'skill':
      return `スキルタイル${e.n}枚`;
    case 'ib':
      return `${e.row ? ROW_LABEL[e.row] : '任意'}の産業ボーナス`;
    case 'score':
      return `${{ vp: '勝利点', cp: '都市点', ip: '工業点' }[e.kind]}${e.n}`;
    case 'wonder':
      return 'ワンダーアイコン';
    case 'disc':
      return 'アクションディスク1枚';
    case 'choice':
      return e.options.map(describe).join(' または ');
    case 'pay':
      return `${costLabel(e.cost)}を払って${describe(e.then)}`;
    case 'cond':
      return `条件に応じて${describe(e.then)}`;
    case 'search':
      return `市民デッキから${e.n}枚探す`;
    case 'flipAny':
      return '地形タイルを1枚裏返す';
    case 'drawAutomate':
      return '1枚引いて1枚オートメーション化';
    case 'discardDraw':
      return `${e.draw}枚引いて${e.discard}枚捨てる`;
    case 'special':
      return e.id;
  }
}

// =====================================================================
// テスト・デバッグ用：効果を割り込ませて解決する（純粋関数）
// =====================================================================
export function withEffects(state: GameState, player: number, effs: Eff[]): GameState {
  const s: GameState = structuredClone(state);
  s.pending = null; // 手番メニューは解決後に作り直される
  front(s, tasks(player, effs, 'test'));
  run(s);
  return s;
}
