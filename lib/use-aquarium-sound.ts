'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FADE_IN, FADE_OUT, fadeTo } from './audio-fade';
import type { TankScene } from './ocean/tank';

/**
 * The sound of the deep, for the sea timer: a tank heard from across a room.
 *
 * Synthesised, like the pink noise beside it, so it works on iOS, offline and
 * without a file to ship. Three layers under one master gain: a low bed of
 * water that swells and slackens on a slow cycle, the hum of a pump, and
 * bubbles that rise now and then, alone or in a short string. It never loops
 * anything audible: the bed is noise, which has no seam to hear.
 */
const VOLUME_KEY = 'akada.aquariumVolume';
const DEFAULT_VOLUME = 0.6;

/* The slider is a position, not a gain: squared, so the bottom half of it is
   the quiet half the ear wants, and well past the old fixed level at the
   top for a room with a fan going. */
const gainFor = (v: number) => v * v * 2.4;

const readVolume = () => {
  try {
    const n = Number(window.localStorage.getItem(VOLUME_KEY));
    return window.localStorage.getItem(VOLUME_KEY) != null && Number.isFinite(n)
      ? Math.max(0, Math.min(1, n))
      : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
};

/* The layers at full, against the bed's 0.55: kept well under it, since it
   is still a tank heard from across a room. */
const FIZZ = 0.018;
const ROAR = 0.22;
const RUMBLE = 0.32;
/** A sperm whale's clicks: a knock a little more than once a second. */
const CLICKS = 0.3;
const CLICK_EVERY = 0.85;
/** Rain on the surface overhead: a soft high hiss. */
const RAIN = 0.05;

export function useAquariumSound() {
  const [on, setOn] = useState(false);
  // 0 to 1. Read after mount, so the server and the first paint agree.
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const levelRef = useRef<GainNode | null>(null);
  useEffect(() => {
    const v = readVolume();
    volumeRef.current = v;
    setVolumeState(v);
  }, []);
  const [error, setError] = useState('');
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const stopLayersRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);
  const depthRef = useRef<number | null>(null);
  /* Where the sitting is and what is happening there: a seep fizzes, a vent
     field roars low, a slide of silt rumbles while it passes. Each is a
     quiet layer of its own, faded in and out over seconds. */
  const sceneRef = useRef<TankScene>({ fizz: 0, roar: 0, rumble: 0, clicks: 0, rain: 0 });
  const layersRef = useRef<{ fizz: GainNode; roar: GainNode; rumble: GainNode; clicks: GainNode; rain: GainNode } | null>(null);
  // A tank still fading out after being turned off, and how to close it now.
  const fadingRef = useRef<{ timer: number; close: () => void } | null>(null);

  /** Lowpass for a depth: open near the surface, muffled on the floor. An
      octave under where it first was, like everything else in the tank. */
  const cutoffFor = (z: number | null) =>
    z == null ? 4500 : 4500 * Math.pow(300 / 4500, Math.max(0, Math.min(1, z)));

  const setDepth = useCallback((z: number | null) => {
    depthRef.current = z;
    const filter = filterRef.current;
    const context = contextRef.current;
    if (filter && context) filter.frequency.setTargetAtTime(cutoffFor(z), context.currentTime, 1.5);
  }, []);

  const setScene = useCallback((next: TankScene) => {
    const was = sceneRef.current;
    if (was.fizz === next.fizz && was.roar === next.roar && was.rumble === next.rumble && was.clicks === next.clicks && was.rain === next.rain) return;
    sceneRef.current = next;
    const layers = layersRef.current;
    const context = contextRef.current;
    if (!layers || !context) return;
    layers.fizz.gain.setTargetAtTime(FIZZ * next.fizz, context.currentTime, 2.5);
    layers.roar.gain.setTargetAtTime(ROAR * next.roar, context.currentTime, 2.5);
    // A slide comes on quicker than it goes.
    layers.rumble.gain.setTargetAtTime(RUMBLE * next.rumble, context.currentTime, next.rumble > was.rumble ? 2 : 6);
    layers.clicks.gain.setTargetAtTime(CLICKS * next.clicks, context.currentTime, 2);
    layers.rain.gain.setTargetAtTime(RAIN * next.rain, context.currentTime, 4);
  }, []);

  const setVolume = useCallback((v: number) => {
    const next = Math.max(0, Math.min(1, v));
    volumeRef.current = next;
    setVolumeState(next);
    try {
      window.localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      // Private mode: the level holds for this visit and no longer.
    }
    const level = levelRef.current;
    const context = contextRef.current;
    if (level && context) level.gain.setTargetAtTime(gainFor(next), context.currentTime, 0.05);
  }, []);

  const teardown = useCallback(() => {
    stopLayersRef.current?.();
    stopLayersRef.current = null;
    levelRef.current = null;
    masterRef.current = null;
    filterRef.current = null;
    layersRef.current = null;
    contextRef.current?.close();
    contextRef.current = null;
  }, []);

  useEffect(
    () => () => {
      const fading = fadingRef.current;
      if (fading) {
        window.clearTimeout(fading.timer);
        fading.close();
      }
      teardown();
    },
    [teardown],
  );

  const toggle = useCallback(async () => {
    if (startingRef.current) return;

    if (on) {
      const context = contextRef.current;
      const master = masterRef.current;
      const stopLayers = stopLayersRef.current;
      if (context && master) fadeTo(master.gain, context, 0, FADE_OUT);
      // Let go of this tank now and close it once it has faded, so a tap
      // back on inside the fade starts a new one rather than the old one's
      // teardown closing it.
      stopLayersRef.current = null;
      masterRef.current = null;
      filterRef.current = null;
      layersRef.current = null;
      contextRef.current = null;
      const close = () => {
        stopLayers?.();
        context?.close();
      };
      const fading = { timer: 0, close };
      fading.timer = window.setTimeout(() => {
        if (fadingRef.current === fading) fadingRef.current = null;
        close();
      }, FADE_OUT * 1000 + 100);
      fadingRef.current?.close();
      fadingRef.current = fading;
      setOn(false);
      return;
    }

    startingRef.current = true;
    setError('');
    try {
      const Ctor =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        setError('Audio is unavailable on this device.');
        return;
      }
      const context = new Ctor();
      contextRef.current = context;
      if (context.state === 'suspended') await context.resume();

      const master = context.createGain();
      master.gain.setValueAtTime(0, context.currentTime);
      fadeTo(master.gain, context, 0.5, FADE_IN);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      filter.frequency.value = cutoffFor(depthRef.current);
      // The reader's volume sits after everything, so the fade in and out and
      // the depth's muffling are untouched by it.
      const level = context.createGain();
      level.gain.value = gainFor(volumeRef.current);
      master.connect(filter);
      filter.connect(level);
      level.connect(context.destination);
      levelRef.current = level;
      masterRef.current = master;
      filterRef.current = filter;

      const oscillators: OscillatorNode[] = [];

      // The water: white noise, closed down to a rumble, with a slow swell.
      const seconds = 4;
      const noise = context.createBuffer(2, context.sampleRate * seconds, context.sampleRate);
      for (let c = 0; c < 2; c += 1) {
        const data = noise.getChannelData(c);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      const bed = context.createBufferSource();
      bed.buffer = noise;
      bed.loop = true;
      const bedLow = context.createBiquadFilter();
      bedLow.type = 'lowpass';
      bedLow.frequency.value = 210;
      const bedGain = context.createGain();
      bedGain.gain.value = 0.55;
      const swell = context.createOscillator();
      swell.frequency.value = 0.11;
      const swellDepth = context.createGain();
      swellDepth.gain.value = 0.18;
      swell.connect(swellDepth);
      swellDepth.connect(bedGain.gain);
      bed.connect(bedLow);
      bedLow.connect(bedGain);
      bedGain.connect(master);
      bed.start();
      swell.start();
      oscillators.push(swell);

      // Close to the glass: a thin band of shimmer over the rumble.
      const shimmer = context.createBufferSource();
      shimmer.buffer = noise;
      shimmer.loop = true;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.8;
      const shimmerGain = context.createGain();
      shimmerGain.gain.value = 0.04;
      const shimmerLfo = context.createOscillator();
      shimmerLfo.frequency.value = 0.07;
      const shimmerDepth = context.createGain();
      shimmerDepth.gain.value = 0.03;
      shimmerLfo.connect(shimmerDepth);
      shimmerDepth.connect(shimmerGain.gain);
      shimmer.connect(band);
      band.connect(shimmerGain);
      shimmerGain.connect(master);
      shimmer.start();
      shimmerLfo.start();
      oscillators.push(shimmerLfo);

      // The pump, felt more than heard.
      for (const [freq, level] of [[26, 0.05], [52, 0.02]] as const) {
        const hum = context.createOscillator();
        hum.type = 'sine';
        hum.frequency.value = freq;
        const humGain = context.createGain();
        humGain.gain.value = level;
        hum.connect(humGain);
        humGain.connect(master);
        hum.start();
        oscillators.push(hum);
      }

      // The place's own, each from the same water: a fizz high up (a seep's
      // gas coming through), a low roar (a vent field), a rumble lower still
      // (a slide of silt), all silent until the scene asks for them.
      const layer = (type: BiquadFilterType, freq: number, q: number, level: number) => {
        const src = context.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        src.playbackRate.value = 0.93 + Math.random() * 0.1;
        const f = context.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = context.createGain();
        g.gain.value = level;
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start();
        return { src, g };
      };
      const scene = sceneRef.current;
      const fizz = layer('bandpass', 1900, 1.4, FIZZ * scene.fizz);
      const roar = layer('lowpass', 95, 0.7, ROAR * scene.roar);
      const rumble = layer('lowpass', 55, 0.9, RUMBLE * scene.rumble);
      // The whale's clicks: one knock at the head of a short buffer, looped,
      // so they come as evenly as a whale's do; muffled by the depth like
      // everything else, which turns them to knocks.
      const clickBuffer = context.createBuffer(1, Math.round(context.sampleRate * CLICK_EVERY), context.sampleRate);
      const cd = clickBuffer.getChannelData(0);
      const burst = Math.round(context.sampleRate * 0.012);
      for (let i = 0; i < burst; i += 1) {
        const t = i / context.sampleRate;
        cd[i] = (Math.random() * 2 - 1) * Math.exp(-t / 0.0018) + Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / 0.004) * 0.6;
      }
      const clickSrc = context.createBufferSource();
      clickSrc.buffer = clickBuffer;
      clickSrc.loop = true;
      const clickGain = context.createGain();
      clickGain.gain.value = CLICKS * scene.clicks;
      clickSrc.connect(clickGain);
      clickGain.connect(master);
      clickSrc.start();
      // Rain on the surface, from under it: a soft hiss, high, the depth's
      // filter taking it away as the sitting sinks.
      const rain = layer('highpass', 2400, 0.5, RAIN * scene.rain);
      layersRef.current = { fizz: fizz.g, roar: roar.g, rumble: rumble.g, clicks: clickGain, rain: rain.g };

      // Bubbles: a sine that climbs quickly in pitch as it rises, with a soft
      // edge on either side. Alone, or now and then a short string of them;
      // fewer the deeper it goes, and at a seep many more and smaller.
      const bubble = (at: number) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const pan = context.createStereoPanner();
        const small = sceneRef.current.fizz > 0.5 && Math.random() < 0.6;
        const base = small ? 380 + Math.random() * 300 : 130 + Math.random() * 350;
        const length = small ? 0.03 + Math.random() * 0.05 : 0.05 + Math.random() * 0.1;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base, at);
        osc.frequency.exponentialRampToValueAtTime(base * (1.7 + Math.random() * 0.9), at + length);
        const peak = 0.06 + Math.random() * 0.08;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(peak, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.02);
        pan.pan.value = Math.random() * 1.6 - 0.8;
        osc.connect(gain);
        gain.connect(pan);
        pan.connect(master);
        osc.start(at);
        osc.stop(at + length + 0.05);
      };

      let timer = 0;
      const schedule = () => {
        const now = context.currentTime;
        const string = Math.random() < 0.3 ? 2 + Math.floor(Math.random() * 4) : 1;
        let at = now + 0.02;
        for (let i = 0; i < string; i += 1) {
          bubble(at);
          at += 0.07 + Math.random() * 0.16;
        }
        const z = depthRef.current ?? 0;
        const spread = (1 + 0.8 * Math.max(0, z - 0.5)) * (sceneRef.current.fizz > 0.5 ? 0.35 : 1);
        timer = window.setTimeout(schedule, (700 + Math.random() * 3800) * spread);
      };
      timer = window.setTimeout(schedule, 800);

      stopLayersRef.current = () => {
        window.clearTimeout(timer);
        for (const osc of oscillators) {
          try {
            osc.stop();
          } catch {
            // Already stopped.
          }
        }
        for (const src of [bed, shimmer, fizz.src, roar.src, rumble.src, clickSrc, rain.src]) {
          try {
            src.stop();
          } catch {
            // Already stopped.
          }
        }
        master.disconnect();
      };

      setOn(true);
    } catch (err) {
      console.error('Failed to play aquarium sounds:', err);
      teardown();
      setOn(false);
      setError('Audio is unavailable on this device.');
    } finally {
      startingRef.current = false;
    }
  }, [on, teardown]);

  return {
    /** Whether the tank is currently sounding. */
    on,
    /** Set when the device refused audio, for the caller to show inline. */
    error,
    toggle,
    /** Muffles the sound as the sitting sinks; null leaves it open. */
    setDepth,
    /** What the place and the moment add, each 0 to 1 (`tankScene`). */
    setScene,
    /** How loud the tank is, 0 to 1, remembered between visits. */
    volume,
    setVolume,
  };
}
