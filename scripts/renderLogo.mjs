#!/usr/bin/env node
/**
 * Renders every size the logo ships as, from one source image.
 *
 *   node scripts/renderLogo.mjs            # write the real assets
 *   node scripts/renderLogo.mjs --preview  # also drop a contact sheet in ./
 *
 * The source is assets/logo-source.png — the icon exactly as supplied, at
 * 1254px. Everything below is scaling and framing; the artwork is never
 * redrawn, resharpened or recoloured. Every output is a downscale, so what
 * ships is as clean as the source is.
 *
 * The one thing this does compute is the tile's silhouette. The source has the
 * icon on a black field, and the corners are the artwork's own curve rather
 * than a plain rounded rect, so the mask is read back off the image — the
 * first and last non-black pixel of every row — instead of being re-drawn as
 * an <svg> rect that would only approximate it. RIM trims the antialiased
 * edge, which is the only part of the source that can't survive a resize.
 *
 * Deliberately not an npm script: package.json's `scripts` field is hashed
 * into the Expo runtime fingerprint, so adding one there would break OTA
 * compatibility with every already-installed build. Same reasoning as
 * scripts/check-a11y.js.
 *
 * The previous logo's PNGs are kept verbatim in assets/logo-legacy/ — see
 * REVERT.md there for how to put them back.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(ROOT, ...s);

const SOURCE = p('assets/logo-source.png');
/** The tile's face, sampled at ten points across it. */
const TILE_BG = '#FEFEFE';
/** Luminance at or below this is the black field around the tile, not the tile. */
const FIELD_CUTOFF = 60;
/** Source pixels of antialiased tile edge to discard. */
const RIM = 3;

/** Tile art cropped out of the black field, plus the matching alpha mask. */
let _tile = null;
async function tile() {
  if (_tile) return _tile;

  const { data, info } = await sharp(SOURCE).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const lum = (x, y) => {
    const i = (y * W + x) * C;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };

  const spans = [];
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) {
    let x0 = 0;
    while (x0 < W && lum(x0, y) <= FIELD_CUTOFF) x0++;
    if (x0 === W) { spans.push(null); continue; }
    let x1 = W - 1;
    while (lum(x1, y) <= FIELD_CUTOFF) x1--;
    spans.push([x0, x1]);
    if (x0 < minX) minX = x0;
    if (x1 > maxX) maxX = x1;
    if (y < minY) minY = y;
    maxY = y;
  }

  // White everywhere the tile is, transparent everywhere it isn't — `dest-in`
  // reads the alpha channel, so a plain greyscale buffer would not do.
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = minY + RIM; y <= maxY - RIM; y++) {
    const span = spans[y];
    if (!span) continue;
    for (let x = span[0] + RIM; x <= span[1] - RIM; x++) {
      const i = (y * W + x) * 4;
      rgba[i] = rgba[i + 1] = rgba[i + 2] = rgba[i + 3] = 255;
    }
  }

  const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  _tile = {
    art: await sharp(SOURCE).extract(box).png().toBuffer(),
    mask: await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).extract(box).png().toBuffer(),
  };
  return _tile;
}

/** The tile at `size`, corners cut, on transparency. */
async function cut(size) {
  const { art, mask } = await tile();
  const m = await sharp(mask).resize(size, size, { fit: 'fill' }).png().toBuffer();
  return sharp(art)
    .resize(size, size, { fit: 'fill' })
    .composite([{ input: m, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/**
 * The icon at `size`, square to the edges — no baked corners. iOS and Android
 * apply their own mask, and an icon that arrives pre-rounded ends up either
 * double-rounded or, for the App Store, transparent in the corners.
 */
async function square(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: TILE_BG } })
    .composite([{ input: await cut(size) }])
    .flatten({ background: TILE_BG }) // App Store icons reject an alpha channel
    .png();
}

/** The icon at `size` with its corners cut, for anything that isn't masked for us. */
async function rounded(size) {
  return sharp(await cut(size)).png();
}

/**
 * Rounded icon on a transparent `size` canvas, drawn at `scale` of it.
 * Android's adaptive-icon safe zone is the inner ~61% of the canvas and the
 * star already fills 80% of the tile, so the whole thing has to sit well
 * inside the frame or a launcher's circle mask takes the points off.
 */
async function inset(size, scale) {
  const inner = Math.round(size * scale);
  const pad = Math.round((size - inner) / 2);
  return sharp(await cut(inner))
    .extend({
      top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png();
}

const outputs = [
  ['assets/icon.png', () => square(1024)],
  ['assets/adaptive-icon.png', () => inset(1024, 0.72)],
  ['assets/splash-icon.png', () => rounded(1024)],
  ['assets/logo-round.png', () => rounded(512)], // in-app header mark
  ['assets/favicon.png', () => rounded(64)],
  ['docs/assets/favicon.png', () => rounded(64)],
  ['docs/assets/icon-180.png', () => square(180)],
  ['docs/assets/icon-192.png', () => rounded(192)],
  ['docs/assets/icon-512.png', () => rounded(512)],
];

for (const [rel, make] of outputs) {
  await (await make()).toFile(p(rel));
  const { width, height } = await sharp(p(rel)).metadata();
  console.log(`${rel.padEnd(28)} ${width}x${height}`);
}

if (process.argv.includes('--preview')) {
  const sizes = [256, 128, 64, 32, 16];
  const shots = [];
  for (const s of sizes) shots.push(await cut(s));
  const width = sizes.reduce((a, b) => a + b, 0) + sizes.length * 16;
  let x = 8;
  const layers = shots.map((input, i) => {
    const left = x;
    x += sizes[i] + 16;
    return { input, left, top: Math.round((256 - sizes[i]) / 2) + 8 };
  });
  await sharp({ create: { width, height: 272, channels: 4, background: '#DDD9E4' } })
    .composite(layers)
    .png()
    .toFile(p('logo-preview.png'));
  console.log('logo-preview.png (contact sheet — not committed)');
}
