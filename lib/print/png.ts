/* A PNG written as it is drawn. A print at 300 dpi is tens of millions of
   pixels, more than a phone will hand to `canvas.toBlob` in one piece, so
   the picture arrives a strip of rows at a time and each strip is filtered
   and pushed through the browser's own deflate (`CompressionStream`, which
   writes the zlib format IDAT wants) while the next is being painted. Only
   the compressed bytes are kept. */

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Running CRC-32 (the PNG one). Start from 0xffffffff, finish with `~c >>> 0`. */
function crcUpdate(crc: number, bytes: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return c;
}

export function crc32(bytes: Uint8Array): number {
  return ~crcUpdate(0xffffffff, bytes) >>> 0;
}

function u32(out: Uint8Array, at: number, value: number) {
  out[at] = (value >>> 24) & 0xff;
  out[at + 1] = (value >>> 16) & 0xff;
  out[at + 2] = (value >>> 8) & 0xff;
  out[at + 3] = value & 0xff;
}

/** One chunk: length, type, data, and the CRC over type and data. */
export function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length);
  u32(out, 0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  u32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export type PngFilter = 'none' | 'sub' | 'up' | 'paeth';
const FILTER_BYTE: Record<PngFilter, number> = { none: 0, sub: 1, up: 2, paeth: 4 };

export interface PngOptions {
  /** Keep the alpha channel. A print is opaque, and RGB is a quarter smaller. */
  alpha?: boolean;
  /** Written as pHYs, so a print shop (and Preview) reads the size in inches. */
  dpi?: number;
  /** Paeth by default: the best of the four on painted gradients. */
  filter?: PngFilter;
}

/* IDAT chunks are cut at about this many compressed bytes. */
const IDAT_TARGET = 256 * 1024;

/**
 * A PNG built row by row. `pushRows` takes RGBA rows as `getImageData` gives
 * them; `finish` returns the file. Rows must arrive in order, all of them.
 */
export class PngStream {
  readonly width: number;
  readonly height: number;
  private readonly bpp: number;
  private readonly filter: PngFilter;
  private readonly parts: Uint8Array<ArrayBuffer>[] = [];
  private prev: Uint8Array;
  private cur: Uint8Array;
  private rowsIn = 0;
  private readonly writer: WritableStreamDefaultWriter<BufferSource>;
  private readonly drained: Promise<void>;
  private failed: unknown = null;

  constructor(width: number, height: number, options: PngOptions = {}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`A PNG needs a whole size, got ${width}×${height}`);
    }
    this.width = width;
    this.height = height;
    this.bpp = options.alpha ? 4 : 3;
    this.filter = options.filter ?? 'paeth';
    this.prev = new Uint8Array(width * this.bpp);
    this.cur = new Uint8Array(width * this.bpp);

    const ihdr = new Uint8Array(13);
    u32(ihdr, 0, width);
    u32(ihdr, 4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = options.alpha ? 6 : 2; // RGBA or RGB
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // adaptive filtering
    ihdr[12] = 0; // no interlace
    this.parts.push(new Uint8Array(SIGNATURE), pngChunk('IHDR', ihdr));
    // Canvas pixels are sRGB; saying so keeps a print shop from guessing.
    this.parts.push(pngChunk('sRGB', new Uint8Array([0])));
    if (options.dpi && options.dpi > 0) {
      const phys = new Uint8Array(9);
      const perMetre = Math.round(options.dpi / 0.0254);
      u32(phys, 0, perMetre);
      u32(phys, 4, perMetre);
      phys[8] = 1;
      this.parts.push(pngChunk('pHYs', phys));
    }

    const deflate = new CompressionStream('deflate');
    this.writer = deflate.writable.getWriter();
    this.drained = this.drain(deflate.readable);
    // A failure surfaces through `drained`; this only keeps it from being
    // reported as unhandled before `finish` gets to it.
    this.drained.catch(() => {});
  }

  private async drain(readable: ReadableStream<Uint8Array>) {
    const reader = readable.getReader();
    let pending: Uint8Array[] = [];
    let size = 0;
    const flush = () => {
      if (!size) return;
      const data = new Uint8Array(size);
      let at = 0;
      for (const piece of pending) {
        data.set(piece, at);
        at += piece.length;
      }
      this.parts.push(pngChunk('IDAT', data));
      pending = [];
      size = 0;
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        pending.push(value);
        size += value.length;
        if (size >= IDAT_TARGET) flush();
      }
      flush();
    } catch (e) {
      this.failed = e;
      throw e;
    }
  }

  /** Rows still to come. */
  get remaining(): number {
    return this.height - this.rowsIn;
  }

  /**
   * Adds `rows` rows of RGBA, `stride` bytes apart (the width times four, as
   * ImageData lays them out). Resolves when deflate is ready for more.
   */
  async pushRows(rgba: ArrayLike<number>, rows: number, stride = this.width * 4): Promise<void> {
    if (this.failed) throw this.failed;
    if (rows > this.remaining) throw new RangeError('More rows than the picture is tall');
    const { width, bpp } = this;
    const line = width * bpp;
    const out = new Uint8Array(rows * (line + 1));
    const filterByte = FILTER_BYTE[this.filter];
    for (let r = 0; r < rows; r += 1) {
      const src = r * stride;
      const cur = this.cur;
      if (bpp === 4) {
        for (let i = 0; i < line; i += 1) cur[i] = rgba[src + i];
      } else {
        for (let x = 0, s = src, d = 0; x < width; x += 1, s += 4, d += 3) {
          cur[d] = rgba[s];
          cur[d + 1] = rgba[s + 1];
          cur[d + 2] = rgba[s + 2];
        }
      }
      const base = r * (line + 1);
      out[base] = filterByte;
      filterRow(this.filter, cur, this.prev, bpp, out, base + 1);
      this.cur = this.prev;
      this.prev = cur;
    }
    this.rowsIn += rows;
    await this.writer.ready;
    await this.writer.write(out);
  }

  /** The finished file. Every row has to have been pushed. */
  async finish(): Promise<Blob> {
    if (this.remaining !== 0) throw new Error(`${this.remaining} rows were never drawn`);
    await this.writer.close();
    await this.drained;
    this.parts.push(pngChunk('IEND', new Uint8Array(0)));
    return new Blob(this.parts, { type: 'image/png' });
  }

  /** Stops early and lets the compressed bytes go. */
  abort(reason?: unknown): void {
    this.parts.length = 0;
    void this.writer.abort(reason).catch(() => {});
  }
}

function filterRow(
  filter: PngFilter,
  cur: Uint8Array,
  prev: Uint8Array,
  bpp: number,
  out: Uint8Array,
  at: number,
) {
  const n = cur.length;
  switch (filter) {
    case 'none':
      out.set(cur, at);
      return;
    case 'sub':
      for (let i = 0; i < n; i += 1) out[at + i] = (cur[i] - (i >= bpp ? cur[i - bpp] : 0)) & 0xff;
      return;
    case 'up':
      for (let i = 0; i < n; i += 1) out[at + i] = (cur[i] - prev[i]) & 0xff;
      return;
    case 'paeth':
      for (let i = 0; i < n; i += 1) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c;
        const pa = p > a ? p - a : a - p;
        const pb = p > b ? p - b : b - p;
        const pc = p > c ? p - c : c - p;
        const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        out[at + i] = (cur[i] - pred) & 0xff;
      }
      return;
  }
}

/** A whole RGBA buffer to a PNG in one call (tests, small pictures). */
export async function encodePng(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: PngOptions = {},
): Promise<Blob> {
  const png = new PngStream(width, height, options);
  await png.pushRows(rgba, height);
  return png.finish();
}
