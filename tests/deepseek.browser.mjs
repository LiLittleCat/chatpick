// Exercises DeepSeek's sparse virtual transcript, active branches and DOM fallback.
import fs from 'node:fs';
import { navigatorFixture } from './navigator-fixture.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = navigatorFixture(fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8'));
const browser = await chromium.launch({ headless: true });
try {
  for (const fallback of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const messages = Array.from({length: 24}, (_, index) => ({
      message_id: index + 1, parent_id: index ? index : null,
      role: index % 2 ? 'ASSISTANT' : 'USER',
      text: index % 2 ? `## Section ${index}\n\n\`\`\`\n# Code example\n\`\`\`` : index === 22 ? 'Final question' : 'Continue',
      fragments: index % 2 ? [{type:'THINK',content:'# Hidden thought'}, {type:'TOOL_OPEN',content:'# Tool result'}, {type:'RESPONSE',content:`## Section ${index}`}]:[{type:'REQUEST',content:index === 22 ? 'Final question' : 'Continue'}],
    }));
    // Alternate branch must not appear in the active conversation.
    const data = { code:0,data:{biz_code:0,biz_data:{chat_messages:[...messages,{message_id:25,parent_id:21,role:'USER',fragments:[{type:'REQUEST',content:'Wrong branch'}]}],chat_session:{current_message_id:24}}}};
    const html = `<!doctype html><style>body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}#scroller{height:900px;overflow-y:auto}#feed{height:12000px;position:relative}[data-virtual-list-item-key]{position:absolute;width:700px;left:50px;height:500px}.ds-assistant-message-main-content h2{margin:0}</style><div id="scroller"><div id="feed"></div></div><div id="native-navigation" style="--scroll-nav-page-padding:15px 0 15px 24px;position:fixed;right:0;top:400px">Native questions</div><script>
      const messages=${JSON.stringify(messages)};
      function render() {
        const start=Math.floor(document.querySelector('#scroller').scrollTop/500);
        const visible=new Set([0,1,22,23,start,start+1,start+2]);
        const feed=document.querySelector('#feed');
        for(const row of [...feed.children]) if(!visible.has(Number(row.dataset.virtualListItemKey)-1))row.remove();
        for(const index of [...visible].sort((a,b)=>a-b)) {
          const message=messages[index];if(!message||feed.querySelector('[data-virtual-list-item-key="'+(index+1)+'"]'))continue;
          const row=document.createElement('div');row.dataset.virtualListItemKey=index+1;row.style.top=index*500+'px';
          row.innerHTML=message.role==='USER'?'<div class="ds-message"><span>Attachment.png</span><div class="ds-collapsible-text">'+message.text+'</div></div>':'<div class="ds-message"><div class="ds-think-content"><div class="ds-markdown"><h2>Hidden thought</h2></div></div><div class="ds-markdown ds-assistant-message-main-content"><h2>Section '+index+'</h2><pre><h3>Code example</h3></pre></div><div><h2>Tool status</h2></div></div>';

          feed.append(row);
        }
        [...feed.children].sort((a,b)=>a.dataset.virtualListItemKey-b.dataset.virtualListItemKey).forEach(row=>feed.append(row));
      }
      const native=document.querySelector('#native-navigation');
      native.innerHTML='<div class="ds-virtual-list"><div class="ds-virtual-list-visible-items" style="--dsl-virtual-list-transform-y:0px"></div></div>';
      messages.filter(message=>message.role==='USER').forEach((message,index)=>{
        const row=document.createElement('div');row.style.height='30px';row.innerHTML='<div>'+message.text+'</div><div></div>';
        row.onclick=()=>{document.body.dataset.nativeJumps=String(Number(document.body.dataset.nativeJumps||0)+1);document.querySelector('#scroller').scrollTop=index*1000;};
        native.querySelector('.ds-virtual-list-visible-items').append(row);
      });
      document.querySelector('#scroller').addEventListener('scroll',render);render();
    </script>`;
    let apiRequests = 0;
    await page.route('https://chat.deepseek.com/**',route => {
      if(route.request().url().includes('/api/v0/chat/history_messages')) { assert.equal(route.request().headers().authorization,'Bearer fixture');apiRequests++; return fallback ? route.fulfill({status:503,body:'Unavailable'}) : route.fulfill({json:data}); }
      return route.fulfill({contentType:'text/html',body:html});
    });
    await page.addInitScript(()=>localStorage.setItem('userToken',JSON.stringify({value:'fixture',__version:'0'})));
    await page.goto('https://chat.deepseek.com/a/chat/s/deepseek-fixture');
    await page.addScriptTag({content:source});
    await page.waitForTimeout(500);
    assert.equal(apiRequests,1);
    const items=page.locator('#cgpt-toc .cn-item');
    if (!fallback) {
      assert.equal(await items.count(),12);
      assert(!await items.allTextContents().then(texts=>texts.includes('Wrong branch')));
      await items.nth(6).click();
      await page.waitForTimeout(900);
      const top=await page.locator('[data-virtual-list-item-key="13"]').evaluate(row=>row.getBoundingClientRect().top);
      assert(Math.abs(top-72)<2,`virtualized middle question top=${top}`);
      assert(await page.evaluate(()=>Number(document.body.dataset.nativeJumps))>0,"reuses native navigation to mount the selected message");
      assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(),['Section 13']);
      await page.locator('#cgpt-sections .cn-item').click();
      await page.waitForTimeout(250);
      assert(Math.abs(await page.locator('[data-virtual-list-item-key="14"] .ds-assistant-message-main-content h2').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
      // The current answer remains mounted while its question is virtualized away.
      await page.locator('#scroller').evaluate(node=>node.scrollTop=6600);
      await page.waitForTimeout(900);
      assert.equal(await page.locator('[data-virtual-list-item-key="13"]').count(),0);
      assert.equal(await page.locator('#cgpt-toc .cn-item.active').evaluate(node=>[...node.parentElement.children].indexOf(node)),6);
      await page.locator('#cgpt-btns button').nth(2).click();
      await page.waitForTimeout(900);
      assert(Math.abs(await page.locator('[data-virtual-list-item-key="15"]').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
      await items.nth(6).click();
      await page.waitForTimeout(900);
      await page.locator('#cgpt-btns button').nth(1).click();
      await page.waitForTimeout(900);
      assert(Math.abs(await page.locator('[data-virtual-list-item-key="11"]').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
      await page.locator('#cgpt-btns button').nth(2).click();
      await page.waitForTimeout(900);
      assert(Math.abs(await page.locator('[data-virtual-list-item-key="13"]').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
      await page.locator('#cgpt-btns button').nth(3).click();
      await page.waitForTimeout(600);
      assert.equal(await page.locator('#scroller').evaluate(node=>node.scrollTop),11100);
      await page.locator('#cgpt-btns button').first().click();
      await page.waitForTimeout(900);
      assert.equal(await page.locator('#scroller').evaluate(node=>node.scrollTop),0);
    } else {
      const before=await items.count();
      assert.equal(before,3); // sparse first two and final human rows, never merged by repeated text
      await page.locator('#scroller').evaluate(node=>node.scrollTop=6000);
      await page.waitForTimeout(600);
      assert.equal(await items.count(),5);
      await page.locator('#scroller').evaluate(node=>node.scrollTop=0);
      await page.waitForTimeout(600);
      assert.equal(await items.count(),5); // retained after unmount
    }
    assert.equal(await page.locator('#native-navigation').evaluate(node=>getComputedStyle(node).visibility),'hidden');
    await page.evaluate(()=> {history.pushState({},'', '/a/chat/s/other-fixture'); document.querySelector('#feed').innerHTML='';});
    await page.waitForTimeout(2300);
    assert.equal(await items.count(),fallback ? 0 : 12);
    assert.equal(await page.locator('#cgpt-nav-toast').count(),0);
    await page.evaluate(()=>history.pushState({},'', '/'));
    await page.waitForTimeout(2300);
    assert(!await page.locator('#cgpt-nav-box').isVisible());
    assert.equal(await page.locator('#native-navigation').evaluate(node=>getComputedStyle(node).visibility),'visible');
    assert.deepEqual(errors,[]);
    console.log(`PASS: DeepSeek ${fallback?'DOM fallback':'API'}, sparse virtualization, duplicate text, sections, navigation and chat reset`);
    await page.close();
  }
} finally { await browser.close(); }
