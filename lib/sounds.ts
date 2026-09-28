/**
 * The small sounds the page makes under a finger.
 *
 * Everything here is synthesised on the Web Audio clock, nothing is a file.
 * A sample would be a download on first tap and a decode after it, and the
 * one thing a tap sound cannot be is late. It also means every strike is a
 * little different: each one is detuned by a percent or two and struck a
 * touch harder or softer, the way a pencil never lands on a desk twice the
 * same, so a run of ticks down a list does not sound like a machine gun.
 *
 * The palette is three materials. **Wood** for things done to the page (a
 * tap, a tick, a knock): a few inharmonic modes that die inside a tenth of a
 * second, over a click of filtered noise for the contact. **Bubble** for
 * things that turn on or come up: a sine that rises as it fades. **Paper** for
 * things that go away: a swish of band-passed noise sweeping down. The timer
 * gets a mallet, which is wood left to ring a little longer.
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
  | 'bubble'
  | 'drop'
  | 'paper'
  | 'bright'
  | 'start'
  | 'pause'
  | 'stop';

/** What each one is for, and the word Settings lets a reader audition it by. */
export const SOUNDS: { name: SoundName; word: string }[] = [
  { name: 'tap', word: 'tap' },
  { name: 'knock', word: 'knock' },
  { name: 'tick', word: 'tick' },
  { name: 'bubble', word: 'bubble' },
  { name: 'paper', word: 'paper' },
  { name: 'start', word: 'start' },
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

/** A percent or two either way. */
function jitter(amount = 0.02): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}

interface ToneOptions {
  at: number;
  peak: number;
  decay: number;
  attack?: number;
  type?: OscillatorType;
  /** Where the pitch slides to, and how long it takes. */
  glideTo?: number;
  glide?: number;
}

function tone(ctx: AudioContext, freq: number, o: ToneOptions): void {
  if (!master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const attack = o.attack ?? 0.002;
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, o.at);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, o.at + (o.glide ?? o.decay));
  gain.gain.setValueAtTime(0.0001, o.at);
  gain.gain.exponentialRampToValueAtTime(o.peak, o.at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, o.at + attack + o.decay);
  osc.connect(gain);
  gain.connect(master);
  osc.start(o.at);
  osc.stop(o.at + attack + o.decay + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
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
 * A block of hardwood. The overtones sit at the ratios a struck bar actually
 * has, not at whole multiples, which is most of why it reads as wood rather
 * than as a beep; and the pitch drops a hair on the strike, the way a real
 * one does as it stops flexing.
 */
function wood(ctx: AudioContext, at: number, freq: number, level: number): void {
  const f = freq * jitter();
  const v = level * jitter(0.1);
  tone(ctx, f * 1.03, { at, peak: v, decay: 0.085, glideTo: f, glide: 0.02 });
  tone(ctx, f * 2.76, { at, peak: v * 0.32, decay: 0.045 });
  tone(ctx, f * 5.4, { at, peak: v * 0.1, decay: 0.025 });
  hiss(ctx, { at, peak: v * 0.5, decay: 0.012, freq: f * 3.2, q: 1.6 });
}

/** Wood left to ring: a marimba bar under a soft mallet. */
function mallet(ctx: AudioContext, at: number, freq: number, level: number): void {
  const f = freq * jitter(0.006);
  const v = level * jitter(0.08);
  tone(ctx, f, { at, peak: v, attack: 0.004, decay: 0.42 });
  tone(ctx, f * 3.93, { at, peak: v * 0.18, decay: 0.09 });
  tone(ctx, f * 9.2, { at, peak: v * 0.05, decay: 0.03 });
  hiss(ctx, { at, peak: v * 0.25, decay: 0.01, freq: f * 4, q: 1.2 });
}

/** A bubble coming up to the surface: a pure tone rising as it goes. */
function bubble(ctx: AudioContext, at: number, freq: number, level: number, down = false): void {
  const f = freq * jitter(0.04);
  const v = level * jitter(0.1);
  tone(ctx, f, {
    at,
    peak: v,
    attack: 0.004,
    decay: 0.085,
    glideTo: down ? f * 0.5 : f * 2.3,
    glide: 0.07,
  });
  // The film breaking, very faint.
  tone(ctx, f * (down ? 1.4 : 3.1), { at: at + 0.004, peak: v * 0.08, decay: 0.03, type: 'triangle' });
}

/** A page turned, or a slip pulled off the desk. */
function paper(ctx: AudioContext, at: number, level: number): void {
  const v = level * jitter(0.12);
  const f = 2600 * jitter(0.08);
  hiss(ctx, { at, peak: v, attack: 0.03, decay: 0.16, freq: f, sweepTo: f * 0.42, q: 0.9 });
  hiss(ctx, { at: at + 0.02, peak: v * 0.4, attack: 0.01, decay: 0.07, freq: 5200, q: 2 });
}

const VOICES: Record<SoundName, (ctx: AudioContext, t: number) => void> = {
  // A pencil set down on the desk. The default for anything pressed.
  tap: (ctx, t) => wood(ctx, t, 1150, 0.075),
  // Lower and fuller: a choice made, a place moved to.
  knock: (ctx, t) => wood(ctx, t, 560, 0.12),
  // Done. A firm tok, then a small bubble up out of it.
  tick: (ctx, t) => {
    wood(ctx, t, 760, 0.12);
    bubble(ctx, t + 0.055, 620, 0.075);
  },
  // Undone, which is not a failure, so it is only softer and lower.
  untick: (ctx, t) => wood(ctx, t, 430, 0.09),
  bubble: (ctx, t) => bubble(ctx, t, 420, 0.1),
  drop: (ctx, t) => bubble(ctx, t, 900, 0.08, true),
  paper: (ctx, t) => paper(ctx, t, 0.16),
  // Two bubbles, the second higher. Remembered clearly.
  bright: (ctx, t) => {
    bubble(ctx, t, 460, 0.085);
    bubble(ctx, t + 0.07, 690, 0.075);
  },
  // A sitting begins: two bars, a fifth apart, going up.
  start: (ctx, t) => {
    mallet(ctx, t, 392, 0.11);
    mallet(ctx, t + 0.09, 587.33, 0.1);
  },
  // Held. One low bar.
  pause: (ctx, t) => mallet(ctx, t, 293.66, 0.1),
  // Put down: the fifth again, coming home.
  stop: (ctx, t) => {
    mallet(ctx, t, 587.33, 0.09);
    mallet(ctx, t + 0.1, 392, 0.1);
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
