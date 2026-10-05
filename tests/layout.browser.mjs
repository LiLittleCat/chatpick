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
  for (const position of ['right', 'left']) {
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
      await page.evaluate(position => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { position } }, location.origin), position);
      await page.waitForFunction(n => document.querySelectorAll('#cgpt-toc .cn-item').length === n, count);
      await page.waitForFunction(position => document.getElementById('cgpt-nav-box')?.dataset.position === position, position);
    }
    await load();
    let result = await dimensions('#cgpt-toc');
    assert.ok(result.overflow <= 1 && result.lastBottom <= result.listBottom + 1, 'Twelve questions fit without a tiny scrollbar');
    await page.locator('#cgpt-toc .cn-item').first().focus();
    await page.locator('#cgpt-sections').waitFor({ state: 'visible' });
    result = await dimensions('#cgpt-sections');
    assert.ok(result.overflow <= 1 && result.lastBottom <= result.listBottom + 1, 'Twelve answer sections also fit completely');
    const panels = await page.evaluate(() => ['cgpt-toc', 'cgpt-sections', 'cgpt-btns', 'chatpick-export-button'].map(id => {
      const rect = document.getElementById(id).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
    assert.ok(position === 'left' ? panels[1].left >= panels[0].right + 11 : panels[1].right <= panels[0].left - 11, 'Answer menu opens toward the center without overlapping the question menu');
    assert.ok(panels.every(rect => rect.left >= 16 && rect.right <= 1264), 'Every navigation control fits in the viewport');
    assert.ok(panels.every((rect, index) => index === 1 || Math.abs((position === 'left' ? rect.left : rect.right) - (position === 'left' ? panels[0].left : panels[0].right)) < 1), 'Question menu and controls share the chosen edge');
    await page.locator('#cgpt-toc .cn-item').first().evaluate(el => el.blur());
    await page.locator('#cgpt-toc .cn-item').first().hover();
    const sectionItem = await page.locator('#cgpt-sections .cn-item').first().boundingBox();
    await page.mouse.move(position === 'left' ? sectionItem.x - 6 : sectionItem.x + sectionItem.width + 6, sectionItem.y + sectionItem.height / 2);
    await page.mouse.move(sectionItem.x + sectionItem.width / 2, sectionItem.y + sectionItem.height / 2, { steps: 5 });
    await page.waitForTimeout(220);
    assert.ok(await page.locator('#cgpt-sections').isVisible(), 'Pointer travel through the menu gap keeps the answer menu open');
    await page.locator('#cgpt-sections .cn-item').first().press('Escape');
    assert.ok(await page.locator('#cgpt-sections').isHidden(), 'Escape closes answer navigation on either side');
    await page.locator('#cgpt-toc .cn-item').first().focus();
    if (process.env.CHATPICK_LAYOUT_SCREENSHOT) await page.locator('#cgpt-toc').screenshot({ path: process.env.CHATPICK_LAYOUT_SCREENSHOT });
    await page.setViewportSize({ width: 340, height: 900 });
    await page.waitForFunction(() => {
      const section = document.getElementById('cgpt-sections').getBoundingClientRect();
      return section.left >= 16 && section.right <= innerWidth - 16 && section.bottom < document.getElementById('cgpt-toc').getBoundingClientRect().top;
    });
    result = await dimensions('#cgpt-sections');
    assert.ok(result.overflow > 1 && result.top >= 16 && result.bottom < (await dimensions('#cgpt-toc')).top, 'Stacked sections scroll within the space above the question list');
    await page.setViewportSize({ width: 1280, height: 720 });
    result = await dimensions('#cgpt-toc');
    assert.ok(result.overflow <= 1 && result.top >= 16, 'Use available space when the list fits in a shorter viewport: ' + JSON.stringify(result));
    await page.setViewportSize({ width: 1280, height: 670 });
    await page.evaluate(position => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { position, showExport: false } }, location.origin), position);
    await page.waitForFunction(() => !document.getElementById('chatpick-export-button'));
    result = await dimensions('#cgpt-toc');
    assert.ok(result.overflow <= 1 && result.top >= 16, 'Reclaim space when export is hidden');
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.waitForFunction(() => document.getElementById('cgpt-toc').getBoundingClientRect().top >= 16);
    result = await dimensions('#cgpt-toc');
    assert.ok(result.overflow > 1 && result.top >= 16, 'Keep scrolling when the viewport genuinely cannot fit the list');
    await page.locator('#cgpt-toc .cn-item').last().focus();
    assert.ok(await page.locator('#cgpt-toc .cn-item').last().evaluate(el => { const a = el.getBoundingClientRect(), b = el.parentElement.getBoundingClientRect(); return a.top >= b.top - 1 && a.bottom <= b.bottom + 1; }), 'Keyboard users can reach the last question');
    await page.evaluate(position => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { position, showExport: false, showJumpButtons: false } }, location.origin), position);
    await page.waitForFunction(() => document.getElementById('cgpt-btns').hidden);
    result = await dimensions('#cgpt-toc');
    assert.ok(result.overflow <= 1 && result.top >= 16, 'Use the space released by hiding jump buttons too');
    await page.setViewportSize({ width: 1280, height: 900 });
    count = 20;
    await load();
    result = await dimensions('#cgpt-toc');
    assert.ok(result.overflow > 26 && result.top >= 16, 'Long lists retain useful scrolling');
    if (position === 'left') {
      await page.evaluate(() => {
        const sidebar = document.createElement('aside');
        sidebar.id = 'fixture-sidebar';
        sidebar.style.cssText = 'position:fixed;left:0;top:0;bottom:0;width:260px';
        document.body.prepend(sidebar);
        document.querySelector('main').style.marginLeft = '260px';
      });
      await page.waitForTimeout(100);
      const inset = await page.locator('#cgpt-nav-box').evaluate(el => el.getBoundingClientRect().left);
      assert.ok(Math.abs(inset - 278) < 1, `Navigation belongs inside the chat, after its 260px sidebar: left=${inset}`);
      await page.locator('#cgpt-toc .cn-item').first().focus();
      await page.waitForFunction(() => {
        const toc = document.getElementById('cgpt-toc').getBoundingClientRect();
        const section = document.getElementById('cgpt-sections').getBoundingClientRect();
        return toc.left >= 278 && section.left >= toc.right + 11 && section.right <= innerWidth - 16;
      });
      await page.evaluate(() => {
        document.getElementById('fixture-sidebar').style.width = '72px';
        document.querySelector('main').style.marginLeft = '72px';
      });
      await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 90) < 1);
      // A transform moves the canvas without resizing its border box.
      await page.evaluate(() => { document.querySelector('main').style.transform = 'translateX(24px)'; });
      await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 114) < 1);
      await page.evaluate(() => {
        document.getElementById('fixture-sidebar').remove();
        const main = document.querySelector('main');
        main.style.marginLeft = ''; main.style.transform = '';
        const pane = document.createElement('div');
        pane.className = 'thread-pane'; pane.style.marginLeft = '320px';
        pane.append(...main.childNodes); main.appendChild(pane);
      });
      await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 338) < 1);
      await page.evaluate(() => { document.querySelector('.thread-pane').style.marginLeft = ''; });
      await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 18) < 1);
      await page.evaluate(() => {
        document.querySelector('.thread-pane').className = '';
        const sidebar = document.createElement('aside');
        sidebar.style.cssText = 'position:fixed;left:0;top:0;bottom:0;width:72px';
        document.body.prepend(sidebar);
      });
      await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 90) < 1);
      await page.evaluate(() => { document.querySelector('aside').hidden = true; });
      await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 18) < 1);
      await page.evaluate(() => { document.querySelector('aside').hidden = false; });
      await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 90) < 1);
      console.log('PASS: sidebar expansion/collapse, canvas translation and Dots thread boundary');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${position} placement, inward answer menus, pointer travel, compact lists, viewport limits and keyboard scrolling`);
    await page.close();
  }
} finally { await browser.close(); }
