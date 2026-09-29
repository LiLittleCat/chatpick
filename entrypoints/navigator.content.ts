import { startNavigator } from '../navigator';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_idle',
  world: 'MAIN',
  main() {
    startNavigator();
  },
});
