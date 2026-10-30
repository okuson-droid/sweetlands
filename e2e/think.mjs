// 思考時間の検査（docs/decisions_13 §13.19）：偽 DB で2画面をつなぎ、自分の書き込みが戻るのを遅らせた（fakelag）うえで、
// 最初の選択待ちで待った時間が、共有ドキュメントの think に残ることを確かめる。
// 使い方: node e2e/think.mjs [lagMs]（要ビルド）
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const lag = Number(process.argv[2] ?? 400);
const WAIT = 3000;
const base = `${pathToFileURL(path.resolve('dist/index.html'))}?noanim=1&fakedb=1&fakelag=${lag}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const pages = [];
for (let i = 0; i < 2; i++) {
  const p = await ctx.newPage();
  await p.goto(`${base}&uid=user${i}`);
  pages.push(p);
}
const [host, guest] = pages;
await host.evaluate(() => localStorage.removeItem('sweetlands.fakedb.games/current'));
for (const p of pages) await p.click('text=オンライン対戦へ');
await host.selectOption('.lobby-card select', '2');
await host.click('button:has-text("ゲームを作る")');
await guest.waitForSelector('button:has-text("この席に座る")');
await guest.click('button:has-text("この席に座る")');
await host.waitForSelector('button:has-text("ゲームを始める"):not([disabled])');
await host.click('button:has-text("ゲームを始める")');
for (const p of pages) await p.waitForFunction(() => window.__sl, null, { timeout: 5000 });

// 最初の選択待ちの人が WAIT ミリ秒考えてから選び、確認の小窓に答える。選んだ直後は自動の回答などで続けて書き込むことがある
await host.waitForTimeout(WAIT);
let act = null;
for (const p of pages) if ((await p.$$('[data-src].lit, [data-dest].lit')).length) act = p;
const seat = await act.evaluate(() => window.__sl.viewer);
await (await act.$$('[data-src].lit, [data-dest].lit'))[0].click({ force: true });
await act.waitForTimeout(100);
const ok = await act.$('.modal-back.confirm .btn.primary');
if (ok) await ok.click();
// 戻りが遅れている間に、同じ人がもう1手打つ（続けて選ぶ場面を真似る）
await act.waitForTimeout(50);
const more = (await act.$$('[data-src].lit, [data-dest].lit'))[0];
if (more) {
  await more.click({ force: true });
  await act.waitForTimeout(100);
  const ok2 = await act.$('.modal-back.confirm .btn.primary');
  if (ok2) await ok2.click();
}
await host.waitForTimeout(lag + 1000);
const doc = await host.evaluate(() => JSON.parse(localStorage.getItem('sweetlands.fakedb.games/current')));
const t = doc.think?.[seat] ?? 0;
console.log(JSON.stringify({ lag, seat, moves: doc.moves.length, think: doc.think, ok: t >= WAIT - 200 }));
await browser.close();
process.exit(t >= WAIT - 200 ? 0 : 1);
