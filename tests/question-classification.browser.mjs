// Observe every directory state, including transient assistant/skeleton shells.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { navigatorFixture } from './navigator-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const uuid = '11111111-1111-1111-1111-111111111111';
const providers = [
  { name: 'ChatGPT', host: 'chatgpt.com', path: '/c/classification-fixture', api: true,
    user: (n, t) => `<article data-turn="user"><div data-message-author-role="user" data-message-id="u${n}">${t}</div></article>`,
    assistant: n => `<article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a${n}"><h4 class="sr-only">ChatGPT said:</h4></div></article>`,
    unknown: '<article data-testid="conversation-turn-pending"><span>Loading response</span></article>' },
  { name: 'Claude', host: 'claude.ai', path: '/chat/classification-fixture', api: true,
    user: (n, t) => `<div data-testid="transcript-row" data-index="${n * 2}"><div data-testid="user-message">${t}</div></div>`,
    assistant: n => `<div data-testid="transcript-row" data-index="${n * 2 + 1}"><div data-testid="assistant-message"><h4 class="sr-only">Claude responded:</h4></div></div>`,
    unknown: '<div data-testid="transcript-row" data-index="3"><span>Loading response</span></div>' },
  { name: 'DeepSeek', host: 'chat.deepseek.com', path: '/a/chat/s/classification-fixture', api: true,
    user: (n, t) => `<div data-virtual-list-item-key="${n * 2 + 1}"><div class="ds-message"><div class="ds-collapsible-text">${t}</div></div></div>`,
    assistant: n => `<div data-virtual-list-item-key="${n * 2 + 2}"><div class="ds-message"><div class="ds-assistant-message-main-content"><span>DeepSeek response</span></div></div></div>`,
    unknown: '<div data-virtual-list-item-key="4"><div class="ds-message"><span>Loading response</span></div></div>' },
  { name: 'Gemini', host: 'gemini.google.com', path: '/app/1111111111111111',
    user: (n, t) => `<div class="conversation-container" id="turn-${n}"><user-query><p class="query-text-line">${t}</p></user-query></div>`,
    assistant: n => `<div class="conversation-container" id="answer-${n}"><model-response><message-content><div class="markdown">Gemini response</div></message-content></model-response></div>`,
    unknown: '<div class="conversation-container" id="pending"><span>Loading response</span></div>' },
  { name: 'Grok', host: 'grok.com', path: '/c/' + uuid,
    user: (n, t) => `<div data-plane-row="u${n}" style="transform:translateY(${n * 600}px)"><div id="response-u${n}"><div data-testid="user-message"><div class="relative">${t}</div></div></div></div>`,
    assistant: n => `<div id="response-a${n}"><div data-testid="assistant-message"><div class="response-content-markdown">Grok response</div></div></div>`,
    unknown: '<div id="response-pending"><span>Loading response</span></div>' },
  { name: 'Perplexity', host: 'www.perplexity.ai', path: '/search/' + uuid,
    user: (n, t) => `<div data-workflow-entry="${n}"><div class="group/user-bubble"><div data-renderer="lm">${t}</div></div></div>`,
    assistant: () => '<div data-workflow-final-text><div data-renderer="lm">Perplexity response</div></div>',
    unknown: '<div data-workflow-entry="1"><span>Loading response</span></div>' },
  { name: 'Qwen', host: 'chat.qwen.ai', path: '/c/' + uuid,
    user: (n, t) => `<div class="qwen-chat-message-user"><div class="chat-user-message-container" data-msg-id="u${n}"><p class="user-message-content">${t}</p></div></div>`,
    assistant: () => '<div class="qwen-chat-message-assistant"><div class="chat-response-message" id="chat-response-message-a1"><div class="phase-answer"><div class="qwen-markdown">Qwen response</div></div></div></div>',
    unknown: '<div class="qwen-chat-message-assistant"><span>Loading response</span></div>' },
  { name: 'Qianwen', host: 'www.qianwen.com', path: '/chat/' + '1'.repeat(32),
    user: (n, t) => `<div class="chat-round" data-chat="u${n}" data-chat-pos="${n}"><div class="chat-question-wrap"><div class="message-card-wrap question"><div class="question-text-card">${t}</div></div></div></div>`,
    assistant: () => '<div class="chat-round" data-chat="u1" data-chat-pos="1"><div class="chat-answers-card-wrap" data-chat-answers-wrap><div class="answer-common-card"><div class="qk-markdown">Qianwen response</div></div></div></div>',
    unknown: '<div class="chat-round" data-chat="u1" data-chat-pos="1"><span>Loading response</span></div>' },
];
function history(provider, newQuestion) {
  const texts = newQuestion ? ['Original question', 'New question'] : ['Original question'];
  if (provider.name === 'Claude') {
    const chat_messages = texts.flatMap((text, n) => [{ uuid: `u${n}`, parent_message_uuid: n ? `a${n - 1}` : null, sender: 'human', text }, { uuid: `a${n}`, parent_message_uuid: `u${n}`, sender: 'assistant', text: 'Answer text' }]);
    return { current_leaf_message_uuid: `a${texts.length - 1}`, chat_messages };
  }
  if (provider.name === 'DeepSeek') {
    const chat_messages = texts.flatMap((text, n) => [{ message_id: n * 2 + 1, parent_id: n * 2 || null, role: 'USER', fragments: [{ type: 'REQUEST', content: text }] }, { message_id: n * 2 + 2, parent_id: n * 2 + 1, role: 'ASSISTANT', fragments: [{ type: 'RESPONSE', content: 'Answer text' }] }]);
    return { code: 0, data: { biz_code: 0, biz_data: { chat_messages, chat_session: { current_message_id: texts.length * 2 } } } };
  }
  const mapping = Object.fromEntries(texts.flatMap((text, n) => [[`u${n}`, { parent: n ? `a${n - 1}` : null, message: { id: `u${n}`, author: { role: 'user' }, content: { parts: [text] } } }], [`a${n}`, { parent: `u${n}`, message: { id: `a${n}`, author: { role: 'assistant' }, content: { parts: ['Answer text'] } } }]]));
  return { mapping, current_node: `a${texts.length - 1}` };
}
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const provider of providers.filter(p => !process.env.CHATPICK_PROVIDER || p.name === process.env.CHATPICK_PROVIDER)) {
    for (const fallback of provider.api ? [false, true] : [true]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      let newQuestion = false;
      await page.route(`https://${provider.host}/**`, route => {
        if (route.request().url().endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
        if (!route.request().isNavigationRequest()) return fallback ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.fulfill({ json: history(provider, newQuestion) });
        return route.fulfill({ contentType: 'text/html', headers: provider.name === 'Gemini' ? { 'Content-Security-Policy': "require-trusted-types-for 'script'" } : {}, body: `<!doctype html><style>body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}#feed{padding:100px 40px 1400px}#feed>.w-full{min-height:450px;width:700px}user-query,model-response,message-content{display:block}</style><main id="feed" class="flex flex-col gap-2 message-list-content-container"><div class="w-full" id="slot0">${provider.user(0, 'Original question')}${provider.assistant(0)}</div><div class="w-full" id="slot1"></div></main>` });
      });
      await page.context().addCookies([{ name: 'lastActiveOrg', value: '00000000-0000-0000-0000-000000000001', domain: provider.host, path: '/' }]);
      await page.addInitScript(() => localStorage.setItem('userToken', JSON.stringify({ value: 'fixture' })));
      try {
        await page.goto(`https://${provider.host}${provider.path}`); await page.evaluate(source);
        await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1);
        await page.evaluate(() => {
          window.directoryStates = [];
          const record = () => window.directoryStates.push([...document.querySelectorAll('#cgpt-toc .cn-t')].map(node => node.textContent));
          record(); new MutationObserver(record).observe(document.getElementById('cgpt-toc'), { childList: true, subtree: true, characterData: true });
        });
        const replace = async html => {
          if (provider.name !== 'Gemini') return page.locator('#slot1').evaluate((node, html) => node.innerHTML = html, html);
          // Gemini CSP: only construct nodes; no HTML sinks in the fixture either.
          await page.evaluate(html => {
            const slot = document.getElementById('slot1'); slot.replaceChildren();
            const row = document.createElement('div'); row.className = 'conversation-container'; row.id = 'turn-1';
            const element = document.createElement(html.includes('user-query') ? 'user-query' : 'model-response');
            const p = document.createElement('p'); p.className = element.tagName === 'USER-QUERY' ? 'query-text-line' : 'markdown'; p.textContent = element.tagName === 'USER-QUERY' ? 'New question' : 'Loading response';
            element.append(p); row.append(element); slot.append(row);
          }, html);
        };
        await page.locator('#slot0').evaluate(node => node.replaceChildren());
        // An assistant shell becomes the only mounted turn while new rows settle.
        await replace(provider.assistant(1)); await page.waitForTimeout(650);
        assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), ['Original question'], 'Assistant labels and answers must never join the question directory');
        await replace(provider.unknown); await page.waitForTimeout(650);
        assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), ['Original question'], 'Unclassified loading shells must not be guessed as questions');
        newQuestion = true;
        await replace(provider.user(1, 'New question')); await page.waitForTimeout(900);
        assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), ['Original question', 'New question']);
        const allowed = new Set(['Original question', 'New question']);
        assert((await page.evaluate(() => window.directoryStates)).every(state => state.every(text => allowed.has(text))), 'No transient assistant label or loading row appeared at any point');
        if (provider.name === 'ChatGPT') {
          await page.locator('#feed').evaluate((node, html) => {
            const slot = document.createElement('div'); slot.className = 'w-full'; slot.innerHTML = html; node.append(slot);
          }, provider.user(2, 'ChatGPT said:'));
          await page.waitForTimeout(650);
          assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), ['Original question', 'New question', 'ChatGPT said:'],
            'Literal user text is retained; classification must not use a keyword blacklist');
        }
        assert.deepEqual(errors, []);
        console.log(`PASS: ${provider.name} ${fallback ? 'DOM' : 'API'} assistant-only/loading/new-question transitions`);
      } catch (error) {
        failures.push(`${provider.name} ${fallback ? 'DOM' : 'API'}: ${error.message}`);
        console.log(`FAIL: ${provider.name} ${fallback ? 'DOM' : 'API'}: ${error.message}`);
      } finally { await page.close(); }
    }
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], 'Question classification regressions');
