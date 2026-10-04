# Chrome Web Store images

Prepared on 2026-10-04 from ChatPick 0.1.0. [Preview all images](index.html).

## Upload files

| Asset | File | Size |
| --- | --- | --- |
| Small promotional tile | [promo-small.png](promo-small.png) | 440 × 280 |
| Optional marquee | [promo-marquee.png](promo-marquee.png) | 1400 × 560 |
| English store screenshots | `screenshots/en/01-questions.png`, `screenshots/en/02-export.png` | 1280 × 800 each |
| Chinese conversation store screenshots | `screenshots/zh-CN/01-questions.png`, `screenshots/zh-CN/02-export.png` | 1280 × 800 each |
| English feature cards | `en/01-questions.png` through `en/05-settings.png` | 1280 × 800 each |
| Chinese feature cards | `zh-CN/01-questions.png` through `zh-CN/05-settings.png` | 1280 × 800 each |

Use the full-bleed `screenshots/` set as the core store screenshots. The existing five-card sets remain marketing/README materials. Live captures preserve the actual English website and control labels; the Chinese set has newly authored Chinese conversation content. Fully localized Chinese controls are shown in the Chinese feature cards. The small tile uses only the ChatPick brand name and graphics; it can be shared between locales. The optional marquee has English text. These images are prepared locally; they have not been uploaded or approved by the store.

Screenshot order: question navigation, answer headings, site colors and dark appearance, Markdown/PDF export, and settings.

## Content and privacy

All conversation text was written specifically for these materials. The `screenshots/` set shows real ChatGPT pages with new public demo chats. Browser chrome is excluded at capture time and the 64px account rail is cropped from the image; screenshot pixels are only re-encoded as opaque PNG, without added framing or altered controls. These captures use the installed extension, while the current source is verified separately in disposable profiles. A disposable Chromium profile loads the actual production extension against mocked provider pages. The navigation panels, export menu, and settings are real extension UI. Provider page layouts are simplified demo fixtures, not screenshots of signed-in accounts. No real chats, accounts, credentials, browsing history, or private conversation URLs are used.

The images reuse the project's existing logo. All PNGs have opaque backgrounds. The full-bleed screenshots have square corners and no added padding. The dimensions follow the [official Chrome Web Store image requirements](https://developer.chrome.com/docs/webstore/images).

## Regenerate

Use the external Playwright installation described in [the development guide](../development.md), then run from the repository root:

```sh
pnpm build
node scripts/store-assets.mjs
```

If Playwright is installed outside the project's module resolution path, set `CHATPICK_PLAYWRIGHT_MODULE` to its module directory. For new live screenshots, use Chrome to create a public-safe demo chat, verify question/heading/export state, and capture the actual 1344 × 800 viewport after animations settle. The generator crops its 64px account rail to produce a 1280 × 800 store screenshot. Inspect the source and final images for private information. Place captures in `/tmp/chatpick-store-live-{en,zh-CN}-{01,02}.jpg` before regeneration. The generator only re-encodes these local captures; it preserves existing live PNGs when no new captures are supplied. It does not open live chats or copy private history.

The generator blocks external HTTP requests and removes the temporary browser profile when it finishes. It checks question counts, answer headings, current-question highlighting, provider accent colors, export format choices, and browser errors. Inspect the resulting images before uploading after a UI change.
