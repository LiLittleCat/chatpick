// Synthetic linked questions: presentation must not change their identities or jumps.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { navigatorFixture } from './navigator-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const cases = [
  { raw: '[Guide](https://example.com/first) explain this', display: 'Guide explain this', links: ['Guide'] },
  { raw: '[Guide](https://example.com/second) explain this', display: 'Guide explain this', links: ['Guide'] },
  { raw: 'Read [API](https://example.com/path_(v2) "Reference") and https://example.org/docs.', display: 'Read API and https://example.org/docs.', links: ['API', 'https://example.org/docs'] },
  { raw: '[https\\://example\\.com/docs](https\\://example\\.com/docs) compare this', display: 'https://example.com/docs compare this', links: ['https://example.com/docs'] },
  { raw: '`[literal](https://example.com/code)` and ``https://example.org``', links: [] },
  { raw: '[<img src=x onerror=alert(1)>](https://example.com) check this', display: '<img src=x onerror=alert(1)> check this', links: ['<img src=x onerror=alert(1)>'] },
  { raw: '[unfinished](example) and ![image](https://example.com/image.png)', links: [] },
  { raw: '[Mail](mailto:help@example.com) or (https://example.org/page)', display: 'Mail or (https://example.org/page)', links: ['Mail', 'https://example.org/page'] },
];
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const providers = [
  { name: 'ChatGPT', host: 'chatgpt.com', path: '/c/links-fixture', question: (text, n) => `<article><div data-message-author-role="user" data-message-id="u${n}">${text}</div></article>` },
  { name: 'Claude', host: 'claude.ai', path: '/chat/links-fixture', question: (text, n) => `<div data-testid="transcript-row" data-index="${n}" data-perf-row="human"><div data-testid="user-message">${text}</div></div>` },
  { name: 'DeepSeek', host: 'chat.deepseek.com', path: '/a/chat/s/links-fixture', question: (text, n) => `<div data-virtual-list-item-key="${n + 1}"><div class="ds-message"><div class="ds-collapsible-text">${text}</div></div></div>` },
  { name: 'Gemini', host: 'gemini.google.com', path: '/app/1111111111111111', question: (text, n) => `<div class="conversation-container" id="turn-${n}"><user-query><p class="query-text-line">${text}</p></user-query></div>` },
];
const browser = await chromium.launch({ headless: true });
try {
  for (const provider of providers) {
    for (const fallback of provider.name === 'Gemini' ? [true] : [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const html = `<!doctype html><html class="dark"><style>body{margin:0;background:#171717;color:#fafafa}#feed{padding:100px 40px 1200px}#feed>div,#feed>article{height:650px;width:700px}user-query{display:block}</style><main id="feed">${cases.map((entry, n) => provider.question(escape(entry.raw), n)).join('')}</main>`;
      const mapping = Object.fromEntries(cases.map((entry, n) => [`u${n}`, { parent: n ? `u${n - 1}` : null, message: { id: `u${n}`, author: { role: 'user' }, content: { parts: [entry.raw] } } }]));
      const claude = { current_leaf_message_uuid: 'u7', chat_messages: cases.map((entry, n) => ({ uuid: `u${n}`, parent_message_uuid: n ? `u${n - 1}` : null, sender: 'human', text: entry.raw })) };
      const deepseek = { code: 0, data: { biz_code: 0, biz_data: { chat_session: { current_message_id: 8 }, chat_messages: cases.map((entry, n) => ({ message_id: n + 1, parent_id: n || null, role: 'USER', fragments: [{ type: 'REQUEST', content: entry.raw }] })) } } };
      await page.route(`https://${provider.host}/**`, route => {
        const url = route.request().url();
        if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
        if (!route.request().isNavigationRequest()) return fallback ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ json: provider.name === 'Claude' ? claude : provider.name === 'DeepSeek' ? deepseek : { mapping, current_node: 'u7' } });
        return route.fulfill({ contentType: 'text/html', body: html, headers: provider.name === 'Gemini' ? { 'Content-Security-Policy': "require-trusted-types-for 'script'" } : {} });
      });
      await page.context().addCookies([{ name: 'lastActiveOrg', value: '00000000-0000-0000-0000-000000000001', domain: provider.host, path: '/' }]);
      await page.addInitScript(() => localStorage.setItem('userToken', JSON.stringify({ value: 'fixture', __version: '0' })));
      await page.goto(`https://${provider.host}${provider.path}`);
      await page.evaluate(source);
      await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 8);
      const items = page.locator('#cgpt-toc .cn-item');
      assert.deepEqual(await items.locator('.cn-t').allTextContents(), cases.map(entry => entry.display || entry.raw));
      for (let n = 0; n < cases.length; n++) {
        const item = items.nth(n);
        assert.deepEqual(await item.locator('.cn-link').allTextContents(), cases[n].links);
        assert.equal(await item.getAttribute('title'), cases[n].display || cases[n].raw);
        assert.equal(await item.getAttribute('aria-label'), cases[n].display || cases[n].raw);
        assert.equal(await item.locator('a,img,script,[tabindex]').count(), 0, 'No HTML execution, outbound navigation or nested keyboard targets');
      }
      const appearance = await items.first().locator('.cn-link').evaluate(node => ({ decoration: getComputedStyle(node).textDecorationLine, color: getComputedStyle(node).color, parentColor: getComputedStyle(node.parentElement).color }));
      assert.equal(appearance.decoration, 'underline');
      assert.equal(appearance.color, appearance.parentColor);
      for (const n of [1, 0, 7]) {
        await items.nth(n).click();
        const top = await page.locator('#feed>div,#feed>article').nth(n).evaluate(node => node.getBoundingClientRect().top);
        assert(Math.abs(top - 72) < 2, `Repeated link labels preserve distinct message jumps: ${provider.name}, ${n}, top=${top}`);
        assert.equal(new URL(page.url()).pathname, provider.path);
      }
      await items.nth(1).focus();
      await page.keyboard.press('Enter');
      assert(Math.abs(await page.locator('#feed>div,#feed>article').nth(1).evaluate(node => node.getBoundingClientRect().top) - 72) < 2);
      assert.deepEqual(errors, []);
      if (provider.name === 'ChatGPT' && !fallback) {
        await items.first().hover();
        await page.waitForTimeout(300);
        await page.locator('#cgpt-nav-box').screenshot({ path: '/tmp/chatpick-question-links.png' });
      }
      console.log(`PASS: ${provider.name} ${fallback ? 'DOM fallback' : 'API'} link labels, underlines, safe text and distinct jumps`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
