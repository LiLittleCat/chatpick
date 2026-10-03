// Only explicit questions may enter the directory, including answer-only virtual windows.
import fs from 'node:fs';
import { navigatorFixture } from './navigator-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(process.env.CHATPICK_NAV_SOURCE || new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const id = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const question = (index, text) => `<div data-workflow-entry="${index}"><div class="group/user-bubble"><button aria-label="Edit query">Edit</button><button aria-label="Copy query">Copy</button><div data-renderer="lm"><p>${text}</p></div></div></div>`;
const answer = (text, title) => `<div data-workflow-final-text><div data-renderer="lm"><p>${text}</p><h2>${title}</h2><p>Answer details.</p></div></div>`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; let requests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://www.perplexity.ai/**', route => {
    if (!route.request().isNavigationRequest()) { requests++; return route.fulfill({status:503,body:'Unexpected request'}); }
    return route.fulfill({contentType:'text/html',body:`<style>body{margin:0;background:#161616;color:#dedede;font:14px Arial,sans-serif;--accent-fg-primary:#4e99a3;--surface-raised:#1d1d1d;--fg-primary:#dedede}#scroller{height:900px;overflow:auto}#feed{width:700px;padding:100px 40px 1200px}.w-full{min-height:300px}h2{margin-top:100px}</style><div id="scroller"><div id="feed" class="flex flex-col gap-2"><div class="w-full" id="question-slot">${question(0,'Explain window sizing')}</div><div class="w-full" id="answer-slot">${answer('This is an assistant answer, not a question.','Layout')}</div></div></div>`});
  });
  await page.goto(`https://www.perplexity.ai/search/${id}`);
  await page.evaluate(source);
  const items = page.locator('#cgpt-toc .cn-item');
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1);
  assert.deepEqual(await items.locator('.cn-t').allTextContents(), ['Explain window sizing']);
  // The provider temporarily unmounts questions while keeping the answer visible.
  await page.locator('#question-slot').evaluate(node => node.textContent = '');
  await page.waitForTimeout(650);
  assert.deepEqual(await items.locator('.cn-t').allTextContents(), ['Explain window sizing'], 'assistant text must never be cached as a question');
  await page.locator('#answer-slot').evaluate((node, markup) => node.innerHTML = markup, answer('A second assistant response without a mounted question.','Paint'));
  await page.waitForTimeout(650);
  assert.deepEqual(await items.locator('.cn-t').allTextContents(), ['Explain window sizing']);
  await page.locator('#question-slot').evaluate((node, markup) => node.innerHTML = markup, question(0,'Explain window sizing'));
  await page.waitForTimeout(450);
  assert.equal(await items.count(), 1, 'remounting must not duplicate the real question');
  await items.click();
  await page.waitForFunction(() => document.querySelector('#cgpt-sections')?.hidden === false);
  assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), ['Paint']);
  await page.locator('#cgpt-sections .cn-item').click();
  assert(Math.abs(await page.locator('#answer-slot h2').evaluate(node => node.getBoundingClientRect().top) - 72) < 2);
  // No question is visible at all during a SPA route transition.
  await page.evaluate(path => history.pushState({}, '', path), `/search/${other}`);
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 0);
  await page.locator('#feed').evaluate((node, markup) => node.innerHTML = `<div class="w-full">${markup}</div>`, answer('Another answer-only window.','Other answer'));
  await page.waitForTimeout(650);
  assert.equal(await items.count(), 0, 'answer-only initial state must not create a question');
  await page.locator('#feed').evaluate((node, markup) => node.innerHTML = markup, `<div class="w-full">${question(0,'Explain browser painting')}</div><div class="w-full">${answer('A response in the new conversation.','Paint stages')}</div>`);
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1);
  assert.deepEqual(await items.locator('.cn-t').allTextContents(), ['Explain browser painting']);
  await items.click();
  assert(Math.abs(await page.locator('[class~="group/user-bubble"]').evaluate(node => node.getBoundingClientRect().top) - 72) < 2);
  assert.equal(await page.evaluate(() => document.querySelector('#cgpt-nav-toast')?.textContent || ''), '');
  if (process.env.CHATPICK_SCREENSHOT) {
    await page.waitForFunction(() => document.querySelector('#cgpt-toc').getBoundingClientRect().width >= 275);
    await page.screenshot({path:process.env.CHATPICK_SCREENSHOT});
  }
  assert.equal(requests, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Perplexity answer-only windows never become questions, remount identity, chat reset and accurate jumps');
} finally { await browser.close(); }
