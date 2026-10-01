import { startNavigator } from '../navigator';
import { createNavigationMotion } from '../lib/navigation-motion';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://chat.deepseek.com/*'],
  runAt: 'document_idle',
  world: 'MAIN',
  main() {
    startNavigator(createNavigationMotion());
  },
});
