// Actual Motion bundle on synthetic chat pages, including interrupted exits.
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
  for (const reducedMotion of ['no-preference', 'reduce']) {
    for (const position of ['right', 'left']) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://chatgpt.com/**', route => {
        const url = route.request().url();
        if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
        if (url.includes('/backend-api/')) return route.fulfill({ status: 503 });
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0;font-family:system-ui;background:#f7f5f1}article{margin:100px 0}footer{height:1000px}</style><main>' + [1,2].map(n => '<article data-turn="user"><div data-message-author-role="user" data-message-id="u'+n+'">Synthetic question '+n+'</div></article><article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a'+n+'"><div class="markdown"><h2>Answer '+n+'</h2><h3>Details '+n+'</h3></div></div></article>').join('') + '</main><footer></footer>' });
      });
      await page.goto('https://chatgpt.com/c/motion-fixture');
      await page.addScriptTag({ content: source });
      await page.evaluate(position => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { position } }, location.origin), position);
      await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 2);
      const first = page.locator('#cgpt-toc .cn-item').first();
      const second = page.locator('#cgpt-toc .cn-item').last();
      const panel = page.locator('#cgpt-sections');
      await first.focus();
      if (reducedMotion === 'no-preference') assert.ok(await panel.evaluate(el => el.getAnimations().some(animation => animation.playState === 'running')), 'Opening animates');
      else assert.equal(await panel.evaluate(el => getComputedStyle(el).opacity), '1', 'Reduced motion opens immediately');
      await page.waitForFunction(() => getComputedStyle(document.getElementById('cgpt-sections')).opacity === '1');
      if (position === 'right' && reducedMotion === 'no-preference' && process.env.CHATPICK_MOTION_SCREENSHOT) {
        const clip = await page.evaluate(() => {
          const a = document.getElementById('cgpt-toc').getBoundingClientRect(), b = document.getElementById('cgpt-sections').getBoundingClientRect();
          return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.max(a.right, b.right) - Math.min(a.x, b.x), height: Math.max(a.bottom, b.bottom) - Math.min(a.y, b.y) };
        });
        await page.screenshot({ path: process.env.CHATPICK_MOTION_SCREENSHOT, clip });
      }
      await first.press('Escape');
      if (reducedMotion === 'no-preference') {
        assert.ok(await panel.evaluate(el => !el.hidden && el.inert && el.getAttribute('aria-hidden') === 'true' && getComputedStyle(el).pointerEvents === 'none'), 'Exit remains visible while interaction is disabled');
        await second.focus();
        await page.waitForFunction(() => getComputedStyle(document.getElementById('cgpt-sections')).opacity === '1');
        await page.waitForTimeout(200);
        assert.ok(await panel.isVisible(), 'Reopening cancels the old exit');
        assert.deepEqual(await panel.locator('.cn-t').allTextContents(), ['Answer 2','Details 2']);
        assert.equal(await panel.evaluate(el => el.inert), false);
        await second.press('Escape');
        await page.waitForFunction(() => document.getElementById('cgpt-sections').hidden);
      } else assert.equal(await panel.evaluate(el => el.hidden), true, 'Reduced motion closes immediately');
      await first.focus();
      await page.evaluate(() => history.pushState({}, '', '/'));
      await page.waitForFunction(() => !document.getElementById('cgpt-nav-box'));
      assert.deepEqual(errors, []);
      console.log(`PASS: ${position}, ${reducedMotion}, enter/exit, interruption, accessibility and route cleanup`);
      await page.close();
    }
  }
} finally { await browser.close(); }
