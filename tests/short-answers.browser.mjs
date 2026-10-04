// Short final replies cannot scroll every question up to the activation rail.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { navigatorFixture } from './navigator-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const id = '11111111-1111-1111-1111-111111111111';
const browser = await chromium.launch({ headless: true });
try {
  for (const variant of ['chatgpt', 'dots', 'gemini', 'reverse', 'no-overflow']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const host = variant === 'gemini' ? 'gemini.google.com' : 'chatgpt.com';
    const route = variant === 'gemini' ? '/u/2/app/1111111111111111' : variant === 'dots' ? '/dots/' + id : '/c/' + id;
    const rows = Array.from({ length: 5 }, (_, i) => variant === 'dots'
      ? `<article class="message-row self" data-message-id="u${i}"><div class="message-body"><div class="message-text">Question ${i}</div></div></article><article class="message-row" data-message-id="a${i}"><div class="message-body"><div class="message-text">Short answer ${i}</div></div></article>`
      : variant === 'gemini'
      ? `<div class="conversation-container" id="turn-${i}"><user-query><p class="query-text-line">Question ${i}</p></user-query><model-response><message-content><div class="markdown">Short answer ${i}</div></message-content></model-response></div>`
      : `<article data-turn="user"><div data-message-author-role="user" data-message-id="u${i}">Question ${i}</div></article><article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a${i}"><div class="markdown">Short answer ${i}</div></div></article>`).join('');
    const html = `<!doctype html><style>body{margin:0}#scroll{margin-top:90px;height:800px;overflow:auto;${variant === 'reverse' ? 'display:flex;flex-direction:column-reverse' : ''}}#scroll>div{flex:none}main{padding:0 40px 20px}#before{height:${variant === 'no-overflow' ? 0 : 1000}px}article,user-query,model-response{display:block;box-sizing:border-box;height:48px;margin:0}p{margin:0}</style><div id="scroll"><div><div id="before"></div><main class="thread-pane">${rows}</main></div></div>`;
    await page.route(`https://${host}/**`, route => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: 'text/html', body: html }) : route.fulfill({ status: 503, body: 'No history in fixture' }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`https://${host}${route}`);
    await page.evaluate(source);
    await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 5);
    const items = page.locator('#cgpt-toc .cn-item');
    const current = () => page.locator('#cgpt-toc .cn-item.active .cn-t').textContent();
    if (variant !== 'no-overflow') {
      await page.locator('#scroll').evaluate(n => n.scrollTop = 1e9);
      await page.waitForTimeout(80);
      assert.equal(await current(), 'Question 4', `${variant}: physical bottom highlights the last short reply`);
    }
    // Several targets all clamp to the same scroll position. Selection must
    // persist beyond the rapid-click window and the delayed position correction.
    for (const i of [3, 2, 4]) {
      await items.nth(i).click();
      await page.waitForTimeout(950);
      assert.equal(await current(), `Question ${i}`, `${variant}: clicked short question remains selected`);
      assert.equal(await items.nth(i).getAttribute('aria-current'), 'true', 'Screen readers identify the current question');
      assert.equal(await page.locator('#cgpt-toc [aria-current="true"]').count(), 1, 'Exactly one current question');
    }
    await items.nth(2).click();
    await page.waitForTimeout(950);
    const controls = page.locator('#cgpt-btns button');
    assert.equal(await controls.nth(2).getAttribute('aria-disabled'), 'false', 'Later questions remain navigable even when scrolling is clamped');
    await controls.nth(2).click();
    await page.waitForTimeout(950);
    assert.equal(await current(), 'Question 3');
    await controls.nth(1).click();
    await page.waitForTimeout(950);
    assert.equal(await current(), 'Question 2');
    if (variant !== 'no-overflow') {
      // User intent wins over the pending 250 ms positioning correction.
      await items.nth(2).click();
      await page.locator('#scroll').hover();
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(400);
      assert.equal(await current(), 'Question 4', 'Manual scrolling releases the clicked selection, including at the existing bottom');
      await page.locator('#scroll').evaluate(n => n.scrollTop = getComputedStyle(n).flexDirection === 'column-reverse' ? -1e9 : 0);
      await page.waitForTimeout(100);
      assert.equal(await current(), 'Question 0', 'Scrolling up restores position-driven highlighting');
    } else {
      await controls.first().click();
      await page.waitForTimeout(400);
      assert.equal(await current(), 'Question 0', 'Start selects the first question when the entire conversation fits');
      await controls.last().click();
      await page.waitForTimeout(400);
      assert.equal(await current(), 'Question 4', 'End selects the last question when no scrolling is possible');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${variant}, short answers, clamped clicks, delayed Prev/Next and manual scroll release`);
    await page.close();
  }
} finally { await browser.close(); }
