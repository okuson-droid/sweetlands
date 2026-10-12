// メインボード（ui_design §4.1）：繁栄トラック・アクションエリア・フリーアクション欄・スキルタイル・ラウンドトラック
import { ADV_SKILLS, AREAS, PROS_TRACKS, ROUND2_AREAS, SKILLS, SUPPORT_NORMAL, SUPPORT_PASS, MILESTONE_LABEL, FINAL_TILES } from '../../game/boards';
import { areaCost, describe } from '../../game/engine';
import type { GameState } from '../../game/types';
import { useInteraction, useSource, useTarget, useZoomBind } from '../interaction';
import { playerColor } from '../theme';
import { Icons, costEffToks, discountedCostToks, effToks } from '../icons/EffIcons';
import { FREE_TOKS, PROS_SUBJECT, finalToks, milestoneToks, skillToks, supportToks } from '../icons/specs';

// 原本の配置：基本は左2列（A・B・C／D・E・F）、応用は右上に M、その下の2×2に N・P（第2ラウンド）と O・Q（第3ラウンド）
const AREA_GRID: Record<string, string> = { A: '1 / 1', D: '1 / 2', M: '1 / 3 / 2 / 5', B: '2 / 1', E: '2 / 2', N: '2 / 3', O: '2 / 4', C: '3 / 1', F: '3 / 2', P: '3 / 3', Q: '3 / 4' };
const COLOR_VAR = { O: 'var(--wheat)', G: 'var(--forest)', Y: 'var(--mine)' } as const;

export function AreaBox({ s, id, flash }: { s: GameState; id: string; flash: boolean }) {
  const def = AREAS[id];
  const area = s.areas[id];
  const t = useTarget(`area:${id}`, { k: 'area', area: id });
  const c = useInteraction();
  const me = s.players[c.viewer];
  const actual = me?.character ? areaCost(s, me, id) : def.cost;
  const costT = discountedCostToks(def.cost, actual);
  const discounted = costT.some((x) => 'was' in x && x.was !== undefined);
  const toks = costT.length ? [...costT, { g: 'payOnce' as const }, ...effToks(def.effect)] : effToks(def.effect);
  const z = useZoomBind(() => (
    <div>
      <b>{areaName(id)}</b>
      {!def.copy && <Icons toks={toks} size={20} />}
      {discounted && (
        <div className="was">
          元のコスト：
          <Icons toks={costEffToks(def.cost, [])} size={16} />
        </div>
      )}
      <div>{def.label}</div>
      <div style={{ marginTop: 4, fontSize: 12 }}>空いているスペースの最も左にディスクを置く。手札コストは左から1・2・3枚。</div>
    </div>
  ));
  const hidden = def.group === 'advanced' && !s.revealed.includes(id);
  if (!area) return null;
  return (
    <div className={`area ${def.group} ${t.lit ? 'lit' : ''} ${hidden ? 'hidden' : ''} ${flash ? 'flash' : ''}`} {...t.props} {...z.props} tabIndex={0}>
      <div className="area-head">
        <b>{areaName(id)}</b>
        {hidden ? (
          <span className="round-badge" title={`第${ROUND2_AREAS.includes(id) ? 2 : 3}ラウンドから`}>
            R{ROUND2_AREAS.includes(id) ? 2 : 3}
          </span>
        ) : def.copy ? (
          <span className="copy-label">
            <Icons toks={[{ g: 'gold', n: 4, cost: true }, { g: 'payOnce' }]} />
            {def.copy === 'basic' ? 'A〜F' : 'A〜Q'}
          </span>
        ) : (
          <Icons toks={toks} label={def.label} />
        )}
      </div>
      <div className="slots">
        {area.slots.map((who, i) => (
          <span key={i} className="slot" style={who !== null ? { background: playerColor(who), borderColor: playerColor(who) } : undefined} title={who !== null ? s.players[who].name : `手札コスト${i + 1}枚`}>
            {who === null ? i + 1 : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export function areaName(id: string): string {
  return { L1: 'L', L2: 'L', K8: 'K', J2: 'J', H2: 'H', I2: 'I' }[id] ?? id;
}

function rateOf(tr: (typeof PROS_TRACKS)[number], k: number): [number, number] {
  return k === tr.length ? tr.rates[2] : k > tr.seg1End ? tr.rates[1] : tr.rates[0];
}

function ProsRow({ s, i }: { s: GameState; i: number }) {
  const tr = PROS_TRACKS[i];
  const t = useTarget(`pros:${i}`, { k: 'pros', track: i });
  const z = useZoomBind(() => (
    <div>
      <b>繁栄トラック：{tr.label}</b>
      <div>
        区間1 {tr.rates[0][0]}つにつき{tr.rates[0][1]}勝利点／区間2 {tr.rates[1][0]}つにつき{tr.rates[1][1]}勝利点／右端 {tr.rates[2][0]}つにつき{tr.rates[2][1]}勝利点
      </div>
      {Object.entries(tr.bonus).map(([k, e]) => (
        <div key={k}>
          {k}歩目：{describe(e)}
        </div>
      ))}
      <div>右端（ダイヤ1が必要）：{describe(tr.endBonus)}（最初の1人のみ）</div>
    </div>
  ));
  const squares = Array.from({ length: tr.length + 1 }, (_, k) => k);
  return (
    <div className={`pros ${t.lit ? 'lit' : ''}`} {...t.props} {...z.props} style={{ ['--tc' as string]: COLOR_VAR[tr.color] }}>
      <span className="pros-label">
        <Icons toks={[PROS_SUBJECT[i]]} size={18} label={tr.label} />
      </span>
      <div className="pros-track">
        {squares.map((k) => (
          <span key={k} className={`sq ${k === tr.length ? 'end' : k > tr.seg1End ? 'seg2' : k > 0 ? 'seg1' : ''}`}>
            {(k === 1 || k === tr.seg1End + 1 || k === tr.length) && (
              <i className="rate" title={`この区間：${rateOf(tr, k)[0]}つにつき${rateOf(tr, k)[1]}勝利点`}>
                {rateOf(tr, k)[0]}:{rateOf(tr, k)[1]}
              </i>
            )}
            {tr.bonus[k] ? <Icons toks={effToks(tr.bonus[k])} size={12} /> : k === tr.length ? <Icons toks={effToks(tr.endBonus)} size={12} /> : null}
            <span className="markers">
              {s.players.map((p) =>
                p.pros[i] === k ? <i key={p.seat} style={{ background: playerColor(p.seat) }} title={p.name} /> : null,
              )}
            </span>
          </span>
        ))}
      </div>
      {s.prosEndClaimed[i] !== null && <span className="claimed" style={{ color: playerColor(s.prosEndClaimed[i]!) }}>●</span>}
    </div>
  );
}

function FreeCell({ slot, title, dest }: { slot: string; title: string; dest: boolean }) {
  const t = useTarget(`free:${slot}`, { k: 'free', slot });
  return (
    <div className={`free ${t.lit ? 'lit' : ''} ${dest ? 'drop' : ''}`} {...t.props} tabIndex={0} title={title}>
      <Icons toks={FREE_TOKS[slot]} label={title} />
    </div>
  );
}

function FreeHint({ slot, title }: { slot: string; title: string }) {
  return (
    <div className="free hint" title={title}>
      <Icons toks={FREE_TOKS[slot]} label={title} />
    </div>
  );
}

function SkillPile({ s, id }: { s: GameState; id: number }) {
  const def = SKILLS[id - 1];
  const src = useSource(`skillpile:${id}`, `スキル：${def.label}`, { k: 'other' });
  const z = useZoomBind(() => (
    <div>
      <b>スキルタイル（{{ instant: '即時', pass: 'パス時', flip: 'フリップ', perm: '永続' }[def.kind]}）</b>
      <div>{def.label}</div>
      <div>残り {s.skillPiles[id - 1]} 枚</div>
    </div>
  ));
  return (
    <div className={`skillpile ${def.kind} ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} {...z.props} tabIndex={0}>
      <Icons toks={skillToks(id)} size={14} label={def.label} />
      <b className="count">×{s.skillPiles[id - 1]}</b>
    </div>
  );
}

export function MainBoard({ s, flashKeys, freeSlot, prosExtra }: { s: GameState; flashKeys: Set<string>; freeSlot?: React.ReactNode; prosExtra?: React.ReactNode }) {
  const main = ['G', 'H', 'I', 'J', 'K'];
  return (
    <div className="mainboard">
      <section className="col pros-col" aria-label="繁栄トラック">
        {prosExtra}
        {[0, 2, 4, 1, 3, 5].map((i) => (
          <ProsRow key={i} s={s} i={i} />
        ))}
        <div className="rounds">
          {[1, 2, 3, 4, 5].map((r) => (
            <span key={r} className={r === s.round ? 'on' : ''}>
              {r}
            </span>
          ))}
        </div>
      </section>
      <section className="col areas-col" aria-label="アクションエリア">
        <div className="areas special">{main.map((id) => <AreaBox key={id} s={s} id={id} flash={flashKeys.has(`area:${id}`)} />)}</div>
        <div className="areas-grid">
          {Object.entries(AREA_GRID).map(([id, area]) => (
            <div key={id} style={{ gridArea: area, display: 'grid' }}>
              <AreaBox s={s} id={id} flash={flashKeys.has(`area:${id}`)} />
            </div>
          ))}
        </div>
      </section>
      <section className="col free-col" aria-label="フリーアクションとスキルタイル">
        {freeSlot ?? (
          <>
            <FreeActions />
            <SkillPiles s={s} />
          </>
        )}
      </section>
    </div>
  );
}

/** フリーアクションの一覧（横長レイアウトでは Fold の中に入れる） */
export function FreeActions() {
  return (
    <div className="frees">
      <FreeCell slot="fa1" title="手札1＋基礎3 → 地形1か道1" dest />
      <FreeCell slot="fa2" title="15G → カード1枚" dest={false} />
      <FreeCell slot="fa3" title="4G → 任意の基礎1" dest={false} />
      <FreeHint slot="fa4" title="マイルストーンを獲得する（右のマイルストーンタイルをクリック）" />
      <FreeCell slot="fa5" title="基礎1 → 1G" dest={false} />
      <FreeCell slot="fa6" title="基礎3 → 任意の基礎1" dest={false} />
      <FreeCell slot="fa7" title="ディスク1か手札1 → 任意の基礎2" dest />
      <FreeHint slot="fa8" title="時計塔駒を置く（個人ボードの時計塔駒を地図へ動かす）" />
    </div>
  );
}

/** スキルタイルの山（基本）。withAdv で上級スキルタイルも並べる */
export function SkillPiles({ s, withAdv }: { s: GameState; withAdv?: boolean }) {
  return (
    <>
      <div className="skills">
        {SKILLS.map((sk) => (
          <SkillPile key={sk.id} s={s} id={sk.id} />
        ))}
      </div>
      {withAdv && s.advSkills.length > 0 && (
        <>
          <h3>上級スキルタイル（ダイヤ1で獲得）</h3>
          <div className="skills adv">
            {s.advSkills.map((id) => (
              <AdvSkill key={id} id={id} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** 繁栄トラック6本とラウンド表示（拡大表示用） */
export function ProsBoard({ s }: { s: GameState }) {
  return (
    <div className="prosboard">
      {[0, 2, 4, 1, 3, 5].map((i) => (
        <ProsRow key={i} s={s} i={i} />
      ))}
      <div className="rounds">
        {[1, 2, 3, 4, 5].map((r) => (
          <span key={r} className={r === s.round ? 'on' : ''}>
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}

function SupportCol({ s, col }: { s: GameState; col: number }) {
  const t = useTarget(`support:${col}`, { k: 'other' });
  const used = s.supportCols.includes(col);
  const who = s.supportMarkers[col];
  const tiles = s.supportTiles[col];
  const label = (id: number | null) => (id === null ? '' : id > 100 ? `パス時：${SUPPORT_PASS[id - 101].label}` : SUPPORT_NORMAL[id - 1].label);
  const z = useZoomBind(() => (
    <div>
      <b>ラウンド支援 {col + 1}列目</b>
      {tiles.map((id, i) => id !== null && <div key={i}>{label(id)}</div>)}
      {who !== null && <div>{s.players[who].name}さんの駒</div>}
    </div>
  ));
  if (!used) return null;
  return (
    <div className={`support ${t.lit ? 'lit' : ''}`} {...t.props} {...z.props} tabIndex={0}>
      {tiles.map((id, i) => (
        <span key={i} className={`stile ${id !== null && id > 100 ? 'pass' : ''}`} title={label(id)}>
          {id !== null && <Icons toks={supportToks(id)} size={13} label={label(id)} />}
        </span>
      ))}
      <span className="smarker" style={who !== null ? { background: playerColor(who) } : undefined} />
    </div>
  );
}

function SupportMarkerSource() {
  const c = useInteraction();
  const src = useSource('marker:support', 'ラウンド支援駒', { k: 'other' });
  if (!src.lit) return null;
  return (
    <span className={`marker-src lit ${src.held ? 'held' : ''}`} {...src.props} tabIndex={0} style={{ background: playerColor(c.viewer) }}>
      あなたの支援駒
    </span>
  );
}

function Milestone({ s, i }: { s: GameState; i: number }) {
  const m = s.milestones[i];
  const t = useTarget(`milestone:${i}`, { k: 'milestone', idx: i });
  return (
    <div className={`milestone ${t.lit ? 'lit' : ''} ${m.takenBy !== null ? 'taken' : ''}`} {...t.props} tabIndex={0}>
      <Icons toks={milestoneToks(`${m.id}${m.side}`)} size={14} label={MILESTONE_LABEL[`${m.id}${m.side}`]} />
      {m.takenBy !== null && (
        <b>
          <i style={{ background: playerColor(m.takenBy) }} />
        </b>
      )}
    </div>
  );
}

function AdvSkill({ id }: { id: number }) {
  const def = ADV_SKILLS[id - 1];
  const src = useSource(`advskill:${id}`, `上級：${def.label}`, { k: 'other' });
  return (
    <div className={`skillpile adv ${src.lit ? 'lit' : ''} ${src.held ? 'held' : ''}`} {...src.props} tabIndex={0} title={def.label}>
      <Icons toks={skillToks(id, true)} size={14} label={def.label} />
      <Icons toks={[{ g: 'diamond', n: 1, cost: true }]} size={12} />
    </div>
  );
}

const SKILL_KIND = { instant: '即時', pass: 'パス時', flip: 'フリップ', perm: '永続' } as const;

/** 準備の小窓で見せる、この卓のマイルストーン・最終得点計算・上級スキルタイル（文で読める形。操作の対象にはしない） */
export function PublicTiles({ s }: { s: GameState }) {
  return (
    <div className="publictiles">
      <section>
        <h3>マイルストーン（先に達成した人が10勝利点）</h3>
        <ul>
          {s.milestones.map((m) => {
            const key = `${m.id}${m.side}`;
            return (
              <li key={key}>
                <Icons toks={milestoneToks(key)} size={14} />
                <span>{MILESTONE_LABEL[key]}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3>最終得点計算（1位15勝利点・2位7勝利点）</h3>
        <ul>
          {s.finalTiles.map((id) => {
            const f = FINAL_TILES.find((x) => x.id === id)!;
            return (
              <li key={id}>
                <Icons toks={finalToks(id)} size={14} />
                <span>
                  {f.label}（仮想プレイヤー {f.neutral}）
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {s.advSkills.length > 0 && (
        <section>
          <h3>上級スキルタイル</h3>
          <ul>
            {s.advSkills.map((id) => (
              <li key={id}>
                <Icons toks={skillToks(id, true)} size={14} />
                <span>
                  {SKILL_KIND[ADV_SKILLS[id - 1].kind]}：{ADV_SKILLS[id - 1].label}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** ラウンド支援ボード（横長レイアウトでは Fold の中に入れる） */
export function SupportBoard({ s }: { s: GameState }) {
  return (
    <div className="sideboard">
      <h2 className="with-src">
        ラウンド支援ボード <SupportMarkerSource />
      </h2>
      <div className="supports">
        {[0, 1, 2, 3, 4, 5, 6].map((col) => (
          <SupportCol key={col} s={s} col={col} />
        ))}
      </div>
    </div>
  );
}

/** 模倣ボード・マイルストーン・最終得点（・上級スキル）を横に並べた低い帯（横長レイアウト用） */
export function SideStrip({ s, flashKeys, withAdv = true }: { s: GameState; flashKeys: Set<string>; withAdv?: boolean }) {
  const imitation = ['L1', 'K8', 'J2', 'L2', 'H2', 'I2'].filter((id) => s.areas[id]);
  const c = useInteraction();
  return (
    <div className="sidestrip">
      {imitation.length > 0 && (
        <div className="sgroup">
          <h2>模倣ボード</h2>
          <div className="areas imitation">
            {imitation.map((id) => (
              <AreaBox key={id} s={s} id={id} flash={flashKeys.has(`area:${id}`)} />
            ))}
          </div>
        </div>
      )}
      {c.copyKey && <div className="copy-hint">コピーするアクションエリアを選んでください</div>}
      <div className="sgroup">
        <h2>
          マイルストーン{s.milestonesClosed && <span className="closed">（締め切り）</span>}
        </h2>
        <div className="milestones">
          {s.milestones.map((_, i) => (
            <Milestone key={i} s={s} i={i} />
          ))}
        </div>
      </div>
      <div className="sgroup">
        <h2>最終得点計算</h2>
        <div className="finals">
          {s.finalTiles.map((id) => {
            const f = FINAL_TILES.find((x) => x.id === id)!;
            return (
              <div key={id} className="final" title={`${f.label}（仮想プレイヤー ${f.neutral}）`}>
                <Icons toks={finalToks(id)} size={14} label={`${f.label}：1位15勝利点・2位7勝利点`} />
                <span className="neutral" title="仮想プレイヤーの値">
                  {f.neutral}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {withAdv && s.advSkills.length > 0 && (
        <div className="sgroup">
          <h2>上級スキルタイル</h2>
          <div className="skills">
            {s.advSkills.map((id) => (
              <AdvSkill key={id} id={id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SideBoard({ s, flashKeys, withSupport = true }: { s: GameState; flashKeys: Set<string>; withSupport?: boolean }) {
  const imitation = ['L1', 'K8', 'J2', 'L2', 'H2', 'I2'].filter((id) => s.areas[id]);
  const c = useInteraction();
  return (
    <div className="sideboard">
      {withSupport && (
        <>
          <h2 className="with-src">
            ラウンド支援ボード <SupportMarkerSource />
          </h2>
          <div className="supports">
            {[0, 1, 2, 3, 4, 5, 6].map((col) => (
              <SupportCol key={col} s={s} col={col} />
            ))}
          </div>
        </>
      )}
      {imitation.length > 0 && (
        <>
          <h2>模倣ボード</h2>
          <div className="areas imitation">
            {imitation.map((id) => (
              <AreaBox key={id} s={s} id={id} flash={flashKeys.has(`area:${id}`)} />
            ))}
          </div>
        </>
      )}
      {c.copyKey && <div className="copy-hint">コピーするアクションエリアを選んでください</div>}
      <h2>
        マイルストーン{s.milestonesClosed && <span className="closed">（3枚獲得済み：締め切り）</span>}
      </h2>
      <div className="milestones">
        {s.milestones.map((_, i) => (
          <Milestone key={i} s={s} i={i} />
        ))}
      </div>
      <h2>最終得点計算</h2>
      <div className="finals">
        {s.finalTiles.map((id) => {
          const f = FINAL_TILES.find((x) => x.id === id)!;
          return (
            <div key={id} className="final" title={`${f.label}（仮想プレイヤー ${f.neutral}）`}>
              <Icons toks={finalToks(id)} size={14} label={`${f.label}：1位15勝利点・2位7勝利点`} />
              <span className="neutral" title="仮想プレイヤーの値">
                {f.neutral}
              </span>
            </div>
          );
        })}
      </div>
      {s.advSkills.length > 0 && (
        <>
          <h2>上級スキルタイル</h2>
          <div className="skills">
            {s.advSkills.map((id) => (
              <AdvSkill key={id} id={id} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
