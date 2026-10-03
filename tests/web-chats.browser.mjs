// Synthetic DOM fixtures based on supported providers' rendered chat structure.
import fs from 'node:fs';
import { navigatorFixture } from './navigator-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const id = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const headings = n => `<h2>Section ${n}</h2><h3>Details ${n}</h3><pre><h4>Code heading</h4></pre><h5 class="sr-only">Hidden label</h5><h6 aria-hidden="true">Hidden heading</h6>`;
const qianwen = {
  name: 'Qianwen', path: '/chat/' + id.replaceAll('-', ''), other: '/chat/' + other.replaceAll('-', ''),
  css: '--ty-theme-primary:#0044ff;--ty-background-pop:#232326;--ty-text-primary:#fafbff;--ty-text-secondary:#aaa', accent: '#0044ff',
  excluded: ['/', '/chat', '/chat/', '/settings', '/projects', '/discovery', '/share/' + id, '/s/' + id, '/chat/short', '/chat/' + id, '/chat/' + id.replaceAll('-', '') + '/settings'],
  question: n => `<div class="chat-question-wrap" data-fixture-question="${n}"><div class="message-card-wrap question" data-mt="text/plain"><div class="question-text-card">Continue</div></div><button>Copy</button></div>`,
  answer: n => `<div class="chat-answers-card-wrap" data-chat-answers-wrap="turn-${n}" data-offset="1" hidden><div class="answer-common-card"><div class="qk-markdown"><h2>Hidden branch</h2></div></div></div><div class="chat-answers-card-wrap" data-chat-answers-wrap="turn-${n}" data-offset="0"><div class="thinking-card"><div class="qk-markdown"><h2>Thinking</h2></div></div><div class="answer-common-card"><div class="qk-markdown">${headings(n)}</div></div></div>`,
  wrap: (n, question, answer) => `<div class="chat-round" data-chat="turn-${n}" data-chat-pos="${1000+n}">${question}${answer}</div>`,
};
const providers = [
  ...['www.qianwen.com', 'qianwen.com'].map(host => ({ ...qianwen, host })),
  { name: 'Gemini', host: 'gemini.google.com', path: '/app/1111111111111111', other: '/app/2222222222222222', css: '--gem-sys-color--primary:#a8c7fa;--gem-sys-color--on-surface:#e3e3e3;--gem-sys-color--surface-container:#1e1f20', accent: '#a8c7fa', excluded: ['/', '/app', '/search', '/students', '/library', '/notebooks/create', '/notebook/'+id, '/share/'+id, '/app/short', '/app/1111111111111111/settings'],
    question: n => `<user-query data-fixture-question="${n}"><h5 class="cdk-visually-hidden">You said</h5><p class="query-text-line">Continue</p><button>Edit query</button></user-query>`,
    answer: n => `<model-response><div class="thinking-container"><h2>Thinking</h2></div><message-content><div class="markdown">${headings(n)}</div></message-content></model-response>`,
    wrap: (n, question, answer) => `<div class="conversation-container" id="turn-${n}">${question}${answer}</div>` },
  { name: 'Grok', host: 'grok.com', path: '/c/'+id, other: '/c/'+other, css: '--primary:0 0% 99%;--fg-primary:0 0% 99%;--surface-elevated:30 5% 13%;--fg-accent:207 100% 58%', accent: 'hsl(0 0% 99%)', excluded: ['/', '/imagine', '/library', '/automations', '/imagine/agent/'+id+'?conversation='+id, '/share/'+id, '/c/short', '/c/'+id+'/settings'],
    question: n => `<div id="response-u${n}"><div data-testid="user-message" data-fixture-question="${n}"><div class="relative">Continue</div><button>Copy</button></div></div>`,
    answer: n => `<div id="response-a${n}"><div data-testid="assistant-message"><div class="thinking-container"><h2>Thinking</h2></div><div class="response-content-markdown">${headings(n)}</div></div></div>`,
    wrap: (n, question, answer) => `<div data-plane-row="u${n}" style="transform:translateY(${n*900}px)">${question}</div><div data-plane-row="a${n}" style="transform:translateY(${n*900+200}px)">${answer}</div>` },
  { name: 'Perplexity', host: 'www.perplexity.ai', path: '/search/'+id, other: '/search/'+other, css: '--accent-fg-primary:#4e99a3;--surface-raised:#1d1d1d;--fg-primary:#dedede;--fg-secondary:#a8a8a8', accent: '#4e99a3', excluded: ['/', '/search', '/library', '/projects', '/projects/'+id, '/computer/tasks', '/computer/artifacts', '/computer/automations', '/computer/connectors', '/page/'+id, '/s/'+id, '/settings', '/search/settings', '/search/'+id+'/settings'],
    question: n => `<div data-workflow-entry="${n}"><div class="group/user-bubble" data-fixture-question="${n}"><button>Edit query</button><div data-renderer="lm"><p>Continue</p></div></div></div>`,
    answer: n => `<div><h2>Research status</h2></div><div data-workflow-final-text><div data-renderer="lm">${headings(n)}</div></div>`,
    wrap: (n, question, answer) => `<div class="w-full">${question}</div><div class="w-full">${answer}</div>` },
  { name: 'Qwen', host: 'chat.qwen.ai', path: '/c/'+id, other: '/c/'+other, css: '--character-brandprimary-text:#3b6fff;--container-primary-fill:#232326;--text-primary:#fafbff;--text-secondary:rgba(250,251,255,.7)', accent: '#3b6fff', excluded: ['/', '/projects', '/community', '/coder', '/settings', '/share/'+id, '/c/short', '/c/'+id+'/settings'],
    question: n => `<div class="qwen-chat-message-user"><div class="chat-user-message-container" data-msg-id="u${n}" data-fixture-question="${n}"><p class="user-message-content">Continue</p><button>Copy</button></div></div>`,
    answer: n => `<div class="qwen-chat-message-assistant"><div class="chat-response-message" id="chat-response-message-a${n}"><div class="phase-thinking"><div class="qwen-markdown"><h2>Thinking</h2></div></div><div class="phase-answer"><div class="qwen-markdown">${headings(n)}</div></div></div></div>`,
    wrap: (n, question, answer) => `<div>${question}${answer}</div>` },
];
const browser = await chromium.launch({headless:true});
try {
  for (const provider of providers) {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[]; let requests=0;
    page.on('pageerror',error=>errors.push(error.message));
    const messages = [0,1,2].map(n=>provider.wrap(n,provider.question(n),provider.answer(n))).join('');
    const html = `<!doctype html><style>body{margin:0;background:#171717;color:#fafafa;${provider.css}}.sr-only,.cdk-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden}#scroller{height:900px;overflow:auto}#feed{padding:100px 40px 1400px;width:720px}#feed>div{min-height:450px}user-query,model-response,message-content{display:block}[data-fixture-question]{padding-top:20px;margin-bottom:180px}.markdown,.response-content-markdown,[data-renderer],.qwen-markdown{min-height:300px}h2,h3{margin:0 0 100px}</style><aside>${provider.question(99)}</aside><div id="scroller"><div id="feed" class="flex flex-col gap-2 message-list-content-container">${messages}</div></div>`;
    await page.route(`https://${provider.host}/**`, route=> {
      if(!route.request().isNavigationRequest()){requests++;return route.fulfill({status:503,body:'Unexpected history request'});}
      return route.fulfill({contentType:'text/html',body:html,headers: provider.name === 'Gemini' ? {'Content-Security-Policy':"require-trusted-types-for 'script'"} : {}});
    });
    await page.goto(`https://${provider.host}${provider.path}`);
    await page.evaluate(source); // CDP execution matches extension MAIN-world injection, without a page HTML sink.
    const items=page.locator('#cgpt-toc .cn-item');
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length===3);
    assert.equal(await page.locator('#cgpt-btns button').first().getAttribute('aria-disabled'),'true','Start is unavailable at the physical top without API history');
    assert.equal(await page.locator('#cgpt-btns button').nth(1).getAttribute('aria-disabled'),'true','Previous is unavailable at the physical top without API history');
    assert.deepEqual(await items.locator('.cn-t').allTextContents(), ['Continue','Continue','Continue']);
    assert.equal(await page.locator('#cgpt-nav-box').evaluate(n=>getComputedStyle(n).getPropertyValue('--cn-active').trim()),provider.accent);
    await items.nth(1).click();
    await page.waitForFunction(()=>document.querySelector('#cgpt-sections')?.hidden===false);
    assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(),['Section 1','Details 1']);
    assert(Math.abs(await page.locator('[data-fixture-question="1"]').evaluate(n=>n.getBoundingClientRect().top)-72)<2);
    const questionColor=await items.nth(0).evaluate(n=>getComputedStyle(n).color);
    const sectionColor=await page.locator('#cgpt-sections .cn-item').last().evaluate(n=>getComputedStyle(n).color);
    assert.equal(questionColor,sectionColor,'question and answer default text colors match');
    await page.locator('#cgpt-sections .cn-item').last().click();
    assert(Math.abs(await page.locator('#feed h3').nth(1).evaluate(n=>n.getBoundingClientRect().top)-72)<2);
    if (provider.name === 'Gemini') await page.screenshot({path:'/tmp/chatpick-gemini-navigation.png'});
    // Streaming headings update the open menu and exclude non-final content.
    await page.locator('#feed h3').nth(1).evaluate(n=>{const heading=document.createElement('h4');heading.textContent='Streamed section';n.after(heading);});
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-sections .cn-item').length===3);
    assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(),['Section 1','Details 1','Streamed section']);
    const settings=next=>page.evaluate(settings=>window.postMessage({source:'chatpick:extension',type:'settings',settings},location.origin),next);
    if(provider.name==='Grok') {
      await settings({theme:'light',colors:'site'});
      await page.waitForFunction(()=>document.querySelector('#cgpt-nav-box')?.dataset.theme==='light' && document.querySelector('#cgpt-nav-box').style.getPropertyValue('--cn-active')==='#171717');
    }
    await settings({theme:'auto',colors:'default'});
    await page.waitForFunction(()=>!document.querySelector('#cgpt-nav-box').style.getPropertyValue('--cn-active'));
    await settings({theme:'auto',colors:'site'});
    await page.waitForFunction(accent=>document.querySelector('#cgpt-nav-box').style.getPropertyValue('--cn-active')===accent,provider.accent);
    // A live light theme must update body-owned tokens and the panel appearance.
    await page.evaluate(token=>{
      document.body.style.backgroundColor='#ffffff';
      document.body.style.setProperty(token,'#123456');
      document.documentElement.classList.add('light');
    },provider.css.split(':')[0]);
    await page.waitForFunction(()=>document.querySelector('#cgpt-nav-box')?.dataset.theme==='light' && document.querySelector('#cgpt-nav-box').style.getPropertyValue('--cn-active')==='#123456');
    // Retain observed identity and sections while sparse messages are unmounted.
    await page.evaluate(()=>{document.querySelector('[data-fixture-question="0"]').closest('#feed>div').textContent='';});
    await page.waitForTimeout(450);
    assert.equal(await items.count(),3);
    if (provider.name === 'Qianwen') {
      await page.locator('#feed>div').first().evaluate((node, html) => node.innerHTML = html, provider.question(0) + provider.answer(0));
      await page.waitForTimeout(450);
      assert.equal(await items.count(), 3, 'Remounted Qianwen questions retain their stable identities');
      await items.first().click();
      assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(), ['Section 0', 'Details 0']);
    }
    // A route change with old DOM still present must show neither old users nor answers.
    await page.evaluate(path=>history.pushState({},'',path),provider.other);
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length===0);
    await page.evaluate(()=>document.querySelector('#feed').textContent='');
    await page.waitForTimeout(450);
    assert.equal(await items.count(),0,'answer-only or stale DOM must not become a question');
    for(const path of provider.excluded){
      await page.evaluate(path=>history.pushState({},'',path),path);
      await page.waitForFunction(()=>!document.querySelector('#cgpt-nav-box'));
      assert.equal(await page.locator('#cgpt-nav-style,#cgpt-nav-toast').count(),0);
    }
    // Restore a chat through SPA navigation and leave again through browser history.
    // Browser back reuses the restored transcript nodes after leaving the chat.
    await page.evaluate(path=>history.pushState({},'',path),provider.path);
    await page.reload();
    await page.evaluate(source);
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length===3);
    await page.evaluate(()=>history.pushState({},'','/settings'));
    await page.waitForFunction(()=>!document.querySelector('#cgpt-nav-box'));
    await page.goBack();
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length===3);
    await page.goForward();
    await page.waitForFunction(()=>!document.querySelector('#cgpt-nav-box'));
    assert.equal(requests,0,'DOM adapters must not request credentials or chat APIs');
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${provider.name} identity, sections, streaming, colors, sparse cache and ${provider.excluded.length} excluded routes`);
    await page.close();
  }

  for (const provider of providers.filter(p=>['Grok','Perplexity'].includes(p.name))) {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const content=Array.from({length:12},(_,index)=>index%2?provider.answer(Math.floor(index/2)):provider.question(Math.floor(index/2)));
    const rows=content.map((_,index)=>provider.name==='Grok'
      ? `<div data-plane-row="row-${index}" style="position:absolute;top:100px;transform:translateY(${index*400}px);width:700px;height:400px"></div>`
      : '<div class="w-full" style="height:400px;flex-shrink:0"></div>').join('');
    await page.route(`https://${provider.host}/**`,route=>route.fulfill({contentType:'text/html',body:`<style>body{margin:0;background:#171717;color:white}#scroller{height:900px;overflow:auto}#feed{position:relative;padding-top:100px;height:4800px;width:720px;box-sizing:content-box}h2,h3,p{margin:0}h2,h3{margin-top:100px}.sr-only{display:none}</style><div id="scroller"><div id="feed" class="flex flex-col gap-2">${rows}</div></div>`}));
    await page.goto(`https://${provider.host}${provider.path}`);
    await page.evaluate(content=>{
      const scroller=document.querySelector('#scroller');const rows=[...document.querySelector('#feed').children];
      const render=()=>{
        const start=Math.max(0,Math.floor((scroller.scrollTop-100)/400));
        rows.forEach((row,index)=>{
          const visible=index>=start && index<=start+4;
          if(visible && !row.childElementCount)row.innerHTML=content[index];
          if(!visible)row.textContent='';
        });
      };
      scroller.addEventListener('scroll',render);render();
    },content);
    await page.evaluate(source);
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length===3);
    await page.locator('#scroller').evaluate(node=>node.scrollTop=4000);
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length===4);
    assert.equal(await page.locator('[data-fixture-question="0"]').count(),0);
    await page.locator('#cgpt-toc .cn-item').first().click();
    await page.waitForFunction(()=>!!document.querySelector('[data-fixture-question="0"]') && Math.abs(document.querySelector('[data-fixture-question="0"]').getBoundingClientRect().top-72)<2);
    assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(),['Section 0','Details 0']);
    await page.locator('#cgpt-sections .cn-item').last().click();
    await page.waitForFunction(()=>Math.abs(document.querySelector('#feed h3').getBoundingClientRect().top-72)<2);
    await page.locator('#scroller').evaluate(node=>node.scrollTop=1700);
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length>=5);
    await page.locator('#scroller').evaluate(node=>node.scrollTop=2100);
    await page.waitForFunction(()=>document.querySelectorAll('#cgpt-toc .cn-item').length===6);
    await page.locator('#cgpt-toc .cn-item').nth(3).click();
    await page.waitForFunction(()=>Math.abs(document.querySelector('[data-fixture-question="3"]').getBoundingClientRect().top-72)<2);
    assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(),['Section 3','Details 3']);
    await page.locator('#cgpt-btns button').nth(1).click();
    await page.waitForFunction(()=>!!document.querySelector('[data-fixture-question="2"]') && Math.abs(document.querySelector('[data-fixture-question="2"]').getBoundingClientRect().top-72)<2);
    await page.locator('#cgpt-btns button').nth(2).click();
    await page.waitForFunction(()=>Math.abs(document.querySelector('[data-fixture-question="3"]').getBoundingClientRect().top-72)<2);
    await page.locator('#cgpt-btns button').last().click();
    await page.waitForFunction(()=>{const n=document.querySelector('#scroller');return n.scrollTop+n.clientHeight>=n.scrollHeight-2;});
    await page.locator('#cgpt-btns button').first().click();
    await page.waitForFunction(()=>document.querySelector('#scroller').scrollTop<2 && !!document.querySelector('[data-fixture-question="0"]'));
    await page.waitForFunction(()=>document.querySelector('#cgpt-btns button').getAttribute('aria-disabled')==='true');
    assert.equal(await page.locator('#cgpt-btns button').nth(1).getAttribute('aria-disabled'),'true','Start dims upward controls after remounting earlier questions');
    console.log(`PASS: ${provider.name} remounted questions and answer headings, repeated text and disjoint virtual windows`);
    await page.close();
  }
} finally {await browser.close();}
