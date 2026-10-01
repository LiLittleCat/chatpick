import { startNavigator } from '../navigator';
import { createNavigationMotion } from '../lib/navigation-motion';
import { createWebChatAdapter } from '../lib/web-chat-adapters';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://chat.deepseek.com/*', 'https://gemini.google.com/*', 'https://grok.com/*', 'https://www.perplexity.ai/*', 'https://chat.qwen.ai/*'],
  runAt: 'document_idle',
  world: 'MAIN',
  main() {
    startNavigator(createNavigationMotion(), createWebChatAdapter());
  },
});
