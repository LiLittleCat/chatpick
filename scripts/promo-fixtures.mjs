// Public synthetic provider fixtures shared by store art and homepage captures.
// Screenshots run the production extension, never a separately drawn navigator.
import assert from 'node:assert/strict';
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export const copy = {
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
      ['Make it feel like yours.', 'Choose websites, appearance, language, colors and which buttons to show.'],
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
      ['按你的习惯来。', '网站启用、明暗、语言、配色和按钮，都可以自己选。'],
    ],
    light: '浅色界面', dark: '深色界面', footer: '按问题与回答章节，快速找到对话中的内容。',
  },
};
export const palettes = {
  ChatGPT: { bg: '#ffffff', fg: '#202123', muted: '#6b6d70', panel: '#f4f5f6', border: '#e4e5e7', active: '#0285d7', tokens: ['--app-color-background-elevated-primary-opaque', '--app-color-text-primary', '--app-color-text-secondary', '--app-color-border', '--app-color-text-accent'] },
  Claude: { bg: '#faf9f5', fg: '#302f2b', muted: '#79766e', panel: '#f0eee7', border: '#e3e0d8', active: '#c6613f', tokens: ['--cds-surface-popover', '--cds-text-primary', '--cds-text-secondary', '--cds-border', '--cds-fill-brand'] },
  DeepSeek: { bg: '#15171c', fg: '#e8eaf0', muted: '#9298a6', panel: '#20232b', border: '#353946', active: '#679efe', tokens: ['--dsw-alias-bg-layer-1', '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-border-l2', '--dsw-alias-brand-text'] },
};
export function fixture(provider, locale, presentation = {}) {
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
  // A homepage capture uses a wider conversation column; extension styles
  // and controls remain untouched. Default fixtures retain the store layout.
  if (presentation.contentWidth || presentation.fontSize) {
    const width = presentation.contentWidth || 376;
    const fontSize = presentation.fontSize || 15;
    return { api, html: html.replace('</html>', `<style>body{font-size:${fontSize}px}main,.composer{width:${width}px}.compose-bg{width:${width + 50}px}${presentation.answerSpacing ? `.answer{padding-bottom:${presentation.answerSpacing}px}` : ''}</style></html>`) };
  }
  return { api, html };
}
export async function capture(context, provider, locale, mode, keepOpen = false, presentation = {}) {
  const data = fixture(provider, locale, presentation);
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
  if (!keepOpen) await page.close();
  return { image, crop, sections, page: keepOpen ? page : null };
}
