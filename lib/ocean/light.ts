/**
 * Light for a still: the effects too slow for the live timer that a picture
 * drawn once can afford. Called by the picture renderer (lib/ocean/picture).
 *
 * STUB: signatures are fixed; the bodies are being written.
 */

/** The sun or moon at the hour a sitting began, as it reaches into water. */
export interface SunLight {
  /** How far the shafts lean from straight down, radians; morning one way, afternoon the other. */
  tilt: number;
  /** The colour of the light. */
  warmth: string;
  /** 0 at night, 1 at noon. */
  strength: number;
  /** True between dusk and dawn: the moon is what is up there. */
  night: boolean;
}

/** Light for a local hour of day, 0 to 24. */
export function sunFor(hour: number): SunLight {
  const day = hour >= 6 && hour < 19;
  return { tilt: ((hour - 12.5) / 6.5) * 0.35, warmth: day ? '#FFF6E0' : '#DDE6F0', strength: day ? 1 : 0.3, night: !day };
}

/** The moon's phase on a date: 0 new, 0.5 full, back to 1. */
export function moonPhase(date: Date): number {
  const synodic = 29.530588853;
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - known) / 86400000;
  return (((days / synodic) % 1) + 1) % 1;
}

/** The bright circle of sky seen looking up from under the surface, with the sun or moon in it. */
export function drawSnellWindow(
  _ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  _o: { cx: number; cy: number; radius: number; sun: SunLight; moon: number | null; dark: boolean; px: number; seed: number },
): void {}

/** Shafts of light from the surface, darkened behind whatever stands in the water: `occluder` is an alpha mask the size of the canvas, or null. */
export function drawGodRays(
  _ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  _o: { source: { x: number; y: number }; occluder: CanvasImageSource | null; strength: number; sun: SunLight; px: number; seed: number; dark: boolean },
): void {}

/** Things that glow, lighting the water and whatever is near them. Drawn after everything they light. */
export function drawLightPass(
  _ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  _lights: { x: number; y: number; r: number; color: string; strength: number }[],
  _px: number,
): void {}

/** Marine snow at three distances: soft discs near, crisp specks between, dust far. */
export function drawSnowDeep(
  _ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  _o: { seed: number; density: number; color: string; px: number; dark: boolean; litBy?: (x: number, y: number) => number },
): void {}

/** Banding: a whisper of noise over the whole canvas so dark gradients never step. */
export function dither(_ctx: CanvasRenderingContext2D, _w: number, _h: number, _seed: number): void {}
