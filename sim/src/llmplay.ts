// 調査用：Claude（LLM）が1人プレイを打つための駆動スクリプト。
// 記録ファイル（初期シードと手の列。人の基準プレイと同じ形式）を読み、与えられた手を順に適用し、
// 置き場所など「委任した選択待ち」と選択肢が1つしかない選択待ちは v1 の手順（AI の乱数で決定化した仮の局面上）で自動で進め、
// LLM が決めるべき選択待ちで止めて局面の要約と合法手を出す。
// 使い方：
//   node dist/llmplay.cjs <記録.json> --seed N            新しい記録を作る（キャラクター：エリ・マカロン、地図：A面）
//   node dist/llmplay.cjs <記録.json> <手の id> [<手の id> ...]   手を適用して、次の判断の局面を出す
//   node dist/llmplay.cjs <記録.json>                      現在の局面を出す
//   --weights <重みファイル>（既定：reports/pilot/weights/v1_eri_B.json）
//   --delegate <選択待ちの名前をコンマ区切り>（既定：terrain,road,bldSpot,rabbit,mix,clockPlace,orderEffects）
import fs from 'node:fs';
import { createGame, getOptions } from '../../src/game/engine';
import { CARDS } from '../../src/game/cards';
import { CHARACTERS } from '../../src/game/characters';
import { AREAS, PROS_TRACKS, PORT_VP, SKILLS, SUPPORT_NORMAL, SUPPORT_PASS } from '../../src/game/boards';
import { buildingCount, cities, connectedPorts, terrainCount } from '../../src/game/queries';
import { prosVp } from '../../src/game/scoring';
import type { GameState, PlayerState } from '../../src/game/types';
import { Agent, DEFAULT_AGENT } from './ai';
import { Rng, breakdown, determinize, legal, scoreTotal, step } from './core';
import { clockProgress, passesLeft, portDistances } from './evaluate';

interface Rec {
  config: { players: number; names: string[]; variants: Record<string, boolean> };
  seed: number;
  moves: string[];
  note?: string;
}

const args = process.argv.slice(2);
const file = args[0];
const opt: Record<string, string> = {};
const moves: string[] = [];
for (let i = 1; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else moves.push(args[i]);
}
const DELEGATE = new Set((opt.delegate ?? 'terrain,road,bldSpot,rabbit,mix,clockPlace,orderEffects').split(','));

let rec: Rec;
if (fs.existsSync(file)) rec = JSON.parse(fs.readFileSync(file, 'utf8'));
else {
  if (!opt.seed) throw new Error('新しい記録には --seed が要る');
  rec = {
    config: { players: 1, names: [opt.name ?? 'クロエ'], variants: { turnOrder: false, draft: false, advSkills: false, freeChar: false, setupDraft: false } },
    seed: Number(opt.seed),
    moves: [],
    note: 'Claude（LLM）の1人プレイ。主行動・カード・裏返しの選択・支払いは LLM が決め、置き場所は v1 の手順に委任した',
  };
}

const wf = JSON.parse(fs.readFileSync(opt.weights ?? 'reports/pilot/weights/v1_eri_B.json', 'utf8'));
const agent = new Agent({ ...DEFAULT_AGENT, kind: 'v1', weights: wf.weights ?? wf }, rec.seed * 7919 + 17);
const rng = new Rng(rec.seed * 104729 + 1);

let s = createGame(rec.config as never, rec.seed);
for (const id of rec.moves) s = step(s, id);

/** 自動で進められる選択待ちを進める。LLM の判断が要る局面か終局で止まる */
function autoAdvance(st: GameState): GameState {
  for (let n = 0; n < 400; n++) {
    if (st.finished || !st.pending) return st;
    const pd = st.pending;
    const opts = legal(st);
    let id: string | null = null;
    if (pd.step === 'setupChar') id = 'char:エリ・マカロン';
    else if (pd.step === 'setupMap') id = opts.find((o) => o.id.startsWith('map:A@'))!.id;
    else if (opts.length === 1) id = opts[0].id;
    else if (DELEGATE.has(pd.step)) id = (agent as unknown as { chooseSub: (x: GameState, d: boolean) => string }).chooseSub(determinize(st, rng), pd.step === 'support' || pd.step === 'passMove');
    if (id === null) return st;
    rec.moves.push(id);
    st = step(st, id);
  }
  throw new Error('自動の進行が終わらない');
}

s = autoAdvance(s);
const notes: string[] = [];
for (const id of moves) {
  if (s.finished) {
    notes.push(`終局しているため ${id} は適用していない`);
    break;
  }
  if (!legal(s).some((o) => o.id === id)) {
    notes.push(`合法手でない：${id}（適用せず、ここで止めた）`);
    break;
  }
  rec.moves.push(id);
  s = step(s, id);
  const ev = s.events.map((e) => JSON.stringify(e)).join(' ');
  if (ev) notes.push(`${id} → ${ev.slice(0, 300)}`);
  s = autoAdvance(s);
}
fs.writeFileSync(file, JSON.stringify(rec));

// ---- 局面の要約 ----
const p: PlayerState = s.players[0];
const out: string[] = [];
const R = (r: Record<string, number>) => `G${r.gold} 麦${r.wheat} 木${r.wood} 鉄${r.iron}`;
out.push(`== 記録 ${file}（シード ${rec.seed}、手数 ${rec.moves.length}）`);
for (const n of notes) out.push(`  * ${n}`);
if (s.finished) {
  const b = breakdown(s);
  out.push(`終局。最終得点 ${b.total}（マイルストーン・最終得点計算タイルを除く）`, JSON.stringify(b));
  console.log(out.join('\n'));
  process.exit(0);
}
out.push(`-- 第${s.round}ラウンド／${s.phase}（残りの収入フェイズ ${Math.max(0, 5 - s.round)}、残りのパス ${passesLeft(s)}）  今終わった場合の得点 ${scoreTotal(s)}`);
out.push(`資源 ${R(p.res)} ダイヤ${p.diamond}  収入 ${R(p.income)}  手札${p.hand.length}枚 ディスク${p.discs}  食料${p.food}/12 工業 貨車${p.carriage}${p.loco !== null ? `/機関車${p.loco}` : ''} 工業点${p.score.ip} 都市点${p.score.cp} ゲーム中VP${p.score.vp}`);
const prosLine = PROS_TRACKS.map((t, i) => `${t.label}:${p.pros[i]}/${t.length}(今${prosVp(p, i)}点)`).join(' ');
out.push(`繁栄 ${prosLine}`);
const tiles = terrainCount(p, 'any');
const unflipped = Object.values(p.hexes).filter((h) => h.tile && !h.tile.flipped).length;
const rabbits = Object.values(p.hexes).filter((h) => h.rabbit).length;
out.push(`地図 タイル${tiles}枚（表向き=未反転${unflipped}） 道駒${p.roads.length} 建物駒${buildingCount(p)}（テント${p.taken.tent} 家${p.taken.house} ビル${p.taken.bldg}） 都市${cities(p).length} ラビット${rabbits} 港 接続${connectedPorts(p)}/4（港の得点${PORT_VP[connectedPorts(p)]}、残り距離 ${portDistances(p).join(',')}）`);
const ch = p.character ? CHARACTERS[p.character] : null;
out.push(`時計塔 ${p.clockPlaced ? '設置済み' : `条件の進み ${(clockProgress(p) * 100).toFixed(0)}%`}${ch ? `（${ch.clockText}）` : ''}  スキル ${p.skills.map((k) => `${k.id}:${SKILLS.find((d) => d.id === k.id)?.label}`).join(' / ') || 'なし'}`);
const cardLine = (id: string) => {
  const c = CARDS[id];
  return `${id} ${c.nameJa}（${c.cost}G${c.type === 'pass' ? '・パス時' : ''}）: ${c.mainText}${c.autoText ? `｜オート: ${c.autoText}` : ''}`;
};
out.push(`手札:`);
for (const id of p.hand) out.push(`  ${cardLine(id)}`);
const autoIds = Object.values(p.automated).flat();
out.push(`手元のカード ${p.played.map((id) => CARDS[id].nameJa).join('、') || 'なし'}  オートメーション ${autoIds.map((id) => CARDS[id].nameJa).join('、') || 'なし'}`);
const used = Object.entries(s.areas)
  .filter(([, a]) => a.slots.some((x) => x !== null))
  .map(([k]) => k);
out.push(`今ラウンドに使ったエリア ${used.join(',') || 'なし'}  公開中の応用エリア ${s.revealed.join(',') || 'なし'}`);
const supLabel = (id: number | null) => (id === null ? '-' : id >= 100 ? `パス時:${(SUPPORT_PASS.find((d) => d.id === id) ?? SUPPORT_PASS.find((d) => d.id === id - 100))?.label ?? id}` : SUPPORT_NORMAL.find((d) => d.id === id)?.label ?? String(id));
out.push(`ラウンド支援 ${s.supportTiles.map((col, i) => `列${i + 1}[${supLabel(col[0])} ／ ${supLabel(col[1])}]${p.supportSpace === i ? '←自分' : ''}`).join(' ')}`);
out.push(`-- 選択待ち [${s.pending!.step}] ${s.pending!.prompt}`);
for (const o of legal(s)) {
  const area = o.id.startsWith('area:') ? AREAS[o.id.split(':')[1]] : null;
  out.push(`  ${o.id} ｜ ${o.label}${area ? `` : ''}`);
}
console.log(out.join('\n'));
