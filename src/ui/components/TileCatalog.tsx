// タイルの一覧（ロビーの「カード・タイル一覧」から開く）。ゲームの準備でランダムに場へ出るタイルを、種類ごとに全部並べる。
// 定義は boards.ts の表をそのまま引く（ゲームの局面には依存しない）
import { ADV_SKILLS, FINAL_TILES, MILESTONE_LABEL, SKILLS, SPECIAL_TILES, SUPPORT_NORMAL, SUPPORT_PASS, skillDef } from '../../game/boards';
import { Icons, effToks, type Tok } from '../icons/EffIcons';
import { finalToks, milestoneToks, skillToks, supportToks } from '../icons/specs';

export type TileKind = 'milestone' | 'final' | 'support' | 'skill' | 'advSkill' | 'special';

export const TILE_TABS: [TileKind, string][] = [
  ['milestone', 'マイルストーン'],
  ['final', '最終得点計算'],
  ['support', 'ラウンド支援'],
  ['advSkill', '上級スキル'],
  ['skill', 'スキル'],
  ['special', '特殊地形'],
];

const SKILL_KIND = { instant: '即時', pass: 'パス時', flip: 'フリップ', perm: '永続' } as const;
const SUPPORT_KIND = { income: '収入時', perm: 'このラウンドの間', pass: 'パス時' } as const;

interface Row {
  key: string;
  no: string;
  toks: Tok[];
  kind?: string;
  text: string;
  note?: string;
}

/** 種類ごとの説明（場への出方）と並べる行 */
function rowsOf(kind: TileKind): { lead: string; rows: Row[] } {
  switch (kind) {
    case 'milestone':
      return {
        lead: '6種類（1〜6）からランダムに5種類が出て、それぞれ a面か b面のどちらかになります。先に条件を満たした人が10勝利点を得ます。',
        rows: [1, 2, 3, 4, 5, 6].flatMap((n) =>
          (['a', 'b'] as const).map((side) => {
            const key = `${n}${side}`;
            return { key, no: key, toks: milestoneToks(key), text: MILESTONE_LABEL[key] };
          }),
        ),
      };
    case 'final':
      return {
        lead: '4枚からランダムに2枚が出ます。ゲームの終わりに、1位が15勝利点、2位が7勝利点を得ます（仮想プレイヤーの値と比べる）。',
        rows: FINAL_TILES.map((f) => ({ key: String(f.id), no: String(f.id), toks: finalToks(f.id), text: f.label, note: `仮想プレイヤー ${f.neutral}` })),
      };
    case 'support':
      return {
        lead: '通常のタイル15枚とパス時タイル5枚をそれぞれ混ぜ、人数で決まる列に並べます。',
        rows: [...SUPPORT_NORMAL, ...SUPPORT_PASS].map((d) => ({ key: String(d.id), no: d.id > 100 ? `P${d.id - 100}` : String(d.id), toks: supportToks(d.id), kind: SUPPORT_KIND[d.kind], text: d.label })),
      };
    case 'advSkill':
      return {
        lead: 'ヴァリアント「上級スキルタイル」を採用したときだけ使います。14枚からランダムに「人数＋1」枚（1人のときは3枚）が出ます。',
        rows: ADV_SKILLS.flatMap((d) => {
          const row: Row = { key: String(d.id), no: String(d.id), toks: skillToks(d.id, true), kind: SKILL_KIND[d.kind], text: d.label };
          const buffed = skillDef(d.id, true, true);
          if (buffed === d) return [row];
          return [row, { key: `${d.id}b`, no: `${d.id}`, toks: skillToks(d.id, true, true), kind: SKILL_KIND[buffed.kind], text: buffed.label, note: 'キャラクターの上方修正を採用したとき' }];
        }),
      };
    case 'skill':
      return {
        lead: '12種類が各3枚ずつ、毎回すべて並びます（ランダムには選ばれません）。',
        rows: SKILLS.map((d) => ({ key: String(d.id), no: String(d.id), toks: skillToks(d.id), kind: SKILL_KIND[d.kind], text: d.label })),
      };
    case 'special':
      return {
        lead: '6枚すべてが共通サプライに並び、地図の特殊ヘクスに置きます。裏返したときに次の効果を得ます。',
        rows: Object.entries(SPECIAL_TILES).map(([id, t]) => ({ key: id, no: id, toks: effToks(t.eff), text: t.label })),
      };
  }
}

export function TileCatalog({ kind }: { kind: TileKind }) {
  const { lead, rows } = rowsOf(kind);
  return (
    <div className="tile-catalog">
      <p className="hint">{lead}</p>
      <ul className="tc-list">
        {rows.map((r) => (
          <li key={r.key} className={r.note ? 'tc-variant' : ''}>
            <span className="tc-no">{r.no}</span>
            <span className="tc-icons">
              <Icons toks={r.toks} size={16} />
            </span>
            <span className="tc-text">
              {r.kind && <span className="tc-kind">{r.kind}</span>}
              {r.text}
              {r.note && <span className="tc-note">（{r.note}）</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
