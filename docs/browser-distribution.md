# Chrome、Firefox 与 Edge 分发

核对日期：2026-10-04。三个桌面浏览器分别构建 Manifest V3 扩展。以下命令生成本地构建和商店提交材料；商店账号、审核、Firefox 签名与公开安装链接仍待完成。移动版浏览器尚未验证。

## 构建与打包

安装 Node.js 22.12+ 和 pnpm 后，在仓库根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm compile
pnpm build:all
pnpm zip:all
```

| 浏览器 | 构建命令 | 构建目录 | 打包命令 | 扩展提交包 |
| --- | --- | --- | --- | --- |
| Chrome | `pnpm build:chrome` | `.output/chrome-mv3/` | `pnpm zip:chrome` | `.output/chatpick-<version>-chrome.zip` |
| Firefox 桌面版 140+ | `pnpm build:firefox` | `.output/firefox-mv3/` | `pnpm zip:firefox` | `.output/chatpick-<version>-firefox.zip` |
| Microsoft Edge | `pnpm build:edge` | `.output/edge-mv3/` | `pnpm zip:edge` | `.output/chatpick-<version>-edge.zip` |

`<version>` 来自 `package.json`。`pnpm build` 和 `pnpm zip` 保留为 Chrome 默认命令。打包命令会重新构建并校验对应浏览器；Firefox 还生成 `.output/chatpick-<version>-firefox-sources.zip`，用于源码审核。三个扩展 ZIP 的根目录都应包含 `manifest.json`，以及图标、语言包、PDF 模块、字体与许可证通知。

本地加载步骤见 [README](../README.zh-CN.md#本地安装)，自动构建和回归命令见[开发指南](development.md)。现有平台回归使用 Chromium；`pnpm test:browser` 可加载所选浏览器的生产包，检查真实扩展 API、设置桥接、导航和本地导出。单独安装 Playwright 并设置 `CHATPICK_PLAYWRIGHT_MODULE` 后，可分别运行：

```sh
CHATPICK_BROWSER=chrome pnpm test:browser
CHATPICK_BROWSER=firefox pnpm test:browser
CHATPICK_BROWSER=edge pnpm test:browser
```

`CHATPICK_BROWSER` 默认为 `chrome`，使用 Playwright Chromium；`firefox` 使用 Firefox 临时加载；`edge` 使用本机已安装的 Microsoft Edge。外部 Playwright 与浏览器安装步骤见[开发指南](development.md#browser-regression-checks)。测试使用模拟响应，发布前仍需在目标浏览器核对实站导航、设置、网站权限、Markdown/PDF 导出、重启和升级。

## Chrome

上传 `chatpick-<version>-chrome.zip` 到 Chrome Web Store 开发者控制台。公开隐私政策、商店图片、权限理由和审核步骤见 [Chrome 发布指南](chrome-web-store.md)。

## Firefox

当前仅提交桌面版；manifest 不声明 `gecko_android`，AMO 提交时不要选择 Firefox for Android。完成移动版验证后再增加该平台。

上传 `chatpick-<version>-firefox.zip` 到 AMO Developer Hub。AMO 接受 ZIP；Firefox 的 XPI 也是 ZIP 格式，改文件后缀不会产生签名。详见 [Mozilla 打包说明](https://extensionworkshop.com/documentation/publish/package-your-extension/)。

Firefox 构建的最低桌面版本为 140.0，扩展 ID 固定为 `chatpick@yl.do`。manifest 声明必需的 `authenticationInfo`、`browsingActivity` 和 `websiteContent` 数据类型，用于 Firefox 安装时的内置同意提示：现有认证信息、Cookie 和请求头、当前对话地址或标识仅发送到对应平台的同源只读接口。聊天正文只取回并在本机处理，不上传给开发者或其他服务。按实际版本核对 [Mozilla 数据分类和同意要求](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)，不要填写不传输任何数据的 `none`。

ChatPick 使用 TypeScript、模块打包和压缩，提交同一版本的 `chatpick-<version>-firefox-sources.zip`，并提供重现构建的方法。源码包应保留 `pnpm-lock.yaml`、`package.json`、`wxt.config.ts`、扩展源码、`public/` 资源和相关文档。与 GitHub 构建一致，使用 Node.js 24 和 pnpm 12.6.0，从源码包解压后的根目录运行：

```sh
pnpm install --frozen-lockfile
pnpm compile
pnpm build:firefox
```

构建输出在 `.output/firefox-mv3/`。GitHub 构建使用 `ubuntu-latest`、Node.js 24 与 pnpm 12.6.0；提交时注明实际使用的操作系统和工具版本，并确认这些命令可重建上传的扩展。详见 [Mozilla 源码提交要求](https://extensionworkshop.com/documentation/publish/source-code-submission/)。

运行 `pnpm zip:firefox` 生成当前版本的扩展和源码 ZIP 后，运行 `pnpm verify:firefox-sources` 校验源码可复现性。它将源码 ZIP 解压到临时目录，按上面的 frozen install、类型检查和 Firefox 构建步骤重建，逐个文件与扩展 ZIP 比较内容，完成后删除临时目录。GitHub 的 Firefox 构建任务在上传产物前执行此校验和 `web-ext lint`；发布包与源码文件改变后应重新打包并校验。

审核备注应说明打包代码和源码的对应关系：`lib/export-files.ts` 仅在用户选择 PDF 后，使用固定的 `browser.runtime.getURL('/pdf-export.js')` 导入随包模块；模块由 `entrypoints/pdf-export.ts` 和 `wxt.config.ts` 构建，不来自外部网址或用户输入。当前 `web-ext lint` 无错误，仍有此动态导入及 React DOM 内部 `innerHTML` 的警告；依赖版本可从 `pnpm-lock.yaml` 核查。随包提供源码供审核，不把警告描述为已消除。

本地 `about:debugging` 临时加载用于测试，重启后失效。Firefox 正式版与 Beta 的常规安装需要 Mozilla 签名；可以选择在 AMO 上公开分发，或通过 AMO 签名后自行分发。当前命令和 GitHub 构建仅提供未签名提交 ZIP，不生成可正式安装的签名 XPI。完成签名后从开发者控制台取得签名文件，详见 [Mozilla 签名与分发说明](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/)和[提交步骤](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)。

保持 manifest 中的 Firefox 扩展 ID 稳定；首次提交与后续更新使用同一个 AMO 条目。按实际数据行为填写 AMO 隐私与权限字段，并提供专用测试账号的审核步骤。公开政策网址、支持入口和 Firefox 商店链接仍待验证。

## Microsoft Edge

在 Microsoft Partner Center 创建 Edge 扩展条目，上传 `chatpick-<version>-edge.zip`。Edge Add-ons 使用 ZIP 提交，不需要把本地构建打成 CRX；名称、描述、语言和权限来自包内 manifest。填写各语言的商店说明、公开隐私政策、图片、分发地区及审核备注，详见 [Microsoft 官方发布说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)。

现有 Chrome 商店说明和审核步骤可用于准备 Edge 材料，隐私声明必须与 Edge 包的实际行为一致。先在 Edge 中加载 `.output/edge-mv3/` 完成测试，审核和 Microsoft Edge Add-ons 链接仍待确认。详见 [Microsoft 本地加载说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)。

## 发布后

各商店通过审核并可安装后，再更新两个 README 和 `website/stores.mjs` 中对应浏览器的地址。中英文公开政策、支持网址和联系邮箱验证按 [Chrome 发布指南](chrome-web-store.md)中的待办核对；本地文件路径与扩展内部政策页面不作为公开网址。
