/**
 * An eased fade for a gain: slow off the start, quick through the middle, slow
 * into the end, so a sound arrives and leaves without a step the ear can find.
 * Picks up from wherever the gain is now, so a tap in the middle of a fade
 * turns around smoothly instead of jumping.
 */
export function fadeTo(param: AudioParam, context: BaseAudioContext, target: number, seconds: number) {
  const now = context.currentTime;
  const from = param.value;
  param.cancelScheduledValues(now);
  if (Math.abs(from - target) < 1e-4) {
    param.setValueAtTime(target, now);
    return;
  }
  const steps = 64;
  const curve = new Float32Array(steps);
  for (let i = 0; i < steps; i += 1) {
    const p = i / (steps - 1);
    curve[i] = from + (target - from) * (0.5 - 0.5 * Math.cos(Math.PI * p));
  }
  param.setValueAtTime(from, now);
  param.setValueCurveAtTime(curve, now, seconds);
}

export const FADE_IN = 1.6;
export const FADE_OUT = 1.2;
