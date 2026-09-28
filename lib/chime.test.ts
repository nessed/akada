import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
// Nothing in the module touches `window` until a chime is asked for, so the
// stand-in below is in place in time.
import { cancelChime, flushChime, ringChime, scheduleChime } from './chime';

/* A stand-in for Web Audio: a clock that only moves when told to, and a
   count of every note struck against it. */
class FakeOscillator {
  frequency = { value: 0 };
  onended: (() => void) | null = null;
  startAt = 0;
  stopped = false;
  constructor(private readonly ctx: FakeContext) {}
  connect() {}
  disconnect() {}
  start(at: number) {
    this.startAt = at;
    this.ctx.struck.push(this);
  }
  /** A stop with no time is a cut; the chime's own stops are all scheduled. */
  stop(at?: number) {
    if (at === undefined) this.stopped = true;
  }
}

class FakeContext {
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  destination = {};
  struck: FakeOscillator[] = [];
  resumes = 0;
  resume() {
    this.resumes += 1;
    return Promise.resolve();
  }
  createOscillator() {
    return new FakeOscillator(this);
  }
  createGain() {
    const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
    return { gain: param, connect() {}, disconnect() {} };
  }
}

const ctx = new FakeContext();
(globalThis as unknown as { window: unknown }).window = { AudioContext: function () { return ctx; } };

let wall = Date.UTC(2026, 8, 28, 14, 0);
Date.now = () => wall;

/** Let `seconds` pass on both clocks, or only the wall's when the audio sleeps. */
function pass(seconds: number, audioToo = true) {
  wall += seconds * 1000;
  if (audioToo) ctx.currentTime += seconds;
}

/** Strikes per chime: three partials under each root. */
const BREAK_NOTES = 2 * 3;
const BACK_NOTES = 3 * 3;

beforeEach(() => {
  cancelChime();
  ctx.struck = [];
  ctx.state = 'running';
  ctx.resumes = 0;
});

test('a chime that rang on time is not rung again while it is still ringing', () => {
  ringChime('break');
  assert.equal(ctx.struck.length, BREAK_NOTES);
  // The timer ticks every second; the glass takes over a second and a half
  // to go quiet. It used to be counted missed here and struck again, forever.
  for (let i = 0; i < 10; i += 1) {
    pass(1);
    flushChime();
  }
  assert.equal(ctx.struck.length, BREAK_NOTES);
});

test('a note still ahead of the clock is left to ring on its own', () => {
  scheduleChime('back', 300);
  pass(120);
  flushChime();
  assert.equal(ctx.struck.length, BACK_NOTES);
  assert.ok(ctx.struck.every((osc) => !osc.stopped));
});

test('a note the audio clock slept through is rung once, late, and the stale one dropped', () => {
  scheduleChime('back', 300);
  // A locked phone: the wall moves, the audio clock does not.
  pass(400, false);
  flushChime();
  assert.equal(ctx.struck.length, BACK_NOTES * 2);
  assert.ok(ctx.struck.slice(0, BACK_NOTES).every((osc) => osc.stopped));
  // And the late one is not then counted missed in its turn.
  for (let i = 0; i < 5; i += 1) {
    pass(1);
    flushChime();
  }
  assert.equal(ctx.struck.length, BACK_NOTES * 2);
});

test('a context still asleep is woken, and nothing is rung into it', () => {
  scheduleChime('back', 60);
  ctx.state = 'suspended';
  pass(120, false);
  const before = ctx.resumes;
  flushChime();
  assert.equal(ctx.struck.length, BACK_NOTES);
  assert.ok(ctx.resumes > before);
  // Once it is running again the missed note is rung.
  ctx.state = 'running';
  flushChime();
  assert.equal(ctx.struck.length, BACK_NOTES * 2);
});
