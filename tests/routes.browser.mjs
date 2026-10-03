// Conversation-only activation, including SPA entry/exit and pending request cancellation.
import fs from 'node:fs';
import { navigatorFixture } from './navigator-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const id = '11111111-1111-1111-1111-111111111111';
const org = '22222222-2222-2222-2222-222222222222';
const html = `<!doctype html><main><article data-turn="user"><div data-message-author-role="user" data-message-id="u1">Route question</div></article></main><div id="native" style="--scroll-nav-page-padding:15px">Native navigation</div>`;
const platforms = [
  { host: 'chatgpt.com', chats: [`/c/${id}`, `/g/g-p-project-name/c/${id}`, `/g/g-p-project/c/${id}`, `/g/g-custom-gpt/c/${id}/`], excluded: ['/', '/?temporary-chat=true', '/settings', '/g/g-p-project/project', '/g/g-custom-gpt', `/share/${id}`, `/other/c/${id}`, `/c/${id}/settings`, '/c/short'] },
  { host: 'chat.openai.com', chats: [`/c/${id}`], excluded: ['/', '/settings', `/share/${id}`] },
  { host: 'claude.ai', chats: [`/chat/${id}`], excluded: ['/', '/new', '/projects', `/project/${id}`, `/share/${id}`, `/chat/${id}/settings`, '/chat/short'] },
  { host: 'chat.deepseek.com', chats: [`/a/chat/s/${id}`], excluded: ['/', '/a/chat', `/a/chat/s/${id}/settings`, '/a/chat/s/short'] },
];
const browser = await chromium.launch({ headless: true });
try {
  for (const { host, chats, excluded } of platforms) {
    const hostHtml = host === 'claude.ai'
      ? html.replace('<article data-turn="user"><div data-message-author-role="user" data-message-id="u1">Route question</div></article>', '<div data-testid="transcript-row" data-index="0"><div data-testid="user-message">Route question</div></div>')
      : host === 'chat.deepseek.com'
        ? html.replace('<article data-turn="user"><div data-message-author-role="user" data-message-id="u1">Route question</div></article>', '<div data-virtual-list-item-key="1"><div class="ds-message"><div class="ds-collapsible-text">Route question</div></div></div>') : html;
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let requests = 0;
    await page.route(`https://${host}/**`, route => {
      const url = route.request().url();
      if (url.endsWith('/api/auth/session')) { requests++; return route.fulfill({ json: { accessToken: 'fixture' } }); }
      if (url.includes('/backend-api/conversation/')) {
        requests++;
        return route.fulfill({ json: { current_node: 'u1', mapping: { u1: { parent: null, message: { id: 'u1', author: { role: 'user' }, content: { parts: ['Route question'] } } } } } });
      }
      if (url.includes('/chat_conversations/')) {
        requests++;
        return route.fulfill({ json: { chat_messages: [{ uuid: 'u1', sender: 'human', content: [{ type: 'text', text: 'Route question' }] }] } });
      }
      if (url.includes('/api/v0/chat/history_messages')) {
        requests++;
        return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { current_message_id: 1 }, chat_messages: [{ message_id: 1, role: 'USER', fragments: [{ type: 'REQUEST', content: 'Route question' }] }] } } } });
      }
      return route.fulfill({ contentType: 'text/html', body: hostHtml });
    });
    await page.goto(`https://${host}/`);
    await page.evaluate(org => {
      document.cookie = `lastActiveOrg=${org};path=/`;
      localStorage.setItem('userToken', JSON.stringify({ value: 'fixture' }));
    }, org);
    await page.addScriptTag({ content: source });
    const absent = async () => {
      await page.waitForFunction(() => !document.querySelector('#cgpt-nav-box'));
      assert.equal(await page.locator('#cgpt-nav-style, #cgpt-nav-toast').count(), 0);
      assert.equal(await page.locator('#native').evaluate(node => getComputedStyle(node).visibility), 'visible');
    };
    const navigate = path => page.evaluate(path => history.pushState({}, '', path), path);
    await absent();
    for (const path of excluded) { await navigate(path); await absent(); }
    assert.equal(requests, 0, `${host}: excluded routes must not read chat history`);
    for (const path of chats) {
      // Entering from a non-chat route must work without a document reload.
      await navigate(path + '?test=1#message');
      await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1);
      assert.equal(await page.locator('#cgpt-nav-box').count(), 1);
      await navigate('/');
      await absent();
    }
    const afterChats = requests;
    await page.evaluate(() => {
      document.querySelector('main').insertAdjacentHTML('beforeend', '<article data-turn="user"><div data-message-author-role="user">Not a chat</div></article>');
      document.documentElement.classList.toggle('dark');
      document.dispatchEvent(new Event('scroll'));
    });
    await page.waitForTimeout(2200); // covers the route fallback/self-healing interval
    await absent();
    assert.equal(requests, afterChats);
    // Browser back restores the last chat and forward removes it again.
    await page.goBack();
    await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1);
    // The app may reuse the original DOM after back; it must remain navigable.
    await page.locator('#cgpt-toc .cn-item').click();
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => document.querySelector('#cgpt-nav-toast')?.textContent || ''), '');
    await page.goForward();
    await absent();
    assert.deepEqual(errors, []);
    console.log(`PASS: ${host}, chat paths, excluded pages, SPA entry/exit and back/forward`);
    await page.close();
  }

  // Leaving while authentication is pending must not start a chat-history request later.
  const page = await browser.newPage();
  let authStarted = false;
  let historyRequests = 0;
  await page.route('https://chatgpt.com/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/api/auth/session')) {
      authStarted = true;
      await new Promise(resolve => setTimeout(resolve, 350));
      return route.fulfill({ json: { accessToken: 'fixture' } }).catch(() => {});
    }
    if (url.includes('/backend-api/')) historyRequests++;
    return route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto(`https://chatgpt.com/c/${id}`);
  await page.addScriptTag({ content: source });
  const deadline = Date.now() + 10000;
  while (!authStarted && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert(authStarted, 'authentication request should start on the chat page');
  await page.evaluate(() => history.pushState({}, '', '/'));
  await page.waitForFunction(() => !document.querySelector('#cgpt-nav-box'));
  await page.waitForTimeout(600);
  assert.equal(historyRequests, 0);
  assert.equal(await page.locator('#cgpt-nav-box').count(), 0);
  console.log('PASS: leaving a chat cancels pending authentication/history work');
  await page.close();
} finally { await browser.close(); }
