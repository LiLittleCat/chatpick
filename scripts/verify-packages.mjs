import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.output');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const rebuildSources = args.includes('--rebuild-sources');
const browsers = args.filter(arg => arg !== '--rebuild-sources');
if (browsers.length === 0) browsers.push('chrome', 'firefox', 'edge');
assert(browsers.every(browser => ['chrome', 'firefox', 'edge'].includes(browser)), 'Usage: pnpm verify:packages [chrome|firefox|edge ...] [--rebuild-sources]');
assert.equal(new Set(browsers).size, browsers.length, 'Specify each browser once');
assert(!rebuildSources || browsers.includes('firefox'), '--rebuild-sources requires the Firefox package');

// Keep this explicit: the release check must catch accidentally widened access.
const supportedHosts = [
  'https://chatgpt.com/*', 'https://chat.openai.com/*', 'https://claude.ai/*',
  'https://chat.deepseek.com/*', 'https://gemini.google.com/*', 'https://grok.com/*',
  'https://www.perplexity.ai/*', 'https://chat.qwen.ai/*',
  'https://www.qianwen.com/*', 'https://qianwen.com/*',
].sort();
const resources = ['fonts/NotoSansSC-Regular.ttf', 'pdf-export.js'].sort();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Read WXT's ordinary (non-ZIP64) archives without a platform unzip dependency.
// Checking every entry's length and CRC also catches truncated/corrupt resources.
async function readZip(filename) {
  const bytes = await readFile(filename);
  const label = path.basename(filename);
  let end = bytes.length - 22;
  const earliestEnd = Math.max(0, bytes.length - 22 - 65535);
  while (end >= earliestEnd) {
    if (bytes.readUInt32LE(end) === 0x06054b50 && end + 22 + bytes.readUInt16LE(end + 20) === bytes.length) break;
    end--;
  }
  assert(end >= earliestEnd, `${label}: missing ZIP directory`);
  assert.equal(bytes.readUInt16LE(end + 4), 0, `${label}: multi-disk ZIP`);
  assert.equal(bytes.readUInt16LE(end + 6), 0, `${label}: multi-disk ZIP`);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count, `${label}: split ZIP directory`);
  assert.notEqual(count, 65535, `${label}: ZIP64 is unsupported`);
  let cursor = bytes.readUInt32LE(end + 16);
  const directoryEnd = cursor + bytes.readUInt32LE(end + 12);
  assert.equal(directoryEnd, end, `${label}: invalid ZIP directory bounds`);
  const files = new Map();
  for (let index = 0; index < count; index++) {
    assert(cursor + 46 <= directoryEnd, `${label}: truncated ZIP directory`);
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50, `${label}: invalid ZIP entry`);
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const checksum = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28);
    const extraSize = bytes.readUInt16LE(cursor + 30);
    const commentSize = bytes.readUInt16LE(cursor + 32);
    const local = bytes.readUInt32LE(cursor + 42);
    assert(cursor + 46 + nameSize + extraSize + commentSize <= directoryEnd, `${label}: truncated ZIP entry`);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
    assert(name && !name.includes('\\') && !name.includes('\0') && !path.posix.isAbsolute(name) && !name.split('/').some(part => part === '..' || part === '.'), `${label}: unsafe ZIP path ${name}`);
    assert(!files.has(name), `${label}: duplicate ZIP entry ${name}`);
    assert.equal(flags & 1, 0, `${label}: encrypted ZIP entry ${name}`);
    assert([0, 8].includes(method), `${label}: unsupported ZIP compression ${name}`);
    assert(size < 128 * 1024 * 1024, `${label}: oversized entry ${name}`);
    assert(local + 30 <= cursor, `${label}: invalid local entry ${name}`);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50, `${label}: invalid local signature ${name}`);
    const localNameSize = bytes.readUInt16LE(local + 26);
    const start = local + 30 + localNameSize + bytes.readUInt16LE(local + 28);
    assert.equal(bytes.subarray(local + 30, local + 30 + localNameSize).toString('utf8'), name, `${label}: local name mismatch ${name}`);
    assert(start + compressedSize <= bytes.readUInt32LE(end + 16), `${label}: truncated content ${name}`);
    const compressed = bytes.subarray(start, start + compressedSize);
    const content = method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    assert.equal(content.length, size, `${label}: size mismatch ${name}`);
    assert.equal(crc32(content), checksum, `${label}: CRC mismatch ${name}`);
    files.set(name, content);
    cursor += 46 + nameSize + extraSize + commentSize;
  }
  assert.equal(cursor, directoryEnd, `${label}: unused ZIP directory data`);
  return files;
}

function required(files, filename) {
  assert(files.has(filename), `Missing bundled file: ${filename}`);
  assert(files.get(filename).length > 0, `Empty bundled file: ${filename}`);
  return files.get(filename);
}
function json(files, filename) {
  return JSON.parse(required(files, filename).toString('utf8'));
}
function exactList(actual, expected, label) {
  assert(Array.isArray(actual), `${label}: expected an array`);
  assert.deepEqual([...actual].sort(), expected, label);
}
async function walk(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(directory, entry.name), relative + '/'));
    else {
      assert(entry.isFile(), `Unexpected non-file: ${relative}`);
      files.push(relative);
    }
  }
  return files.sort();
}
async function matchesDirectory(files, directory) {
  const filenames = await walk(directory);
  exactList([...files.keys()], filenames, 'ZIP entries differ from build output');
  for (const filename of filenames) assert(required(files, filename).equals(await readFile(path.join(directory, filename))), `ZIP differs from build output: ${filename}`);
}

async function verifyExtension(browser) {
  const filename = `${packageJson.name}-${packageJson.version}-${browser}.zip`;
  const files = await readZip(path.join(output, filename));
  await matchesDirectory(files, path.join(output, `${browser}-mv3`));
  const manifest = json(files, 'manifest.json');
  assert.equal(manifest.manifest_version, 3, 'Expected Manifest V3');
  assert.equal(manifest.version, packageJson.version, 'Package version mismatch');
  assert.equal(manifest.default_locale, 'en', 'Expected English fallback');
  assert.equal(manifest.name, '__MSG_extensionName__', 'Expected localized extension name');
  assert.equal(manifest.description, '__MSG_extensionDescription__', 'Expected localized description');
  for (const locale of ['en', 'zh_CN']) {
    const messages = json(files, `_locales/${locale}/messages.json`);
    for (const key of ['extensionName', 'extensionDescription']) {
      assert.equal(typeof messages[key]?.message, 'string', `Missing ${locale} ${key}`);
      assert(messages[key].message.trim(), `Empty ${locale} ${key}`);
    }
    assert(messages.extensionDescription.message.length <= 132, `${locale} description exceeds 132 characters`);
    if (locale === 'en') assert.equal(messages.extensionDescription.message, packageJson.description, 'English description differs from package.json');
  }
  exactList(manifest.permissions, ['storage'], 'Unexpected extension permission');
  for (const key of ['host_permissions', 'optional_host_permissions', 'optional_permissions']) exactList(manifest[key] ?? [], [], `Unexpected ${key}`);
  assert.equal(manifest.content_security_policy?.extension_pages, "script-src 'self'; object-src 'none'; base-uri 'none';", 'Unexpected extension CSP');
  assert.equal(manifest.content_scripts?.length, 2, 'Expected settings bridge and navigator only');
  for (const [script, world] of [['content', 'ISOLATED'], ['navigator', 'MAIN']]) {
    const filename = `content-scripts/${script}.js`;
    const entry = manifest.content_scripts.find(entry => entry.js?.includes(filename));
    assert(entry, `Missing ${script} content script`);
    exactList(entry.matches, supportedHosts, `${script}: unexpected host access`);
    exactList(entry.js, [filename], `${script}: unexpected script`);
    assert.equal(entry.world ?? 'ISOLATED', world, `${script}: wrong execution world`);
    assert.equal(entry.run_at, 'document_idle', `${script}: unexpected run timing`);
    assert(!entry.all_frames && !entry.match_about_blank && !entry.match_origin_as_fallback, `${script}: unexpected frame access`);
    required(files, filename);
  }
  assert.equal(manifest.web_accessible_resources?.length, 1, 'Expected one scoped resource declaration');
  const accessible = manifest.web_accessible_resources[0];
  exactList(accessible.resources, resources, 'Unexpected web-accessible resource');
  exactList(accessible.matches, supportedHosts, 'Unexpected resource host access');
  exactList(accessible.extension_ids ?? [], [], 'Unexpected extension resource access');
  for (const resource of resources) required(files, resource);
  assert.equal(manifest.action?.default_popup, 'popup.html', 'Missing settings popup');
  required(files, manifest.action.default_popup);
  required(files, 'privacy.html');
  for (const size of ['16', '32', '48', '128']) required(files, manifest.icons?.[size]);
  for (const resource of ['THIRD-PARTY-NOTICES.txt', 'fonts/OFL.txt', 'fonts/README.txt', 'fonts/NotoSansSC-Regular.ttf']) {
    assert(required(files, resource).equals(await readFile(path.join(root, 'public', resource))), `Bundled resource differs from source: ${resource}`);
  }
  assert(required(files, 'THIRD-PARTY-NOTICES.txt').toString('utf8').includes((await readFile(path.join(root, 'LICENSE'), 'utf8')).trim()), 'Missing project license notice');
  if (browser === 'firefox') {
    const gecko = manifest.browser_specific_settings?.gecko;
    assert.equal(gecko?.id, 'chatpick@yl.do', 'Unexpected Firefox extension ID');
    assert.equal(gecko.strict_min_version, '140.0', 'Expected Firefox 140+');
    assert.equal(manifest.browser_specific_settings.gecko_android?.strict_min_version, '142.0', 'Expected Firefox for Android consent API minimum');
    exactList(gecko.data_collection_permissions?.required, ['authenticationInfo', 'browsingActivity', 'websiteContent'], 'Unexpected Firefox data collection declaration');
  } else assert(!manifest.browser_specific_settings, 'Firefox metadata leaked into Chromium package');
  console.log(`Verified ${filename}: MV3, settings isolation, hosts, resources, locales and licenses`);
  return files;
}

async function verifyFirefoxSources() {
  const filename = `${packageJson.name}-${packageJson.version}-firefox-sources.zip`;
  const files = await readZip(path.join(output, filename));
  const requiredSources = [
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'wxt.config.ts', 'tsconfig.json',
    'navigator.js', 'navigator.d.ts', 'settings.ts', 'LICENSE', 'docs/browser-distribution.md',
    'docs/privacy-policy.md', 'docs/privacy-policy.zh-CN.md', 'scripts/verify-packages.mjs',
  ];
  for (const directory of ['entrypoints', 'lib', 'public']) {
    requiredSources.push(...(await walk(path.join(root, directory))).map(filename => `${directory}/${filename}`));
  }
  for (const source of requiredSources) assert(required(files, source).equals(await readFile(path.join(root, source))), `Firefox review source is missing or stale: ${source}`);
  for (const source of files.keys()) {
    assert(!source.split('/').some(part => part.startsWith('.') || part === 'node_modules'), `Unexpected generated/hidden source: ${source}`);
    assert(!/^(?:tests|old|website|docs\/store-assets)\//.test(source), `Unrelated source file: ${source}`);
    assert(!/\.(?:zip|log)$/i.test(source), `Unexpected archive/log: ${source}`);
  }
  const instructions = required(files, 'docs/browser-distribution.md').toString('utf8');
  for (const command of ['pnpm install --frozen-lockfile', 'pnpm build:firefox']) assert(instructions.includes(command), `Missing Firefox rebuild instruction: ${command}`);
  console.log(`Verified ${filename}: current build inputs, locked dependencies and reviewer instructions`);
  return files;
}

function runPnpm(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
      cwd, stdio: 'inherit', shell: process.platform === 'win32',
      env: { ...process.env, CI: 'true' },
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Firefox source rebuild failed: pnpm ${args.join(' ')} (${signal ?? code})`));
    });
  });
}

async function rebuildFirefoxSources(sources, extension) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'chatpick-firefox-sources-'));
  try {
    for (const [filename, content] of sources) {
      const destination = path.join(directory, filename);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, content);
    }
    await runPnpm(['install', '--frozen-lockfile'], directory);
    await runPnpm(['compile'], directory);
    await runPnpm(['build:firefox'], directory);
    await matchesDirectory(extension, path.join(directory, '.output', 'firefox-mv3'));
    console.log('Verified Firefox source rebuild: all emitted files match the extension ZIP byte-for-byte');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

for (const browser of browsers) {
  const extension = await verifyExtension(browser);
  if (browser === 'firefox') {
    const sources = await verifyFirefoxSources();
    if (rebuildSources) await rebuildFirefoxSources(sources, extension);
  }
}
