import { DEFAULT_SETTINGS, normalizeSettings, type NavigatorSettings } from '../settings';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
  runAt: 'document_idle',
  main() {
    let settings = DEFAULT_SETTINGS;
    const sendSettings = () => window.postMessage({
      source: 'chatpick:extension',
      type: 'settings',
      settings,
    }, location.origin);

    const applySettings = (next: Partial<NavigatorSettings>) => {
      settings = normalizeSettings(next);
      sendSettings();
    };

    window.addEventListener('message', (event) => {
      if (event.source === window && event.data?.source === 'chatpick:page' && event.data?.type === 'ready') {
        sendSettings();
      }
    });
    browser.runtime.onMessage.addListener((message) => {
      if (message?.type === 'chatpick:get-theme') {
        return Promise.resolve(document.getElementById('cgpt-nav-box')?.getAttribute('data-theme') ?? null);
      }
    });

    browser.storage.local.get(DEFAULT_SETTINGS).then(applySettings).catch(console.error);
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const next = { ...settings };
      if (changes.theme) next.theme = changes.theme.newValue as NavigatorSettings['theme'];
      if (changes.language) next.language = changes.language.newValue as NavigatorSettings['language'];
      applySettings(next);
    });
  },
});
