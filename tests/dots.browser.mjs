// Real MV3 bridge with public synthetic Dots message rows; never real chat data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(import.meta.dirname, '../.output/chrome-mv3');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatpick-dots-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, acceptDownloads: true, reducedMotion: 'reduce',
  viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`],
});
const id = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const row = (id, user, text) => `<article class="message-row ${user ? 'self' : ''}" data-message-id="${id}"><div class="message-meta">TIMESTAMP_NOT_CONTENT</div><div class="message-body" data-message-id="${id}"><div class="message-text"><div data-markdown-text-style="assistant-message">${text}</div></div><div class="message-inline-actions" aria-label="Message actions"><button>Reply</button><button>Choose a reaction</button></div></div></article>`;
const transcript = row('intro', false, '<h2>Unprompted greeting</h2>') +
  row('u1', true, '<p>Same question</p>') + row('a1', false, '<h2>First section</h2><pre><h3>Code heading</h3></pre>') +
  row('a1b', false, '<h3>Second reply section</h3><strong>Ordinary bold</strong>') +
  row('u2', true, '<p>Same question</p>') + row('a2', false, '<h2>Next answer</h2>') +
  row('u3', true, '<p>Final question</p>') + row('a3', false, '<h2>Final section</h2>');
const html = `<!doctype html><title>Synthetic Dots chat</title><style>body{margin:0;background:#171717;color:white;--app-color-text-accent:#e86b8b}#scroll{height:900px;overflow:auto}.thread-pane{padding:100px 40px 1400px;width:720px}article{min-height:220px}h2,h3{margin:0 0 100px}</style><aside>${row('outside', true, 'Sidebar question')}</aside><div id="scroll"><main class="thread-pane">${transcript}</main></div>`;
let reads = 0;
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('https://chatgpt.com/**', route => {
  if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html });
  reads++;
  if (route.request().url().endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'synthetic-only' } });
  return route.fulfill({ json: { current_node: 'normal', mapping: { normal: { parent: null, message: { id: 'normal', author: { role: 'user' }, content: { parts: ['Regular question'] } } } } } });
});
const labels = () => page.locator('#cgpt-toc .cn-t').allTextContents();
const count = n => page.waitForFunction(n => document.querySelectorAll('#cgpt-toc .cn-item').length === n, n);
const navigate = path => page.evaluate(path => history.pushState({}, '', path), path);
try {
  await page.goto(`https://chatgpt.com/dots/${id}`);
  await count(3);
  assert.deepEqual(await labels(), ['Same question', 'Same question', 'Final question']);
  assert.equal(reads, 0, 'Dots must not call ordinary conversation APIs or read credentials');
  assert.equal(await page.locator('#cgpt-nav-box').evaluate(n => n.style.getPropertyValue('--cn-active')), '#e86b8b');
  await page.locator('#cgpt-toc .cn-item').first().click();
  await page.waitForFunction(() => document.querySelector('#cgpt-sections')?.hidden === false);
  assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), ['First section', 'Second reply section']);
  await page.locator('#cgpt-sections .cn-item').last().click();
  assert(Math.abs(await page.locator('[data-message-id="a1b"]').first().locator('h3').evaluate(n => n.getBoundingClientRect().top) - 72) < 2);
  // New sends, remounted duplicate questions and answer-only windows retain IDs.
  await page.locator('.thread-pane').evaluate((n, html) => n.insertAdjacentHTML('beforeend', html), row('u4', true, '<p>New question</p>') + row('a4', false, '<h2>New section</h2>'));
  await count(4);
  await page.locator('article[data-message-id="u1"]').evaluate(n => n.remove());
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 4);
  await page.locator('article[data-message-id="a1"]').evaluate((n, html) => n.insertAdjacentHTML('beforebegin', html), row('u1', true, '<p>Same question</p>'));
  await page.waitForTimeout(350);
  assert.deepEqual(await labels(), ['Same question', 'Same question', 'Final question', 'New question']);
  // Both formats use rendered content and state their partial coverage up front.
  await page.locator('#chatpick-export-button').click();
  assert.equal(await page.locator('#chatpick-export-notice').isVisible(), true);
  for (const format of ['markdown', 'pdf']) {
    const pending = page.waitForEvent('download');
    await page.locator(`[data-format="${format}"]`).click();
    const file = await pending;
    const bytes = fs.readFileSync(await file.path());
    if (format === 'markdown') {
      const text = bytes.toString();
      assert.match(text, /Partial export/);
      assert.equal(text.split('Same question').length - 1, 2);
      assert.match(text, /Second reply section/);
      assert.doesNotMatch(text, /TIMESTAMP_NOT_CONTENT|Choose a reaction|Sidebar question/);
    } else assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    await page.getByText('Downloaded.', { exact: true }).waitFor();
  }
  assert.equal(reads, 0);
  await page.locator('#chatpick-export-close').click();
  // A different dot must not inherit the previous dot's still-mounted rows.
  await navigate(`/dots/${other}`);
  await count(0);
  await page.locator('.thread-pane').evaluate((n, html) => n.innerHTML = html, row('other-u', true, '<p>Another dot question</p>'));
  await count(1);
  assert.deepEqual(await labels(), ['Another dot question']);
  for (const route of ['/dots', '/dots/', '/dots/short', `/dots/${id}/settings`, '/settings', '/']) {
    await navigate(route);
    await page.waitForFunction(() => !document.querySelector('#cgpt-nav-box'));
  }
  assert.equal(reads, 0);
  // Switching to an ordinary chat restores its history reader and its directory.
  await page.locator('.thread-pane').evaluate(n => n.innerHTML = '<article data-turn="user"><div data-message-author-role="user" data-message-id="normal">Regular question</div></article>');
  await navigate(`/c/${id}`);
  await count(1);
  assert.deepEqual(await labels(), ['Regular question']);
  assert(reads > 0);
  const previousReads = reads;
  await navigate(`/dots/${id}`);
  await count(0);
  await page.locator('.thread-pane').evaluate((n, html) => n.innerHTML = html, transcript);
  await count(3);
  assert.deepEqual(await labels(), ['Same question', 'Same question', 'Final question']);
  assert.equal(reads, previousReads, 'Returning to Dots must release the regular-chat reader');
  const manager = await context.newPage();
  await manager.goto('chrome://extensions');
  const extensionId = await manager.locator('extensions-item').first().getAttribute('id');
  assert(extensionId);
  await manager.goto(`chrome-extension://${extensionId}/popup.html`);
  await manager.evaluate(() => chrome.storage.local.set({ disabledSites: ['chatgpt'] }));
  await page.waitForFunction(() => !document.querySelector('#cgpt-nav-box'));
  await manager.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
  await count(3);
  assert.equal(reads, previousReads);
  assert.deepEqual(errors, []);
  console.log('PASS: Dots questions, repeated identity, new sends, headings across replies, theme, Markdown/PDF, SPA switching and per-site enablement');
} finally {
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
