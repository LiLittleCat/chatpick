# ChatPick Privacy Policy

Last updated: October 5, 2026

ChatPick is an independent browser extension that helps you navigate the current ChatGPT, Claude, DeepSeek, Gemini, Grok, Perplexity, Qwen, or Qianwen conversation by question and answer heading. This policy describes the extension, not the AI providers' own services.

## Information the extension handles

ChatPick processes the following information in your browser to provide navigation and exports:

- **Conversation content:** questions, answers, headings, message identifiers, branch relationships, and related metadata obtained from the current conversation's page or the provider's conversation response.
- **Current page information:** the supported site's hostname, conversation URL and identifier, relevant page elements, and theme colors. ChatPick does not read your browser-wide history.
- **Existing session information:** the current provider's authentication tokens or cookies and identifiers needed to read that conversation. ChatGPT session information may include an access token and device identifier; Claude requests use its existing session and organization identifier; DeepSeek requests use its existing session token. ChatGPT Dots, Gemini, Grok, Perplexity, Qwen, and Qianwen navigation reads rendered page content without reading session credentials or making additional history requests. ChatPick does not ask you to enter a password or create a ChatPick account.
- **Preferences:** your per-website enablement, appearance, language, color, navigation position, and export/jump button visibility settings. Website enablement stores only supported provider identifiers, not conversation URLs or browsing history.

Conversation text can contain personal or sensitive information. ChatPick uses it only to provide navigation and exports of the current conversation. It does not use it to train AI models, create profiles, or target advertising.

## How information is used and transmitted

For regular ChatGPT conversations, Claude, and DeepSeek, the extension makes read-only HTTPS requests to the AI provider whose page you are currently viewing, using that site's existing signed-in session. These requests obtain the current conversation so that questions and headings can be located even when messages are not rendered. They send the current conversation identifier, required session credentials or cookies, and session/request headers only to that provider's same-origin endpoints. ChatGPT requests may also include the provider's existing device identifier; Claude request URLs include the organization identifier. The extension does not upload the conversation text it retrieves. For ChatGPT Dots, Gemini, Grok, Perplexity, Qwen, and Qianwen, navigation uses messages rendered by the website; messages discovered while scrolling are retained in page memory for the current conversation.

ChatPick does not send conversation content, credentials, or browsing activity to its developer or a developer-operated server. It has no analytics, advertising, telemetry, or data sales. The developer does not receive or review your chats through the extension. ChatPick does not send, edit, or delete chat messages.

The AI providers process their own services and requests under their respective privacy policies. ChatPick does not control their data retention or account settings.

When you choose Export, ChatPick reads the current conversation again or uses currently rendered messages, then generates a Markdown or PDF file locally. A partial export is identified before downloading. The file contains message text, a title, the conversation URL, and the export time; it never contains session credentials. PDF libraries and a Noto Chinese font are bundled with the extension and loaded only when you choose PDF; no remote export service, remote font request, or image download is used. Temporary export data is discarded after completion, cancellation, or leaving the conversation. Downloaded files remain on your device until you remove them.

## Storage and retention

Only these preferences are persisted in the extension's local browser storage. They remain until changed, the extension's local storage is cleared, or the extension is uninstalled. They are not synchronized by ChatPick to another device or uploaded to its developer.

Navigation state is held in page memory and reset when you switch conversations or leave a supported chat route. An in-memory ChatGPT access-token cache can be reused for up to five minutes before a fresh token is requested; the cache is discarded when navigation is deactivated or the page unloads. Conversation content and credentials are not written to extension storage. The extension does not remove the provider's own cookies, browser storage, or saved conversations.

## Permissions and scope

The `storage` permission saves your preferences. Content scripts match `chatgpt.com`, `chat.openai.com`, `claude.ai`, `chat.deepseek.com`, `gemini.google.com`, `grok.com`, `www.perplexity.ai`, `chat.qwen.ai`, `www.qianwen.com`, and `qianwen.com` to detect navigation and display the interface.

The Firefox desktop build requires Firefox 140 or later and declares required data consent for authentication information (`authenticationInfo`), browsing activity (`browsingActivity`), and website content (`websiteContent`). These categories cover the existing credentials, current conversation URL or identifier, and cookies/session request information sent to the same AI provider for the reads described above. Firefox presents this declaration during installation; see [Mozilla's data consent documentation](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

Conversation reading and navigation operate only on supported saved-chat detail pages. Lightweight route detection remains on other pages of these hosts so that entering a chat enables navigation without a reload. Home, project overview, new-chat entry, settings, and shared-link pages do not trigger conversation-history reads. Disabled websites also do not trigger conversation or credential reads; only lightweight settings and route detection remain.

## Your choices

All supported websites are enabled by default. You can use the switch at the top of the toolbar popup to turn ChatPick off for the current website. This removes ChatPick navigation, restores native navigation it had replaced, cancels pending conversation/export work, and stops conversation observers. The choice persists for that website; other websites are unaffected.

You can change preferences from the ChatPick toolbar popup, restrict the extension's site access through your browser's extension settings, disable it, or uninstall it. Removing site access prevents navigation on that site. Uninstalling ChatPick removes its local preferences; it does not delete chats or end sessions held by the AI provider.

If you choose to contact the developer, the information you provide in that message is used to respond to your request. Please use synthetic examples and avoid sending private conversations or session credentials.

## Limited use and changes

ChatPick's use of information is limited to providing its conversation-navigation and export features and follows the [Chrome Web Store User Data Policy, including its Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use). Information is not sold, used for advertising, or used to determine creditworthiness or lending eligibility.

When the extension's data handling changes, this policy and its last-updated date will be updated to describe that behavior.

## Contact

For privacy questions or support: [hi@yl.do](mailto:hi@yl.do).
