// Run: CHATPICK_PLAYWRIGHT_MODULE=/path/to/playwright pnpm test:navigation
// Uses browser fixtures only; no ChatGPT account or network data is needed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const source = process.env.CHATPICK_BUILT
  ? fs.readFileSync(path.join(root, '.output/chrome-mv3/content-scripts/navigator.js'), 'utf8')
  : fs.readFileSync(path.join(root, 'navigator.js'), 'utf8').replace('export function startNavigator()', 'function startNavigator()') + '\nstartNavigator();';
const browser = await chromium.launch({ headless: true });
try {
  const scenarios = process.env.CHATPICK_SCENARIOS?.split(',') || ['decorated-text', 'duplicate-text', 'missing-middle', 'dom-fallback', 'escaped-heading', 'streamed-heading', 'modern-shell', 'deferred-heading', 'deferred-outline', 'search-shell', 'search-shell-duplicate', 'search-shell-dom-fallback', 'search-shell-multi', 'continuous-sections', 'switched-chat', 'initial-dom'];
  for (const scenario of scenarios.filter((scenario) => !scenario.startsWith('body-only-') && !['switched-chat', 'initial-dom'].includes(scenario))) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const messages = [
      ['u1', 'user', 'Same question'], ['a1', 'assistant', '## First section'],
      ['u2', 'user', 'Same question'], ['a2', 'assistant', '## Second section'],
      ['u3', 'user', 'Final question'], ['a3', 'assistant', '## Final section'],
    ];
    if (['escaped-heading', 'deferred-heading'].includes(scenario)) messages[5][2] = '## 3\\. Final section';
    if (['streamed-heading', 'deferred-outline'].includes(scenario)) messages[5][2] = '## Draft title';
    if (scenario === 'continuous-sections') messages[5][2] = '## Final section\n### Next section\n## Last section';
    const mapping = {};
    let parent = null;
    for (const [id, role, text] of messages) {
      mapping[id] = { parent, message: { id, author: { role }, content: { parts: [text] } } };
      parent = id;
    }
    const duplicate = ['duplicate-text', 'search-shell-duplicate'].includes(scenario);
    const searchShell = scenario.startsWith('search-shell');
    const visible = duplicate ? ['u2'] : scenario === 'missing-middle' ? ['u1', 'u3'] : ['u1', 'u2', 'u3'];
    let deferredAnswer = '';
    const html = '<!doctype html><style>body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}article,[data-chatgpt-search-unit-key]{margin:100px 0}.spacer{height:600px}footer{height:1200px}</style><main>' + visible.map((id) => {
      const n = Number(id[1]);
      const text = messages.find((m) => m[0] === id)[2];
      if (searchShell) return `<div data-chatgpt-search-unit-key="turn${n}:0:user" data-chatgpt-search-message-ids="${id}"><div data-content-search-unit-key="turn${n}:0:user"><h4 class="sr-only">You said:</h4><div data-user-message-bubble="true">${text}</div></div></div><div data-content-search-unit-key="turn${n}:2:assistant" data-chatgpt-search-unit-key="turn${n}:2:assistant" data-chatgpt-search-message-ids="${scenario === 'search-shell-multi' ? `t${n}` : `a${n}`} a${n}">${scenario === 'search-shell-multi' ? `<div hidden data-chatgpt-selection-message-id="t${n}"><h2>Hidden reasoning section</h2></div>` : ''}<div data-chatgpt-selection-message-id="a${n}"><div data-markdown-text-style="assistant-message"><h2>${n === 1 ? 'First' : n === 2 ? 'Second' : 'Final'} section</h2><div class="spacer"></div></div></div></div>`;
      if (scenario === 'modern-shell') return `<li data-message-role="user" id="${id}"><h4 class="sr-only">你说：</h4><div data-user-message-bubble>${text}</div></li><li data-message-role="assistant" id="a${n}"><h4 class="sr-only">ChatGPT 说：</h4><div data-assistant-markdown><h2>${n === 1 ? 'First' : n === 2 ? 'Second' : 'Final'} section</h2><div class="spacer"></div></div></li>`;
      const user = `<article data-turn="user"><h5 class="sr-only">You said:</h5><div data-message-author-role="user" data-message-id="${id}">${scenario === 'decorated-text' ? '<span class="sr-only">User attachment:</span>' : ''}${text}</div></article>`;
      const answer = `<article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a${n}"><div class="markdown"><h2>${['escaped-heading', 'deferred-heading'].includes(scenario) && n === 3 ? '3. Final' : n === 1 ? 'First' : n === 2 ? 'Second' : 'Final'} section</h2><div class="spacer"></div></div></div></article>`;
      if (scenario === 'deferred-heading' && n === 3) { deferredAnswer = answer; return user; }
      if (scenario === 'deferred-outline' && n === 3) { deferredAnswer = answer.replace('</h2>', '</h2><h3>Unexpected new subsection</h3>'); return user; }
      return user + (scenario === 'continuous-sections' && n === 3 ? answer.replace('<div class="spacer"></div>', '<div class="spacer"></div><h3>Next section</h3><div class="spacer"></div><h2>Last section</h2><div class="spacer"></div>') : answer);
    }).join('') + '</main><footer></footer>';
    await page.route('https://chatgpt.com/**', (route) => {
      const url = route.request().url();
      if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
      if (url.includes('/backend-api/')) return scenario.endsWith('dom-fallback')
        ? route.fulfill({ status: 503, body: 'Unavailable' })
        : route.fulfill({ json: { mapping, current_node: parent } });
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('https://chatgpt.com/c/alignment-fixture');
    await page.addScriptTag({ content: source });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 3);
    const targetId = duplicate ? 'u2' : 'u3';
    const index = Number(targetId[1]) - 1;
    await page.locator('#cgpt-toc .cn-item').nth(index).click();
    await page.waitForTimeout(350);
    const messageSelector = (id) => searchShell ? id.startsWith('u') ? `[data-chatgpt-search-message-ids="${id}"]` : `[data-chatgpt-selection-message-id="${id}"]` : scenario === 'modern-shell' ? `[id="${id}"]` : `[data-message-id="${id}"]`;
    const result = await page.evaluate((selector) => ({
      top: document.querySelector(selector).getBoundingClientRect().top,
      toast: document.querySelector('#cgpt-nav-toast')?.textContent,
    }), messageSelector(targetId));
    assert(Math.abs(result.top - 72) < 2, `${scenario}: structured question did not jump to selected message`);
    assert(!result.toast, `${scenario}: loaded question showed mismatch`);
    assert(await page.locator('#cgpt-sections').isVisible(), `${scenario}: clicking Ask hid its answer structure while the pointer stayed on Ask`);
    await page.mouse.move(500, 20);
    await page.locator('#cgpt-toc .cn-item').nth(index).hover();
    await page.waitForTimeout(260);
    assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), scenario === 'continuous-sections' ? ['Final section', 'Next section', 'Last section'] : [scenario === 'deferred-outline' ? 'Draft title' : scenario === 'deferred-heading' ? '3\\. Final section' : scenario === 'escaped-heading' ? '3. Final section' : duplicate ? 'Second section' : 'Final section']);
    if (deferredAnswer) await page.evaluate((html) => {
      document.querySelector('#cgpt-sections').addEventListener('click', () => {
        setTimeout(() => document.querySelector('[data-message-id="u3"]').closest('article').insertAdjacentHTML('afterend', html), 50);
      }, { once: true, capture: true });
    }, deferredAnswer);
    await page.locator('#cgpt-sections .cn-item').first().click();
    await page.waitForTimeout(searchShell || ['escaped-heading', 'deferred-heading', 'deferred-outline'].includes(scenario) ? 1400 : 350);
    if (scenario === 'deferred-outline') {
      assert.equal(await page.locator('#cgpt-nav-toast').textContent(), 'Unable to locate this section. Please try again');
      const top = await page.locator('[data-message-id="a3"] h2').evaluate((node) => node.getBoundingClientRect().top);
      assert(Math.abs(top - 72) > 2, 'Changed outline must not jump to an unrelated heading');
      assert.deepEqual(errors, []);
      console.log('PASS: deferred-outline, changed answer structure does not jump to an unrelated section');
      await page.close();
      continue;
    }
    assert(!await page.evaluate(() => document.querySelector('#cgpt-nav-toast')?.textContent), `${scenario}: Unable to locate this section after clicking its answer nav`);
    const top = await page.locator(`${messageSelector(`a${targetId[1]}`)} h2`).first().evaluate((node) => node.getBoundingClientRect().top);
    assert(Math.abs(top - 72) < 2, `${scenario}: chapter jumped to a different question`);
    assert(await page.locator('#cgpt-sections').isVisible(), `${scenario}: clicking a chapter collapsed the answer menu`);
    if (scenario === 'continuous-sections') {
      await page.locator('#cgpt-sections .cn-item').nth(1).click();
      await page.waitForTimeout(350);
      assert(await page.locator('#cgpt-sections').isVisible(), 'Clicking another chapter must keep the menu open');
      const nextTop = await page.locator('[data-message-id="a3"] h3').evaluate((node) => node.getBoundingClientRect().top);
      assert(Math.abs(nextTop - 72) < 2, 'Consecutive chapter click must reach the next heading');
      const panel = await page.locator('#cgpt-toc').boundingBox();
      await page.mouse.move(panel.x + panel.width / 2, panel.y + 2);
      await page.waitForTimeout(250);
      assert(await page.locator('#cgpt-sections').isVisible(), 'Moving onto Ask-list padding must not close the section menu');
      await page.mouse.move(500, 20);
      await page.waitForTimeout(450);
      assert(!await page.locator('#cgpt-sections').isVisible(), 'Leaving both navigation panels must close the section menu');
      const width = await page.locator('#cgpt-toc').evaluate((node) => node.getBoundingClientRect().width);
      assert(width < 100, 'Leaving both panels must collapse the Ask list despite retained click focus');
    }
    await page.locator('#cgpt-toc .cn-item').nth(index).click();
    await page.waitForTimeout(350);
    const questionTop = await page.locator(messageSelector(targetId)).evaluate((node) => node.getBoundingClientRect().top);
    assert(Math.abs(questionTop - 72) < 2, `${scenario}: question click after chapter click failed`);
    assert(await page.locator('#cgpt-sections').isVisible(), `${scenario}: returning to Ask requires another hover to reopen the answer structure`);
    if (scenario === 'continuous-sections') {
      await page.mouse.move(500, 20);
      await page.waitForTimeout(450);
      assert(!await page.locator('#cgpt-sections').isVisible(), 'Leaving both panels must close the menu after clicking Ask');
      assert(await page.locator('#cgpt-toc').evaluate((node) => node.getBoundingClientRect().width < 100), 'Mouse-click focus on Ask must not prevent collapsing');
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: ${scenario}, structured question and chapter resolve to selected messages`);
    await page.close();
  }
  if (scenarios.includes('initial-dom')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    let releaseApi;
    const apiReady = new Promise((resolve) => { releaseApi = resolve; });
    await page.route('https://chatgpt.com/**', (route) => {
      const url = route.request().url();
      if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
      if (url.includes('/backend-api/')) return apiReady.then(() => route.fulfill({ json: { mapping: {
        u1: { parent: null, message: { id: 'u1', author: { role: 'user' }, content: { parts: ['Rendered question'] } } },
        a1: { parent: 'u1', message: { id: 'a1', author: { role: 'assistant' }, content: { parts: ['## Rendered section'] } } },
      }, current_node: 'a1' } }));
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}main{padding-top:500px}footer{height:1500px}</style><main><article data-turn="user"><div data-message-author-role="user" data-message-id="u1">Rendered question</div></article><article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a1"><div class="markdown"><h2>Rendered section</h2></div></div></article></main><footer></footer>' });
    });
    await page.goto('https://chatgpt.com/c/initial-fixture');
    await page.addScriptTag({ content: source });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 0, 'Initial load must not show a partial question list');
    assert(await page.locator('#cgpt-toc .cn-skeleton').isVisible(), 'Keep the full skeleton visible while API is pending');
    releaseApi();
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 1, 'Complete loading must replace skeleton with the question list');
    assert(!await page.locator('#cgpt-toc .cn-skeleton').isVisible());
    await page.locator('#cgpt-toc .cn-item').hover();
    await page.locator('#cgpt-sections .cn-item').click();
    assert(await page.locator('h2').evaluate((node) => Math.abs(node.getBoundingClientRect().top - 72) < 2));
    console.log('PASS: initial-dom, full skeleton remains until complete navigation is ready');
    await page.close();
  }
  if (scenarios.includes('switched-chat')) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const conversation = (prefix) => ({ mapping: {
      [`${prefix}1`]: { parent: null, message: { id: `${prefix}1`, author: { role: 'user' }, content: { parts: [`${prefix} first question`] } } },
      [`${prefix}a1`]: { parent: `${prefix}1`, message: { id: `${prefix}a1`, author: { role: 'assistant' }, content: { parts: ['## Earlier answer'] } } },
      [`${prefix}2`]: { parent: `${prefix}a1`, message: { id: `${prefix}2`, author: { role: 'user' }, content: { parts: [`${prefix} last question`] } } },
    }, current_node: `${prefix}2` });
    const user = (id, text) => `<div data-chatgpt-search-unit-key="${id}:user" data-chatgpt-search-message-ids="${id}"><div data-user-message-bubble>${text}</div></div>`;
    let releaseFirst, releaseSecond;
    const firstReady = new Promise((resolve) => { releaseFirst = resolve; });
    const secondReady = new Promise((resolve) => { releaseSecond = resolve; });
    await page.route('https://chatgpt.com/**', (route) => {
      const url = route.request().url();
      if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
      if (url.includes('/backend-api/')) return (url.endsWith('second-chat') ? secondReady : firstReady).then(() => route.fulfill({ json: conversation(url.endsWith('second-chat') ? 'new' : 'old') }));
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><style>body{margin:0}#current-chat{height:600px;overflow-y:auto}.gap{height:900px}</style><main id="old-chat"></main>' });
    });
    await page.goto('https://chatgpt.com/c/first-chat');
    await page.addScriptTag({ content: source });
    await page.locator('#cgpt-toc .cn-skeleton').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#cgpt-toc').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#cgpt-toc .cn-skeleton-bar').count(), 5);
    releaseFirst();
    await page.evaluate((markup) => { document.querySelector('#old-chat').innerHTML = markup; }, user('old2', 'old last question'));
    await page.waitForTimeout(500);
    assert(!await page.locator('#cgpt-toc .cn-skeleton').isVisible(), 'Loading placeholder must be replaced by questions');
    await page.evaluate(() => history.pushState({}, '', '/c/second-chat'));
    await page.locator('#cgpt-toc .cn-skeleton').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 0, 'Previous visible chat questions must be removed during loading');
    await page.evaluate((markup) => {
      document.querySelector('#old-chat').hidden = true;
      const chat = document.createElement('main');
      chat.id = 'current-chat';
      chat.innerHTML = '<div class="gap"></div>' + markup + '<div class="gap"></div>';
      document.body.append(chat);
      chat.scrollTop = 700;
      chat.addEventListener('scroll', () => {
        if (chat.scrollTop > 100 || chat.querySelector('[data-chatgpt-search-message-ids="new1"]')) return;
        chat.innerHTML = '<div style="height:180px"></div><div data-chatgpt-search-unit-key="new1:user" data-chatgpt-search-message-ids="new1"><div data-user-message-bubble>new first question</div></div><div data-chatgpt-search-unit-key="newa1:assistant"><div data-chatgpt-selection-message-id="newa1"><div data-markdown-text-style="assistant-message"><h2>Earlier answer</h2><div class="gap"></div></div></div></div>' + markup + '<div class="gap"></div>';
      });
    }, user('new2', 'new last question'));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 0, 'Switching chats must not show a partial question list');
    assert(await page.locator('#cgpt-toc .cn-skeleton').isVisible(), 'Keep full skeleton until the new chat has loaded');
    releaseSecond();
    await page.waitForTimeout(350);
    assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), ['new first question', 'new last question']);
    await page.locator('#cgpt-toc .cn-item').first().hover();
    await page.locator('#cgpt-sections .cn-item').first().click();
    await page.waitForTimeout(900);
    const result = await page.evaluate(() => ({ headingTop: document.querySelector('#current-chat h2')?.getBoundingClientRect().top, toast: document.querySelector('#cgpt-nav-toast')?.textContent }));
    assert(result.headingTop !== undefined && Math.abs(result.headingTop - 72) < 2, `switched-chat: answer nav stuck at ${result.toast}; current chat never loaded its earlier answer`);
    assert(!result.toast, 'Loading and locating must clear after the answer is found');
    console.log('PASS: switched-chat, skeleton loading state and hidden previous chat do not hijack answer navigation');
    await page.close();
  }
  const proseScenarios = process.env.CHATPICK_SCENARIOS?.split(',').filter((scenario) => scenario.startsWith('body-only-')) || ['body-only-dom', 'body-only-api', 'body-only-fallback'];
  for (const scenario of proseScenarios) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const prose = '**把 prompt 发出去之后日志最后 30～50 行贴给我**。我可以直接告诉你是：\n\n- 网络问题\n- 账号问题\n\n**普通加粗段落**\n\n```markdown\n## 代码示例里的标题\n```';
    const mapping = {
      u1: { parent: null, message: { id: 'u1', author: { role: 'user' }, content: { parts: ['omp 发 prompt 没响应'] } } },
      a1: { parent: 'u1', message: { id: 'a1', author: { role: 'assistant' }, content: { parts: [prose] } } },
    };
    const answer = '<div data-chatgpt-search-unit-key="turn:2:assistant"><div data-chatgpt-selection-message-id="a1"><div data-markdown-text-style="assistant-message"><p><strong>把 prompt 发出去之后日志最后 30～50 行贴给我</strong>。我可以直接告诉你是：</p><ul><li>网络问题</li><li>账号问题</li></ul><p><strong>普通加粗段落</strong></p><pre><code><h2>代码示例里的标题</h2></code></pre></div></div></div>';
    const html = '<!doctype html><main><div data-chatgpt-search-unit-key="turn:0:user" data-chatgpt-search-message-ids="u1"><div data-user-message-bubble>omp 发 prompt 没响应</div></div>' + (scenario === 'body-only-api' ? '' : answer) + '</main>';
    await page.route('https://chatgpt.com/**', (route) => {
      const url = route.request().url();
      if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
      if (url.includes('/backend-api/')) return scenario === 'body-only-fallback'
        ? route.fulfill({ status: 503, body: 'Unavailable' })
        : route.fulfill({ json: { mapping, current_node: 'a1' } });
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    await page.goto('https://chatgpt.com/c/prose-fixture');
    await page.addScriptTag({ content: source });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 1);
    await page.locator('#cgpt-toc .cn-item').hover();
    await page.waitForTimeout(260);
    assert.equal(await page.locator('#cgpt-sections .cn-item').count(), 0, `${scenario}: ordinary bold prose/list items were treated as answer headings`);
    assert(await page.locator('#cgpt-toc .cn-section-marker').evaluate((node) => node.hidden), `${scenario}: answer without headings must not show a section chevron`);
    console.log(`PASS: ${scenario}, prose, bold emphasis, lists and code examples stay out of the section nav`);
    await page.close();
  }
} finally {
  await browser.close();
}
