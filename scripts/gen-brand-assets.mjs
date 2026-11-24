/**
 * Re-cuts every brand raster the app ships from the official lockups in
 * `brand/logos/` (brand/brand-guide.md §2, §8): the tab and home-screen icons,
 * the email header logo and the Open Graph card.
 *
 *   node scripts/gen-brand-assets.mjs
 *
 * The brand SVGs carry the wordmark as outlined paths, so `sharp` rasterises
 * them exactly — no font has to be installed. `brand/` is gitignored, so this
 * runs only in a checkout that has the brand folder; the outputs are committed.
 *
 * After re-cutting the email logo, bump `LOGO_VERSION` in `src/lib/email-document.ts`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = name => readFile(path.join(root, 'brand', 'logos', `${name}.svg`), 'utf8');
const out = (...parts) => path.join(root, ...parts);

/** An SVG rendered to a PNG buffer `width` px wide (height follows its viewBox). */
async function raster(svg, width, height) {
  return sharp(Buffer.from(svg), { density: 600 })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** An .ico holding PNG entries — every browser since IE Vista reads PNG-in-ICO. */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map(e => e.png)]);
}

const badge = await logo('favicon-badge');

// 1. Tab icon: the contained Race Navy badge, legible on light and dark chrome alike.
await writeFile(out('public', 'icon.svg'), badge.trim() + '\n');
const icoSizes = [16, 32, 48];
await writeFile(
  out('public', 'favicon.ico'),
  ico(await Promise.all(icoSizes.map(async size => ({ size, png: await raster(badge, size, size) }))))
);

// 2. Apple touch icon: iOS rounds the corners itself and fills transparency with
//    black, so the badge goes full-bleed (square plate, no rounded corners).
const squareBadge = badge
  .replace(/<rect width="128" height="128" rx="26"/, '<rect width="128" height="128"')
  .replace(/<rect x="0.75"[^>]*\/>\s*/, '');
await writeFile(out('public', 'apple-icon.png'), await raster(squareBadge, 180, 180));

// 3. Email header logo: `horizontal-dark` (white ink) for the #050505 header cell,
//    3x for a 224px display width.
await writeFile(out('public', 'email', 'run-as-one-logo.png'), await raster(await logo('horizontal-dark'), 672));

// 4. Open Graph card, 1200x630: a Carbon panel inset 30px (some apps crop 1.91:1
//    to 2:1) with a hairline edge, and the compact stacked lockup centred so a
//    square-cropped thumbnail still shows the whole mark and name.
const W = 1200;
const H = 630;
const INSET = 30;
const panel = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect x="${INSET + 0.5}" y="${INSET + 0.5}" width="${W - 2 * INSET - 1}" height="${H - 2 * INSET - 1}" rx="16"
      fill="#050505" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="1"/>
  </svg>`
);
const LOCKUP_W = 360;
const lockup = await raster(await logo('poster-stacked-dark'), LOCKUP_W);
const { height: lockupH } = await sharp(lockup).metadata();
await sharp(panel)
  .composite([{ input: lockup, left: Math.round((W - LOCKUP_W) / 2), top: Math.round((H - lockupH) / 2) }])
  .png()
  .toFile(out('src', 'app', 'opengraph-image.png'));

console.log('Brand assets written: icon.svg, favicon.ico, apple-icon.png, email logo, opengraph-image.png');
