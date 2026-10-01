/* Saving the water as a picture. A screenshot of the deep is soft because the
   live canvases are held to 2x and a pixel budget, so the scene and the jelly
   register here, and are each drawn once more at a size meant to be looked at:
   no chrome, no page rules, nothing faded out of the way of the clock, the
   bell open and the colour back if the sitting is held. */

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

/* The long side stops here: past it, phones refuse the canvas to a blob. */
const LONG_SIDE = 4096;

export interface Wallpaper {
  blob: Blob;
  width: number;
  height: number;
}

/** Everything registered inside `root`, in paint order, drawn big onto one
    canvas the shape of the screen it is being looked at on. */
export async function renderWallpaper(root: HTMLElement): Promise<Wallpaper | null> {
  const rect = { width: window.innerWidth, height: window.innerHeight };
  if (rect.width < 1 || rect.height < 1) return null;
  const inside = [...layers]
    .filter((l) => root.contains(l.canvas))
    .sort((a, b) => (a.canvas.compareDocumentPosition(b.canvas) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  if (!inside.length) return null;

  const px = Math.min(Math.max(window.devicePixelRatio || 1, 3), LONG_SIDE / Math.max(rect.width, rect.height));
  const out = document.createElement('canvas');
  out.width = Math.round(rect.width * px);
  out.height = Math.round(rect.height * px);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  try {
    for (const layer of inside) {
      layer.render(px, { w: rect.width, h: rect.height });
      ctx.drawImage(layer.canvas, 0, 0, out.width, out.height);
    }
  } finally {
    for (const layer of inside) layer.restore();
  }
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  return blob ? { blob, width: out.width, height: out.height } : null;
}

/** Hands the picture to the share sheet where there is one (so a phone can
    "Save Image" straight to Photos), and downloads it where there isn't. */
export async function saveWallpaper(wall: Wallpaper, name: string): Promise<void> {
  const file = new File([wall.blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (touch && nav.canShare?.({ files: [file] })) {
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
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
