# ChatPick

ChatPick migrates the ChatGPT question navigator userscript to a Chrome extension. On ChatGPT it keeps the original question list, jump navigation, four buttons, scroll highlighting, theme-aware colors, and DOM fallback when the conversation API is unavailable. Click the extension icon to set the theme and language; English is the default. The settings popup uses BeUI's motion Select component (MIT license in `public/licenses/beui.txt`).

## Test locally

```sh
pnpm install
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `.output/chrome-mv3` directory. Disable the original Tampermonkey script to avoid two navigators on the same page. Open or reload a conversation at `https://chatgpt.com/`, try the right-hand navigation, then click the ChatPick toolbar icon to change theme and language. Changes apply to the open page without a reload.

Questions with answer sections show a small left chevron (`<`) at the end of the row, matching the row's text color. Hover a question to open its answer's section list beside the navigator. Only actual H1–H6 headings become section links, with indentation for nested levels. Bold prose and list items are excluded; answers without headings do not show a section list. Click a section to jump to it immediately when it is already rendered; navigation uses instant scrolling, with content-driven waits when older messages need to load. The list follows streamed updates and shares the navigator's theme. For older answers that are not rendered yet, section links come from the conversation API; clicking one locates its question and waits briefly for the answer to render. If the section cannot be matched, the navigator reports that instead of scrolling down through the conversation. When the API is unavailable, sections are available for rendered answers and those already discovered from the page.

The extension only injects into `chatgpt.com` and `chat.openai.com` and requests the `storage` permission for its settings. It uses ChatGPT's session and conversation endpoints from the page context, just as the userscript does; if the endpoint fails, it falls back to merging visible messages from the page.

For development, run `pnpm dev`. Type-check with `pnpm compile`.

Browser regression coverage for question/section identity is in `tests/navigation.browser.mjs`. With Playwright and its Chromium browser available, run `pnpm test:navigation`; set `CHATPICK_PLAYWRIGHT_MODULE` to an existing Playwright module path if it is installed outside this project. Set `CHATPICK_BUILT=1` to exercise the production content script after building.

For rendered answers, section links use the page's actual headings so Markdown escapes and updated titles do not leave unclickable API entries. API sections remain available for answers that have not rendered yet. Clicking questions or sections keeps both navigation panels open, so you can select another section immediately. They close after the pointer leaves both panels; moving between the panels or onto their padding does not close them. Keyboard focus and Escape remain supported. The navigator recognizes both `data-message-role` elements and the newer search-unit containers with `data-chatgpt-selection-message-id`, including separate thinking and final-answer messages.
