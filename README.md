# Chatpick

Chatpick migrates the ChatGPT question navigator userscript to a Chrome extension. On ChatGPT it keeps the original question list, jump navigation, four buttons, scroll highlighting, theme-aware colors, and DOM fallback when the conversation API is unavailable. Click the extension icon to set the theme and language; English is the default. The settings popup uses BeUI's motion Select component (MIT license in `public/licenses/beui.txt`).

## Test locally

```sh
pnpm install
pnpm build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `.output/chrome-mv3` directory. Disable the original Tampermonkey script to avoid two navigators on the same page. Open or reload a conversation at `https://chatgpt.com/`, try the right-hand navigation, then click the Chatpick toolbar icon to change theme and language. Changes apply to the open page without a reload.

The extension only injects into `chatgpt.com` and `chat.openai.com` and requests the `storage` permission for its settings. It uses ChatGPT's session and conversation endpoints from the page context, just as the userscript does; if the endpoint fails, it falls back to merging visible messages from the page.

For development, run `pnpm dev`. Type-check with `pnpm compile`.
