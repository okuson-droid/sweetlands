// フリップを使わずにパスするときの確認（docs/decisions_13 §13.27）
import { describe, expect, it } from 'vitest';
import { getOptions, withEffects } from '../src/game/engine';
import { buildAffordances, passConfirm } from '../src/ui/gestures';
import { setupGame } from './helpers';

function turnWithSkill(flipped: boolean | null) {
  const s = structuredClone(setupGame(2));
  const seat = s.pending!.player;
  // スキルタイル8（フリップ：ダイヤ1）を持たせる
  if (flipped !== null) s.players[seat].skills.push({ id: 8, adv: false, flipped });
  return withEffects(s, seat, []);
}

describe('パスの確認', () => {
  it('使えるフリップがあれば、その名前を添えて知らせる', () => {
    const s = turnWithSkill(false);
    expect(getOptions(s).some((o) => o.id === 'flip:s8')).toBe(true);
    expect(passConfirm(s)).toContain('まだ使えるフリップ「ダイヤ1」があります');
    const pass = buildAffordances(s).buttons.find((b) => b.role === 'pass');
    expect(pass?.move.confirm).toContain('まだ使えるフリップ');
  });

  it('フリップがない・使い終えたときは、ふつうのパスの確認', () => {
    for (const s of [turnWithSkill(null), turnWithSkill(true)]) {
      expect(getOptions(s).some((o) => o.id.startsWith('flip:'))).toBe(false);
      expect(passConfirm(s)).toBe('パスすると、このラウンドはもう手番がありません。パスしますか');
    }
  });
});
