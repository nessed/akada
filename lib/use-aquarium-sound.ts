'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The sound of the deep, for the sea timer: a tank heard from across a room.
 *
 * Synthesised, like the pink noise beside it, so it works on iOS, offline and
 * without a file to ship. Three layers under one master gain: a low bed of
 * water that swells and slackens on a slow cycle, the hum of a pump, and
 * bubbles that rise now and then, alone or in a short string. It never loops
 * anything audible: the bed is noise, which has no seam to hear.
 */
export function useAquariumSound() {
  const [on, setOn] = useState(false);
  const [error, setError] = useState('');
  const contextRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const stopLayersRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);
  const depthRef = useRef<number | null>(null);

  /** Lowpass for a depth: open near the surface, muffled on the floor. */
  const cutoffFor = (z: number | null) =>
    z == null ? 9000 : 9000 * Math.pow(600 / 9000, Math.max(0, Math.min(1, z)));

  const setDepth = useCallback((z: number | null) => {
    depthRef.current = z;
    const filter = filterRef.current;
    const context = contextRef.current;
    if (filter && context) filter.frequency.setTargetAtTime(cutoffFor(z), context.currentTime, 1.5);
  }, []);

  const teardown = useCallback(() => {
    stopLayersRef.current?.();
    stopLayersRef.current = null;
    masterRef.current = null;
    filterRef.current = null;
    contextRef.current?.close();
    contextRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const toggle = useCallback(async () => {
    if (startingRef.current) return;

    if (on) {
      const context = contextRef.current;
      const master = masterRef.current;
      if (context && master) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(0, context.currentTime, 0.15);
      }
      window.setTimeout(teardown, 600);
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
      master.gain.linearRampToValueAtTime(0.5, context.currentTime + 1.5);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      filter.frequency.value = cutoffFor(depthRef.current);
      master.connect(filter);
      filter.connect(context.destination);
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
      bedLow.frequency.value = 420;
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
      band.frequency.value = 1400;
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
      for (const [freq, level] of [[52, 0.05], [104, 0.02]] as const) {
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

      // Bubbles: a sine that climbs quickly in pitch as it rises, with a soft
      // edge on either side. Alone, or now and then a short string of them.
      const bubble = (at: number) => {
        const osc = context.createOscillator();
        const gain = context.createGain();
        const pan = context.createStereoPanner();
        const base = 260 + Math.random() * 700;
        const length = 0.05 + Math.random() * 0.1;
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
        timer = window.setTimeout(schedule, 700 + Math.random() * 3800);
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
        try {
          bed.stop();
          shimmer.stop();
        } catch {
          // Already stopped.
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
  };
}
