# Chrome 网上应用店发布指南

核对日期：2026-10-01。本文针对当前 ChatPick 实现；发布前按实际上传版本核对权限、数据行为和开发者控制台要求。

## 当前已具备

- Chrome Manifest V3 构建和 `pnpm zip` 打包命令。
- 扩展名称、简短描述、版本号，以及 `public/icon/` 中的 PNG 图标。
- 限定在支持的域名的 content scripts，以及用于设置的 `storage` 权限。
- 随扩展打包的 React、Motion 与导航代码，没有远程可执行代码或开发者数据服务器。
- [MIT 许可证](../LICENSE)、[隐私政策](privacy-policy.md) 和本文中的商店文案、审核说明。

这些材料已在仓库中准备；商店账号、公开网址和图片上传状态尚未确认。

## 还需准备

| 材料 | 要求与当前待办 |
| --- | --- |
| 开发者账号 | 注册 Chrome Web Store 开发者账号，支付一次性注册费，启用 Google 账号两步验证，完成发布者名称和联系邮箱验证。费用以注册页面为准。 |
| 发布者身份 | 按实际情况声明 Trader / Non-Trader；若属于 Trader，完成所需身份和联系信息验证。 |
| 公开联系信息 | 邮箱为 `hi@yl.do`；需在开发者控制台完成邮箱验证。支持网址可使用独立支持页或公开仓库 Issues。当前仓库没有配置远程地址。 |
| 隐私政策 URL | 设置面板已有随插件打包的政策入口，政策已包含联系邮箱；仍需托管为无需登录即可访问的页面并填入控制台。本地 Markdown 路径和扩展内部地址不能作为商店提交网址。 |
| 商店图标 | 使用 `public/icon/128.png`；上传前检查透明背景和缩小后的可读性。 |
| 商店截图 | 至少 1 张，最多 5 张；尺寸为 1280 × 800 或 640 × 400，优先前者。目前尚未准备商店截图。 |
| 小宣传图 | 440 × 280，必需；目前尚未准备。 |
| 大宣传图 | 1400 × 560，可选。 |
| 商店字段 | 名称、简短描述、详细说明、分类、默认语言；可使用下方文案。 |
| 隐私表单 | 单一用途、权限理由、远程代码声明、数据类型与用途认证，必须与代码和隐私政策一致。 |
| 审核说明 | 提供可复现的聊天页面测试步骤，并说明需要登录原网站。 |
| 发布包与许可证 | 生产 ZIP，根目录包含 `manifest.json`；核对项目和随包依赖的许可证通知均已随分发包提供。 |

账号要求见 Google 的[注册说明](https://developer.chrome.com/docs/webstore/register)、[账号设置](https://developer.chrome.com/docs/webstore/set-up-account)、[两步验证要求](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)和[发布者身份说明](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq)。图片规格见[官方图片指南](https://developer.chrome.com/docs/webstore/images)；商店字段见[商店页面说明](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)。

截图建议使用同一组**合成对话**，分别展示 ChatGPT、Claude 和 DeepSeek 的问题目录、回答章节与不同品牌配色，再补一张设置界面。画面应反映实际功能，并清除账号、邮箱、私人对话和会话标识。

## 可用的商店文案

### 名称与简短描述

名称：`ChatPick`。

英文简短描述与当前 manifest 一致，少于 132 个字符：

```text
Navigate ChatGPT, Claude, DeepSeek, Gemini, Grok, Perplexity, Qwen and Qianwen chats by question
```

中文简短描述：

```text
按问题和回答章节快速导航 ChatGPT、Claude、DeepSeek、Gemini、Grok、Perplexity、Qwen 和千问 的长对话。
```

默认语言建议 English，分类建议 Productivity。界面中英文切换已实现；商店多语言发布需另行配置本地化材料，界面设置不会自动生成商店译文。

### 英文详细说明

```text
Find your way through long AI conversations with ChatPick.

ChatPick adds a question navigator to your current ChatGPT, Claude, DeepSeek, Gemini, Grok, Perplexity, Qwen, or Qianwen chat. Select an earlier question, open its answer headings, or jump to the start, previous question, next question, and bottom of the conversation.

Features
• Navigate questions in the active conversation branch, including repeated questions.
• Export the current conversation as Markdown or a searchable PDF; partial content is labeled before downloading.
• Browse an answer's headings and jump to the section you need.
• Follow the chat page's colors, with highlights that match each website.
• Choose automatic, light, or dark appearance. Follow the chat website's language or select English or Chinese.
• Enjoy subtle interface animations that respect reduced-motion preferences. Content jumps remain instant.

ChatPick works on saved conversation pages, including ChatGPT project/custom GPT chats and Claude project chats. Home pages, project overviews, settings, and shared links do not display navigation. You must already be signed in to the supported AI service.

The extension reads the current conversation in your browser using the site's existing session and read-only HTTPS requests to that same service on ChatGPT, Claude, and DeepSeek. Gemini, Grok, Perplexity, Qwen, and Qianwen use rendered page content without additional history requests or credential reads. It processes conversation text, page information, and necessary session credentials to provide navigation and user-initiated local exports. Only appearance, language, color, and button visibility preferences are saved in extension storage. ChatPick has no analytics, ads, or developer-operated data server and does not send your chats or credentials to its developer.

If a provider's history endpoint is unavailable, ChatPick falls back to messages observed on the page; unloaded history may be missing. Answers without headings have no section menu. Provider website changes can affect navigation.

ChatPick is an independent project and is not affiliated with the supported AI providers.
```

## 隐私表单准备

Google 要求本地处理的数据也如实披露。当前代码会处理聊天文本、当前聊天地址以及现有认证信息，不能将“没有上传给开发者”写成“完全不处理用户数据”。参见[官方用户数据 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)。

### Single purpose description

```text
Help users navigate their current ChatGPT, Claude, DeepSeek, Gemini, Grok, Perplexity, Qwen, or Qianwen conversation and export it locally as Markdown or PDF.
```

### Storage permission justification

```text
Save only the user's appearance, language, color, and export/jump button visibility preferences in chrome.storage.local and apply changes to open chat pages. Conversation text and session credentials are not saved in extension storage.
```

### Site access justification

虽然 manifest 没有单独声明 `host_permissions`，content script 的匹配范围仍带来网站访问权限，需要解释：

```text
Content scripts run only on chatgpt.com, chat.openai.com, claude.ai, chat.deepseek.com, gemini.google.com, grok.com, www.perplexity.ai, chat.qwen.ai, www.qianwen.com, and qianwen.com to provide conversation navigation and user-initiated local exports. They read the current saved chat's messages and headings, use the provider's existing same-origin session for read-only conversation requests on ChatGPT, Claude, and DeepSeek, and read page theme colors. Gemini, Grok, Perplexity, Qwen, and Qianwen use rendered page content without additional history requests or credential reads. Matching other paths on these hosts allows lightweight detection of single-page-app transitions into and out of chats. Conversation history is not read on home, project overview, new-chat entry, settings, or shared-link pages.
```

### Remote code

当前版本选择 **No, I am not using remote code**。扩展逻辑及库随包提供，站内会话接口返回数据。新增远程脚本、动态执行远程响应等行为前，需要重新检查实现和申报。

PDF 库与中文字体随包提供，字体资源仅开放给支持的网站；无需新增 downloads 权限。主动导出会重新读取当前会话，临时正文通过页面与隔离脚本桥接，在本机生成下载文件，不存入扩展存储，不发送给开发者。文件含标题、正文、会话 URL 与导出时间，不含凭据；下载后由用户保留或删除。

### Data usage 与 Privacy policy

- 按表单的数据类型定义披露实际处理范围：网页内容、聊天通信、认证信息，以及用于识别当前聊天的网页地址。它不读取浏览器的全局历史；不要因此省略对当前聊天 URL 的说明。
- 确认数据用途仅服务聊天导航和本地会话导出，不销售数据，不用于广告、无关用途或信用评估；按实际行为完成用途认证。
- 填入公开隐私政策 URL，并确保商店说明、隐私政策和上传代码一致。

这些字段的定义和填报要求以 Google 的[隐私表单说明](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)为准。若控制台询问是否有额外的数据处理，按实际版本填写。

## 可提供给审核员的测试步骤

```text
1. Install ChatPick and sign in to ChatGPT, Claude, DeepSeek, Gemini, Grok, Perplexity, Qwen, or Qianwen using a test account. ChatPick has no separate account or login.
2. Open a saved conversation with several user questions and an answer containing headings. Supported paths are /c/:id or /g/g-…/c/:id on ChatGPT, /chat/:id on Claude, /a/chat/s/:id on DeepSeek, /app/:id on Gemini, /c/:id on Grok and Qwen, /search/:id on Perplexity, and /chat/:32-hex-id on Qianwen.
3. Use the right-side question navigator to jump between questions. Hover a question with a chevron and select one of its answer headings.
4. Test the start, previous question, next question, and bottom buttons on each supported website.
5. Select Export above the navigation controls, choose Markdown or PDF, and check the downloaded file. Choosing a format starts the download directly. When history is unavailable or a reply is still generating, the menu and file show a partial-content notice. Files are generated locally; no developer service receives them.
6. Open the toolbar popup and change appearance, colors, language, and the independent export/jump button switches. Changes apply immediately to the open chat; switch choices are retained after reopening the popup. The conversation directory stays available when the buttons are hidden.
7. Navigate to the site's home or project overview without reloading. The navigator disappears. Returning to a saved chat enables it again.

Expected behavior: repeated questions stay distinct; answers without headings have no section menu; reduced-motion preferences are respected. If a provider history request fails, navigation uses messages already observed on the page.
```

审核若要求登录凭据，应使用专用测试账号并通过控制台指定渠道提供。公开文档、源码、截图和 ZIP 中均不放真实账号或凭据。

## 构建与提交

1. 更新 `package.json` 版本号；后续更新需要比已发布版本更高的版本号。
2. 运行 `pnpm compile`、`pnpm build` 以及开发指南中的浏览器测试，导航测试使用 `CHATPICK_BUILT=1`。
3. 运行 `pnpm zip`，检查 `.output/` 下生成的 Chrome MV3 ZIP。Chrome 默认只生成扩展包；如果另行生成了 sources ZIP，保留它用于源码核查，不作为商店安装包上传。
4. 检查 ZIP 根目录的 manifest、支持的域名、权限、本地脚本和图标，以及许可证通知。导出依赖与项目许可证通知已随 `THIRD-PARTY-NOTICES.txt` 打包，Noto 字体许可证在 `fonts/OFL.txt`；核对其他既有依赖的分发要求。
5. 在开发者控制台新建条目，上传 ZIP，填写商店页面、隐私和分发字段及审核步骤，预览材料后提交审核。
6. 发布后记录商店链接并更新 README；网站适配或数据行为变化时同步更新说明。

打包要求见[提交准备说明](https://developer.chrome.com/docs/webstore/prepare)，提交流程见[官方发布指南](https://developer.chrome.com/docs/webstore/publish)。上述清单用于准备材料，不代表已经通过审核或完成发布。
