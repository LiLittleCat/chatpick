// Standalone, script-free policy pages. Publish only this directory, never the ZIP or repository.
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.output/public-policy');
const css = `:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafaf7;color:#242d27}body{margin:0}main{max-width:760px;margin:auto;padding:28px 24px 64px}header{display:flex;align-items:center;justify-content:space-between;gap:20px}.brand{display:flex;align-items:center;gap:10px;font-weight:650}.brand img{width:32px;height:32px}nav{display:flex;gap:16px;font-size:14px}a{color:inherit;text-underline-offset:3px}a:focus-visible{outline:2px solid currentColor;outline-offset:4px}nav a[aria-current=page]{font-weight:650}h1{margin:40px 0 20px;font-size:clamp(26px,5vw,36px);line-height:1.25}h2{margin:32px 0 12px;font-size:20px}p,li{font-size:15px;line-height:1.8;overflow-wrap:anywhere}ul{padding-left:24px}li+li{margin-top:8px}code{font-size:.9em}footer{margin-top:40px;border-top:1px solid #bbc4be;padding-top:20px;font-size:13px}@media(prefers-color-scheme:dark){:root{background:#171c19;color:#e6ede8}}`;
fs.mkdirSync(path.join(output, 'zh-CN'), { recursive: true });
fs.writeFileSync(path.join(output, 'policy.css'), css);
fs.copyFileSync(path.join(root, 'public/icon/logo.svg'), path.join(output, 'logo.svg'));
for (const chinese of [false, true]) {
  const source = fs.readFileSync(path.join(root, chinese ? 'docs/privacy-policy.zh-CN.md' : 'docs/privacy-policy.md'), 'utf8');
  if (/<\/?[a-z][^>]*>/i.test(source)) throw new Error('Policy source must not contain raw HTML');
  const base = chinese ? '../' : './';
  const html = `<!doctype html><html lang="${chinese ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'"><title>${chinese ? 'ChatPick 隐私政策' : 'ChatPick Privacy Policy'}</title><meta name="description" content="${chinese ? 'ChatPick 的数据处理、隐私与联系方式。' : 'ChatPick data handling, privacy and contact information.'}"><link rel="stylesheet" href="${base}policy.css"></head><body><main><header><div class="brand"><img src="${base}logo.svg" alt="" width="32" height="32">ChatPick</div><nav aria-label="${chinese ? '语言' : 'Language'}"><a href="${base}index.html" ${!chinese ? 'aria-current="page"' : ''}>English</a><a href="${base}zh-CN/index.html" ${chinese ? 'aria-current="page"' : ''}>中文</a></nav></header><article>${marked.parse(source)}</article><footer>${chinese ? '隐私与支持：' : 'Privacy and support: '}<a href="mailto:hi@yl.do">hi@yl.do</a></footer></main></body></html>`;
  fs.writeFileSync(path.join(output, chinese ? 'zh-CN/index.html' : 'index.html'), html);
}
console.log('Built script-free English and Chinese policy pages in .output/public-policy (not yet published)');
