// 基礎資源の内訳の入力（初期値は0）を、人のように＋／−を押して合わせる（autoplay・online で共用）。
// 候補の内訳（window.__sl.splits）のうち、いまの値にいちばん近いものへ1つ近づける。
// 押したら true、内訳の入力がないか、すでに決定を押せるなら false を返す
export async function stepSplit(page, rand, tapAt) {
  const idx = await page.evaluate((r) => {
    const panel = document.querySelector('.band .declare');
    const ok = panel?.querySelector('.btn.primary');
    const splits = window.__sl?.splits ?? [];
    if (!panel || !ok || !ok.disabled || !splits.length || !panel.querySelector('.stepper')) return -1;
    const keys = ['wheat', 'wood', 'iron'];
    const cur = [...panel.querySelectorAll('.stepper b')].map((b) => Number(b.textContent));
    const dist = (sp) => keys.reduce((a, k, i) => a + Math.abs((sp[k] ?? 0) - cur[i]), 0);
    const best = Math.min(...splits.map(dist));
    const near = splits.filter((sp) => dist(sp) === best);
    const goal = near[Math.floor(r * near.length)];
    const moves = keys.flatMap((k, i) => ((goal[k] ?? 0) > cur[i] ? [i * 2 + 1] : (goal[k] ?? 0) < cur[i] ? [i * 2] : []));
    return moves.length ? moves[Math.floor(r * 7919) % moves.length] : -1; // 各 .stepper の button は −、＋ の順
  }, rand());
  if (idx < 0) return false;
  const btn = (await page.$$('.band .declare .stepper button'))[idx];
  const b = btn && (await btn.boundingBox());
  if (!b) return false;
  await tapAt({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  return true;
}
