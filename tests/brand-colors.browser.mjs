// Appearance accent colors and site brands must win over generic link colors.
import fs from 'node:fs';
import { navigatorFixture } from './navigator-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  for (const { host, route, css, expected } of [
    { host: 'chatgpt.com', route: '/c/brand-fixture', css: '--link-primary-text-color:#339cff', expected: '#19c37d' },
    { host: 'chatgpt.com', route: '/c/appearance-fixture', css: '--app-color-text-accent:#2c67c5;--brand-color:#19c37d;--link-primary-text-color:#339cff', expected: '#2c67c5' },
    { host: 'claude.ai', route: '/chat/brand-fixture', css: '--cds-fill-brand:#c6613f;--cds-text-accent:#6da7ec;--accent-100:212 70% 60%', expected: '#c6613f' },
    { host: 'chat.deepseek.com', route: '/a/chat/s/brand-fixture', css: '--dsw-alias-brand-text:#679efe;--color-primary:#306eff', expected: '#679efe' },
  ]) {
    const page = await browser.newPage();
    const question = host === 'claude.ai' ? '<div data-testid="transcript-row" data-index="0"><div data-testid="user-message">Brand question</div></div>'
      : host === 'chat.deepseek.com' ? '<div data-virtual-list-item-key="1"><div class="ds-message"><div class="ds-collapsible-text">Brand question</div></div></div>'
        : '<article data-turn="user"><div data-message-author-role="user">Brand question</div></article>';
    await page.route(`https://${host}/**`, request => request.request().isNavigationRequest()
      ? request.fulfill({ contentType: 'text/html', body: `<style>:root{${css}}body{background:#151515}</style><main>${question}</main>` })
      : request.fulfill({ status: 503, body: 'Fixture fallback' }));
    await page.goto(`https://${host}${route}`);
    await page.addScriptTag({ content: source });
    const accent = await page.locator('#cgpt-nav-box').evaluate(node => getComputedStyle(node).getPropertyValue('--cn-active').trim());
    assert.equal(accent, expected, `${host}: expected site brand color rather than generic blue links`);
    await page.locator('#cgpt-toc .cn-item.active').waitFor();
    const displayed = await page.locator('#cgpt-toc .cn-item.active').evaluate(node => ({ text: getComputedStyle(node).color, marker: getComputedStyle(node).borderLeftColor }));
    const rgb = `rgb(${[1, 3, 5].map(index => parseInt(expected.slice(index, index + 2), 16)).join(', ')})`;
    assert.deepEqual(displayed, { text: rgb, marker: rgb });
    if (route === '/c/appearance-fixture') {
      await page.evaluate(() => document.documentElement.style.setProperty('--app-color-text-accent', '#a25bff'));
      await page.waitForFunction(() => document.getElementById('cgpt-nav-box').style.getPropertyValue('--cn-active') === '#a25bff');
      await page.evaluate(() => {
        document.documentElement.dataset.theme = 'light';
        document.documentElement.style.setProperty('--app-color-text-accent', '#257c64');
      });
      await page.waitForFunction(() => document.getElementById('cgpt-nav-box').dataset.theme === 'light' && document.getElementById('cgpt-nav-box').style.getPropertyValue('--cn-active') === '#257c64');
      console.log('PASS: ChatGPT appearance accent, custom colors and light/dark changes');
    }
    console.log(`PASS: ${host} brand color ${accent}`);
    await page.close();
  }
} finally { await browser.close(); }
