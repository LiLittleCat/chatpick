// Navigation layout on synthetic conversations; no account content.
import fs from 'node:fs';
import { navigatorFixture } from './navigator-fixture.mjs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(path.resolve(import.meta.dirname, '../.output/chrome-mv3/content-scripts/navigator.js'), 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let count = 12;
  await page.route('https://chatgpt.com/**', route => {
    const mapping = {}; let parent = null;
    for (let i = 0; i < count; i++) {
      for (const role of ['user', 'assistant']) {
        const id = role[0] + i;
        const text = role === 'user' ? 'Synthetic question ' + (i + 1) : Array.from({ length: count }, (_, n) => '## Section ' + (n + 1)).join('\n\n');
        mapping[id] = { parent, message: { id, author: { role }, content: { parts: [text] } } }; parent = id;
      }
    }
    const url = route.request().url();
    if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
    if (url.includes('/backend-api/')) return route.fulfill({ json: { mapping, current_node: parent } });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}article{margin:100px 0}footer{height:1000px}</style><main>' + Array.from({ length: count }, (_, i) => '<article data-turn="user"><div data-message-author-role="user" data-message-id="u' + i + '">Synthetic question ' + (i + 1) + '</div></article><article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a' + i + '"><div class="markdown">' + Array.from({ length: count }, (_, n) => '<h2>Section ' + (n + 1) + '</h2>').join('') + '</div></div></article>').join('') + '</main><footer></footer>' });
  });
  const dimensions = panel => page.locator(panel).evaluate(el => {
    const list = el.querySelector('.cn-list'), last = list.lastElementChild;
    return { overflow: list.scrollHeight - list.clientHeight, bottom: el.getBoundingClientRect().bottom, top: el.getBoundingClientRect().top, lastBottom: last.getBoundingClientRect().bottom, listBottom: list.getBoundingClientRect().bottom };
  });
  async function load() {
    await page.goto('https://chatgpt.com/c/layout-' + count);
    await page.addScriptTag({ content: source });
    await page.waitForFunction(n => document.querySelectorAll('#cgpt-toc .cn-item').length === n, count);
  }
  await load();
  let result = await dimensions('#cgpt-toc');
  assert.ok(result.overflow <= 1 && result.lastBottom <= result.listBottom + 1, 'Twelve questions fit without a tiny scrollbar');
  await page.locator('#cgpt-toc .cn-item').first().focus();
  await page.locator('#cgpt-sections').waitFor({ state: 'visible' });
  result = await dimensions('#cgpt-sections');
  assert.ok(result.overflow <= 1 && result.lastBottom <= result.listBottom + 1, 'Twelve answer sections also fit completely');
  if (process.env.CHATPICK_LAYOUT_SCREENSHOT) await page.locator('#cgpt-toc').screenshot({ path: process.env.CHATPICK_LAYOUT_SCREENSHOT });
  await page.setViewportSize({ width: 340, height: 900 });
  await page.waitForFunction(() => document.getElementById('cgpt-sections').getBoundingClientRect().left >= 16);
  result = await dimensions('#cgpt-sections');
  assert.ok(result.overflow > 1 && result.top >= 16 && result.bottom < (await dimensions('#cgpt-toc')).top, 'Stacked sections scroll within the space above the question list');
  await page.setViewportSize({ width: 1280, height: 720 });
  result = await dimensions('#cgpt-toc');
  assert.ok(result.overflow <= 1 && result.top >= 16, 'Use available space when the list fits in a shorter viewport: ' + JSON.stringify(result));
  await page.setViewportSize({ width: 1280, height: 670 });
  await page.evaluate(() => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { showExport: false } }, location.origin));
  await page.waitForFunction(() => !document.getElementById('chatpick-export-button'));
  result = await dimensions('#cgpt-toc');
  assert.ok(result.overflow <= 1 && result.top >= 16, 'Reclaim space when export is hidden');
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.waitForFunction(() => document.getElementById('cgpt-toc').getBoundingClientRect().top >= 16);
  result = await dimensions('#cgpt-toc');
  assert.ok(result.overflow > 1 && result.top >= 16, 'Keep scrolling when the viewport genuinely cannot fit the list');
  await page.locator('#cgpt-toc .cn-item').last().focus();
  assert.ok(await page.locator('#cgpt-toc .cn-item').last().evaluate(el => { const a = el.getBoundingClientRect(), b = el.parentElement.getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; }), 'Keyboard users can reach the last question');
  await page.evaluate(() => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { showExport: false, showJumpButtons: false } }, location.origin));
  await page.waitForFunction(() => document.getElementById('cgpt-btns').hidden);
  result = await dimensions('#cgpt-toc');
  assert.ok(result.overflow <= 1 && result.top >= 16, 'Use the space released by hiding jump buttons too');
  await page.setViewportSize({ width: 1280, height: 900 });
  count = 20;
  await load();
  result = await dimensions('#cgpt-toc');
  assert.ok(result.overflow > 26 && result.top >= 16, 'Long lists retain useful scrolling');
  assert.deepEqual(errors, []);
  console.log('PASS: compact lists, answer sections, viewport limits and keyboard scrolling');
} finally { await browser.close(); }
