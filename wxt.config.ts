import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extensionName__',
    short_name: 'ChatPick',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: ['storage'],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none';" },
    web_accessible_resources: [{
      resources: ['fonts/NotoSansSC-Regular.ttf', 'pdf-export.js'],
      matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://chat.deepseek.com/*', 'https://gemini.google.com/*', 'https://grok.com/*', 'https://www.perplexity.ai/*', 'https://chat.qwen.ai/*', 'https://www.qianwen.com/*', 'https://qianwen.com/*'],
    }],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'chatpick@yl.do',
          strict_min_version: '140.0',
          // Existing provider credentials, session headers and current-chat
          // identifiers are used only for same-origin, read-only history requests.
          data_collection_permissions: {
            required: ['authenticationInfo', 'browsingActivity', 'websiteContent'],
          },
        },
        gecko_android: { strict_min_version: '142.0' },
      },
    } : {}),
  }),
  zip: {
    sourcesTemplate: '{{name}}-{{packageVersion}}-{{browser}}-sources{{modeSuffix}}.zip',
    includeSources: [
      'entrypoints/**', 'lib/**', 'public/**',
      'navigator.js', 'navigator.d.ts', 'settings.ts', 'wxt.config.ts', 'tsconfig.json',
      'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'LICENSE',
      'README.md', 'README.zh-CN.md', 'docs/development.md',
      'docs/privacy-policy.md', 'docs/privacy-policy.zh-CN.md',
      'docs/browser-distribution.md', 'scripts/verify-packages.mjs',
    ],
  },
  hooks: {
    'vite:build:extendConfig'(entrypoints, config) {
      if (entrypoints.length === 1 && entrypoints[0]?.name === 'pdf-export' && config.build?.lib) {
        config.build.lib.formats = ['es'];
      }
    },
  },
  vite: () => ({ plugins: [tailwindcss()] }),
});
