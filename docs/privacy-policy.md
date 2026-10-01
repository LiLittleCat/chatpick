# ChatPick Privacy Policy

Last updated: October 1, 2026

ChatPick is an independent browser extension that helps you navigate the current ChatGPT, Claude, DeepSeek, Gemini, Grok, Perplexity, or Qwen conversation by question and answer heading. This policy describes the extension, not the AI providers' own services.

## Information the extension handles

ChatPick processes the following information in your browser to provide navigation:

- **Conversation content:** questions, answers, headings, message identifiers, branch relationships, and related metadata obtained from the current conversation's page or the provider's conversation response.
- **Current page information:** the supported site's hostname, conversation URL and identifier, relevant page elements, and theme colors. ChatPick does not read your browser-wide history.
- **Existing session information:** the current provider's authentication tokens or cookies and identifiers needed to read that conversation. ChatGPT session information may include an access token and device identifier; Claude requests use its existing session and organization identifier; DeepSeek requests use its existing session token. Gemini, Grok, Perplexity, and Qwen navigation reads rendered page content without reading session credentials or making additional history requests. ChatPick does not ask you to enter a password or create a ChatPick account.
- **Preferences:** your appearance, language, and color settings.

Conversation text can contain personal or sensitive information. ChatPick uses it only to build the navigation you see on the current chat page. It does not use it to train AI models, create profiles, or target advertising.

## How information is used and transmitted

For ChatGPT, Claude, and DeepSeek, the extension makes read-only HTTPS requests to the AI provider whose page you are currently viewing, using that site's existing signed-in session. These requests obtain the current conversation so that questions and headings can be located even when messages are not rendered. Session credentials are used only with that provider's same-origin endpoints. For Gemini, Grok, Perplexity, and Qwen, navigation uses messages rendered by the website; messages discovered while scrolling are retained in page memory for the current conversation.

ChatPick does not send conversation content, credentials, or browsing activity to its developer or a developer-operated server. It has no analytics, advertising, telemetry, or data sales. The developer does not receive or review your chats through the extension. ChatPick does not send, edit, or delete chat messages.

The AI providers process their own services and requests under their respective privacy policies. ChatPick does not control their data retention or account settings.

## Storage and retention

Only the three preferences are persisted in the extension's local browser storage. They remain until changed, the extension's local storage is cleared, or the extension is uninstalled. They are not synchronized by ChatPick to another device or uploaded to its developer.

Navigation state is held in page memory and reset when you switch conversations or leave a supported chat route. An in-memory ChatGPT access-token cache can be reused for up to five minutes before a fresh token is requested; the cache is discarded when the page unloads. Conversation content and credentials are not written to extension storage. The extension does not remove the provider's own cookies, browser storage, or saved conversations.

## Permissions and scope

The `storage` permission saves your preferences. Content scripts match `chatgpt.com`, `chat.openai.com`, `claude.ai`, `chat.deepseek.com`, `gemini.google.com`, `grok.com`, `www.perplexity.ai`, and `chat.qwen.ai` to detect navigation and display the interface.

Conversation reading and navigation operate only on supported saved-chat detail pages. Lightweight route detection remains on other pages of these hosts so that entering a chat enables navigation without a reload. Home, project overview, new-chat entry, settings, and shared-link pages do not trigger conversation-history reads.

## Your choices

You can change preferences from the ChatPick toolbar popup, restrict the extension's site access in Chrome, disable it, or uninstall it. Removing site access prevents navigation on that site. Uninstalling ChatPick removes its local preferences; it does not delete chats or end sessions held by the AI provider.

If you choose to contact the developer, the information you provide in that message is used to respond to your request. Please use synthetic examples and avoid sending private conversations or session credentials.

## Limited use and changes

ChatPick's use of information is limited to providing its conversation-navigation feature and follows the [Chrome Web Store User Data Policy, including its Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use). Information is not sold, used for advertising, or used to determine creditworthiness or lending eligibility.

When the extension's data handling changes, this policy and its last-updated date will be updated to describe that behavior.

## Contact

For privacy questions or support: [hi@yl.do](mailto:hi@yl.do).
