import { copy, providers } from './content.mjs';
import { stores } from './stores.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const chevron = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const sun = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>';
const moon = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/></svg>';
const star = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/></svg>';

export function renderHome(locale, { storeUrls = {}, siteUrl } = {}) {
  const t = copy[locale];
  const zh = locale === 'zh-CN';
  const base = zh ? '../' : './';
  const policy = `${base}privacy/${zh ? 'zh-CN/' : ''}`;
  const languageLink = zh ? '../?lang=en' : './zh-CN/?lang=zh-CN';
  const imageLanguage = zh ? 'zh-CN' : 'en';
  const brand = `<a class="brand" href="${base}" aria-label="ChatPick"><img src="${base}assets/logo.svg" width="36" height="36" alt="">ChatPick</a>`;
  const storeLinks = `<div class="store-links" role="group" aria-label="${zh ? '从浏览器商店下载' : 'Download from a browser store'}">${stores.map(store => {
    const url = storeUrls[store.id];
    const label = `<img src="${base}assets/browsers/${store.logo}" width="24" height="24" alt=""><span>${t.storeAdd} ${store.browser}</span>`;
    return url
      ? `<a class="store-button" data-store="${store.id}" href="${escape(url)}">${label}</a>`
      : `<button class="store-button" data-store="${store.id}" type="button">${label}</button>`;
  }).join('')}</div>`;
  const metadata = siteUrl ? `<link rel="canonical" href="${escape(new URL(zh ? 'zh-CN/' : '', siteUrl).href)}"><meta property="og:url" content="${escape(new URL(zh ? 'zh-CN/' : '', siteUrl).href)}"><meta property="og:image" content="${escape(new URL(`assets/${imageLanguage}/01-questions.png`, siteUrl).href)}"><link rel="alternate" hreflang="en" href="${escape(siteUrl)}"><link rel="alternate" hreflang="zh-CN" href="${escape(new URL('zh-CN/', siteUrl).href)}"><link rel="alternate" hreflang="x-default" href="${escape(siteUrl)}">` : '';
  const logos = duplicate => providers.map(([name, url, en, cn, light, dark]) => {
    const image = `<span class="provider-logo"><img${dark ? ' class="logo-light"' : ''} src="${base}assets/providers/${light}" width="40" height="40" alt="">${dark ? `<img class="logo-dark" src="${base}assets/providers/${dark}" width="40" height="40" alt="">` : ''}</span><span>${name === 'Qianwen' && zh ? '千问' : name}</span>`;
    return `<a href="${url}" class="provider"${duplicate ? ' tabindex="-1"' : ''} title="${escape(zh ? cn : en)}">${image}</a>`;
  }).join('');

  const features = t.features.map(([title, text, filename, alt], i) => `<li class="feature-step" id="feature-${i + 1}" data-feature="${i}">
    <div class="feature-copy"><h3>${title}</h3><p>${text}</p></div>
    <figure class="feature-shot"><img src="${base}assets/${imageLanguage}/${filename}" width="1280" height="800" alt="${escape(alt)}" loading="lazy"></figure>
  </li>`).join('');

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="${escape(t.description)}"><meta name="theme-color" content="#fafbfa">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
  <script src="${base}assets/language.js"></script>
  <title>${escape(t.title)}</title><meta property="og:type" content="website"><meta property="og:title" content="${escape(t.title)}"><meta property="og:description" content="${escape(t.description)}">
  ${metadata}<link rel="icon" href="${base}assets/logo.svg" type="image/svg+xml"><link rel="stylesheet" href="${base}assets/site.css"><script src="${base}assets/site.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">${t.skip}</a>
  <header class="site-header wrap">
    ${brand}
    <nav aria-label="${zh ? '主导航' : 'Main navigation'}"><a href="#features">${t.nav[0]}</a><a href="#chats">${t.nav[1]}</a><a href="${policy}">${t.nav[2]}</a></nav>
    <div class="header-controls"><a class="language" href="${languageLink}" lang="${zh ? 'en' : 'zh-CN'}" aria-label="${zh ? 'Switch to English' : '切换到中文'}">${t.language}</a><button class="theme-toggle" type="button" aria-label="${t.themeDark}" aria-pressed="false" data-light-label="${t.themeLight}" data-dark-label="${t.themeDark}"><span data-theme-icon="light" hidden>${sun}</span><span data-theme-icon="dark">${moon}</span></button><a class="github-star" href="https://github.com/LiLittleCat/chatpick" target="_blank" rel="noopener noreferrer" aria-label="Star on GitHub" title="Star on GitHub">${star}<span class="github-label">Star on GitHub</span><span class="github-compact" aria-hidden="true">Star</span></a></div>
  </header>
  <main id="main">
    <section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-introduction">
        <h1 id="hero-title">${zh ? t.headline.join('') : `${t.headline[0]} <br>${t.headline[1]}`}</h1>
        <div class="hero-copy"><p class="hero-intro">${t.intro}</p><div class="hero-actions">${storeLinks}</div></div>
      </div>
    </section>
    <section class="features wrap" id="features" aria-labelledby="features-title">
      <h2 id="features-title">${t.featuresTitle}</h2><div class="feature-story"><div class="feature-progress"><input class="feature-scrollbar" type="range" min="0" max="100" step="1" value="0" aria-label="${zh ? '功能介绍滚动条' : 'Feature walkthrough scrollbar'}" aria-controls="feature-steps"></div><ul class="feature-steps" id="feature-steps">${features}</ul><div class="feature-stage" aria-label="${zh ? '当前功能展示' : 'Current feature preview'}"></div></div>
    </section>
    <section class="sites" id="chats" aria-labelledby="sites-title">
      <div class="sites-heading"><h2 id="sites-title">${t.sitesTitle}</h2></div>
      <div class="provider-marquee"><div class="provider-viewport"><div class="provider-track"><div class="provider-group">${logos(false)}</div><div class="provider-group" aria-hidden="true">${logos(true)}</div></div></div></div>
    </section>
    <section class="privacy wrap" id="privacy" aria-labelledby="privacy-title">
      <div class="privacy-copy"><h2 id="privacy-title">${t.privacyTitle}</h2><p>${t.privacyIntro}</p><a href="${policy}" class="text-link">${t.privacyLink}</a></div>
      <ul class="privacy-points">${t.privacyPoints.map(point => `<li>${point}</li>`).join('')}</ul>
    </section>
    <section class="faq wrap" aria-labelledby="faq-title">
      <h2 id="faq-title">${t.faqTitle}</h2>
      <div class="faq-list">${t.faq.map(([question, answer]) => `<details><summary>${escape(question)}${chevron}</summary><p>${escape(answer).replace('hi@yl.do', '<a href="mailto:hi@yl.do">hi@yl.do</a>')}</p></details>`).join('')}</div>
    </section>
    <section class="closing wrap" id="downloads" aria-labelledby="download-title">
      <div><h2 id="download-title">${t.closing}</h2><p>${t.storeChoose}</p></div>
      ${storeLinks}
    </section>
  </main>
  <footer class="site-footer wrap"><div>${brand}<p>${t.footer}</p></div><div class="footer-links"><a href="${policy}">${t.footerPrivacy}</a><a href="mailto:hi@yl.do">${t.footerContact}</a><a href="${base}assets/LICENSE.txt">MIT</a></div><p class="independent">${t.independent}</p></footer>
</body>
</html>`;
}
