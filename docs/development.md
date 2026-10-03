# Development guide

ChatPick uses WXT, React, TypeScript, and Motion. Install Node.js 22.12+ and pnpm, then run `pnpm install`.

## Commands

```sh
pnpm dev        # WXT development mode
pnpm compile    # TypeScript checks
pnpm build      # Chrome Manifest V3 production build
pnpm zip        # Build and package into .output/
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome. Firefox commands are available in `package.json`; browser regression coverage currently targets Chromium.

## Source responsibilities

| Source | Responsibility |
| --- | --- |
| `navigator.js` | Shared navigation, existing provider history readers, active branches, question/section location, route lifecycle, and site colors |
| `entrypoints/navigator.content.ts` | Start navigation in the page MAIN world |
| `entrypoints/content.ts` | Bridge validated extension settings from the isolated world |
| `lib/web-chat-adapters.ts` | Gemini, Grok, Perplexity, Qwen and Qianwen DOM selectors, saved-chat routes, message identity and color tokens |
| `lib/conversation-export.ts` | Full transcript extraction, branch selection, DOM-to-Markdown conversion, export menu and cancellation |
| `lib/pdf-font.ts` | Adapt the current browser fontkit subset encoder to pdf-lib |
| `lib/export-files.ts` | Local Markdown downloads and searchable, paginated PDF rendering with bundled fonts |
| `lib/navigation-motion.ts` | Navigator animation and reduced-motion handling |
| `entrypoints/popup/` | React settings interface |
| `entrypoints/privacy/` | Packaged policy page, rendered from the English and Chinese policy documents |
| `settings.ts` | Defaults, types, and validation |

The privacy page imports `docs/privacy-policy.md` and `docs/privacy-policy.zh-CN.md` at build time. Keep translations aligned when policy wording changes. Its URL is local to the extension; Chrome Web Store submission still needs a publicly accessible policy URL.

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
| ChatGPT | `/c/:id`, `/g/g-…/c/:id` | Home, project/GPT entry, settings, `/share/:id` |
| Claude | `/chat/:id` | `/new`, `/projects`, `/project/:id`, shared links |
| DeepSeek | `/a/chat/s/:id` | Home, `/a/chat`, settings |
| Gemini | `/app/:16-hex-id` | `/app`, `/search`, `/library`, `/students`, notebooks, shared links |
| Grok | `/c/:uuid` | `/imagine`, agents, `/library`, `/automations`, shared links |
| Perplexity | `/search/:uuid`, saved search slugs with a UUID or 22-character identifier | `/search`, `/library`, `/projects`, `/computer/*`, `/page/*`, `/s/*`, settings |
| Qwen | `/c/:uuid` | Home, `/projects`, `/community`, `/coder`, settings, shared links |
| Qianwen | `/chat/:32-hex-id` on `www.qianwen.com` and `qianwen.com` | Home, chat entry, settings, shared links and other detail paths |

Gemini, Grok, Perplexity, Qwen, and Qianwen read rendered messages rather than requesting private history APIs. Observed questions and headings stay in page memory as virtualized messages unmount, and reset on conversation changes. On these sites, scrolling through a long conversation adds previously unloaded messages to the directory. Preserve Perplexity's workflow placeholder order when constructing virtual-list fixtures. Gemini fixtures must enforce Trusted Types; navigation must not write HTML strings.

## Conversation exports

The MAIN-world history reader is shared by navigation and export. A fresh export snapshot contains full user/final-assistant text rather than navigation summaries. DOM-only providers and API failures export currently rendered content with an explicit partial warning in the menu and file; choosing a format downloads directly without a second confirmation. No completeness claim is made for virtualized history. Non-text attachments are labeled and not fetched. A validated, user-initiated bridge passes transient transcript data to the isolated script. It generates files locally without storage or downloads permissions, and aborts on cancellation or route changes. PDF uses pdf-lib, fontkit and marked, with a bundled Noto Sans SC font and glyph subsetting. Unsupported glyphs use an explicit Unicode-codepoint label; formulas retain their source notation. License notices are packaged in `public/THIRD-PARTY-NOTICES.txt` and `public/fonts/OFL.txt`.

Font subsetting uses fontkit 2 with a streaming-interface adapter; older fontkit versions corrupted CJK glyphs in rendered PDFs. Validate generated files visually as well as by extracting text. The bundled static TrueType font was instantiated at weight 400; its source, license and checksum are in `public/fonts/README.txt`.
