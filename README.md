# ChatPick

[简体中文](README.zh-CN.md)

Navigate long ChatGPT, Claude, DeepSeek, Gemini, Grok, Perplexity, and Qwen conversations by question and answer section.

ChatPick is a Chrome extension that puts a question directory beside your chat. Find an earlier question, revisit a section of an answer, or move straight to the beginning or end of a conversation.

## Features

- **Question navigation** — Browse your questions and jump to the one you need, even when the same question appears more than once.
- **Answer sections** — Hover a question to see its answer's headings, then select a section to jump to it.
- **Quick controls** — Go to the start, previous question, next question, or bottom. The directory highlights your position as you scroll.
- **Colors that fit your chat** — Follow the website's appearance, with highlights that match each website, or choose ChatPick's default colors.
- **Comfortable motion** — Subtle interface animations respect your reduced-motion preference. Content jumps remain instant.
- **English and Chinese** — Change the interface language from the settings panel.

## Supported chats

| Website | Conversations |
| --- | --- |
| ChatGPT | Regular chats, project chats, and custom GPT chats |
| Claude | Regular chats and chats within projects |
| DeepSeek | Saved chats |
| Gemini | Saved chats |
| Grok | Saved chats |
| Perplexity | Saved search conversations |
| Qwen | Saved chats, including chats within projects |

Navigation appears on conversation pages. Home pages, project overviews, settings, and shared links are excluded. Answers without headings do not have a section menu. If some history is unavailable, the directory may show only messages already loaded on the page.

## Install locally

With Node.js 22.12+ and pnpm installed, run these commands in the project directory:

```sh
pnpm install
pnpm build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `.output/chrome-mv3`.
3. Open or reload a supported chat and use the navigator on the right.
4. Select the ChatPick toolbar icon to open settings.

If you used an earlier navigation userscript, disable it before installing ChatPick. A Chrome Web Store installation link will be added after publication.

## Settings

| Setting | Options | Default |
| --- | --- | --- |
| Appearance | Follow chat appearance, Light, Dark | Follow chat appearance |
| Colors | Follow chat colors, ChatPick default | Follow chat colors |
| Language | English, 中文 | English |

Changes apply immediately to open chats. Appearance and colors can be chosen independently. Open **Privacy policy** at the bottom of the settings panel to read the policy in English or Chinese.

## Privacy

ChatPick reads your current conversation using your existing sign-in to provide navigation. Chat content is processed in your browser and is not sent to the developer. Only appearance, language, and color preferences are saved in extension storage. There are no ads or analytics, and ChatPick does not send, edit, or delete chat messages.

Read the [privacy policy](docs/privacy-policy.md) for data handling details. For privacy questions or support, contact [hi@yl.do](mailto:hi@yl.do).

## Development

For setup, source organization, and browser regression checks, see the [development guide](docs/development.md). Coding agents should also read [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE) — Copyright © 2026 Yi Liu. Third-party dependencies retain their own licenses.

ChatPick is an independent project and is not affiliated with the supported AI providers.
