// Reproducible public assets. Uses a disposable browser profile, mocked sites,
// synthetic conversations, and the production extension. Never opens a real chat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/store-assets');
const extension = path.join(root, '.output/chrome-mv3');
assert.ok(fs.existsSync(path.join(extension, 'manifest.json')), 'Run pnpm build first');
const logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(root, 'public/icon/logo.svg')).toString('base64');
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const png = buffer => 'data:image/png;base64,' + buffer.toString('base64');
const copy = {
  en: {
    questions: ['Help me plan a four-week learning routine.', 'What should I focus on in week one?', 'How can I turn notes into small projects?', 'How should I review what I learned?', 'How do I stay consistent on busy days?', 'Can you summarize the plan?'],
    headings: ['Choose a tiny project', 'Build in short sessions', 'Finish with a review'],
    paragraphs: ['Pick one idea from your notes and make something small enough to finish this week.', 'Set aside twenty minutes. Build one useful piece, then write down your next step.', 'Explain what worked, what surprised you, and one thing you would change next time.'],
    example: 'Example conversation', title: 'A four-week learning routine', input: 'Ask a follow-up question',
    cards: [
      ['Go straight to the right question.', 'A clear directory for your current conversation.'],
      ['Find the section you need.', 'Browse answer headings without losing your place.'],
      ['At home in your chat.', 'Website colors. Light and dark appearance.'],
      ['Keep a copy of your conversation.', 'Download as Markdown or PDF, right from the navigator.'],
      ['Make it feel like yours.', 'Choose appearance, language, colors and which buttons to show.'],
    ],
    light: 'Light appearance', dark: 'Dark appearance', footer: 'Navigate AI conversations by question and answer section.',
  },
  zh: {
    questions: ['帮我安排一个四周的学习计划。', '第一周应该重点学什么？', '怎样把笔记变成一个小项目？', '学完之后应该怎么复盘？', '忙的时候怎样坚持学习？', '可以总结一下这个计划吗？'],
    headings: ['选一个小项目', '分成短时间完成', '最后做一次复盘'],
    paragraphs: ['从笔记里选一个想法，做一个本周就能完成的小项目。', '每天留出二十分钟，完成一个小步骤，再记下明天要做什么。', '说清楚哪些方法有效、有什么新发现，以及下次想改进的一件事。'],
    example: '示例对话', title: '四周学习计划', input: '继续提问',
    cards: [
      ['想找哪一问，直接跳过去。', '当前对话的问题目录，一眼就能找到。'],
      ['长回答，也能按章节找。', '展开回答标题，直接跳到需要的内容。'],
      ['熟悉的网页，熟悉的配色。', '跟随网站主题色，适配浅色和深色界面。'],
      ['把对话，留一份在本地。', '在导航中直接下载 Markdown 或 PDF。'],
      ['按你的习惯来。', '明暗、语言、配色和按钮，都可以自己选。'],
    ],
    light: '浅色界面', dark: '深色界面', footer: '按问题与回答章节，快速找到对话中的内容。',
  },
};
const palettes = {
  ChatGPT: { bg: '#ffffff', fg: '#202123', muted: '#6b6d70', panel: '#f4f5f6', border: '#e4e5e7', active: '#0285d7', tokens: ['--app-color-background-elevated-primary-opaque', '--app-color-text-primary', '--app-color-text-secondary', '--app-color-border', '--app-color-text-accent'] },
  Claude: { bg: '#faf9f5', fg: '#302f2b', muted: '#79766e', panel: '#f0eee7', border: '#e3e0d8', active: '#c6613f', tokens: ['--cds-surface-popover', '--cds-text-primary', '--cds-text-secondary', '--cds-border', '--cds-fill-brand'] },
  DeepSeek: { bg: '#15171c', fg: '#e8eaf0', muted: '#9298a6', panel: '#20232b', border: '#353946', active: '#679efe', tokens: ['--dsw-alias-bg-layer-1', '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-border-l2', '--dsw-alias-brand-text'] },
};
function fixture(provider, locale) {
  const c = copy[locale], p = palettes[provider];
  const messages = c.questions.flatMap((question, i) => {
    const markdown = c.headings.map((heading, h) => `${h === 1 ? '###' : '##'} ${heading}\n\n${c.paragraphs[h]}`).join('\n\n');
    const html = c.headings.map((heading, h) => `<h${h === 1 ? 3 : 2}>${heading}</h${h === 1 ? 3 : 2}><p>${c.paragraphs[h]}</p>`).join('');
    return [{ id: 'u' + i, role: 'user', text: question, html: esc(question) }, { id: 'a' + i, role: 'assistant', text: markdown, html }];
  });
  const mapping = {}; let parent = null;
  messages.forEach(message => { mapping[message.id] = { parent, message: { id: message.id, author: { role: message.role }, content: { parts: [message.text] } } }; parent = message.id; });
  const api = provider === 'ChatGPT' ? { title: c.title, mapping, current_node: parent } : provider === 'Claude' ? {
    chat_messages: messages.map((m, i) => ({ uuid: m.id, parent_message_uuid: i ? messages[i - 1].id : null, sender: m.role === 'user' ? 'human' : 'assistant', text: m.text, content: [{ type: 'text', text: m.text }] })), current_leaf_message_uuid: parent,
  } : { code: 0, data: { biz_code: 0, biz_data: { chat_messages: messages.map((m, i) => ({ message_id: i + 1, parent_id: i ? i : null, role: m.role.toUpperCase(), text: m.text, fragments: [{ type: m.role === 'user' ? 'REQUEST' : 'RESPONSE', content: m.text }] })), chat_session: { current_message_id: messages.length } } } };
  const rows = messages.map((m, i) => {
    const cls = m.role === 'user' ? 'question' : 'answer';
    if (provider === 'ChatGPT') return `<article class="${cls}" data-turn="${m.role}"><div data-message-author-role="${m.role}" data-message-id="${m.id}">${m.role === 'assistant' ? `<div class="markdown">${m.html}</div>` : m.html}</div></article>`;
    if (provider === 'Claude') return `<div class="${cls}" data-testid="transcript-row" data-index="${i}" data-perf-row="${m.role === 'user' ? 'human' : 'assistant'}"><div role="article" aria-posinset="${i + 1}" aria-setsize="${messages.length}"><div data-testid="${m.role === 'user' ? 'user-message' : 'assistant-message'}"><div class="standard-markdown">${m.html}</div></div></div></div>`;
    return `<div class="${cls}" data-virtual-list-item-key="${i + 1}"><div class="ds-message"><div class="${m.role === 'user' ? 'ds-collapsible-text' : 'ds-markdown ds-assistant-message-main-content'}">${m.html}</div></div></div>`;
  }).join('');
  const tokens = p.tokens.map((token, i) => `${token}:${[p.bg, p.fg, p.muted, p.border, p.active][i]}`).join(';');
  const html = `<!doctype html><html lang="${locale === 'zh' ? 'zh-CN' : 'en'}" class="${provider === 'DeepSeek' ? 'dark' : ''}"><meta charset="utf-8"><title>${c.title}</title><style>
    :root{${tokens};color-scheme:${provider === 'DeepSeek' ? 'dark' : 'light'}}*{box-sizing:border-box}body{margin:0;background:${p.bg};color:${p.fg};font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}#scroller{position:fixed;inset:0;overflow-y:auto;scrollbar-width:none}header{height:54px;position:fixed;top:0;left:0;right:0;z-index:2;background:${p.bg};border-bottom:1px solid ${p.border};display:flex;align-items:center;justify-content:space-between;padding:0 26px}header strong{font-size:16px;font-weight:600}header span{font-size:12px;color:${p.muted}}main{width:376px;margin-left:30px;padding:82px 0 130px}.question{background:${p.panel};border-radius:18px;padding:13px 17px;margin:22px 0 24px;font-weight:500}.answer{padding:0 5px 142px}h2{font-size:19px;font-weight:620;letter-spacing:-.3px;line-height:1.4;margin:20px 0 8px}h3{font-size:16px;font-weight:620;line-height:1.4;margin:20px 0 8px}p{margin:0 0 18px}.composer{position:fixed;bottom:18px;left:30px;width:376px;height:56px;border:1px solid ${p.border};border-radius:18px;background:${p.panel};color:${p.muted};display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:13px;z-index:2}.composer b{display:grid;place-items:center;width:28px;height:28px;background:${p.fg};color:${p.bg};border-radius:50%;font-size:17px;font-weight:400}
  </style><style>.compose-bg{position:fixed;left:0;bottom:0;width:426px;height:92px;background:${p.bg};z-index:2}</style><header><strong>${provider}</strong><span>${c.example}</span></header><div id="scroller"><main>${rows}</main></div><div class="compose-bg"></div><div class="composer">${c.input}<b>↑</b></div></html>`;
  return { api, html };
}
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
async function capture(provider, locale, mode) {
  const data = fixture(provider, locale);
  const page = await context.newPage();
  const host = { ChatGPT: 'chatgpt.com', Claude: 'claude.ai', DeepSeek: 'chat.deepseek.com' }[provider];
  await page.route(`https://${host}/**`, route => {
    const url = route.request().url();
    if (url.endsWith('/api/auth/session')) return route.fulfill({ json: { accessToken: 'synthetic-fixture' } });
    if (url.includes('/backend-api/') || url.includes('/api/organizations/') || url.includes('/api/v0/chat/history_messages')) return route.fulfill({ json: data.api });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: data.html });
  });
  if (provider === 'Claude') await context.addCookies([{ name: 'lastActiveOrg', value: '00000000-0000-0000-0000-000000000001', domain: host, path: '/' }]);
  if (provider === 'DeepSeek') await page.addInitScript(() => localStorage.setItem('userToken', JSON.stringify({ value: 'synthetic-fixture', __version: '0' })));
  const pathname = { ChatGPT: '/c/store-demo', Claude: '/chat/store-demo', DeepSeek: '/a/chat/s/store-demo' }[provider];
  await page.goto(`https://${host}${pathname}`);
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-toc .cn-item').length === 6);
  await page.evaluate(language => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { theme: 'auto', language, colors: 'site', showExport: true, showJumpButtons: true } }, location.origin), locale);
  const item = page.locator('#cgpt-toc .cn-item').nth(2);
  await item.click();
  await item.hover();
  await page.waitForFunction(() => document.querySelectorAll('#cgpt-sections .cn-item').length === 3);
  await page.waitForTimeout(350);
  if (mode === 'sections') {
    await page.locator('#cgpt-sections .cn-item').first().click();
    await page.locator('#cgpt-sections .cn-item').first().hover();
    await page.waitForTimeout(250);
  }
  if (mode === 'export') {
    await page.locator('#chatpick-export-button').click();
    await page.waitForFunction(() => document.querySelectorAll('#chatpick-export-panel [data-format]').length === 2);
    await page.waitForTimeout(250);
  }
  assert.equal(await page.locator('#cgpt-toc .cn-item').count(), 6);
  assert.equal(await page.locator('#cgpt-toc .cn-item.active').evaluate(el => [...el.parentElement.children].indexOf(el)), 2, 'Highlight the visible question');
  assert.equal(await page.locator('#cgpt-nav-box').evaluate(el => getComputedStyle(el).getPropertyValue('--cn-active').trim()), palettes[provider].active, 'Use the provider brand color');
  if (mode !== 'export') assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), copy[locale].headings);
  const image = await page.screenshot();
  const crop = await page.locator('#cgpt-toc').screenshot();
  const sections = mode !== 'export' ? await page.locator('#cgpt-sections').screenshot() : null;
  await page.close();
  return { image, crop, sections };
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
    await popup.setViewportSize({ width: 340, height: 600 });
    for (const theme of ['light', 'dark']) {
      await popup.evaluate(settings => chrome.storage.local.set(settings), { theme, language: locale, colors: 'site', showExport: true, showJumpButtons: true });
      await popup.reload();
      await popup.locator('main.popup').waitFor();
      await popup.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, theme === 'dark');
      await popup.waitForTimeout(150);
      captures.push(await popup.locator('main.popup').screenshot());
    }
    const [title, subtitle] = copy[locale].cards[4];
    await render(`${dir}/05-settings.png`, template(`<div class="brand"><img src="${logo}">ChatPick</div><h1>${title}</h1><p class="subtitle">${subtitle}</p><div class="settings"><figure><figcaption>${copy[locale].light}</figcaption><img src="${png(captures[0])}"></figure><figure><figcaption>${copy[locale].dark}</figcaption><img src="${png(captures[1])}"></figure></div>`, '.settings{position:absolute;top:198px;left:196px;display:flex;gap:72px}figure{margin:0;width:408px}figure img{width:408px;display:block;border-radius:16px;box-shadow:0 16px 35px #123a281c;border:1px solid #d7ddd5}figcaption{font-size:15px;margin:0 0 16px;color:#5f7368}'));
    console.log(`Rendered ${dir}/05-settings.png`);
  }
  await render('promo-small.png', template(`<div class="tile-logo"><img src="${logo}"></div><div class="tile-name">ChatPick</div><div class="lines"><i></i><i></i><i></i><i></i><i></i></div>`, 'body{background:#123b2b}.tile-logo{position:absolute;left:42px;top:43px;width:154px;height:154px}.tile-logo img{width:100%;height:100%}.tile-name{position:absolute;left:45px;bottom:32px;color:#f3ffec;font-size:34px;font-weight:650;letter-spacing:-1px}.lines{position:absolute;left:252px;top:69px;width:146px;display:flex;flex-direction:column;gap:18px}.lines i{height:10px;border-radius:5px;background:#49765a}.lines i:before{content:"";display:block;position:relative;left:-20px;top:1px;width:8px;height:8px;border-radius:4px;background:#75a882}.lines i:nth-child(2){background:#b9ee91;width:123px}.lines i:nth-child(3){width:101px}.lines i:nth-child(4){width:139px}.lines i:nth-child(5){width:84px}'), 440, 280);
  await render('promo-marquee.png', template(`<img class="hero-logo" src="${logo}"><div class="hero-copy"><strong>ChatPick</strong><p>Find your place<br>in long chats.</p></div><img class="hero-ui" src="${png(promoCrop)}"><img class="hero-sections" src="${png(promoSections)}">`, 'body{background:#123b2b}.hero-logo{position:absolute;left:74px;top:145px;width:250px;height:250px}.hero-copy{position:absolute;left:362px;top:174px;color:#f3ffec}.hero-copy strong{font-size:72px;letter-spacing:-2px}.hero-copy p{margin:12px 0;font-size:29px;line-height:1.35;color:#b4c7b7}.hero-ui,.hero-sections{position:absolute;filter:drop-shadow(0 20px 24px #051b2380);border-radius:18px}.hero-ui{right:91px;top:95px;width:410px}.hero-sections{right:189px;top:365px;width:312px}'), 1400, 560);
  assert.deepEqual(errors, [], 'No browser errors in production UI captures');
  const gallery = `<!doctype html><html lang="en"><meta charset="utf-8"><title>ChatPick store assets</title><style>body{margin:40px;background:#f4f4eb;color:#183b2d;font-family:system-ui}h1{font-size:30px}p{color:#52685b}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}img{width:100%;display:block;border:1px solid #d7ddd5}figcaption{margin:10px 0 18px;font-size:14px}a{color:inherit}.promo{max-width:440px}.marquee{max-width:100%}</style><h1>ChatPick · Store assets</h1><p>Synthetic conversations · Actual extension UI · No real accounts or private chats</p><h2>Promotional images</h2><img class="promo" src="promo-small.png"><p>440 × 280</p><img class="marquee" src="promo-marquee.png"><p>1400 × 560</p>${['en', 'zh-CN'].map(locale => `<h2>${locale === 'en' ? 'English' : '简体中文'}</h2><section>${['01-questions', '02-answer-sections', '03-site-colors', '04-export', '05-settings'].map(name => `<figure><a href="${locale}/${name}.png"><img src="${locale}/${name}.png"></a><figcaption>${name} · 1280 × 800</figcaption></figure>`).join('')}</section>`).join('')}</html>`;
  fs.writeFileSync(path.join(output, 'index.html'), gallery);
  console.log('PASS: 12 public PNGs, two locales, actual UI, isolated synthetic content');
} finally {
  await context.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
