import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { isSoundName, playSound, queueSound } from './sounds';

/* A stand-in for Web Audio that only counts the noise bursts started, which is all
   these tests need to know: did a sound go out, and which. */
class FakeParam {
  value = 0;
  setValueAtTime(v: number) {
    this.value = v;
  }
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  connect() {}
  disconnect() {}
}
class FakeContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  started: number[] = [];
  resume() {
    return Promise.resolve();
  }
  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() });
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode(), { type: '', Q: new FakeParam(), frequency: new FakeParam() });
  }
  createBufferSource() {
    const started = this.started;
    return Object.assign(new FakeNode(), {
      buffer: null,
      onended: null,
      start() {
        started.push(0);
      },
      stop() {},
    });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
}

const ctx = new FakeContext();
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  AudioContext: function () {
    return ctx;
  },
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
  },
};

let wall = Date.UTC(2026, 8, 28, 14, 0);
Date.now = () => wall;

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

beforeEach(() => {
  ctx.started = [];
  store.clear();
  wall += 1000;
});

test('a handler that plays its own sound wins over the plain tap', async () => {
  queueSound('tap');
  playSound('knock');
  await settle();
  const knockOnly = ctx.started.length;
  assert.ok(knockOnly > 0);

  ctx.started = [];
  wall += 1000;
  playSound('knock');
  playSound('tap');
  await settle();
  assert.ok(ctx.started.length > knockOnly, 'two sounds played outright both go out');
});

test('a tap with nothing more particular to say still sounds', async () => {
  queueSound('tap');
  assert.equal(ctx.started.length, 0, 'not before the handlers have had their turn');
  await settle();
  assert.ok(ctx.started.length > 0);
});

test('turned off in Settings, nothing sounds, except an audition', async () => {
  store.set('akada.preferences.v1', JSON.stringify({ uiSounds: false }));
  queueSound('tap');
  playSound('tick');
  await settle();
  assert.equal(ctx.started.length, 0);
  playSound('tick', { force: true });
  assert.ok(ctx.started.length > 0);
});

test('one finger bouncing is one sound', () => {
  playSound('knock');
  const once = ctx.started.length;
  playSound('knock');
  assert.equal(ctx.started.length, once);
});

test('only the palette counts as a sound name', () => {
  assert.ok(isSoundName('paper'));
  assert.ok(!isSoundName('none'));
  assert.ok(!isSoundName('toString'));
  assert.ok(!isSoundName(null));
});
