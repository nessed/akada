/* What a picture can be saved at. Two kinds: the screen it is being looked
   at on, at that screen's own pixels and full bleed, for a wallpaper; and a
   print, at 300 dpi in the shapes frames are sold in, on a paper margin. */

export type PrintSizeId = 'a4' | 'a3' | 'a2' | 'in8x10' | 'in12x18' | 'in18x24';
export type SizeId = 'screen' | PrintSizeId;

export const PRINT_DPI = 300;

export interface PrintSize {
  id: PrintSizeId;
  /** What the choice says: "A4", "8 × 10". */
  label: string;
  /** Portrait, in inches. */
  inches: { w: number; h: number };
}

const MM = 1 / 25.4;

export const PRINT_SIZES: Record<PrintSizeId, PrintSize> = {
  a4: { id: 'a4', label: 'A4', inches: { w: 210 * MM, h: 297 * MM } },
  a3: { id: 'a3', label: 'A3', inches: { w: 297 * MM, h: 420 * MM } },
  a2: { id: 'a2', label: 'A2', inches: { w: 420 * MM, h: 594 * MM } },
  in8x10: { id: 'in8x10', label: '8 × 10', inches: { w: 8, h: 10 } },
  in12x18: { id: 'in12x18', label: '12 × 18', inches: { w: 12, h: 18 } },
  in18x24: { id: 'in18x24', label: '18 × 24', inches: { w: 18, h: 24 } },
};

/** Device pixels of a print at the print resolution: A4 is 2480 × 3508. */
export function printPixels(id: PrintSizeId, dpi = PRINT_DPI): { width: number; height: number } {
  const { w, h } = PRINT_SIZES[id].inches;
  return { width: Math.round(w * dpi), height: Math.round(h * dpi) };
}

/**
 * Three print sizes are offered, not six: the ISO ones, or the inch ones
 * where paper is sold in inches. The rest stay reachable by id.
 */
export function printChoices(locale: string | undefined): PrintSizeId[] {
  const inches = /^en-(US|CA)$|^es-(US|MX)$|^fr-CA$/i.test(locale ?? '');
  return inches ? ['in8x10', 'in12x18', 'in18x24'] : ['a4', 'a3', 'a2'];
}

export interface Screen {
  /** CSS pixels, as `screen.width` and `screen.height` report them. */
  width: number;
  height: number;
  dpr: number;
}

/**
 * The screen's own pixels: an iPhone 15 is 1179 × 2556, a 5K display
 * 5120 × 2880. Not capped: the engine draws in strips, so the size of the
 * output is not the size of any canvas.
 */
export function screenPixels(s: Screen): { width: number; height: number } {
  const dpr = s.dpr > 0 ? s.dpr : 1;
  return {
    width: Math.max(1, Math.round(s.width * dpr)),
    height: Math.max(1, Math.round(s.height * dpr)),
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameLayout {
  width: number;
  height: number;
  /** The pressed plate. */
  plate: Rect;
  /** Where the picture is drawn; its deckled edge eats in from here. */
  picture: Rect;
  /** How far in the deckle reaches at most, and how soft it is, in px. */
  deckle: { reach: number; feather: number };
}

/**
 * The margins of a print. The paper is weighted to the foot, the way a mount
 * is cut, the plate sits inside that, and the picture inside the plate with
 * a band of bare pressed paper round it. All proportional to the short side,
 * so A2 is A4 enlarged and not A4 with more room.
 */
export function frameLayout(width: number, height: number): FrameLayout {
  const s = Math.min(width, height);
  const side = Math.round(s * 0.085);
  const top = side;
  const foot = Math.round(s * 0.108);
  const plate: Rect = { x: side, y: top, w: width - side * 2, h: height - top - foot };
  const gap = Math.round(s * 0.026);
  const picture: Rect = { x: plate.x + gap, y: plate.y + gap, w: plate.w - gap * 2, h: plate.h - gap * 2 };
  return {
    width,
    height,
    plate,
    picture,
    deckle: { reach: Math.max(2, s * 0.012), feather: Math.max(1.5, s * 0.006) },
  };
}

/**
 * The shape `planPicture` is asked for, in CSS px, and the device px per CSS
 * px it is drawn at. A screen is its own CSS size at its own ratio. A print
 * is laid out as one long side of 1200 whatever the paper, so the same
 * sitting comes out as the same picture at A4 and at A2, only larger.
 */
export const PRINT_LAYOUT_LONG_SIDE = 1200;

export function pictureShape(
  device: { width: number; height: number },
  screen?: Screen | null,
): { width: number; height: number; px: number } {
  if (screen) {
    const dpr = screen.dpr > 0 ? screen.dpr : 1;
    return { width: device.width / dpr, height: device.height / dpr, px: dpr };
  }
  const px = Math.max(device.width, device.height) / PRINT_LAYOUT_LONG_SIDE;
  return { width: device.width / px, height: device.height / px, px };
}
