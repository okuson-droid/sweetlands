// 帯（ui_design §7）・宣言パネル（§5.6）・解決中／次の一覧（§9）・安全網（§5.7）
import { useMemo, useState } from 'react';
import { describe } from '../../game/engine';
import { CARDS } from '../../game/cards';
import type { GameState, Task } from '../../game/types';
import type { Affordances, Move } from '../gestures';
import { useInteraction, useTarget } from '../interaction';
import { Glyph } from '../icons/Glyph';

const PHASE_LABEL: Record<string, string> = { setup: '準備', start: '開始フェイズ', income: '収入フェイズ', action: 'アクションフェイズ', cleanup: 'クリーンナップ', end: 'ゲーム終了' };

export function phaseLabel(s: GameState): string {
  return PHASE_LABEL[s.phase] ?? s.phase;
}

/** 帯の文（§7.1） */
export function bandText(s: GameState, viewer: number, copying: boolean): { src: string | null; say: string; mine: boolean } {
  const pd = s.pending;
  if (s.finished) return { src: null, say: 'ゲーム終了。最終得点を計算します', mine: false };
  if (!pd) return { src: null, say: '', mine: false };
  const who = s.players[pd.player].name;
  const src = pd.resume.src ?? null;
  const mine = pd.player === viewer;
  if (!mine) {
    if (pd.waiting) return { src: 'ドラフト', say: `${pd.waiting.map((x) => s.players[x].name).join('さん・')}さんが選んでいます（全員同時）`, mine };
    if (pd.step === 'turn') return { src: null, say: `${who}さんの手番です`, mine };
    return { src: null, say: `${who}さんの入力待ち${src ? `（${src}の効果）` : ''}`, mine };
  }
  if (copying) return { src: '特殊アクションL', say: 'コピーするアクションエリアを選んでください', mine };
  if (pd.step === 'turn')
    return s.turnMainDone
      ? { src: null, say: 'フリーアクションを行うか、手番を終えてください', mine }
      : { src: null, say: '行動を選んでください：アクションエリアにディスクを置く／カードをプレイする／フリップ／パス', mine };
  if (pd.step === 'setupChar') return { src: '準備', say: 'キャラクターを選んでください', mine };
  if (pd.step === 'setupMap') return { src: '準備', say: '地図ボードと面を選んでください', mine };
  if (pd.step === 'setupPick') return { src: '準備のドラフト', say: 'キャラクター・地図ボード・ラウンド支援駒のうち、まだ選んでいないものから1つを選んでください', mine };
  if (pd.step === 'draftPick') return { src: 'ドラフト', say: '手札に加えるカードを1枚選んでください（全員同時に選びます）', mine };
  if (pd.step === 'support') return { src: '準備', say: 'ラウンド支援駒を置くスペースへ駒を動かしてください', mine };
  if (pd.step === 'passMove') return { src: 'パス', say: '次のラウンドの支援スペースへ駒を動かしてください', mine };
  if (pd.step === 'keep') return { src: 'クリーンナップ', say: '次のラウンドに残す手札を1枚、持ち越し枠へ動かしてください', mine };
  if (pd.step === 'handCost') return { src: '手札コスト', say: pd.prompt.replace('手札コスト：', '').replace('捨てるカードを選んでください', '捨てるカードを捨て札置き場へ動かしてください'), mine };
  if (pd.step === 'payHand') return { src, say: pd.prompt.replace(/^.+?：/, '').replace('捨てる手札を選んでください', '捨てる手札をクリックするか、捨て札置き場へ動かしてください'), mine };
  const say = pd.prompt
    .replace(/^.+?：/, '')
    .replace('捨てる手札を選んでください', '捨てる手札を捨て札置き場へ動かしてください');
  return { src, say, mine };
}

function StackLine({ i, label }: { i: number; label: string }) {
  const t = useTarget(`effect:${i}`, { k: 'other' });
  return (
    <span className={`line ${t.lit ? 'lit' : ''}`} {...t.props}>
      {label}
    </span>
  );
}

function taskLabel(t: Task): string | null {
  if (t.eff.k === 'special') return null;
  const d = describe([t.eff]);
  return t.src ? `${t.src}：${d}` : d;
}

function EffectStack({ s, compact }: { s: GameState; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const pd = s.pending!;
  const next = s.queue.map(taskLabel).filter((x): x is string => !!x).slice(0, 4);
  const ordering = pd.step === 'orderEffects';
  if (!ordering && next.length === 0 && (pd.step === 'turn' || !pd.resume.src)) return null;
  const body = (
    <div className={`stack ${ordering ? 'clickable' : ''} ${compact ? 'stack-inline' : ''}`} aria-live="polite">
      <div className="now">解決中：{pd.resume.src ?? '手番'}{ordering ? '（先に解決する効果を選んでください）' : ''}</div>
      {ordering && pd.options.map((o, i) => <StackLine key={o.id} i={i} label={o.label} />)}
      {next.length > 0 && <div className="next">次：{next.join('／')}</div>}
    </div>
  );
  // スマートフォン（ui_design §22.4）：盤面を覆わないよう、帯の中の札に畳む。先に解決する効果を選ぶ場面だけは開いたまま出す
  if (!compact || ordering) return body;
  return (
    <div className="stack-fold">
      <button className="stack-chip" onClick={() => setOpen(!open)} aria-expanded={open}>
        解決中{next.length > 0 ? `・次${next.length}` : ''} {open ? '▴' : '▾'}
      </button>
      {open && body}
    </div>
  );
}

const TERRAIN_NAME: Record<string, string> = { W: '麦畑タイル', F: '森林タイル', M: '鉱山タイル', S: '海タイル' };
const PIECE_NAME: Record<string, string> = { tent: 'テント駒', house: '家駒', bldg: 'ビル駒', lab: '研究所駒', shop: 'ショップ駒', clock: '時計塔駒', rabbit: 'クッキーラビット駒' };

/** 持ち上げているものの名前（タップで持ち上げたとき、帯に出す） */
export function heldLabel(key: string): string {
  const [kind, rest = ''] = key.split(/:(.*)/s);
  if (kind === 'tile') return TERRAIN_NAME[rest] ?? '地形タイル';
  if (kind === 'special') return '特殊地形タイル';
  if (kind === 'road') return '道駒';
  if (kind === 'diamond') return 'ダイヤ';
  if (key === 'disc:own') return '手元のディスク';
  if (key === 'disc:supply') return 'アクションディスク';
  if (key === 'marker:support') return 'ラウンド支援駒';
  if (kind === 'piece') return PIECE_NAME[rest] ?? '駒';
  if (kind === 'skillpile' || kind === 'advskill') return 'スキルタイル';
  if (CARDS[rest]) return CARDS[rest].nameJa;
  return '選んだもの';
}

const SPLIT_KEYS = ['wheat', 'wood', 'iron'] as const;
const splitTotal = (v: Record<string, number> | undefined) => SPLIT_KEYS.reduce((a, k) => a + (v?.[k] ?? 0), 0);

/** 合計の条件の文。合計が1通りならその数、等間隔なら「〜の倍数」、それ以外は範囲で示す */
function totalRule(totals: number[]): string {
  if (totals.length === 1) return `${totals[0]}`;
  const unit = totals[0];
  if (totals.every((t, i) => t === unit * (i + 1))) return unit === 1 ? `${totals[totals.length - 1]}以下` : `${unit}の倍数（${totals[totals.length - 1]}以下）`;
  return `${totals[0]}〜${totals[totals.length - 1]}`;
}

/** 基礎資源の内訳の入力。初期値は0とし、選択肢が1つしかないときだけその内訳を入れておく。
 *  合計は選択肢から読み取る（両替のフリーアクションの一括では合計が1通りに決まらない） */
function SplitPanel({ moves, mode }: { moves: { move: Move; split?: Record<string, number> }[]; mode: 'gain' | 'pay' }) {
  const c = useInteraction();
  const [v, setV] = useState<Record<string, number>>(() => (moves.length === 1 ? { ...(moves[0].split ?? {}) } : {}));
  const totals = useMemo(() => [...new Set(moves.map((m) => splitTotal(m.split)))].sort((a, b) => a - b), [moves]);
  const match = moves.find((m) => SPLIT_KEYS.every((k) => (m.split?.[k] ?? 0) === (v[k] ?? 0)));
  const total = splitTotal(v);
  const step = (k: string, d: number) => setV((x) => ({ ...x, [k]: Math.max(0, (x[k] ?? 0) + d) }));
  const rule = totalRule(totals);
  const word = mode === 'gain' ? '得る' : '払う';
  return (
    <div className="declare">
      <span>{totals.length === 1 ? `${word}内訳（合計${rule}）` : `${word}内訳（合計${total}／${rule}）`}</span>
      {SPLIT_KEYS.map((k) => (
        <span key={k} className="stepper">
          <button aria-label={`${k}を減らす`} onClick={() => step(k, -1)}>
            −
          </button>
          <Glyph g={k} size={18} />
          <b>{v[k] ?? 0}</b>
          <button aria-label={`${k}を増やす`} onClick={() => step(k, 1)}>
            ＋
          </button>
        </span>
      ))}
      <button className="btn primary" disabled={!match} onClick={() => match && c.run(match.move)}>
        {match ? '決定' : !totals.includes(total) ? `合計を${rule}にしてください` : '持っている数を超えています'}
      </button>
    </div>
  );
}

function Declare({ aff }: { aff: Affordances }) {
  const c = useInteraction();
  const d = aff.declare!;
  if (d.kind === 'basicGain' || d.kind === 'basicPay') {
    return <SplitPanel key={`${d.kind}-${d.moves.map((m) => m.move.ids[0]).join()}-${c.state.events.length}-${c.state.log.length}`} moves={d.moves} mode={d.kind === 'basicGain' ? 'gain' : 'pay'} />;
  }
  return (
    <div className="declare">
      {d.moves.map(({ move }) => (
        <button key={move.ids.join()} className="btn" onClick={() => c.run(move)}>
          {move.label}
        </button>
      ))}
    </div>
  );
}

export function Band(props: { s: GameState; viewer: number; canUndo: boolean; undo: () => void; undoCount: number; undoAll: () => void; pulse: boolean; onResize?: (dy: number) => void; compact?: boolean }) {
  const { s, viewer, canUndo, undo, undoCount, undoAll, pulse } = props;
  const c = useInteraction();
  const text = bandText(s, viewer, !!c.copyKey);
  const aff = c.aff;
  const order = ['stop', 'skip', 'pay', 'pass', 'endTurn'];
  const buttons = useMemo(() => [...aff.buttons].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)), [aff]);
  return (
    <div
      className={`band ${text.mine ? 'mine' : ''} ${pulse ? 'pulse' : ''}`}
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget || !props.onResize) return;
        const y0 = e.clientY;
        const mv = (ev: PointerEvent) => props.onResize!(ev.clientY - y0);
        const up = () => {
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
      }}
    >
      <div className="say" aria-live="polite">
        {props.compact && c.held && <span className="held-chip">持ち上げ中：{heldLabel(c.held)}</span>}
        {text.src && <span className="src">【{text.src}】</span>}
        {props.compact && c.held ? '置き先をタップしてください' : text.say}
      </div>
      {s.pending && c.active && <EffectStack s={s} compact={props.compact} />}
      <div className="actions">
        {c.active && aff.declare && <Declare aff={aff} />}
        {c.active && aff.fallback.length > 0 && (
          <div className="fallback" aria-label="その他の操作">
            {aff.fallback.map((o) => (
              <button key={o.id} className="btn" onClick={() => c.run({ ids: [o.id], label: o.label })}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        {props.compact && c.held && (
          <button className="btn" onClick={() => c.setHeld(null)}>
            戻す
          </button>
        )}
        {c.copyKey && (
          <button className="btn" onClick={c.cancelCopy}>
            コピーをやめる
          </button>
        )}
        {canUndo && text.mine && (
          <button className="btn" onClick={undo} title="Ctrl+Z">
            取り消し
          </button>
        )}
        {canUndo && text.mine && undoCount >= 2 && (
          <button className="btn" onClick={undoAll} title={`取り消せる${undoCount}手をまとめて取り消し、手番の最初に戻る（山札を引いたあとなど、取り消せない手より前には戻らない）`}>
            手番の最初に戻る
          </button>
        )}
        {c.active &&
          buttons.map((b) => (
            <button key={b.role + b.move.ids.join()} className={`btn ${b.role === 'endTurn' ? 'primary' : ''}`} onClick={() => c.run(b.move)}>
              {b.move.label}
            </button>
          ))}
      </div>
    </div>
  );
}
