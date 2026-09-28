/**
 * The chime that ends a block and ends a break.
 *
 * Two problems shape everything here.
 *
 * The first is that `setInterval` is throttled to about once a minute in a
 * backgrounded tab and stops entirely on a sleeping phone, which is exactly
 * where a reader is when their break ends. A chime rung from the timer's tick
 * would arrive whenever the tab next woke, which is to say uselessly. So the
 * note is *scheduled on the Web Audio clock* the moment the break starts:
 * that clock keeps its own time and the sound lands on the second whether or
 * not a single frame ran in between.
 *
 * The second is that iOS suspends the audio context when the screen locks,
 * and a suspended context's clock stops with it, so the note scheduled
 * against it never arrives. Nothing on a web page can prevent that, but it
 * can be noticed: `flushChime` compares the wall clock against when a note was
 * due and rings late rather than not at all. The timer raises a notification
 * alongside, which is the only thing that reaches a phone in a pocket.
 *
 * The sound is a struck glass, not an alarm. See "No Alarmist Indicators" in
 * readmedesign.md: the app does not raise its voice, and a timer that jolts a
 * reader out of their break has defeated the break.
 */

/** `break` announces the rest; `back` announces the end of it. */
export type ChimeKind = 'break' | 'back';

/** Partials of the strike, as multiples of the root, and how loud each sits. */
const PARTIALS: [number, number][] = [
  [1, 0.5],
  [2.01, 0.22],
  [2.98, 0.08],
];

/** Settling down into a break, opening back up out of one. */
const ROOTS: Record<ChimeKind, number[]> = {
  break: [587.33, 440.0],
  back: [523.25, 659.25, 783.99],
};

const PEAK = 0.085;
const DECAY = 1.5;
const SPACING = 0.17;
/** How far past its moment a note must be before it counts as missed. */
const LATE_MS = 1000;

interface LiveNode {
  node: OscillatorNode;
  startsAtMs: number;
}

interface PendingNote {
  kind: ChimeKind;
  dueAtMs: number;
  /** When it sounds on the audio clock, which is the only clock that knows. */
  dueAtCtx: number;
  nodes: OscillatorNode[];
}

let context: AudioContext | null = null;
let live: LiveNode[] = [];
let pending: PendingNote[] = [];

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!context) context = new Ctor();
    return context;
  } catch {
    // A browser that refuses to hand one over must not take the start of a
    // study session down with it. The timer runs silent.
    return null;
  }
}

/**
 * Open the audio context from inside a user gesture.
 *
 * Every browser refuses to start one otherwise, and a context created on a
 * timer callback is born suspended and stays that way, so a note arranged for
 * half an hour later would never sound. Called from the click that starts a
 * session.
 */
export function primeChime(): void {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

function strike(ctx: AudioContext, at: number, atMs: number, root: number, note: PendingNote): void {
  for (const [ratio, level] of PARTIALS) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = root * ratio;

    // Struck, then left to ring out: up in 12ms, then an exponential tail. A
    // linear fade reads as a fade; this reads as a glass.
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(PEAK * level, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + DECAY);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + DECAY + 0.05);
    osc.onended = () => {
      gain.disconnect();
      osc.disconnect();
      live = live.filter((entry) => entry.node !== osc);
    };
    live.push({ node: osc, startsAtMs: atMs });
    note.nodes.push(osc);
  }
}

/**
 * Ring in `delaySeconds`, or now when that is zero.
 *
 * Arranging a note does not disturb one already arranged, because the two
 * that matter are arranged together: the block ends, which rings now, and the
 * break ends, which rings later.
 */
export function scheduleChime(kind: ChimeKind, delaySeconds = 0): void {
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const delay = Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0);
  const start = ctx.currentTime + delay + 0.02;
  const startMs = Date.now() + delay * 1000;
  const note: PendingNote = { kind, dueAtMs: startMs, dueAtCtx: start, nodes: [] };
  pending.push(note);
  ROOTS[kind].forEach((root, i) => {
    strike(ctx, start + i * SPACING, startMs + i * SPACING * 1000, root, note);
  });
}

/** Ring now. */
export function ringChime(kind: ChimeKind): void {
  scheduleChime(kind, 0);
}

/**
 * Ring late rather than not at all.
 *
 * Called when the tab comes back to the front and on every timer tick. A note
 * whose moment has passed on the wall clock while the audio clock has not yet
 * reached it was scheduled against a context that was asleep, and would only
 * sound whenever that context caught up, which is to say at some arbitrary
 * later moment. It is stopped and rung now instead.
 *
 * What decides "played" is the audio clock, not the note's own end. A note
 * lasts over a second and a half from strike to silence, so judging it by
 * when it finished had every chime that rang on time counted as missed a
 * second in, rung again, and that one counted as missed in turn: a break
 * opened on a chime that did not stop.
 */
export function flushChime(): void {
  const ctx = context;
  if (pending.length === 0 || !ctx) return;
  // A context still asleep would swallow the late note too, and the next
  // tick would count that one missed as well. Wake it and wait for it.
  if (ctx.state !== 'running') {
    void ctx.resume().catch(() => {});
    return;
  }
  const now = Date.now();
  const missed: PendingNote[] = [];
  const waiting: PendingNote[] = [];
  for (const note of pending) {
    if (ctx.currentTime >= note.dueAtCtx) continue; // it sounded
    if (now >= note.dueAtMs + LATE_MS) missed.push(note);
    else waiting.push(note);
  }
  pending = waiting;
  if (missed.length === 0) return;
  for (const note of missed) {
    for (const node of note.nodes) {
      try {
        node.onended = null;
        node.stop();
        node.disconnect();
      } catch {
        // Already stopped.
      }
    }
    live = live.filter((entry) => !note.nodes.includes(entry.node));
  }
  // One note, however many were missed. Two chimes stacked because a phone
  // was away for an hour is the alarm this deliberately is not.
  ringChime(missed[missed.length - 1].kind);
}

/**
 * Drop anything arranged but not yet sounding, e.g. a break cut short.
 *
 * Only notes still ahead of the clock are stopped. A chime part-way through
 * ringing is left to finish, because cutting a struck glass off mid-decay is
 * a click, and the thing it was announcing did happen.
 */
export function cancelChime(): void {
  const now = Date.now();
  const future = live.filter((entry) => entry.startsAtMs > now);
  for (const entry of future) {
    try {
      entry.node.onended = null;
      entry.node.stop();
      entry.node.disconnect();
    } catch {
      // Already stopped, which is the state we were asking for.
    }
  }
  live = live.filter((entry) => !future.includes(entry));
  pending = [];
}
