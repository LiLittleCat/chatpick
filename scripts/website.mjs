import fs from 'node:fs';
import path from 'node:path';
import { renderHome } from '../website/template.mjs';
import { stores } from '../website/stores.mjs';
import './public-policy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.output/website');
const siteUrlInput = process.env.CHATPICK_SITE_URL;
const storeUrls = Object.fromEntries(stores.map(store => {
  const url = process.env[store.env] ?? (store.id === 'chrome' ? process.env.CHATPICK_STORE_URL : undefined) ?? store.url;
  if (url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== store.host || !store.path.test(parsed.pathname) || parsed.username || parsed.password) throw new Error(`${store.env} must be an official ${store.name} listing URL`);
  }
  return [store.id, url];
}));
let siteUrl;
if (siteUrlInput) {
  const parsed = new URL(siteUrlInput);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('CHATPICK_SITE_URL must be a public HTTPS site URL without credentials, query or fragment');
  siteUrl = parsed.href.replace(/\/?$/, '/');
}
fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
// Remove generated assets belonging to the retired standalone screenshot gallery.
fs.rmSync(path.join(output, 'assets/screenshots'), { recursive: true, force: true });
fs.copyFileSync(path.join(root, 'public/icon/logo.svg'), path.join(output, 'assets/logo.svg'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(output, 'assets/LICENSE.txt'));
for (const filename of ['site.css', 'site.js', 'language.js']) fs.copyFileSync(path.join(root, 'website/assets', filename), path.join(output, 'assets', filename));
fs.mkdirSync(path.join(output, 'assets/browsers'), { recursive: true });
for (const store of stores) fs.copyFileSync(path.join(root, 'website/assets/browsers', store.logo), path.join(output, 'assets/browsers', store.logo));
fs.mkdirSync(path.join(output, 'assets/providers'), { recursive: true });
for (const filename of fs.readdirSync(path.join(root, 'website/assets/providers'))) {
  if (/\.(svg|png)$/.test(filename)) fs.copyFileSync(path.join(root, 'website/assets/providers', filename), path.join(output, 'assets/providers', filename));
}
for (const locale of ['en', 'zh-CN']) {
  const directory = path.join(output, locale === 'en' ? '' : locale);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), renderHome(locale, { storeUrls, siteUrl }));
  fs.mkdirSync(path.join(output, 'assets', locale), { recursive: true });
  for (const filename of ['01-questions.png', '02-answer-sections.png', '04-export.png', '03-site-colors.png']) {
    fs.copyFileSync(path.join(root, 'docs/store-assets', locale, filename), path.join(output, 'assets', locale, filename));
  }
}
fs.cpSync(path.join(root, '.output/public-policy'), path.join(output, 'privacy'), { recursive: true });
// Add a route home without duplicating either authoritative policy document.
for (const zh of [false, true]) {
  const filename = path.join(output, 'privacy', zh ? 'zh-CN/index.html' : 'index.html');
  const html = fs.readFileSync(filename, 'utf8');
  const href = zh ? '../../zh-CN/' : '../';
  fs.writeFileSync(filename, html.replace('<div class="brand">', `<a class="brand" href="${href}" aria-label="${zh ? '返回 ChatPick' : 'Back to ChatPick'}">`).replace('ChatPick</div>', 'ChatPick</a>'));
}
fs.writeFileSync(path.join(output, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — ChatPick</title><h1>Page not found</h1><p>The page you are looking for is unavailable.</p><p>找不到这个页面。</p><p>Contact / 联系：<a href="mailto:hi@yl.do">hi@yl.do</a></p></html>');
if (siteUrl) {
  const routes = ['', 'zh-CN/', 'privacy/', 'privacy/zh-CN/'];
  fs.writeFileSync(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(route => `<url><loc>${new URL(route, siteUrl).href.replaceAll('&', '&amp;')}</loc></url>`).join('')}</urlset>`);
  fs.writeFileSync(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml', siteUrl).href}\n`);
} else {
  for (const filename of ['sitemap.xml', 'robots.txt']) fs.rmSync(path.join(output, filename), { force: true });
}
console.log('Built English/Chinese homepages and privacy policies in .output/website (not yet published)');
