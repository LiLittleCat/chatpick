type ColorKey = 'bg' | 'fg' | 'muted' | 'border' | 'track' | 'hover' | 'active';

export type WebChatAdapter = {
  name: string;
  conversationId: () => string | null;
  users: () => HTMLElement[];
  answers: () => HTMLElement[];
  messageId: (node: Element) => string;
  text: (node: Element) => string;
  userRoots: (node: Element) => Element[];
  answerRoots: (node: Element) => Element[];
  // Null means the DOM has no stable absolute ordinal across virtual windows.
  order: (node: Element) => number | null;
  colorTokens: Record<ColorKey, string[]>;
  accent: (dark: boolean) => string;
};

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const qianwen = {
  name: 'Qianwen', route: /^\/chat\/([0-9a-f]{32})\/?$/i,
  user: '.message-list-content-container .chat-round[data-chat] .chat-question-wrap',
  answer: '.message-list-content-container .chat-round[data-chat] .chat-answers-card-wrap[data-chat-answers-wrap]',
  content: '.question-text-card', answerContent: '.answer-common-card .qk-markdown',
  colors: {
    bg: ['--ty-background-pop', '--ty-background-base'], fg: ['--ty-text-primary'],
    muted: ['--ty-text-secondary'], border: ['--color-border-default'],
    track: ['--color-border-muted'], hover: ['--ty-background-option'],
    active: ['--ty-theme-primary', '--color-primary'],
  }, accent: (dark: boolean) => dark ? '#679efe' : '#0044ff',
};

// Exact saved-chat routes deliberately exclude entry, sharing, settings, and project pages.
const configurations = {
  'www.qianwen.com': qianwen,
  'qianwen.com': qianwen,
  'gemini.google.com': {
    name: 'Gemini', route: /^\/app\/([0-9a-f]{16})\/?$/i,
    user: 'user-query', answer: 'model-response',
    content: '.query-text-line', answerContent: 'message-content .markdown',
    colors: {
      bg: ['--gem-sys-color--surface-container'], fg: ['--gem-sys-color--on-surface'],
      muted: ['--gem-sys-color--on-surface-variant'], border: ['--gem-sys-color--surface-variant'],
      track: ['--gem-sys-color--surface-container-highest'], hover: ['--gem-sys-color--surface-container-high'],
      active: ['--gem-sys-color--primary', '--gem-sys-color--brand-blue'],
    }, accent: (dark: boolean) => dark ? '#a8c7fa' : '#0b57d0',
  },
  'grok.com': {
    name: 'Grok', route: new RegExp(`^/c/(${uuid})/?$`, 'i'),
    user: '[id^="response-"] [data-testid="user-message"]',
    answer: '[id^="response-"] [data-testid="assistant-message"]',
    content: '.relative', answerContent: '.response-content-markdown',
    colors: {
      bg: ['--surface-elevated', '--surface-l2'], fg: ['--fg-primary'], muted: ['--muted-foreground'],
      border: ['--border-l1'], track: ['--border-l2'], hover: ['--surface-l2-active'], active: ['--primary'],
    }, accent: (dark: boolean) => dark ? '#fcfcfc' : '#171717',
  },
  'www.perplexity.ai': {
    name: 'Perplexity', route: new RegExp(`^/search/((?:[a-z0-9_-]+-)?${uuid}|[a-z0-9_-]+-[a-z0-9_.~]{22})/?$`, 'i'),
    user: '[data-workflow-entry] [class~="group/user-bubble"]',
    answer: '[data-workflow-final-text]', content: '[data-renderer]', answerContent: '[data-renderer]',
    colors: {
      bg: ['--surface-raised', '--surface-base'], fg: ['--fg-primary'], muted: ['--fg-secondary', '--fg-tertiary'],
      border: ['--border-soft'], track: ['--border-medium'], hover: ['--surface-subtle', '--surface-underlay'],
      active: ['--accent-fg-primary', '--accent-bg-strong'],
    }, accent: (dark: boolean) => dark ? '#4e99a3' : '#20808d',
  },
  'chat.qwen.ai': {
    name: 'Qwen', route: new RegExp(`^/c/(${uuid})/?$`, 'i'),
    user: '.qwen-chat-message-user .chat-user-message-container',
    answer: '.qwen-chat-message-assistant .chat-response-message',
    content: '.user-message-content', answerContent: '.phase-answer .qwen-markdown',
    colors: {
      bg: ['--container-primary-fill', '--background-primary'], fg: ['--text-primary', '--character-primary-text'],
      muted: ['--text-secondary', '--character-secondary-text'], border: ['--line-border', '--line-secondary-border'],
      track: ['--line-primary-border'], hover: ['--background-option'], active: ['--character-brandprimary-text', '--text-theme'],
    }, accent: (dark: boolean) => dark ? '#3b6fff' : '#426eff',
  },
};

export function createWebChatAdapter(): WebChatAdapter | null {
  const config = configurations[location.hostname as keyof typeof configurations];
  if (!config) return null;
  const name = config.name.toLowerCase();
  const conversationId = () => location.pathname.match(config.route)?.[1] || null;
  const nodeIds = new WeakMap<Element, number>();
  let nextNodeId = 0;
  const query = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
    .filter(node => !node.closest('nav, aside, header, footer, form, [role="dialog"], #cgpt-nav-box'))
    .filter(node => name !== 'qianwen' || !!node.getClientRects().length && !node.closest('[hidden], [aria-hidden="true"]'));

  function partition(node: Element): Element | null {
    // Perplexity keeps empty placeholders for unmounted workflow partitions.
    let current: Element | null = node;
    while (current?.parentElement) {
      const parent: HTMLElement = current.parentElement;
      if (parent.classList.contains('gap-2') && current.classList.contains('w-full') &&
        Array.from(parent.children).every(child => child.classList.contains('w-full'))) return current;
      current = parent;
    }
    return null;
  }

  function order(node: Element): number | null {
    if (name === 'qianwen') {
      const position = node.closest('.chat-round')?.getAttribute('data-chat-pos');
      if (position && /^\d+$/.test(position)) return Number(position) * 2 + (node.matches(config.answer) ? 1 : 0);
    }
    if (name === 'grok') {
      const row = node.closest<HTMLElement>('[data-plane-row]');
      const match = row?.style.transform.match(/translateY\(([-\d.]+)px\)/);
      if (match) return Number(match[1]);
    }
    if (name === 'perplexity') {
      const slot = partition(node);
      if (slot?.parentElement) return Array.from(slot.parentElement.children).indexOf(slot);
      const entry = node.closest('[data-workflow-entry]')?.getAttribute('data-workflow-entry');
      if (entry !== undefined && entry !== null) return Number(entry);
    }
    return null;
  }

  function messageId(node: Element): string {
    const role = node.matches(config.user) ? 'user' : 'assistant';
    let id: string | null | undefined;
    if (name === 'gemini') id = node.closest('.conversation-container[id]')?.id;
    if (name === 'grok') id = node.closest('[id^="response-"]')?.id;
    if (name === 'qwen') id = node.getAttribute('data-msg-id') || node.id || node.querySelector('[data-msg-id]')?.getAttribute('data-msg-id');
    if (name === 'qianwen') {
      id = node.closest('.chat-round')?.getAttribute('data-chat');
      if (id && role === 'assistant') id += ':' + (node.getAttribute('data-offset') || '0');
    }
    if (name === 'perplexity') {
      const slot = partition(node);
      const index = slot?.parentElement ? Array.from(slot.parentElement.children).indexOf(slot) : null;
      id = index !== null ? 'partition-' + index : node.closest('[data-workflow-entry]')?.getAttribute('data-workflow-entry');
    }
    if (!id) {
      if (!nodeIds.has(node)) nodeIds.set(node, ++nextNodeId);
      id = 'node-' + nodeIds.get(node);
    }
    // Qwen/Grok/Gemini IDs survive remounts; partition IDs are scoped to a conversation.
    return `${name}:${name === 'perplexity' || name === 'qianwen' ? conversationId() + ':' : ''}${id}:${role}`;
  }

  return {
    name: config.name, conversationId,
    users: () => query(config.user).filter(node => name !== 'qwen' || !node.dataset.chatId || node.dataset.chatId === conversationId()),
    answers: () => query(config.answer), messageId, order,
    text: node => {
      const parts = Array.from(node.querySelectorAll(config.content));
      const roots = parts.filter(part => !parts.some(other => other !== part && other.contains(part)));
      return roots.map(part => part.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
    },
    userRoots: node => Array.from(node.querySelectorAll(name === 'qianwen' ? '.message-card-wrap.question' : config.content)),
    answerRoots: node => Array.from(node.querySelectorAll(config.answerContent)),
    colorTokens: config.colors, accent: config.accent,
  };
}
