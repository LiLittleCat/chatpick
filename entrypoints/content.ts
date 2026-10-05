import { DEFAULT_SETTINGS, isSiteEnabled, normalizeSettings, resolveLanguage, siteForHost, type NavigatorSettings } from '../settings';
import { downloadTranscript, validateTranscript } from '../lib/export-files';

export default defineContentScript({
  matches: ['https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*', 'https://chat.deepseek.com/*', 'https://gemini.google.com/*', 'https://grok.com/*', 'https://www.perplexity.ai/*', 'https://chat.qwen.ai/*', 'https://www.qianwen.com/*', 'https://qianwen.com/*'],
  runAt: 'document_idle',
  main() {
    const site = siteForHost(location.hostname);
    let settings = DEFAULT_SETTINGS;
    let settingsLoaded = false;
    let exportRequest: { id: string; source: string; controller: AbortController } | null = null;
    let exportGesture: { source: string; expires: number } | null = null;
    document.addEventListener('click', event => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      if (isSiteEnabled(settings, site) && event.target.closest('#chatpick-export-panel button[data-format]')) {
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
    const sendSettings = () => {
      if (!settingsLoaded) return;
      const { disabledSites: _disabledSites, ...preferences } = settings;
      window.postMessage({
        source: 'chatpick:extension', type: 'settings',
        settings: { ...preferences, enabled: isSiteEnabled(settings, site) },
      }, location.origin);
    };

    const applySettings = (next: Partial<NavigatorSettings>) => {
      settings = normalizeSettings(next);
      settingsLoaded = true;
      if (!settings.showExport || !isSiteEnabled(settings, site)) cancelExport();
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
        if (!isSiteEnabled(settings, site) || !settings.showExport || !exportGesture || exportGesture.expires < Date.now() || exportGesture.source !== location.origin + location.pathname || !document.getElementById('chatpick-export-panel') || !['markdown', 'pdf'].includes(message.format) || typeof message.id !== 'string' || message.id.length > 64) return;
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
    // Synchronous callbacks also work before Chromium supported Promise replies.
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'chatpick:get-site') sendResponse(site);
      if (message?.type === 'chatpick:get-theme') {
        sendResponse(document.getElementById('cgpt-nav-box')?.getAttribute('data-theme') ?? null);
      }
      if (message?.type === 'chatpick:get-language') {
        sendResponse(resolveLanguage('auto', document.documentElement.lang, navigator.language));
      }
    });

    browser.storage.local.get(DEFAULT_SETTINGS).then(applySettings).catch(() => applySettings(DEFAULT_SETTINGS));
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const next = { ...settings };
      if (changes.theme) next.theme = changes.theme.newValue as NavigatorSettings['theme'];
      if (changes.language) next.language = changes.language.newValue as NavigatorSettings['language'];
      if (changes.colors) next.colors = changes.colors.newValue as NavigatorSettings['colors'];
      if (changes.position) next.position = changes.position.newValue as NavigatorSettings['position'];
      if (changes.showExport) next.showExport = changes.showExport.newValue as NavigatorSettings['showExport'];
      if (changes.showJumpButtons) next.showJumpButtons = changes.showJumpButtons.newValue as NavigatorSettings['showJumpButtons'];
      if (changes.disabledSites) next.disabledSites = changes.disabledSites.newValue as NavigatorSettings['disabledSites'];
      applySettings(next);
    });
  },
});
