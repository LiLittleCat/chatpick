# Chrome Web Store images

Prepared on 2026-10-03 from ChatPick 0.1.0. [Preview all images](index.html).

## Upload files

| Asset | File | Size |
| --- | --- | --- |
| Small promotional tile | [promo-small.png](promo-small.png) | 440 × 280 |
| Optional marquee | [promo-marquee.png](promo-marquee.png) | 1400 × 560 |
| English screenshots | `en/01-questions.png` through `en/05-settings.png` | 1280 × 800 each |
| Simplified Chinese screenshots | `zh-CN/01-questions.png` through `zh-CN/05-settings.png` | 1280 × 800 each |

Upload the five English screenshots to the English listing and the five Chinese screenshots to the Simplified Chinese listing. The small tile uses only the ChatPick brand name and graphics; it can be shared between locales. The optional marquee has English text. These images are prepared locally; they have not been uploaded or approved by the store.

Screenshot order: question navigation, answer headings, site colors and dark appearance, Markdown/PDF export, and settings.

## Content and privacy

All conversation text was written specifically for these materials. A disposable Chromium profile loads the actual production extension against mocked provider pages. The navigation panels, export menu, and settings are real extension UI. Provider page layouts are simplified demo fixtures, not screenshots of signed-in accounts. No real chats, accounts, credentials, browsing history, or private conversation URLs are used.

The images reuse the project's existing logo. All PNGs have opaque backgrounds. The dimensions follow the [official Chrome Web Store image requirements](https://developer.chrome.com/docs/webstore/images).

## Regenerate

Use the external Playwright installation described in [the development guide](../development.md), then run from the repository root:

```sh
pnpm build
node scripts/store-assets.mjs
```

If Playwright is installed outside the project's module resolution path, set `CHATPICK_PLAYWRIGHT_MODULE` to its module directory. The generator blocks external HTTP requests and removes the temporary browser profile when it finishes. It checks question counts, answer headings, current-question highlighting, provider accent colors, export format choices, and browser errors. Inspect the resulting images before uploading after a UI change.
