// 工業発展ボード（ui_design §4.1）：工業トラック・食料トラック・研究所駒・クッキーラビット駒
import { FOOD_BONUS, FOOD_END, INDUSTRY_TRACK, IP_ICONS, IP_VALUES_NATA_BUFF, LAB_COST, LAB_GAPS, RABBIT_BONUS } from '../../game/boards';
import { isBuffed } from '../../game/characters';
import { describe } from '../../game/engine';
import type { PlayerState } from '../../game/types';
import { useSource, useTarget, useZoomBind } from '../interaction';
import { playerColor } from '../theme';
import { Icons, discountedCostToks, effToks } from '../icons/EffIcons';
import { pieceCostAt } from '../../game/engine';
import type { GameState } from '../../game/types';
import { passedIp } from '../../game/queries';
import { Glyph } from '../icons/Glyph';

function Marker({ p, m }: { p: PlayerState; m: 'carriage' | 'loco' }) {
  const t = useTarget(`marker:${m}`, { k: 'industryMarker', marker: m });
  return (
    <span className={`imarker ${m} ${t.lit ? 'lit' : ''}`} {...t.props} style={{ borderColor: playerColor(p.seat) }} tabIndex={0} title={m === 'carriage' ? '馬車駒' : '機関車駒'}>
      <Glyph g={m} size={13} />
    </span>
  );
}

function Square({ p, i, row }: { p: PlayerState; i: number; row: number }) {
  const sq = INDUSTRY_TRACK[i];
  const z = useZoomBind(() => (
    <div>
      <b>工業トラック {i + 1}マス目（{sq.color === 'O' ? '馬車駒' : '機関車駒'}がボーナスを得る）</b>
      <div>{sq.eff.length ? describe(sq.eff) : 'ボーナスなし'}</div>
    </div>
  ));
  return (
    <span className={`isq ${sq.color}`} {...z.props} style={{ gridRow: row, gridColumn: squareColumn(i) }}>
      {sq.eff.length > 0 && <Icons toks={effToks(sq.eff)} size={12} />}
      {p.carriage === i && <Marker p={p} m="carriage" />}
      {p.loco === i && <Marker p={p} m="loco" />}
    </span>
  );
}

function shortEff(t: string): string {
  return t.length > 8 ? `${t.slice(0, 8)}…` : t;
}

function labCost(s: GameState, p: PlayerState, lab: number) {
  return discountedCostToks(LAB_COST[lab], pieceCostAt(s, p, 'lab', lab));
}
function labTitle(s: GameState, p: PlayerState, lab: number) {
  const a = pieceCostAt(s, p, 'lab', lab);
  const b = LAB_COST[lab];
  const now = `木材${a.wood ?? 0}・鉄${a.iron ?? 0}`;
  const orig = `木材${b.wood ?? 0}・鉄${b.iron ?? 0}`;
  return now === orig ? `取るコスト：${now}` : `取るコスト：${now}（元のコスト ${orig}）`;
}

/** 工業トラック上のマス i の後ろ（i と i+1 の間）が、表示グリッドの何列目かを返す（1 始まり）。上段は左→右、下段は右→左に進む */
function gapColumn(after: number): number | null {
  if (after >= 0 && after <= 7) return 2 * after + 2;
  if (after >= 9 && after <= 16) return 34 - 2 * after;
  return null;
}
function squareColumn(i: number): number {
  return i <= 8 ? 2 * i + 1 : 2 * (17 - i) + 1;
}

function labState(p: PlayerState, after: number) {
  const lab = LAB_GAPS.indexOf(after);
  return { lab, present: lab >= 0 && p.taken.lab <= lab, next: lab >= 0 && p.taken.lab === lab };
}

/** マスの外側の帯に置く、研究所駒と工業点アイコン（マスとマスの境目の位置に揃える） */
function GapPieces({ s, p, after, row }: { s: GameState; p: PlayerState; after: number; row: number }) {
  const { lab, present, next } = labState(p, after);
  const ipIdx = IP_ICONS.findIndex((x) => x.gap === after);
  const ip = ipIdx < 0 ? null : { value: isBuffed(s.config, p.character) && p.character === 'ナタ・パステル' ? IP_VALUES_NATA_BUFF[ipIdx] : IP_ICONS[ipIdx].value };
  const src = useSource('piece:lab', '研究所駒', { k: 'other' });
  const col = gapColumn(after);
  if (col === null || (!present && !ip)) return null;
  return (
    <span className="igap" style={{ gridRow: row, gridColumn: col }}>
      <span className="igap-in">
        {present &&
          (next ? (
            <span className={`lab ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} tabIndex={0} title={`研究所駒（${labTitle(s, p, lab)}）。取り除くまで工業マーカーはここを越えられない`}>
              <Glyph g={{ k: 'building', type: 'lab' }} size={14} />
              <Icons toks={labCost(s, p, lab)} size={9} />
            </span>
          ) : (
            <span className="lab off" title={`研究所駒（${labTitle(s, p, lab)}）`}>
              <Glyph g={{ k: 'building', type: 'lab' }} size={14} />
              <Icons toks={labCost(s, p, lab)} size={9} />
            </span>
          ))}
        {ip && (
          <span className="ipicon" title={`工業点アイコン ${ip.value}`}>
            <Glyph g="ip" size={13} />
            <b>{ip.value}</b>
          </span>
        )}
      </span>
    </span>
  );
}

/** 研究所駒が残っている境目に引く壁（工業マーカーはここを越えられない） */
function Wall({ p, after, row }: { p: PlayerState; after: number; row: number }) {
  const col = gapColumn(after);
  if (col === null || !labState(p, after).present) return null;
  return <span className="iwall" style={{ gridRow: row, gridColumn: col }} />;
}

function Track({ s, p, squares, gaps, stripRow }: { s: GameState; p: PlayerState; squares: number[]; gaps: number[]; stripRow: 1 | 2 }) {
  const sqRow = stripRow === 1 ? 2 : 1;
  return (
    <div className={`itrack ${stripRow === 1 ? 'top' : 'bottom'}`}>
      {squares.map((i) => (
        <Square key={`s${i}`} p={p} i={i} row={sqRow} />
      ))}
      {gaps.map((g) => (
        <Wall key={`w${g}`} p={p} after={g} row={sqRow} />
      ))}
      {gaps.map((g) => (
        <GapPieces key={`g${g}`} s={s} p={p} after={g} row={stripRow} />
      ))}
    </div>
  );
}

function Rabbit({ p, i }: { p: PlayerState; i: number }) {
  const next = i === p.rabbitsTaken;
  const src = useSource('piece:rabbit', 'クッキーラビット駒', { k: 'hex', hex: '', holding: 'rabbit' });
  const present = i >= p.rabbitsTaken;
  const bonus = RABBIT_BONUS[i];
  // 置き場に印刷されたボーナスは、駒を取ったあとも（取る直前の駒でも）見えるように常に出す
  const icon = bonus && <Icons toks={effToks(bonus)} size={10} />;
  if (!present)
    return (
      <span className="rab gone" title={bonus ? `獲得済み：${describe(bonus)}` : undefined}>
        {icon}
      </span>
    );
  if (!next)
    return (
      <span className="rab" title={bonus ? describe(bonus) : undefined}>
        {icon}
      </span>
    );
  return (
    <span className={`rab ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} tabIndex={0} title={bonus ? `取ると：${describe(bonus)}` : 'クッキーラビット駒'}>
      {icon}
    </span>
  );
}

export function IndustryBoard({ s, p }: { s: GameState; p: PlayerState }) {
  const top = Array.from({ length: 9 }, (_, i) => i);
  const bottom = Array.from({ length: 9 }, (_, i) => 17 - i);
  const topGaps = Array.from({ length: 8 }, (_, i) => i);
  const bottomGaps = Array.from({ length: 8 }, (_, i) => 9 + i);
  return (
    <div className="industry">
      <div className="istats" title={`工業マーカーが通過した工業点アイコンの合計：パス時に${passedIp(p, isBuffed(s.config, p.character))}工業点を得る`}>
        <Icons toks={[{ g: 'pass' }, { g: 'ipThisPass', n: passedIp(p, isBuffed(s.config, p.character)) }]} size={14} />
        <Icons toks={[{ g: 'carriage', n: p.carriage + 1 }, ...(p.loco !== null ? [{ g: 'loco' as const, n: p.loco + 1 }] : [])]} size={14} />
      </div>
      <Track s={s} p={p} squares={top} gaps={topGaps} stripRow={1} />
      <Track s={s} p={p} squares={bottom} gaps={bottomGaps} stripRow={2} />

      <div className="food">
        <div className="rabbits">
          {Array.from({ length: 13 }, (_, k) => (
            <span key={k} className="fcol">
              {k >= 4 ? <Rabbit p={p} i={k - 4} /> : <span className="rab none" />}
            </span>
          ))}
        </div>
        <div className="ftrack">
          {Array.from({ length: FOOD_END + 1 }, (_, k) => (
            <span key={k} className={`fsq ${p.food === k ? 'on' : ''}`} title={FOOD_BONUS[k] ? describe(FOOD_BONUS[k]) : undefined}>
              <span className="fnum">{k}</span>
              {FOOD_BONUS[k] && <Icons toks={effToks(FOOD_BONUS[k])} size={11} />}
              {p.food === k && <span className="fmark" style={{ background: playerColor(p.seat) }} />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
