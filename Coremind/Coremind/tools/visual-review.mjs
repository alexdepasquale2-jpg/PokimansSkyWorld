import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.env.TEMP || 'C:/Users/Albert/desktop/coremind', 'coremind-review');
mkdirSync(OUT, { recursive: true });
const URL = 'http://127.0.0.1:8765/index.html';

async function shot(page, name) {
  const path = join(OUT, name);
  await page.screenshot({ path, fullPage: false });
  console.log('SHOT', path);
}

async function runViewport(browser, { w, h, tag, mobile }) {
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: !!mobile,
    hasTouch: !!mobile,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', tag, e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#boot-overlay', { timeout: 15000 });
  await page.waitForTimeout(400);

  // #guide-hole is a gold frame only — no 9999px full-screen dimmer in page CSS.
  const has9999 = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (_) { continue; }
      for (const rule of rules) {
        if (rule.cssText && /9999px/.test(rule.cssText)) return true;
      }
    }
    return false;
  });
  if (has9999) throw new Error(`${tag}: page CSS still contains 9999px dimmer`);
  console.log('OK', tag, 'no 9999px in page CSS');

  await shot(page, `${tag}-01-boot.png`);

  await page.click('#btn-new-world');
  await page.waitForSelector('#boot-overlay.hidden, #boot-overlay[class*="hidden"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, `${tag}-02-newgame.png`);

  // Click GATHER if visible
  const gather = page.locator('[data-directive="GATHER"]');
  if (await gather.count()) {
    await gather.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${tag}-03-gather.png`);
  }

  // Open ANALYZE
  const analyze = page.locator('[data-tab="analyze"]');
  if (await analyze.count()) {
    await analyze.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${tag}-04-analyze.png`);
  }

  // Open WORLD
  const world = page.locator('[data-tab="world"]');
  if (await world.count()) {
    await world.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, `${tag}-05-world.png`);
  }

  // Open BUILD
  const explore = page.locator('[data-tab="explore"]');
  if (await explore.count()) await explore.click({ force: true }).catch(() => {});
  const build = page.locator('#btn-open-build');
  if (await build.count()) {
    await build.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, `${tag}-06-build.png`);
  }

  await context.close();
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
});
try {
  await runViewport(browser, { w: 1366, h: 768, tag: 'pc', mobile: false });
  await runViewport(browser, { w: 390, h: 844, tag: 'phone', mobile: true });
} finally {
  await browser.close();
}
console.log('DONE', OUT);
