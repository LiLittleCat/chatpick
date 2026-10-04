// Account-indexed Gemini routes use the same synthetic transcript as /app chats.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { navigatorFixture } from './navigator-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const chat = '1111111111111111';
const html = `<!doctype html><style>body{background:#171717;color:white}user-query,model-response{display:block}#feed{padding:100px 40px 1400px}</style><main id="feed"><div class="conversation-container" id="turn-1"><user-query><p class="query-text-line">Explain a synthetic example</p></user-query><model-response><message-content><div class="markdown"><h2>Example section</h2><p>Public test content.</p></div></message-content></model-response></div></main>`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  let requests = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://gemini.google.com/**', route => {
    if (!route.request().isNavigationRequest()) {
      requests++;
      return route.fulfill({ status: 503, body: 'Unexpected request' });
    }
    return route.fulfill({ contentType: 'text/html', body: html, headers: { 'Content-Security-Policy': "require-trusted-types-for 'script'" } });
  });
  const active = async path => {
    try {
      await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1, null, { timeout: 2000 });
    } catch {
      assert.fail(`Gemini navigation must appear on ${path}`);
    }
    assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), ['Explain a synthetic example']);
  };
  // Cold loads exercise the same URL shape as a bookmarked multi-account chat.
  for (const path of [`/app/${chat}`, `/u/2/app/${chat}`]) {
    await page.goto(`https://gemini.google.com${path}`);
    await page.evaluate(source);
    await active(path);
  }
  // Aliases retain question identity; account numbers, query and hash are valid.
  for (const path of [`/u/0/app/${chat}`, `/u/12/app/${chat}/?hl=zh-CN#answer`, `/app/${chat}`]) {
    await page.evaluate(path => history.pushState({}, '', path), path);
    await active(path);
  }
  // Home, shared links, settings, malformed IDs and non-numeric accounts stay out.
  for (const path of ['/u/2/app', '/u/2/app/', '/u/2/settings', `/u/2/share/${chat}`, '/u/2/app/short', `/u/2/app/${chat}/settings`, `/u/name/app/${chat}`, `/u/-1/app/${chat}`, '/u/2/app/zzzzzzzzzzzzzzzz']) {
    await page.evaluate(path => history.pushState({}, '', path), path);
    await page.waitForFunction(() => !document.querySelector('#cgpt-nav-box'), null, { timeout: 2000 });
    assert.equal(await page.locator('#cgpt-nav-style,#cgpt-nav-toast').count(), 0);
    await page.evaluate(path => history.pushState({}, '', path), `/u/2/app/${chat}`);
    await active(`/u/2/app/${chat}`);
  }
  await page.locator('#cgpt-toc .cn-item').click();
  await page.waitForFunction(() => document.querySelector('#cgpt-sections')?.hidden === false);
  assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), ['Example section']);
  assert.equal(requests, 0, 'Account routes must remain DOM-only');
  assert.deepEqual(errors, []);
  console.log('PASS: Gemini ordinary and account-indexed cold loads, SPA aliases, excluded routes, re-entry and answer navigation');
} finally {
  await browser.close();
}
