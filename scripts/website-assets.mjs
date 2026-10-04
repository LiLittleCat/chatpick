// Encode responsive homepage previews from native high-density website captures.
// Install sharp separately, then run:
// CHATPICK_SHARP_MODULE=/path/to/node_modules/sharp node scripts/website-assets.mjs
import { createRequire } from 'node:module';
import { mkdir, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewDimensions, previewWidths, previewFilename } from '../website/images.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.CHATPICK_SHARP_MODULE || 'sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filenames = ['01-questions', '02-answer-sections', '04-export', '03-site-colors'];
let sourceBytes = 0;
const previewBytes = new Map(previewWidths.map(width => [width, 0]));

for (const language of ['en', 'zh-CN']) {
  const directory = path.join(root, 'website/assets/previews', language);
  await mkdir(directory, { recursive: true });
  for (const filename of filenames) {
    const source = path.join(root, 'website/assets/captures', language, `${filename}.png`);
    const sourceMetadata = await sharp(source).metadata();
    if (sourceMetadata.width !== previewDimensions.width || sourceMetadata.height !== previewDimensions.height) {
      throw new Error(`Expected a native ${previewDimensions.width}×${previewDimensions.height} capture: ${source}`);
    }
    for (const width of previewWidths) {
      const destination = path.join(directory, previewFilename(`${filename}.webp`, width));
      const height = Math.round(width * previewDimensions.height / previewDimensions.width);
      await sharp(source).resize(width, height).webp({ lossless: true, effort: 6 }).toFile(destination);
      const metadata = await sharp(destination).metadata();
      if (metadata.width !== width || metadata.height !== height) {
        throw new Error(`Unexpected dimensions for ${destination}`);
      }
      previewBytes.set(width, previewBytes.get(width) + (await stat(destination)).size);
    }
    await rm(path.join(directory, `${filename}-566.webp`), { force: true });
    sourceBytes += (await stat(source)).size;
    console.log(`Encoded ${language}/${filename} at ${previewWidths.join(', ')}px`);
  }
}

const providerSource = path.join(root, 'website/assets/providers/gemini.png');
const providerDestination = path.join(root, 'website/assets/providers/gemini.webp');
await sharp(providerSource).resize(80, 80).webp({ lossless: true, effort: 6 }).toFile(providerDestination);
const providerMetadata = await sharp(providerDestination).metadata();
if (providerMetadata.width !== 80 || providerMetadata.height !== 80) {
  throw new Error('Unexpected Gemini logo dimensions');
}

console.log(`Native website captures: 8 PNGs, ${previewDimensions.width} × ${previewDimensions.height}, ${sourceBytes} bytes`);
for (const [width, bytes] of previewBytes) console.log(`${width}px lossless WebP previews: ${bytes} bytes total`);
console.log(`Gemini: 80 × 80 WebP; ${(await stat(providerSource)).size} → ${(await stat(providerDestination)).size} bytes`);

for (const browser of ['firefox', 'edge']) {
  const source = path.join(root, 'website/assets/browsers', `${browser}.png`);
  const destination = path.join(root, 'website/assets/browsers', `${browser}.webp`);
  await sharp(source).resize(48, 48).webp({ lossless: true, effort: 6 }).toFile(destination);
  const metadata = await sharp(destination).metadata();
  if (metadata.width !== 48 || metadata.height !== 48) {
    throw new Error(`Unexpected dimensions for ${destination}`);
  }
  console.log(`${browser}: 48 × 48 WebP; ${(await stat(source)).size} → ${(await stat(destination)).size} bytes`);
}
