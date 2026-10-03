// Synthetic sends on every provider; preserve empty virtual-list slots and stable IDs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { navigatorFixture } from './navigator-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const uuid = '11111111-1111-1111-1111-111111111111';
const questions = ['First question', 'Second question', 'Third question', 'New question', 'New question'];
const providers = [
  { name: 'ChatGPT', host: 'chatgpt.com', path: '/c/new-questions-fixture', api: true, markup: (n, t) => `<div data-chatgpt-search-unit-key="turn-u${n}:0:user" data-chatgpt-search-message-ids="u${n}"><div data-content-search-unit-key="turn-u${n}:0:user"><div data-user-message-bubble>${t}</div></div></div>` },
  { name: 'Claude', host: 'claude.ai', path: '/chat/new-questions-fixture', api: true, markup: (n, t) => `<div data-testid="transcript-row" data-index="${n}"><div data-testid="user-message">${t}</div></div>` },
  { name: 'DeepSeek', host: 'chat.deepseek.com', path: '/a/chat/s/new-questions-fixture', api: true, markup: (n, t) => `<div data-virtual-list-item-key="${n + 1}"><div class="ds-message"><div class="ds-collapsible-text">${t}</div></div></div>` },
  { name: 'Gemini', host: 'gemini.google.com', path: '/app/1111111111111111', markup: (n, t) => `<div class="conversation-container" id="turn-${n}"><user-query><p class="query-text-line">${t}</p></user-query></div>` },
  { name: 'Grok', host: 'grok.com', path: '/c/' + uuid, markup: (n, t) => `<div data-plane-row="u${n}" style="transform:translateY(${n * 650}px)"><div id="response-u${n}"><div data-testid="user-message"><div class="relative">${t}</div></div></div></div>` },
  { name: 'Perplexity', host: 'www.perplexity.ai', path: '/search/' + uuid, markup: (n, t) => `<div data-workflow-entry="${n}"><div class="group/user-bubble"><div data-renderer="lm">${t}</div></div></div>` },
  { name: 'Qwen', host: 'chat.qwen.ai', path: '/c/' + uuid, markup: (n, t) => `<div class="qwen-chat-message-user"><div class="chat-user-message-container" data-msg-id="u${n}"><p class="user-message-content">${t}</p></div></div>` },
  { name: 'Qianwen', host: 'www.qianwen.com', path: '/chat/' + '1'.repeat(32), markup: (n, t) => `<div class="chat-round" data-chat="u${n}" data-chat-pos="${n}"><div class="chat-question-wrap"><div class="message-card-wrap question"><div class="question-text-card">${t}</div></div></div></div>` },
];
function history(provider) {
  const initial = questions.slice(0, 3);
  if (provider.name === 'Claude') return { current_leaf_message_uuid: 'u2', chat_messages: initial.map((text, n) => ({ uuid: `u${n}`, parent_message_uuid: n ? `u${n - 1}` : null, sender: 'human', text })) };
  if (provider.name === 'DeepSeek') return { code: 0, data: { biz_code: 0, biz_data: { chat_session: { current_message_id: 3 }, chat_messages: initial.map((text, n) => ({ message_id: n + 1, parent_id: n || null, role: 'USER', fragments: [{ type: 'REQUEST', content: text }] })) } } };
  return { current_node: 'u2', mapping: Object.fromEntries(initial.map((text, n) => [`u${n}`, { parent: n ? `u${n - 1}` : null, message: { id: `u${n}`, author: { role: 'user' }, content: { parts: [text] } } }])) };
}
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const provider of providers.filter(p => !process.env.CHATPICK_PROVIDER || p.name === process.env.CHATPICK_PROVIDER)) {
    for (const scenario of ['mounted', 'sparse', 'late-visibility', ...(provider.api ? ['reconcile', 'changed-branch', 'fallback-sparse'] : [])]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      let requests = 0, release;
      const delayed = new Promise(resolve => { release = resolve; });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.route(`https://${provider.host}/**`, async route => {
        if (route.request().url().endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'fixture' } });
        if (!route.request().isNavigationRequest()) {
          requests++;
          if (scenario === 'fallback-sparse') return route.fulfill({ status: 503, body: 'Unavailable' });
          if (['reconcile', 'changed-branch'].includes(scenario) && requests > 1) await delayed;
          const data = history(provider);
          if (scenario === 'changed-branch' && requests > 1) {
            if (provider.name === 'Claude') {
              Object.assign(data.chat_messages.at(-1), { uuid: 'replacement', text: 'Changed question' });
              data.current_leaf_message_uuid = 'replacement';
            } else if (provider.name === 'DeepSeek') {
              Object.assign(data.data.biz_data.chat_messages.at(-1), { message_id: 99, fragments: [{ type: 'REQUEST', content: 'Changed question' }] });
              data.data.biz_data.chat_session.current_message_id = 99;
            } else {
              Object.assign(data.mapping.u2.message, { id: 'replacement', content: { parts: ['Changed question'] } });
            }
          }
          return route.fulfill({ json: data }).catch(() => {});
        }
        return route.fulfill({ contentType: 'text/html', headers: provider.name === 'Gemini' ? { 'Content-Security-Policy': "require-trusted-types-for 'script'" } : {}, body: `<!doctype html><style>body{margin:0;font:14px system-ui}#feed{padding:100px 40px 1200px}#feed>.w-full{min-height:650px;width:700px}user-query{display:block}</style><main id="feed" class="flex flex-col gap-2 message-list-content-container">${questions.map((t, n) => `<div class="w-full" id="slot-${n}">${n < 3 ? provider.markup(n, t) : ''}</div>`).join('')}</main>` });
      });
      await page.context().addCookies([{ name: 'lastActiveOrg', value: '00000000-0000-0000-0000-000000000001', domain: provider.host, path: '/' }]);
      await page.addInitScript(() => localStorage.setItem('userToken', JSON.stringify({ value: 'fixture' })));
      try {
        await page.goto(`https://${provider.host}${provider.path}`); await page.evaluate(source);
        await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 3);
        const append = async n => {
          if (provider.name !== 'Gemini') return page.locator('#slot-' + n).evaluate((node, html) => node.innerHTML = html, provider.markup(n, questions[n]));
          await page.evaluate(({ n, t }) => {
            const row = document.createElement('div'); row.className = 'conversation-container'; row.id = 'turn-' + n;
            const user = document.createElement('user-query'), p = document.createElement('p'); p.className = 'query-text-line'; p.textContent = t;
            user.append(p); row.append(user); document.getElementById('slot-' + n).append(row);
          }, { n, t: questions[n] });
        };
        if (scenario.endsWith('sparse')) await page.evaluate(() => { for (let n = 0; n < 3; n++) document.getElementById('slot-' + n).replaceChildren(); });
        if (scenario === 'late-visibility') await page.evaluate(() => document.getElementById('slot-3').hidden = true);
        await append(3);
        if (scenario === 'late-visibility') { await page.waitForTimeout(500); await page.evaluate(() => document.getElementById('slot-3').hidden = false); }
        await page.waitForTimeout(900);
        assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), questions.slice(0, 4), 'New question appears automatically in the correct order');
        if (['reconcile', 'changed-branch'].includes(scenario)) {
          assert(requests > 1, 'Reconciliation is in flight');
          await append(4); await page.waitForTimeout(650);
          assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), questions, 'New questions appear while a history read is pending');
          await page.evaluate(() => { for (let n = 0; n < 5; n++) document.getElementById('slot-' + n).replaceChildren(); });
          release(); await page.waitForTimeout(600);
          assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), scenario === 'changed-branch' ? [...questions.slice(0, 2), 'Changed question'] : questions,
            scenario === 'changed-branch' ? 'A different active branch replaces pending questions from the old branch' : 'Stale history retains unmounted new questions');
        } else if (provider.name !== 'Grok') {
          await page.locator('#cgpt-toc .cn-item').nth(3).click();
          assert(Math.abs(await page.locator('#slot-3>div').evaluate(n => n.getBoundingClientRect().top) - 72) < 2, 'New question jump resolves');
        }
        assert.deepEqual(errors, []); console.log(`PASS: ${provider.name} ${scenario}`);
      } catch (error) { failures.push(`${provider.name} ${scenario}: ${error.message}`); console.log(`FAIL: ${provider.name} ${scenario}: ${error.message}`); }
      finally { release(); await page.close(); }
    }
  }
} finally { await browser.close(); }
assert.deepEqual(failures, [], 'New question regression failures');
