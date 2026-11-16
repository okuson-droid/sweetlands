// 対局中に変わらない文言（ref コマンド）。ルールの要約・アクションエリア・キャラクター・個人ボード・トラック・タイル・
// フリーアクション・カードの文。数値と効果の文はデータ（boards.ts・characters・カードの JSON）と describe から作る。
// ルールの要約（RULES）は、エンジン（engine.ts・queries.ts・scoring.ts）の実装を読んで書いたものである。
// ルール本文の代わりではなく、食い違えば選択肢（getOptions）が正である。

import rawChars from '../../src/data/characters.json';
import {
  AREAS,
  CITY_RATE,
  FINAL_TILES,
  FOOD_BONUS,
  FOOD_END,
  INDUSTRY_TRACK,
  IP_ICONS,
  LAB_COST,
  LAB_GAPS,
  MAP_ICON,
  MILESTONE_LABEL,
  PORT_VP,
  PROS_TRACKS,
  RABBIT_BONUS,
  RABBIT_POS,
  SHOP_COST,
  SKILLS,
  SPECIAL_TILES,
  SUPPORT_NORMAL,
  SUPPORT_PASS,
  TERRAIN_FLIP,
  GRID_WOOD,
  GRID_IRON,
  gridBonus,
  printedAuto,
  skillDef,
  CHAR_BOARD,
} from '../../src/game/boards';
import { CARDS } from '../../src/game/cards';
import { basicTextOf, CHARACTERS, clockTextOf, isBuffed, startOf } from '../../src/game/characters';
import { describe } from '../../src/game/engine';
import type { GameState, Row } from '../../src/game/types';
import { PlayError } from './record';
import { cardLine, costText, mapFaceLines, mapLegend, ROW_LABEL, supportLabel } from './view';
import { mapPreview } from '../../src/game/engine';

const RULES = `== ルールの要約（エンジンの実装から。迷ったら選択肢が正）
【流れ】全5ラウンド。各ラウンド：収入 → アクション（手番を順に回す）→ 全員パスでクリーンアップ。最初にパスした人が次のラウンドのスタートプレイヤー。
【収入】ラウンド支援駒の列の収入タイルの効果、キャラクターの収入時能力、収入値の分のゴールド・麦・木材・鉄、市民カード（第1ラウンド6枚、以降5枚＋有効な追加ドローエリア1つにつき1枚）。
【手番】主行動を1つ：①アクションエリアにディスクを置く ②手札の市民カードをプレイ ③スキルタイルのフリップ能力 ④パス。前後にフリーアクションを何回でも。主行動の後は endTurn（手番を終える）。
【アクションエリア】空いている最初のスペースに置き、その順番の枚数（1・2・3枚）の手札を捨てる（手札コスト）。手元のアクションディスクを使えば手札コストなし。第1〜4ラウンドは手札が0枚になる行動は取れない。M は最初から、N・P は第2、O・Q は第3ラウンドから使える。L1（3人以上）は4ゴールド＋コピー先のコストで基本エリア A〜F の効果。1スペースのエリア（H・I・J・K・J2・K8）は1ラウンド1人。ディスクはクリーンアップで失う。
【カード】コストのゴールドを払う（ブラウニー割引のカードは自分のブラウニータグの数だけ安い）。即時カードは即時能力を解決し、続けてダイヤ1で産業列（カードの産業）にオートメーション化できる。列の上限は 1＋（その列の建物駒を2個取った）＋（4個取った）。テント=農業・家=林業・ビル=鉱業。パス時カードは手元に置き、以後パスのたびに能力を解決する。
【産業ボーナス】その列の、個人ボードに印刷されたオートメーション能力と、列のカードのオートメーション能力をすべて得る。
【パス】パス時の得点：①キャラクター（時計塔能力など）②都市点：都市の数 0〜6 で ${CITY_RATE.join('/')} ③工業点：工業マーカーが通過した工業点アイコンの合計（毎回）④ラウンド支援のパス時タイル ⑤スキルタイルのパス時 ⑥手元のパス時カード。その後ラウンド支援駒を次の列へ動かす（空いている列）。第5ラウンドのパスでは残った基礎資源がすべてゴールドになる。
【クリーンアップ】手札を1枚だけ残す（残りは捨て札）。ディスクは失い、フリップ済みのスキルは戻る。
【地形タイル】首都か置いたタイルに隣接する空きヘクスに置く（種類はヘクスの地形）。アイコンのあるヘクスはそのボーナスを得る。X（特殊地形ヘクス）には特殊地形タイルを選んで置く（効果は裏返したときに出る）。
【道駒】首都の頂点か自分の道駒に点でつながる辺に置く。道駒が接した表向きのタイルは裏返り、裏返しの効果を得る（道駒が接しているヘクスに置いたタイルはすぐ裏返る）。
  裏返しの効果：麦畑 ${describe(TERRAIN_FLIP.W)}／森林 ${describe(TERRAIN_FLIP.F)}／鉱山 ${describe(TERRAIN_FLIP.M)}／海 ${describe(TERRAIN_FLIP.S)}／特殊地形 タイルの効果
【建物駒】首都か、裏返したタイルの上（建物駒のないヘクス）に置く。置いたヘクスの裏返しの効果をもう一度得る（首都なら 任意の収入値+1 または 繁栄トラック1歩）。テント・家・ビルは個人ボードの段のボーナス、ショップ駒はその列の産業ボーナス。研究所駒は工業トラックの止め（下の tracks）を外す。
【都市】隣接してつながった建物駒の集まりで、3種類以上を含むもの。
【港】港に隣接するタイルから首都まで、タイルがつながっていれば接続。最終得点で接続数 0〜4 が ${PORT_VP.join('/')} 点。
【追加ドローエリア】隣接するヘクスにタイルがあり、エリアとの境の辺に道駒があると有効になり、すぐ1枚引き、以後の収入で1枚多く引く。
【時計塔】キャラクターの時計塔の条件をすべて満たすと、フリーアクション fa8 で建物駒と同じ場所に置ける（建物駒として数える）。以後時計塔能力が効く。
【ワンダー】1個目で時計塔の条件の1つを満たす。2個目からはスキルタイル1枚。
【マイルストーン】条件を満たしたら手番のフリーアクションで獲得、10勝利点。誰かが合わせて3つ獲得すると締め切り。
【最終得点】ゲーム中の勝利点、繁栄トラック6本、都市点×2、建物駒の段の1段目（テント5個：ラビット駒×2、家5個：都市点×1、ビル5個：工業点×1）、5ゴールドにつき1、ダイヤ1つにつき1、港、マイルストーン、最終得点計算タイル2枚（1位15・2位7。中立の値も順位に入り、中立は点を得ない）。同点はラビット駒の数。`;

const FREE = `== フリーアクション（手番中、主行動の前後に何回でも。ID）
fa1 手札1枚＋基礎資源3 → 地形タイル1枚か道駒1個（続けて basic:内訳 → card:捨てる手札 の順に選ぶ）
fa2 15ゴールド → 市民カード1枚
fa3 4ゴールドにつき任意の基礎資源1（まとめて何個でも）
fa4:<番号> マイルストーンを獲得（10勝利点）
fa5 基礎資源1につき1ゴールド（まとめて）
fa6 基礎資源3につき任意の基礎資源1（まとめて）
fa7d 手元のディスク1 → 任意の基礎資源2／fa7h 手札1枚 → 任意の基礎資源2
fa8 時計塔駒を置く
faC:… キャラクター固有（ラウンド1回。キャラクターの基本能力の文を見ること）
endTurn 主行動の後に手番を終える`;

const IDS = `== 選択肢 ID の型（番号でも選べる。番号は直前の出力の番号）
area:<エリア>[:<コピー先>][:disc]  アクションエリア（:disc は手元のディスクで手札コストを払わない）
play:<カード>  カードをプレイ／flip:s<番号>・flip:a<番号>  フリップ能力／pass／endTurn／fa…  フリーアクション
card:<カード>  手札コスト・捨てる・残す・探す／auto:<列> と auto:<カード>:<列>  オートメーション化（列 agr農業 for林業 min鉱業）
hex:<行>,<列>  地形タイル・建物駒・ラビット駒・裏返す場所／edge:<行>,<列>:<向き>  道駒（向き e右 w左 ne右上 nw左上 se右下 sw左下。同じ辺は隣のヘクスからも書ける）
piece:tent|house|bldg|lab|shop:<列>  建物駒の種類／pros:<0-5>  繁栄トラック／ind:carriage|loco  工業マーカー
basic:<麦>-<木材>-<鉄>  基礎資源の内訳／choice:<番号>  どちらか／bundle:<番号>・eff:<番号>  先に解決する効果
pay・pay:<回数>・skip・stop  支払う・回数・しない・ここで終える／col:<列>  ラウンド支援の列（0始まり。表示は列+1）
skill:<番号>  スキルタイル／res:<資源>  収入値／row:<列>  産業ボーナスの列／special:<番号>  特殊地形タイル／split:<数>  リッカの代わりの支払い`;

function clockReqText(name: string): string {
  const raw = (rawChars as { name: string; clockTowerCondition: string }[]).find((c) => c.name === name);
  return raw?.clockTowerCondition ?? '';
}

function charLines(s: GameState, names: string[]): string[] {
  const out = ['== キャラクター（基本能力／時計塔能力／時計塔の条件／開始時）'];
  for (const n of names) {
    const st = startOf(s.config, n);
    out.push(`${n}（個人ボード ${CHAR_BOARD[n]}${isBuffed(s.config, n) ? '、上方修正' : ''}）`);
    out.push(`  基本：${basicTextOf(s.config, n)}`);
    out.push(`  時計塔：${clockTextOf(s.config, n)}`);
    out.push(`  条件：${clockReqText(n)}`);
    out.push(`  開始：G${st.res.gold} 麦${st.res.wheat} 木${st.res.wood} 鉄${st.res.iron} ダイヤ${st.diamond}｜収入 G${st.income.gold} 麦${st.income.wheat} 木${st.income.wood} 鉄${st.income.iron}`);
  }
  return out;
}

/** 個人ボード（キャラボード）の段・研究所・ショップ・印刷されたオートメーション能力 */
function boardLines(s: GameState, name: string): string[] {
  const board = CHARACTERS[name].board;
  const buff = isBuffed(s.config, name);
  const out = [`== 個人ボード ${board}（${name}）。段は5段目から取る（コストは木材の割引の前）`];
  (['tent', 'house', 'bldg'] as const).forEach((b, col) => {
    const label = ['テント駒（農業）', '家駒（林業）', 'ビル駒（鉱業）'][col];
    const steps = [0, 1, 2, 3, 4].map((k) => `${5 - k}段目 木材${GRID_WOOD[k]}・鉄${GRID_IRON}→${k === 4 ? ['ラビット駒×2点', '都市点×1点', '工業点×1点'][col] + '（5個で、終了時）' : describe(gridBonus(board, b, k))}`);
    out.push(`${label}：${steps.join('／')}`);
  });
  out.push(`研究所駒：${LAB_COST.map((c, k) => `${k + 1}個目 ${costText(c)}`).join('／')}｜ショップ駒（各列1個）：${costText(SHOP_COST)}、置くとその列の産業ボーナス`);
  out.push(`印刷されたオートメーション能力：${(['agr', 'for', 'min'] as Row[]).map((r) => `${ROW_LABEL[r]} ${describe(printedAuto(board, r, buff))}`).join('／')}`);
  return out;
}

function trackLines(): string[] {
  const out = ['== トラック'];
  out.push(`食料（0〜${FOOD_END}。${FOOD_END}を越える分は1歩につき麦2）：${Object.entries(FOOD_BONUS).map(([k, e]) => `${k}:${describe(e)}`).join(' ')}`);
  out.push(`クッキーラビット駒（9個。1個目は食料${RABBIT_POS(0)}以上、以後1個ごとに1多く要る。建物駒のあるヘクスに置く。9個の後は1個につき6勝利点）：取得ボーナス ${Object.entries(RABBIT_BONUS).map(([k, e]) => `${Number(k) + 1}個目:${describe(e)}`).join(' ')}`);
  out.push(
    `工業（0〜17。馬車駒は最初から、機関車駒は馬車駒が14に着くと0から。マスの色がマーカーと合うとき（O=馬車、G=機関車）ボーナス。終点の先は1歩1勝利点）：` +
      INDUSTRY_TRACK.map((sq, k) => (sq.eff.length ? `${k}${sq.color}:${describe(sq.eff)}` : '')).filter(Boolean).join(' '),
  );
  out.push(`  研究所駒の止め：${LAB_GAPS.map((g, k) => `${g}→${g + 1} は研究所駒${k + 1}個を置くまで進めない`).join('、')}｜工業点アイコン：${IP_ICONS.map((ic) => `${ic.gap}と${ic.gap + 1}の間 ${ic.value}`).join('、')}（通過した合計をパスのたびに得る）`);
  out.push('繁栄トラック（6本。右端へはダイヤ1、最初に着いた人だけ右端のボーナス。得点は位置の区間ごとの率 × 数える対象）：');
  PROS_TRACKS.forEach((t, k) => {
    const rate = t.rates.map(([per, vp]) => `${per}つにつき${vp}`).join('／');
    const bonus = Object.entries(t.bonus).map(([pos, e]) => `${pos}:${describe(e)}`).join(' ');
    out.push(`  pros:${k} ${t.label}（${t.color}、長さ${t.length}）：区間 1〜${t.seg1End}／${t.seg1End + 1}〜${t.length - 1}／右端 で ${rate}｜${bonus ? `マス ${bonus}｜` : ''}右端 ${describe(t.endBonus)}`);
  });
  return out;
}

function tileLines(s: GameState): string[] {
  const buff = !!s.config.variants.charBuff;
  const out = ['== スキルタイル（instant=すぐ、pass=パス時、flip=手番の主行動でラウンド1回、perm=ずっと）'];
  for (const sk of SKILLS) out.push(`skill:${sk.id} ${sk.kind} ${sk.label}`);
  if (s.config.variants.advSkills) for (const id of s.advSkills) { const d = skillDef(id, true, buff); out.push(`adv:${id} ${d.kind} ${d.label}（ダイヤ1）`); }
  out.push('== ラウンド支援の列（収入タイルは収入時、このラウンド：はそのラウンド中、パス時はパスのたび）');
  for (const c of s.supportCols) out.push(`col:${c}（列${c + 1}）${supportLabel(s, c)}`);
  out.push(`== マイルストーン：${s.milestones.map((m) => `${m.id}${m.side} ${MILESTONE_LABEL[`${m.id}${m.side}`]}`).join('／')}`);
  out.push(`== 最終得点計算タイル：${s.finalTiles.map((id) => { const f = FINAL_TILES.find((x) => x.id === id)!; return `${f.label}（中立${f.neutral}）`; }).join('／')}`);
  out.push(`== 特殊地形タイル（裏返すと）：${Object.entries(SPECIAL_TILES).map(([k, t]) => `${k} ${t.label}`).join('／')}`);
  out.push(`== 地図のアイコン（タイルを置くと得る）：${Object.entries(MAP_ICON).map(([k, f]) => `${k} ${describe(f('W')).replace('農業の', '地形の列（麦畑=農業・森林=林業・鉱山=鉱業）の')}`).join('／')}`);
  out.push(`== パス時の支援タイル：${SUPPORT_PASS.map((t) => t.label).join('／')}｜収入の支援タイル：${SUPPORT_NORMAL.map((t) => t.label).join('／')}`);
  return out;
}

function areaLines(s: GameState): string[] {
  const out = ['== アクションエリア（ID コスト → 効果、スペース数。手札コストはスペースの順番の枚数）'];
  for (const id of Object.keys(s.areas)) {
    const d = AREAS[id];
    const when = ['N', 'P'].includes(id) ? '、第2ラウンドから' : ['O', 'Q'].includes(id) ? '、第3ラウンドから' : '';
    out.push(`area:${id} ${d.label}（${d.spaces}スペース${when}）`);
  }
  return out;
}

export const REF_SECTIONS = ['rules', 'ids', 'areas', 'free', 'chars', 'board', 'tracks', 'tiles', 'maps'] as const;
/** ref の既定の欄（maps は長いため、準備で地図を選ぶときだけ --only maps で引く） */
export const REF_DEFAULT: readonly RefSection[] = ['rules', 'ids', 'areas', 'free', 'chars', 'board', 'tracks', 'tiles'];
export type RefSection = (typeof REF_SECTIONS)[number];

/** ref の本文。seat があれば個人ボードはその席のキャラクター、キャラクターはこの対局で選ばれた人（未選択なら全員） */
export function refLines(s: GameState, seat: number | null, sections: readonly RefSection[]): string[] {
  const chosen = s.players.map((p) => p.character).filter((x): x is string => !!x);
  const out: string[] = [];
  for (const sec of sections) {
    if (sec === 'rules') out.push(...RULES.split('\n'));
    if (sec === 'ids') out.push(...IDS.split('\n'));
    if (sec === 'areas') out.push(...areaLines(s));
    if (sec === 'free') out.push(...FREE.split('\n'));
    if (sec === 'chars') out.push(...charLines(s, chosen.length === s.players.length ? chosen : (s.charPool ?? Object.keys(CHARACTERS))));
    if (sec === 'board') {
      const name = seat !== null ? s.players[seat].character : null;
      if (name) out.push(...boardLines(s, name));
      else for (const n of chosen) out.push(...boardLines(s, n));
    }
    if (sec === 'tracks') out.push(...trackLines());
    if (sec === 'tiles') out.push(...tileLines(s));
    if (sec === 'maps') {
      out.push('== 地図の面（A面は5枚とも同じ。B1〜B5 はボードごとに違う。港・追加ドローエリアの位置はどの面も同じ）', mapLegend());
      for (const face of ['A', 'B1', 'B2', 'B3', 'B4', 'B5']) out.push(...mapFaceLines(s, mapPreview(s, seat ?? 0, face), face));
    }
  }
  return out;
}

export function refCards(s: GameState, ids: string[]): string[] {
  return ids.map((key) => {
    // ID か、名前（一部でもよい。1枚に絞れるとき）で引く
    const id = CARDS[key] ? key : Object.keys(CARDS).filter((x) => CARDS[x].nameJa.includes(key));
    if (typeof id === 'string') return cardLine(s, null, id, true);
    if (id.length !== 1) throw new PlayError(`カードを1枚に絞れない：${key}（${id.length}枚）`);
    return cardLine(s, null, id[0], true);
  });
}
