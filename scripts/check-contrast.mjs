#!/usr/bin/env node
/**
 * WCAG contrast gate for Akada's text tokens.
 *
 * Every colour a word is ever set in has to clear 4.5:1 against every paper
 * it can be read on. The two authorities are read directly rather than
 * duplicated here: PAPER_TONES / NIGHT_TOKENS in lib/preferences.ts, and the
 * `:root` block in app/globals.css. If a value drifts in either file, this
 * fails rather than going quietly out of step.
 *
 *   node scripts/check-contrast.mjs          # table + exit 1 on any failure
 *   node scripts/check-contrast.mjs --quiet  # only the failures
 *
 * `muted-soft` is deliberately absent: it is rules, ghost tally strokes and
 * disabled states now, never text, so it has no ratio to meet.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prefsSource = readFileSync(join(root, 'lib/preferences.ts'), 'utf8');
const cssSource = readFileSync(join(root, 'app/globals.css'), 'utf8');

const MIN = 4.5;

/* ───────── colour maths ───────── */

function parseHex(hex) {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

/** WCAG 2.x relative luminance. */
function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ───────── reading the authorities ───────── */

function block(source, opener) {
  const start = source.indexOf(opener);
  if (start === -1) throw new Error(`could not find ${opener} to read`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated block at ${opener}`);
}

function hexPairs(text, pattern) {
  const out = {};
  for (const match of text.matchAll(pattern)) out[match[1]] = match[2];
  return out;
}

/** The ink family every daylight paper shares, spread into each day tone. */
const dayInk = hexPairs(
  block(prefsSource, 'const DAY_INK'),
  /(\w+)\s*:\s*'(#[0-9a-fA-F]{3,6})'/g,
);

/** PAPER_TONES, one entry per stock, `...DAY_INK` resolved. */
function readTones() {
  const tones = {};
  const body = block(prefsSource, 'export const PAPER_TONES');
  for (const match of body.matchAll(/(\w+)\s*:\s*\{/g)) {
    const name = match[1];
    const entry = block(body.slice(match.index), `${name}:`);
    const values = hexPairs(entry, /(\w+)\s*:\s*'(#[0-9a-fA-F]{3,6})'/g);
    tones[name] = entry.includes('...DAY_INK') ? { ...dayInk, ...values } : values;
  }
  return tones;
}

/** The `:root` custom properties in globals.css, and the night overrides. */
const rootVars = hexPairs(
  cssSource.slice(cssSource.indexOf(':root {'), cssSource.indexOf('}', cssSource.indexOf(':root {'))),
  /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g,
);
const nightVars = hexPairs(
  block(prefsSource, 'const NIGHT_TOKENS'),
  /'--([\w-]+)'\s*:\s*'(#[0-9a-fA-F]{3,6})'/g,
);

const tones = readTones();

/* ───────── what gets checked ───────── */

/** Every token a word is ever set in. muted-soft is not one of them. */
const TEXT_TOKENS = ['ink', 'inkSoft', 'muted', 'warn', 'warnSoft', 'priority', 'prioritySoft'];

/** Which css custom property a token name maps to, for the alarm ramps. */
const CSS_NAME = {
  warn: 'warn',
  warnSoft: 'warn-soft',
  priority: 'priority',
  prioritySoft: 'priority-soft',
};

/**
 * The reading surfaces: the page itself, a card of paper on it, and the
 * second paper. These are what prose and labels are set on, and they are what
 * the 4.5:1 gate is enforced against.
 *
 * `tint` is reported alongside but not gated. It is chrome rather than a
 * reading surface — the side rail, a field's well — and it is the darkest
 * ground in each stock, so holding every token to 4.5 on it would drag the
 * caption ink darker than the paper wants. What it does mean is that muted
 * and the alarm ramps have no business carrying words on a tinted fill; the
 * rail and the tinted fields use ink-soft instead.
 */
const GROUNDS = ['bg', 'paper', 'paper2'];
const ADVISORY_GROUNDS = ['tint'];

function textColour(toneName, token) {
  if (CSS_NAME[token]) {
    const cssName = CSS_NAME[token];
    return (toneName === 'night' ? nightVars[cssName] : undefined) ?? rootVars[cssName];
  }
  return tones[toneName][token];
}

const quiet = process.argv.includes('--quiet');
const failures = [];
const rows = [];

for (const toneName of Object.keys(tones)) {
  for (const token of TEXT_TOKENS) {
    const fg = textColour(toneName, token);
    if (!fg) throw new Error(`no value for ${token} on the ${toneName} stock`);
    for (const ground of [...GROUNDS, ...ADVISORY_GROUNDS]) {
      const bg = tones[toneName][ground];
      const ratio = contrast(fg, bg);
      const row = { toneName, token, fg, ground, bg, ratio };
      rows.push(row);
      if (ratio < MIN && GROUNDS.includes(ground)) failures.push(row);
    }
  }
}

const fixed = (n) => n.toFixed(2).padStart(5);

if (!quiet) {
  for (const toneName of Object.keys(tones)) {
    console.log(`\n${toneName}`);
    for (const token of TEXT_TOKENS) {
      const line = rows
        .filter((r) => r.toneName === toneName && r.token === token)
        .map((r) => `${r.ground}${ADVISORY_GROUNDS.includes(r.ground) ? '*' : ''} ${fixed(r.ratio)}`)
        .join('   ');
      const fg = textColour(toneName, token);
      console.log(`  ${token.padEnd(13)} ${fg}   ${line}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} text token(s) under ${MIN}:1`);
  for (const f of failures) {
    console.error(`  ${f.toneName}.${f.token} ${f.fg} on ${f.ground} ${f.bg} — ${f.ratio.toFixed(2)}:1`);
  }
  process.exit(1);
}

console.log(
  `
All text tokens clear ${MIN}:1 on every reading surface of all ${Object.keys(tones).length} paper stocks.`,
);
console.log('* tint is chrome rather than a reading surface: reported, not gated.');
