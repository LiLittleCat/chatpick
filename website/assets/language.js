// Select the page before rendering its content; explicit language links take priority.
(() => {
  const url = new URL(window.location.href);
  const requested = url.searchParams.get('lang');
  const browserLanguage = navigator.languages?.[0] || navigator.language || 'en';
  const preferred = requested === 'en' || requested === 'zh-CN'
    ? requested
    : /^zh(?:[-_]|$)/i.test(browserLanguage) ? 'zh-CN' : 'en';
  if (document.documentElement.lang === preferred) return;
  const base = new URL('../', document.currentScript.src);
  const destination = new URL(preferred === 'zh-CN' ? 'zh-CN/' : './', base);
  destination.search = url.search;
  destination.hash = url.hash;
  window.location.replace(destination.href);
})();
