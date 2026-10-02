// Load the actual MV3 extension against synthetic provider pages. No account data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { create as createFont } from 'fontkit';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const extension = path.resolve(import.meta.dirname, '../.output/chrome-mv3');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'chatpick-export-test-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, acceptDownloads: true, ignoreDefaultArgs: ['--disable-extensions'],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const id = '11111111-1111-1111-1111-111111111111';
const longQuestion = '请帮我分析这份中文数据。'.repeat(40) + '\n第二行提问';
const answer = '## 中文标题\n\n**重点** 与 *强调*，参见 [官方资料](https://example.com/docs)。\n\n- 第一项\n- 第二项\n\n| 名称 | 数值 |\n| --- | --- |\n| 中文 | 42 |\n\n```js\nconst text = "中文代码";\n\n\nconsole.log(text);\n```\n\n公式：$E = mc^2$。\n\n' + '用于验证分页的中文段落。'.repeat(90) + '\n\n' + '```text\n' + Array.from({length:65},(_,i)=>'代码行 '+i+' '+ 'abcdefgh'.repeat(20)).join('\n') + '\n```\n\n' + '| 项目 | 详情 |\n| --- | --- |\n' + Array.from({length:75},(_,i)=>'| 条目 '+i+' | 长表格内容 '+ '中文'.repeat(30)+' |').join('\n');
const nodes = [
  ['u1', 'user', longQuestion], ['a1', 'assistant', answer],
  ['u2', 'user', longQuestion], ['think', 'assistant', 'PRIVATE_REASONING', 'analysis'],
  ['tool', 'tool', 'PRIVATE_TOOL'], ['a2', 'assistant', '最终回答：测试结束。'],
];
const mapping = {}; let parent = null;
for (const [key,role,text,channel] of nodes) { mapping[key] = {parent,message:{id:key,author:{role},channel,content:{parts:[text]}}}; parent = key; }
mapping.sibling = {parent:'u2',message:{id:'sibling',author:{role:'assistant'},content:{parts:['WRONG_BRANCH']}}};
const page = await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
let failApi = false, delayApi = false;
await page.route('https://chatgpt.com/**',async route=>{
  const url=route.request().url();
  if(url.endsWith('/api/auth/session')) return route.fulfill({json:{accessToken:'synthetic-fixture'}});
  if(url.includes('/backend-api/conversation/')) {
    if(delayApi) await new Promise(r=>setTimeout(r,1500));
    return failApi ? route.fulfill({status:503,body:'Unavailable'}) : route.fulfill({json:{title:'中文会话导出',mapping,current_node:'a2'}});
  }
  return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><title>合成会话</title><style>body{background:#eee}main{padding:40px;width:700px}article{margin:100px 0}</style><main><article data-turn="user"><div data-message-author-role="user" data-message-id="u1">页面上的提问</div></article><article data-turn="assistant"><div data-message-author-role="assistant" data-message-id="a1"><div class="markdown"><h2>页面标题</h2><p>页面回答</p></div></div></article></main>'});
});
async function download(format) {
  const pending=page.waitForEvent('download',{timeout:45000});
  await page.locator('#chatpick-export-panel [data-format="'+format+'"]').click();
  return pending;
}
try {
  await page.goto('https://chatgpt.com/c/'+id);
  await page.locator('#chatpick-export-button').waitFor();
  await page.locator('#chatpick-export-button').click();
  if (process.env.CHATPICK_EXPORT_ONE_CLICK) {
    failApi = true;
    const pending = page.waitForEvent('download', { timeout: 5000 });
    await page.locator('#chatpick-export-panel [data-format="pdf"]').click();
    const file = await pending;
    assert.equal(fs.readFileSync(await file.path()).subarray(0, 5).toString(), '%PDF-');
    assert.equal(await page.locator('#chatpick-export-partial').count(), 0, 'No second download click');
    console.log('PASS partial PDF: choosing PDF downloads directly');
    process.exitCode = 0;
  } else {
  assert.equal(await page.locator('#chatpick-export-panel [data-format]').count(), 2);
  assert.equal(await page.locator('.chatpick-export-header #chatpick-export-close').count(), 1, 'Close is a header icon');
  assert.ok(await page.evaluate(() => {
    const button = document.getElementById('chatpick-export-button').getBoundingClientRect();
    return document.getElementById('cgpt-toc').getBoundingClientRect().bottom < button.top && button.bottom < document.getElementById('cgpt-btns').getBoundingClientRect().top;
  }), 'Export is between the conversation list and jump buttons');
  await page.setViewportSize({width:320,height:460});
  assert.ok(await page.locator('#chatpick-export-panel').evaluate(panel=>{const r=panel.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}), 'Menu fits a small viewport');
  await page.setViewportSize({width:1280,height:720});
  const columns = await page.locator('#cgpt-btns button').evaluateAll(buttons => buttons.map(button => ({ icon: button.querySelector('svg').getBoundingClientRect().left, text: button.querySelector('.cn-control-label').getBoundingClientRect().left })));
  assert.ok(columns.every(row => Math.abs(row.icon - columns[0].icon) < .5 && Math.abs(row.text - columns[0].text) < .5), 'All four buttons align icon and text columns');
  if(process.env.CHATPICK_EXPORT_SCREENSHOT) await page.screenshot({path:process.env.CHATPICK_EXPORT_SCREENSHOT});
  let file = await download('markdown');
  assert.match(file.suggestedFilename(),/中文会话导出.*\.md$/);
  const markdown=fs.readFileSync(await file.path(),'utf8');
  assert.equal(markdown.split(longQuestion).length-1,2,'Repeated questions and full >300-char text');
  assert.ok(markdown.includes(answer),'Rich Markdown retained exactly');
  assert.ok(!/PRIVATE_REASONING|PRIVATE_TOOL|WRONG_BRANCH|synthetic-fixture/.test(markdown));
  await page.getByText('Downloaded.',{exact:true}).waitFor();
  file = await download('pdf');
  const bytes=fs.readFileSync(await file.path()); assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  assert.ok(bytes.length>10000 && bytes.length<2000000,'Font subset rather than full 16MB font');
  // Text extraction alone can pass while a malformed subset renders empty glyphs.
  const parsed=await PDFDocument.load(bytes);
  const fonts=parsed.getPages()[0].node.Resources().lookup(PDFName.of('Font'),PDFDict);
  let checkedGlyphs=0;
  for(const [,reference] of fonts.entries()) {
    const font=parsed.context.lookup(reference,PDFDict);
    if(!font.has(PDFName.of('DescendantFonts'))) continue;
    const descendant=font.lookup(PDFName.of('DescendantFonts'),PDFArray).lookup(0,PDFDict);
    const descriptor=descendant.lookup(PDFName.of('FontDescriptor'),PDFDict);
    const stream=descriptor.lookup(PDFName.of('FontFile2'),PDFRawStream);
    const embedded=createFont(Buffer.from(decodePDFRawStream(stream).decode()));
    const cmap=Buffer.from(decodePDFRawStream(font.lookup(PDFName.of('ToUnicode'),PDFRawStream)).decode()).toString();
    for(const [,cid,unicode] of cmap.matchAll(/<([0-9a-f]{4})>\s+<([0-9a-f]{4})>/gi)) {
      const code=parseInt(unicode,16);
      if(parseInt(cid,16)===0 || /[\s\p{Cf}\p{Mn}]/u.test(String.fromCodePoint(code))) continue;
      assert.ok(embedded.getGlyph(parseInt(cid,16)).path.commands.length>0,'Visible embedded glyph '+unicode);
      checkedGlyphs++;
    }
  }
  assert.ok(checkedGlyphs>50,'CJK/Latin glyph outlines are embedded');
  if(process.env.CHATPICK_PDF_QA) fs.copyFileSync(await file.path(),process.env.CHATPICK_PDF_QA);
  await page.getByText('Downloaded.',{exact:true}).waitFor();
  console.log('PASS ChatGPT: full branch, rich Markdown, repeated questions, downloadable CJK PDF');

  let forgedDownloads=0;
  const countForged=()=>forgedDownloads++;
  page.on('download',countForged);
  await page.evaluate(()=>window.postMessage({source:'chatpick:page',type:'export',id:'forged',format:'markdown',chat:{title:'Forged',provider:'ChatGPT',source:location.origin+location.pathname,exportedAt:new Date().toISOString(),partial:false,messages:[{id:'u',role:'user',markdown:'FORGED'}]}},location.origin));
  await page.waitForTimeout(150);assert.equal(forgedDownloads,0);page.off('download',countForged);
  await page.evaluate(()=>window.postMessage({source:'chatpick:extension',type:'settings',settings:{theme:'auto',language:'zh',colors:'site'}},location.origin));
  await page.getByRole('button',{name:'导出会话',exact:true}).waitFor();
  await page.evaluate(() => {
    document.documentElement.lang = 'zh-CN';
    window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { language: 'auto' } }, location.origin);
  });
  await page.waitForFunction(() => document.querySelector('#cgpt-btns').textContent.includes('上一问'));
  assert.deepEqual(await page.locator('#cgpt-btns .cn-control-label').allTextContents(), ['开头', '上一问', '下一问', '底部']);
  await page.evaluate(() => document.documentElement.lang = 'en');
  await page.getByRole('button', { name: 'Export conversation', exact: true }).waitFor();
  assert.deepEqual(await page.locator('#cgpt-btns .cn-control-label').allTextContents(), ['Start', 'Prev', 'Next', 'End']);
  await page.evaluate(() => {
    window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { language: 'zh' } }, location.origin);
    document.documentElement.lang = 'fr';
  });
  await page.getByRole('button', { name: '导出会话', exact: true }).waitFor();
  assert.equal(await page.locator('#cgpt-btns .cn-control-label').nth(1).textContent(), '上一问', 'Explicit choice overrides page language');
  if (process.env.CHATPICK_CONTROLS_SCREENSHOT) {
    await page.locator('#chatpick-export-close').click();
    await page.locator('#cgpt-nav-box').screenshot({ path: process.env.CHATPICK_CONTROLS_SCREENSHOT });
    await page.locator('#chatpick-export-button').click();
  }
  console.log('PASS aligned columns, live page language and manual override');
  await page.evaluate(()=>window.postMessage({source:'chatpick:extension',type:'settings',settings:{theme:'auto',language:'en',colors:'site'}},location.origin));
  await page.evaluate(()=>{const stop=document.createElement('button');stop.dataset.testid='stop-button';stop.id='fixture-stop';document.body.appendChild(stop);});
  file = await download('markdown');
  assert.match(fs.readFileSync(await file.path(),'utf8'), /Partial export/);
  await page.getByText('Downloaded.',{exact:true}).waitFor();
  assert.match(await page.locator('#chatpick-export-notice').textContent(), /Earlier messages may be missing/);
  await page.locator('#chatpick-export-close').click();
  await page.evaluate(()=>document.getElementById('fixture-stop').remove());
  await page.locator('#chatpick-export-button').click();
  console.log('PASS user-initiated download, Chinese labels and streaming warning');

  let cancelledPdfDownloads=0;
  const countCancelledPdf=()=>cancelledPdfDownloads++;
  page.on('download',countCancelledPdf);
  await page.locator('#chatpick-export-panel [data-format="pdf"]').click();
  await page.getByText('Preparing download…',{exact:true}).waitFor();
  assert.equal(await page.locator('#chatpick-export-close').getAttribute('aria-label'), 'Cancel export');
  assert.ok(await page.locator('#chatpick-export-cancel-hint').isVisible());
  await page.locator('#chatpick-export-close').click();
  assert.equal(await page.locator('#chatpick-export-button').getAttribute('aria-busy'), 'false');
  await page.waitForTimeout(500);assert.equal(cancelledPdfDownloads,0);page.off('download',countCancelledPdf);
  await page.locator('#chatpick-export-button').click();
  console.log('PASS cancellation during PDF generation');

  // Disabling export during generation removes its menu and cancels the download.
  let disabledDownloads = 0;
  const countDisabled = () => disabledDownloads++;
  page.on('download', countDisabled);
  await page.locator('#chatpick-export-panel [data-format="pdf"]').click();
  await page.getByText('Preparing download…', { exact: true }).waitFor();
  await page.evaluate(() => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { showExport: false } }, location.origin));
  await page.waitForFunction(() => !document.getElementById('chatpick-export-button'));
  await page.waitForTimeout(500);
  assert.equal(disabledDownloads, 0);
  assert.ok(await page.locator('#cgpt-btns').isVisible());
  page.off('download', countDisabled);
  await page.evaluate(() => window.postMessage({ source: 'chatpick:extension', type: 'settings', settings: { showExport: true } }, location.origin));
  await page.locator('#chatpick-export-button').click();
  console.log('PASS disabling export cancels pending PDF generation');

  // Fresh export reads history; API failure must not silently use a cached full snapshot.
  failApi = true;
  file = await download('markdown');
  assert.match(fs.readFileSync(await file.path(),'utf8'),/Partial export.*\n[\s\S]*页面上的提问[\s\S]*页面回答/);
  await page.getByText('Downloaded.',{exact:true}).waitFor();
  assert.match(await page.locator('#chatpick-export-notice').textContent(), /Earlier messages may be missing/);
  file = await download('pdf');
  assert.equal(fs.readFileSync(await file.path()).subarray(0,5).toString(), '%PDF-');
  await page.getByText('Downloaded.',{exact:true}).waitFor();
  assert.equal(await page.locator('#chatpick-export-partial').count(),0,'Partial exports need no second click');
  console.log('PASS API failure: one-click Markdown/PDF with partial notice and current DOM');

  // Cancellation and route exit suppress the delayed download and remove the menu.
  failApi=false;delayApi=true;let unexpected=0;page.on('download',()=>unexpected++);
  await page.locator('#chatpick-export-panel [data-format="markdown"]').click();
  await page.locator('#chatpick-export-close').click();
  await page.waitForTimeout(1700); assert.equal(unexpected,0);
  await page.locator('#chatpick-export-button').click();
  await page.locator('#chatpick-export-panel [data-format="markdown"]').click();
  await page.evaluate(()=>history.pushState({},'', '/'));
  await page.waitForTimeout(1700); assert.equal(unexpected,0);
  assert.equal(await page.locator('#chatpick-export-button').count(),0);
  console.log('PASS cancellation and route cleanup');

  const fixtures = [
    ['Claude','claude.ai','/chat/'+id,'<div data-testid="transcript-row" data-index="0"><div data-testid="user-message">提问</div></div><div data-testid="transcript-row" data-index="1"><div class="standard-markdown"><h2>回答</h2></div></div>', {chat_messages:[{uuid:'u',parent_message_uuid:null,sender:'human',content:[{type:'text',text:longQuestion}]},{uuid:'a',parent_message_uuid:'u',sender:'assistant',content:[{type:'thinking',thinking:'PRIVATE_REASONING'},{type:'text',text:'## Claude 最终回答'}]},{uuid:'sibling',parent_message_uuid:'u',sender:'assistant',content:[{type:'text',text:'WRONG_BRANCH'}]}],current_leaf_message_uuid:'a'}],
    ['DeepSeek','chat.deepseek.com','/a/chat/s/'+id,'<div data-virtual-list-item-key="1"><div class="ds-message"><div class="ds-collapsible-text">提问</div></div></div><div data-virtual-list-item-key="2"><div class="ds-message"><div class="ds-assistant-message-main-content"><h2>回答</h2></div></div></div>', {code:0,data:{biz_code:0,biz_data:{chat_session:{current_message_id:2,title:'DeepSeek测试'},chat_messages:[{message_id:1,parent_id:null,role:'USER',fragments:[{type:'REQUEST',content:longQuestion}]},{message_id:2,parent_id:1,role:'ASSISTANT',fragments:[{type:'THINK',content:'PRIVATE_REASONING'},{type:'RESPONSE',content:'## DeepSeek 最终回答'}]},{message_id:3,parent_id:1,role:'ASSISTANT',fragments:[{type:'RESPONSE',content:'WRONG_BRANCH'}]}]}}}],
    ['Gemini','gemini.google.com','/app/1111111111111111','<div class="conversation-container" id="turn-0"><user-query><p class="query-text-line">中文提问</p><button>Edit query</button></user-query><model-response><div class="thinking-container">PRIVATE_REASONING</div><message-content><div class="markdown"><h2>最终回答</h2><pre><code class="language-js">const n = 1;\n\n\nconsole.log(n);</code></pre><table><tr><th>名称</th><th>值</th></tr><tr><td>中文</td><td>42</td></tr></table><a href="https://example.com/">资料</a></div></message-content></model-response></div>'],
    ['Grok','grok.com','/c/'+id,'<div data-plane-row="u" style="transform:translateY(0px)"><div id="response-u"><div data-testid="user-message"><div class="relative">中文提问</div></div></div></div><div data-plane-row="a" style="transform:translateY(400px)"><div id="response-a"><div data-testid="assistant-message"><div class="thinking-container">PRIVATE_REASONING</div><div class="response-content-markdown"><h2>最终回答</h2></div></div></div></div>'],
    ['Perplexity','www.perplexity.ai','/search/'+id,'<div class="gap-2"><div class="w-full"><div data-workflow-entry="0"><div class="group/user-bubble"><button>Edit query</button><div data-renderer><p>中文提问</p></div></div></div></div><div class="w-full"><h2>Research status</h2><div data-workflow-final-text><div data-renderer><h2>最终回答</h2></div></div></div></div>'],
    ['Qwen','chat.qwen.ai','/c/'+id,'<div class="qwen-chat-message-user"><div class="chat-user-message-container" data-msg-id="u"><p class="user-message-content">中文提问</p></div></div><div class="qwen-chat-message-assistant"><div class="chat-response-message" data-msg-id="a"><div class="phase-thinking">PRIVATE_REASONING</div><div class="phase-answer"><div class="qwen-markdown"><h2>最终回答</h2></div></div></div></div>'],
  ];
  for (const [name,host,url,body,data] of fixtures) {
    const tab=await context.newPage();const tabErrors=[];tab.on('pageerror',e=>tabErrors.push(e.message));
    await tab.route('https://'+host+'/**',route=> {
      if(!route.request().isNavigationRequest()) return data ? route.fulfill({json:data}) : route.fulfill({status:503});
      return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><title>'+name+' fixture</title><style>user-query,model-response,message-content{display:block}</style><main>'+body+'</main>',headers:name==='Gemini'?{'Content-Security-Policy':"require-trusted-types-for 'script'"}:{}});
    });
    if(name==='Claude') await context.addCookies([{name:'lastActiveOrg',value:id,domain:host,path:'/'}]);
    if(name==='DeepSeek') await tab.addInitScript(()=>localStorage.setItem('userToken',JSON.stringify({value:'fixture-token'})));
    await tab.goto('https://'+host+url);await tab.locator('#chatpick-export-button').click();
    const pending=tab.waitForEvent('download');
    await tab.locator('#chatpick-export-panel [data-format="markdown"]').click();
    const content=fs.readFileSync(await (await pending).path(),'utf8');
    if(!data) { assert.match(content,/Partial export/); assert.ok(await tab.locator('#chatpick-export-notice').isVisible()); }
    assert.ok(content.includes(data?longQuestion:'中文提问'));
    assert.ok(content.includes('最终回答'));
    assert.ok(!/PRIVATE_REASONING|WRONG_BRANCH|Edit query|Research status|fixture-token/.test(content));
    if(name==='Gemini') { assert.ok(content.includes('const n = 1;\n\n\nconsole.log(n);'));assert.ok(content.includes('| 中文 | 42 |'));assert.ok(content.includes('https://example.com/')); }
    assert.deepEqual(tabErrors,[]);console.log('PASS '+name+': final text, scope and branch/partial handling');await tab.close();
  }
  assert.deepEqual(errors,[]);
  }
} finally { await context.close(); fs.rmSync(profile,{recursive:true,force:true}); }
