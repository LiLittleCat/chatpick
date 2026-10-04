// Reproducible public assets. Uses a disposable browser profile, mocked sites,
// synthetic conversations, and the production extension. Never opens a real chat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { copy, capture as captureFixture } from './promo-fixtures.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/store-assets');
const extension = path.join(root, '.output/chrome-mv3');
assert.ok(fs.existsSync(path.join(extension, 'manifest.json')), 'Run pnpm build first');
const logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'public/icon/logo.svg')).toString('base64');
const png = buffer => 'data:image/png;base64,' + buffer.toString('base64');
const capture = (...args) => captureFixture(context, ...args);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatpick-store-assets-'));
const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1000, height: 540 }, deviceScaleFactor: 2, reducedMotion: 'reduce', ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
const errors = [];
context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
// Block external network even if a future fixture or asset accidentally links out.
await context.route(/^https?:\/\//, route => route.abort());
const layout = await context.newPage();
const template = (body, extra = '') => `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f4f4eb;color:#183b2d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}.brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:650;position:absolute;left:48px;top:26px}.brand img{width:34px;height:34px}h1{position:absolute;left:48px;top:69px;margin:0;font-size:42px;line-height:1.2;letter-spacing:-1.2px;font-weight:650}.subtitle{position:absolute;left:50px;top:127px;margin:0;font-size:17px;color:#5f7368}.frame{position:absolute;left:72px;top:174px;width:1136px;border:1px solid #d7ddd5;box-shadow:0 12px 30px #163e2714;border-radius:16px;overflow:hidden;background:white}.frame img{display:block;width:100%}${extra}</style>${body}`;
async function render(file, html, width = 1280, height = 800) {
  await layout.setViewportSize({ width, height });
  await layout.setContent(html);
  await layout.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  await layout.evaluate(() => document.fonts.ready);
  await layout.screenshot({ path: path.join(output, file), scale: 'css' });
}

try {
  fs.mkdirSync(output, { recursive: true });
  const manager = await context.newPage();
  await manager.goto('chrome://extensions/');
  const id = await manager.locator('extensions-item').first().getAttribute('id');
  assert.ok(id, 'Production extension loaded');
  await manager.close();
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  let promoCrop, promoSections;
  for (const locale of ['en', 'zh']) {
    const dir = locale === 'zh' ? 'zh-CN' : 'en';
    fs.mkdirSync(path.join(output, dir), { recursive: true });
    const cases = [['ChatGPT', 'questions', '01-questions.png'], ['Claude', 'sections', '02-answer-sections.png'], ['DeepSeek', 'colors', '03-site-colors.png'], ['ChatGPT', 'export', '04-export.png']];
    for (const [index, [provider, mode, filename]] of cases.entries()) {
      await popup.evaluate(language => chrome.storage.local.set({ theme: 'auto', language, colors: 'site', showExport: true, showJumpButtons: true }), locale);
      const captured = await capture(provider, locale, mode);
      if (locale === 'en' && index === 0) { promoCrop = captured.crop; promoSections = captured.sections; }
      const [title, subtitle] = copy[locale].cards[index];
      await render(`${dir}/${filename}`, template(`<div class="brand"><img src="${logo}">ChatPick</div><h1>${title}</h1><p class="subtitle">${subtitle}</p><div class="frame"><img src="${png(captured.image)}"></div>`));
      console.log(`Rendered ${dir}/${filename}`);
    }
    const captures = [];
    const settingsChat = await capture('ChatGPT', locale, 'settings', true);
    await popup.setViewportSize({ width: 340, height: 600 });
    for (const theme of ['light', 'dark']) {
      await popup.evaluate(settings => chrome.storage.local.set(settings), { theme, language: locale, colors: 'site', showExport: true, showJumpButtons: true });
      await settingsChat.page.bringToFront();
      await popup.reload();
      await popup.locator('main.popup').waitFor();
      await popup.waitForFunction(() => !document.querySelector('.site-setting button')?.disabled);
      await popup.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, theme === 'dark');
      await popup.waitForTimeout(150);
      captures.push(await popup.locator('main.popup').screenshot());
    }
    await settingsChat.page.close();
    const [title, subtitle] = copy[locale].cards[4];
    await render(`${dir}/05-settings.png`, template(`<div class="brand"><img src="${logo}">ChatPick</div><h1>${title}</h1><p class="subtitle">${subtitle}</p><div class="settings"><figure><figcaption>${copy[locale].light}</figcaption><img src="${png(captures[0])}"></figure><figure><figcaption>${copy[locale].dark}</figcaption><img src="${png(captures[1])}"></figure></div>`, '.settings{position:absolute;top:187px;left:226px;display:flex;gap:80px}figure{margin:0;width:374px}figure img{width:374px;display:block;border-radius:16px;box-shadow:0 16px 35px #123a281c;border:1px solid #d7ddd5}figcaption{font-size:15px;margin:0 0 16px;color:#5f7368}'));
    console.log(`Rendered ${dir}/05-settings.png`);
  }
  await render('promo-small.png', template(`<div class="tile-logo"><img src="${logo}"></div><div class="tile-name">ChatPick</div><div class="lines"><i></i><i></i><i></i><i></i><i></i></div>`, 'body{background:#123b2b}.tile-logo{position:absolute;left:42px;top:43px;width:154px;height:154px}.tile-logo img{width:100%;height:100%}.tile-name{position:absolute;left:45px;bottom:32px;color:#f3ffec;font-size:34px;font-weight:650;letter-spacing:-1px}.lines{position:absolute;left:252px;top:69px;width:146px;display:flex;flex-direction:column;gap:18px}.lines i{height:10px;border-radius:5px;background:#49765a}.lines i:before{content:"";display:block;position:relative;left:-20px;top:1px;width:8px;height:8px;border-radius:4px;background:#75a882}.lines i:nth-child(2){background:#b9ee91;width:123px}.lines i:nth-child(3){width:101px}.lines i:nth-child(4){width:139px}.lines i:nth-child(5){width:84px}'), 440, 280);
  await render('promo-marquee.png', template(`<img class="hero-logo" src="${logo}"><div class="hero-copy"><strong>ChatPick</strong><p>Find your place<br>in long chats.</p></div><img class="hero-ui" src="${png(promoCrop)}"><img class="hero-sections" src="${png(promoSections)}">`, 'body{background:#123b2b}.hero-logo{position:absolute;left:74px;top:145px;width:250px;height:250px}.hero-copy{position:absolute;left:362px;top:174px;color:#f3ffec}.hero-copy strong{font-size:72px;letter-spacing:-2px}.hero-copy p{margin:12px 0;font-size:29px;line-height:1.35;color:#b4c7b7}.hero-ui,.hero-sections{position:absolute;filter:drop-shadow(0 20px 24px #051b2380);border-radius:18px}.hero-ui{right:91px;top:95px;width:410px}.hero-sections{right:189px;top:365px;width:312px}'), 1400, 560);
  assert.deepEqual(errors, [], 'No browser errors in production UI captures');
  // Supplementary store screenshots are captured on the real site using only
  // newly authored public demo chats. Re-encode pixels as opaque PNG without overlays.
  const liveRoot = path.join(output, 'screenshots');
  for (const locale of ['en', 'zh-CN']) {
    fs.mkdirSync(path.join(liveRoot, locale), { recursive: true });
    for (const [number, name] of [['01', '01-questions'], ['02', '02-export']]) {
      const file = path.join(process.env.CHATPICK_LIVE_CAPTURE_DIR || '/tmp', `chatpick-store-live-${locale}-${number}.jpg`);
      if (!fs.existsSync(file)) continue;
      const source = 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
      // The live viewport is 1344px wide: discard its 64px account rail.
      // Keep the remaining pixels at their original scale, with no UI edits.
      await render(`screenshots/${locale}/${name}.png`, `<!doctype html><style>html,body{margin:0;width:1280px;height:800px;background:#fff;overflow:hidden}img{display:block;position:absolute;left:-64px;width:1344px;height:800px}</style><img src="${source}">`);
      assert.ok(await layout.locator('img').evaluate(img => img.naturalWidth === 1344 && img.naturalHeight === 800), 'Capture at 1344 × 800 before excluding the account rail');
    }
  }
  const gallery = `<!doctype html><html lang="en"><meta charset="utf-8"><title>ChatPick store assets</title><style>body{margin:40px;background:#f4f4eb;color:#183b2d;font-family:system-ui}h1{font-size:30px}p{color:#52685b}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}img{width:100%;display:block;border:1px solid #d7ddd5}figcaption{margin:10px 0 18px;font-size:14px}a{color:inherit}.promo{max-width:440px}.marquee{max-width:100%}</style><h1>ChatPick · Store assets</h1><p>Synthetic conversations · Actual extension UI · No real accounts or private chats</p><h2>Full-bleed store screenshots</h2><p>Real ChatGPT pages with newly authored public demo conversations; account sidebar and browser chrome excluded.</p><section>${['en', 'zh-CN'].flatMap(locale => ['01-questions', '02-export'].filter(name => fs.existsSync(path.join(liveRoot, locale, name + '.png'))).map(name => `<figure><a href="screenshots/${locale}/${name}.png"><img src="screenshots/${locale}/${name}.png"></a><figcaption>${locale} · ${name} · 1280 × 800</figcaption></figure>`)).join('')}</section><h2>Promotional images</h2><img class="promo" src="promo-small.png"><p>440 × 280</p><img class="marquee" src="promo-marquee.png"><p>1400 × 560</p>${['en', 'zh-CN'].map(locale => `<h2>${locale === 'en' ? 'English' : '简体中文'}</h2><section>${['01-questions', '02-answer-sections', '03-site-colors', '04-export', '05-settings'].map(name => `<figure><a href="${locale}/${name}.png"><img src="${locale}/${name}.png"></a><figcaption>${name} · 1280 × 800</figcaption></figure>`).join('')}</section>`).join('')}</html>`;
  fs.writeFileSync(path.join(output, 'index.html'), gallery);
  console.log('PASS: public assets, two locales, actual UI, synthetic content');
} finally {
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
