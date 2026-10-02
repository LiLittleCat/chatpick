import { DEFAULT_SETTINGS, normalizeSettings, resolveLanguage, type NavigatorSettings } from '../settings';
import { downloadTranscript, validateTranscript } from '../lib/export-files';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://chat.deepseek.com/*', 'https://gemini.google.com/*', 'https://grok.com/*', 'https://www.perplexity.ai/*', 'https://chat.qwen.ai/*'],
  runAt: 'document_idle',
  main() {
    let exportRequest: { id: string; source: string; controller: AbortController } | null = null;
    let exportGesture: { source: string; expires: number } | null = null;
    document.addEventListener('click', event => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      if (event.target.closest('#chatpick-export-panel button[data-format]')) {
        exportGesture = { source: location.origin + location.pathname, expires: Date.now() + 60000 };
      }
    }, true);
    const cancelExport = () => { exportRequest?.controller.abort(); exportRequest = null; exportGesture = null; };
    const checkExportRoute = () => {
      if (exportRequest && exportRequest.source !== location.origin + location.pathname) cancelExport();
    };
    (window as Window & { navigation?: EventTarget }).navigation?.addEventListener('currententrychange', checkExportRoute);
    window.addEventListener('popstate', checkExportRoute);
    setInterval(checkExportRoute, 1000);
    let settings = DEFAULT_SETTINGS;
    const sendSettings = () => window.postMessage({
      source: 'chatpick:extension',
      type: 'settings',
      settings,
    }, location.origin);

    const applySettings = (next: Partial<NavigatorSettings>) => {
      settings = normalizeSettings(next);
      if (!settings.showExport) cancelExport();
      sendSettings();
    };

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'chatpick:page') return;
      const message = event.data;
      if (message.type === 'export-cancel') {
        exportGesture = null;
        if (message.id === exportRequest?.id) cancelExport();
        return;
      }
      if (message.type === 'export') {
        if (!settings.showExport || !exportGesture || exportGesture.expires < Date.now() || exportGesture.source !== location.origin + location.pathname || !document.getElementById('chatpick-export-panel') || !['markdown', 'pdf'].includes(message.format) || typeof message.id !== 'string' || message.id.length > 64) return;
        exportGesture = null;
        if (!validateTranscript(message.chat)) {
          window.postMessage({ source: 'chatpick:extension', type: 'export-result', id: message.id, ok: false }, location.origin);
          return;
        }
        exportRequest?.controller.abort();
        const controller = new AbortController();
        exportRequest = { id: message.id, source: message.chat.source, controller };
        downloadTranscript(message.chat, message.format, controller.signal).then(() => {
          if (!controller.signal.aborted) window.postMessage({ source: 'chatpick:extension', type: 'export-result', id: message.id, ok: true }, location.origin);
        }).catch(() => {
          if (!controller.signal.aborted) window.postMessage({ source: 'chatpick:extension', type: 'export-result', id: message.id, ok: false }, location.origin);
        }).finally(() => { if (exportRequest?.controller === controller) exportRequest = null; });
        return;
      }
      if (event.source === window && event.data?.source === 'chatpick:page' && event.data?.type === 'ready') {
        sendSettings();
      }
    });
    browser.runtime.onMessage.addListener((message) => {
      if (message?.type === 'chatpick:get-theme') {
        return Promise.resolve(document.getElementById('cgpt-nav-box')?.getAttribute('data-theme') ?? null);
      }
      if (message?.type === 'chatpick:get-language') {
        return Promise.resolve(resolveLanguage('auto', document.documentElement.lang, navigator.language));
      }
    });

    browser.storage.local.get(DEFAULT_SETTINGS).then(applySettings).catch(console.error);
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const next = { ...settings };
      if (changes.theme) next.theme = changes.theme.newValue as NavigatorSettings['theme'];
      if (changes.language) next.language = changes.language.newValue as NavigatorSettings['language'];
      if (changes.colors) next.colors = changes.colors.newValue as NavigatorSettings['colors'];
      if (changes.showExport) next.showExport = changes.showExport.newValue as NavigatorSettings['showExport'];
      if (changes.showJumpButtons) next.showJumpButtons = changes.showJumpButtons.newValue as NavigatorSettings['showJumpButtons'];
      applySettings(next);
    });
  },
});
