// 対話プレイ用のコマンドの文字の組み立て。局面から ID・名前・数値だけを並べる。
// 判定はしない：選択肢は record.ts の seatOptions（getOptions）、派生値は queries.ts、得点は scoring.ts、
// 選べない理由の文は explain.ts から得る。対局中に変わらない文言は ref.ts に分ける。
// 非公開情報：視点の席以外の手札の中身と、山札の順序は出さない。

import { AREAS, BUILDING_LABEL, FOOD_BONUS, FOOD_END, INDUSTRY_END, LAB_GAPS, MAP_ICON, MILESTONE_LABEL, PROS_TRACKS, RABBIT_POS, SPECIAL_TILES, SUPPORT_NORMAL, SUPPORT_PASS, FINAL_TILES, gridBonus, skillDef } from '../../src/game/boards';
import { CARDS } from '../../src/game/cards';
import { CHARACTERS, isBuffed } from '../../src/game/characters';
import { cardCost, clockReady, describe, pieceCostAt } from '../../src/game/engine';
import { explain } from '../../src/game/explain';
import { cities, connectedPorts, edgeInfo, EDGE_DIR_LABEL, MAPS, passedIp, portStatus, rowCapacity, tagCounts, drawAreaReady } from '../../src/game/queries';
import { finalMetric, finalScores } from '../../src/game/scoring';
import { parseHexKey } from '../../src/game/geometry';
import type { Cost, GameEvent, GameState, Option, PlayerState, Row, Terrain } from '../../src/game/types';
import { TAGS } from '../../src/game/types';
import { isWaitingFor, seatOptions, shownId, waitingSeats, type StepInfo } from './record';

export const ROW_LABEL: Record<Row, string> = { agr: '農業', for: '林業', min: '鉱業' };
const PHASE_LABEL: Record<string, string> = { setup: '準備', start: '収入', income: '収入', action: 'アクション', cleanup: 'クリーンアップ', end: '終了' };
const TERRAIN_LABEL: Record<string, string> = { W: '麦畑', F: '森林', M: '鉱山', S: '海', X: '特殊地形', C: '首都' };

export const seatName = (s: GameState, i: number): string => {
  const p = s.players[i];
  return p.character ? `P${i}（${p.character}）` : `P${i}`;
};

export const costText = (c: Cost): string => {
  const parts: string[] = [];
  if (c.gold) parts.push(`${c.gold}ゴールド`);
  if (c.wheat) parts.push(`麦${c.wheat}`);
  if (c.wood) parts.push(`木材${c.wood}`);
  if (c.iron) parts.push(`鉄${c.iron}`);
  if (c.diamond) parts.push(`ダイヤ${c.diamond}`);
  return parts.join('・') || 'なし';
};

// ---- 進行 ----

export function statusLine(s: GameState): string {
  if (s.finished) return '== ゲーム終了';
  const order = s.turnOrder.map((i) => `P${i}`).join('→');
  const passed = s.players.filter((p) => p.passed).map((p) => `P${p.seat}`);
  const waiting = waitingSeats(s).map((i) => `P${i}`).join('・');
  const parts = [`第${s.round}ラウンド（全5）・${PHASE_LABEL[s.phase] ?? s.phase}`];
  if (s.phase !== 'setup') parts.push(`手番順 ${order}`);
  if (passed.length) parts.push(`パス済み ${passed.join('・')}`);
  parts.push(`選択待ち ${waiting || 'なし'}`);
  parts.push(`山札${s.deck.length}・捨て札${s.discard.length}`);
  return `== ${parts.join('｜')}`;
}

// ---- プレイヤー ----

const resText = (p: PlayerState) => `G${p.res.gold} 麦${p.res.wheat} 木${p.res.wood} 鉄${p.res.iron} ダイヤ${p.diamond}`;
const incomeText = (p: PlayerState) => `収入 G${p.income.gold} 麦${p.income.wheat} 木${p.income.wood} 鉄${p.income.iron}`;
const scoreText = (p: PlayerState) => `勝利点${p.score.vp} 都市点${p.score.cp} 工業点${p.score.ip}`;

/** 1人1行の要約（資源・収入・手札の枚数・点は公開情報） */
export function playerLine(s: GameState, i: number, viewer: number | null): string {
  const p = s.players[i];
  const me = viewer === i ? '（あなた）' : '';
  const tail = [p.passed ? 'パス済み' : '', p.supportSpace !== null ? `支援 列${p.supportSpace + 1}` : ''].filter(Boolean).join(' ');
  return `${seatName(s, i)}${me}：${resText(p)}｜${incomeText(p)}｜手札${p.hand.length} ディスク${p.discs}｜${scoreText(p)}${tail ? `｜${tail}` : ''}`;
}

export function playersBlock(s: GameState, viewer: number | null): string[] {
  return s.players.map((_, i) => playerLine(s, i, viewer));
}

/** 個人ボード・トラック・カードの詳しい状態（公開情報） */
export function playerDetail(s: GameState, i: number): string[] {
  const p = s.players[i];
  if (!p.character) return [`${seatName(s, i)}：キャラクター未選択`];
  const buff = isBuffed(s.config, p.character);
  const def = CHARACTERS[p.character];
  const out: string[] = [];
  out.push(`== ${seatName(s, i)} 個人ボード ${def.board}・地図 ${p.mapId ?? '未選択'}`);
  out.push(`資源 ${resText(p)}｜${incomeText(p)}｜手元のディスク${p.discs}｜手札${p.hand.length}`);
  const nCities = cities(p, buff).length;
  out.push(`得点 ${scoreText(p)}｜都市${nCities} 接続している港${connectedPorts(p)}/4 ワンダー${p.wonders}${p.woodDiscount ? `｜建物駒の木材-${p.woodDiscount}` : ''}`);
  // 建物駒（キャラボードの段）
  const grid = (['tent', 'house', 'bldg'] as const).map((b) => {
    const n = p.taken[b];
    if (n >= 5) return `${BUILDING_LABEL[b]}5/5`;
    const bonus = n === 4 ? '終了時の得点' : describe(gridBonus(def.board, b, n));
    return `${BUILDING_LABEL[b]}${n}/5（次 ${costText(pieceCostAt(s, p, b, n))}→${bonus}）`;
  });
  out.push(`建物駒 ${grid.join(' ')}`);
  const lab = p.taken.lab >= 4 ? '研究所駒4/4' : `研究所駒${p.taken.lab}/4（次 ${costText(pieceCostAt(s, p, 'lab', p.taken.lab))}）`;
  const shops = (['agr', 'for', 'min'] as Row[]).map((r) => `${ROW_LABEL[r]}${p.shopsTaken.includes(r) ? '済' : '未'}`).join('・');
  const clock = p.clockPlaced ? '置いた' : clockReady(s, p) ? '条件を満たした（フリーアクションで置ける）' : '条件を満たしていない';
  out.push(`${lab}｜ショップ駒 ${shops}（${costText(pieceCostAt(s, p, 'shop:agr', 0))}）｜時計塔駒 ${clock}`);
  // トラック
  const nextFood = Object.keys(FOOD_BONUS).map(Number).find((k) => k > p.food);
  const foodNext = nextFood !== undefined ? `、次のボーナス ${nextFood}:${describe(FOOD_BONUS[nextFood])}` : '';
  const rabbit = p.rabbitsTaken >= 9 ? 'ラビット駒9/9' : `ラビット駒${p.rabbitsTaken}/9（次は食料${RABBIT_POS(p.rabbitsTaken)}以上で置ける）`;
  out.push(`食料 ${p.food}/${FOOD_END}${foodNext}｜${rabbit}`);
  const blocked = (pos: number | null) => {
    if (pos === null) return '';
    const k = LAB_GAPS.indexOf(pos);
    return k >= 0 && p.taken.lab <= k ? '（研究所駒で止まっている）' : '';
  };
  out.push(`工業 馬車駒${p.carriage}/${INDUSTRY_END}${blocked(p.carriage)} 機関車駒${p.loco === null ? 'なし' : `${p.loco}/${INDUSTRY_END}${blocked(p.loco)}`}｜通過した工業点アイコン ${passedIp(p)}`);
  out.push(`繁栄 ${PROS_TRACKS.map((t, k) => `${t.label}(${t.color})${p.pros[k]}/${t.length}`).join(' ')}`);
  if (p.skills.length)
    out.push(`スキル ${p.skills.map((k) => `${k.adv ? '上級' : ''}${k.id}「${skillDef(k.id, k.adv, !!s.config.variants.charBuff).label}」${k.flipped ? '（フリップ済み）' : ''}`).join(' ')}`);
  out.push(
    `産業列（上限）${(['agr', 'for', 'min'] as Row[]).map((r) => `${ROW_LABEL[r]} ${p.automated[r].length}/${rowCapacity(p, r, buff)}`).join(' ')}`,
  );
  for (const r of ['agr', 'for', 'min'] as Row[])
    for (const id of p.automated[r]) out.push(`  ${ROW_LABEL[r]}列 ${id} ${CARDS[id].nameJa}：${CARDS[id].autoText ?? ''}（産業ボーナスのたびに得る）`);
  if (p.played.length) out.push(`手元のカード ${p.played.map((id) => `${id} ${CARDS[id].nameJa}${CARDS[id].type === 'pass' ? '（パス時）' : ''}`).join('、')}`);
  const tags = tagCounts(p, buff);
  out.push(`タグ ${TAGS.map((t) => `${t}${tags[t]}`).join(' ')}`);
  return out;
}

// ---- 地図 ----

const ICON_CODE: Record<string, string> = { rab: 'ra', skill: 'sk', terr: 'tl', road: 'rd', pros: 'pr', ind: 'in', ib: 'ib', g5: 'g5', cp2: 'c2', ip2: 'i2' };
const BLD_CODE: Record<string, string> = { tent: 'Te', house: 'Ho', bldg: 'Bl', lab: 'La', shop: 'Sh', clock: 'Ck' };

export function mapLegend(): string {
  const icons = Object.entries(ICON_CODE)
    .map(([k, c]) => `${c}=${describe(MAP_ICON[k]('W')).replace('農業の', '地形の列の')}`)
    .join(' ');
  return `記号：1文字目 地形 W麦畑 F森林 M鉱山 S海 X特殊地形 C首都／2文字目 .タイルなし o表向き #裏返し済み／駒 Te Ho Bl La Sh Ck（テント・家・ビル・研究所・ショップ・時計塔）、末尾 r=クッキーラビット駒／小文字2字は未取得のアイコン：${icons}`;
}

/** 地図の盤面図（ヘクスの座標は「行,列」。同じ行の隣は列±2、上下の行の隣は列±1） */
export function mapLines(s: GameState, i: number, withLegend = true): string[] {
  const p = s.players[i];
  if (!p.mapId) return [`${seatName(s, i)}：地図ボード未選択`];
  return mapBody(s, p, `== ${seatName(s, i)} の地図（${p.mapId === 'A' ? `A面・${p.mapBoard}のボード` : `${p.mapId}面`}）`, withLegend);
}

/** 地図の面の盤面図だけ（準備で面を選ぶときの ref --only maps） */
export function mapFaceLines(s: GameState, p: PlayerState, face: string): string[] {
  return mapBody(s, p, `== 地図 ${face === 'A' ? 'A面（5枚とも同じ）' : `${face}面`}`, false).filter((l) => !l.startsWith('道駒') && !l.startsWith('都市'));
}

function mapBody(s: GameState, p: PlayerState, title: string, withLegend: boolean): string[] {
  const keys = Object.keys(p.hexes).map(parseHexKey);
  const maxR = Math.max(...keys.map(([r]) => r));
  const maxC = Math.max(...keys.map(([, c]) => c));
  const W = 3;
  const out: string[] = [title];
  if (withLegend) out.push(mapLegend());
  // 列番号は全列を出す（奇数行のヘクスは奇数列にあり、その列番号の真下に並ぶ）
  let head = 'r\\c';
  for (let c = 0; c <= maxC; c++) head = head.padEnd(4 + c * W) + `${c}`;
  out.push(head);
  for (let r = 0; r <= maxR; r++) {
    const cells: string[] = Array(4 + (maxC + 2) * W).fill(' ');
    const label = `${r}`.padEnd(4);
    for (let k = 0; k < 4; k++) cells[k] = label[k];
    for (let c = 0; c <= maxC; c++) {
      const h = p.hexes[`${r},${c}`];
      if (!h) continue;
      const t = h.terrain;
      const st = t === 'C' ? '=' : !h.tile ? '.' : h.tile.flipped ? '#' : 'o';
      let x = '';
      if (h.building) x = BLD_CODE[h.building] + (h.rabbit ? 'r' : '');
      else if (h.icon && !h.iconTaken) x = ICON_CODE[h.icon] ?? '??';
      const cell = `${t}${st}${x}`;
      for (let k = 0; k < cell.length; k++) cells[4 + c * W + k] = cell[k];
    }
    out.push(cells.join('').trimEnd());
  }
  const icons = Object.entries(p.hexes)
    .filter(([, h]) => h.icon && !h.iconTaken)
    .map(([k, h]) => `${k}=${ICON_CODE[h.icon!]}`);
  out.push(`未取得のアイコンのヘクス：${icons.join(' ') || 'なし'}`);
  // 港・追加ドローエリア・道駒・都市
  const v = MAPS[p.mapId!].virtual;
  const ports = portStatus(p);
  let pi = 0;
  let di = 0;
  const vl: string[] = [];
  for (const [name, d] of Object.entries(v)) {
    const adj = d.adjacentHexes.map((x) => x.replace(/^r(\d+)c(\d+)$/, '$1,$2')).join('・');
    if (name.startsWith('港')) vl.push(`${name}${ports[pi++] ? '接続' : '未接続'}（隣 ${adj}）`);
    else vl.push(`${name}${p.drawAreas[di] ? '有効' : drawAreaReady(p, di) ? '条件達成' : '未'}（隣 ${adj}）`), di++;
  }
  out.push(vl.join('／'));
  const roads = p.roads.map((e) => {
    const info = edgeInfo(p, e);
    return info ? `${info.hex}:${info.dir}` : e;
  });
  out.push(`道駒${roads.length}：${roads.join(' ') || 'なし'}（向き ${Object.entries(EDGE_DIR_LABEL).map(([k, v2]) => `${k}=${v2}`).join(' ')}）`);
  const cs = cities(p, isBuffed(s.config, p.character));
  out.push(`都市${cs.length}：${cs.map((c) => `[${c.join(' ')}]`).join(' ') || 'なし'}`);
  return out;
}

// ---- 手札 ----

export function cardLine(s: GameState, p: PlayerState | null, id: string, withText: boolean): string {
  const c = CARDS[id];
  const cost = p ? cardCost(s, p, id) : c.cost;
  const tags = Object.entries(c.tags).map(([t, n]) => `${t}${n}`).join('・');
  const ind = c.industry ? (c.industry === 'all' ? 'オールマイティ' : ROW_LABEL[c.industry]) : '産業なし';
  const head = `${id} ${c.nameJa}：${cost}ゴールド${p && cost !== c.cost ? `（元${c.cost}）` : ''} ${c.type === 'pass' ? 'パス時' : '即時'} ${ind}${tags ? ` タグ ${tags}` : ''}`;
  if (!withText) return head;
  const main = c.mainText.startsWith('パス時') ? c.mainText : `${c.type === 'pass' ? 'パス時' : '即時'}：${c.mainText}`;
  return `${head}\n    ${main}${c.autoText ? `\n    オートメーション：${c.autoText}` : ''}`;
}

export function handLines(s: GameState, seat: number, withText: boolean): string[] {
  const p = s.players[seat];
  return [`== 手札（P${seat}、${p.hand.length}枚）`, ...p.hand.map((id) => cardLine(s, p, id, withText))];
}

// ---- 場 ----

export function areasLine(s: GameState): string {
  const parts: string[] = [];
  for (const [id, a] of Object.entries(s.areas)) {
    const used = a.slots.filter((x) => x !== null) as number[];
    if (used.length) parts.push(`${id}[${used.map((x) => `P${x}`).join(',')}]`);
  }
  return `置かれたスペース：${parts.join(' ') || 'なし'}`;
}

export function areasBlock(s: GameState): string[] {
  const out = ['== アクションエリア（ID・コストと効果・スペース）'];
  for (const [id, a] of Object.entries(s.areas)) {
    const def = AREAS[id];
    const hidden = def.group === 'advanced' && !s.revealed.includes(id);
    const slots = a.slots.map((x) => (x === null ? '—' : `P${x}`)).join(' ');
    out.push(`${id} ${def.label}${hidden ? '（未公開）' : ''} [${slots}]`);
  }
  return out;
}

export function supportLabel(s: GameState, col: number): string {
  return s.supportTiles[col]
    .filter((x): x is number => x !== null)
    .map((id) => (id > 100 ? `パス時：${SUPPORT_PASS[id - 101].label}` : SUPPORT_NORMAL[id - 1].label))
    .join(' ／ ');
}

export function sharedBlock(s: GameState): string[] {
  const out = ['== 共有の場'];
  out.push(
    `マイルストーン（10勝利点、合わせて3つ獲得で締め切り${s.milestonesClosed ? '：締め切り済み' : ''}）：` +
      s.milestones.map((m) => `${m.id}${m.side}「${MILESTONE_LABEL[`${m.id}${m.side}`]}」${m.takenBy === null ? '' : `→P${m.takenBy}`}`).join(' '),
  );
  out.push(`最終得点計算タイル（1位15・2位7、中立の値も順位に入る）：${s.finalTiles.map((id) => { const f = FINAL_TILES.find((x) => x.id === id)!; return `${f.label}（中立${f.neutral}）`; }).join('／')}`);
  out.push(`ラウンド支援：${s.supportCols.map((c) => `列${c + 1}「${supportLabel(s, c)}」${s.supportMarkers[c] !== null ? `←P${s.supportMarkers[c]}` : ''}`).join(' ')}`);
  out.push(`スキルタイルの残り：${s.skillPiles.map((n, k) => `${k + 1}:${n}`).join(' ')}${s.advSkills.length ? `｜上級 ${s.advSkills.join(',')}` : ''}`);
  out.push(`特殊地形タイルの残り：${s.specialSupply.map((x) => `${x}「${SPECIAL_TILES[x].label}」`).join(' ') || 'なし'}｜公開済みの応用エリア ${s.revealed.join(',')}`);
  return out;
}

// ---- 選択肢 ----

/** 選択肢の欄。アクションディスクを使う版（…:disc）は、手札で払う版があれば同じ行に添えて番号を省く */
export function optionLines(s: GameState, seat: number): string[] {
  const opts = seatOptions(s, seat);
  if (opts.length === 0) return [];
  const pd = s.pending!;
  const out = [`== 選択（P${seat}）：${pd.prompt}`];
  const ids = new Set(opts.map((o) => o.id));
  // 地形タイルの置き場所が多いときは、ボーナスも裏返しもない置き場所を地形ごとに1行へ畳む（ID で選ぶ）
  const plain = /^地形タイルをヘクス (\S+)（(麦畑|森林|鉱山|海)）に置く$/;
  const folded = new Map<string, string[]>();
  if ((pd.step === 'terrain' || pd.step === 'mix') && opts.length > 12)
    for (const o of opts) {
      const m = plain.exec(o.label);
      if (m) folded.set(m[2], [...(folded.get(m[2]) ?? []), o.id]);
    }
  const foldedIds = new Set([...folded.values()].flat());
  for (const [t, list] of folded) out.push(`    ${t}（ボーナスなし）に地形タイルを置く：${list.join(' ')}`);
  opts.forEach((o, k) => {
    if (foldedIds.has(o.id)) return;
    if (o.id.endsWith(':disc') && ids.has(o.id.slice(0, -5))) return;
    const disc = ids.has(`${o.id}:disc`) ? ` ［${o.id}:disc でディスク使用］` : '';
    out.push(`${String(k + 1).padStart(3)} ${shownId(s, seat, o)}  ${o.label}${disc}`);
  });
  out.push(...unavailableLines(s, seat, opts));
  return out;
}

/** 行動を選ぶ場面で、選べないアクションエリアと手札の理由（explain.ts の文。判定ではない） */
function unavailableLines(s: GameState, seat: number, opts: Option[]): string[] {
  const pd = s.pending!;
  if (pd.step !== 'turn' || s.turnMainDone) return [];
  const usable = new Set(opts.map((o) => (o.id.startsWith('area:') ? o.id.split(':')[1] : o.id.startsWith('play:') ? o.id.slice(5) : '')));
  const byReason = new Map<string, string[]>();
  const add = (why: string, what: string) => byReason.set(why, [...(byReason.get(why) ?? []), what]);
  for (const id of Object.keys(s.areas)) {
    const def = AREAS[id];
    if (usable.has(id) || (def.group === 'advanced' && !s.revealed.includes(id))) continue;
    add(explain(s, seat, { k: 'area', area: id }), id);
  }
  for (const c of s.players[seat].hand) if (!usable.has(c)) add(explain(s, seat, { k: 'handCard', card: c }), c);
  if (byReason.size === 0) return [];
  return [`選べないもの：${[...byReason].map(([why, w]) => `${w.join(',')}（${why}）`).join('／')}`];
}

// ---- 出来事と手番の要約 ----

const HIDDEN_STEPS = new Set(['search', 'draftPick', 'keep']);

/** 他の席に見せる1手の文。山札・手札の中身に触れる段は伏せる */
export function stepText(st: StepInfo, viewer: number | null): string {
  if (viewer !== st.player && HIDDEN_STEPS.has(st.step)) return st.step === 'keep' ? '手札を1枚残した' : 'カードを1枚手札に加えた';
  if (st.id.startsWith('edge:')) return st.label;
  return st.label;
}

/** 手番ごとの1行（同じ席の手が続くまとまり。手番を終える・席が替わる・ラウンドが替わるで区切る） */
export function turnLines(s: GameState, steps: StepInfo[], viewer: number | null, opts: { others?: boolean; max?: number } = {}): string[] {
  const out: string[] = [];
  let cur: StepInfo[] = [];
  let round = steps[0]?.round ?? 0;
  const flush = () => {
    if (!cur.length) return;
    const who = cur[0].player;
    if (!(opts.others && who === viewer)) {
      let parts = cur.map((x) => stepText(x, viewer));
      if (parts.length > 12) parts = [...parts.slice(0, 5), `…（${parts.length - 9}手）…`, ...parts.slice(-4)];
      out.push(`${seatName(s, who)}：${parts.join(' → ')}`);
    }
    cur = [];
  };
  for (const st of steps) {
    if (st.round !== round) {
      flush();
      out.push(`== 第${st.round}ラウンド`);
      round = st.round;
    }
    if (cur.length && cur[cur.length - 1].player !== st.player) flush();
    cur.push(st);
    if (st.id === 'endTurn') flush();
  }
  flush();
  if (opts.max && out.length > opts.max) return [`（前の${out.length - opts.max}行は省略）`, ...out.slice(-opts.max)];
  return out;
}

/** 自分の席に起きた出来事の短い文（増減・置いた駒・獲得したもの） */
export function ownEventText(s: GameState, seat: number, events: GameEvent[]): string {
  const parts: string[] = [];
  const res: Record<string, number> = {};
  for (const e of events) {
    if (!('p' in e) || e.p !== seat) continue;
    switch (e.t) {
      case 'delta': {
        const add = (k: string, v: number | undefined) => v && (res[k] = (res[k] ?? 0) + v);
        add('G', e.res.gold);
        add('麦', e.res.wheat);
        add('木', e.res.wood);
        add('鉄', e.res.iron);
        add('ダイヤ', e.diamond);
        add('収入G', e.income.gold);
        add('収入麦', e.income.wheat);
        add('収入木', e.income.wood);
        add('収入鉄', e.income.iron);
        add('勝利点', e.score.vp);
        add('都市点', e.score.cp);
        add('工業点', e.score.ip);
        add('ディスク', e.discs);
        break;
      }
      case 'card':
        if (e.card && (e.reason === 'draw' || e.reason === 'search' || e.reason === 'draft')) parts.push(`${CARDS[e.card].nameJa}（${e.card}）を手札に加えた`);
        else if (e.card && e.reason === 'automate') parts.push(`${CARDS[e.card].nameJa}を${ROW_LABEL[e.row!]}列にオートメーション化`);
        break;
      case 'flip':
        parts.push(`${e.hex}が裏返った`);
        break;
      case 'drawArea':
        parts.push(`追加ドローエリア${e.index + 1}が有効になった`);
        break;
      case 'ib':
        parts.push(`${ROW_LABEL[e.row]}の産業ボーナス`);
        break;
      case 'wonder':
        parts.push('ワンダー');
        break;
      case 'locomotive':
        parts.push('機関車駒');
        break;
      case 'pros':
        if (e.firstToEnd) parts.push(`繁栄「${PROS_TRACKS[e.track].label}」の右端に最初に到達`);
        break;
      case 'milestone':
        parts.push('マイルストーン獲得');
        break;
    }
  }
  const d = Object.entries(res)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`);
  return [...d, ...parts].join('、');
}

// ---- 得点 ----

export function scoreLines(s: GameState): string[] {
  const rows = finalScores(s);
  const out = [s.finished ? '== 最終得点' : '== いま終わったときの計算（この先のパス時の得点・収入は含まない。scoring.ts の finalScores）'];
  rows[0].items.forEach((it, k) => {
    const vals = rows.map((r) => r.items[k].vp);
    if (vals.every((v) => v === 0)) return;
    out.push(`${it.label}：${rows.map((r, j) => `P${r.seat} ${vals[j]}`).join('｜')}`);
  });
  out.push(`合計：${rows.map((r) => `P${r.seat} ${r.total}`).join('｜')}（0点の項目は省略）`);
  out.push(`順位 ${rows.map((r) => `${seatName(s, r.seat)} ${r.rank}位`).join('、')}（同点はラビット駒の数）`);
  for (const id of s.finalTiles) {
    const f = FINAL_TILES.find((x) => x.id === id)!;
    out.push(`最終得点計算の値「${f.label}」：${s.players.map((p) => `P${p.seat} ${finalMetric(p, id)}`).join('｜')}｜中立 ${f.neutral}`);
  }
  return out;
}

// ---- まとめ ----

/** 番が来た席に見せる短い形：進行・自分の1行・置かれたスペース・選択肢 */
export function turnView(s: GameState, seat: number): string[] {
  const out = [statusLine(s), playerLine(s, seat, seat), areasLine(s)];
  if (s.pending?.step === 'turn' || s.phase === 'setup') out.push(`手札：${s.players[seat].hand.map((id) => `${id} ${CARDS[id].nameJa}(${cardCost(s, s.players[seat], id)}G)`).join('、') || 'なし'}`);
  out.push(...optionLines(s, seat));
  return out;
}

export const SHOW_SECTIONS = ['status', 'players', 'areas', 'shared', 'self', 'map', 'hand', 'options'] as const;
export type ShowSection = (typeof SHOW_SECTIONS)[number];

export function showLines(s: GameState, seat: number | null, sections: readonly ShowSection[]): string[] {
  const out: string[] = [];
  for (const sec of sections) {
    switch (sec) {
      case 'status':
        out.push(statusLine(s));
        break;
      case 'players':
        out.push(...playersBlock(s, seat));
        break;
      case 'areas':
        out.push(...areasBlock(s));
        break;
      case 'shared':
        out.push(...sharedBlock(s));
        break;
      case 'self':
        if (seat !== null) out.push(...playerDetail(s, seat));
        break;
      case 'map':
        if (seat !== null) out.push(...mapLines(s, seat));
        break;
      case 'hand':
        if (seat !== null) out.push(...handLines(s, seat, true));
        break;
      case 'options':
        if (seat !== null && isWaitingFor(s, seat)) out.push(...optionLines(s, seat));
        else if (!s.finished) out.push(`選択待ち：${waitingSeats(s).map((x) => `P${x}`).join('・')}`);
        break;
    }
  }
  return out;
}

