// Actual production extension and popup, isolated profile and synthetic pages.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(import.meta.dirname, '../.output/chrome-mv3');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatpick-sites-test-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1000, height: 720 }, reducedMotion: 'reduce',
  ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${output}`, `--load-extension=${output}`],
});
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
const id = '11111111-1111-1111-1111-111111111111';
const providers = [
  ['chatgpt', 'chatgpt.com', '/c/' + id], ['chatgpt', 'chat.openai.com', '/c/' + id],
  ['claude', 'claude.ai', '/chat/' + id], ['deepseek', 'chat.deepseek.com', '/a/chat/s/' + id],
  ['gemini', 'gemini.google.com', '/u/2/app/1111111111111111'], ['grok', 'grok.com', '/c/' + id],
  ['perplexity', 'www.perplexity.ai', '/search/' + id], ['qwen', 'chat.qwen.ai', '/c/' + id],
  ['qianwen', 'www.qianwen.com', '/chat/' + id.replaceAll('-', '')], ['qianwen', 'qianwen.com', '/chat/' + id.replaceAll('-', '')],
];
const question = 'Help me build a simple learning routine.';
function html(site) {
  const user = site === 'claude' ? `<div data-testid="transcript-row" data-index="0"><div data-testid="user-message">${question}</div></div>`
    : site === 'deepseek' ? `<div data-virtual-list-item-key="1"><div class="ds-message"><div class="ds-collapsible-text">${question}</div></div></div>`
      : `<article data-turn="user"><div data-message-author-role="user" data-message-id="u1">${question}</div></article>`;
  return `<!doctype html><html lang="en"><style>body{margin:0;background:white}main{padding:100px 40px;height:1600px}#native{position:fixed;right:20px;top:50px;width:110px}.ds-virtual-list{height:90px;overflow:auto}.native-item{height:30px;cursor:pointer}</style><main>${user}</main><div id="native" style="--scroll-nav-page-padding:15px"><div class="ds-virtual-list"><div class="ds-virtual-list-visible-items" style="--dsl-virtual-list-transform-y:0px">${Array.from({ length: 8 }, (_, i) => `<div class="native-item"><div>${i === 0 ? question : 'Example question ' + i}</div><div></div></div>`).join('')}</div></div></div><script>window.fixtureNative=document.getElementById('native');document.querySelector('.native-item').onclick=()=>{document.body.dataset.nativeClicks=String(Number(document.body.dataset.nativeClicks||0)+1)}</script></html>`;
}
const chatgptHistory = { title: 'Learning routine', current_node: 'u1', mapping: { u1: { parent: null, message: { id: 'u1', author: { role: 'user' }, content: { parts: [question] } } } } };
let popup;
async function stored() { return popup.evaluate(() => chrome.storage.local.get(null)); }
async function openPopup(page) {
  // Query the active chat before focusing this standalone popup tab for input.
  await page.bringToFront();
  await popup.reload({ waitUntil: 'commit' });
  const toggle = popup.locator('.site-setting [role="switch"]');
  await popup.waitForFunction(() => {
    const button = document.querySelector('.site-setting button');
    return button && !button.disabled;
  });
  await popup.bringToFront();
  return toggle;
}
async function changeSite(page, toggle, keyboard = false) {
  await popup.bringToFront();
  if (keyboard) await toggle.press('Space');
  else await toggle.click();
  await page.bringToFront();
}
const absent = page => page.waitForFunction(() => !document.querySelector('#cgpt-nav-box, #cgpt-nav-style, #cgpt-nav-toast'));
try {
  const manager = await context.newPage();
  await manager.goto('chrome://extensions/');
  const extensionId = await manager.locator('extensions-item').first().getAttribute('id');
  assert.ok(extensionId);
  await manager.close();
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.evaluate(() => chrome.storage.local.set({ language: 'en' }));
  const pages = [];
  for (const [site, host, routePath] of providers) {
    await popup.evaluate(() => chrome.storage.local.set({ disabledSites: [] }));
    const page = await context.newPage();
    let requests = 0;
    await page.route(`https://${host}/**`, route => {
      const url = route.request().url();
      if (url.endsWith('/api/auth/session')) { requests++; return route.fulfill({ json: { accessToken: 'synthetic-fixture' } }); }
      if (url.includes('/backend-api/')) { requests++; return route.fulfill({ json: chatgptHistory }); }
      if (url.includes('/api/organizations/')) { requests++; return route.fulfill({ json: { chat_messages: [{ uuid: 'u1', sender: 'human', text: question, content: [{ type: 'text', text: question }] }] } }); }
      if (url.includes('/api/v0/chat/history_messages')) { requests++; return route.fulfill({ json: { code: 0, data: { biz_code: 0, biz_data: { chat_session: { current_message_id: 1 }, chat_messages: [{ message_id: 1, role: 'USER', fragments: [{ type: 'REQUEST', content: question }] }] } } } }); }
      return route.fulfill({ contentType: 'text/html', body: html(site) });
    });
    await context.addCookies([{ name: 'lastActiveOrg', value: '00000000-0000-0000-0000-000000000001', domain: host, path: '/' }]);
    await page.addInitScript(() => localStorage.setItem('userToken', JSON.stringify({ value: 'synthetic-fixture' })));
    await page.goto(`https://${host}${routePath}`);
    await page.locator('#cgpt-nav-box').waitFor();
    let toggle = await openPopup(page);
    assert.equal(await toggle.getAttribute('aria-checked'), 'true', `${host}: enabled by default`);
    assert.equal(await toggle.evaluate(el => [...document.querySelectorAll('[role="switch"]')].indexOf(el)), 0, 'Site switch is the first control');
    if (site === 'deepseek') {
      await page.bringToFront();
      await page.waitForFunction(() => document.documentElement.classList.contains('chatpick-deepseek-active'));
      assert.equal(await page.locator('#native').evaluate(el => getComputedStyle(el).visibility), 'hidden');
      await page.locator('.ds-virtual-list').evaluate(el => { el.scrollTop = 30; window.fixtureNativeDimensions = [el.clientWidth, el.clientHeight, el.scrollHeight, el.scrollTop]; });
    }
    await changeSite(page, toggle);
    await absent(page);
    assert.deepEqual((await stored()).disabledSites, [site]);
    if (site === 'deepseek') {
      assert.equal(await page.locator('#native').evaluate(el => el === window.fixtureNative && getComputedStyle(el).visibility === 'visible'), true, 'Restore the original native element');
      assert.equal(await page.locator('.ds-virtual-list').evaluate(el => JSON.stringify([el.clientWidth, el.clientHeight, el.scrollHeight, el.scrollTop]) === JSON.stringify(window.fixtureNativeDimensions)), true, 'Preserve native list size and scroll position');
      await page.locator('.ds-virtual-list').evaluate(el => el.scrollTop = 0);
      await page.locator('.native-item').first().click();
      assert.equal(await page.locator('body').getAttribute('data-native-clicks'), '1', 'Original handler remains usable');
    }
    const beforeReload = requests;
    await page.reload();
    await page.waitForTimeout(150);
    await absent(page);
    assert.equal(requests, beforeReload, `${host}: persisted opt-out prevents even initial history/auth reads`);
    toggle = await openPopup(page);
    assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'Popup reopening preserves opt-out');
    await page.bringToFront();
    await page.evaluate(routePath => { history.pushState({}, '', '/'); history.pushState({}, '', routePath); }, routePath);
    await page.waitForTimeout(2200);
    await absent(page);
    assert.equal(requests, beforeReload, 'SPA entry and fallback timer do not re-enable a disabled website');
    await changeSite(page, toggle, true);
    await page.locator('#cgpt-nav-box').waitFor();
    if (site === 'deepseek') await page.waitForFunction(() => document.documentElement.classList.contains('chatpick-deepseek-active'));
    assert.deepEqual((await stored()).disabledSites, []);
    pages.push(page);
    console.log(`PASS: ${host}, default enabled, popup toggle, persistence, SPA scope${site === 'deepseek' ? ', original native navigation restored' : ''}`);
  }
  // Changes are independent across providers; aliases share the same preference.
  await popup.evaluate(() => chrome.storage.local.set({ disabledSites: ['chatgpt'] }));
  await absent(pages[0]); await absent(pages[1]);
  assert.ok(await pages[3].locator('#cgpt-nav-box').isVisible());
  let toggle = await openPopup(pages[3]); await changeSite(pages[3], toggle);
  assert.deepEqual((await stored()).disabledSites, ['chatgpt', 'deepseek']);
  toggle = await openPopup(pages[0]); await changeSite(pages[0], toggle);
  assert.deepEqual((await stored()).disabledSites, ['deepseek']);
  await pages[0].locator('#cgpt-nav-box').waitFor(); await pages[1].locator('#cgpt-nav-box').waitFor();
  await absent(pages[3]);
  await popup.evaluate(() => chrome.storage.local.set({ disabledSites: ['qianwen', 'not-supported', 'https://example.com/private', 'qianwen'] }));
  await absent(pages[8]); await absent(pages[9]);
  toggle = await openPopup(pages[9]); await changeSite(pages[9], toggle);
  assert.deepEqual((await stored()).disabledSites, [], 'Only supported provider IDs are retained');
  console.log('PASS: independent providers, shared host aliases, validated settings');

  // Disable while authentication is pending: no subsequent history read/download.
  const pending = await context.newPage();
  let authStarted = false, historyReads = 0, finishAuth, holdHistory = false, finishHistory;
  const auth = new Promise(resolve => { finishAuth = resolve; });
  const history = new Promise(resolve => { finishHistory = resolve; });
  await pending.route('https://chatgpt.com/**', async route => {
    const url = route.request().url();
    if (url.endsWith('/api/auth/session')) { authStarted = true; await auth; return route.fulfill({ json: { accessToken: 'synthetic-fixture' } }).catch(() => {}); }
    if (url.includes('/backend-api/')) { historyReads++; if (holdHistory) await history; return route.fulfill({ json: chatgptHistory }).catch(() => {}); }
    return route.fulfill({ contentType: 'text/html', body: html('chatgpt') });
  });
  await pending.goto(`https://chatgpt.com/c/${id}`);
  const deadline = Date.now() + 5000;
  while (!authStarted && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(authStarted);
  toggle = await openPopup(pending); await changeSite(pending, toggle); await absent(pending);
  finishAuth(); await pending.waitForTimeout(300);
  assert.equal(historyReads, 0);
  console.log('PASS: disabling cancels pending authentication before history reads');

  toggle = await openPopup(pending); await changeSite(pending, toggle);
  await pending.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 1);
  let downloads = 0;
  pending.on('download', () => downloads++);
  holdHistory = true;
  await pending.locator('#chatpick-export-button').click();
  await pending.locator('[data-format="markdown"]').click();
  const exportDeadline = Date.now() + 5000;
  while (historyReads < 2 && Date.now() < exportDeadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(historyReads, 2);
  toggle = await openPopup(pending); await changeSite(pending, toggle); await absent(pending);
  finishHistory(); await pending.waitForTimeout(300);
  assert.equal(downloads, 0, 'Disabling cancels an in-flight export instead of downloading later');
  console.log('PASS: disabling cancels pending export and removes its menu');

  await popup.evaluate(() => chrome.storage.local.set({ language: 'zh' }));
  await openPopup(pages[9]);
  assert.ok(await popup.getByRole('switch', { name: '在此网站启用', exact: true }).isVisible());
  assert.equal(await popup.locator('.site-setting-hint').textContent(), '千问');
  if (process.env.CHATPICK_SITE_SETTINGS_SCREENSHOT) {
    await popup.setViewportSize({ width: 340, height: 560 });
    await popup.locator('main.popup').screenshot({ path: process.env.CHATPICK_SITE_SETTINGS_SCREENSHOT });
  }
  await popup.evaluate(() => chrome.storage.local.set({ language: 'en' }));

  // Outside a matched website the top switch explains why it is unavailable.
  const unsupported = await context.newPage(); await unsupported.goto('about:blank'); await unsupported.bringToFront();
  await popup.reload({ waitUntil: 'commit' });
  await popup.getByText('Open a supported chat website to use this switch.', { exact: true }).waitFor();
  assert.ok(await popup.getByRole('switch', { name: 'Enable on this website', exact: true }).isDisabled());
  assert.deepEqual(errors, []);
  assert.ok(Object.keys(await stored()).every(key => ['theme', 'language', 'colors', 'showExport', 'showJumpButtons', 'disabledSites'].includes(key)), 'Only preferences are stored');
  console.log('PASS: unsupported popup context and preference-only storage');
} finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
