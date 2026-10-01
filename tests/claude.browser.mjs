// Exercises Claude's sparse virtual transcript, active branches and DOM fallback.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const source = fs.readFileSync(new URL('../.output/chrome-mv3/content-scripts/navigator.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  for (const fallback of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const messages = Array.from({length: 24}, (_, index) => ({
      uuid: `m${index}`, parent_message_uuid: index ? `m${index - 1}` : null,
      sender: index % 2 ? 'assistant' : 'human',
      text: index % 2 ? `## Section ${index}\n\n\`\`\`\n# Code example\n\`\`\`` : index === 22 ? 'Final question' : 'Continue',
      content: index % 2 ? [{type:'thinking',thinking:'# Hidden thought'}, {type:'tool_result',text:'# Tool result'}, {type:'text',text:`## Section ${index}`}]:[],
    }));
    // Alternate branch must not appear in the active conversation.
    const data = { chat_messages: [...messages, {uuid:'alternate',parent_message_uuid:'m20',sender:'human',text:'Wrong branch'}], current_leaf_message_uuid:'m23' };
    const html = `<!doctype html><style>body{margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden}#scroller{height:900px;overflow-y:auto}#feed{height:12000px;position:relative}[data-testid="transcript-row"]{position:absolute;width:700px;left:50px;height:500px}.standard-markdown h2{margin:0}</style><div id="scroller"><div id="feed" role="feed"></div></div><script>
      const messages=${JSON.stringify(messages)};
      function render() {
        const start=Math.floor(document.querySelector('#scroller').scrollTop/500);
        const visible=new Set([0,1,22,23,start,start+1,start+2]);
        const feed=document.querySelector('#feed');
        for(const row of [...feed.children]) if(!visible.has(Number(row.dataset.index)))row.remove();
        for(const index of [...visible].sort((a,b)=>a-b)) {
          const message=messages[index];if(!message||feed.querySelector('[data-index="'+index+'"]'))continue;
          const row=document.createElement('div');row.dataset.testid='transcript-row';row.dataset.index=index;row.dataset.perfRow=message.sender;row.style.top=index*500+'px';
          row.innerHTML='<div role="article" aria-posinset="'+(index+1)+'" aria-setsize="24">'+(message.sender==='human'?'<div data-cds="UserMessage"><span>Attachment.png</span><div data-testid="user-message">'+message.text+'</div></div>':'<div data-testid="assistant-message"><h2 class="sr-only">Claude responded: hidden summary</h2><div class="standard-markdown"><h2>Section '+index+'</h2><pre><h3>Code example</h3></pre></div><div data-testid="TurnStatus"><h2>Tool status</h2></div></div>')+'</div>';
          feed.append(row);
        }
        [...feed.children].sort((a,b)=>a.dataset.index-b.dataset.index).forEach(row=>feed.append(row));
      }
      document.querySelector('#scroller').addEventListener('scroll',render);render();
    </script>`;
    let apiRequests = 0;
    await page.route('https://claude.ai/**',route => {
      if(route.request().url().includes('/api/organizations/')) { apiRequests++; return fallback ? route.fulfill({status:503,body:'Unavailable'}) : route.fulfill({json:data}); }
      return route.fulfill({contentType:'text/html',body:html});
    });
    await page.context().addCookies([{name:'lastActiveOrg',value:'00000000-0000-0000-0000-000000000001',domain:'claude.ai',path:'/'}]);
    await page.goto('https://claude.ai/chat/claude-fixture');
    await page.addScriptTag({content:source});
    await page.waitForTimeout(500);
    assert.equal(apiRequests,1);
    const items=page.locator('#cgpt-toc .cn-item');
    if (!fallback) {
      assert.equal(await items.count(),12);
      assert(!await items.allTextContents().then(texts=>texts.includes('Wrong branch')));
      await items.nth(6).click();
      await page.waitForTimeout(900);
      const top=await page.locator('[data-index="12"]').evaluate(row=>row.getBoundingClientRect().top);
      assert(Math.abs(top-72)<2,`virtualized middle question top=${top}`);
      assert.deepEqual(await page.locator('#cgpt-sections .cn-t').allTextContents(),['Section 13']);
      await page.locator('#cgpt-sections .cn-item').click();
      await page.waitForTimeout(250);
      assert(Math.abs(await page.locator('[data-index="13"] .standard-markdown h2').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
      // The current answer remains mounted while its question is virtualized away.
      await page.locator('#scroller').evaluate(node=>node.scrollTop=6600);
      await page.waitForTimeout(900);
      assert.equal(await page.locator('[data-index="12"]').count(),0);
      assert.equal(await page.locator('#cgpt-toc .cn-item.active').evaluate(node=>[...node.parentElement.children].indexOf(node)),6);
      await page.locator('#cgpt-btns button').nth(2).click();
      await page.waitForTimeout(900);
      assert(Math.abs(await page.locator('[data-index="14"]').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
      await items.nth(6).click();
      await page.waitForTimeout(900);
      await page.locator('#cgpt-btns button').nth(1).click();
      await page.waitForTimeout(900);
      assert(Math.abs(await page.locator('[data-index="10"]').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
      await page.locator('#cgpt-btns button').nth(2).click();
      await page.waitForTimeout(900);
      assert(Math.abs(await page.locator('[data-index="12"]').evaluate(node=>node.getBoundingClientRect().top)-72)<2);
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
    await page.evaluate(()=> {history.pushState({},'', '/chat/other-fixture'); document.querySelector('#feed').innerHTML='';});
    await page.waitForTimeout(2300);
    assert.equal(await items.count(),fallback ? 0 : 12);
    assert.equal(await page.locator('#cgpt-nav-toast').count(),0);
    assert.deepEqual(errors,[]);
    console.log(`PASS: Claude ${fallback?'DOM fallback':'API'}, sparse virtualization, duplicate text, sections, navigation and chat reset`);
    await page.close();
  }
} finally { await browser.close(); }
