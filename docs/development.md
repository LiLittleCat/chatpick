# Development guide

ChatPick uses WXT, React, TypeScript, and Motion. Install Node.js 22.12+ and pnpm, then run `pnpm install`.

## Commands

```sh
pnpm dev        # WXT development mode
pnpm compile    # TypeScript checks
pnpm build      # Chrome Manifest V3 production build
pnpm zip        # Build and package into .output/
pnpm build:policy # Standalone public policy pages in .output/public-policy/
pnpm build:website # Bilingual product website in .output/website/
pnpm preview:website # Local website preview at http://127.0.0.1:4173/
pnpm test:website # Website theme and carousel checks
pnpm audit:website # Lighthouse against a running website preview
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome. Firefox commands are available in `package.json`; browser regression coverage currently targets Chromium.

## GitHub builds

The [Build Chrome extension workflow](../.github/workflows/build.yml) runs on pushes to `main`, pull requests targeting `main`, and manual runs. It uses Node.js 24 and pnpm 12.6.0, installs the frozen lockfile, checks TypeScript, and runs `pnpm zip`, which performs the production build before packaging. It verifies the ZIP's root manifest, version, English/Chinese metadata, bundled PDF resources, and license notices before uploading it.

Open the repository's **Actions → Build Chrome extension**, select a successful run, and download `chatpick-<version>-chrome.zip` from **Artifacts**. The artifact is the extension ZIP itself, ready to upload to the Chrome Web Store or extract for local installation. Artifacts are retained for 30 days. The workflow builds the package; run the relevant browser regression suites separately before release.

## Product website

The homepage source lives in [website/](../website/README.md), separately from extension entrypoints. Run `pnpm build:website` and `pnpm preview:website` to preview the homepage. The default entry follows the browser language (Chinese or English fallback); use `/?lang=en` and `/zh-CN/?lang=zh-CN` for explicit language previews. Privacy policies are generated from the existing documents and linked under `/privacy/` and `/privacy/zh-CN/`. The website uses four feature sections with public promotional assets, with no analytics, remote scripts or visitor storage. It is currently local only; Cloudflare Pages at `chatpick.yl.do` is the chosen deployment target, while publication and Chrome, Firefox and Edge store links remain pending. Store URLs are configured independently in [website/stores.mjs](../website/stores.mjs); empty URLs render button placeholders with browser logos and no navigation.

The website build generates only `.output/website/`; `pnpm build` and `pnpm zip` build the extension separately. Public URLs and installation calls to action are configurable at website build time after their destinations have been verified. CSS and JavaScript are minified. Website feature screenshots are captured independently from the store cards at native 2× resolution, then encoded as responsive lossless WebP variants. Run `pnpm test:website` after changing theme initialization or carousel behavior. `pnpm audit:website` requires a separate Lighthouse installation and a running preview; it writes four mobile/desktop and English/Chinese reports to `.output/lighthouse/`. See [website instructions](../website/README.md) for image regeneration, audit setup and deployment details.

## Source responsibilities

| Source | Responsibility |
| --- | --- |
| `navigator.js` | Shared navigation, existing provider history readers, active branches, question/section location, route lifecycle, and site colors |
| `entrypoints/navigator.content.ts` | Start navigation in the page MAIN world |
| `entrypoints/content.ts` | Bridge validated extension settings from the isolated world |
| `lib/web-chat-adapters.ts` | ChatGPT Dots, Gemini, Grok, Perplexity, Qwen and Qianwen DOM selectors, saved-chat routes, message identity and color tokens |
| `lib/conversation-export.ts` | Full transcript extraction, branch selection, DOM-to-Markdown conversion, export menu and cancellation |
| `lib/pdf-font.ts` | Adapt the current browser fontkit subset encoder to pdf-lib |
| `lib/export-files.ts` | Validate transcripts, download Markdown, and load the bundled PDF module only after choosing PDF |
| `lib/export-pdf.ts`, `entrypoints/pdf-export.ts` | Searchable, paginated PDF rendering, built as a self-contained ES module for isolated-world loading |
| `lib/navigation-motion.ts` | Navigator animation and reduced-motion handling |
| `entrypoints/popup/` | React settings interface |
| `entrypoints/privacy/` | Packaged policy page, rendered from the English and Chinese policy documents |
| `settings.ts` | Defaults, types, and validation |

The privacy page imports `docs/privacy-policy.md` and `docs/privacy-policy.zh-CN.md` at build time. Keep translations aligned when policy wording changes. Its URL is local to the extension; Chrome Web Store submission still needs a publicly accessible policy URL. `pnpm build:policy` renders the same documents as script-free English and Chinese HTML pages; deploy only `.output/public-policy/`, then verify the public URL before filling the dashboard.

WXT content scripts normally bundle dynamic imports into their IIFE. The `pdf-export` entrypoint uses a targeted Vite hook to emit a self-contained ES module. The isolated script imports its fixed extension URL only for PDF exports; its WAR match scope is the same supported hosts as the font. Navigation and Markdown exports never load either resource.

## Extension metadata languages

Chrome localizes the extension name and short description through `public/_locales/en/messages.json` and `public/_locales/zh_CN/messages.json`. WXT copies these files into the ZIP's `_locales/` directory. The manifest uses `__MSG_extensionName__` and `__MSG_extensionDescription__`, with `default_locale: 'en'`; Chrome resolves messages through its native `i18n` system and falls back to English for unsupported browser UI locales. Keep the English description aligned with `package.json` and both descriptions aligned with the READMEs and store copy.

Navigation and settings labels continue to use the existing page-language/manual-language preference, which can differ from Chrome's UI language. Native `getMessage()` selects the browser locale and cannot select an arbitrary chat-page language. Store long descriptions and localized screenshots are entered separately in the developer dashboard after uploading the localized ZIP; see [Chrome Web Store preparation](chrome-web-store.md).

## Browser regression checks

Tests use Playwright and synthetic provider pages without real accounts. Playwright is not a project dependency; install it separately if needed:

```sh
npm install --prefix /tmp/chatpick-browser-tests playwright
/tmp/chatpick-browser-tests/node_modules/.bin/playwright install chromium
export CHATPICK_PLAYWRIGHT_MODULE=/tmp/chatpick-browser-tests/node_modules/playwright
pnpm build
```

For an existing installation, point `CHATPICK_PLAYWRIGHT_MODULE` to that module directory.

| Command | Coverage |
| --- | --- |
| `CHATPICK_BUILT=1 pnpm test:navigation` | ChatGPT question identity, repeated questions, headings, streaming, and DOM fallback |
| `pnpm test:question-links` | Markdown link labels, URL underlines, literal code, safe text, repeated labels and unchanged question jumps; API/DOM fallback and Trusted Types |
| `pnpm test:new-questions` | New sends on all eight providers, disjoint virtual windows, delayed visibility, in-flight reconciliation, stale snapshots and API failure |
| `pnpm test:question-classification` | All eight providers: assistant-only windows, loading shells, new sends and every transient directory state; history and DOM fallback |
| `pnpm test:claude` | Claude active branches, virtual lists, and answer sections |
| `pnpm test:deepseek` | DeepSeek navigation, virtual lists, and fallback |
| `pnpm test:sites` | Actual extension/popup: per-provider enablement, shared host aliases, persisted opt-out before history reads, SPA transitions, cancellation, and original DeepSeek navigation restoration |
| `pnpm test:routes` | Conversation scope, SPA transitions, and request cancellation |
| `pnpm test:dots` | Actual extension: Dots identity, new sends, multiple replies, headings, theme, exports, enablement and switching to regular ChatGPT chats |
| `pnpm test:short-answers` | Short reply tails: bottom highlight, clamped selections, Prev/Next, manual scrolling, nested/reversed scroll containers and conversations that fit on one screen |
| `pnpm test:gemini-routes` | Gemini ordinary and account-indexed routes, SPA entry/exit, and excluded paths |
| `pnpm test:colors` | Settings persistence, automatic interface language, independent control visibility switches, site theme changes, appearance overrides, and fallback |
| `pnpm test:brand-colors` | Provider-specific brand highlights |
| `pnpm test:web-chats` | DOM providers: identity, headings, streaming, site colors, sparse DOM, excluded paths and SPA lifecycle |
| `pnpm test:export` | One-click Markdown/PDF downloads, full text, active branches, partial notices, cancellation, CJK and Trusted Types |
| `pnpm test:layout` | Compact question/section lists, viewport height limits, and keyboard scrolling |
| `pnpm test:motion` | Answer panel enter/exit, interrupted closing, reduced motion, accessibility and route cleanup |
| `pnpm test:perplexity` | Answer-only virtual windows, question remounting, conversation reset, and accurate jumps |

Standalone MAIN-world suites supply the initial settings through `tests/navigator-fixture.mjs`, replacing the isolated script bridge omitted by those fixtures. Full-extension site/export suites use the real bridge. Production startup waits for stored settings so a disabled website never starts conversation reads.

All suites except `test:navigation` read production output. The navigation suite can also run the source directly; use `CHATPICK_BUILT=1` for production checks. Select the suites relevant to the change, as described in [AGENTS.md](../AGENTS.md).

Use synthetic conversations in issue reports and public screenshots. Keep private chats, account identifiers, and credentials out of logs, fixtures, and release materials.

## Conversation routes

The pathname must match a saved-chat detail route; query strings and fragments do not change activation. Additional path segments are excluded.

| Provider | Enabled pathname | Excluded examples |
| --- | --- | --- |
| ChatGPT | `/c/:id`, `/g/g-…/c/:id`, `/dots/:uuid` | Home, project/GPT entry, settings, `/share/:id` |
| Claude | `/chat/:id` | `/new`, `/projects`, `/project/:id`, shared links |
| DeepSeek | `/a/chat/s/:id` | Home, `/a/chat`, settings |
| Gemini | `/app/:16-hex-id`, `/u/:account-number/app/:16-hex-id` | Home/new-chat entry (including `/u/:account-number/app`), settings, `/search`, `/library`, `/students`, notebooks, shared links |
| Grok | `/c/:uuid` | `/imagine`, agents, `/library`, `/automations`, shared links |
| Perplexity | `/search/:uuid`, saved search slugs with a UUID or 22-character identifier | `/search`, `/library`, `/projects`, `/computer/*`, `/page/*`, `/s/*`, settings |
| Qwen | `/c/:uuid` | Home, `/projects`, `/community`, `/coder`, settings, shared links |
| Qianwen | `/chat/:32-hex-id` on `www.qianwen.com` and `qianwen.com` | Home, chat entry, settings, shared links and other detail paths |

ChatGPT Dots, Gemini, Grok, Perplexity, Qwen, and Qianwen read rendered messages rather than requesting private history APIs. Observed questions and headings stay in page memory as virtualized messages unmount, and reset on conversation changes. On these sites, scrolling through a long conversation adds previously unloaded messages to the directory. Preserve Perplexity's workflow placeholder order when constructing virtual-list fixtures. Gemini fixtures must enforce Trusted Types; navigation must not write HTML strings.

## Conversation exports

The MAIN-world history reader is shared by navigation and export. A fresh export snapshot contains full user/final-assistant text rather than navigation summaries. DOM-only providers and API failures export currently rendered content with an explicit partial warning in the menu and file; choosing a format downloads directly without a second confirmation. No completeness claim is made for virtualized history. Non-text attachments are labeled and not fetched. A validated, user-initiated bridge passes transient transcript data to the isolated script. It generates files locally without storage or downloads permissions, and aborts on cancellation or route changes. PDF uses pdf-lib, fontkit and marked, loaded on demand with a bundled Noto Sans SC font and glyph subsetting. Unsupported glyphs use an explicit Unicode-codepoint label; formulas retain their source notation. License notices are packaged in `public/THIRD-PARTY-NOTICES.txt` and `public/fonts/OFL.txt`.

Font subsetting uses fontkit 2 with a streaming-interface adapter; older fontkit versions corrupted CJK glyphs in rendered PDFs. Validate generated files visually as well as by extracting text. The bundled static TrueType font was instantiated at weight 400; its source, license and checksum are in `public/fonts/README.txt`.
