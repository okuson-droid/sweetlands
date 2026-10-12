// 受け入れ検査（ui_design §16）：盤面の所作だけで1局を打ち切る自動プレイヤー
// 使い方: node e2e/autoplay.mjs mouse|touch <seed> <players> [maxSteps] [shotDir]
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [, , mode = "mouse", seedArg = "1", playersArg = "3", maxArg = "6000", shotDir = "", variants = "0"] = process.argv;
const touch = mode === 'touch';
const viewport = touch ? { width: 800, height: 360 } : { width: 1280, height: 720 };
const url = `${pathToFileURL(path.resolve('dist/index.html'))}?auto=1&noanim=1&players=${playersArg}&seed=${seedArg}&v=${variants}`;

let rng = Number(seedArg) * 2654435761 >>> 0;
const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport, hasTouch: touch, isMobile: false });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sl);

const fallbacks = new Set();
const unreachable = new Set();
const overflow = [];
const leaks = [];
let steps = 0;
let last = -1;
let stuck = 0;

async function center(el) {
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const b = await el.boundingBox();
  if (!b || b.width < 1 || b.height < 1) return null;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function tapAt(p) {
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function visibleLit(sel) {
  const els = await page.$$(sel);
  const out = [];
  for (const e of els) if (await e.isVisible()) out.push(e);
  return out;
}

async function checkLayout() {
  // はみ出し検査：ページ全体に横スクロールが出ていないこと
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  if (o.sw > o.cw + 1 || o.sh > o.ch + 1) {
    const culprits = await page.evaluate(() => {
      const H = document.documentElement.clientHeight, W = document.documentElement.clientWidth;
      return [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return (r.bottom > H + 1 || r.right > W + 1) && getComputedStyle(e).position !== 'fixed'; }).slice(0, 4).map((e) => `${e.tagName}.${e.className?.baseVal ?? e.className} b=${Math.round(e.getBoundingClientRect().bottom)} r=${Math.round(e.getBoundingClientRect().right)}`);
    });
    overflow.push(`${steps}: ${JSON.stringify(o)} ${culprits.join(' | ')}`);
  }
}

async function checkHidden() {
  // 他人の手札の中身が DOM にないこと（§2-6）
  const bad = await page.evaluate(() => {
    const ids = window.__sl.otherHands;
    return ids.filter((id) => document.querySelector(`[data-src="card:${id}"]`));
  });
  if (bad.length) leaks.push(`${steps}: ${bad.join(',')}`);
}

while (steps < Number(maxArg)) {
  const sl = await page.evaluate(() => window.__sl);
  if (!sl || sl.finished) break;
  sl.fallback.forEach((f) => fallbacks.add(f));
  if (sl.moves === last) stuck++;
  else (stuck = 0), (last = sl.moves);
  if (stuck > 60) {
    require_fs: {
      const rec = await page.evaluate(() => localStorage.getItem('sweetlands.local.v1'));
      (await import('node:fs')).writeFileSync('/tmp/claude-0/stuck-record.json', rec ?? '');
    }
    console.log('STUCK at', sl.step, await page.evaluate(() => JSON.stringify({ tabs: [...document.querySelectorAll('.vtabs button')].map((b) => b.className + ':' + b.textContent), lit: document.querySelectorAll('.lit').length, srcs: [...document.querySelectorAll('[data-src]')].length, held: document.querySelectorAll('.held').length })));
    if (shotDir) await page.screenshot({ path: `${shotDir}/stuck-${mode}.png` });
    break;
  }
  steps++;
  if (steps % 200 === 0) console.log('progress', steps, sl.moves, sl.step);
  if (steps % 40 === 1) {
    await checkLayout();
    await checkHidden();
  }
  // 横長レイアウト（ui_design §21）：使える手が、見えている要素か「●印のついた展開ボタン」の中にあること
  if (!touch && sl.sources.length) {
    // 合法手の一覧と画面を同じ瞬間に読む。一覧は描画の直後に更新されるため、その隙間の取り違えを避けて、
    // 手が進まないまま 150ms あけた2回の読み取りで、どちらでも見つからない手だけを記録する
    const probe = () => page.evaluate(() => {
      const keys = window.__sl.sources;
      const shown = (k) => [...document.querySelectorAll(`[data-src="${k}"],[data-dest="${k}"]`)].some((e) => e.getClientRects().length > 0);
      // 畳んだ中にある手は、それを収めた展開ボタンに●印が出ていればよい
      const home = (k) => (k.startsWith('free:') ? 'free' : k.startsWith('skillpile:') || k.startsWith('advskill:') ? 'skills' : k.startsWith('tableau:') ? 'tableau' : null);
      // 準備のドラフト（rules v1.1 §10.5）：別のタブにある手は、そのタブが押せればよい
      const tabOf = (k) => (k.startsWith('setupChar:') ? 'char' : k.startsWith('setupMap:') ? 'map' : k.startsWith('support:') ? 'support' : null);
      const onTab = (k) => tabOf(k) !== null && document.querySelector(`.draft-tabs [data-kind="${tabOf(k)}"]:not([disabled])`) !== null;
      const hinted = (k) => onTab(k) || (home(k) !== null && document.querySelector(`.fold.hint[data-fold="${home(k)}"]`) !== null);
      return { moves: window.__sl.moves, lost: keys.filter((k) => !shown(k) && !hinted(k)).map((k) => `${window.__sl.step}:${k}`) };
    });
    let lost = [];
    const first = await probe();
    if (first.lost.length) {
      await page.waitForTimeout(150);
      const second = await probe();
      if (second.moves === first.moves) lost = first.lost.filter((k) => second.lost.includes(k));
    }
    lost.forEach((k) => unreachable.add(k));
    // 準備のドラフトでは、ときどき別のタブに切り替える（人と同じく、どの種類を選ぶかを替える）
    const draftTabs = await visibleLit('.draft-tabs .btn:not([disabled]):not(.on)');
    if (draftTabs.length && rand() < 0.5) {
      await tapAt(await center(pick(draftTabs)));
      await page.waitForTimeout(30);
    }
    // ●印のついた展開ボタンを、ときどき人のように開く
    const hintHeads = await visibleLit('.fold.hint:not(.open) .fold-head');
    if (hintHeads.length && rand() < 0.3) {
      await tapAt(await center(pick(hintHeads)));
      await page.waitForTimeout(30);
    }
  }
  if (shotDir && steps % 150 === 1) await page.screenshot({ path: `${shotDir}/${mode}-${steps}.png` });

  // 確認ダイアログ
  const confirmBtn = await visibleLit('.modal-back .modal .btn.primary');
  if (confirmBtn.length && !(await page.$('.modal-back.setup'))) {
    const settingsOpen = await page.$('.modal h2:text("設定")');
    if (!settingsOpen) {
      await tapAt(await center(confirmBtn[0]));
      continue;
    }
  }
  const dests = await visibleLit('[data-dest].lit');
  const srcs = await visibleLit('[data-src].lit');
  const buttons = (await visibleLit('.band .actions .btn:not([disabled])')).filter(Boolean);
  const btnTexts = await Promise.all(buttons.map((b) => b.innerText()));
  const nonPass = buttons.filter((_, i) => !['パス', '取り消し', 'コピーをやめる'].includes(btnTexts[i]));
  const passBtn = buttons.filter((_, i) => btnTexts[i] === 'パス');

  const r = rand();
  let did = false;
  if (srcs.length && (r < 0.75 || (!dests.length && !nonPass.length))) {
    const el = pick(srcs);
    const p = await center(el);
    if (p) {
      if (touch) {
        await page.touchscreen.tap(p.x, p.y); // タップで持ち上げる
        await page.waitForTimeout(30);
        let ds = await visibleLit('[data-dest].lit');
        if (!ds.length) {
          const tabs = await visibleLit('.vtabs button.wants');
          if (tabs.length) {
            await page.touchscreen.tap(...Object.values(await center(tabs[0])));
            await page.waitForTimeout(30);
            ds = await visibleLit('[data-dest].lit');
          }
        }
        if (ds.length) {
          const q = await center(pick(ds));
          if (q) await page.touchscreen.tap(q.x, q.y);
        } else {
          await page.keyboard.press('Escape');
        }
      } else {
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await page.mouse.move(p.x + 12, p.y - 12, { steps: 2 }); // ドラッグ開始
        await page.waitForTimeout(20);
        const ds = await visibleLit('[data-dest].lit');
        if (ds.length) {
          const target = pick(ds);
          const b = await target.boundingBox();
          if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
        }
        await page.mouse.up();
      }
      did = true;
    }
  } else if (dests.length && (r < 0.97 || !passBtn.length)) {
    const p = await center(pick(dests));
    if (p) {
      await tapAt(p);
      did = true;
    }
  }
  if (!did) {
    const pool = nonPass.length && rand() < 0.85 ? nonPass : buttons.filter((_, i) => btnTexts[i] !== '取り消し');
    if (pool.length) {
      const p = await center(pick(pool));
      if (p) await tapAt(p);
    } else {
      // 狭い画面：対象のある側へ切り替える
      const tabs = await visibleLit('.vtabs button.wants');
      if (tabs.length) await tapAt(await center(tabs[0]));
    }
  }
}

const sl = await page.evaluate(() => window.__sl);
if (shotDir) await page.screenshot({ path: `${shotDir}/end-${mode}.png` });
console.log(JSON.stringify({ mode, seed: seedArg, players: playersArg, steps, moves: sl?.moves, finished: sl?.finished, step: sl?.step, fallbacks: [...fallbacks], unreachable: [...unreachable].slice(0, 5), overflow: overflow.slice(0, 3), leaks: leaks.slice(0, 3), errors: errors.slice(0, 3) }));
await browser.close();
