// ==UserScript==
// @name         ChatGPT 对话导航 · Chat Navigator
// @namespace    https://tampermonkey.net/
// @version      1.9.0
// @description  ChatGPT 页面右侧：提问目录（完整、随滚动高亮，支持跳到未渲染的消息）+ 四个导航按钮
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

export function startNavigator() {
  'use strict';

  let settings = { theme: 'auto', language: 'en' };
  const labels = {
    en: {
      placeholder: '[Image/attachment]',
      missing: 'No messages found. Diagnostics: ',
      mismatch: 'Unable to locate: loaded messages do not match the list. Please try again later',
      locating: 'Loading and locating…',
      timeout: 'Navigation timed out. Please try again',
      first: 'Already at the first question',
      last: 'Already at the last question',
      error: 'Navigator error: ',
      start: 'Go to start of chat',
      prev: 'Previous question (click repeatedly)',
      next: 'Next question (click repeatedly)',
      bottom: 'Go to bottom',
      sections: 'Answer sections',
      sectionMissing: 'Unable to locate this section. Please try again',
      loadingNav: 'Loading navigation…',
    },
    zh: {
      placeholder: '[图片/附件]',
      missing: '未找到消息。诊断：',
      mismatch: '无法定位：已加载的内容与目录对不上，请稍后重试',
      locating: '正在加载并定位…',
      timeout: '定位超时，请重试',
      first: '已经是第一个提问',
      last: '已经是最后一个提问',
      error: '脚本出错：',
      start: '回到聊天开始',
      prev: '上一个提问（可连续点击）',
      next: '下一个提问（可连续点击）',
      bottom: '跳到底部',
      sections: '回答章节',
      sectionMissing: '无法定位这个章节，请重试',
      loadingNav: '正在加载导航…',
    },
  };
  const label = (key) => labels[settings.language][key];

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'chatpick:extension' || event.data?.type !== 'settings') return;
    const { theme, language } = event.data.settings || {};
    settings = {
      theme: theme === 'light' || theme === 'dark' ? theme : 'auto',
      language: language === 'zh' ? 'zh' : 'en',
    };
    const buttons = document.querySelectorAll('#cgpt-btns button');
    ['start', 'prev', 'next', 'bottom'].forEach((key, i) => {
      if (buttons[i]) {
        buttons[i].title = label(key);
        buttons[i].setAttribute('aria-label', label(key));
      }
    });
    tocSig = '';
    safe(refreshToc, '目录');
    safe(applyTheme, '主题');
  });
  window.postMessage({ source: 'chatpick:page', type: 'ready' }, location.origin);


  // 滚动后目标与可视区域顶部的留白（避开固定标题栏），可按需调整
  const TOP_OFFSET = 72;
  // 连续快速点击时，视为同一轮滚动的时间窗口（毫秒）
  const CLICK_WINDOW = 800;
  // 是否使用平滑滚动。false = 点击后直接跳转（默认）
  const SMOOTH_SCROLL = false;
  // 主题：'auto' 跟随页面当前主题；也可以强制为 'light' 或 'dark'
  // 目录：收起时的宽度 / 悬停展开后的宽度（像素）
  const TOC_WIDTH = 84;
  const TOC_WIDTH_HOVER = 280;

  const USER_ROLE_SEL = [
    '[data-user-message-bubble]',
    '[data-message-author-role="user"]',
    '[data-message-role="user"]',
    '[data-turn="user"]',
    '[data-role="user"]',
    '[data-message-author="user"]',
    '[data-testid="user-message"]',
    '[data-content-search-unit-key$=":user"]',
    '[data-chatgpt-search-unit-key$=":user"]',
  ].join(',');

  const ASSISTANT_ROLE_SEL = [
    '[data-message-author-role="assistant"]',
    '[data-message-role="assistant"]',
    '[data-turn="assistant"]',
    '[data-role="assistant"]',
    '[data-message-author="assistant"]',
    '[data-testid="assistant-message"]',
    '[data-content-search-unit-key$=":assistant"]',
    '[data-chatgpt-search-unit-key$=":assistant"]',
  ].join(',');

  const ANY_ROLE_SEL = [
    '[data-user-message-bubble]',
    '[data-message-author-role]',
    '[data-message-role]',
    '[data-content-search-unit-key]',
    '[data-chatgpt-search-unit-key]',
  ].join(',');

  const TURN_SEL = [
    '[data-testid^="conversation-turn"]',
    '[data-turn]',
    '[data-message-role]',
    '[data-chatgpt-search-unit-key]',
    '[data-content-search-unit-key]',
  ].join(',');

  const PLACEHOLDER = '[图片/附件]';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 任何一步出错只记录日志，不影响其它功能（避免整个导航因为一处异常而消失）
  function safe(fn, label) {
    try {
      fn();
    } catch (err) {
      console.error('[ChatGPT 对话导航] ' + label + '出错：', err);
    }
  }

  // =====================================================================
  //  纯逻辑：完整的提问列表 entries，以及"当前已渲染的提问"与它的对齐
  //
  //  背景：ChatGPT 对长对话会做懒加载 / 虚拟化——屏幕外的消息会被卸载，
  //  往上滚才会加载更早的消息，同时下面的又被卸载。所以目录不能只看当前 DOM，
  //  而是维护一份"完整列表"（优先从接口取，失败则用 DOM 增量合并），
  //  再用文字把当前 DOM 里的提问对齐到这份列表上。
  // =====================================================================
  // <pure>
  let entries = [];   // [{ key, text, local? }]，按时间顺序的所有提问
  let lastOffset = 0; // 上次对齐结果，用于重复文字时消歧
  let previousChatIds = new Set();
  let previousChatNodes = new WeakSet();

  function normKey(text) {
    return text.replace(/\s+/g, '').slice(0, 40);
  }

  // 把当前 DOM 里连续的一段提问（keys）对齐到 entries，返回第一条对应的全局下标；失败返回 -1
  function locateKeys(keys) {
    const N = entries.length;
    const L = keys.length;
    if (!N || !L) return -1;
    const score = (s) => {
      let sc = 0;
      for (let k = 0; k < L && s + k < N; k++) if (entries[s + k].key === keys[k]) sc++;
      return sc;
    };
    if (lastOffset < N && score(lastOffset) === L) return lastOffset;
    let best = -1, bestSc = -1, bestDist = Infinity;
    for (let s = 0; s < N; s++) {
      const sc = score(s);
      const d = Math.abs(s - lastOffset);
      if (sc > bestSc || (sc === bestSc && d < bestDist)) {
        best = s; bestSc = sc; bestDist = d;
      }
    }
    if (bestSc < Math.max(1, Math.ceil(L * 0.6))) return -1;
    lastOffset = best;
    return best;
  }

  // 把 DOM 里看到的一段提问合并进 entries（只接受"与已有内容有重叠"的情况）
  // allowPrepend=false 时只向后追加（entries 来自接口、本身已完整）
  function mergeKeys(keys, texts, allowPrepend, markLocal, ids = []) {
    const L = keys.length;
    if (!L) return false;
    const mk = (k) => ({ key: keys[k], text: texts[k], local: !!markLocal, messageId: ids[k] });
    if (!entries.length) {
      entries = keys.map((_, k) => mk(k));
      return true;
    }
    const N = entries.length;
    let best = null;
    let tie = 0; // 与最佳重叠数相同的候选个数（用于识别重复文字造成的歧义）
    for (let s = -(L - 1); s <= N - 1; s++) {
      let ov = 0, ok = true;
      for (let k = 0; k < L; k++) {
        const j = s + k;
        if (j < 0 || j >= N) continue;
        ov++;
        if (entries[j].messageId && ids[k] ? entries[j].messageId !== ids[k] : entries[j].key !== keys[k]) { ok = false; break; }
      }
      if (!ok || ov < 1) continue;
      if (!best || ov > best.ov) { best = { s, ov }; tie = 1; }
      else if (ov === best.ov) tie++;
    }
    // 只重叠 1 条、且有多个候选位置时，无法确定位置，放弃
    if (!best || (best.ov < 2 && tie > 1)) return false;
    const pre = [], post = [];
    for (let k = 0; k < L; k++) {
      const j = best.s + k;
      if (j < 0) pre.push(mk(k));
      else if (j >= N) post.push(mk(k));
    }
    if (!allowPrepend) pre.length = 0;
    if (!pre.length && !post.length) return false;
    entries = pre.concat(entries, post);
    if (pre.length) lastOffset += pre.length;
    return true;
  }

  function sectionText(text) {
    const decoder = document.createElement('textarea');
    decoder.innerHTML = text;
    return decoder.value.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '').replace(/\s+/g, ' ').trim();
  }

  // 未渲染的回答也保留章节；代码围栏里的内容不参与目录。
  function markdownSections(text, messageId) {
    const headings = [];
    const lines = text.split('\n');
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
        continue;
      }
      if (fence || /^ {4}|^\t/.test(line)) continue;
      const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      const setext = i + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1]) && line.trim();
      if (heading || setext) {
        const title = sectionText(heading ? heading[2] : line);
        if (title) headings.push({ text: title, level: heading ? heading[1].length : lines[i + 1].trim()[0] === '=' ? 1 : 2, messageId, kind: 'heading' });
        if (setext) i++;
        continue;
      }
    }
    return headings;
  }

  // 从 /backend-api/conversation/{id} 的当前分支提取问题及其回答章节。
  function extractUserMessages(data) {
    const map = (data && data.mapping) || {};
    const path = [];
    const seen = new Set();
    let node = data && data.current_node;
    while (node && map[node] && !seen.has(node)) {
      seen.add(node);
      path.push(map[node]);
      node = map[node].parent;
    }
    path.reverse();
    const out = [];
    for (const n of path) {
      const m = n.message;
      if (!m || !m.author) continue;
      if (m.metadata && m.metadata.is_visually_hidden_from_conversation) continue;
      const c = m.content || {};
      if (c.content_type && c.content_type !== 'text' && c.content_type !== 'multimodal_text') continue;
      const parts = c.parts || [];
      const raw = parts.filter((p) => typeof p === 'string').join('\n');
      if (m.author.role === 'assistant') {
        if (out.length && (!m.recipient || m.recipient === 'all') && (!m.channel || m.channel === 'final')) {
          out[out.length - 1].sections.push(...markdownSections(raw, m.id));
        }
        continue;
      }
      if (m.author.role !== 'user') continue;
      let text = raw.replace(/\s+/g, ' ').trim();
      if (!text && parts.length) text = PLACEHOLDER;
      if (!text) continue;
      out.push({ key: normKey(text), text: text.slice(0, 300), local: false, messageId: m.id, sections: [] });
    }
    return out;
  }
  // </pure>

  // ---------- 节点识别 ----------

  function isIgnored(el) {
    return !!el.closest('form, nav, aside, header, footer, [role="dialog"], #cgpt-nav-box');
  }

  function isRenderedTurn(node) {
    // 切换 Chat 后旧对话仍可能保留在隐藏容器里，不能参与定位或选择滚动容器。
    // display: contents 本身没有矩形，改检查消息内容。
    return !!(node.getClientRects().length || node.querySelector('[data-user-message-bubble], .markdown, [data-markdown-text-style="assistant-message"], [data-assistant-markdown]')?.getClientRects().length);
  }

  function outermostUnique(list) {
    const uniq = Array.from(new Set(list));
    return uniq.filter((a) => !uniq.some((b) => b !== a && b.contains(a)));
  }

  function turnOf(node) {
    return node.closest('[data-chatgpt-search-unit-key]') || node.closest('[data-content-search-unit-key]') ||
      node.closest('[data-testid^="conversation-turn"], [data-turn]') || node.closest('article') || node.closest(TURN_SEL) || node;
  }

  function isUserTurn(turn) {
    if (turn.matches(USER_ROLE_SEL) || turn.querySelector(USER_ROLE_SEL)) return true;
    const head = turn.querySelector('.sr-only');
    if (head) {
      const t = head.textContent.trim().toLowerCase();
      if (/^(you\b|你)/.test(t)) return true;
      if (/^(chatgpt|assistant)/.test(t)) return false;
    }
    return null;
  }

  function getAllTurns() {
    let turns = Array.from(document.querySelectorAll(TURN_SEL)).filter((n) => !isIgnored(n) && isRenderedTurn(n));
    if (!turns.length) {
      turns = Array.from(document.querySelectorAll('main article')).filter((n) => !isIgnored(n) && isRenderedTurn(n));
    }
    if (!turns.length) {
      turns = Array.from(document.querySelectorAll(ANY_ROLE_SEL))
        .filter((n) => !isIgnored(n))
        .map(turnOf).filter(isRenderedTurn);
    }
    return outermostUnique(turns);
  }

  function getUserMessages() {
    const belongsToCurrentChat = (node) => {
      const id = messageIdOf(node);
      return id ? !previousChatIds.has(id) : !previousChatNodes.has(node);
    };
    const byRole = Array.from(document.querySelectorAll(USER_ROLE_SEL))
      .filter((n) => !isIgnored(n))
      .map(turnOf).filter((node) => isRenderedTurn(node) && belongsToCurrentChat(node));
    if (byRole.length) return outermostUnique(byRole);

    const turns = getAllTurns();
    if (!turns.length) return [];
    const judged = turns.map((t) => ({ t, u: isUserTurn(t) }));
    if (judged.some((x) => x.u === true)) {
      return judged.filter((x) => x.u === true && belongsToCurrentChat(x.t)).map((x) => x.t);
    }
    return turns.filter((node, i) => i % 2 === 0 && belongsToCurrentChat(node));
  }

  function getMsgText(turn) {
    const node = turn.matches(USER_ROLE_SEL) ? turn : turn.querySelector(USER_ROLE_SEL) || turn;
    let t = (node.textContent || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/^(you said:?|你说[:：]?)\s*/i, '');
    if (!t) t = PLACEHOLDER;
    return t.slice(0, 300);
  }

  // 每个已渲染提问独立映射到目录；虚拟化后的消息不一定连续。
  function getWindow() {
    const msgs = getUserMessages();
    const keys = msgs.map((m) => normKey(getMsgText(m)));
    const byId = new Map(entries.flatMap((entry, i) => entry.messageId ? [[entry.messageId, i]] : []));
    const ids = msgs.map(messageIdOf);
    const known = ids.map((id) => id && byId.has(id) ? byId.get(id) : -1);
    const offset = known.some((i) => i >= 0) ? -1 : locateKeys(keys);
    const indices = msgs.map((msg, k) => {
      if (known[k] >= 0) return known[k];
      if (ids[k] && entries.length && entries.every((entry) => entry.messageId)) return -1;
      const remembered = entries.findIndex((entry) => entry.userNode === msg);
      if (remembered >= 0) return remembered;
      const matches = entries.flatMap((entry, i) => entry.key === keys[k] ? [i] : []);
      if (matches.length === 1) return matches[0];
      if (offset >= 0 && msgs.length > 1 && keys.every((key, n) => entries[offset + n]?.key === key)) return offset + k;
      return -1;
    });
    indices.forEach((i, k) => {
      if (i < 0) return;
      entries[i].userNode = msgs[k];
      if (!entries[i].messageId && ids[k]) entries[i].messageId = ids[k];
    });
    const first = indices.find((i) => i >= 0);
    return { msgs, keys, indices, offset: first ?? -1 };
  }

  function localIndex(w, i) {
    return w.indices.indexOf(i);
  }

  function messageIdOf(node) {
    const id = node.getAttribute('data-message-id') || node.closest('[data-message-id]')?.getAttribute('data-message-id') ||
      node.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
      node.getAttribute('data-chatgpt-selection-message-id') ||
      node.closest('[data-chatgpt-selection-message-id]')?.getAttribute('data-chatgpt-selection-message-id') ||
      node.closest('[data-message-role][id]')?.id;
    if (id) return id;
    // 新页面的搜索单元可能列出多个消息 ID，不能把第一条当作整轮回答。
    const selected = Array.from(node.querySelectorAll('[data-chatgpt-selection-message-id]'))
      .map((message) => message.getAttribute('data-chatgpt-selection-message-id'));
    const search = node.closest('[data-chatgpt-search-message-ids]') || node.querySelector('[data-chatgpt-search-message-ids]');
    const ids = new Set(selected.length ? selected : (search?.getAttribute('data-chatgpt-search-message-ids') || '').split(/\s+/).filter(Boolean));
    return ids.size === 1 ? ids.values().next().value : undefined;
  }

  let contentVersion = 0;
  const answerCache = new WeakMap();

  function getRenderedAnswers() {
    const candidates = Array.from(document.querySelectorAll(ASSISTANT_ROLE_SEL)).filter((node) => !isIgnored(node) && isRenderedTurn(node));
    // 一轮可能包含思考和正式回答；优先取内部消息，不能用整轮的第一个消息 ID。
    const messages = candidates.flatMap((node) => {
      const selected = Array.from(node.querySelectorAll('[data-chatgpt-selection-message-id]'));
      return selected.length ? selected : [node];
    });
    const answers = Array.from(new Set(messages)).filter((node) => !node.querySelector(ASSISTANT_ROLE_SEL));
    return answers.length ? answers : getAllTurns().filter((turn) => isUserTurn(turn) === false);
  }

  function answerSections(user, nextUser, rendered = getRenderedAnswers()) {
    const after = (node, ref) => !!(ref.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    const answers = rendered.filter((node) => after(node, user) && (!nextUser || after(nextUser, node)));
    if (!answers.length) return null;
    return sectionsFromAnswers(answers);
  }

  function sectionsFromAnswers(answers) {
    const sections = [];
    for (const answer of answers) {
      const cached = answerCache.get(answer);
      if (cached?.version === contentVersion) {
        sections.push(...cached.sections);
        continue;
      }
      const start = sections.length;
      const messageId = messageIdOf(answer);
      const bodies = Array.from(answer.querySelectorAll('.markdown, [data-message-content], [data-assistant-markdown], [data-markdown-text-style="assistant-message"]'));
      const roots = outermostUnique(bodies.length ? bodies : [answer]);
      const valid = (node) => !node.closest('pre, code, .sr-only, [hidden], [aria-hidden="true"]') && node.getClientRects().length;
      const headings = roots.flatMap((root) => Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))).filter(valid);
      for (const node of headings) {
        const text = sectionText(node.textContent || '');
        if (!text) continue;
        sections.push({ text, level: Number(node.tagName[1]), messageId, node, kind: 'heading' });
      }
      answerCache.set(answer, { version: contentVersion, sections: sections.slice(start) });
    }
    return sections;
  }

  function getSections(i, w = getWindow(), rendered) {
    const entry = entries[i];
    if (!entry) return [];
    const answers = rendered || getRenderedAnswers();
    const k = localIndex(w, i);
    if (k >= 0 && k < w.msgs.length) {
      const current = answerSections(w.msgs[k], w.msgs[k + 1], answers);
      if (current) entry.domSections = current;
    } else if (entry.sections?.length) {
      const ids = new Set(entry.sections.map((section) => section.messageId).filter(Boolean));
      const current = answers.filter((answer) => ids.has(messageIdOf(answer)));
      if (current.length) entry.domSections = sectionsFromAnswers(current);
    }
    const live = (entry.domSections || []).filter((section) => section.node?.isConnected);
    const cached = entry.sections || [];
    // 已渲染消息以实际标题为准：Markdown 转义、公式、引用及流式更新会改变标题文本。
    // 仅未渲染消息使用接口目录，保留多条回答的原始顺序。
    const renderedIds = new Set(answers.map(messageIdOf).filter(Boolean));
    const emitted = new Set();
    const used = new Set();
    const sections = [];
    cached.forEach((section) => {
      if (section.messageId && renderedIds.has(section.messageId)) {
        if (!emitted.has(section.messageId)) {
          live.forEach((candidate, index) => {
            if (candidate.messageId !== section.messageId) return;
            sections.push(candidate);
            used.add(index);
          });
          emitted.add(section.messageId);
        }
        return;
      }
      const match = live.findIndex((candidate, index) => !used.has(index) && candidate.text === section.text &&
        (!section.messageId || !candidate.messageId || section.messageId === candidate.messageId));
      if (match < 0) sections.push({ ...section });
      else {
        used.add(match);
        sections.push({ ...section, ...live[match] });
      }
    });
    sections.push(...live.filter((_, index) => !used.has(index)));
    const counts = new Map();
    return sections.map((section) => {
      const key = (section.messageId || '') + ':' + section.text;
      const occurrence = counts.get(key) || 0;
      counts.set(key, occurrence + 1);
      return { ...section, occurrence };
    });
  }

  // ---------- 工具 ----------

  function toast(msg) {
    let t = document.getElementById('cgpt-nav-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cgpt-nav-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.style.opacity = '0'), 3000);
  }

  function clearToast() {
    const t = document.getElementById('cgpt-nav-toast');
    if (!t) return;
    clearTimeout(t._timer);
    t.textContent = '';
    t.style.opacity = '0';
  }

  function diagnose() {
    const q = (s) => document.querySelectorAll(s).length;
    return (
      label('missing') + 'role-author=' + q('[data-message-author-role]') +
      ' turn-testid=' + q('[data-testid^="conversation-turn"]') +
      ' data-turn=' + q('[data-turn]') +
      ' data-message-role=' + q('[data-message-role]') +
      ' user-bubble=' + q('[data-user-message-bubble]') +
      ' article=' + q('article')
    );
  }

  // 不使用 scrollTop = 0：反向布局（column-reverse）下 0 会被解释成"底部"。
  function scrollElTo(el, block, behavior) {
    el.style.scrollMarginTop = TOP_OFFSET + 'px';
    el.scrollIntoView({ block: block, behavior: behavior || (SMOOTH_SCROLL ? 'smooth' : 'instant') });
  }

  function isContentMutation(record) {
    const node = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
    return !node?.closest('#cgpt-nav-box, #cgpt-nav-toast');
  }

  // 页面一旦渲染新内容就继续定位，超时只作为没有 DOM 更新时的兜底。
  function waitForContent(ms) {
    return new Promise((resolve) => {
      let frame = 0;
      const finish = () => {
        observer.disconnect();
        clearTimeout(timer);
        if (frame) cancelAnimationFrame(frame);
        resolve();
      };
      const observer = new MutationObserver((records) => {
        if (!frame && records.some(isContentMutation)) frame = requestAnimationFrame(finish);
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      const timer = setTimeout(finish, ms);
    });
  }

  function getScrollableAncestors(el) {
    const list = [];
    let node = el ? el.parentElement : null;
    while (node) {
      const oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight) {
        list.push(node);
      }
      node = node.parentElement;
    }
    const root = document.scrollingElement || document.documentElement;
    if (!list.includes(root)) list.push(root);
    return list;
  }

  // ---------- 会话数据：接口 + DOM 合并 ----------

  let convId = null;
  let apiOk = false;
  let apiLoading = false;
  let loadSeq = 0;
  let lastApiFetch = 0;
  let reconcileTries = 0;
  let lastReconcile = 0;
  let tokenCache = { t: '', exp: 0 };

  function getConvId() {
    const m = location.pathname.match(/\/c\/([0-9a-zA-Z-]{8,})/);
    return m ? m[1] : null;
  }

  async function getToken() {
    if (tokenCache.t && Date.now() < tokenCache.exp) return tokenCache.t;
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    const j = await r.json();
    if (!j || !j.accessToken) throw new Error('no accessToken');
    tokenCache = { t: j.accessToken, exp: Date.now() + 5 * 60 * 1000 };
    return tokenCache.t;
  }

  async function loadApi() {
    if (apiLoading || !convId) return;
    const seq = ++loadSeq;
    const id = convId;
    apiLoading = true;
    lastApiFetch = Date.now();
    try {
      const token = await getToken();
      const headers = { Authorization: 'Bearer ' + token };
      const did = (document.cookie.match(/(?:^|;\s*)oai-did=([^;]+)/) || [])[1];
      if (did) headers['oai-device-id'] = did;
      const res = await fetch('/backend-api/conversation/' + id, { headers, credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = extractUserMessages(data);
      if (seq === loadSeq && id === convId && list.length) {
        const previous = entries;
        list.forEach((entry) => {
          const old = previous.find((candidate) => candidate.messageId && candidate.messageId === entry.messageId);
          if (old?.domSections) entry.domSections = old.domSections;
        });
        if (sectionEntry) sectionEntry = list.find((entry) => entry.messageId === sectionEntry.messageId) || null;
        if (!sectionEntry) hideSections();
        entries = list;
        apiOk = true;
        lastOffset = 0;
      }
    } catch (err) {
      console.warn('[ChatGPT 对话导航] 接口读取失败，改用页面内容合并：', err);
    } finally {
      if (seq === loadSeq) {
        apiLoading = false;
        refreshToc();
      }
    }
  }

  function resetConv(id) {
    // URL 已变但旧 DOM 尚未隐藏时，也不能把上一段对话当作新目录。
    previousChatIds = new Set(entries.map((entry) => entry.messageId).filter(Boolean));
    previousChatNodes = new WeakSet(entries.map((entry) => entry.userNode).filter(Boolean));
    convId = id;
    entries = [];
    lastOffset = 0;
    apiOk = false;
    apiLoading = false;
    loadSeq++;
    lastApiFetch = 0;
    reconcileTries = 0;
    lastReconcile = 0;
    tocSig = '';
    activeIdx = -1;
    lastTargetIdx = -1;
    seekToken++;
    hideSections();
    tocItems.forEach(stopMarquee);
    tocItems = [];
    if (tocList) tocList.textContent = '';
    clearToast();
  }

  // ---------- 导航行为 ----------

  let lastTargetIdx = -1;
  let lastClickTime = 0;
  let seekToken = 0;

  // 跳到全局第 i 个提问；如果它当前没渲染，就朝目标方向滚动，直到它被加载出来
  async function jumpTo(i, settle = true) {
    const token = ++seekToken;
    lastTargetIdx = i;
    lastClickTime = Date.now();
    for (let n = 0; n < 60; n++) {
      if (token !== seekToken) return;
      const w = getWindow();
      if (!w.msgs.length) return toast(diagnose());
      const len = w.msgs.length;
      const k = localIndex(w, i);
      if (k >= 0) {
        const smooth = SMOOTH_SCROLL && n === 0;
        scrollElTo(w.msgs[k], 'start', smooth ? 'smooth' : 'instant');
        if (!smooth && settle) {
          // 后台校正延迟渲染导致的位置变化，不阻塞后续章节定位。
          setTimeout(() => {
            if (token !== seekToken) return;
            const w2 = getWindow();
            const k2 = localIndex(w2, i);
            if (k2 >= 0) {
              const top = w2.msgs[k2].getBoundingClientRect().top;
              if (Math.abs(top - TOP_OFFSET) > 24) scrollElTo(w2.msgs[k2], 'start', 'instant');
            }
          }, 250);
        }
        clearToast();
        return true;
      }
      const loaded = w.indices.filter((index) => index >= 0);
      if (!loaded.length) return toast(label('mismatch'));
      const first = Math.min(...loaded), last = Math.max(...loaded);
      if (i >= first && i <= last) return toast(label('mismatch'));
      if (n === 0) toast(label('locating'));
      const dir = i < first ? -1 : 1;
      const gap = dir < 0 ? first - i : i - last;
      const ref = w.msgs[w.indices.findIndex((index) => index >= 0)];
      const c = getScrollableAncestors(ref)[0];
      const vh = c.clientHeight || window.innerHeight;
      let avg = vh;
      if (len > 1) {
        avg = Math.max(
          80,
          (w.msgs[len - 1].getBoundingClientRect().top - w.msgs[0].getBoundingClientRect().top) / (len - 1)
        );
      }
      const step = Math.min(Math.max(gap * avg * 0.9, vh * 0.8), vh * 8);
      const rendered = waitForContent(160);
      c.scrollBy({ top: dir * step, behavior: 'instant' });
      await rendered;
    }
    toast(label('timeout'));
  }

  async function jumpToSection(i, section) {
    let token = ++seekToken;
    lastTargetIdx = i;
    lastClickTime = Date.now();
    clearTimeout(sectionCloseTimer);
    const findTarget = () => {
      // 页面生成的目录项直接绑定节点；文本变化或节点卸载后才重新查找。
      if (section.node?.isConnected) {
        if (sectionText(section.node.textContent || '') === section.text) return { target: section, rendered: true };
      }
      // 点击时重新检查回答，避免使用流式更新或切换分支前保存的节点。
      const answers = getRenderedAnswers();
      const message = section.messageId && answers.find((answer) => messageIdOf(answer) === section.messageId);
      if (message) {
        answerCache.delete(message);
        const current = sectionsFromAnswers([message]);
        const matches = current.filter((candidate) => candidate.text === section.text);
        let target = matches[section.occurrence];
        if (!target) {
          // 点击接口目录后才渲染的回答，标题可能已被 Markdown 改写。
          // 只在同一消息的完整章节结构一致时按位置对应，避免跳到别的章节。
          const cached = (entries[i]?.sections || []).filter((candidate) => candidate.messageId === section.messageId);
          const original = cached.filter((candidate) => candidate.text === section.text)[section.occurrence];
          const index = cached.indexOf(original);
          if (index >= 0 && cached.length === current.length && cached.every((candidate, n) =>
            candidate.kind === current[n].kind && candidate.level === current[n].level)) target = current[index];
        }
        return { target, rendered: true };
      }
      const w = getWindow();
      const k = localIndex(w, i);
      const user = w.msgs[k];
      const current = user ? answerSections(user, w.msgs[k + 1], answers) : null;
      const matches = (current || []).filter((candidate) => candidate.text === section.text &&
        (!section.messageId || !candidate.messageId || candidate.messageId === section.messageId));
      return { target: matches[section.occurrence], rendered: !!current };
    };
    let result = findTarget();
    if (result.target?.node?.isConnected) {
      scrollElTo(result.target.node, 'start', 'instant');
      clearToast();
      return;
    }
    // 仅回答尚未渲染时加载所属问题，不通过向下滚动猜测章节位置。
    if (!result.rendered) {
      const loading = jumpTo(i, false);
      token = seekToken;
      if (!await loading || token !== seekToken) return;
    }
    const deadline = Date.now() + 1200;
    while (Date.now() < deadline) {
      await waitForContent(Math.min(160, deadline - Date.now()));
      if (token !== seekToken) return;
      result = findTarget();
      if (result.target?.node?.isConnected) {
        scrollElTo(result.target.node, 'start', 'instant');
        clearToast();
        return;
      }
    }
    if (token === seekToken) toast(label('sectionMissing'));
  }

  function goToStart() {
    lastTargetIdx = -1;
    if (entries.length) return jumpTo(0);
    const first = getAllTurns()[0] || getUserMessages()[0];
    if (!first) return toast(diagnose());
    scrollElTo(first, 'start');
  }

  // 传入很大的 top 值，浏览器会自动限制到最远处；反复几次，等虚拟化列表把底部内容渲染出来
  async function goToBottom() {
    lastTargetIdx = -1;
    const token = ++seekToken;
    const users = getUserMessages();
    const turns = getAllTurns();
    const ref = users[users.length - 1] || turns[turns.length - 1];
    if (!ref) return toast(diagnose());
    const cs = getScrollableAncestors(ref);
    let prevSig = '';
    for (let n = 0; n < 8; n++) {
      if (token !== seekToken) return;
      cs.forEach((c) => c.scrollTo({ top: 1e9, behavior: 'instant' }));
      await sleep(150);
      const sig = cs.map((c) => c.scrollHeight + ':' + c.scrollTop).join(',');
      if (sig === prevSig) break;
      prevSig = sig;
    }
  }

  // dir = -1 上一个提问；dir = +1 下一个提问
  function stepQuestion(dir) {
    const w = getWindow();
    if (!w.msgs.length) return toast(diagnose());
    const N = entries.length;
    const len = w.msgs.length;
    const now = Date.now();
    const topOf = (i) => w.msgs[i].getBoundingClientRect().top;

    // 只在当前已渲染的提问里找（无法对齐到完整列表时的兜底）
    let local = -1;
    if (dir < 0) {
      for (let i = len - 1; i >= 0; i--) {
        if (topOf(i) < TOP_OFFSET - 8) { local = i; break; }
      }
    } else {
      local = w.msgs.findIndex((_, i) => topOf(i) > TOP_OFFSET + 8);
    }

    if (w.offset < 0) {
      // 兜底：不跨越未渲染的部分
      let idx = local;
      if (dir > 0 && idx === len - 1 && topOf(idx) < window.innerHeight * 0.6) idx = -1;
      if (idx < 0) {
        if (dir < 0) { toast(label('first')); goToStart(); }
        else { toast(label('last')); goToBottom(); }
        return;
      }
      scrollElTo(w.msgs[idx], 'start');
      return;
    }

    let target;
    if (lastTargetIdx >= 0 && now - lastClickTime < CLICK_WINDOW) {
      // 连续点击：基于上一次的目标继续走
      target = lastTargetIdx + dir;
    } else if (dir < 0) {
      target = local >= 0 ? w.indices[local] : w.indices.find((i) => i >= 0) - 1;
    } else if (local < 0) {
      target = Math.max(...w.indices) + 1;
    } else {
      target = w.indices[local];
      // 最后一个提问通常滚不到最顶部：已经在视野上半部分就直接去底部
      if (target === N - 1 && topOf(local) < window.innerHeight * 0.6) target = N;
    }

    lastClickTime = now;
    if (target < 0) { toast(label('first')); goToStart(); return; }
    if (target >= N) { toast(label('last')); goToBottom(); return; }
    jumpTo(target);
  }

  // ---------- 目录 (TOC) ----------

  let tocEl = null;
  let tocList = null;
  let tocItems = [];
  let tocSig = '';
  let activeIdx = -1;
  let scrollRaf = 0;
  let refreshTimer = 0;
  let sectionEl = null;
  let sectionList = null;
  let sectionEntry = null;
  let sectionSig = '';
  let sectionCloseTimer = 0;
  let tocSkeleton = null;

  function hideSections() {
    clearTimeout(sectionCloseTimer);
    sectionEntry = null;
    sectionSig = '';
    if (sectionEl) sectionEl.hidden = true;
    tocEl?.classList.remove('cn-expanded');
    tocItems.forEach((item) => item.classList.remove('cn-parent'));
  }

  function scheduleSectionClose() {
    clearTimeout(sectionCloseTimer);
    sectionCloseTimer = setTimeout(() => {
      // Ask 与章节是同一个交互区域；切换焦点、跨越两块菜单都不应关闭。
      if (tocEl?.matches(':hover, :has(:focus-visible)') || sectionEl?.matches(':hover, :has(:focus-visible)')) return;
      hideSections();
    }, 180);
  }

  function positionSections() {
    if (!sectionEntry || sectionEl.hidden) return;
    const i = entries.indexOf(sectionEntry);
    const item = tocItems[i];
    if (!item) return hideSections();
    const rect = item.getBoundingClientRect();
    const tocRect = tocEl.getBoundingClientRect();
    if (rect.bottom <= tocRect.top || rect.top >= tocRect.bottom) return hideSections();
    // 为主目录最终展开宽度预留空间，避免展开动画把子目录推到屏幕外。
    const left = tocRect.right - Math.min(TOC_WIDTH_HOVER, innerWidth - 32);
    const beside = left - 12;
    if (beside >= 96) {
      sectionEl.style.width = Math.min(TOC_WIDTH_HOVER, beside - 16) + 'px';
      sectionEl.style.left = beside - parseFloat(sectionEl.style.width) + 'px';
      sectionEl.style.top = Math.max(16, Math.min(rect.top - 5, innerHeight - sectionEl.offsetHeight - 16)) + 'px';
    } else {
      sectionEl.style.width = Math.min(TOC_WIDTH_HOVER, innerWidth - 32) + 'px';
      sectionEl.style.left = Math.max(16, tocRect.right - parseFloat(sectionEl.style.width)) + 'px';
      const height = Math.max(26, Math.min(320, tocRect.top - 28));
      sectionEl.style.maxHeight = height + 'px';
      sectionEl.style.top = Math.max(16, tocRect.top - sectionEl.offsetHeight - 12) + 'px';
    }
  }

  function updateSectionMarker(i, sections) {
    const item = tocItems[i];
    if (!item) return;
    const hasSections = sections.length > 0;
    item.classList.toggle('cn-has-sections', hasSections);
    const marker = item.querySelector('.cn-section-marker');
    if (marker) {
      marker.hidden = !hasSections;
      marker.title = label('sections');
    }
    item.setAttribute('aria-label', entries[i].text + (hasSections ? ' · ' + label('sections') : ''));
  }

  function refreshSectionMarkers() {
    const w = getWindow();
    const answers = getRenderedAnswers();
    const renderedEntries = new Set();
    w.msgs.forEach((message, k) => {
      const i = w.indices[k];
      if (i >= 0 && i < entries.length) {
        renderedEntries.add(i);
        updateSectionMarker(i, getSections(i, w, answers));
      }
    });
    entries.forEach((entry, i) => {
      if (!renderedEntries.has(i)) updateSectionMarker(i, entry.sections?.length ? entry.sections : entry.domSections || []);
    });
  }

  function refreshSections() {
    if (!sectionEntry) return;
    const i = entries.indexOf(sectionEntry);
    if (i < 0) return hideSections();
    const sections = getSections(i);
    updateSectionMarker(i, sections);
    if (!sections.length) {
      sectionEl.hidden = true;
      tocEl.classList.remove('cn-expanded');
      tocItems.forEach((item) => item.classList.remove('cn-parent'));
      sectionSig = '';
      return;
    }
    const sig = JSON.stringify(sections.map((section) => [section.text, section.level, section.messageId, section.occurrence]));
    if (sig !== sectionSig) {
      sectionSig = sig;
      sectionList.textContent = '';
      const minLevel = Math.min(...sections.map((section) => section.level));
      sections.forEach((section, index) => {
        const item = buildTocItem(section.text, i, () => jumpToSection(i, section));
        const depth = Math.min(3, section.level - minLevel);
        item.style.paddingLeft = (depth ? 24 + (depth - 1) * 10 : 8) + 'px';
        item.style.setProperty('--cn-depth', depth);
        item.classList.toggle('cn-child', depth > 0);
        item.classList.toggle('cn-section-root', depth === 0);
        item.classList.toggle('cn-child-first', depth > 0 && (!index || sections[index - 1].level < section.level));
        item.classList.toggle('cn-child-last', depth > 0 && (!sections[index + 1] || sections[index + 1].level < section.level));
        sectionList.appendChild(item);
      });
    }
    sectionEl.hidden = false;
    sectionEl.setAttribute('aria-label', label('sections'));
    sectionEl.style.maxHeight = 'min(320px, calc(100vh - 32px))';
    tocEl.classList.add('cn-expanded');
    tocItems.forEach((item, index) => item.classList.toggle('cn-parent', index === i));
    positionSections();
  }

  function showSections(i) {
    clearTimeout(sectionCloseTimer);
    if (sectionEntry !== entries[i]) sectionSig = '';
    sectionEntry = entries[i];
    refreshSections();
  }

  function startMarquee(item) {
    const tw = item.firstChild;
    const t = tw.firstChild;
    const over = t.offsetWidth - tw.clientWidth;
    if (over > 2) {
      const dist = over + 16;
      t.style.transition = 'transform ' + Math.max(0.8, dist / 55) + 's linear';
      t.style.transform = 'translateX(-' + dist + 'px)';
    }
  }

  function stopMarquee(item) {
    clearTimeout(item._mt);
    const t = item.firstChild.firstChild;
    t.style.transition = 'transform 0.25s ease';
    t.style.transform = 'translateX(0)';
  }

  function buildTocItem(text, i, onClick) {
    if (text === PLACEHOLDER) text = label('placeholder');
    const item = document.createElement('div');
    item.className = 'cn-item';
    const tw = document.createElement('div');
    tw.className = 'cn-tw';
    const t = document.createElement('span');
    t.className = 'cn-t';
    t.textContent = text;
    tw.appendChild(t);
    item.appendChild(tw);
    if (!onClick) {
      const marker = document.createElement('span');
      marker.className = 'cn-section-marker';
      marker.hidden = true;
      marker.setAttribute('aria-hidden', 'true');
      const icon = createIcon(['m15 18-6-6 6-6']);
      icon.setAttribute('width', '13');
      icon.setAttribute('height', '13');
      marker.appendChild(icon);
      item.appendChild(marker);
    }
    item.title = text;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    const activate = () => {
      if (onClick) return onClick();
      // 提问点击后鼠标仍在本行，不会再次触发 mouseenter；保持回答目录可见。
      showSections(i);
      return jumpTo(i);
    };
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      activate();
    });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      } else if (e.key === 'Escape') hideSections();
    });
    // 悬停：等目录展开动画结束后，再测量并滚动显示被截断的文字
    item.addEventListener('mouseenter', () => {
      clearTimeout(item._mt);
      item._mt = setTimeout(() => startMarquee(item), 260);
      if (!onClick) showSections(i);
    });
    item.addEventListener('mouseleave', () => {
      stopMarquee(item);
    });
    if (!onClick) {
      item.addEventListener('focus', () => showSections(i));
      item.addEventListener('blur', scheduleSectionClose);
    }
    return item;
  }

  function setActive(idx) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    tocItems.forEach((it, i) => it.classList.toggle('active', i === idx));
    const it = tocItems[idx];
    if (it && tocList && !tocEl.matches(':hover, :focus-within') && !sectionEntry) {
      const top = it.offsetTop;
      const bottom = top + it.offsetHeight;
      if (top < tocList.scrollTop) tocList.scrollTop = top - 4;
      else if (bottom > tocList.scrollTop + tocList.clientHeight) {
        tocList.scrollTop = bottom - tocList.clientHeight + 4;
      }
    }
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // 当前位置：全局提问下标 + 该提问内部的进度（0~1）
  function computePosition(w) {
    const msgs = w.msgs;
    const len = msgs.length;
    const N = tocItems.length;
    const limit = TOP_OFFSET + 40;
    const top = (i) => msgs[i].getBoundingClientRect().top;

    let idx = 0;
    for (let i = 0; i < len; i++) {
      if (top(i) <= limit) idx = i;
      else break;
    }
    // 最后一个提问一般滚不到最顶部：只要它已经在视野上半部分，就视为当前位置
    const last = len - 1;
    const isGlobalLast = w.indices[idx] >= N - 1;
    if (w.indices[last] >= N - 1 && top(last) < window.innerHeight * 0.5) idx = last;

    const t0 = top(idx);
    let frac = 0;
    if (idx < last) {
      const end = top(idx + 1);
      if (end > t0) frac = clamp01((limit - t0) / (end - t0));
    } else if (w.indices[idx] >= N - 1) {
      // 全局最后一个提问：用最后一轮回复的底部作为终点，滚到最底时进度为 1
      const turns = getAllTurns();
      const lt = turns[turns.length - 1];
      if (lt) {
        const end = lt.getBoundingClientRect().bottom;
        const oMax = end - t0 - (window.innerHeight - limit);
        frac = oMax > 1 ? clamp01((limit - t0) / oMax) : 1;
      }
    }
    void isGlobalLast;
    return { idx: w.indices[idx], frac };
  }

  // 根据当前滚动位置计算高亮哪一条，并移动位置指示条
  function updateActive() {
    if (!tocItems.length) return;
    const w = getWindow();
    if (!w.msgs.length || w.offset < 0) return;
    const pos = computePosition(w);
    if (pos.idx < 0) return;
    const idx = Math.min(pos.idx, tocItems.length - 1);
    setActive(idx);
  }

  function refreshToc() {
    if (!tocEl) return;
    const id = getConvId();
    if (id !== convId) resetConv(id);
    const now = Date.now();

    // 接口：首次读取，失败后每 15 秒重试一次
    if (convId && !apiOk && !apiLoading && now - lastApiFetch > 15000) loadApi();

    // 首次加载先显示完整骨架，接口完成后一次呈现目录；失败再用页面内容。
    if (!apiLoading) {
      const msgs = getUserMessages();
      const texts = msgs.map(getMsgText);
      const keys = texts.map(normKey);
      const ids = msgs.map(messageIdOf);
      const byId = new Map(entries.flatMap((entry, i) => entry.messageId ? [[entry.messageId, i]] : []));
      const known = ids.map((id) => byId.get(id) ?? -1);
      // 已知消息按 ID 合并；附件文字差异不能变成额外问题。
      if (apiOk && known.some((i) => i >= 0)) {
        const lastKnown = known.findLastIndex((i) => i >= 0);
        if (known[lastKnown] === entries.length - 1) {
          for (let k = lastKnown + 1; k < msgs.length; k++) {
            if (ids[k] && !byId.has(ids[k])) {
              byId.set(ids[k], entries.length);
              entries.push({ key: keys[k], text: texts[k], messageId: ids[k], local: true });
            }
          }
        }
      } else {
        mergeKeys(keys, texts, !apiOk, apiOk, ids);
      }
      // 追加的是临时条目，过一会儿向接口核对一次
      if (!apiLoading && apiOk && entries.some((e) => e.local) && reconcileTries < 6 && now - lastReconcile > 3000) {
        reconcileTries++;
        lastReconcile = now;
        loadApi();
      }
    }

    const sig = entries.map((e) => (e.messageId || '') + ':' + e.key).join('|');
    if (sig !== tocSig) {
      hideSections();
      tocItems.forEach(stopMarquee);
      tocSig = sig;
      tocList.textContent = '';
      tocItems = entries.map((e, i) => {
        const it = buildTocItem(e.text, i);
        tocList.appendChild(it);
        return it;
      });
      activeIdx = -1;
    }
    const loading = !!id && apiLoading && !entries.length;
    tocEl.style.display = id && (entries.length || loading) ? '' : 'none';
    tocEl.setAttribute('aria-busy', String(loading));
    tocList.hidden = loading;
    tocSkeleton.hidden = !loading;
    tocSkeleton.setAttribute('aria-label', label('loadingNav'));
    refreshSectionMarkers();
    updateActive();
    refreshSections();
  }

  function scheduleRefresh() {
    // 节流而非防抖：AI 流式输出时 DOM 持续变化，防抖会一直等到输出结束才刷新
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      safe(refreshToc, '刷新目录');
    }, 400);
  }

  function onScroll() {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = 0;
      safe(updateActive, '更新高亮');
      safe(positionSections, '章节位置');
    });
  }

  // ---------- 样式与按钮 ----------

  const ICONS = {
    start:  ['M5 3h14', 'm18 13-6-6-6 6', 'M12 7v14'],        // lucide: arrow-up-to-line
    prev:   ['m18 15-6-6-6 6'],                                // lucide: chevron-up
    next:   ['m6 9 6 6 6-6'],                                  // lucide: chevron-down
    bottom: ['M12 17V3', 'm6 11 6 6 6-6', 'M19 21H5'],        // lucide: arrow-down-to-line
  };

  function createIcon(paths) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS);
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    paths.forEach((d) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    return svg;
  }

  // ---------- 主题：读取页面当前主题 ----------

  function parseRgb(str) {
    const m = (str || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3) return null;
    const a = p.length >= 4 ? p[3] : 1;
    return { r: p[0], g: p[1], b: p[2], a: a };
  }

  // 读取页面主题：优先看 <html> 上的 dark/light 标记，其次背景色亮度，最后系统偏好
  function detectTheme() {
    if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
    const root = document.documentElement;
    if (root.classList.contains('dark')) return 'dark';
    if (root.classList.contains('light')) return 'light';

    const attr = (
      root.getAttribute('data-theme') ||
      root.getAttribute('data-color-scheme') ||
      root.getAttribute('data-mode') ||
      ''
    ).toLowerCase();
    if (attr.includes('dark')) return 'dark';
    if (attr.includes('light')) return 'light';

    const scheme = (getComputedStyle(root).colorScheme || '').trim().toLowerCase();
    if (scheme === 'dark') return 'dark';
    if (scheme === 'light') return 'light';

    for (const el of [document.body, root]) {
      if (!el) continue;
      const c = parseRgb(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.5) {
        const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        return lum < 128 ? 'dark' : 'light';
      }
    }
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const box = document.getElementById('cgpt-nav-box');
    if (!box) return;
    let t = 'light';
    try {
      t = detectTheme();
    } catch (err) {
      console.warn('[ChatGPT 对话导航] 读取主题失败，使用浅色：', err);
    }
    if (box.getAttribute('data-theme') !== t) box.setAttribute('data-theme', t);
  }

  function addStyle() {
    const style = document.createElement('style');
    style.id = 'cgpt-nav-style';
    style.textContent = `
      #cgpt-nav-box {
        position: fixed;
        right: 18px;
        bottom: 140px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 10px;
      }
      /* 浅色主题（默认） */
      #cgpt-nav-box,
      #cgpt-nav-box[data-theme="light"] {
        --cn-bg: rgba(255, 255, 255, 0.96);
        --cn-fg: #0d0d0d;
        --cn-muted: #6e6e80;
        --cn-border: rgba(0, 0, 0, 0.14);
        --cn-track: rgba(0, 0, 0, 0.14);
        --cn-hover: rgba(0, 0, 0, 0.06);
        --cn-active: #10a37f;
        --cn-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
      }
      /* 深色主题 */
      #cgpt-nav-box[data-theme="dark"] {
        --cn-bg: rgba(47, 47, 47, 0.96);
        --cn-fg: #ececec;
        --cn-muted: #a1a1aa;
        --cn-border: rgba(255, 255, 255, 0.16);
        --cn-track: rgba(255, 255, 255, 0.2);
        --cn-hover: rgba(255, 255, 255, 0.1);
        --cn-active: #19c37d;
        --cn-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
      }

      /* 目录 */
      #cgpt-toc, #cgpt-sections {
        width: ${TOC_WIDTH}px;
        max-height: min(320px, max(80px, calc(100vh - 424px)));
        display: flex;
        flex-direction: column;
        padding: 4px 0;
        box-sizing: border-box;
        background: var(--cn-bg);
        border: 1px solid var(--cn-border);
        border-radius: 12px;
        box-shadow: var(--cn-shadow);
        overflow: hidden;
        transition: width 0.2s ease;
      }
      #cgpt-toc:hover, #cgpt-toc:has(:focus-visible), #cgpt-toc.cn-expanded { width: min(${TOC_WIDTH_HOVER}px, calc(100vw - 32px)); }
      #cgpt-toc .cn-skeleton { padding: 0 10px; }
      #cgpt-toc .cn-skeleton[hidden] { display: none; }
      #cgpt-toc .cn-skeleton-row { height: 26px; display: flex; align-items: center; }
      #cgpt-toc .cn-skeleton-bar {
        height: 8px;
        border-radius: 4px;
        background: linear-gradient(90deg, var(--cn-track) 25%, var(--cn-border) 50%, var(--cn-track) 75%);
        background-size: 200% 100%;
        animation: cn-skeleton-shimmer 1.4s linear infinite;
      }
      @keyframes cn-skeleton-shimmer {
        from { background-position: 200% 0; }
        to { background-position: -200% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        #cgpt-toc, #cgpt-sections { transition: none; animation: none; }
        #cgpt-toc .cn-skeleton-bar { animation: none; }
      }
      #cgpt-sections {
        position: fixed;
        width: ${TOC_WIDTH_HOVER}px;
        max-height: min(320px, calc(100vh - 32px));
        transition: none;
      }
      #cgpt-sections[hidden] { display: none; }
      #cgpt-nav-box .cn-list {
        position: relative;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain; /* 只滚动目录，滚到头也不会带动页面 */
      }
      /* Chrome / Edge / Safari：自定义滚动条样式，同时让它始终可见（不做自动隐藏的悬浮条） */
      #cgpt-nav-box .cn-list::-webkit-scrollbar { width: 6px; }
      #cgpt-nav-box .cn-list::-webkit-scrollbar-track { background: transparent; }
      #cgpt-nav-box .cn-list::-webkit-scrollbar-thumb {
        background: var(--cn-muted);
        border-radius: 3px;
      }
      #cgpt-nav-box .cn-list::-webkit-scrollbar-thumb:hover { background: var(--cn-fg); }
      /* Firefox */
      @supports (-moz-appearance: none) {
        #cgpt-nav-box .cn-list { scrollbar-width: thin; scrollbar-color: var(--cn-muted) transparent; }
      }
      #cgpt-nav-box .cn-item {
        height: 26px;
        padding: 0 8px;
        display: flex;
        align-items: center;
        box-sizing: border-box;
        font-size: 12px;
        color: var(--cn-muted);
        border-left: 2px solid transparent;
        cursor: pointer;
        user-select: none;
      }
      #cgpt-sections .cn-section-root { color: var(--cn-fg); font-weight: 500; }
      #cgpt-sections .cn-child { position: relative; height: 24px; font-size: 11.5px; }
      #cgpt-sections .cn-child::before {
        content: '';
        position: absolute;
        left: calc(12px + (var(--cn-depth) - 1) * 10px);
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--cn-track);
        pointer-events: none;
      }
      #cgpt-sections .cn-child-first::before { top: 4px; }
      #cgpt-sections .cn-child-last::before { bottom: 4px; }
      #cgpt-nav-box .cn-item:hover, #cgpt-nav-box .cn-item:focus-visible, #cgpt-nav-box .cn-item.cn-parent {
        background: var(--cn-hover);
        color: var(--cn-fg);
      }
      #cgpt-nav-box .cn-item.active {
        color: var(--cn-active);
        border-left-color: var(--cn-active);
        font-weight: 600;
      }
      #cgpt-nav-box .cn-tw {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent);
        mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent);
      }
      #cgpt-nav-box .cn-section-marker {
        flex: 0 0 13px;
        display: flex;
        align-items: center;
        margin-left: 5px;
        color: inherit;
        pointer-events: none;
      }
      #cgpt-nav-box .cn-section-marker[hidden] { display: none; }
      #cgpt-nav-box .cn-t { display: inline-block; white-space: nowrap; }

      /* 按钮 */
      #cgpt-btns { display: flex; flex-direction: column; gap: 8px; }
      #cgpt-btns button {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid var(--cn-border);
        background: var(--cn-bg);
        color: var(--cn-fg);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: var(--cn-shadow);
        transition: transform 0.12s ease;
        padding: 0;
      }
      #cgpt-btns button svg { pointer-events: none; }
      #cgpt-btns button:hover { transform: scale(1.1); }
      #cgpt-btns button:active { transform: scale(0.95); }

      #cgpt-nav-toast {
        position: fixed;
        right: 70px;
        bottom: 160px;
        max-width: 360px;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.5;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function makeButton(iconPaths, title, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.appendChild(createIcon(iconPaths));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        handler();
      } catch (err) {
        console.error('[ChatGPT 对话导航] 出错：', err);
        toast(label('error') + err.message);
      }
    });
    return btn;
  }

  function init() {
    if (document.getElementById('cgpt-nav-box')) return;
    if (!document.getElementById('cgpt-nav-style')) addStyle();

    const box = document.createElement('div');
    box.id = 'cgpt-nav-box';

    tocEl = document.createElement('div');
    tocEl.id = 'cgpt-toc';
    tocEl.style.display = 'none';
    tocList = document.createElement('div');
    tocList.className = 'cn-list';
    tocEl.appendChild(tocList);
    tocSkeleton = document.createElement('div');
    tocSkeleton.className = 'cn-skeleton';
    tocSkeleton.hidden = true;
    tocSkeleton.setAttribute('role', 'status');
    [85, 62, 94, 72, 48].forEach((width) => {
      const row = document.createElement('div');
      row.className = 'cn-skeleton-row';
      row.setAttribute('aria-hidden', 'true');
      const bar = document.createElement('div');
      bar.className = 'cn-skeleton-bar';
      bar.style.width = width + '%';
      row.appendChild(bar);
      tocSkeleton.appendChild(row);
    });
    tocEl.appendChild(tocSkeleton);
    tocEl.addEventListener('mouseenter', () => clearTimeout(sectionCloseTimer));
    tocEl.addEventListener('mouseleave', scheduleSectionClose);
    box.appendChild(tocEl);

    sectionEl = document.createElement('div');
    sectionEl.id = 'cgpt-sections';
    sectionEl.hidden = true;
    sectionList = document.createElement('div');
    sectionList.className = 'cn-list';
    sectionEl.appendChild(sectionList);
    sectionEl.addEventListener('mouseenter', () => clearTimeout(sectionCloseTimer));
    sectionEl.addEventListener('mouseleave', scheduleSectionClose);
    sectionEl.addEventListener('focusin', () => clearTimeout(sectionCloseTimer));
    sectionEl.addEventListener('focusout', scheduleSectionClose);
    tocEl.addEventListener('transitionend', positionSections);
    box.appendChild(sectionEl);
    hideSections();

    const btns = document.createElement('div');
    btns.id = 'cgpt-btns';
    btns.appendChild(makeButton(ICONS.start, label('start'), goToStart));
    btns.appendChild(makeButton(ICONS.prev, label('prev'), () => stepQuestion(-1)));
    btns.appendChild(makeButton(ICONS.next, label('next'), () => stepQuestion(1)));
    btns.appendChild(makeButton(ICONS.bottom, label('bottom'), goToBottom));
    box.appendChild(btns);

    document.body.appendChild(box);
    safe(applyTheme, '主题');

    tocSig = '';
    tocItems = [];
    activeIdx = -1;
    safe(refreshToc, '目录');
  }

  function setupObservers() {
    const onConversationChange = () => {
      if (getConvId() !== convId) safe(refreshToc, '切换对话');
    };
    // SPA 切换 URL 时先撤掉旧目录，不等待消息 DOM 的节流刷新。
    window.navigation?.addEventListener('currententrychange', onConversationChange);
    window.addEventListener('popstate', onConversationChange);
    // scroll 事件不冒泡，用捕获阶段监听任意滚动容器
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);

    // 消息变化（发送新提问、切换对话、懒加载、流式输出）时刷新目录
    new MutationObserver((records) => {
      if (!records.some(isContentMutation)) return;
      contentVersion++;
      scheduleRefresh();
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // 页面切换主题时跟着变：<html>/<body> 的 class、data-theme、style 变化，或系统偏好变化
    const onTheme = () => safe(applyTheme, '主题');
    const themeObserver = new MutationObserver(onTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'data-mode', 'style'],
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    if (window.matchMedia) {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', onTheme);
      else if (mq.addListener) mq.addListener(onTheme);
    }
  }

  function boot() {
    safe(init, '初始化');
    safe(setupObservers, '监听器');
  }

  console.info('[ChatGPT 对话导航] v1.9.0 已加载');
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });

  // 自愈：页面重渲染把导航移除后，自动重新创建
  setInterval(() => {
    safe(() => {
      if (document.body && !document.getElementById('cgpt-nav-box')) init();
      else if (getConvId() !== convId) refreshToc();
    }, '自愈');
  }, 2000);
}
