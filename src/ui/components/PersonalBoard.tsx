// 個人ボード（ui_design §4.1）：キャラクター・資源と収入・建物駒・産業列・スキル・手元
import { ADV_SKILLS, CHAR_BOARD, GRID_IRON, GRID_WOOD, PRINTED_AUTO, SHOP_COST, SKILLS, gridBonus } from '../../game/boards';
import { CARDS } from '../../game/cards';
import { CHARACTERS } from '../../game/characters';
import { buildingCount, passedIp, playedCount, rowCapacity, tagCounts, terrainCount } from '../../game/queries';
import type { ClockReq } from '../../game/characters';
import { TAGS, type Tag } from '../../game/types';
import type { Tok } from '../icons/EffIcons';
import type { GameState, PlayerState, ResKind, Row } from '../../game/types';
import { useSource, useTarget, useZoomBind } from '../interaction';
import { CardFace, CardFull } from './Card';
import { Fold } from './Fold';
import { PIECE_LABEL } from './Icons';
import { Glyph } from '../icons/Glyph';
import { Icons, costToks, discountedCostToks, effToks } from '../icons/EffIcons';
import { pieceCostAt } from '../../game/engine';
import { CHAR_ABILITY_TOKS, skillToks } from '../icons/specs';

const ROW_NAME: Record<Row, string> = { agr: '農業', for: '林業', min: '鉱業' };
const CHAR_KEYS: Record<string, [string, string][]> = {
  'ビスキュイ・バステト': [['biscuit', '研究所のある都市1つにつき工業1歩']],
  'ロータス・チェー': [['lotus', '表向きのタイルを1枚裏返す']],
  'ソルビー・ショコラ': [
    ['solbee3', '食料3以上：麦1'],
    ['solbee5', '食料5以上：道駒1'],
    ['solbee9', '食料9以上：繁栄1歩'],
  ],
  'サクラ・モチ': [['sakura', '手札1枚 → ディスク1枚']],
};

function CharAbility({ k, label, used }: { k: string; label: string; used: boolean }) {
  const t = useTarget(`char:${k}`, { k: 'free', slot: k });
  return (
    <span className={`ability ${t.lit ? 'lit' : ''} ${used ? 'used' : ''}`} {...t.props} tabIndex={0} title={used ? `${label}（このラウンドは使用済み）` : label}>
      <Glyph g="once" size={10} />
      <Icons toks={CHAR_ABILITY_TOKS[k]} size={14} label={label} />
    </span>
  );
}

function IncomeCell({ p, r }: { p: PlayerState; r: ResKind }) {
  const t = useTarget(`income:${r}`, { k: 'other' });
  return (
    <div className={`res ${t.lit ? 'lit' : ''}`} {...t.props} title="資源（枠：収入値）">
      <Glyph g={r} size={16} />
      <b>{p.res[r]}</b>
      <span className="inc">
        <Glyph g={{ k: 'income', res: r }} size={13} />
        {p.income[r]}
      </span>
    </div>
  );
}

const TOP_BONUS: Record<'tent' | 'house' | 'bldg', Tok[]> = {
  tent: [{ g: 'endgame' }, { g: 'rabbit' }, { g: 'condEach' }, { g: 'vp', n: 2 }],
  house: [{ g: 'endgame' }, { g: 'cp' }, { g: 'condEach' }, { g: 'vp', n: 1 }],
  bldg: [{ g: 'endgame' }, { g: 'ip' }, { g: 'condEach' }, { g: 'vp', n: 1 }],
};
const TYPES = ['tent', 'house', 'bldg'] as const;

/** 建物駒置き場：実物と同じく5段×3列。段ごとのコストと、取ったときのボーナスをすべて見せる */
function BuildingGrid({ s, p }: { s: GameState; p: PlayerState }) {
  const board = p.character ? CHAR_BOARD[p.character] : null;
  return (
    <div className="bgrid" role="table" aria-label="建物駒置き場">
      {[4, 3, 2, 1, 0].map((idx) => (
        <div key={idx} className="brow" role="row">
          <BuildingRowCost s={s} p={p} idx={idx} />
          {TYPES.map((type) => (
            <BuildingCell key={type} p={p} type={type} idx={idx} bonus={idx === 4 ? TOP_BONUS[type] : board ? effToks(gridBonus(board, type, idx)) : []} />
          ))}
        </div>
      ))}
    </div>
  );
}

function BuildingRowCost({ s, p, idx }: { s: GameState; p: PlayerState; idx: number }) {
  const base = { wood: GRID_WOOD[idx], iron: GRID_IRON };
  const actual = pieceCostAt(s, p, 'tent', idx);
  const toks = discountedCostToks(base, actual);
  const z = useZoomBind(() => (
    <div>
      <b>{5 - idx}段目の建物駒のコスト</b>
      <Icons toks={toks} size={18} />
      <div className="was">
        元のコスト：
        <Icons toks={costToks(base)} size={16} />
      </div>
    </div>
  ));
  return (
    <span className="bcost" {...z.props}>
      <Icons toks={toks} size={12} />
    </span>
  );
}

function BuildingCell({ p, type, idx, bonus }: { p: PlayerState; type: 'tent' | 'house' | 'bldg'; idx: number; bonus: Tok[] }) {
  const taken = p.taken[type];
  const present = idx >= taken;
  const next = idx === taken;
  const src = useSource(`piece:${type}`, PIECE_LABEL[type], { k: 'other' });
  const plusOne = idx === 1 || idx === 3;
  const bind = next ? src.props : {};
  return (
    <span className={`bcell ${type} ${present ? '' : 'empty'} ${next && src.lit ? 'lit' : ''} ${next && src.held ? 'held' : ''}`} {...bind} tabIndex={next ? 0 : undefined} role="cell" title={`${PIECE_LABEL[type]}・${5 - idx}段目${plusOne ? '（取ると産業列の上限+1）' : ''}`}>
      <span className="bpiece">{present ? <Glyph g={{ k: 'building', type }} size={15} /> : <Glyph g="once" size={11} />}</span>
      <Icons toks={bonus} size={11} />
      {plusOne && <i className="plus1">+1</i>}
    </span>
  );
}

/** 時計塔駒の配置条件と達成状況（すべての行を満たすと置ける。行の中は「どれか1つ」） */
function clockReqView(p: PlayerState, r: ClockReq): { tok: Tok; have: number; need: number } {
  switch (r.k) {
    case 'terrain':
      return { tok: { g: { k: 'hex', kind: r.kind } }, have: terrainCount(p, r.kind), need: r.n };
    case 'bld':
      return { tok: { g: { k: 'building', type: r.type } }, have: buildingCount(p, r.type), need: r.n };
    case 'played':
      return { tok: { g: { k: 'played', row: r.row === 'any' ? undefined : r.row } }, have: r.row === 'any' ? playedCount(p) : playedCount(p, r.row), need: r.n };
    case 'food':
      return { tok: { g: 'food' }, have: p.food, need: r.n };
    case 'ipPassed':
      return { tok: { g: 'ip' }, have: passedIp(p), need: r.n };
    case 'wonder':
      return { tok: { g: 'wonder' }, have: p.wonders, need: 1 };
  }
}

function ClockConditions({ p }: { p: PlayerState }) {
  if (!p.character) return null;
  const groups = CHARACTERS[p.character].clock;
  return (
    <div className="clockreq" title="時計塔駒の配置条件（すべての枠を満たす。「/」はどちらか一方）">
      <Glyph g={{ k: 'building', type: 'clock' }} size={14} />
      {groups.map((alts, i) => {
        const views = alts.map((r) => clockReqView(p, r));
        const ok = views.some((v) => v.have >= v.need);
        return (
          <span key={i} className={`req ${ok ? 'ok' : ''}`}>
            {views.map((v, j) => (
              <span key={j} className="alt">
                {j > 0 && <span className="isep">/</span>}
                <Icons toks={[v.tok]} size={13} />
                <b>
                  {Math.min(v.have, 99)}/{v.need}
                </b>
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}

function TagSummary({ p }: { p: PlayerState }) {
  const counts = tagCounts(p);
  return (
    <div className="tagsum" title="所持しているスイーツタグ（プレイしたカード・オートメーション化したカード・キャラクターの特性）">
      {TAGS.map((t: Tag) => (
        <span key={t} className={`tagn ${counts[t] ? '' : 'zero'}`} title={`${t}タグ ${counts[t]}個`}>
          <Glyph g={{ k: 'tag', tag: t }} size={15} />
          <b>{counts[t]}</b>
        </span>
      ))}
    </div>
  );
}

function ShopPiece({ p, row }: { p: PlayerState; row: Row }) {
  const src = useSource(`piece:shop:${row}`, PIECE_LABEL[`shop:${row}`], { k: 'other' });
  const taken = p.shopsTaken.includes(row);
  return (
    <div className={`shop ${row} ${taken ? 'used' : ''} ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} tabIndex={0} title={PIECE_LABEL[`shop:${row}`]}>
      <Glyph g={{ k: 'building', type: 'shop' }} size={16} />
      <Glyph g={{ k: 'ib', row }} size={14} />
    </div>
  );
}

function ClockPiece({ p }: { p: PlayerState }) {
  const src = useSource('piece:clock', '時計塔駒', { k: 'free', slot: 'fa8' });
  return (
    <div className={`clockpiece ${p.clockPlaced ? 'used' : ''} ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} tabIndex={0} title={p.clockPlaced ? '時計塔駒（設置済み）' : '時計塔駒'}>
      <Glyph g={{ k: 'building', type: 'clock' }} size={20} />
    </div>
  );
}

function RowDrop({ s, p, row }: { s: GameState; p: PlayerState; row: Row }) {
  const t = useTarget(`row:${row}`, { k: 'other' });
  const printed = p.character ? PRINTED_AUTO[CHAR_BOARD[p.character]][row] : [];
  const z = useZoomBind(() => (
    <div>
      <b>{ROW_NAME[row]}の産業列</b>
      {p.automated[row].map((id) => (
        <div key={id}>{CARDS[id].nameJa}：{CARDS[id].autoText}</div>
      ))}
    </div>
  ));
  return (
    <div className={`rowdrop ${row} ${t.lit ? 'lit' : ''}`} {...t.props} {...z.props} tabIndex={0} title={`${ROW_NAME[row]}の産業列`}>
      <Glyph g={{ k: 'ib', row }} size={16} />
      {printed.length > 0 && <Icons toks={effToks(printed)} size={13} />}
      {p.automated[row].map((id) => (
        <span key={id} className="autocard" title={`${CARDS[id].nameJa}：${CARDS[id].autoText ?? ''}`}>
          <Icons toks={effToks(CARDS[id].auto ?? [])} size={12} />
        </span>
      ))}
      <span className="cap">
        {p.automated[row].length}/{rowCapacity(p, row)}
      </span>
    </div>
  );
}

function OwnSkill({ id, adv, flipped }: { id: number; adv: boolean; flipped: boolean }) {
  const def = adv ? ADV_SKILLS[id - 1] : SKILLS[id - 1];
  const t = useTarget(`skill:${adv ? 'a' : 's'}${id}`, { k: 'skill', id, adv });
  return (
    <span className={`ownskill ${def.kind} ${flipped ? 'flipped' : ''} ${t.lit ? 'lit' : ''}`} {...t.props} tabIndex={0} title={def.label}>
      <Icons toks={skillToks(id, adv)} size={13} label={def.label} />
    </span>
  );
}

function TableauCard({ id }: { id: string }) {
  const src = useSource(`tableau:${id}`, CARDS[id].nameJa, { k: 'other' });
  const z = useZoomBind(() => <CardFull id={id} />);
  return (
    <span className={`tabcard ${CARDS[id].type} ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} {...z.props} tabIndex={0} title={CARDS[id].nameJa}>
      {CARDS[id].type === 'pass' && <Glyph g="pass" size={11} />}
      <Icons toks={effToks(CARDS[id].main)} size={11} />
      <span className="tags">
        {Object.entries(CARDS[id].tags).flatMap(([t, n]) => Array.from({ length: n ?? 0 }, (_, i) => <Glyph key={`${t}${i}`} g={{ k: 'tag', tag: t as Tag }} size={10} />))}
      </span>
    </span>
  );
}

/** 手元のカード1枚（展開表示用）。オートメーション化のときは持ち上げて産業の列へ動かす */
function TableauFaceCard({ id }: { id: string }) {
  const src = useSource(`tableau:${id}`, CARDS[id].nameJa, { k: 'other' });
  const z = useZoomBind(() => <CardFull id={id} />);
  return (
    <div className={`card ${CARDS[id].type === 'pass' ? 'pass' : ''} ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} {...z.props} tabIndex={0} aria-label={CARDS[id].nameJa}>
      <CardFace id={id} />
    </div>
  );
}

/** 手元（プレイしたカード）を表面つきで並べる（展開表示用）。カードをプレイするときの置き先でもある */
export function TableauCards({ p }: { p: PlayerState }) {
  const tableau = useTarget('tableau', { k: 'other' });
  return (
    <div className={`tableau full ${tableau.lit ? 'lit' : ''}`} {...tableau.props}>
      {p.played.map((id) => (
        <TableauFaceCard key={id} id={id} />
      ))}
      {p.played.length === 0 && <span className="empty">まだありません</span>}
    </div>
  );
}

/** 横長レイアウト：キャラボードの下の「プレイしたカード」の帯（ui_design §21）。
 *  カードを持ち上げているあいだは帯そのものが置き先になり、置くとプレイする。それ以外のときはクリックで一覧を開く。
 *  プレイしたカードをオートメーション化する場面（tableau:ID を動かす）では、一覧を自動で開く */
export function TableauBar({ p, openForce }: { p: PlayerState; openForce: boolean }) {
  const target = useTarget('tableau', { k: 'other' });
  if (target.lit)
    return (
      <div className="tableau-bar drop lit" {...target.props}>
        <Glyph g={{ k: 'played' }} size={16} />
        ここに置いてプレイ
        <span className="fold-sum">（プレイしたカード {p.played.length}枚）</span>
      </div>
    );
  return (
    <div className="tableau-bar">
      <Fold name="tableau" label={<>
          <Glyph g={{ k: 'played' }} size={16} /> プレイしたカード
        </>} summary={`${p.played.length}枚`} force={openForce} wide={430} side="up" align="right">
        <h3>{p.name}さんがプレイしたカード</h3>
        <TableauCards p={p} />
      </Fold>
    </div>
  );
}

export function PersonalBoard({ s, p, withTableau = true }: { s: GameState; p: PlayerState; withTableau?: boolean }) {
  const ch = p.character ? CHARACTERS[p.character] : null;
  const skillsDrop = useTarget('skills', { k: 'other' });
  const tableau = useTarget('tableau', { k: 'other' });
  const charZoom = useZoomBind(() =>
    ch ? (
      <div>
        <b>{ch.name}</b>
        <div className="sec">基本能力：{ch.basicText}</div>
        <div className="sec">時計塔能力：{ch.clockText}</div>
      </div>
    ) : null,
  );
  return (
    <div className="personal">
      <div className="charline" {...charZoom.props}>
        <b>{p.character ?? 'キャラクター未選択'}</b>
        {(CHAR_KEYS[p.character ?? ''] ?? []).map(([k, label]) => (
          <CharAbility key={k} k={k} label={label} used={p.usedFree.includes(k)} />
        ))}
        <span className="stat" title={`解放したワンダーアイコン ${p.wonders}個（1個目で時計塔の条件、2個目以降はスキルタイル）`}>
          <Glyph g="wonder" size={14} />
          <b>{p.wonders}</b>
        </span>
        {p.character === 'カルメン・メロ' && (
          <span className="stat" title={`ボード上のキューブ ${p.carmenCubes}個（パス時：1個につき1勝利点）`}>
            <Glyph g="cube" size={14} />
            <b>{p.carmenCubes}</b>
          </span>
        )}
        {p.woodDiscount > 0 && (
          <span className="stat" title={`木材割引タイル：建物駒1個ごとに木材-${p.woodDiscount}`}>
            <Icons toks={[{ g: 'wood', n: `-${p.woodDiscount}` }]} size={14} />
          </span>
        )}
      </div>
      <ClockConditions p={p} />
      <div className="resline">
        {(['gold', 'wheat', 'wood', 'iron'] as ResKind[]).map((r) => (
          <IncomeCell key={r} p={p} r={r} />
        ))}
        <div className="res" title="ダイヤ">
          <Glyph g="diamond" size={16} />
          <b>{p.diamond}</b>
        </div>
      </div>
      <TagSummary p={p} />
      <BuildingGrid s={s} p={p} />
      <div className="pieces">
        <div className="shops">
          {(['agr', 'for', 'min'] as Row[]).map((r) => (
            <ShopPiece key={r} p={p} row={r} />
          ))}
          <Icons toks={discountedCostToks(SHOP_COST, pieceCostAt(s, p, 'shop:agr', 0))} size={13} />
        </div>
        <ClockPiece p={p} />
      </div>
      <div className="rows">
        {(['agr', 'for', 'min'] as Row[]).map((r) => (
          <RowDrop key={r} s={s} p={p} row={r} />
        ))}
      </div>
      {withTableau && (
        <div className={`tableau ${tableau.lit ? 'lit' : ''}`} {...tableau.props}>
          <Glyph g={{ k: 'played' }} size={14} title="手元（プレイしたカード）" />
          {p.played.map((id) => (
            <TableauCard key={id} id={id} />
          ))}
        </div>
      )}
      <div className={`ownskills ${skillsDrop.lit ? 'lit' : ''}`} {...skillsDrop.props}>
        <Glyph g="skill" size={14} title="スキルタイル" />
        {p.skills.map((sk) => (
          <OwnSkill key={`${sk.adv}${sk.id}`} id={sk.id} adv={sk.adv} flipped={sk.flipped} />
        ))}
      </div>
    </div>
  );
}
