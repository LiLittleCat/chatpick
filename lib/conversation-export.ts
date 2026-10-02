export type TranscriptMessage = { id: string; role: 'user' | 'assistant'; markdown: string };
export type Transcript = {
  title: string; provider: string; source: string; exportedAt: string;
  messages: TranscriptMessage[]; partial: boolean;
};
export type ExportContext = {
  provider: string; conversationId: () => string | null; language: () => string;
  readHistory: (id: string, signal: AbortSignal) => Promise<unknown>;
  nodes: () => { node: Element; role: 'user' | 'assistant'; id: string; roots: Element[] }[];
  buttonMotion?: (button: HTMLButtonElement) => void;
};
type RecordData = Record<string, any>;

// Follow a single active leaf. Never concatenate sibling branches.
function branch(items: RecordData[], leaf: unknown, key: string, parent: string) {
  const map = new Map(items.map(item => [String(item[key]), item]));
  const path: RecordData[] = [], seen = new Set<string>();
  let id = String(leaf);
  while (map.has(id) && !seen.has(id)) {
    seen.add(id);
    const item = map.get(id)!;
    path.push(item);
    id = String(item[parent]);
  }
  return { path: path.reverse(), partial: !['null', 'undefined', '0', '00000000-0000-0000-0000-000000000000'].includes(id) };
}

export function historyTranscript(provider: string, input: unknown): { title: string; messages: TranscriptMessage[]; partial: boolean } {
  const data = input as RecordData;
  const messages: TranscriptMessage[] = [];
  let partial = false;
  const add = (id: unknown, role: TranscriptMessage['role'], text: string, attachments = false) => {
    if (attachments) text += '\n\n[Attachment content is not included in this text export.]';
    if (text.trim()) messages.push({ id: String(id), role, markdown: text.trim() });
  };
  if (provider === 'ChatGPT') {
    const mapping = data.mapping || {};
    if (!mapping[data.current_node]) throw new Error('No active branch');
    const active = branch(Object.entries(mapping).map(([id, value]) => ({ ...(value as RecordData), key: id })), data.current_node, 'key', 'parent');
    partial = active.partial;
    for (const node of active.path) {
      const m = node.message;
      if (!m || m.metadata?.is_visually_hidden_from_conversation) continue;
      const role = m.author?.role;
      if (role !== 'user' && role !== 'assistant') continue;
      if (role === 'assistant' && ((m.recipient && m.recipient !== 'all') || (m.channel && m.channel !== 'final'))) continue;
      const parts = m.content?.parts || [];
      if (m.content?.content_type && !['text', 'multimodal_text'].includes(m.content.content_type)) {
        add(m.id, role, '[Non-text message content is not included.]'); continue;
      }
      add(m.id, role, parts.filter((p: unknown) => typeof p === 'string').join('\n'), parts.some((p: unknown) => typeof p !== 'string'));
      if (m.status && m.status !== 'finished_successfully') partial = true;
    }
  } else if (provider === 'Claude') {
    if (!Array.isArray(data.chat_messages)) throw new Error('No messages');
    const all = data.chat_messages;
    // Without a leaf, only an unambiguous linear conversation is safe to export.
    const parents = new Set(all.map((m: RecordData) => m.parent_message_uuid));
    const leaves = all.filter((m: RecordData) => !parents.has(m.uuid));
    const leaf = data.current_leaf_message_uuid || (leaves.length === 1 ? leaves[0].uuid : null);
    if (!leaf) throw new Error('Ambiguous branch');
    const active = branch(all, leaf, 'uuid', 'parent_message_uuid');
    partial = active.partial;
    for (const m of active.path) {
      if (!['human', 'assistant'].includes(m.sender)) continue;
      const blocks = Array.isArray(m.content) ? m.content : [];
      const text = blocks.filter((b: RecordData) => b.type === 'text' && typeof b.text === 'string').map((b: RecordData) => b.text).join('\n');
      add(m.uuid, m.sender === 'human' ? 'user' : 'assistant', text || (!blocks.length ? m.text || '' : ''), !!m.attachments?.length || !!m.files?.length);
    }
  } else if (provider === 'DeepSeek') {
    const history = data?.data?.biz_data;
    if (data?.code !== 0 || data?.data?.biz_code !== 0 || !Array.isArray(history?.chat_messages)) throw new Error('No messages');
    const all = history.chat_messages;
    const leaf = history.chat_session?.current_message_id ?? Math.max(...all.map((m: RecordData) => Number(m.message_id)));
    const active = branch(all, leaf, 'message_id', 'parent_id');
    partial = active.partial;
    for (const m of active.path) {
      if (!['USER', 'ASSISTANT'].includes(m.role)) continue;
      const user = m.role === 'USER';
      const text = (m.fragments || []).filter((f: RecordData) => user ? f.type === 'REQUEST' : ['RESPONSE', 'TEMPLATE_RESPONSE'].includes(f.type)).map((f: RecordData) => typeof f.content === 'string' ? f.content : '').join('\n');
      add(m.message_id, user ? 'user' : 'assistant', text);
    }
    if (!messages.length) throw new Error('No final messages');
    return { title: history.chat_session?.title || '', messages, partial };
  }
  if (!messages.length) throw new Error('No final messages');
  return { title: data.title || data.name || '', messages, partial };
}

const ignored = 'button,svg,script,style,nav,aside,[hidden],[aria-hidden="true"],.sr-only,.cdk-visually-hidden,.thinking-container,.phase-thinking,[data-testid*="thinking"]';
const escape = (text: string) => text.replace(/([\\`*_{}\[\]<>])/g, '\\$1');
const safeUrl = (value: string | null) => {
  try { const url = new URL(value || '', location.origin); return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
};
export function domMarkdown(root: Element): string {
  if (root.closest(ignored)) return "";
  const codeBlocks: string[] = [];
  const marker = "CHATPICKCODE" + crypto.randomUUID().replace(/-/g, "") + "_";
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent || '');
    if (!(node instanceof Element) || node.matches(ignored) || getComputedStyle(node).display === 'none') return '';
    const tag = node.tagName.toLowerCase();
    const tex = node.matches('.katex,.katex-display,mjx-container') ? node.querySelector('annotation[encoding="application/x-tex"]')?.textContent : null;
    if (tex) return node.matches('.katex-display,[display="true"]') ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
    if (tag === 'pre') {
      const code = node.querySelector('code') || node;
      const text = code.textContent || '';
      const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), m => m[0].length + 1)));
      const language = code.className.match(/language-([\w+-]+)/)?.[1] || '';
      codeBlocks.push(`${fence}${language}\n${text.trimEnd()}\n${fence}`);
      return `\n\n${marker}${codeBlocks.length - 1}END\n\n`;
    }
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr')).map(row => Array.from(row.children).map(cell => Array.from(cell.childNodes).map(walk).join('').trim().replace(/\|/g, '\\|').replace(/\n+/g, '<br>')));
      if (!rows.length) return '';
      const width = Math.max(...rows.map(row => row.length));
      const line = (row: string[]) => '| ' + Array.from({ length: width }, (_, i) => row[i] || '').join(' | ') + ' |';
      return '\n\n' + [line(rows[0]!), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n\n';
    }
    const content = Array.from(node.childNodes).map(walk).join('');
    if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${content.trim()}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'strong' || tag === 'b') return `**${content}**`;
    if (tag === 'em' || tag === 'i') return `*${content}*`;
    if (tag === 'del' || tag === 's') return `~~${content}~~`;
    if (tag === 'code') {
      const text = node.textContent || '';
      const fence = '`'.repeat(Math.max(1, ...Array.from(text.matchAll(/`+/g), m => m[0].length + 1)));
      return `${fence} ${text} ${fence}`;
    }
    if (tag === 'a') { const href = safeUrl(node.getAttribute('href')); return href ? `[${content.trim() || escape(href)}](<${href}>)` : content; }
    if (tag === 'img') return `[Image: ${escape(node.getAttribute('alt') || 'attachment')}; image content is not included]`;
    if (tag === 'blockquote') return '\n\n' + content.trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
    if (tag === 'li') {
      const ordered = node.parentElement?.tagName === 'OL';
      const index = Number(node.parentElement?.getAttribute('start') || 1) + Array.from(node.parentElement?.children || []).indexOf(node);
      return `\n${ordered ? index + '.' : '-'} ${content.trim().replace(/\n/g, '\n  ')}\n`;
    }
    if (['p', 'div', 'ul', 'ol', 'section', 'article'].includes(tag)) return `\n\n${content}\n\n`;
    return content;
  }
  return walk(root).replace(/\n[ \t]+\n/g, '\n\n').replace(/\n{3,}/g, '\n\n').trim().replace(new RegExp(marker + '(\\d+)END', 'g'), (_, index) => codeBlocks[Number(index)]!);
}

export function transcriptMarkdown(chat: Transcript): string {
  return `# ${escape(chat.title.replace(/\n/g, ' '))}\n\n- Source: ${chat.source}\n- Provider: ${chat.provider}\n- Exported: ${chat.exportedAt}\n${chat.partial ? '\n> Partial export: only loaded content, or a response still in progress. Earlier messages may be missing.\n' : ''}\n` +
    chat.messages.map((m, i) => `## ${i + 1}. ${m.role === 'user' ? 'You' : chat.provider}\n\n${m.markdown}\n`).join('\n---\n\n');
}

export function attachConversationExport(box: HTMLElement, context: ExportContext): () => void {
  let request: AbortController | null = null;
  let requestId = '';
  let alive = true;
  let exporting = false;
  const zh = () => context.language() === 'zh';
  const text = (en: string, cn: string) => zh() ? cn : en;
  const wrapper = document.createElement('div');
  wrapper.id = 'chatpick-export';
  const button = document.createElement('button');
  button.type = 'button'; button.id = 'chatpick-export-button';
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8M14 2v6h6l-6-6M20 8v4M12 17h10m-3-3 3 3-3 3'); svg.appendChild(path); button.appendChild(svg);
  const spinner = document.createElement('span'); spinner.className = 'cn-spinner'; spinner.setAttribute('aria-hidden', 'true'); button.appendChild(spinner);
  const buttonLabel = document.createElement('span'); button.appendChild(buttonLabel);
  const panel = document.createElement('div'); panel.id = 'chatpick-export-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog');
  const header = document.createElement('div'); header.className = 'chatpick-export-header';
  const heading = document.createElement('strong');
  const notice = document.createElement('p'); notice.id = 'chatpick-export-notice'; notice.hidden = true;
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const cancelHint = document.createElement('p'); cancelHint.id = 'chatpick-export-cancel-hint'; cancelHint.hidden = true;
  const options = document.createElement('div');
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.id = 'chatpick-export-close'; cancel.textContent = '×';
  const updateLabels = () => {
    const title = text('Export conversation', '导出会话'); button.dataset.tooltip = title; button.setAttribute('aria-label', title);
    buttonLabel.textContent = text('Export', '导出');
    heading.textContent = title; panel.setAttribute('aria-label', title);
    cancel.title = exporting ? text('Cancel export', '取消导出') : text('Close export menu', '关闭导出菜单'); cancel.setAttribute('aria-label', cancel.title);
    cancelHint.textContent = text('Closing this menu cancels the export.', '关闭此菜单将取消导出。');
  };
  const setExporting = (value: boolean) => {
    exporting = value; cancelHint.hidden = !value;
    button.toggleAttribute('data-busy', value); if (value) button.dataset.busy = 'true';
    button.setAttribute('aria-busy', String(value)); panel.setAttribute('aria-busy', String(value));
    updateLabels();
  };
  const positionPanel = () => {
    if (panel.hidden) return;
    const anchor = button.getBoundingClientRect(), rect = panel.getBoundingClientRect();
    panel.style.left = Math.max(12, anchor.left - rect.width - 10) + 'px';
    panel.style.top = Math.max(12, Math.min(anchor.top, innerHeight - rect.height - 12)) + 'px';
  };
  const partialNotice = () => text('Exports available content. Earlier messages may be missing, or a response may still be in progress.', '导出可用内容，可能缺少更早的消息，或回答仍在生成中。');
  const close = () => { request?.abort(); request = null; if (requestId) window.postMessage({ source: 'chatpick:page', type: 'export-cancel', id: requestId }, location.origin); requestId = ''; setExporting(false); panel.hidden = true; button.setAttribute('aria-expanded', 'false'); button.focus(); };
  cancel.onclick = close;
  async function run(format: 'markdown' | 'pdf') {
    request?.abort(); const controller = new AbortController(); request = controller;
    const id = context.conversationId(); if (!id) return;
    requestId = crypto.randomUUID(); options.querySelectorAll('button').forEach(b => b.disabled = true);
    setExporting(true);
    status.textContent = text('Reading conversation…', '正在读取会话…');
    positionPanel();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      let result: ReturnType<typeof historyTranscript> | null = null;
      if (['ChatGPT', 'Claude', 'DeepSeek'].includes(context.provider)) {
        try { result = historyTranscript(context.provider, await context.readHistory(id, controller.signal)); } catch { if (controller.signal.aborted) throw new Error('cancelled'); }
      }
      if (controller.signal.aborted || id !== context.conversationId() || !alive) return;
      const current = context.nodes();
      if (!result) result = { title: '', partial: true, messages: current.map(m => ({ id: m.id, role: m.role, markdown: m.roots.map(domMarkdown).filter(Boolean).join('\n\n') })).filter(m => m.markdown) };
      if (!result.messages.length) throw new Error('empty');
      // A streaming page remains explicitly partial even if its history response is older.
      if (document.querySelector('[data-is-streaming="true"], [data-testid="stop-button"], button[aria-label="Stop response"], button[aria-label="停止生成"]')) result.partial = true;
      const chat: Transcript = { ...result, title: result.title || document.title || context.provider + ' conversation', provider: context.provider, source: location.origin + location.pathname, exportedAt: new Date().toISOString() };
      const deliver = () => {
        if (controller.signal.aborted || id !== context.conversationId() || !alive) return;
        status.textContent = text('Preparing download…', '正在生成下载文件…');
        window.postMessage({ source: 'chatpick:page', type: 'export', id: requestId, format, chat }, location.origin);
      };
      notice.hidden = !chat.partial; notice.textContent = chat.partial ? partialNotice() : '';
      positionPanel(); deliver();
    } catch {
      if (alive && !panel.hidden) { setExporting(false); status.textContent = text('Unable to export. Please wait for the reply to finish and try again.', '无法导出，请等待回答完成后重试。'); options.querySelectorAll('button').forEach(b => b.disabled = false); positionPanel(); }
    } finally { clearTimeout(timer); }
  }
  for (const [format, label] of [['markdown', 'Markdown (.md)'], ['pdf', 'PDF (.pdf)']] as const) {
    const option = document.createElement('button'); option.type = 'button'; option.dataset.format = format; option.textContent = label; option.onclick = () => void run(format); context.buttonMotion?.(option); options.appendChild(option);
  }
  context.buttonMotion?.(button); context.buttonMotion?.(cancel);
  header.append(heading, cancel); panel.append(header, notice, options, status, cancelHint); wrapper.append(button, panel); box.insertBefore(wrapper, box.querySelector('#cgpt-btns'));
  button.onclick = () => {
    if (!panel.hidden) return close();
    updateLabels(); status.textContent = text('Choose a format to download.', '选择格式即可下载。');
    notice.hidden = ['ChatGPT', 'Claude', 'DeepSeek'].includes(context.provider); notice.textContent = notice.hidden ? '' : partialNotice();
    options.querySelectorAll('button').forEach(b => b.disabled = false);
    panel.hidden = false; positionPanel(); button.setAttribute('aria-expanded', 'true'); (options.firstElementChild as HTMLElement)?.focus();
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); e.stopPropagation(); close(); } };
  const onOutside = (e: PointerEvent) => { if (!panel.hidden && e.target instanceof Node && !wrapper.contains(e.target)) close(); };
  const onMessage = (e: MessageEvent) => {
    if (e.source !== window || e.data?.source !== 'chatpick:extension') return;
    if (e.data.type === 'settings') { updateLabels(); return; }
    if (e.data.type !== 'export-result' || e.data.id !== requestId || !alive || request?.signal.aborted) return;
    setExporting(false);
    status.textContent = e.data.ok ? text('Downloaded.', '已下载。') : text('Download failed. Please try again.', '下载失败，请重试。'); options.querySelectorAll('button').forEach(b => b.disabled = false); positionPanel();
  };
  document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onOutside); window.addEventListener('message', onMessage); updateLabels();
  window.addEventListener('resize', positionPanel);
  window.addEventListener('chatpick:language', updateLabels);
  return () => { alive = false; close(); wrapper.remove(); document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onOutside); window.removeEventListener('message', onMessage); window.removeEventListener('resize', positionPanel); window.removeEventListener('chatpick:language', updateLabels); };
}
