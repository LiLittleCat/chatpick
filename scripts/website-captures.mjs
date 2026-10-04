// Native high-density homepage screenshots, independent of store compositions.
// All content is synthetic, network requests are intercepted, and the navigator
// is the built production extension. No real account or conversation is opened.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { capture, copy, palettes } from './promo-fixtures.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const extension = path.join(root, '.output/chrome-mv3');
const output = path.join(root, 'website/assets/captures');
const reportDirectory = path.join(root, '.output/website-captures');
const manifestFile = path.join(extension, 'manifest.json');
assert.ok(fs.existsSync(manifestFile), 'Run pnpm build first');

const viewport = { width: 1132, height: 610 };
const deviceScaleFactor = 2;
const cases = [
  ['ChatGPT', 'questions', '01-questions.png'],
  ['Claude', 'sections', '02-answer-sections.png'],
  ['ChatGPT', 'export', '04-export.png'],
  ['DeepSeek', 'colors', '03-site-colors.png'],
];
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatpick-website-captures-'));
const errors = [];
const captures = [];
let context;

try {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
    headless: true,
    viewport,
    deviceScaleFactor,
    reducedMotion: 'reduce',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const observeErrors = page => page.on('pageerror', error => errors.push(error.message));
  context.on('page', observeErrors);
  context.pages().forEach(observeErrors);
  await context.route(/^https?:\/\//, route => route.abort());

  const manager = await context.newPage();
  await manager.goto('chrome://extensions/');
  const id = await manager.locator('extensions-item').first().getAttribute('id');
  assert.ok(id, 'Production extension loaded');
  await manager.close();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);

  for (const locale of ['en', 'zh']) {
    const directory = locale === 'zh' ? 'zh-CN' : 'en';
    fs.mkdirSync(path.join(output, directory), { recursive: true });
    for (const [provider, mode, filename] of cases) {
      // The normal isolated-world preferences path applies before startup.
      await popup.evaluate(language => chrome.storage.local.set({
        theme: 'auto', language, colors: 'site', showExport: true, showJumpButtons: true,
      }), locale);
      const captured = await capture(context, provider, locale, mode, true, {
        contentWidth: 475,
        fontSize: 16,
        answerSpacing: 220,
      });
      const page = captured.page;
      try {
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
        const layout = await page.evaluate(() => {
          const rect = selector => {
            const element = document.querySelector(selector);
            if (!element || element.hidden) return null;
            const { x, y, width, height, right, bottom } = element.getBoundingClientRect();
            return { x, y, width, height, right, bottom };
          };
          return {
            main: rect('main'),
            questions: rect('#cgpt-toc'),
            sections: rect('#cgpt-sections'),
            export: rect('#chatpick-export-panel'),
            selectedQuestion: document.querySelector('#cgpt-toc .cn-item.active .cn-t')?.textContent,
            language: document.documentElement.lang,
            theme: document.querySelector('#cgpt-nav-box')?.dataset.theme,
          };
        });
        assert.equal(layout.selectedQuestion, copy[locale].questions[2]);
        assert.equal(layout.language, directory === 'zh-CN' ? 'zh-CN' : 'en');
        assert.equal(layout.theme, provider === 'DeepSeek' ? 'dark' : 'light');
        for (const [name, bounds] of Object.entries(layout)) {
          if (!bounds || typeof bounds !== 'object' || name === 'main') continue;
          assert.ok(bounds.x >= 0 && bounds.y >= 0, `${name} begins inside the frame`);
          assert.ok(bounds.right <= viewport.width && bounds.bottom <= viewport.height, `${name} fits the frame`);
          assert.ok(bounds.x >= layout.main.right, `${name} does not cover conversation text`);
        }
        if (mode === 'export') {
          assert.deepEqual(await page.locator('#chatpick-export-panel [data-format]').evaluateAll(elements => elements.map(element => element.dataset.format)), ['markdown', 'pdf']);
        } else {
          assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), copy[locale].headings);
        }
        const destination = path.join(output, directory, filename);
        const image = await page.screenshot({ path: destination, scale: 'device' });
        const dimensions = { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
        assert.deepEqual(dimensions, { width: viewport.width * deviceScaleFactor, height: viewport.height * deviceScaleFactor });
        const result = {
          file: path.relative(root, destination), provider, mode, locale: directory,
          ...dimensions, bytes: image.length, sha256: createHash('sha256').update(image).digest('hex'),
          questions: 6, selectedQuestion: 2, answerHeadings: mode === 'export' ? null : copy[locale].headings,
          formats: mode === 'export' ? ['markdown', 'pdf'] : null,
          accent: palettes[provider].active, layout,
        };
        captures.push(result);
        console.log(`${result.file}: ${result.width} × ${result.height}, ${result.bytes} bytes; UI assertions passed`);
      } finally {
        await page.close();
      }
    }
  }
  assert.deepEqual(errors, [], 'No production UI page errors');
  fs.mkdirSync(reportDirectory, { recursive: true });
  fs.writeFileSync(path.join(reportDirectory, 'summary.json'), JSON.stringify({
    viewport, deviceScaleFactor,
    extensionManifestSha256: createHash('sha256').update(fs.readFileSync(manifestFile)).digest('hex'),
    provenance: 'Built production extension on isolated synthetic provider fixtures; external network blocked.',
    captures, errors,
  }, null, 2) + '\n');
  console.log('PASS: 8 native 2× screenshots, two locales, verified production UI, synthetic content only');
} finally {
  try {
    await context?.close();
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
