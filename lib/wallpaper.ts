/* Saving the water as a picture. A screenshot of the deep is soft because the
   live canvases are held to 2x and a pixel budget, so the scene and the jelly
   register here, and are each drawn once more at a size meant to be looked at:
   no chrome, no page rules, nothing faded out of the way of the clock, the
   bell open and the colour back if the sitting is held.

   The layers can only be drawn whole, so "this moment" is one composite as
   large as a canvas safely gets (lib/print draws it onto the page from
   there); "the whole sitting" has no such ceiling, since the picture
   (lib/ocean/picture) draws in strips. */

export interface WallpaperLayer {
  canvas: HTMLCanvasElement;
  /** Draw once at this many canvas pixels to the CSS pixel, as if the layer
      were `size` big: a wallpaper is the screen's shape, not the card's. */
  render: (px: number, size: { w: number; h: number }) => void;
  /** Put the live resolution back and redraw. */
  restore: () => void;
}

const layers = new Set<WallpaperLayer>();

export function registerWallpaperLayer(layer: WallpaperLayer): () => void {
  layers.add(layer);
  return () => {
    layers.delete(layer);
  };
}

export interface Wallpaper {
  blob: Blob;
  width: number;
  height: number;
}

/** A phone or tablet, by what it says it is: a touchscreen laptop reports
    touch too, and the share sheet there is a Windows dialog nobody wanted. */
function handheld(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Whether a saved picture goes to the share sheet (and so needs a fresh tap
    to open it) rather than straight to Downloads. */
export function prefersShareSheet(): boolean {
  if (!handheld()) return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    return Boolean(nav.canShare?.({ files: [new File([new Uint8Array(1)], 'a.png', { type: 'image/png' })] }));
  } catch {
    return false;
  }
}

/* One layer canvas, at most. Each registered layer is drawn this big at once,
   and iOS also caps all canvases together, so a phone gets half. */
function layerBudget(): number {
  return handheld() ? 8_000_000 : 16_000_000;
}

/** The layers inside `root`, in paint order. */
function layersIn(root: HTMLElement): WallpaperLayer[] {
  return [...layers]
    .filter((l) => root.contains(l.canvas))
    .sort((a, b) => (a.canvas.compareDocumentPosition(b.canvas) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

export function hasWallpaperLayers(root: HTMLElement | null | undefined): boolean {
  return Boolean(root && layersIn(root).length);
}

/** The colour the scene stands on, read off the page, for whatever the
    layers leave bare (the paper under a thin wash). */
export function groundBehind(el: HTMLElement): string {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    const m = bg.match(/rgba?\(([^)]+)\)/);
    if (!m) continue;
    const parts = m[1].split(/[ ,/]+/).filter(Boolean);
    const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
    if (alpha > 0.99) return bg;
  }
  const page = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return page || '#F5F1E8';
}

export interface Moment {
  canvas: HTMLCanvasElement;
  /** Canvas pixels per CSS pixel it was drawn at. */
  px: number;
}

/**
 * Everything registered inside `root`, drawn once onto one canvas `shape`
 * (CSS px) big, at `px` canvas pixels each or as near as a canvas allows.
 * The caller owns the canvas; set its width to 0 when done with it.
 */
export function renderMoment(root: HTMLElement, shape: { width: number; height: number }, px: number): Moment | null {
  if (shape.width < 1 || shape.height < 1) return null;
  const inside = layersIn(root);
  if (!inside.length) return null;
  const fit = Math.sqrt(layerBudget() / (shape.width * shape.height));
  const ratio = Math.max(0.5, Math.min(px, fit));
  const out = document.createElement('canvas');
  out.width = Math.round(shape.width * ratio);
  out.height = Math.round(shape.height * ratio);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  try {
    for (const layer of inside) {
      layer.render(ratio, { w: shape.width, h: shape.height });
      ctx.drawImage(layer.canvas, 0, 0, out.width, out.height);
    }
  } finally {
    for (const layer of inside) layer.restore();
  }
  return { canvas: out, px: ratio };
}

/** The screen, in CSS px, the way it is held. */
export function screenShape(): { width: number; height: number; dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  const s = window.screen;
  let width = s?.width || window.innerWidth;
  let height = s?.height || window.innerHeight;
  // iOS reports the portrait size whichever way the device is held.
  const landscape = window.innerWidth > window.innerHeight;
  if (handheld() && landscape !== width > height) [width, height] = [height, width];
  return { width, height, dpr };
}

/** Everything registered inside `root`, in paint order, drawn big onto one
    canvas the shape of the screen it is being looked at on: the screen's own
    pixels at least, three to the point where a canvas allows it. */
export async function renderWallpaper(root: HTMLElement): Promise<Wallpaper | null> {
  const screen = screenShape();
  const moment = renderMoment(root, screen, Math.max(screen.dpr, 3));
  if (!moment) return null;
  const out = moment.canvas;
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  const wall = blob ? { blob, width: out.width, height: out.height } : null;
  out.width = 0;
  out.height = 0;
  return wall;
}

/** Hands the picture to the share sheet on a phone or tablet (so it can
    "Save Image" straight to Photos), and downloads it everywhere else. */
export async function saveWallpaper(wall: Pick<Wallpaper, 'blob'>, name: string): Promise<void> {
  const file = new File([wall.blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (handheld() && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return;
    } catch (e) {
      // Closing the sheet is an answer, not a failure.
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(wall.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
