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

(function () {
  'use strict';

  // 滚动后目标与可视区域顶部的留白（避开固定标题栏），可按需调整
  const TOP_OFFSET = 72;
  // 连续快速点击时，视为同一轮滚动的时间窗口（毫秒）
  const CLICK_WINDOW = 800;
  // 是否使用平滑滚动。false = 点击后直接跳转（默认）
  const SMOOTH_SCROLL = false;
  // 主题：'auto' 跟随页面当前主题；也可以强制为 'light' 或 'dark'
  const THEME = 'auto';
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
  ].join(',');

  const ANY_ROLE_SEL = [
    '[data-user-message-bubble]',
    '[data-message-author-role]',
    '[data-message-role]',
  ].join(',');

  const TURN_SEL = [
    '[data-testid^="conversation-turn"]',
    '[data-turn]',
    '[data-message-role]',
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
  function mergeKeys(keys, texts, allowPrepend, markLocal) {
    const L = keys.length;
    if (!L) return false;
    const mk = (k) => ({ key: keys[k], text: texts[k], local: !!markLocal });
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
        if (entries[j].key !== keys[k]) { ok = false; break; }
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

  // 从 /backend-api/conversation/{id} 的返回里，取出当前分支上所有用户提问
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
      if (!m || !m.author || m.author.role !== 'user') continue;
      if (m.metadata && m.metadata.is_visually_hidden_from_conversation) continue;
      const c = m.content || {};
      if (c.content_type && c.content_type !== 'text' && c.content_type !== 'multimodal_text') continue;
      const parts = c.parts || [];
      let text = parts.filter((p) => typeof p === 'string').join(' ').replace(/\s+/g, ' ').trim();
      if (!text && parts.length) text = PLACEHOLDER;
      if (!text) continue;
      out.push({ key: normKey(text), text: text.slice(0, 300), local: false });
    }
    return out;
  }
  // </pure>

  // ---------- 节点识别 ----------

  function isIgnored(el) {
    return !!el.closest('form, nav, aside, header, footer, [role="dialog"], #cgpt-nav-box');
  }

  function outermostUnique(list) {
    const uniq = Array.from(new Set(list));
    return uniq.filter((a) => !uniq.some((b) => b !== a && b.contains(a)));
  }

  function turnOf(node) {
    return node.closest(TURN_SEL) || node.closest('article') || node;
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
    let turns = Array.from(document.querySelectorAll(TURN_SEL)).filter((n) => !isIgnored(n));
    if (!turns.length) {
      turns = Array.from(document.querySelectorAll('main article')).filter((n) => !isIgnored(n));
    }
    if (!turns.length) {
      turns = Array.from(document.querySelectorAll(ANY_ROLE_SEL))
        .filter((n) => !isIgnored(n))
        .map(turnOf);
    }
    return outermostUnique(turns);
  }

  function getUserMessages() {
    const byRole = Array.from(document.querySelectorAll(USER_ROLE_SEL))
      .filter((n) => !isIgnored(n))
      .map(turnOf);
    if (byRole.length) return outermostUnique(byRole);

    const turns = getAllTurns();
    if (!turns.length) return [];
    const judged = turns.map((t) => ({ t, u: isUserTurn(t) }));
    if (judged.some((x) => x.u === true)) {
      return judged.filter((x) => x.u === true).map((x) => x.t);
    }
    return turns.filter((_, i) => i % 2 === 0);
  }

  function getMsgText(turn) {
    const node = turn.matches(USER_ROLE_SEL) ? turn : turn.querySelector(USER_ROLE_SEL) || turn;
    let t = (node.textContent || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/^(you said:?|你说[:：]?)\s*/i, '');
    if (!t) t = PLACEHOLDER;
    return t.slice(0, 300);
  }

  // 当前 DOM 里已渲染的提问，以及它们在完整列表里的位置
  function getWindow() {
    const msgs = getUserMessages();
    const keys = msgs.map((m) => normKey(getMsgText(m)));
    const offset = locateKeys(keys);
    return { msgs, keys, offset };
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

  function diagnose() {
    const q = (s) => document.querySelectorAll(s).length;
    return (
      '未找到消息。诊断：role-author=' + q('[data-message-author-role]') +
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
  }

  // ---------- 导航行为 ----------

  let lastTargetIdx = -1;
  let lastClickTime = 0;
  let seekToken = 0;

  // 跳到全局第 i 个提问；如果它当前没渲染，就朝目标方向滚动，直到它被加载出来
  async function jumpTo(i) {
    const token = ++seekToken;
    lastTargetIdx = i;
    lastClickTime = Date.now();
    for (let n = 0; n < 60; n++) {
      if (token !== seekToken) return;
      const w = getWindow();
      if (!w.msgs.length) return toast(diagnose());
      if (w.offset < 0) return toast('无法定位：已加载的内容与目录对不上，请稍后重试');
      const len = w.msgs.length;
      const k = i - w.offset;
      if (k >= 0 && k < len) {
        const smooth = SMOOTH_SCROLL && n === 0;
        scrollElTo(w.msgs[k], 'start', smooth ? 'smooth' : 'instant');
        if (!smooth) {
          // 直接跳转后，等相邻内容渲染、高度稳定，再校正一次位置
          await sleep(250);
          if (token !== seekToken) return;
          const w2 = getWindow();
          const k2 = i - w2.offset;
          if (w2.offset >= 0 && k2 >= 0 && k2 < w2.msgs.length) {
            const top = w2.msgs[k2].getBoundingClientRect().top;
            if (Math.abs(top - TOP_OFFSET) > 24) scrollElTo(w2.msgs[k2], 'start', 'instant');
          }
        }
        return;
      }
      if (n === 0) toast('正在加载并定位…');
      const dir = k < 0 ? -1 : 1;
      const gap = k < 0 ? -k : k - (len - 1);
      const c = getScrollableAncestors(w.msgs[0])[0];
      const vh = c.clientHeight || window.innerHeight;
      let avg = vh;
      if (len > 1) {
        avg = Math.max(
          80,
          (w.msgs[len - 1].getBoundingClientRect().top - w.msgs[0].getBoundingClientRect().top) / (len - 1)
        );
      }
      const step = Math.min(Math.max(gap * avg * 0.9, vh * 0.8), vh * 8);
      const before = c.scrollTop;
      c.scrollBy({ top: dir * step, behavior: 'instant' });
      await sleep(c.scrollTop === before ? 500 : 160);
    }
    toast('定位超时，请重试');
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
        if (dir < 0) { toast('已经是第一个提问'); goToStart(); }
        else { toast('已经是最后一个提问'); goToBottom(); }
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
      target = local >= 0 ? w.offset + local : w.offset - 1;
    } else if (local < 0) {
      target = w.offset + len;
    } else {
      target = w.offset + local;
      // 最后一个提问通常滚不到最顶部：已经在视野上半部分就直接去底部
      if (target === N - 1 && topOf(local) < window.innerHeight * 0.6) target = N;
    }

    lastClickTime = now;
    if (target < 0) { toast('已经是第一个提问'); goToStart(); return; }
    if (target >= N) { toast('已经是最后一个提问'); goToBottom(); return; }
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

  function buildTocItem(text, i) {
    const item = document.createElement('div');
    item.className = 'cn-item';
    const tw = document.createElement('div');
    tw.className = 'cn-tw';
    const t = document.createElement('span');
    t.className = 'cn-t';
    t.textContent = text;
    tw.appendChild(t);
    item.appendChild(tw);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpTo(i);
    });
    // 悬停：等目录展开动画结束后，再测量并滚动显示被截断的文字
    item.addEventListener('mouseenter', () => {
      clearTimeout(item._mt);
      item._mt = setTimeout(() => startMarquee(item), 260);
    });
    item.addEventListener('mouseleave', () => stopMarquee(item));
    return item;
  }

  function setActive(idx) {
    if (idx === activeIdx) return;
    activeIdx = idx;
    tocItems.forEach((it, i) => it.classList.toggle('active', i === idx));
    const it = tocItems[idx];
    if (it && tocList && !tocEl.matches(':hover')) {
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
    const isGlobalLast = w.offset + idx >= N - 1;
    if (w.offset + last >= N - 1 && top(last) < window.innerHeight * 0.5) idx = last;

    const t0 = top(idx);
    let frac = 0;
    if (idx < last) {
      const end = top(idx + 1);
      if (end > t0) frac = clamp01((limit - t0) / (end - t0));
    } else if (w.offset + idx >= N - 1) {
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
    return { idx: w.offset + idx, frac };
  }

  // 根据当前滚动位置计算高亮哪一条，并移动位置指示条
  function updateActive() {
    if (!tocItems.length) return;
    const w = getWindow();
    if (!w.msgs.length || w.offset < 0) return;
    const pos = computePosition(w);
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

    if (!apiLoading) {
      const msgs = getUserMessages();
      const texts = msgs.map(getMsgText);
      const keys = texts.map(normKey);
      // 接口数据完整时只向后追加（刚发出的新提问）；否则双向合并
      mergeKeys(keys, texts, !apiOk, apiOk);
      // 追加的是临时条目，过一会儿向接口核对一次
      if (apiOk && entries.some((e) => e.local) && reconcileTries < 6 && now - lastReconcile > 3000) {
        reconcileTries++;
        lastReconcile = now;
        loadApi();
      }
    }

    const sig = entries.map((e) => e.key).join('|');
    if (sig !== tocSig) {
      tocSig = sig;
      tocList.textContent = '';
      tocItems = entries.map((e, i) => {
        const it = buildTocItem(e.text, i);
        tocList.appendChild(it);
        return it;
      });
      tocEl.style.display = entries.length ? '' : 'none';
      activeIdx = -1;
    }
    updateActive();
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
    if (THEME === 'light' || THEME === 'dark') return THEME;
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
      #cgpt-toc {
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
      #cgpt-toc:hover { width: ${TOC_WIDTH_HOVER}px; }
      #cgpt-toc .cn-list {
        position: relative;
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain; /* 只滚动目录，滚到头也不会带动页面 */
      }
      /* Chrome / Edge / Safari：自定义滚动条样式，同时让它始终可见（不做自动隐藏的悬浮条） */
      #cgpt-toc .cn-list::-webkit-scrollbar { width: 6px; }
      #cgpt-toc .cn-list::-webkit-scrollbar-track { background: transparent; }
      #cgpt-toc .cn-list::-webkit-scrollbar-thumb {
        background: var(--cn-muted);
        border-radius: 3px;
      }
      #cgpt-toc .cn-list::-webkit-scrollbar-thumb:hover { background: var(--cn-fg); }
      /* Firefox */
      @supports (-moz-appearance: none) {
        #cgpt-toc .cn-list { scrollbar-width: thin; scrollbar-color: var(--cn-muted) transparent; }
      }
      #cgpt-toc .cn-item {
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
      #cgpt-toc .cn-item:hover { background: var(--cn-hover); color: var(--cn-fg); }
      #cgpt-toc .cn-item.active {
        color: var(--cn-active);
        border-left-color: var(--cn-active);
        font-weight: 600;
      }
      #cgpt-toc .cn-tw {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent);
        mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent);
      }
      #cgpt-toc .cn-t { display: inline-block; white-space: nowrap; }

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
        toast('脚本出错：' + err.message);
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
    box.appendChild(tocEl);

    const btns = document.createElement('div');
    btns.id = 'cgpt-btns';
    btns.appendChild(makeButton(ICONS.start, '回到聊天开始', goToStart));
    btns.appendChild(makeButton(ICONS.prev, '上一个提问（可连续点击）', () => stepQuestion(-1)));
    btns.appendChild(makeButton(ICONS.next, '下一个提问（可连续点击）', () => stepQuestion(1)));
    btns.appendChild(makeButton(ICONS.bottom, '跳到底部', goToBottom));
    box.appendChild(btns);

    document.body.appendChild(box);
    safe(applyTheme, '主题');

    tocSig = '';
    tocItems = [];
    activeIdx = -1;
    safe(refreshToc, '目录');
  }

  function setupObservers() {
    // scroll 事件不冒泡，用捕获阶段监听任意滚动容器
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);

    // 消息变化（发送新提问、切换对话、懒加载、流式输出）时刷新目录
    new MutationObserver(scheduleRefresh).observe(document.body, {
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
    }, '自愈');
  }, 2000);
})();
