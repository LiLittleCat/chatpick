// Resolve appearance, language and the initial carousel layout before styled paint.
(() => {
  const url = new URL(window.location.href);
  const requestedTheme = url.searchParams.get('theme');
  const theme = requestedTheme === 'dark' || requestedTheme === 'light'
    ? requestedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.carousel = 'true';
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#141715' : '#fafbfa';
  const requested = url.searchParams.get('lang');
  const browserLanguage = navigator.languages?.[0] || navigator.language || 'en';
  const preferred = requested === 'en' || requested === 'zh-CN'
    ? requested
    : /^zh(?:[-_]|$)/i.test(browserLanguage) ? 'zh-CN' : 'en';
  if (document.documentElement.lang === preferred) return;
  const base = new URL(document.currentScript.dataset.base, url);
  const destination = new URL(preferred === 'zh-CN' ? 'zh-CN/' : './', base);
  destination.search = url.search;
  destination.hash = url.hash;
  window.location.replace(destination.href);
})();
