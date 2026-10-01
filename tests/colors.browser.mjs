// Real built navigator + settings bridge, with fixture theme tokens and extension storage.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve(import.meta.dirname, '../.output/chrome-mv3');
const navigator = fs.readFileSync(path.join(output, 'content-scripts/navigator.js'), 'utf8');
const bridge = fs.readFileSync(path.join(output, 'content-scripts/content.js'), 'utf8');
const profiles = [
  { host: 'chatgpt.com', route: '/c/colors-fixture', tokens: ['--app-color-background-elevated-primary-opaque', '--app-color-text-primary', '--app-color-text-secondary', '--app-color-border', '--app-color-border-heavy', '--color-background-primary-soft-hover', '--brand-color'] },
  { host: 'claude.ai', route: '/chat/colors-fixture', tokens: ['--cds-surface-popover', '--cds-text-primary', '--cds-text-secondary', '--cds-border', '--cds-border-strong', '--cds-bg-neutral-hover', '--cds-fill-brand'] },
  { host: 'chat.deepseek.com', route: '/a/chat/s/colors-fixture', tokens: ['--dsw-alias-bg-layer-1', '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-border-l2', '--dsw-alias-border-l3', '--dsw-alias-bg-layer-2', '--dsw-alias-brand-text'] },
];
const initial = ['#f7f5f1', '#202020', '#555555', '#ddddee', '#bbbbaa', '#eae8e3', '#245fc7'];
const changed = ['#20201f', '#f0efec', '#c3c2b7', '#444444', '#666666', '#383838', '#87b4ef'];
const browser = await chromium.launch({ headless: true });
try {
  const installMock = async (page, stored) => {
    await page.exposeFunction('readFixtureSettings', () => stored.value);
    await page.exposeFunction('saveFixtureSettings', next => { Object.assign(stored.value, next); });
    await page.addInitScript(() => {
      const listeners = [];
      window.browser = {
        runtime: { id: 'fixture', onMessage: { addListener() {} } },
        tabs: { query: async () => [{ id: 1 }], sendMessage: async () => 'light' },
        storage: {
          local: {
            get: async defaults => ({ ...defaults, ...await window.readFixtureSettings() }),
            set: async next => {
              const old = await window.readFixtureSettings();
              await window.saveFixtureSettings(next);
              const changes = Object.fromEntries(Object.entries(next).map(([key, newValue]) => [key, { oldValue: old[key], newValue }]));
              listeners.forEach(listener => listener(changes, 'local'));
            },
          },
          onChanged: { addListener(listener) { listeners.push(listener); } },
        },
      };
    });
  };
  for (const { host, route, tokens } of profiles) {
    const page = await browser.newPage();
    const stored = { value: { theme: 'auto', language: 'en' } }; // existing installations lack colors
    await installMock(page, stored);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const declarations = values => tokens.map((name, i) => `${name}:${values[i]}`).join(';');
    await page.route(`https://${host}/**`, request => request.request().url().includes('/api/') || request.request().url().includes('/backend-api/')
      ? request.fulfill({ status: 503, body: 'Fixture fallback' })
      : request.fulfill({ contentType: 'text/html', body: `<style id="site-theme">:root{${declarations(initial)}}body{background:white}</style><main></main>` }));
    await page.goto(`https://${host}${route}`);
    await page.addScriptTag({ content: bridge });
    await page.addScriptTag({ content: navigator });
    const palette = () => page.evaluate(() => {
      const node = document.querySelector('#cgpt-nav-box');
      const computed = getComputedStyle(node);
      return { theme: node.dataset.theme, values: ['bg', 'fg', 'muted', 'border', 'track', 'hover', 'active'].map(key => computed.getPropertyValue('--cn-' + key).trim()) };
    });
    await page.waitForFunction(() => document.querySelector('#cgpt-nav-box')?.style.getPropertyValue('--cn-active'));
    assert.deepEqual((await palette()).values, initial);
    // Stylesheet updates are observed even if html/body attributes do not change.
    await page.evaluate(css => { document.querySelector('#site-theme').textContent = css; }, `:root{${declarations(changed)}}body{background:rgb(21,21,21)}`);
    await page.waitForFunction(() => document.querySelector('#cgpt-nav-box')?.dataset.theme === 'dark');
    assert.deepEqual((await palette()).values, changed);
    await page.evaluate(() => window.browser.storage.local.set({ colors: 'default' }));
    await page.waitForFunction(() => !document.querySelector('#cgpt-nav-box').style.getPropertyValue('--cn-active'));
    assert.equal((await palette()).values[6], '#19c37d');
    assert.equal(stored.value.colors, 'default');
    // A forced light appearance retains light panel colors on a dark site.
    await page.evaluate(() => window.browser.storage.local.set({ colors: 'site', theme: 'light' }));
    await page.waitForFunction(() => document.querySelector('#cgpt-nav-box')?.dataset.theme === 'light');
    const forced = await palette();
    assert.equal(forced.values[0], 'rgba(255, 255, 255, 0.96)');
    assert.equal(forced.values[6], changed[6]);
    await page.evaluate(() => window.browser.storage.local.set({ theme: 'auto' }));
    await page.waitForFunction(() => document.querySelector('#cgpt-nav-box')?.dataset.theme === 'dark');
    assert.deepEqual((await palette()).values, changed);
    // Missing or malformed tokens return to defaults, rather than keeping stale colors.
    await page.evaluate(() => { document.querySelector('#site-theme').textContent = 'body{background:rgb(21,21,21)}'; });
    const fallback = host === 'claude.ai' ? '#d97757' : host === 'chat.deepseek.com' ? '#679efe' : '#19c37d';
    await page.waitForFunction(expected => document.querySelector('#cgpt-nav-box').style.getPropertyValue('--cn-active') === expected, fallback);
    assert.equal((await palette()).values[6], fallback);
    await page.evaluate(css => { document.querySelector('#site-theme').textContent = css; }, `:root{${tokens.map(name => `${name}:not-a-color`).join(';')}}body{background:rgb(21,21,21)}`);
    await page.waitForTimeout(50);
    assert.equal((await palette()).values[6], fallback);
    if (host === 'claude.ai') {
      await page.evaluate(() => { document.querySelector('#site-theme').textContent += ':root{--accent-brand:15 60% 60%}'; });
      await page.waitForFunction(() => document.querySelector('#cgpt-nav-box').style.getPropertyValue('--cn-active') === 'hsl(15 60% 60%)');
    }
    await page.evaluate(() => history.pushState({}, '', '/'));
    await page.waitForFunction(() => !document.querySelector('#cgpt-nav-box'));
    assert.deepEqual(errors, []);
    console.log(`PASS: ${host}, legacy settings, live palette updates, opt-out, forced appearance and fallback`);
    await page.close();
  }

  // Render the actual settings popup and verify the new setting saves and survives reopening.
  const stored = { value: { theme: 'auto', language: 'zh' } };
  const popup = await browser.newPage({ viewport: { width: 340, height: 340 } });
  await installMock(popup, stored);
  await popup.route('https://chatpick.test/**', route => {
    const filename = new URL(route.request().url()).pathname.slice(1) || 'popup.html';
    const contentType = filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
    return route.fulfill({ contentType, body: fs.readFileSync(path.join(output, filename)) });
  });
  await popup.goto('https://chatpick.test/popup.html');
  const colors = popup.getByRole('combobox', { name: '配色 跟随网页配色', exact: true });
  await colors.click();
  await popup.getByRole('option', { name: 'ChatPick 默认', exact: true }).click();
  await popup.getByRole('combobox', { name: '配色 ChatPick 默认', exact: true }).waitFor();
  assert.equal(stored.value.colors, 'default');
  await popup.reload();
  await popup.getByRole('combobox', { name: '配色 ChatPick 默认', exact: true }).waitFor();
  await popup.getByRole('combobox', { name: '配色 ChatPick 默认', exact: true }).press('Enter');
  await popup.getByRole('option', { name: '跟随网页配色', exact: true }).click();
  await popup.getByRole('combobox', { name: '配色 跟随网页配色', exact: true }).waitFor();
  assert.equal(stored.value.colors, 'site');
  console.log('PASS: settings popup, color choices and persistence');
  await popup.close();
} finally { await browser.close(); }
