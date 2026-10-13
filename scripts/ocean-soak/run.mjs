#!/usr/bin/env node
/**
 * A long sitting, soaked: the real ocean scene stepped through nine hours of
 * focus in a headless Chromium, every frame timed and the heap read each
 * hour, so a leak or a slowdown deep in a long night shows before anyone
 * sits through one. Not run in CI (it takes a few minutes and a browser);
 * run it after changing anything in the deep:
 *
 *   npm run soak:ocean
 *
 * It fails if the last hour's frames are much slower than the first's once
 * the sprites are warm, or if the heap keeps growing through the trench.
 * Options: --hours 9 --step 20 (focus seconds a frame) --key soak:1, and
 * CHROMIUM_PATH to point at a browser.
 */

import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const hours = Number(arg('hours', 9));
const step = Number(arg('step', 20));
const key = arg('key', 'soak:1');

const out = mkdtempSync(join(tmpdir(), 'ocean-soak-'));
await build({
  entryPoints: [join(here, 'soak.tsx')],
  bundle: true,
  format: 'iife',
  outfile: join(out, 'soak.js'),
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfig: join(root, 'tsconfig.json'),
  nodePaths: [join(root, 'node_modules')],
  loader: { '.css': 'empty' },
  logLevel: 'error',
});
// The scene's few utility classes, since Tailwind is not on the page.
writeFileSync(
  join(out, 'soak.html'),
  '<!doctype html><meta charset=utf-8><style>html,body{margin:0;height:100%;overflow:hidden;background:#1A1815}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}</style><body><div id=root></div><script src="soak.js"></script>',
);

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`file://${join(out, 'soak.html')}?hours=${hours}&step=${step}&key=${encodeURIComponent(key)}`);
await page.waitForFunction(() => window.soak?.done, null, { timeout: 30 * 60 * 1000, polling: 1000 });
const result = await page.evaluate(() => window.soak.hours);
await browser.close();

const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
console.log('hour  sweep p95 ms  heap MB  steady median ms  steady p95 ms');
for (const h of result) {
  console.log(
    `${String(h.hour + 1).padStart(4)}  ${q(h.frames, 0.95).toFixed(1).padStart(12)}  ${h.heap == null ? '      -' : h.heap.toFixed(1).padStart(7)}  ${q(h.steady, 0.5).toFixed(1).padStart(16)}  ${q(h.steady, 0.95).toFixed(1).padStart(13)}`,
  );
}

// The verdict, on the steady frames (the sweep crams minutes of new wall
// and new places into a few frames, which no reader sees): the trench's
// against the light's. And the heap through the trench, from the sweep.
const fail = [];
const base = result[1] ?? result[0];
const worst = result.slice(3).reduce((a, h) => Math.max(a, q(h.steady, 0.95)), 0);
if (worst > Math.max(2 * q(base.steady, 0.95), q(base.steady, 0.95) + 25)) fail.push(`a trench hour's p95 frame (${worst.toFixed(1)} ms) is far over the second hour's (${q(base.steady, 0.95).toFixed(1)} ms)`);
const heaps = result.filter((h) => h.hour >= 3 && h.heap != null).map((h) => h.heap);
if (heaps.length >= 3 && Math.min(...heaps.slice(-2)) - Math.min(...heaps.slice(0, 2)) > 60) fail.push(`the heap grew ${(Math.min(...heaps.slice(-2)) - Math.min(...heaps.slice(0, 2))).toFixed(0)} MB through the trench`);
if (fail.length) {
  console.error(`\nsoak failed:\n- ${fail.join('\n- ')}`);
  process.exit(1);
}
console.log('\nsoak ok');
