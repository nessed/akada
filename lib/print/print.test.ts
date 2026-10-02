import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32 as zlibCrc32, inflateSync } from 'node:zlib';
import { planStrips, CANVAS_LIMIT } from './engine';
import { deckleOutline } from './frame';
import { crc32, encodePng, PngStream } from './png';
import {
  frameLayout,
  pictureShape,
  printChoices,
  printPixels,
  PRINT_LAYOUT_LONG_SIDE,
  screenPixels,
} from './sizes';

interface Chunk {
  type: string;
  data: Buffer;
  crc: number;
}

function readChunks(bytes: Buffer): Chunk[] {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'signature');
  const chunks: Chunk[] = [];
  let at = 8;
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('latin1');
    const data = bytes.subarray(at + 8, at + 8 + length);
    const crc = bytes.readUInt32BE(at + 8 + length);
    assert.equal(crc, zlibCrc32(bytes.subarray(at + 4, at + 8 + length)), `${type} CRC`);
    chunks.push({ type, data, crc });
    at += 12 + length;
  }
  assert.equal(at, bytes.length, 'no trailing bytes');
  return chunks;
}

/* The decoder half, written out plainly so it checks the encoder rather than
   sharing its code. */
function unfilter(raw: Buffer, width: number, height: number, bpp: number): Uint8Array {
  const line = width * bpp;
  const out = new Uint8Array(line * height);
  for (let y = 0; y < height; y += 1) {
    const type = raw[y * (line + 1)];
    const src = raw.subarray(y * (line + 1) + 1, (y + 1) * (line + 1));
    for (let i = 0; i < line; i += 1) {
      const a = i >= bpp ? out[y * line + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * line + i] : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * line + i - bpp] : 0;
      let pred = 0;
      if (type === 1) pred = a;
      else if (type === 2) pred = b;
      else if (type === 3) pred = (a + b) >> 1;
      else if (type === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else assert.equal(type, 0, 'known filter');
      out[y * line + i] = (src[i] + pred) & 0xff;
    }
  }
  return out;
}

function synthetic(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      rgba[i] = (x * 37 + y * 11) & 0xff;
      rgba[i + 1] = (x * x + y * 3) & 0xff;
      rgba[i + 2] = (y * 59) & 0xff;
      rgba[i + 3] = (200 + x + y) & 0xff;
    }
  }
  return rgba;
}

function decode(bytes: Buffer) {
  const chunks = readChunks(bytes);
  assert.equal(chunks[0].type, 'IHDR');
  assert.equal(chunks[chunks.length - 1].type, 'IEND');
  const ihdr = chunks[0].data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const colourType = ihdr[9];
  const bpp = colourType === 6 ? 4 : 3;
  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = inflateSync(idat);
  assert.equal(raw.length, height * (width * bpp + 1), 'one filter byte and a row per line');
  return { chunks, width, height, colourType, bpp, pixels: unfilter(raw, width, height, bpp) };
}

test('our CRC-32 is the PNG one', () => {
  for (const text of ['', 'IEND', 'The quick brown fox jumps over the lazy dog']) {
    const bytes = new TextEncoder().encode(text);
    assert.equal(crc32(bytes), zlibCrc32(bytes));
  }
  assert.equal(crc32(new TextEncoder().encode('IEND')), 0xae426082);
});

for (const filter of ['none', 'sub', 'up', 'paeth'] as const) {
  test(`an RGBA picture survives the encoder (${filter})`, async () => {
    const width = 13;
    const height = 7;
    const rgba = synthetic(width, height);
    const blob = await encodePng(rgba, width, height, { alpha: true, filter });
    assert.equal(blob.type, 'image/png');
    const png = decode(Buffer.from(await blob.arrayBuffer()));
    assert.equal(png.width, width);
    assert.equal(png.height, height);
    assert.equal(png.colourType, 6);
    assert.deepEqual([...png.pixels], [...rgba]);
  });
}

test('an opaque picture is written as RGB, with its print size, from strips', async () => {
  const width = 31;
  const height = 23;
  const rgba = synthetic(width, height);
  const stream = new PngStream(width, height, { dpi: 300 });
  // Uneven strips, the way the engine hands them over.
  for (let y = 0; y < height; ) {
    const rows = Math.min(height - y, 1 + (y % 5));
    await stream.pushRows(rgba.subarray(y * width * 4), rows);
    y += rows;
  }
  const png = decode(Buffer.from(await (await stream.finish()).arrayBuffer()));
  assert.equal(png.colourType, 2);
  const rgb: number[] = [];
  for (let i = 0; i < rgba.length; i += 4) rgb.push(rgba[i], rgba[i + 1], rgba[i + 2]);
  assert.deepEqual([...png.pixels], rgb);

  const phys = png.chunks.find((c) => c.type === 'pHYs');
  assert.ok(phys, 'pHYs written');
  assert.equal(phys.data.readUInt32BE(0), 11811); // 300 dpi in px per metre
  assert.equal(phys.data.readUInt32BE(4), 11811);
  assert.equal(phys.data[8], 1);
  assert.ok(png.chunks.some((c) => c.type === 'sRGB'));
  const order = png.chunks.map((c) => c.type);
  assert.ok(order.indexOf('pHYs') < order.indexOf('IDAT'), 'pHYs before the data');
});

test('a big picture is cut into many IDAT chunks and still inflates whole', async () => {
  const width = 600;
  const height = 400;
  const rgba = new Uint8ClampedArray(width * height * 4);
  // Noise does not compress, so the data runs past one chunk.
  let s = 1;
  for (let i = 0; i < rgba.length; i += 1) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    rgba[i] = s >>> 24;
  }
  const blob = await encodePng(rgba, width, height, { alpha: true });
  const png = decode(Buffer.from(await blob.arrayBuffer()));
  assert.ok(png.chunks.filter((c) => c.type === 'IDAT').length > 1);
  assert.deepEqual(Buffer.from(png.pixels), Buffer.from(rgba.buffer));
});

test('the encoder refuses rows that do not add up', async () => {
  const stream = new PngStream(4, 2);
  await stream.pushRows(new Uint8Array(4 * 4), 1);
  await assert.rejects(stream.finish(), /rows were never drawn/);
  const over = new PngStream(4, 1);
  await assert.rejects(over.pushRows(new Uint8Array(4 * 4 * 2), 2), RangeError);
});

test('print sizes are standard paper at 300 dpi', () => {
  assert.deepEqual(printPixels('a4'), { width: 2480, height: 3508 });
  assert.deepEqual(printPixels('a3'), { width: 3508, height: 4961 });
  assert.deepEqual(printPixels('a2'), { width: 4961, height: 7016 });
  assert.deepEqual(printPixels('in8x10'), { width: 2400, height: 3000 });
  assert.deepEqual(printPixels('in12x18'), { width: 3600, height: 5400 });
  assert.deepEqual(printPixels('in18x24'), { width: 5400, height: 7200 });
  assert.deepEqual(printChoices('en-US'), ['in8x10', 'in12x18', 'in18x24']);
  assert.deepEqual(printChoices('en-GB'), ['a4', 'a3', 'a2']);
  assert.deepEqual(printChoices(undefined), ['a4', 'a3', 'a2']);
});

test('this screen is the screen’s own pixels, a 5K one included', () => {
  assert.deepEqual(screenPixels({ width: 393, height: 852, dpr: 3 }), { width: 1179, height: 2556 });
  assert.deepEqual(screenPixels({ width: 2560, height: 1440, dpr: 2 }), { width: 5120, height: 2880 });
  const shape = pictureShape({ width: 5120, height: 2880 }, { width: 2560, height: 1440, dpr: 2 });
  assert.deepEqual(shape, { width: 2560, height: 1440, px: 2 });
  const print = pictureShape({ width: 4000, height: 6000 });
  assert.equal(Math.round(print.height), PRINT_LAYOUT_LONG_SIDE);
  assert.equal(print.px * print.width, 4000);
});

test('the frame sits inside the paper, foot-weighted, the picture inside the plate', () => {
  for (const id of ['a4', 'a2', 'in18x24'] as const) {
    const { width, height } = printPixels(id);
    const f = frameLayout(width, height);
    assert.ok(f.plate.x > 0 && f.plate.y > 0);
    const foot = height - (f.plate.y + f.plate.h);
    assert.ok(foot > f.plate.y, 'more paper at the foot than the head');
    assert.equal(f.plate.x, width - (f.plate.x + f.plate.w), 'even sides');
    assert.ok(f.picture.x > f.plate.x && f.picture.y > f.plate.y);
    assert.ok(f.picture.x + f.picture.w < f.plate.x + f.plate.w);
    assert.ok(f.picture.y + f.picture.h < f.plate.y + f.plate.h);
    assert.ok(f.deckle.reach + f.deckle.feather * 2 < f.picture.x - f.plate.x + f.picture.w / 10);
  }
});

test('the deckle is ragged, inside its rectangle, and the same every time', () => {
  const f = frameLayout(2480, 3508);
  const a = deckleOutline(f.picture, f.deckle, 'sitting-1');
  const b = deckleOutline(f.picture, f.deckle, 'sitting-1');
  const c = deckleOutline(f.picture, f.deckle, 'sitting-2');
  assert.deepEqual(a.rings.map((r) => [...r]), b.rings.map((r) => [...r]));
  assert.notDeepEqual([...a.rings[0]], [...c.rings[0]]);
  const { x, y, w, h } = f.picture;
  let minInset = Infinity;
  let maxInset = 0;
  for (const ring of a.rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const px = ring[i];
      const py = ring[i + 1];
      assert.ok(px >= x && px <= x + w && py >= y && py <= y + h, 'inside the picture');
      const inset = Math.min(px - x, x + w - px, py - y, y + h - py);
      minInset = Math.min(minInset, inset);
      maxInset = Math.max(maxInset, inset);
    }
  }
  // Ragged: the edge wanders by a good share of its reach.
  assert.ok(maxInset - minInset > f.deckle.reach * 0.5);
  assert.ok(maxInset <= f.deckle.reach + f.deckle.feather * 1.5 + 1);
  // Outermost ring first: on average further out than the innermost.
  const mean = (ring: Float64Array) => {
    let sum = 0;
    for (let i = 0; i < ring.length; i += 2) {
      sum += Math.min(ring[i] - x, x + w - ring[i], ring[i + 1] - y, y + h - ring[i + 1]);
    }
    return sum / (ring.length / 2);
  };
  assert.ok(mean(a.rings[0]) < mean(a.rings[a.rings.length - 1]));
});

test('strips never ask for a canvas iOS would refuse, and cover every row once', () => {
  const cases: [number, number, number][] = [
    [1920, 1200, 2],
    [4961, 7016, 2],
    [5400, 7200, 2],
    [5120, 2880, 2],
    [1179, 2556, 1],
    [10, 3, 4],
  ];
  for (const [w, h, ss] of cases) {
    const plan = planStrips(w, h, ss);
    const tall = (plan.rows + plan.pad * 2) * plan.supersample;
    assert.ok(w * plan.supersample * tall <= CANVAS_LIMIT, `${w}×${h} strip fits`);
    assert.ok(w * plan.supersample <= 16384);
    assert.ok(plan.rows * plan.supersample <= 1024);
    let next = 0;
    for (const strip of plan.strips) {
      assert.equal(strip.y, next);
      assert.ok(strip.h > 0);
      next += strip.h;
    }
    assert.equal(next, h);
  }
  // A2 keeps its supersampling.
  assert.equal(planStrips(4961, 7016, 2).supersample, 2);
  // An explicit budget makes fewer, taller strips, still within the limit.
  const tall = planStrips(2480, 3508, 2, CANVAS_LIMIT);
  assert.ok(tall.strips.length < planStrips(2480, 3508, 2).strips.length);
  assert.ok(2480 * 2 * (tall.rows + tall.pad * 2) * 2 <= CANVAS_LIMIT);
  assert.ok(planStrips(2480, 3508, 2, 1e9).rows * 2480 * 4 <= CANVAS_LIMIT, 'never past the limit');
});

test('strip heights: shrink when cost is per row, go tall when it is fixed', async () => {
  const { nextRows } = await import('./engine');
  // Cost all per row: 1 ms a row, so ~110 rows fit the budget.
  const perRow = [{ rows: 64, ms: 64 }, { rows: 256, ms: 256 }];
  const a = nextRows(perRow, 256, 16, 1024);
  assert.ok(a > 90 && a < 130, `per-row cost gave ${a}`);
  // Cost all fixed: 600 ms whatever the height, so smaller strips only add calls.
  const fixed = [{ rows: 64, ms: 600 }, { rows: 512, ms: 605 }];
  assert.equal(nextRows(fixed, 512, 16, 1024), 1024);
  // One height seen so far: try another.
  assert.notEqual(nextRows([{ rows: 256, ms: 400 }], 256, 16, 1024), 256);
});
