// New sends can render after the previous question has been virtualized away.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { navigatorFixture } from './navigator-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const question = (id, text) => `<div data-chatgpt-search-unit-key="turn-${id}:0:user" data-chatgpt-search-message-ids="${id}"><div data-content-search-unit-key="turn-${id}:0:user"><h4 class="sr-only">You said:</h4><div data-user-message-bubble>${text}</div></div></div>`;
  await page.route('https://chatgpt.com/**', route => {
    const url = route.request().url();
    if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
    if (url.includes('/backend-api/')) return route.fulfill({ json: { mapping: { u0: { parent: null, message: { id: 'u0', author: { role: 'user' }, content: { parts: ['Original question'] } } } }, current_node: 'u0' } });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>body{margin:0}.sr-only{display:none}#feed{padding:100px 40px 1200px}#feed>div{height:600px}</style><main id="feed">${question('u0', 'Original question')}</main>` });
  });
  await page.goto('https://chatgpt.com/c/new-question-fixture');
  await page.evaluate(source);
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1);
  await page.locator('#feed').evaluate((node, html) => node.innerHTML = html, question('u1', 'New question'));
  await page.waitForTimeout(900);
  assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), ['Original question', 'New question'], 'A newly sent question must join the directory even when earlier questions are unmounted and history is stale');
  console.log('PASS: ChatGPT new question joins a sparse conversation immediately');
} finally {
  await browser.close();
}
