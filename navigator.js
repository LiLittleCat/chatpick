// ==UserScript==
// @name         ChatPick · Chat Navigator
// @namespace    https://tampermonkey.net/
// @version      1.9.0
// @description  ChatGPT、Claude 和 DeepSeek 页面右侧：提问目录（完整、随滚动高亮，支持跳到未渲染的消息）+ 四个导航按钮
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://claude.ai/*
// @match        https://chat.deepseek.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

export function startNavigator(motion = {}, adapter = null, exporter = null, initialSettings = {}) {

  const isClaude = location.hostname === 'claude.ai';
  const isDeepseek = location.hostname === 'chat.deepseek.com';
  const isVirtualSite = isClaude || isDeepseek;
  const DEEPSEEK_ROW = '[data-virtual-list-item-key]:has(.ds-message)';
  const deepseekMessageId = (id) => 'deepseek:' + convId + ':' + id;
  const CLAUDE_ROW = '[data-testid="transcript-row"][data-index]';
  const claudeMessageId = (index) => 'claude:' + convId + ':' + index;

  const normalizePreferences = (input) => {
    const value = input && typeof input === 'object' ? input : {};
    return {
      theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'auto',
      language: value.language === 'zh' || value.language === 'en' ? value.language : 'auto',
      colors: value.colors === 'default' ? 'default' : 'site',
      showExport: value.showExport !== false,
      showJumpButtons: value.showJumpButtons !== false,
      enabled: value.enabled !== false,
    };
  };
  let settings = normalizePreferences(initialSettings);
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
      prev: 'Previous question',
      next: 'Next question',
      bottom: 'Go to bottom',
      startShort: 'Start', prevShort: 'Prev', nextShort: 'Next', bottomShort: 'End',
      controls: 'Conversation navigation',
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
      start: '回到开头',
      prev: '上一个提问',
      next: '下一个提问',
      bottom: '跳到底部',
      startShort: '开头', prevShort: '上一问', nextShort: '下一问', bottomShort: '底部',
      controls: '会话导航',
      sections: '回答章节',
      sectionMissing: '无法定位这个章节，请重试',
      loadingNav: '正在加载导航…',
    },
  };
  const language = () => settings.language === 'auto' ? /^zh(?:[-_]|$)/i.test(document.documentElement.lang.trim() || navigator.language) ? 'zh' : 'en' : settings.language;
  const label = (key) => labels[language()][key];
  let displayedLanguage;
  function refreshLanguage() {
    displayedLanguage = language();
    const buttons = document.querySelectorAll('#cgpt-btns button');
    ['start', 'prev', 'next', 'bottom'].forEach((key, i) => {
      if (buttons[i]) {
        buttons[i].dataset.tooltip = label(key);
        buttons[i].setAttribute('aria-label', label(key));
        buttons[i].querySelector('.cn-control-label').textContent = label(key + 'Short');
      }
    });
    tocSig = '';
    safe(refreshToc, '目录');
    window.dispatchEvent(new Event('chatpick:language'));
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'chatpick:extension' || event.data?.type !== 'settings') return;
    settings = normalizePreferences(event.data.settings);
    safe(syncRoute, '网站启用');
    if (!settings.enabled) return;
    safe(refreshLanguage, '语言');
    const controls = document.getElementById('cgpt-btns');
    if (controls) controls.hidden = !settings.showJumpButtons;
    safe(installExport, '导出按钮');
    safe(resizeToc, '目录尺寸');
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
    ...(isDeepseek ? ['.ds-message:has(.ds-collapsible-text)'] : []),
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
    ...(isDeepseek ? ['.ds-message:has(.ds-assistant-message-main-content)'] : []),
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
    ...(isDeepseek ? [DEEPSEEK_ROW] : []),
    '[data-testid="transcript-row"][data-index]',
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
  let previousConvId = null;
  let currentVirtualRows = new WeakSet();
  let turnIndices = new Map();

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

  function sectionText(text, encoded = false) {
    // DOM text is already decoded. Avoid HTML sinks: Gemini enforces Trusted Types.
    if (encoded) {
      const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', ndash: '–', mdash: '—', hellip: '…', copy: '©', reg: '®', trade: '™' };
      text = text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
        if (name[0] !== '#') return named[name] ?? entity;
        const hex = name[1].toLowerCase() === 'x';
        const point = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '\ufffd';
      });
    }
    return text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
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
        const title = sectionText(heading ? heading[2] : line, true);
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
  // Claude 的消息序号对应当前分支中的 transcript-row；正文不包含工具或思考块。
  function extractClaudeMessages(data) {
    const messages = data?.chat_messages;
    if (!Array.isArray(messages)) return [];
    const map = new Map(messages.map((message) => [message.uuid, message]));
    let path = messages;
    const leaf = data.current_leaf_message_uuid;
    if (leaf && map.has(leaf)) {
      path = [];
      const seen = new Set();
      let message = map.get(leaf);
      while (message && !seen.has(message.uuid)) {
        seen.add(message.uuid);
        path.push(message);
        message = map.get(message.parent_message_uuid);
      }
      path.reverse();
    }
    const out = [];
    path.filter((message) => ['human', 'assistant'].includes(message.sender)).forEach((message, turnIndex) => {
      const blocks = (message.content || []).filter((block) => block.type === 'text' && typeof block.text === 'string');
      const raw = blocks.length ? blocks.map((block) => block.text).join('\n') : message.text || '';
      const messageId = claudeMessageId(turnIndex);
      if (message.sender === 'human') {
        const text = raw.replace(/\s+/g, ' ').trim() || PLACEHOLDER;
        out.push({ key: normKey(text), text: text.slice(0, 300), messageId, apiMessageId: message.uuid, turnIndex, local: false, sections: [] });
      } else if (out.length) {
        out[out.length - 1].sections.push(...markdownSections(raw, messageId));
      }
    });
    return out;
  }
  // 与 DeepSeek 自己的 history_messages 解码一致：从当前消息沿 parent_id 取活动分支。
  function extractDeepseekMessages(data) {
    const history = data?.data?.biz_data;
    if (data?.code !== 0 || data?.data?.biz_code !== 0 || !Array.isArray(history?.chat_messages)) return [];
    const messages = history.chat_messages;
    const map = new Map(messages.map((message) => [String(message.message_id), message]));
    let id = history.chat_session?.current_message_id ?? Math.max(...messages.map((message) => Number(message.message_id)));
    const path = [], seen = new Set();
    while (id !== null && id !== undefined && map.has(String(id)) && !seen.has(String(id))) {
      const message = map.get(String(id));
      seen.add(String(id)); path.push(message); id = message.parent_id;
    }
    path.reverse();
    const out = [];
    turnIndices = new Map();
    path.forEach((message, turnIndex) => {
      const messageId = deepseekMessageId(message.message_id);
      turnIndices.set(messageId, turnIndex);
      const user = message.role === 'USER';
      const raw = (message.fragments || []).filter((fragment) => user ? fragment.type === 'REQUEST' : ['RESPONSE', 'TEMPLATE_RESPONSE'].includes(fragment.type))
        .map((fragment) => typeof fragment.content === 'string' ? fragment.content : '').join('\n');
      if (user) {
        const text = raw.replace(/\s+/g, ' ').trim() || PLACEHOLDER;
        out.push({ key: normKey(text), text: text.slice(0, 300), messageId, turnIndex, local: false, sections: [] });
      } else if (message.role === 'ASSISTANT' && out.length) out[out.length - 1].sections.push(...markdownSections(raw, messageId));
    });
    return out;
  }

  function virtualTurnIndex(node) {
    if (isClaude) return Number(node.closest(CLAUDE_ROW)?.getAttribute('data-index'));
    const row = node.closest(DEEPSEEK_ROW);
    return turnIndices.get(messageIdOf(node)) ?? Number(row?.getAttribute('data-virtual-list-item-key'));
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
    if (adapter) return node;
    if (isClaude) return node.closest(CLAUDE_ROW) || node;
    if (isDeepseek) return node.closest(DEEPSEEK_ROW) || node;
    return node.closest('[data-chatgpt-search-unit-key]') || node.closest('[data-content-search-unit-key]') ||
      node.closest('[data-testid^="conversation-turn"], [data-turn]') || node.closest('article') || node.closest(TURN_SEL) || node;
  }

  function isUserTurn(turn) {
    if (isDeepseek && turn.querySelector('.ds-assistant-message-main-content')) return false;
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
    if (adapter) {
      const turns = [...adapter.users(), ...adapter.answers()]
        .filter(node => isRenderedTurn(node) && !previousChatNodes.has(node))
        .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      turns.forEach(node => currentVirtualRows.add(node));
      return turns;
    }
    let turns = Array.from(document.querySelectorAll(TURN_SEL)).filter((n) => !isIgnored(n) && isRenderedTurn(n));
    if (!turns.length) {
      turns = Array.from(document.querySelectorAll('main article')).filter((n) => !isIgnored(n) && isRenderedTurn(n));
    }
    if (!turns.length) {
      turns = Array.from(document.querySelectorAll(ANY_ROLE_SEL))
        .filter((n) => !isIgnored(n))
        .map(turnOf).filter(isRenderedTurn);
    }
    const unique = outermostUnique(turns);
    if (isVirtualSite && getConvId() === convId) unique.forEach((turn) => currentVirtualRows.add(turn));
    return unique;
  }

  function getUserMessages() {
    const belongsToCurrentChat = (node) => {
      const id = messageIdOf(node);
      if ((isVirtualSite || adapter) && previousChatNodes.has(node)) return false;
      return id ? !previousChatIds.has(id) : !previousChatNodes.has(node);
    };
    const byRole = (adapter ? adapter.users() : Array.from(document.querySelectorAll(USER_ROLE_SEL)))
      .filter((n) => !isIgnored(n))
      .map(turnOf).filter((node) => isRenderedTurn(node) && belongsToCurrentChat(node));
    if (byRole.length || adapter) return outermostUnique(byRole);

    const turns = getAllTurns();
    if (!turns.length) return [];
    const judged = turns.map((t) => ({ t, u: isUserTurn(t) }));
    if (judged.some((x) => x.u === true)) {
      return judged.filter((x) => x.u === true && belongsToCurrentChat(x.t)).map((x) => x.t);
    }
    return turns.filter((node, i) => i % 2 === 0 && belongsToCurrentChat(node));
  }

  function getMsgText(turn) {
    if (adapter) return (adapter.text(turn) || label('placeholder')).slice(0, 300);
    const node = isDeepseek ? turn.querySelector('.ds-collapsible-text') || turn : turn.matches(USER_ROLE_SEL) ? turn : turn.querySelector(USER_ROLE_SEL) || turn;
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
      if (known[k] >= 0) return isVirtualSite && entries[known[k]].key !== keys[k] ? -1 : known[k];
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
      entries[i].scrollTop = contentScrollTop(msgs[k]);
      if (!entries[i].messageId && ids[k]) entries[i].messageId = ids[k];
    });
    const first = indices.find((i) => i >= 0);
    return { msgs, keys, indices, offset: first ?? -1 };
  }

  function localIndex(w, i) {
    return w.indices.indexOf(i);
  }

  function messageIdOf(node) {
    if (adapter) return adapter.messageId(node);
    if (isDeepseek) {
      const key = node.closest(DEEPSEEK_ROW)?.getAttribute('data-virtual-list-item-key');
      return key ? deepseekMessageId(key) : undefined;
    }
    if (isClaude) {
      const index = node.closest(CLAUDE_ROW)?.getAttribute('data-index');
      return index !== null && index !== undefined ? claudeMessageId(Number(index)) : undefined;
    }
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
    if (adapter) return adapter.answers().filter(node => {
      if (!isRenderedTurn(node) || previousChatNodes.has(node)) return false;
      currentVirtualRows.add(node);
      return true;
    });
    const candidates = Array.from(document.querySelectorAll(ASSISTANT_ROLE_SEL)).filter((node) => !isIgnored(node) && isRenderedTurn(node) && (!isVirtualSite || !previousChatNodes.has(turnOf(node))));
    // 一轮可能包含思考和正式回答；优先取内部消息，不能用整轮的第一个消息 ID。
    const messages = candidates.flatMap((node) => {
      const selected = Array.from(node.querySelectorAll('[data-chatgpt-selection-message-id]'));
      return selected.length ? selected : [node];
    });
    const answers = Array.from(new Set(messages)).filter((node) => !node.querySelector(ASSISTANT_ROLE_SEL));
    return answers.length ? answers : getAllTurns().filter((turn) => isUserTurn(turn) === false && (!isVirtualSite || !previousChatNodes.has(turn)));
  }

  function answerSections(user, nextUser, rendered = getRenderedAnswers()) {
    const after = (node, ref) => !!(ref.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
    const index = isVirtualSite ? virtualTurnIndex(user) : -1;
    const nextIndex = entries.find((entry) => entry.turnIndex > index)?.turnIndex ?? Infinity;
    const userOrder = adapter?.order(user);
    const orderedAdapter = adapter && userOrder !== null;
    const nextOrder = orderedAdapter ? entries.find(entry => entry.order > userOrder)?.order ?? Infinity : null;
    const answers = rendered.filter((node) => orderedAdapter
      ? adapter.order(node) > userOrder && adapter.order(node) < nextOrder
      : isVirtualSite
      ? virtualTurnIndex(node) > index && virtualTurnIndex(node) < nextIndex
      : after(node, user) && (!nextUser || after(nextUser, node)));
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
      const bodies = adapter ? adapter.answerRoots(answer) : Array.from(answer.querySelectorAll(isDeepseek ? '.ds-assistant-message-main-content' : '.standard-markdown, .progressive-markdown, .markdown, [data-message-content], [data-assistant-markdown], [data-markdown-text-style="assistant-message"]'));
      const roots = outermostUnique(bodies.length ? bodies : isVirtualSite || adapter ? [] : [answer]);
      const valid = (node) => !node.closest('pre, code, .sr-only, .cdk-visually-hidden, .thinking-container, .phase-thinking, [hidden], [aria-hidden="true"]') && node.getClientRects().length;
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
      if (current) {
        entry.domSections = current;
        if (adapter) entry.sections = current.map(({ node, ...section }) => ({ ...section, scrollTop: contentScrollTop(node) }));
      }
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
    if (motion.toast) motion.toast(t, true);
    else t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      if (motion.toast) motion.toast(t, false);
      else t.style.opacity = '0';
    }, 3000);
  }

  function clearToast() {
    const t = document.getElementById('cgpt-nav-toast');
    if (!t) return;
    clearTimeout(t._timer);
    t.textContent = '';
    if (motion.toast) motion.toast(t, false);
    else t.style.opacity = '0';
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

  function contentScrollTop(node) {
    const scroller = getScrollableAncestors(node)[0];
    return scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - TOP_OFFSET;
  }

  // ---------- 会话数据：接口 + DOM 合并 ----------

  let convId = null;
  let apiOk = false;
  let apiLoading = false;
  let apiRequest = null;
  let loadSeq = 0;
  let lastApiFetch = 0;
  let reconcileTries = 0;
  let lastReconcile = 0;
  let tokenCache = { t: '', exp: 0 };

  function getConvId() {
    if (!settings.enabled) return null;
    if (adapter) return adapter.conversationId();
    // 项目及自定义 GPT 的详情页共用 /g/:slug/c/:id；不匹配它们的入口页。
    const pattern = isDeepseek ? /^\/a\/chat\/s\/([0-9a-zA-Z-]{8,})\/?$/
      : isClaude ? /^\/chat\/([0-9a-zA-Z-]{8,})\/?$/
      : ['chatgpt.com', 'chat.openai.com'].includes(location.hostname)
        ? /^\/(?:g\/g-[^/]+\/)?c\/([0-9a-zA-Z-]{8,})\/?$/ : null;
    const m = pattern && location.pathname.match(pattern);
    return m ? m[1] : null;
  }

  async function getToken(signal) {
    if (tokenCache.t && Date.now() < tokenCache.exp) return tokenCache.t;
    const r = await fetch('/api/auth/session', { credentials: 'include', signal });
    const j = await r.json();
    if (!j || !j.accessToken) throw new Error('no accessToken');
    tokenCache = { t: j.accessToken, exp: Date.now() + 5 * 60 * 1000 };
    return tokenCache.t;
  }

  async function readHistory(id, signal) {
    let res;
    if (isDeepseek) {
      // 官网使用的同源会话凭据，仅用于当前聊天的只读请求。
      const stored = JSON.parse(localStorage.getItem('userToken') || 'null');
      const token = typeof stored === 'string' ? stored : stored?.value;
      if (typeof token !== 'string' || !token) throw new Error('DeepSeek session not available');
      res = await fetch('/api/v0/chat/history_messages?chat_session_id=' + encodeURIComponent(id), {
        headers: { Authorization: 'Bearer ' + token }, credentials: 'include', signal,
      });
    } else if (isClaude) {
      // 只复用本页已观察到的组织路径，或 Claude 的当前组织 cookie。
      const resources = performance.getEntriesByType('resource');
      const orgPath = resources.map((resource) => new URL(resource.name, location.origin))
        .filter((url) => url.origin === location.origin)
        .map((url) => url.pathname.match(/^\/api\/organizations\/([0-9a-f-]{36})\//i)?.[1]).find(Boolean);
      const cookie = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/)?.[1];
      const org = (cookie && decodeURIComponent(cookie)) || orgPath;
      if (!org || !/^[0-9a-f-]{36}$/i.test(org)) throw new Error('Current Claude organization not available');
      res = await fetch('/api/organizations/' + org + '/chat_conversations/' + id + '?tree=True&rendering_mode=messages&render_all_tools=true&include_inline_comparison=true&consistency=strong', { credentials: 'include', signal });
    } else {
      const token = await getToken(signal);
      if (signal.aborted || id !== getConvId()) throw new Error('Conversation changed');
      const headers = { Authorization: 'Bearer ' + token };
      const did = (document.cookie.match(/(?:^|;\s*)oai-did=([^;]+)/) || [])[1];
      if (did) headers['oai-device-id'] = did;
      res = await fetch('/backend-api/conversation/' + id, { headers, credentials: 'include', signal });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function loadApi() {
    if (adapter) return;
    if (apiLoading || !convId) return;
    const request = new AbortController();
    apiRequest = request;
    const seq = ++loadSeq;
    const id = convId;
    apiLoading = true;
    lastApiFetch = Date.now();
    try {
      const data = await readHistory(id, request.signal);
      if (seq !== loadSeq || id !== convId) return;
      const list = isDeepseek ? extractDeepseekMessages(data) : isClaude ? extractClaudeMessages(data) : extractUserMessages(data);
      if (seq === loadSeq && id === convId && list.length) {
        const previous = entries;
        const historyIds = new Set(list.map(entry => entry.messageId));
        const lastShared = previous.findLastIndex(entry => historyIds.has(entry.messageId));
        const sameBranch = list.every((entry, index) =>
          (entry.apiMessageId || entry.messageId) === (previous[index]?.apiMessageId || previous[index]?.messageId));
        const pendingTail = previous.slice(lastShared + 1);
        // A history snapshot can lag behind sends. Preserve the observed tail only
        // when it extends the same active branch; a different branch replaces it.
        if (sameBranch && lastShared >= 0 && pendingTail.every(entry => entry.local) && list.at(-1).messageId === previous[lastShared].messageId) {
          list.push(...pendingTail.filter(entry => !historyIds.has(entry.messageId)));
        }
        list.forEach((entry) => {
          const old = previous.find((candidate) => candidate.messageId && candidate.messageId === entry.messageId);
          if (old?.domSections && (!isVirtualSite || old.key === entry.key)) entry.domSections = old.domSections;
          if (old?.key === entry.key) entry.userNode = old.userNode;
        });
        if (sectionEntry) sectionEntry = list.find((entry) => entry.messageId === sectionEntry.messageId) || null;
        if (!sectionEntry) hideSections();
        entries = list;
        apiOk = true;
        lastOffset = 0;
      }
    } catch (err) {
      if (!request.signal.aborted) console.warn('[ChatGPT 对话导航] 接口读取失败，改用页面内容合并：', err);
    } finally {
      if (apiRequest === request) apiRequest = null;
      if (seq === loadSeq) {
        apiLoading = false;
        refreshToc();
      }
    }
  }

  let stopExport = null;
  function resetConv(id) {
    stopExport?.();
    stopExport = null;
    apiRequest?.abort();
    apiRequest = null;
    // URL 已变但旧 DOM 尚未隐藏时，也不能把上一段对话当作新目录。
    if (convId) {
      previousConvId = convId;
      previousChatIds = new Set(entries.map((entry) => entry.messageId).filter(Boolean));
      previousChatNodes = isVirtualSite || adapter ? currentVirtualRows : new WeakSet(entries.map((entry) => entry.userNode).filter(Boolean));
    }
    // 从首页返回同一个聊天时，网站可能直接复用原来的消息节点。
    if (id && id === previousConvId) {
      previousChatIds = new Set();
      previousChatNodes = new WeakSet();
    }
    currentVirtualRows = new WeakSet();
    turnIndices = new Map();
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
    document.querySelectorAll('#cgpt-btns button').forEach(button => {
      button.removeAttribute('aria-busy');
    });
    hideSections(true);
    tocItems.forEach(stopMarquee);
    tocItems = [];
    if (tocList) tocList.textContent = '';
    clearToast();
  }

  // ---------- 导航行为 ----------

  let lastTargetIdx = -1;
  let lastClickTime = 0;
  let seekToken = 0;

  // 接管原生入口时继续复用它的定位能力；由 DeepSeek 自己挂载未渲染的消息。
  async function activateDeepseekNative(i, token) {
    const nav = document.querySelector('[style*="--scroll-nav-page-padding"] .ds-virtual-list');
    if (!nav || !entries[i]) return;
    const scrollTop = nav.scrollTop;
    for (let attempt = 0; attempt < 6 && token === seekToken; attempt++) {
      const visible = nav.querySelector('.ds-virtual-list-visible-items');
      const translated = parseFloat(visible?.style.getPropertyValue('--dsl-virtual-list-transform-y') || '0');
      const row = visible && Array.from(visible.children).find((candidate) => Math.round((translated + candidate.offsetTop) / 30) === i);
      const title = row?.children[row.children.length - 2]?.textContent || '';
      if (row && normKey(title) === entries[i].key) {
        const pending = waitForContent(200);
        row.click();
        await pending;
        return;
      }
      const pending = waitForContent(80);
      nav.scrollTo({ top: i * 30, behavior: 'instant' });
      await pending;
    }
    nav.scrollTop = scrollTop;
  }

  // 按消息序号在虚拟列表中插值；每轮用新渲染的相邻行收窄范围。
  async function seekVirtualTurn(index, token) {
    const samples = new Map();
    for (let attempt = 0; attempt < 60 && token === seekToken; attempt++) {
      const rows = Array.from(document.querySelectorAll(isClaude ? CLAUDE_ROW : DEEPSEEK_ROW)).filter((row) => isRenderedTurn(row) && !previousChatNodes.has(row));
      const target = rows.find((row) => virtualTurnIndex(row) === index);
      if (target) return target;
      if (!rows.length) { await waitForContent(160); continue; }
      const scroller = getScrollableAncestors(rows[0])[0];
      const origin = scroller.getBoundingClientRect().top;
      rows.forEach((row) => samples.set(virtualTurnIndex(row), scroller.scrollTop + row.getBoundingClientRect().top - origin));
      const points = Array.from(samples).sort((a, b) => a[0] - b[0]);
      const before = points.findLast((point) => point[0] < index);
      const after = points.find((point) => point[0] > index);
      const total = isClaude ? Number(rows[0].querySelector('[aria-setsize]')?.getAttribute('aria-setsize')) : turnIndices.size;
      let top;
      if (before && after) top = before[1] + (after[1] - before[1]) * (index - before[0]) / (after[0] - before[0]);
      else if (total > 1) top = scroller.scrollHeight * index / total;
      else top = scroller.scrollTop + (before ? 1 : -1) * scroller.clientHeight;
      const pending = waitForContent(160);
      scroller.scrollTo({ top: Math.max(0, top - TOP_OFFSET), behavior: 'instant' });
      await pending;
    }
    return null;
  }

  // 跳到全局第 i 个提问；如果它当前没渲染，就朝目标方向滚动，直到它被加载出来
  async function jumpTo(i, settle = true) {
    const token = ++seekToken;
    lastTargetIdx = i;
    lastClickTime = Date.now();
    if (isVirtualSite && entries[i]?.turnIndex !== undefined) {
      if (isDeepseek && apiOk && localIndex(getWindow(), i) < 0) await activateDeepseekNative(i, token);
      if (token !== seekToken) return;
      const row = await seekVirtualTurn(entries[i].turnIndex, token);
      if (token !== seekToken) return;
      if (!row) return toast(label('timeout'));
      if (normKey(getMsgText(row)) !== entries[i]?.key) return toast(label('mismatch'));
      scrollElTo(row, 'start', 'instant');
      // Claude 在补载历史后会重新估算行高，并恢复滚动锚点；等它稳定后校正。
      if (settle) {
        for (let pass = 0; pass < 3; pass++) {
          await sleep(250);
          if (token !== seekToken) return;
          const current = await seekVirtualTurn(entries[i].turnIndex, token);
          if (!current || token !== seekToken) return;
          if (normKey(getMsgText(current)) !== entries[i]?.key) return toast(label('mismatch'));
          scrollElTo(current, 'start', 'instant');
        }
      }
      clearToast();
      return true;
    }
    const targetId = adapter ? entries[i]?.messageId : null;
    if (adapter && !entries[i]?.userNode?.isConnected && Number.isFinite(entries[i]?.scrollTop)) {
      const reference = getAllTurns()[0];
      if (reference) {
        const rendered = waitForContent(250);
        getScrollableAncestors(reference)[0].scrollTo({ top: entries[i].scrollTop, behavior: 'instant' });
        await rendered;
      }
    }
    for (let n = 0; n < 60; n++) {
      if (token !== seekToken) return;
      if (targetId) i = entries.findIndex(entry => entry.messageId === targetId);
      if (i < 0) return;
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
    const questionId = adapter ? entries[i]?.messageId : null;
    let token = ++seekToken;
    lastTargetIdx = i;
    lastClickTime = Date.now();
    clearTimeout(sectionCloseTimer);
    const findTarget = () => {
      if (questionId) i = entries.findIndex(entry => entry.messageId === questionId);
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
    if (isVirtualSite && section.messageId && !findTarget().rendered) {
      const index = isDeepseek ? turnIndices.get(section.messageId) : Number(section.messageId.split(':').at(-1));
      const row = await seekVirtualTurn(index, token);
      if (!row || token !== seekToken) return;
    }
    if (adapter && !findTarget().rendered && Number.isFinite(section.scrollTop)) {
      const reference = getAllTurns()[0];
      if (reference) {
        const rendered = waitForContent(250);
        getScrollableAncestors(reference)[0].scrollTo({ top: section.scrollTop, behavior: 'instant' });
        await rendered;
      }
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

  async function goToStart() {
    // History-backed virtual lists may need to mount their earliest question first.
    if (!adapter && entries.length && !await jumpTo(0)) return;
    lastTargetIdx = -1;
    const token = ++seekToken;
    const first = getAllTurns()[0] || getUserMessages()[0];
    if (!first) return toast(diagnose());
    const scrollers = getScrollableAncestors(first);
    for (let pass = 0; pass < 8 && token === seekToken; pass++) {
      scrollers.forEach(scroller => scroller.scrollTo({
        top: getComputedStyle(scroller).flexDirection === 'column-reverse' ? -1e9 : 0,
        behavior: 'instant',
      }));
      await waitForContent(160);
      if (scrollers.every(scroller => {
        const position = getComputedStyle(scroller).flexDirection === 'column-reverse'
          ? scroller.scrollHeight - scroller.clientHeight + scroller.scrollTop
          : scroller.scrollTop;
        return position < 2;
      })) break;
    }
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
        if (dir < 0) { toast(label('first')); return goToStart(); }
        toast(label('last')); return goToBottom();
      }
      scrollElTo(w.msgs[idx], 'start');
      return;
    }

    let target;
    if (lastTargetIdx >= 0 && now - lastClickTime < CLICK_WINDOW) {
      // 连续点击：基于上一次的目标继续走
      target = lastTargetIdx + dir;
    } else if (isVirtualSite) {
      const pos = computePosition(w);
      const current = w.msgs[localIndex(w, pos.idx)];
      const limit = getScrollableAncestors(w.msgs[0])[0].getBoundingClientRect().top + TOP_OFFSET;
      const aligned = current && Math.abs(current.getBoundingClientRect().top - limit) <= 8;
      target = pos.idx + (dir > 0 ? 1 : aligned ? -1 : 0);
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
    if (target < 0) { toast(label('first')); return goToStart(); }
    if (target >= N) { toast(label('last')); return goToBottom(); }
    return jumpTo(target);
  }

  function refreshControls() {
    const buttons = document.querySelectorAll('#cgpt-btns button');
    if (!buttons.length) return;
    document.getElementById('cgpt-btns').setAttribute('aria-label', label('controls'));
    const w = getWindow();
    const reference = w.msgs[0] || getAllTurns()[0];
    const scroller = reference && getScrollableAncestors(reference)[0];
    const max = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
    // Reversed flex layouts use [-max, 0], with zero at the bottom.
    const position = scroller && getComputedStyle(scroller).flexDirection === 'column-reverse'
      ? max + scroller.scrollTop
      : scroller?.scrollTop;
    // Only dim known boundaries; a sparse window must not hide earlier questions.
    const firstKnown = w.indices.includes(0);
    const lastKnown = w.indices.includes(entries.length - 1);
    const atStart = firstKnown && max > 2 && position <= 2;
    const atEnd = lastKnown && max > 2 && position >= max - 2;
    [atStart, atStart, atEnd, atEnd].forEach((disabled, i) => {
      const button = buttons[i];
      const unavailable = !reference || !entries.length;
      button.setAttribute('aria-disabled', String(unavailable || disabled));
    });
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
  let sectionsVisible = false;
  let tocSkeleton = null;
  let tocWidth = TOC_WIDTH;

  function fitPanelHeight(panel, list, available) {
    if (!panel || !list || panel.hidden || !panel.getClientRects().length) return;
    const style = getComputedStyle(panel);
    const chrome = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((height, key) => height + (parseFloat(style[key]) || 0), 0);
    const natural = Math.ceil(list.scrollHeight + chrome);
    const limit = Math.max(26, Math.floor(available));
    const preferred = Math.min(320, limit);
    const rowHeight = list.lastElementChild?.getBoundingClientRect().height || 26;
    // Allow a small overflow to fit naturally, but never exceed screen space.
    const height = natural <= limit && natural - preferred <= rowHeight
      ? natural : preferred;
    const value = height + 'px';
    if (panel.style.maxHeight !== value) panel.style.maxHeight = value;
  }

  function resizeToc() {
    if (!tocEl) return;
    fitPanelHeight(tocEl, tocList.hidden ? tocSkeleton : tocList, tocEl.getBoundingClientRect().bottom - 16);
    positionSections();
    const expanded = sectionsVisible || tocEl.matches(':hover, :has(:focus-visible)');
    const width = expanded ? Math.min(TOC_WIDTH_HOVER, innerWidth - 32) : TOC_WIDTH;
    if (width === tocWidth) return;
    tocWidth = width;
    if (motion.resize) motion.resize(tocEl, width, positionSections);
    else tocEl.style.width = width + 'px';
  }

  function setSectionsVisible(visible, immediate = false) {
    if (!sectionEl || sectionsVisible === visible && !immediate) return;
    sectionsVisible = visible;
    if (motion.panel) motion.panel(sectionEl, visible, immediate);
    else {
      sectionEl.hidden = !visible;
      if (visible && !immediate) motion.reveal?.(sectionEl);
    }
  }

  function hideSections(immediate = false) {
    clearTimeout(sectionCloseTimer);
    sectionEntry = null;
    sectionSig = '';
    setSectionsVisible(false, immediate);
    tocEl?.classList.remove('cn-expanded');
    tocItems.forEach((item) => item.classList.remove('cn-parent'));
    resizeToc();
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
    if (!sectionEntry || !sectionsVisible) return;
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
      fitPanelHeight(sectionEl, sectionList, innerHeight - 32);
      sectionEl.style.width = Math.min(TOC_WIDTH_HOVER, beside - 16) + 'px';
      sectionEl.style.left = beside - parseFloat(sectionEl.style.width) + 'px';
      sectionEl.style.top = Math.max(16, Math.min(rect.top - 5, innerHeight - sectionEl.offsetHeight - 16)) + 'px';
    } else {
      sectionEl.style.width = Math.min(TOC_WIDTH_HOVER, innerWidth - 32) + 'px';
      sectionEl.style.left = Math.max(16, tocRect.right - parseFloat(sectionEl.style.width)) + 'px';
      fitPanelHeight(sectionEl, sectionList, tocRect.top - 28);
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
    item.setAttribute('aria-label', item.querySelector('.cn-t').textContent + (hasSections ? ' · ' + label('sections') : ''));
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
      setSectionsVisible(false);
      tocEl.classList.remove('cn-expanded');
      tocItems.forEach((item) => item.classList.remove('cn-parent'));
      sectionSig = '';
      resizeToc();
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
    setSectionsVisible(true);
    sectionEl.setAttribute('aria-label', label('sections'));
    tocEl.classList.add('cn-expanded');
    tocItems.forEach((item, index) => item.classList.toggle('cn-parent', index === i));
    positionSections();
    resizeToc();
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
      if (motion.marquee) return motion.marquee(t, dist);
      t.style.transition = 'transform ' + Math.max(0.8, dist / 55) + 's linear';
      t.style.transform = 'translateX(-' + dist + 'px)';
    }
  }

  function stopMarquee(item) {
    clearTimeout(item._mt);
    const t = item.firstChild.firstChild;
    if (motion.marquee) return motion.marquee(t, 0);
    t.style.transition = 'transform 0.25s ease';
    t.style.transform = 'translateX(0)';
  }

  // Presentation only: retain the original text/key for message matching and exports.
  function questionLabelParts(text) {
    const parts = [];
    const append = (value, link = false) => {
      if (!value) return;
      const previous = parts.at(-1);
      if (previous?.link === link) previous.text += value;
      else parts.push({ text: value, link });
    };
    const unescape = value => value.replace(/\\([\\`*{}\[\]()#+\-.!_:<>])/g, '$1');
    for (let i = 0; i < text.length;) {
      // Literal code stays literal, including URLs and Markdown-looking text.
      if (text[i] === '`') {
        const delimiter = text.slice(i).match(/^`+/)[0];
        const end = text.indexOf(delimiter, i + delimiter.length);
        const next = end < 0 ? text.length : end + delimiter.length;
        append(text.slice(i, next)); i = next; continue;
      }
      if (text[i] === '\\' && i + 1 < text.length) {
        append(text.slice(i, i + 2)); i += 2; continue;
      }
      if (text[i] === '[') {
        let end = i + 1, depth = 1;
        for (; end < text.length && depth; end++) {
          if (text[end] === '\\') end++;
          else if (text[end] === '[') depth++;
          else if (text[end] === ']') depth--;
        }
        if (!depth && text[end] === '(') {
          let close = end + 1, parens = 1;
          for (; close < text.length && parens; close++) {
            if (text[close] === '\\') close++;
            else if (text[close] === '(') parens++;
            else if (text[close] === ')') parens--;
          }
          const destination = unescape(text.slice(end + 1, close - 1)).trim();
          if (!parens && /^<?(?:https?:\/\/|mailto:)/i.test(destination)) {
            if (text[i - 1] === '!') append(text.slice(i, close));
            else append(unescape(text.slice(i + 1, end - 1)) || destination, true);
            i = close; continue;
          }
        }
      }
      const url = text.slice(i).match(/^https?:\/\/[^\s<>\[\]`]+/i);
      if (url && (i === 0 || !/[\w]/.test(text[i - 1]))) {
        let value = url[0].replace(/[.,!?;:，。！？；：]+$/, '');
        while (value.endsWith(')') && (value.match(/\)/g) || []).length > (value.match(/\(/g) || []).length) value = value.slice(0, -1);
        append(value, true); i += value.length; continue;
      }
      append(text[i]); i++;
    }
    return parts;
  }

  function buildTocItem(text, i, onClick) {
    if (text === PLACEHOLDER) text = label('placeholder');
    const item = document.createElement('div');
    item.className = 'cn-item';
    const tw = document.createElement('div');
    tw.className = 'cn-tw';
    const t = document.createElement('span');
    t.className = 'cn-t';
    if (onClick) t.textContent = text;
    else {
      for (const part of questionLabelParts(text)) {
        if (!part.link) t.appendChild(document.createTextNode(part.text));
        else {
          const link = document.createElement('span');
          link.className = 'cn-link';
          link.textContent = part.text;
          t.appendChild(link);
        }
      }
    }
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
    item.title = t.textContent;
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
    if (isVirtualSite) {
      const turns = getAllTurns().filter((turn) => !previousChatNodes.has(turn));
      if (!turns.length) return { idx: -1, frac: 0 };
      const scroller = getScrollableAncestors(turns[0])[0];
      const limit = scroller.getBoundingClientRect().top + TOP_OFFSET + 8;
      const row = turns.findLast((turn) => turn.getBoundingClientRect().top <= limit) || turns[0];
      const ordinal = virtualTurnIndex(row);
      let idx = entries.findLastIndex((entry) => entry.turnIndex <= ordinal);
      if (idx < 0) return { idx: 0, frac: 0 };
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) return { idx: N - 1, frac: 1 };
      const start = entries[idx].turnIndex;
      const end = entries[idx + 1]?.turnIndex ?? (isClaude ? Number(row.querySelector('[aria-setsize]')?.getAttribute('aria-setsize')) : turnIndices.size);
      const rect = row.getBoundingClientRect();
      const progress = clamp01((limit - rect.top) / Math.max(1, rect.height));
      return { idx, frac: end > start ? clamp01((ordinal - start + progress) / (end - start)) : 0 };
    }
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
    if (!id) return syncRoute();
    if (id !== convId) resetConv(id);
    const now = Date.now();

    // 接口：首次读取，失败后每 15 秒重试一次
    if (!adapter && convId && !apiOk && !apiLoading && now - lastApiFetch > 15000) loadApi();

    // 首次加载先显示完整骨架，接口完成后一次呈现目录；失败再用页面内容。
    if (!apiLoading || entries.length) {
      const msgs = getUserMessages();
      const texts = msgs.map(getMsgText);
      const keys = texts.map(normKey);
      const ids = msgs.map(messageIdOf);
      const byId = new Map(entries.flatMap((entry, i) => entry.messageId ? [[entry.messageId, i]] : []));
      const known = ids.map((id) => byId.get(id) ?? -1);
      msgs.forEach((node, k) => {
        const entry = entries[known[k]];
        if (entry?.local && (entry.key !== keys[k] || entry.text !== texts[k])) {
          Object.assign(entry, { key: keys[k], text: texts[k], userNode: node, sections: [], domSections: [] });
        }
      });
      // 已知消息按 ID 合并；附件文字差异不能变成额外问题。
      if (adapter) {
        // Stable IDs and ordering also cover disjoint windows in virtualized chats.
        msgs.forEach((node, k) => {
          currentVirtualRows.add(node);
          const existing = entries.find(entry => entry.messageId === ids[k]);
          if (existing) {
            if (existing.key !== keys[k]) { existing.sections = []; existing.domSections = []; }
            Object.assign(existing, { key: keys[k], text: texts[k], userNode: node, order: adapter.order(node), scrollTop: contentScrollTop(node) });
          } else {
            const entry = { key: keys[k], text: texts[k], messageId: ids[k], userNode: node, order: adapter.order(node), scrollTop: contentScrollTop(node) };
            // Without an absolute provider ordinal, mounted neighbors anchor new
            // rows. Do not renumber cached questions using a sparse DOM index.
            const next = entry.order === null ? entries.find(candidate =>
              candidate.userNode?.isConnected && node.compareDocumentPosition(candidate.userNode) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
            entries.splice(next ? entries.indexOf(next) : entries.length, 0, entry);
          }
        });
        if (entries.every(entry => entry.order !== null)) entries.sort((a, b) => a.order - b.order);
      } else if (isVirtualSite) {
        msgs.forEach((node, k) => {
          const turnIndex = virtualTurnIndex(node);
          if (!ids[k]) return;
          const existing = entries.find((entry) => entry.messageId === ids[k]);
          if (existing) {
            if (existing.key !== keys[k]) {
              existing.key = keys[k]; existing.text = texts[k]; existing.sections = []; existing.domSections = []; existing.local = true;
            }
            existing.userNode = node;
          } else entries.push({ key: keys[k], text: texts[k], messageId: ids[k], turnIndex, local: true, userNode: node });
        });
        entries.sort((a, b) => a.turnIndex - b.turnIndex);
      } else if (apiOk && ids.some(Boolean)) {
        const lastKnown = known.findLastIndex((i) => i >= 0);
        if (lastKnown < 0 || known[lastKnown] === entries.length - 1) {
          for (let k = lastKnown + 1; k < msgs.length; k++) {
            if (ids[k] && !byId.has(ids[k])) {
              byId.set(ids[k], entries.length);
              entries.push({ key: keys[k], text: texts[k], messageId: ids[k], local: true });
            }
          }
        }
      } else if (!apiOk && ids.some(Boolean) && entries.every(entry => entry.messageId)) {
        // Failed API reads still retain disjoint observed windows by identity.
        // Mounted neighbors anchor their order; cached scroll positions cover
        // windows with no overlapping question, including older history.
        msgs.forEach((node, k) => {
          if (!ids[k] || entries.some(entry => entry.messageId === ids[k])) return;
          const scrollTop = contentScrollTop(node);
          const next = entries.find(entry => entry.userNode?.isConnected &&
            node.compareDocumentPosition(entry.userNode) & Node.DOCUMENT_POSITION_FOLLOWING) ||
            entries.find(entry => Number.isFinite(entry.scrollTop) && entry.scrollTop > scrollTop);
          entries.splice(next ? entries.indexOf(next) : entries.length, 0,
            { key: keys[k], text: texts[k], messageId: ids[k], userNode: node, scrollTop, local: true });
        });
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

    let rebuilt = false;
    const sig = JSON.stringify(entries.map(e => [e.messageId || '', e.key, e.text]));
    if (sig !== tocSig) {
      rebuilt = true;
      hideSections(true);
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
    if (rebuilt && !loading && entries.length) motion.reveal?.(tocList);
    if (isDeepseek) {
      const active = !!id && entries.length > 0;
      document.documentElement.classList.toggle('chatpick-deepseek-active', active);
    }
    refreshSectionMarkers();
    updateActive();
    refreshSections();
    refreshControls();
    resizeToc();
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
      safe(refreshControls, '按钮状态');
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
  function detectTheme(followPage = false) {
    if (!followPage && (settings.theme === 'light' || settings.theme === 'dark')) return settings.theme;
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
    applySiteColors(box, t);
  }

  // 高亮跟随站点外观强调色或品牌色；通用链接色不参与回退。
  const siteColorTokens = adapter ? adapter.colorTokens : isDeepseek ? {
    bg: ['--dsw-alias-bg-layer-1'],
    fg: ['--dsw-alias-label-primary'],
    muted: ['--dsw-alias-label-secondary'],
    border: ['--dsw-alias-border-l2'],
    track: ['--dsw-alias-border-l3'],
    hover: ['--dsw-alias-interactive-bg-hover', '--dsw-alias-bg-layer-2'],
    active: ['--dsw-alias-brand-text', '--dsw-alias-brand-primary', '--color-primary'],
  } : isClaude ? {
    bg: ['--cds-surface-popover', '--cds-surface-3', '--bg-000'],
    fg: ['--cds-text-primary', '--text-100'],
    muted: ['--cds-text-secondary', '--text-300'],
    border: ['--cds-border', '--border-300'],
    track: ['--cds-border-strong', '--border-200'],
    hover: ['--cds-bg-neutral-hover', '--bg-200'],
    active: ['--cds-fill-brand', '--fill-brand', '--accent-brand', '--brand-200'],
  } : {
    bg: ['--app-color-background-elevated-primary-opaque', '--app-color-background-elevated-primary', '--main-surface-secondary', '--color-token-main-surface-secondary'],
    fg: ['--app-color-text-primary', '--text-primary', '--color-text-primary', '--color-token-text-primary'],
    muted: ['--app-color-text-secondary', '--text-secondary', '--color-text-secondary', '--color-token-text-secondary'],
    border: ['--app-color-border', '--border-light', '--color-border-light'],
    track: ['--app-color-border-heavy', '--border-medium', '--color-border-heavy'],
    hover: ['--color-background-primary-soft-hover', '--surface-hover', '--color-token-surface-hover'],
    active: ['--app-color-text-accent', '--app-color-icon-accent', '--brand-color', '--brand-green'],
  };

  function applySiteColors(box, theme) {
    const pageStyle = getComputedStyle(box);
    const sameAppearance = theme === detectTheme(true);
    for (const [key, tokens] of Object.entries(siteColorTokens)) {
      let color = '';
      if (settings.colors === 'site' && (sameAppearance || key === 'active' && adapter?.name !== 'Grok')) {
        for (const token of tokens) {
          const value = pageStyle.getPropertyValue(token).trim();
          if (!value) continue;
          // Claude 的旧版主题使用不带 hsl() 的 HSL 分量。
          const candidate = CSS.supports('color', value) ? value : `hsl(${value})`;
          if (CSS.supports('color', candidate) && !['transparent', 'currentcolor', 'inherit', 'initial', 'unset'].includes(candidate.toLowerCase())) {
            color = candidate;
            break;
          }
        }
      }
      // 官网未暴露品牌变量时仍保留各站点的颜色，不借用统一的蓝色链接。
      if (!color && key === 'active' && settings.colors === 'site') {
        color = adapter ? adapter.accent(theme === 'dark') : isClaude ? (theme === 'dark' ? '#d97757' : '#c6613f')
          : isDeepseek ? (theme === 'dark' ? '#679efe' : '#306eff')
            : (theme === 'dark' ? '#19c37d' : '#10a37f');
      }
      const property = '--cn-' + key;
      if (color) {
        if (box.style.getPropertyValue(property) !== color) box.style.setProperty(property, color);
      } else box.style.removeProperty(property);
    }
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
      }
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
      #cgpt-nav-box .cn-link { text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; }

      /* 保留原生组件及其虚拟列表尺寸，显示 ChatPick 时收起重复入口。 */
      html.chatpick-deepseek-active [style*="--scroll-nav-page-padding"] {
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* 按钮 */
      #cgpt-btns { display: flex; flex-direction: column; gap: 0; width: 84px; box-sizing: border-box; padding: 3px 4px; border: 1px solid var(--cn-border); border-radius: 12px; background: var(--cn-bg); box-shadow: var(--cn-shadow); }
      #cgpt-btns[hidden] { display: none; }
      #cgpt-btns button, #chatpick-export-button {
        position: relative;
        width: 100%;
        height: 36px;
        border-radius: 8px;
        border: none;
        background: transparent;
        color: var(--cn-fg);
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: center;
        justify-items: start;
        text-align: left;
        cursor: pointer;
        padding: 0 6px;
        gap: 6px;
        font: 12px/1.5 system-ui, sans-serif;
      }
      #cgpt-btns button { height: 30px; }
      #cgpt-btns button svg { width: 18px; height: 18px; }
      #cgpt-btns button svg, #chatpick-export-button > .cn-spinner { grid-column: 1; grid-row: 1; }
      #cgpt-btns .cn-control-label, #chatpick-export-button > span:not(.cn-spinner) { grid-column: 2; grid-row: 1; }
      #cgpt-btns button:first-child .cn-control-label, #cgpt-btns button:last-child .cn-control-label { color: var(--cn-muted); }
      #cgpt-btns button:nth-child(2), #cgpt-btns button:nth-child(4) { margin-top: 4px; }
      #cgpt-btns button:nth-child(2)::before, #cgpt-btns button:nth-child(4)::before { content: ''; position: absolute; top: -3px; left: 8px; right: 8px; height: 1px; background: var(--cn-border); pointer-events: none; }
      #cgpt-btns button:hover:not([aria-disabled="true"]), #chatpick-export-button:hover, #chatpick-export-button[aria-expanded="true"] { background: var(--cn-hover); color: var(--cn-fg); }
      #cgpt-btns button[aria-disabled="true"] { opacity: .35; cursor: default; transform: none !important; }
      #cgpt-btns button svg, #chatpick-export-button svg { pointer-events: none; }
      #cgpt-btns button:focus-visible, #chatpick-export button:focus-visible { outline: 2px solid var(--cn-active); outline-offset: 3px; }
      #cgpt-btns button[data-tooltip]::after, #chatpick-export-button[data-tooltip]::after {
        content: attr(data-tooltip); position: absolute; right: calc(100% + 14px); top: 50%; transform: translateY(-50%);
        padding: 6px 9px; border: 1px solid var(--cn-border); border-radius: 8px; background: var(--cn-bg); color: var(--cn-fg);
        box-shadow: var(--cn-shadow); font: 12px/1.5 system-ui, sans-serif; white-space: nowrap; pointer-events: none; opacity: 0; visibility: hidden;
        transition: opacity .12s ease, visibility .12s ease;
      }
      #cgpt-btns button:is(:hover,:focus-visible)::after, #chatpick-export-button:is(:hover,:focus-visible):not([aria-expanded="true"])::after { opacity: 1; visibility: visible; transition-delay: .2s; }
      #cgpt-nav-box .cn-spinner { display: none; width: 14px; height: 14px; flex: none; box-sizing: border-box; border: 1.5px solid var(--cn-border); border-top-color: currentColor; border-radius: 50%; animation: cn-spin .75s linear infinite; }
      #chatpick-export-button[data-busy="true"] .cn-spinner { display: block; }
      #chatpick-export-button[data-busy="true"] > svg { display: none; }
      @keyframes cn-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { #cgpt-nav-box .cn-spinner { animation: none; } #cgpt-btns button::after, #chatpick-export-button::after { transition: none; } }

      #chatpick-export { position: relative; width: 84px; font: 13px/1.5 system-ui, sans-serif; color: var(--cn-fg); }
      #chatpick-export-button { box-sizing: border-box; width: 100%; padding: 0 10px; border: 1px solid color-mix(in srgb, var(--cn-border) 65%, transparent); border-radius: 10px; background: var(--cn-bg); box-shadow: 0 1px 4px rgb(0 0 0 / .08); }
      #chatpick-export-button > span:not(.cn-spinner) { color: var(--cn-muted); }
      #chatpick-export-panel { position: fixed; box-sizing: border-box; width: min(270px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow-y: auto; padding: 14px; border: 1px solid var(--cn-border); border-radius: 14px; background: var(--cn-bg); box-shadow: var(--cn-shadow); }
      #chatpick-export-panel[hidden] { display: none; }
      #chatpick-export-panel p { margin: 10px 0 0; color: var(--cn-muted); font-size: 12px; }
      #chatpick-export-panel p[hidden] { display: none; }
      #chatpick-export-panel .chatpick-export-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; }
      #chatpick-export-panel button { font: inherit; display: block; width: 100%; padding: 8px 10px; margin-top: 6px; border: 1px solid var(--cn-border); border-radius: 8px; background: transparent; color: var(--cn-fg); cursor: pointer; text-align: left; }
      #chatpick-export-panel #chatpick-export-close { flex: none; width: 32px; height: 32px; padding: 0; margin: 0; border: none; text-align: center; font: 22px/32px system-ui, sans-serif; }
      #chatpick-export-panel button:hover { background: var(--cn-hover); }
      #chatpick-export-panel button:disabled { opacity: .5; cursor: wait; }
      #cgpt-nav-toast {
        position: fixed;
        right: 18px;
        bottom: 24px;
        box-sizing: border-box;
        max-width: min(360px, calc(100vw - 36px));
        max-height: min(104px, calc(100vh - 48px));
        overflow: hidden;
        overflow-wrap: anywhere;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.8);
        color: #fff;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.5;
        opacity: 0;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function makeButton(iconPaths, key, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.tooltip = label(key);
    btn.setAttribute('aria-label', label(key));
    btn.className = 'cn-control';
    btn.appendChild(createIcon(iconPaths));
    const caption = document.createElement('span'); caption.className = 'cn-control-label'; caption.textContent = label(key + 'Short'); btn.appendChild(caption);
    motion.button?.(btn);
    let operation = 0;
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.getAttribute('aria-disabled') === 'true') return;
      const current = ++operation;
      try {
        const result = handler();
        if (result?.then) {
          btn.setAttribute('aria-busy', 'true');
          await result;
        }
      } catch (err) {
        console.error('[ChatGPT 对话导航] 出错：', err);
        toast(label('error') + err.message);
      } finally {
        if (current === operation) { btn.removeAttribute('aria-busy'); safe(refreshControls, '按钮状态'); }
      }
    });
    return btn;
  }

  function init() {
    if (!getConvId()) return;
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
    tocEl.addEventListener('mouseenter', () => { clearTimeout(sectionCloseTimer); resizeToc(); });
    tocEl.addEventListener('mouseleave', () => { scheduleSectionClose(); resizeToc(); });
    tocEl.addEventListener('focusin', resizeToc);
    tocEl.addEventListener('focusout', () => requestAnimationFrame(resizeToc));
    window.addEventListener('resize', resizeToc);
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
    btns.hidden = !settings.showJumpButtons;
    btns.setAttribute('role', 'group'); btns.setAttribute('aria-label', label('controls'));
    btns.appendChild(makeButton(ICONS.start, 'start', goToStart));
    btns.appendChild(makeButton(ICONS.prev, 'prev', () => stepQuestion(-1)));
    btns.appendChild(makeButton(ICONS.next, 'next', () => stepQuestion(1)));
    btns.appendChild(makeButton(ICONS.bottom, 'bottom', goToBottom));
    box.appendChild(btns);

    document.body.appendChild(box);
    motion.reveal?.(btns);
    safe(applyTheme, '主题');

    tocSig = '';
    tocItems = [];
    activeIdx = -1;
    tocWidth = TOC_WIDTH;
    safe(refreshToc, '目录');
    installExport();
    resizeToc();
  }

  function installExport() {
    if (!settings.showExport) { stopExport?.(); stopExport = null; return; }
    if (!exporter || stopExport || !getConvId()) return;
    const box = document.getElementById('cgpt-nav-box');
    if (!box) return;
    stopExport = exporter(box, {
      provider: adapter?.name || (isClaude ? 'Claude' : isDeepseek ? 'DeepSeek' : 'ChatGPT'),
      conversationId: getConvId, language, readHistory,
      buttonMotion: motion.button,
      nodes: () => {
        const users = getUserMessages();
        return [...users, ...getRenderedAnswers()].sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).map(node => {
          const user = users.includes(node);
          const selector = user ? (isDeepseek ? '.ds-collapsible-text' : '[data-user-message-bubble], [data-message-author-role="user"], [data-message-role="user"], .whitespace-pre-wrap') : (isDeepseek ? '.ds-assistant-message-main-content' : '.standard-markdown, .progressive-markdown, .markdown, [data-message-content], [data-assistant-markdown], [data-markdown-text-style="assistant-message"]');
          const roots = adapter ? (user ? adapter.userRoots(node) : adapter.answerRoots(node)) : Array.from(node.querySelectorAll(selector));
          return { node, role: user ? 'user' : 'assistant', id: messageIdOf(node) || '', roots: roots.length ? outermostUnique(roots) : [node] };
        });
      },
    });
  }

  function setupObservers() {
    // scroll 事件不冒泡，用捕获阶段监听任意滚动容器
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);

    // 消息变化（发送新提问、切换对话、懒加载、流式输出）时刷新目录
    const contentObserver = new MutationObserver((records) => {
      if (getConvId() !== convId) return safe(syncRoute, '切换页面');
      if (!records.some(isContentMutation)) return;
      contentVersion++;
      scheduleRefresh();
    });
    contentObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'class', 'id', 'data-testid',
        'data-message-id', 'data-message-author-role', 'data-message-role', 'data-user-message-bubble',
        'data-chatgpt-search-unit-key', 'data-content-search-unit-key', 'data-chatgpt-search-message-ids',
        'data-chatgpt-selection-message-id', 'data-turn', 'data-role', 'data-message-author',
        'data-index', 'data-virtual-list-item-key', 'data-msg-id', 'data-chat-id',
        'data-chat', 'data-chat-pos', 'data-offset', 'data-workflow-entry', 'data-renderer'],
    });

    // 页面切换主题时跟着变：<html>/<body> 的 class、data-theme、style 变化，或系统偏好变化
    const onTheme = () => {
      safe(applyTheme, '主题');
      if (language() !== displayedLanguage) safe(refreshLanguage, '语言');
    };
    const themeObserver = new MutationObserver(onTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'lang', 'data-theme', 'data-color-scheme', 'data-mode', 'data-accent-color', 'data-chat-theme', 'style'],
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    themeObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (mq) {
      if (mq.addEventListener) mq.addEventListener('change', onTheme);
      else if (mq.addListener) mq.addListener(onTheme);
    }
    return () => {
      contentObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('resize', resizeToc);
      if (mq?.removeEventListener) mq.removeEventListener('change', onTheme);
      else mq?.removeListener?.(onTheme);
    };
  }

  let stopObservers = null;
  function syncRoute() {
    if (!document.body) return;
    const id = getConvId();
    if (!id) {
      if (!stopObservers) return;
      stopObservers();
      stopObservers = null;
      resetConv(null);
      clearTimeout(refreshTimer);
      refreshTimer = 0;
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
      document.documentElement.classList.remove('chatpick-deepseek-active');
      tokenCache = { t: '', exp: 0 };
      ['cgpt-nav-box', 'cgpt-nav-toast', 'cgpt-nav-style'].forEach((name) => document.getElementById(name)?.remove());
      tocEl = tocList = tocSkeleton = sectionEl = sectionList = null;
      return;
    }
    if (!stopObservers) stopObservers = setupObservers();
    if (!document.getElementById('cgpt-nav-box')) init();
    else if (id !== convId) refreshToc();
    installExport();
  }

  function boot() {
    // 保留轻量的路由监听，首页进入聊天时也能启用；内容监听仅存在于详情页。
    const onRoute = () => safe(syncRoute, '切换页面');
    window.navigation?.addEventListener('currententrychange', onRoute);
    window.addEventListener('popstate', onRoute);
    safe(syncRoute, '初始化');
  }

  console.info('[ChatGPT 对话导航] v1.9.0 已加载');
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });

  // 同时兼容没有 Navigation API 的浏览器，以及页面重渲染后的自愈。
  setInterval(() => {
    safe(syncRoute, '自愈');
  }, 2000);
}
