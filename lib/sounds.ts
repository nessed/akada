/**
 * The small sounds the page makes under a finger.
 *
 * Everything here is synthesised on the Web Audio clock, nothing is a file.
 * A sample would be a download on first tap and a decode after it, and the
 * one thing a tap sound cannot be is late.
 *
 * **There is no oscillator in this file, on purpose.** Every sound is a burst
 * of noise (the contact) rung through tuned resonators (the object), which is
 * how a desk, a pencil or a book actually makes its sound. The first palette
 * built its wood, its bubbles and the timer's marimba out of sine waves, and
 * every one of them read as a synth, because a pure tone at a steady pitch is
 * a beep however it is shaped. Noise has no steady pitch to give it away, and
 * no two hits are the same grain, so ten ticks down a list do not sound like a
 * machine.
 *
 * Two materials. **Wood** for something done to the page: a pencil tip for a
 * tap, a knuckle for a knock, a pencil stroke for a tick, a book opened, set
 * down or closed for the timer. **Paper** for something put away.
 *
 * All of it sits well under the chime (lib/chime.ts), which is the one sound
 * that has something to announce. These only answer a finger.
 */

import { readPreferences } from './preferences';

export type SoundName =
  | 'tap'
  | 'knock'
  | 'tick'
  | 'untick'
  | 'paper'
  | 'start'
  | 'pause'
  | 'stop';

/** What each one is for, and the word Settings lets a reader audition it by. */
export const SOUNDS: { name: SoundName; word: string }[] = [
  { name: 'tap', word: 'tap' },
  { name: 'knock', word: 'knock' },
  { name: 'tick', word: 'tick' },
  { name: 'paper', word: 'paper' },
  { name: 'start', word: 'start' },
  { name: 'pause', word: 'pause' },
  { name: 'stop', word: 'stop' },
];

const MASTER = 0.75;
/** The same sound twice inside this is one finger bouncing, not two taps. */
const REPEAT_MS = 35;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let queued: ReturnType<typeof setTimeout> | null = null;
const lastPlayed = new Map<SoundName, number>();

function enabled(): boolean {
  try {
    return readPreferences().uiSounds;
  } catch {
    return false;
  }
}

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!context) {
      const Ctor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = MASTER;
      // Takes the fizz off the noise without dulling the wood.
      const soften = context.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 7000;
      master.connect(soften);
      soften.connect(context.destination);
    }
    return context;
  } catch {
    return null;
  }
}

/**
 * Open the context from inside the gesture. Safari will not start one
 * anywhere else, and a sound queued a tick after the click is no longer
 * inside it.
 */
export function unlockSounds(): void {
  if (!enabled()) return;
  const ctx = audioContext();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.5);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

let impulseBuffer: AudioBuffer | null = null;

/**
 * The moment of contact: a click a few samples wide with unit area. A single
 * sample would do on paper, but a buffer started between two samples is
 * interpolated, and one sample smeared that way came out anywhere from a
 * quarter to four times as loud depending on where the hit landed. A smooth
 * pulse this short is still a click to the ear and survives the smearing.
 */
function impulse(ctx: AudioContext): AudioBuffer {
  if (impulseBuffer) return impulseBuffer;
  const width = 6;
  impulseBuffer = ctx.createBuffer(1, 128, ctx.sampleRate);
  const data = impulseBuffer.getChannelData(0);
  for (let i = 0; i < width; i += 1) {
    data[i + 1] = (1 - Math.cos((2 * Math.PI * (i + 1)) / (width + 1))) / (width + 1);
  }
  return impulseBuffer;
}

/** How much surface noise rides on the contact, against the impulse. */
const GRAIN = 0.02;

/** A percent or two either way. */
function jitter(amount = 0.02): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}

interface NoiseOptions {
  at: number;
  peak: number;
  decay: number;
  freq: number;
  q: number;
  attack?: number;
  sweepTo?: number;
}

function hiss(ctx: AudioContext, o: NoiseOptions): void {
  if (!master) return;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const attack = o.attack ?? 0.001;
  src.buffer = noise(ctx);
  gain.gain.value = 0;
  filter.type = 'bandpass';
  filter.Q.value = o.q;
  filter.frequency.setValueAtTime(o.freq, o.at);
  if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, o.at + attack + o.decay);
  gain.gain.setValueAtTime(0.0001, o.at);
  gain.gain.exponentialRampToValueAtTime(o.peak, o.at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, o.at + attack + o.decay);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  // A random offset into the buffer, so no two contacts are the same grain.
  src.start(o.at, Math.random() * 0.3);
  src.stop(o.at + attack + o.decay + 0.02);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/**
 * Something solid being hit, built the way the thing itself makes the sound:
 * a burst of noise (the contact) rung through a few tuned resonators (the
 * body). Nothing here is an oscillator, so there is no steady pitch to give
 * it away as a beep; the body only rings as long as its resonances let it,
 * and every hit is a different grain of noise.
 *
 * `modes` are the body's resonances as [Hz, Q, level]. A higher Q rings
 * longer. `soft` is how dull the striker is: the cutoff on the contact noise,
 * a fingertip or a felt low, a pencil high.
 */
function body(
  ctx: AudioContext,
  at: number,
  modes: [number, number, number][],
  { level, soft, contact = 0.006 }: { level: number; soft: number; contact?: number },
): void {
  if (!master) return;
  const out = ctx.createGain();
  out.gain.value = level * jitter(0.1);
  out.connect(master);

  // The contact is an impulse, so every hit carries the same energy into
  // the body and a knock is as loud as the last one; a short burst of noise
  // alone swung by 4x from one hit to the next, on luck. The noise is laid
  // over it quietly, for the grain of the surface, and kept out of the low
  // end: a low body rings on whatever lands under a few hundred Hz, and that
  // is where the luck was.
  const striker = ctx.createBiquadFilter();
  striker.type = 'lowpass';
  striker.frequency.value = soft;
  const click = ctx.createBufferSource();
  click.buffer = impulse(ctx);
  click.connect(striker);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const grain = ctx.createGain();
  // Silent until the envelope starts. A gain's resting value is 1, and a
  // source starting on the same sample as its first automation event can
  // let a few samples through at that level: a random spike that made one
  // closing book four times louder than the next.
  grain.gain.value = 0;
  grain.gain.setValueAtTime(0.0001, at);
  grain.gain.exponentialRampToValueAtTime(GRAIN, at + 0.0008);
  grain.gain.exponentialRampToValueAtTime(0.0001, at + contact);
  const surface = ctx.createBiquadFilter();
  surface.type = 'highpass';
  surface.frequency.value = 1500;
  src.connect(surface);
  surface.connect(grain);
  grain.connect(striker);
  const hit = striker;

  const pitch = jitter(0.025);
  const nodes: AudioNode[] = [out, striker, surface, grain, click];
  let ring = 0;
  for (const [freq, q, gain] of modes) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * pitch;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    hit.connect(bp);
    bp.connect(g);
    g.connect(out);
    nodes.push(bp, g);
    ring = Math.max(ring, (q / (Math.PI * freq)) * 7);
  }
  click.start(at);
  src.start(at, Math.random() * 0.3);
  src.stop(at + contact + 0.01);
  // The resonators keep ringing after the source stops; let go once they have.
  setTimeout(() => {
    src.disconnect();
    for (const node of nodes) node.disconnect();
  }, (at - ctx.currentTime + contact + ring) * 1000 + 100);
}

/** A page turned, or a slip pulled off the desk. */
function paper(ctx: AudioContext, at: number, level: number): void {
  const v = level * jitter(0.12);
  const f = 2600 * jitter(0.08);
  hiss(ctx, { at, peak: v, attack: 0.03, decay: 0.16, freq: f, sweepTo: f * 0.42, q: 0.9 });
  hiss(ctx, { at: at + 0.02, peak: v * 0.4, attack: 0.01, decay: 0.07, freq: 5200, q: 2 });
}

const VOICES: Record<SoundName, (ctx: AudioContext, t: number) => void> = {
  // A pencil tip set down on the desk. The default for anything pressed, so
  // the smallest and quietest thing here.
  tap: (ctx, t) =>
    body(
      ctx,
      t,
      [
        [1850, 28, 1],
        [3300, 24, 0.45],
        [5100, 18, 0.2],
      ],
      { level: 4.6, soft: 7000, contact: 0.003 },
    ),
  // A knuckle on the lid of a small wooden box: a choice made, a place moved
  // to, "hazy" in recall.
  knock: (ctx, t) =>
    body(
      ctx,
      t,
      [
        [410, 26, 1],
        [960, 22, 0.5],
        [1820, 16, 0.22],
      ],
      { level: 15.7, soft: 2600, contact: 0.005 },
    ),
  // Done: a pencil stroke across paper, landing on the desk.
  tick: (ctx, t) => {
    const f = 3200 * jitter(0.1);
    hiss(ctx, { at: t, peak: 0.035, attack: 0.012, decay: 0.03, freq: f, sweepTo: f * 1.5, q: 1.4 });
    body(
      ctx,
      t + 0.038,
      [
        [1250, 26, 1],
        [2700, 22, 0.45],
        [4300, 16, 0.2],
      ],
      { level: 7, soft: 5000, contact: 0.004 },
    );
  },
  // Undone, which is not a failure, so only a softer, duller knock.
  untick: (ctx, t) =>
    body(
      ctx,
      t,
      [
        [290, 20, 1],
        [680, 16, 0.4],
      ],
      { level: 19, soft: 1400, contact: 0.006 },
    ),
  paper: (ctx, t) => paper(ctx, t, 0.16),
  // A sitting begins: a book opened. The cover set back on the desk, then
  // the pages falling open after it.
  start: (ctx, t) => {
    body(
      ctx,
      t,
      [
        [135, 10, 1],
        [320, 12, 0.5],
        [740, 8, 0.25],
      ],
      { level: 15.5, soft: 1800, contact: 0.008 },
    );
    for (let i = 0; i < 3; i += 1) {
      const f = 3000 * jitter(0.15);
      hiss(ctx, {
        at: t + 0.05 + i * 0.028 * jitter(0.2),
        peak: 0.03 * (1 - i * 0.2),
        attack: 0.004,
        decay: 0.022,
        freq: f,
        sweepTo: f * 0.7,
        q: 1.1,
      });
    }
  },
  // Held: a knuckle set down on a wooden desk. Soft, low, over at once.
  pause: (ctx, t) =>
    body(
      ctx,
      t,
      [
        [165, 22, 1],
        [372, 20, 0.55],
        [690, 16, 0.28],
        [1310, 12, 0.1],
      ],
      { level: 27.5, soft: 1100, contact: 0.007 },
    ),
  // Put away: a hardback closed. The air pushed out of the pages, then the
  // covers meeting with the weight of the book behind them.
  stop: (ctx, t) => {
    hiss(ctx, { at: t, peak: 0.025, attack: 0.07, decay: 0.02, freq: 650, sweepTo: 1100, q: 0.7 });
    body(
      ctx,
      t + 0.085,
      [
        [92, 7, 1],
        [215, 9, 0.6],
        [480, 7, 0.3],
        [1150, 4, 0.12],
      ],
      { level: 10.7, soft: 2400, contact: 0.012 },
    );
    hiss(ctx, { at: t + 0.085, peak: 0.022, decay: 0.035, freq: 1900, q: 1 });
  },
};

function strike(name: SoundName, ctx: AudioContext): void {
  VOICES[name](ctx, ctx.currentTime + 0.005);
}

/**
 * Play one now. A sound played from a handler wins over the plain tap the
 * click would otherwise have made (see `queueSound`), so a button that has
 * something particular to say says only that.
 */
export function playSound(name: SoundName, { force = false } = {}): void {
  if (queued) {
    clearTimeout(queued);
    queued = null;
  }
  if (!force && !enabled()) return;
  const now = Date.now();
  if (now - (lastPlayed.get(name) ?? 0) < REPEAT_MS) return;
  lastPlayed.set(name, now);
  const ctx = audioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'running') strike(name, ctx);
    else void ctx.resume().then(() => strike(name, ctx)).catch(() => {});
  } catch {
    // A sound is never worth an error in the middle of a tap.
  }
}

/**
 * The sound a click makes when nothing more particular claims it.
 *
 * Deferred a turn of the event loop, because the click listener that calls
 * this runs before the button's own handler does: if the handler plays
 * something of its own, that one clears this before it sounds.
 */
export function queueSound(name: SoundName): void {
  if (queued) clearTimeout(queued);
  queued = setTimeout(() => {
    queued = null;
    playSound(name);
  }, 0);
}

export function isSoundName(value: string | null | undefined): value is SoundName {
  return !!value && Object.prototype.hasOwnProperty.call(VOICES, value);
}
