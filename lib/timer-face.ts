/**
 * What the clock face reads, wherever a clock is drawn: the timer, the dock
 * and the tab all show the same number, so a glance at any of them agrees.
 *
 * It is always the *current stretch*. After a break the face starts again on
 * the new block rather than carrying the whole session, whose running total
 * is shown beside it as the secondary number (`focusSeconds`).
 *
 * - A break counts down to its length, then up past it.
 * - A block counts down to its target, then up past it as overrun.
 * - An open stretch counts up.
 */
export interface FaceInput {
  onBreak: boolean;
  /** The break's length in seconds, or null. */
  breakTarget: number | null;
  /** The block's target in seconds, or null for an open session. */
  target: number | null;
  /** Seconds into the current stretch. */
  elapsed: number;
}

export interface Face {
  /** What the digits say. */
  seconds: number;
  /** Past the stretch's length: a break run long, or a block into overrun. */
  over: boolean;
  /** Whether the digits are counting down to something. */
  countdown: boolean;
}

export function stretchFace({ onBreak, breakTarget, target, elapsed }: FaceInput): Face {
  const e = Math.max(0, Math.floor(elapsed));
  const length = onBreak ? breakTarget : target;
  if (length == null) return { seconds: e, over: false, countdown: false };
  // A break reads "over" the second it reaches its length; a block only once
  // it has actually gone past, so 00:00 is the block's last second, not its
  // first second of overrun.
  const over = onBreak ? e >= length : e > length;
  return { seconds: Math.abs(length - e), over, countdown: !over };
}

/** Whether a session has a finished block behind the one on the clock, which
    is when its running total means something different from the face. */
export function hasEarlierBlock(segments: { kind: 'focus' | 'break' }[]): boolean {
  return segments.some((segment) => segment.kind === 'focus');
}
