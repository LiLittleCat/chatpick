// Exercise the parser-blocking homepage bootstrap before the body or deferred UI exists.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderHome } from '../website/template.mjs';

const bootstrap = fs.readFileSync(new URL('../website/assets/language.js', import.meta.url), 'utf8');
let cases = 0;
for (const locale of ['en', 'zh-CN']) {
  for (const systemDark of [false, true]) {
    for (const requested of ['dark', 'light', '', 'invalid']) {
      const page = new URL(locale === 'en' ? '/' : '/zh-CN/', 'https://chatpick.yl.do');
      page.searchParams.set('lang', locale);
      if (requested) page.searchParams.set('theme', requested);
      const root = { lang: locale, dataset: {} };
      const meta = { content: '#fafbfa' };
      vm.runInNewContext(bootstrap, {
        URL,
        window: { location: { href: page.href, replace() { assert.fail('Explicit language must stay on this page'); } }, matchMedia: () => ({ matches: systemDark }) },
        navigator: { languages: [locale] },
        document: { documentElement: root, currentScript: { dataset: { base: locale === 'en' ? './' : '../' } }, querySelector: () => meta },
      });
      const expected = requested === 'dark' || requested === 'light' ? requested : systemDark ? 'dark' : 'light';
      assert.equal(root.dataset.theme, expected, `${locale}, ${requested || 'automatic'}, OS dark=${systemDark}: theme must be ready before deferred UI`);
      assert.equal(root.dataset.carousel, 'true', 'The first carousel layout must be ready before deferred UI');
      assert.equal(meta.content, expected === 'dark' ? '#141715' : '#fafbfa');
      cases++;
    }
  }
  const html = renderHome(locale);
  assert.ok(html.indexOf('assets/language.js') < html.indexOf('rel="stylesheet"'), 'Bootstrap must run before first styled paint');
  assert.ok(!/<script[^>]*assets\/language\.js[^>]*(?:defer|async)/.test(html));
  assert.ok(!/data-theme-icon="[^"]+" hidden/.test(html), 'Initial icon visibility must follow the resolved theme rather than hardcoded HTML');
  assert.equal((html.match(/class="feature-step is-active"/g) || []).length, 1, 'Exactly the first feature must be selected in initial markup');
}

// Production uses an inline script, so language routing must not depend on script.src.
// Exercise generated markup at a domain root and a deployment under a subdirectory.
let languageCases = 0;
for (const prefix of ['/', '/product/']) {
  for (const locale of ['en', 'zh-CN']) {
    for (const inline of [false, true]) {
      const html = renderHome(locale, inline ? { bootstrap } : {});
      const scriptTag = html.match(/<script data-base="([^"]+)"(?: src="([^"]+)")?>([\s\S]*?)<\/script>/);
      assert.ok(scriptTag, 'Both script forms must declare the homepage base');
      if (inline) {
        const digest = createHash('sha256').update(scriptTag[3]).digest('base64');
        assert.ok(html.includes(`'sha256-${digest}'`), 'CSP must allow exactly the inline bootstrap');
      }
      for (const [browserLanguage, explicit, expected] of [
        ['zh-TW', '', 'zh-CN'], ['zh-Hans', '', 'zh-CN'], ['fr-FR', '', 'en'],
        ['en-US', 'zh-CN', 'zh-CN'], ['zh-CN', 'en', 'en'],
      ]) {
        const page = new URL(`${prefix}${locale === 'zh-CN' ? 'zh-CN/' : ''}`, 'https://chatpick.yl.do');
        page.searchParams.set('theme', 'dark');
        if (explicit) page.searchParams.set('lang', explicit);
        page.hash = 'privacy';
        let redirect;
        vm.runInNewContext(inline ? scriptTag[3] : bootstrap, {
          URL,
          window: { location: { href: page.href, replace(value) { redirect = value; } }, matchMedia: () => ({ matches: false }) },
          navigator: { languages: [browserLanguage] },
          document: { documentElement: { lang: locale, dataset: {} }, currentScript: { src: inline ? '' : new URL(scriptTag[2], page).href, dataset: { base: scriptTag[1] } }, querySelector: () => ({ content: '' }) },
        });
        if (locale === expected) assert.equal(redirect, undefined);
        else {
          const destination = new URL(`${prefix}${expected === 'zh-CN' ? 'zh-CN/' : ''}`, page);
          destination.search = page.search;
          destination.hash = page.hash;
          assert.equal(redirect, destination.href, 'Redirect must retain the deployment prefix, appearance and section');
        }
        languageCases++;
      }
    }
  }
}
console.log(`Passed ${cases} pre-render theme cases, ${languageCases} language routing cases and both localized templates`);
