// Real production extension, including privileged APIs and separate execution
// worlds. Every provider request uses synthetic fixtures; no account is needed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);
const playwright = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const target = process.env.CHATPICK_BROWSER || 'chrome';
assert.ok(['chrome', 'firefox', 'edge'].includes(target), 'CHATPICK_BROWSER must be chrome, firefox, or edge');
const extension = path.resolve(import.meta.dirname, `../.output/${target}-mv3`);
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.ok(manifest.content_scripts.some(script => script.world === 'MAIN'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), `chatpick-${target}-test-`));
const uuid = '33333333-3333-4333-8333-333333333333';
let context, remote;

async function firefoxPopupEvaluate(consoleActor, fn, arg) {
  // Juggler does not observe privileged moz-extension pages. Firefox's native
  // console actor evaluates against the real loaded popup and extension APIs.
  const client = remote.client;
  const handle = client._handleMessage.bind(client);
  let timeout;
  const result = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('Firefox popup evaluation timed out')), 10000);
    client._handleMessage = packet => {
      if (packet.type !== 'evaluationResult' || packet.from !== consoleActor) return handle(packet);
      if (packet.hasException || packet.topLevelAwaitRejected) return reject(new Error(packet.exceptionMessage || 'Firefox popup evaluation failed'));
      resolve(packet.result);
    };
  });
  try {
    await client.request({
      to: consoleActor, type: 'evaluateJSAsync', mapped: { await: true },
      text: `(async () => { try { return JSON.stringify({ ok: true, value: await (${fn.toString()})(${JSON.stringify(arg) ?? 'undefined'}) }); } catch (error) { return JSON.stringify({ ok: false, error: error.message }); } })()`,
    });
    const value = await result;
    assert.equal(typeof value, 'string', 'Firefox popup evaluator returns serialized data');
    const parsed = JSON.parse(value);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  } finally {
    clearTimeout(timeout);
    client._handleMessage = handle;
  }
}

async function launch() {
  if (target === 'firefox') {
    // web-ext installs the add-on temporarily through Firefox's localhost
    // debugger. The disposable profile never changes signature verification.
    const remoteModule = pathToFileURL(path.join(path.dirname(require.resolve('web-ext')), 'lib/firefox/remote.js')).href;
    const { findFreeTcpPort, connectWithMaxRetries } = await import(remoteModule);
    const port = await findFreeTcpPort();
    const addonId = manifest.browser_specific_settings?.gecko?.id;
    assert.ok(addonId, 'Firefox requires a stable add-on ID');
    context = await playwright.firefox.launchPersistentContext(profile, {
      headless: true, acceptDownloads: true, downloadsPath: path.join(profile, 'downloads'), viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce',
      args: ['-start-debugger-server', String(port)],
      firefoxUserPrefs: {
        'devtools.debugger.remote-enabled': true,
        'devtools.debugger.prompt-connection': false,
        'devtools.debugger.force-local': true,
        'extensions.webextensions.uuids': JSON.stringify({ [addonId]: uuid }),
      },
    });
    remote = await connectWithMaxRetries({ port });
    await remote.installTemporaryAddon(extension, false);
    return `moz-extension://${uuid}`;
  }
  context = await playwright.chromium.launchPersistentContext(profile, {
    channel: target === 'edge' ? 'msedge' : 'chromium', headless: true, acceptDownloads: true,
    executablePath: process.env.CHATPICK_BROWSER_EXECUTABLE || undefined,
    downloadsPath: path.join(profile, 'downloads'),
    viewport: { width: 1100, height: 800 }, reducedMotion: 'reduce', ignoreDefaultArgs: ['--disable-extensions'],
    args: target === 'edge' ? ['--enable-unsafe-extension-debugging']
      : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (target === 'edge') {
    // Branded browsers removed --load-extension. Their native CDP installation
    // command is restricted to this disposable profile and the debugging pipe.
    const session = await context.browser().newBrowserCDPSession();
    try {
      const { id } = await session.send('Extensions.loadUnpacked', { path: extension });
      assert.ok(id, 'Production Edge extension is installed');
      return `chrome-extension://${id}`;
    } finally {
      await session.detach();
    }
  }
  const manager = await context.newPage();
  await manager.goto(target === 'edge' ? 'edge://extensions/' : 'chrome://extensions/');
  const extensionId = await manager.locator('extensions-item').first().getAttribute('id');
  assert.ok(extensionId, 'Production extension is installed');
  await manager.close();
  return `chrome-extension://${extensionId}`;
}

const chatId = '11111111-1111-4111-8111-111111111111';
const question = 'Repeat this question 中文';
const mapping = {};
let parent = null;
for (const [id, role, text, channel] of [
  ['u1', 'user', question], ['a1', 'assistant', '## API first heading\n\nFirst answer 中文'],
  ['u2', 'user', question], ['reasoning', 'assistant', 'PRIVATE_REASONING', 'analysis'],
  ['a2', 'assistant', '## API second heading\n\nSecond answer 中文'],
]) {
  mapping[id] = { parent, message: { id, author: { role }, channel, content: { parts: [text] } } };
  parent = id;
}
mapping.sibling = { parent: 'u2', message: { id: 'sibling', author: { role: 'assistant' }, content: { parts: ['WRONG_BRANCH'] } } };
const html = `<!doctype html><html lang="en"><title>Synthetic compatibility conversation</title>
  <style>body{margin:0;background:white}main{padding:100px 60px}article{margin:100px 0}.spacer{height:500px}.sr-only{position:absolute;width:1px;height:1px;clip:rect(0,0,0,0);overflow:hidden}footer{height:1200px}</style>
  <main>${[1, 2].map(i => `<article data-turn="user"><h5 class="sr-only">You said:</h5><div data-message-author-role="user" data-message-id="u${i}">${question}</div></article>
    <article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a${i}"><div class="thinking-container"><h2>PRIVATE_REASONING</h2></div>
    <div class="markdown"><h2>Rendered heading ${i}</h2><p>Answer ${i} 中文</p><strong>Ordinary bold text</strong><pre><code># Code heading</code></pre><div class="spacer"></div></div></div></article>`).join('')}</main><footer></footer></html>`;

try {
  const base = await launch();
  context.setDefaultTimeout(10000);
  context.setDefaultNavigationTimeout(10000);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  let historyReads = 0;
  const pdfResources = [];
  context.on('request', request => {
    if (/\/(?:pdf-export\.js|NotoSansSC-Regular\.ttf)$/.test(request.url())) pdfResources.push(request.url());
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.protocol === 'moz-extension:' || url.protocol === 'chrome-extension:') return route.continue();
    if (url.hostname !== 'chatgpt.com') return route.abort();
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    if (url.pathname === '/api/auth/session') { historyReads++; return route.fulfill({ json: { accessToken: 'synthetic-fixture' } }); }
    if (url.pathname.startsWith('/backend-api/conversation/')) { historyReads++; return route.fulfill({ json: { title: 'Synthetic compatibility 中文', current_node: 'a2', mapping } }); }
    return route.fulfill({ status: 404 });
  });
  const popup = await context.newPage();
  let evaluatePopup = (fn, arg) => popup.evaluate(fn, arg);
  if (target === 'firefox') {
    await popup.goto(`${base}/popup.html`, { waitUntil: 'commit', timeout: 1000 }).catch(error => {
      if (error.name !== 'TimeoutError') throw error;
    });
    const { tabs } = await remote.client.request('listTabs');
    const nativePopup = tabs.find(tab => tab.url === `${base}/popup.html`);
    assert.ok(nativePopup, 'Firefox loaded the real extension popup');
    const { frame } = await remote.client.request({ to: nativePopup.actor, type: 'getTarget' });
    evaluatePopup = (fn, arg) => firefoxPopupEvaluate(frame.consoleActor, fn, arg);
    assert.ok((await evaluatePopup(() => document.body.textContent)).includes('ChatPick'), 'Firefox renders the real React popup');
  } else await popup.goto(`${base}/popup.html`);
  const stored = () => evaluatePopup(() => (globalThis.browser || globalThis.chrome).storage.local.get(null));
  const set = next => evaluatePopup(next => (globalThis.browser || globalThis.chrome).storage.local.set(next), next);
  await set({ disabledSites: ['chatgpt'], language: 'en' });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.fixtureBridgeEvents = [];
    window.addEventListener('message', event => {
      if (!/^chatpick:/.test(event.data?.source || '')) return;
      window.fixtureBridgeEvents.push({ source: event.data.source, type: event.data.type, sameWindow: event.source === window, origin: event.origin, ok: event.data.ok });
    });
  });
  await page.goto(`https://chatgpt.com/c/${chatId}`);
  const absent = () => page.waitForFunction(() => !document.querySelector('#cgpt-nav-box, #cgpt-nav-style, #cgpt-nav-toast, #chatpick-export-panel'));
  await page.waitForTimeout(1200);
  await absent();
  assert.equal(historyReads, 0, 'Stored opt-out gates MAIN-world authentication/history reads');
  await set({ disabledSites: [] });
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 2);
  console.log(`PASS ${target}: real MAIN/isolated bridge and persisted opt-out before provider reads`);
  assert.deepEqual(await page.locator('#cgpt-toc .cn-t').allTextContents(), [question, question], 'Repeated text retains two message identities');
  assert.equal(pdfResources.length, 0, 'Navigation does not load PDF resources');

  // Use the real popup-to-content-script message handlers and storage updates.
  await page.bringToFront();
  if (target === 'firefox') {
    assert.equal(await evaluatePopup(async () => {
      const [tab] = await browser.tabs.query({ url: 'https://chatgpt.com/*' });
      if (!tab) throw new Error('Firefox cannot identify the synthetic chat tab');
      return browser.tabs.sendMessage(tab.id, { type: 'chatpick:get-site' });
    }), 'chatgpt', 'Real Firefox popup/content-script messaging');
    await set({ disabledSites: ['chatgpt'] });
    await absent();
    await set({ disabledSites: [] });
  } else {
    await popup.reload({ waitUntil: 'commit' });
    const siteSwitch = popup.getByRole('switch', { name: 'Enable on this website', exact: true });
    await popup.waitForFunction(() => {
      const button = document.querySelector('.site-setting button');
      return button && !button.disabled;
    });
    assert.equal(await popup.locator('.site-setting-hint').textContent(), 'ChatGPT');
    await popup.bringToFront();
    await siteSwitch.click();
    await absent();
    assert.deepEqual((await stored()).disabledSites, ['chatgpt']);
    await siteSwitch.click();
  }
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 2);
  assert.ok(await page.locator('#cgpt-nav-box').evaluate(el => Math.abs(innerWidth - el.getBoundingClientRect().right - 18) < 1), 'Existing installations default to the right');
  if (target === 'firefox') await set({ position: 'left' });
  else {
    await popup.bringToFront();
    await popup.getByRole('combobox', { name: 'Position Right', exact: true }).click();
    await popup.getByRole('option', { name: 'Left', exact: true }).click();
    await popup.getByRole('combobox', { name: 'Position Left', exact: true }).waitFor();
  }
  await page.bringToFront();
  await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 18) < 1);
  assert.equal((await stored()).position, 'left', 'Popup choice is persisted through the real extension API');
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 2 && Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 18) < 1);
  console.log(`PASS ${target}: left placement applies immediately and survives page reload`);

  await page.locator('#cgpt-toc .cn-item').nth(1).click();
  await page.waitForFunction(() => Math.abs(document.querySelector('[data-message-id="u2"]').getBoundingClientRect().top - 72) < 2);
  await page.locator('#cgpt-toc .cn-item').nth(1).hover();
  await page.waitForFunction(() => document.querySelector('#cgpt-sections .cn-t')?.textContent === 'Rendered heading 2');
  assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), ['Rendered heading 2'], 'Use rendered final-answer headings only');
  await page.locator('#cgpt-sections .cn-item').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('[data-message-id="a2"] .markdown h2').getBoundingClientRect().top - 72) < 2);
  assert.equal(await page.locator('#cgpt-nav-toast').count(), 0, 'Stable question/section jumps succeed');

  await page.locator('#chatpick-export-button').click();
  await page.evaluate(() => {
    const sidebar = document.createElement('aside');
    sidebar.id = 'fixture-sidebar'; sidebar.style.cssText = 'position:fixed;left:0;top:0;bottom:0;width:240px';
    document.body.prepend(sidebar); document.querySelector('main').style.marginLeft = '240px';
  });
  await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 258) < 1);
  await page.waitForFunction(() => {
    const panel = document.getElementById('chatpick-export-panel').getBoundingClientRect();
    const button = document.getElementById('chatpick-export-button').getBoundingClientRect();
    return panel.left >= button.right + 9 && panel.right <= innerWidth - 12;
  });
  await page.evaluate(() => { document.getElementById('fixture-sidebar').remove(); document.querySelector('main').style.marginLeft = ''; });
  await page.waitForFunction(() => Math.abs(document.getElementById('cgpt-nav-box').getBoundingClientRect().left - 18) < 1);
  await page.waitForFunction(() => document.getElementById('chatpick-export-panel').getBoundingClientRect().left < 120);
  await set({ position: 'right' });
  await page.waitForFunction(() => {
    const panel = document.getElementById('chatpick-export-panel').getBoundingClientRect();
    const button = document.getElementById('chatpick-export-button').getBoundingClientRect();
    return panel.left >= 12 && panel.right <= button.left - 9;
  });
  await set({ position: 'left' });
  await page.waitForFunction(() => document.getElementById('chatpick-export-panel').getBoundingClientRect().left >= document.getElementById('chatpick-export-button').getBoundingClientRect().right + 9);
  await page.setViewportSize({ width: 340, height: 800 });
  await page.waitForFunction(() => {
    const rect = document.getElementById('chatpick-export-panel').getBoundingClientRect();
    return rect.left >= 12 && rect.right <= innerWidth - 12;
  });
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.waitForFunction(() => document.getElementById('chatpick-export-panel').getBoundingClientRect().left >= document.getElementById('chatpick-export-button').getBoundingClientRect().right + 9);
  const markdownDownload = page.waitForEvent('download', { timeout: 10000 });
  await page.locator('#chatpick-export-panel [data-format="markdown"]').click();
  const markdownFile = await markdownDownload.catch(async error => {
    const diagnostics = await page.evaluate(() => ({ status: document.querySelector('#chatpick-export-panel [role="status"]')?.textContent, events: window.fixtureBridgeEvents }));
    throw new Error(`${error.message}\nSynthetic bridge diagnostics: ${JSON.stringify(diagnostics)}`);
  });
  const markdown = fs.readFileSync(await markdownFile.path(), 'utf8');
  assert.equal(markdown.split(question).length - 1, 2);
  assert.ok(markdown.includes('Second answer 中文'));
  assert.ok(!/PRIVATE_REASONING|WRONG_BRANCH|synthetic-fixture/.test(markdown));
  assert.equal(pdfResources.length, 0, 'Markdown export does not load PDF resources');
  await page.getByText('Downloaded.', { exact: true }).waitFor();
  console.log(`PASS ${target}: real Markdown download, complete repeated questions and active answer branch`);
  const pdfDownload = page.waitForEvent('download', { timeout: 45000 });
  pdfDownload.catch(() => {});
  await page.locator('#chatpick-export-panel [data-format="pdf"]').click();
  await page.waitForFunction(() => /^(?:Downloaded\.|Download failed\.)/.test(document.querySelector('#chatpick-export-panel [role="status"]')?.textContent || ''), undefined, { timeout: 30000 });
  const pdfStatus = await page.locator('#chatpick-export-panel [role="status"]').textContent();
  if (pdfStatus !== 'Downloaded.') {
    const events = await page.evaluate(() => window.fixtureBridgeEvents);
    throw new Error(`Synthetic PDF export failed: ${JSON.stringify({ pdfStatus, events, pdfResources })}`);
  }
  const pdfFile = await pdfDownload.catch(async error => {
    const diagnostics = await page.evaluate(() => ({ status: document.querySelector('#chatpick-export-panel [role="status"]')?.textContent, events: window.fixtureBridgeEvents }));
    throw new Error(`${error.message}\nSynthetic PDF diagnostics: ${JSON.stringify({ ...diagnostics, pdfResources })}`);
  });
  const pdfBytes = fs.readFileSync(await pdfFile.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  const pdf = await PDFDocument.load(pdfBytes);
  assert.ok(pdf.getPageCount() >= 1);
  if (target === 'firefox') {
    // Juggler also omits requests made by the Firefox content-script sandbox.
    // The actual PDF download above verifies that its renderer and font load.
    const resources = await evaluatePopup(() => ['/pdf-export.js', '/fonts/NotoSansSC-Regular.ttf'].map(file => browser.runtime.getURL(file)));
    assert.ok(resources.every(url => url.startsWith(base + '/')), 'Firefox resolves bundled resources through moz-extension');
  } else {
    assert.ok(pdfResources.some(url => url.endsWith('/pdf-export.js')), 'Bundled ES module loads only for PDF');
    assert.ok(pdfResources.some(url => url.endsWith('/NotoSansSC-Regular.ttf')), 'Bundled CJK font loads only for PDF');
    assert.ok(pdfResources.every(url => url.startsWith(base + '/')), 'PDF resources use this browser’s extension scheme');
  }
  console.log(`PASS ${target}: repeated identities, rendered headings, instant jumps and lazy local Markdown/PDF exports`);

  const beforeExit = historyReads;
  await page.evaluate(() => history.pushState({}, '', '/'));
  await absent();
  await page.waitForTimeout(1200);
  assert.equal(historyReads, beforeExit, 'Non-conversation routes stop history reads');
  await page.evaluate(chatId => history.pushState({}, '', `/c/${chatId}`), chatId);
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 2);
  assert.ok(await page.locator('#cgpt-nav-box').evaluate(el => Math.abs(el.getBoundingClientRect().left - 18) < 1), 'SPA re-entry retains left placement');
  await set({ language: 'zh', theme: 'dark' });
  await page.waitForFunction(() => document.querySelector('#cgpt-nav-box')?.dataset.theme === 'dark');
  if (target === 'firefox') {
    assert.ok((await evaluatePopup(() => document.body.textContent)).includes('在此网站启用'), 'Real Firefox popup follows Chinese preference');
  } else await popup.getByRole('switch', { name: '在此网站启用', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: '回到开头', exact: true }).isVisible());
  assert.ok(Object.keys(await stored()).every(key => ['theme', 'language', 'colors', 'position', 'showExport', 'showJumpButtons', 'disabledSites'].includes(key)), 'Only preferences are stored');
  assert.deepEqual(errors, []);
  console.log(`PASS ${target}: real MV3 bridge/popup, opt-out, identities, final headings, instant jumps, SPA lifecycle, local Markdown/PDF and CJK`);
} finally {
  remote?.disconnect();
  await context?.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
