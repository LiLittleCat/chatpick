# ChatPick homepage

The bilingual product website lives alongside the extension in this directory. It is a static site with a four-feature carousel using public promotional images, and privacy pages generated from the authoritative documents in `docs/`. It makes no analytics requests, uses no cookies or browser storage, and needs no account or backend.

```sh
pnpm build:website
pnpm preview:website
pnpm test:website
```

Open `http://127.0.0.1:4173/` to follow the browser's preferred language: Chinese (`zh`, including regional and script variants) selects Chinese; all other languages select English. The header language switch overrides this using `lang=en` or `lang=zh-CN` in the URL and preserves the theme. For explicit previews, use `http://127.0.0.1:4173/?lang=en` or `http://127.0.0.1:4173/zh-CN/?lang=zh-CN`. No cookies or browser storage are used. Stop the preview with Ctrl+C. If the port is occupied, set `CHATPICK_PREVIEW_PORT` to another port. Rebuild after editing the source, then refresh.

| Source | Responsibility |
| --- | --- |
| `content.mjs` | English/Chinese copy, feature images and supported websites |
| `template.mjs` | Semantic HTML and language/asset links |
| `stores.mjs` | Chrome and Firefox store listing URLs; leave empty until published |
| `assets/site.css` | Responsive layout and reduced-motion styles |
| `assets/site.js` | Theme switching, logo keyboard access and feature carousel playback |
| `assets/language.js` | Theme and browser language selection before rendering, with explicit URL overrides |
| `assets/providers/` | Bundled official provider logos; sources and ownership are recorded in its README |
| `images.mjs` | Capture dimensions and responsive image candidates |
| `assets/captures/` | Native 2× website screenshots of the production extension with synthetic conversations |
| `assets/previews/` | Lossless WebP feature images in responsive sizes |
| `../scripts/website.mjs` | Build to `.output/website/`, including the shared policies and public assets |
| `../scripts/website-preview.mjs` | Preview only the generated website on localhost |
| `../scripts/website-captures.mjs` | Capture the eight localized website screenshots in a disposable browser profile |
| `../scripts/website-assets.mjs` | Generate optimized images from the website captures and original logos |
| `../scripts/website-lighthouse.mjs` | Audit both languages with mobile and desktop Lighthouse presets |

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

Chrome and Firefox download buttons appear in the hero and closing section with locally bundled browser logos. Edge publication is paused, so its download button is omitted. Empty URLs render normal button placeholders with no navigation or release-status label. Fill the corresponding `url` in `stores.mjs` with its verified listing URL and rebuild to turn that button into a store link independently. Build-time overrides are also supported:

| Store | Environment variable | Listing URL |
| --- | --- | --- |
| Chrome | `CHATPICK_CHROME_STORE_URL` | `https://chromewebstore.google.com/detail/...` |
| Firefox | `CHATPICK_FIREFOX_STORE_URL` | `https://addons.mozilla.org/en-US/firefox/addon/...` |

The existing `CHATPICK_STORE_URL` remains a fallback for Chrome. URLs must use HTTPS and the corresponding official store host and listing path. Do not fill a store URL before its listing and browser package have been verified.

The extension's `pnpm build` and `pnpm zip` remain separate. Homepage code and its images are not packaged into the extension. Do not add private conversations, credentials, analytics or external scripts to this website.

Appearance follows the operating system until the visitor switches it using the header control. An explicit choice is carried in the `theme=light` or `theme=dark` URL parameter, so switching languages and refreshing keep the chosen appearance without browser storage. Chinese headings wrap naturally at the available width; the English slogan keeps its deliberate line break. The logo strip pauses on hover and becomes a manually scrollable list for keyboard focus or reduced motion. All provider logos are bundled locally and retain their original artwork.

The hero leads into a four-feature carousel, followed by supported chats, privacy, FAQ and downloads. Each feature’s title and description sit above a full-width website screenshot. These use the built production extension with synthetic provider pages and public example conversations; the provider page layouts are simplified fixtures. Website captures are independent of the store promotional cards and contain no private chats or account details. Only one feature appears at a time in the same fixed stage; the page does not contain long scroll placeholders. Visible carousels advance every six seconds and show elapsed progress on four vertical segments. Hover, keyboard focus, leaving the viewport and hidden tabs pause playback. The playback button provides an explicit pause, and reduced motion defaults to manual playback with no transitions. Visitors can click the vertical segments, use the wheel or arrow keys, or swipe horizontally on touchscreens. Wheel switches have a fixed short cooldown to absorb inertia without blocking continuous scrolling. At the first or last feature, outward scrolling moves the page after that cooldown. Scrolling outside the feature stage moves the page normally. Without JavaScript, all four features remain readable in document flow.

## Performance and audits

The build minifies CSS and JavaScript with esbuild and gives them content-based filenames. It inlines the small theme/language bootstrap before the stylesheet, with its exact SHA-256 hash allowed by the Content Security Policy. This preserves the chosen theme and the initial carousel layout on first paint without an extra blocking script request. Feature images use lazy loading, explicit dimensions and responsive WebP sources; original promotional images and logo artwork remain available as source assets. Cloudflare Pages receives security and asset-cache headers through the generated `_headers` file. The local preview supports Brotli and gzip compression.

Website screenshots are captured at a 1132×610 CSS viewport with device scale factor 2, producing native 2264×1220 PNGs. They are not enlarged store images. To refresh them after changing the extension UI, install Playwright and Sharp outside the repository and run:

```sh
npm install --prefix /tmp/chatpick-website-tools playwright sharp
/tmp/chatpick-website-tools/node_modules/.bin/playwright install chromium
pnpm build
CHATPICK_PLAYWRIGHT_MODULE=/tmp/chatpick-website-tools/node_modules/playwright node scripts/website-captures.mjs
CHATPICK_SHARP_MODULE=/tmp/chatpick-website-tools/node_modules/sharp node scripts/website-assets.mjs
pnpm build:website
```

The capture script blocks external network requests, checks question counts, highlighted identity, headings, export formats and provider colors, and removes its temporary browser profile. Its assertions and capture dimensions are recorded in `.output/website-captures/summary.json`. Inspect both languages before accepting new images. The store generator shares the provider fixtures but keeps its existing composition and dimensions.

`website-assets.mjs` generates 640, 768, 1132 and 2264px-wide lossless WebP files directly from each native PNG. Browser `srcset` selection follows the rendered width and pixel density: a Retina desktop can load the full-resolution image, while mobile screens receive the appropriate smaller version. The full-resolution WebP preserves the source pixels; smaller variants are resampled. The normal website build uses these checked-in derivatives and needs neither Playwright nor Sharp. Capture PNGs are kept as source material and are not copied into the deployed website.

To audit a running preview with Lighthouse:

```sh
npm install --prefix /tmp/chatpick-website-tools lighthouse
CHATPICK_SITE_URL=https://chatpick.yl.do pnpm build:website
pnpm preview:website
# In a second terminal:
CHATPICK_LIGHTHOUSE_BIN=/tmp/chatpick-website-tools/node_modules/.bin/lighthouse pnpm audit:website
```

Set `CHROME_PATH` if Lighthouse cannot discover Chrome. The runner audits English/light and Chinese/dark with the standard mobile preset, followed by English/dark and Chinese/light with the desktop preset. Each run checks performance, accessibility, best practices and SEO. HTML and JSON reports, including the Lighthouse version, warnings and measured metrics, are written to `.output/lighthouse/`; `summary.json` records all four runs. Audits run sequentially to avoid competing for CPU. Keep the preview running and avoid rebuilding during an audit.

`CHATPICK_AUDIT_URL` selects another HTTP or HTTPS base URL, including a deployment under a subdirectory. Local scores do not verify the unpublished production site; rerun against the actual HTTPS domain after deployment. Machine load, browser version and network conditions affect performance scores. Generated reports stay untracked.
