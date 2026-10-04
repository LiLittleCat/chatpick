# ChatPick homepage

The bilingual product website lives alongside the extension in this directory. It is a static site with a four-feature scrolling walkthrough using public promotional images, and privacy pages generated from the authoritative documents in `docs/`. It makes no analytics requests, uses no cookies or browser storage, and needs no account or backend.

```sh
pnpm build:website
pnpm preview:website
```

Open `http://127.0.0.1:4173/` to follow the browser's preferred language: Chinese (`zh`, including regional and script variants) selects Chinese; all other languages select English. The header language switch overrides this using `lang=en` or `lang=zh-CN` in the URL and preserves the theme. For explicit previews, use `http://127.0.0.1:4173/?lang=en` or `http://127.0.0.1:4173/zh-CN/?lang=zh-CN`. No cookies or browser storage are used. Stop the preview with Ctrl+C. If the port is occupied, set `CHATPICK_PREVIEW_PORT` to another port. Rebuild after editing the source, then refresh.

| Source | Responsibility |
| --- | --- |
| `content.mjs` | English/Chinese copy, feature images and supported websites |
| `template.mjs` | Semantic HTML and language/asset links |
| `stores.mjs` | Chrome, Firefox and Edge store listing URLs; leave empty until published |
| `assets/site.css` | Responsive layout and reduced-motion styles |
| `assets/site.js` | Theme switching, logo keyboard access and the scrolling feature walkthrough |
| `assets/language.js` | Browser language selection before rendering, with explicit URL overrides |
| `assets/providers/` | Bundled official provider logos; sources and ownership are recorded in its README |
| `../scripts/website.mjs` | Build to `.output/website/`, including the shared policies and public assets |
| `../scripts/website-preview.mjs` | Preview only the generated website on localhost |

The deployment target is Cloudflare Pages at `https://chatpick.yl.do`; it has not been published or verified yet. Deploy only `.output/website/`. Relative links work at a domain root or under a subdirectory. Set `CHATPICK_SITE_URL` during the build to generate canonical URLs, alternate-language metadata, a sitemap and robots.txt. Without it, no public URL is claimed.

For Cloudflare Pages, first commit and push the website sources and scripts. In **Workers & Pages → Create application → Pages → Connect to Git**, select `LiLittleCat/chatpick` and use these settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | Repository root (leave blank) |
| Build command | `pnpm build:website` |
| Build output directory | `.output/website` |
| `NODE_VERSION` | `24` |
| `PNPM_VERSION` | `12.6.0` |
| `CHATPICK_SITE_URL` | `https://chatpick.yl.do` |

After deployment, add `chatpick.yl.do` under the Pages project's **Custom domains → Set up a domain**. If `yl.do` is managed in the same Cloudflare account, confirm the generated DNS record. Otherwise add a `CNAME` for `chatpick` pointing to the actual project's `*.pages.dev` hostname. Associate the domain in Pages before creating a CNAME. Confirm the homepage, language switch, images and both privacy routes load over HTTPS before marking the site published.

References: [Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [build image](https://developers.cloudflare.com/pages/configuration/build-image/), [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).

Chrome, Firefox and Edge download buttons appear in the hero and closing section with locally bundled browser logos. Empty URLs render normal button placeholders with no navigation or release-status label. Fill the corresponding `url` in `stores.mjs` with its verified listing URL and rebuild to turn that button into a store link independently. Build-time overrides are also supported:

| Store | Environment variable | Listing URL |
| --- | --- | --- |
| Chrome | `CHATPICK_CHROME_STORE_URL` | `https://chromewebstore.google.com/detail/...` |
| Firefox | `CHATPICK_FIREFOX_STORE_URL` | `https://addons.mozilla.org/en-US/firefox/addon/...` |
| Edge | `CHATPICK_EDGE_STORE_URL` | `https://microsoftedge.microsoft.com/addons/detail/...` |

The existing `CHATPICK_STORE_URL` remains a fallback for Chrome. URLs must use HTTPS and the corresponding official store host and listing path. Do not fill a store URL before its listing and browser package have been verified.

The extension's `pnpm build` and `pnpm zip` remain separate. Homepage code and its images are not packaged into the extension. Do not add private conversations, credentials, analytics or external scripts to this website.

Appearance follows the operating system until the visitor switches it using the header control. An explicit choice is carried in the `theme=light` or `theme=dark` URL parameter, so switching languages and refreshing keep the chosen appearance without browser storage. Chinese headings wrap naturally at the available width; the English slogan keeps its deliberate line break. The logo strip pauses on hover and becomes a manually scrollable list for keyboard focus or reduced motion. All provider logos are bundled locally and retain their original artwork.

The hero leads directly into four feature sections, followed by supported chats, privacy, FAQ and downloads. Each feature's title and description sit above a full-width image from `docs/store-assets/en/` or `docs/store-assets/zh-CN/`. On large desktop viewports, a sticky stage switches the complete text-and-image scene while scrolling. Mobile, shorter viewports, reduced motion and browsers without JavaScript show every feature in normal document flow. A vertical scrollbar follows the walkthrough and can be dragged or controlled with the keyboard. Scrolling remains native; only deliberate scrollbar input changes the page position.
