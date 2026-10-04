// Render the source vector at the Web Store's recommended visual size.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CHATPICK_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(import.meta.dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public/icon/logo.svg')).toString('base64');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 3 });
  await page.setContent(`<style>html,body{margin:0;width:128px;height:128px;background:transparent}body{display:grid;place-items:center}img{display:block;width:96px;height:96px}</style><img src="data:image/svg+xml;base64,${svg}">`);
  await page.locator('img').evaluate(img => img.decode());
  await page.screenshot({ path: path.join(root, 'public/icon/128.png'), omitBackground: true, scale: 'css' });
  console.log('Rendered 128px icon with a centered 96px source vector and transparent padding');
} finally { await browser.close(); }
