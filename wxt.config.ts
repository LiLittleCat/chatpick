import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ChatPick',
    description: 'Navigate AI conversations by question and answer section.',
    permissions: ['storage'],
    web_accessible_resources: [{
      resources: ['fonts/NotoSansSC-Regular.ttf'],
      matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://chat.deepseek.com/*', 'https://gemini.google.com/*', 'https://grok.com/*', 'https://www.perplexity.ai/*', 'https://chat.qwen.ai/*', 'https://www.qianwen.com/*', 'https://qianwen.com/*'],
    }],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
