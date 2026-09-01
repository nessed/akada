/**
 * Render the app icons to PNG.
 *
 * The icons shipped as SVG only, which two platforms quietly reject: iOS
 * ignores an SVG apple-touch-icon and falls back to a screenshot of the page,
 * and Android will not offer the install prompt without 192px and 512px PNGs
 * in the manifest. This draws the same mark that public/icon.svg draws, using
 * the renderer Next already bundles for OG images, so there is no new
 * dependency and no binary to hand-edit.
 *
 *     node scripts/build-icons.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { ImageResponse } from 'next/dist/server/og/image-response.js';

/**
 * The mark itself is public/icon.svg, embedded rather than redrawn, so the
 * PNGs and the SVG can never drift apart.
 */
async function mark(size) {
  const svg = await readFile('public/icon.svg', 'utf8');
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return {
    type: 'img',
    props: { src, width: size, height: size },
  };
}

const ICONS = [
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/apple-icon.png', size: 180 },
];

for (const { file, size } of ICONS) {
  const response = new ImageResponse(await mark(size), { width: size, height: size });
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(file, bytes);
  console.log(`${file}  ${size}x${size}  ${bytes.length} bytes`);
}
