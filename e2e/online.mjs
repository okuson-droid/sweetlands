// オンライン対戦の受け入れ検査：プレイヤーごとに別のページ（別の利用者 ID）を開き、
// 代わりの共有データベース（?fakedb=1、同じブラウザの localStorage）越しに、盤面の所作だけで1局を打ち切る。
// 確かめること：全員の画面の盤面が一致する／自分の番でない人は操作できない／他人の手札の中身が DOM に出ない／エラーがない。
// 使い方: node e2e/online.mjs <players> <seed> [maxSteps] [variants]
//   variants はロビーで入れるヴァリアントのチェックの文言をカンマ区切りで（例：手札のドラフト）。
//   手札のドラフトでは全員が同時に選ぶため、操作できる人が複数いてよく、そのうちの1人をランダムに動かす。
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , playersArg = '3', seedArg = '1', maxArg = '4000', variantsArg = ''] = process.argv;
const n = Number(playersArg);
const base = `${pathToFileURL(path.resolve('dist/index.html'))}?noanim=1&fakedb=1`;
let rng = Number(seedArg) * 2654435761 >>> 0;
const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const errors = [];
const pages = [];
for (let i = 0; i < n; i++) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`p${i}: ${e}`));
  await p.goto(`${base}&uid=user${i}`);
  pages.push(p);
}
const [host, ...others] = pages;
await host.evaluate(() => localStorage.removeItem('sweetlands.fakedb.games/current'));

// ---- ロビー：作る → 席に座る → 開始 ----
for (const p of pages) await p.click('text=オンライン対戦へ');
await host.selectOption('.lobby-card select', String(n));
for (const v of variantsArg.split(',').filter(Boolean)) await host.click(`label:has-text("${v}") input[type=checkbox]`);
await host.click('button:has-text("ゲームを作る")');
for (const p of others) {
  await p.waitForSelector('button:has-text("この席に座る")');
  await p.click('button:has-text("この席に座る")');
  await p.waitForTimeout(150);
}
await host.waitForSelector('button:has-text("ゲームを始める"):not([disabled])');
await host.click('button:has-text("ゲームを始める")');
for (const p of pages) await p.waitForFunction(() => window.__sl, null, { timeout: 5000 });

async function visibleLit(p, sel) {
  const out = [];
  for (const e of await p.$$(sel)) if (await e.isVisible()) out.push(e);
  return out;
}
async function center(e) {
  const b = await e.boundingBox();
  return b && b.width > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
}

const mismatches = [];
const leaks = [];
const wrongActive = [];
let steps = 0;
let concurrentSteps = 0;
let stuck = 0;
let last = -1;
while (steps < Number(maxArg)) {
  steps++;
  const sls = await Promise.all(pages.map((p) => p.evaluate(() => window.__sl)));
  if (sls.every((x) => x.finished)) break;
  // 全員の画面が同じ手数に追いついたら、盤面の指紋を比べる
  if (sls.every((x) => x.moves === sls[0].moves) && sls.some((x) => x.digest !== sls[0].digest)) mismatches.push(`${sls[0].moves}`);
  // 他人の手札の中身が DOM にないこと
  for (let i = 0; i < n; i++) {
    const bad = await pages[i].evaluate(() => window.__sl.otherHands.filter((id) => document.querySelector(`[data-src="card:${id}"]`)));
    if (bad.length) leaks.push(`p${i}@${sls[i].moves}: ${bad.join(',')}`);
  }
  // いま操作できる人（自分の選択待ちで、使える手がある）は1人だけ
  const actors = sls.map((x, i) => (x.sources.length ? i : -1)).filter((i) => i >= 0);
  const simultaneous = sls.some((x) => x.waiting);
  if (actors.length > 1 && !(simultaneous && actors.every((i) => sls[i].waiting?.includes(sls[i].viewer)))) wrongActive.push(`${sls[0].moves}: ${actors.join(',')}`);
  if (simultaneous) concurrentSteps++;
  const maxMoves = Math.max(...sls.map((x) => x.moves));
  if (maxMoves === last) stuck++;
  else (stuck = 0), (last = maxMoves);
  if (stuck > 80) {
    console.log('STUCK', JSON.stringify(sls.map((x) => [x.step, x.moves, x.sources.length])));
    break;
  }
  // 選択待ちの人のページで、盤面の所作を1つ行う（autoplay.mjs と同じ選び方）
  const i = simultaneous && actors.length ? pick(actors) : sls.findIndex((x) => x.viewer === Number(JSON.parse(x.digest)[2]));
  const p = pages[i >= 0 ? i : 0];
  const confirmBtn = await visibleLit(p, '.modal-back .modal .btn.primary');
  if (confirmBtn.length && !(await p.$('.modal-back.setup'))) {
    await p.mouse.click(...Object.values(await center(confirmBtn[0])));
    continue;
  }
  const tabs = await visibleLit(p, '.draft-tabs .btn:not([disabled]):not(.on)');
  if (tabs.length && rand() < 0.5) await tabs[0].click();
  const hints = await visibleLit(p, '.fold.hint:not(.open) .fold-head');
  if (hints.length && rand() < 0.3) await hints[0].click();
  const dests = await visibleLit(p, '[data-dest].lit');
  const srcs = await visibleLit(p, '[data-src].lit');
  const buttons = await visibleLit(p, '.band .actions .btn:not([disabled])');
  const texts = await Promise.all(buttons.map((b) => b.innerText()));
  const nonPass = buttons.filter((_, k) => !['パス', '取り消し', 'コピーをやめる'].includes(texts[k]));
  const r = rand();
  let did = false;
  if (srcs.length && (r < 0.75 || (!dests.length && !nonPass.length))) {
    const c = await center(pick(srcs));
    if (c) {
      await p.mouse.move(c.x, c.y);
      await p.mouse.down();
      await p.mouse.move(c.x + 12, c.y - 12, { steps: 2 });
      await p.waitForTimeout(20);
      const ds = await visibleLit(p, '[data-dest].lit');
      if (ds.length) {
        const t = await center(pick(ds));
        if (t) await p.mouse.move(t.x, t.y, { steps: 4 });
      }
      await p.mouse.up();
      did = true;
    }
  } else if (dests.length && (r < 0.97 || !buttons.length)) {
    const c = await center(pick(dests));
    if (c) (await p.mouse.click(c.x, c.y)), (did = true);
  }
  if (!did) {
    const pool = nonPass.length && rand() < 0.85 ? nonPass : buttons.filter((_, k) => texts[k] !== '取り消し');
    if (pool.length) {
      const c = await center(pick(pool));
      if (c) await p.mouse.click(c.x, c.y);
    }
  }
  await p.waitForTimeout(30);
}
await new Promise((r) => setTimeout(r, 500));
const fin = await Promise.all(pages.map((p) => p.evaluate(() => window.__sl)));
const same = fin.every((x) => x.digest === fin[0].digest && x.moves === fin[0].moves);
console.log(JSON.stringify({ players: n, seed: seedArg, steps, moves: fin.map((x) => x.moves), finished: fin.map((x) => x.finished), sameAtEnd: same, concurrentSteps, mismatches: mismatches.slice(0, 3), wrongActive: wrongActive.slice(0, 3), leaks: leaks.slice(0, 3), errors: errors.slice(0, 3) }));
await browser.close();
