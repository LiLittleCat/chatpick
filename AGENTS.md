# Working on ChatPick

ChatPick is a Chrome extension for navigating the current conversation on supported AI chat websites. Read README.md for user-facing features and settings. For setup, source responsibilities, or verification commands, read docs/development.md.

## Preserve these contracts

- Activate navigation and history reads only on supported conversation detail routes. Keep lightweight route detection on other matched pages so SPA entry works without a reload. On exit, remove navigation UI, disconnect conversation observers, cancel pending work, and release DeepSeek's native navigation.
- Identify questions by stable message identity and the active branch. Repeated question text and sparse virtualized DOM rows must remain distinct. When APIs fail, retain observed messages in conversation order.
- Build answer navigation from actual H1–H6 headings in the final answer. Exclude thinking, tools, screen-reader labels, code, and ordinary bold text. Prefer rendered headings when they differ from API text, and report a failed match rather than jumping to an unrelated section.
- Keep content jumps instant. Motion animates interface feedback and respects reduced motion. Preserve pointer travel between question and answer panels, keyboard navigation, and Escape handling.
- Keep question and answer navigation's default text color and weight aligned. Use indentation, size, and the rail for heading hierarchy. Resolve site brand colors separately from generic link colors, with per-site fallbacks and independent appearance overrides.
- Preserve the DeepSeek native component and its list dimensions while hiding its duplicate navigation. Reuse its handler to locate unmounted messages before refining the scroll position.

## Data and execution boundaries

- Run provider API reads in the page MAIN world through the existing same-origin session. Keep extension storage access in the isolated content script and popup; the bridge carries validated settings.
- Persist only appearance, language, and color settings. Keep conversation content and credentials out of extension storage, logs, screenshots, and developer services. Use synthetic conversations in fixtures and public materials.
- Bundle executable code with the extension. Treat provider API responses as data. Keep site access restricted to the supported hosts listed in entrypoints/navigator.content.ts.
- When changing permissions, endpoints, persistence, or data handling, read and update both docs/privacy-policy.md and docs/privacy-policy.zh-CN.md and the privacy declarations in docs/chrome-web-store.md to match the implementation.

## Verification and delivery

- Edit source files; regenerate .output/ and .wxt/ with WXT. Keep generated output and local testing dependencies untracked.
- For code changes, run `pnpm compile` and `pnpm build`, then the relevant browser suites listed in docs/development.md. Shared message identity or heading changes need navigation, Claude, and DeepSeek coverage; lifecycle changes need routes; palette changes need colors and brand-colors.
- Browser suites use mocked provider responses. Build first; use `CHATPICK_BUILT=1` for production navigation coverage. Live browser inspection supplements these checks when provider DOM has changed.
- Documentation-only changes need link/path checks and `git diff --check`; rerun application tests when implementation also changes.
- For release preparation, read docs/chrome-web-store.md. Keep unfinished contact details and public URLs visibly pending; describe actual supported behavior in store materials. Include project and dependency license notices in distributions.
