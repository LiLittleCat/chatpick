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
| `lib/web-chat-adapters.ts` | Gemini, Grok, Perplexity and Qwen DOM selectors, saved-chat routes, message identity and color tokens |
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
| `pnpm test:claude` | Claude active branches, virtual lists, and answer sections |
| `pnpm test:deepseek` | DeepSeek navigation, virtual lists, and fallback |
| `pnpm test:routes` | Conversation scope, SPA transitions, and request cancellation |
| `pnpm test:colors` | Settings persistence, site theme changes, appearance overrides, and fallback |
| `pnpm test:brand-colors` | Provider-specific brand highlights |
| `pnpm test:web-chats` | Four new providers: identity, headings, streaming, site colors, sparse DOM, excluded paths and SPA lifecycle |
| `pnpm test:perplexity` | Answer-only virtual windows, question remounting, conversation reset, and accurate jumps |

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

Gemini, Grok, Perplexity, and Qwen read rendered messages rather than requesting private history APIs. Observed questions and headings stay in page memory as virtualized messages unmount, and reset on conversation changes. On these sites, scrolling through a long conversation adds previously unloaded messages to the directory. Preserve Perplexity's workflow placeholder order when constructing virtual-list fixtures. Gemini fixtures must enforce Trusted Types; navigation must not write HTML strings.
