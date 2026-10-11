import { chromium } from '@playwright/test';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await p.goto(`file://${process.cwd()}/dist/index.html?auto=1&noanim=1&players=3&seed=3`);
await p.waitForTimeout(500);
console.log(await p.evaluate(() => [...document.querySelector('.game').children].map(e => `${e.className} ${Math.round(e.getBoundingClientRect().top)} ${Math.round(e.getBoundingClientRect().height)}`).join('\n')));
await b.close();
