// チュートリアルの受け入れ検査（docs/decisions_13 §13.24）：ロビーからチュートリアルを開き、光っている場所と吹き出しのボタンだけを
// 操作して台本を最後まで進め、「続きを自由に遊ぶ」でふつうの対局に移れることを確かめる。
// 使い方: node e2e/tutorial.mjs [mouse|portrait] [shotDir]（要ビルド）
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , mode = 'mouse', shotDir = ''] = process.argv;
const touch = mode !== 'mouse';
const viewport = touch ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: touch });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(`${pathToFileURL(path.resolve('dist/index.html'))}?noanim=1`);
await page.click('text=チュートリアルを始める');
await page.waitForFunction(() => window.__sl);

async function visible(sel) {
  const out = [];
  for (const e of await page.$$(sel)) if (await e.isVisible()) out.push(e);
  return out;
}
// 要素の見えている点（重なった手札のように、真ん中がほかの要素に隠れていることがあるため、上に出ている点を探す）
async function center(el) {
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (!b || b.width < 1) return null;
  const p = await el.evaluate((e, bb) => {
    for (const fy of [0.5, 0.3, 0.7, 0.15]) {
      for (const fx of [0.5, 0.25, 0.1, 0.75, 0.9]) {
        const x = bb.x + bb.width * fx, y = bb.y + bb.height * fy;
        const t = document.elementFromPoint(x, y);
        if (t && e.contains(t)) return { x, y };
      }
    }
    return null;
  }, b);
  return p ?? { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function tap(el) {
  const p = await center(el);
  if (!p) return false;
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  return true;
}
const count = () => page.evaluate(() => document.querySelector('.tb-count')?.textContent ?? '');

// 置き先・押せる対象。地図のヘクスと辺（SVG）は、光ると中の図形に lit-svg が付く
const LIT_DEST = '[data-dest].lit, [data-dest]:has(> .lit-svg)';
const visited = [];
let lastCount = '';
let stuck = 0;
for (let n = 0; n < 400; n++) {
  const c = await count();
  if (c !== lastCount) {
    visited.push(c);
    lastCount = c;
    stuck = 0;
    if (shotDir) await page.screenshot({ path: `${shotDir}/tutorial-${mode}-${c.split('/')[0].trim()}.png` });
  } else if (++stuck > 40) {
    console.log('STUCK', await page.evaluate((LIT_DEST) => JSON.stringify({ srcs: [...document.querySelectorAll('[data-src].lit')].map((e) => e.getAttribute('data-src')), dests: [...document.querySelectorAll(LIT_DEST)].map((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e.getAttribute('data-dest') + '@' + Math.round(r.x) + ',' + Math.round(r.y) + ' top=' + (t?.closest('[data-dest]')?.getAttribute('data-dest') ?? t?.className?.baseVal ?? t?.className); }), miss: !!document.querySelector('.tb-miss'), sources: window.__sl.sources }), LIT_DEST));
    break;
  }
  if ((await visible('.tutorial-bubble button:text("続きを自由に遊ぶ")')).length) break;
  // 確認の小窓（準備の選択の確認・カードを引く確認）
  const ok = (await visible('.modal-back.confirm .modal .btn.primary')).concat(await page.$('.modal-back.setup') ? [] : await visible('.modal-back .modal .btn.primary'));
  if (ok.length) {
    await tap(ok[0]);
    continue;
  }
  const nextBtn = await visible('.tutorial-bubble button:text("次へ")');
  if (nextBtn.length) {
    await tap(nextBtn[0]);
    continue;
  }
  const dests = await visible(LIT_DEST);
  const srcs = await visible('[data-src].lit');
  if (srcs.length) {
    const p = await center(srcs[0]);
    if (touch) {
      await page.touchscreen.tap(p.x, p.y);
      await page.waitForTimeout(40);
      const ds = await visible(LIT_DEST);
      if (ds.length) await tap(ds[0]);
    } else {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 12, p.y - 12, { steps: 2 });
      await page.waitForTimeout(30);
      const ds = await visible(LIT_DEST);
      if (ds.length) {
        const q = await center(ds[0]);
        await page.mouse.move(q.x, q.y, { steps: 4 });
      }
      await page.mouse.up();
    }
  } else if (dests.length) {
    await tap(dests[0]);
  } else {
    const btns = await visible('.band .actions .btn:not([disabled]):not(.order-toggle)');
    if (btns.length) await tap(btns[0]);
    else {
      // スマートフォン：対象のある面のタブへ
      const tabs = await visible('.mtabs button.wants, .mside-tabs button.wants, .msheet-head.wants');
      if (tabs.length) await tap(tabs[0]);
    }
  }
  await page.waitForTimeout(60);
}

const done = (await visible('.tutorial-bubble button:text("続きを自由に遊ぶ")')).length > 0;
let freeplay = null;
if (done) {
  await (await visible('.tutorial-bubble button:text("続きを自由に遊ぶ")'))[0].click();
  await page.waitForTimeout(500);
  freeplay = await page.evaluate(() => ({ bubble: !!document.querySelector('.tutorial-bubble'), step: window.__sl?.step, moves: window.__sl?.moves, sources: window.__sl?.sources.length }));
}
console.log(JSON.stringify({ mode, done, steps: visited.length, last: lastCount, freeplay, errors: errors.slice(0, 3) }));
await browser.close();
process.exit(done && freeplay && !freeplay.bubble && freeplay.step === 'turn' && freeplay.sources > 1 && !errors.length ? 0 : 1);
