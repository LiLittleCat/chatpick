import { attachConversationExport } from '../lib/conversation-export';
import { startNavigator } from '../navigator';
import { createNavigationMotion } from '../lib/navigation-motion';
import { createWebChatAdapter } from '../lib/web-chat-adapters';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://chat.deepseek.com/*', 'https://gemini.google.com/*', 'https://grok.com/*', 'https://www.perplexity.ai/*', 'https://chat.qwen.ai/*', 'https://www.qianwen.com/*', 'https://qianwen.com/*'],
  runAt: 'document_idle',
  world: 'MAIN',
  main() {
    // Wait for persisted settings before reading any conversation or credentials.
    const initialize = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'chatpick:extension' || event.data?.type !== 'settings') return;
      window.removeEventListener('message', initialize);
      startNavigator(createNavigationMotion(), createWebChatAdapter(), attachConversationExport, event.data.settings);
    };
    window.addEventListener('message', initialize);
    window.postMessage({ source: 'chatpick:page', type: 'ready' }, location.origin);
  },
});
