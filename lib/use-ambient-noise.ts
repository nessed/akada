'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ambient pink noise for a study session.
 *
 * Lifted out of app/timer/page.tsx when the timer was rebuilt around the
 * study fan; the audio graph is unchanged, only its home is. Nothing here
 * touches the DOM, so the timer screen can stay about the session.
 */
export function useAmbientNoise() {
  const [whiteNoiseOn, setWhiteNoiseOn] = useState(false);
  const [whiteNoiseError, setWhiteNoiseError] = useState('');
  const whiteNoiseContextRef = useRef<AudioContext | null>(null);
  const whiteNoiseBufferRef = useRef<AudioBuffer | null>(null);
  const whiteNoiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const whiteNoiseGainRef = useRef<GainNode | null>(null);
  const whiteNoiseStartingRef = useRef(false);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  /* How deep the ocean is, 0 to 1, or null when the timer is not drawing one.
     The noise darkens as the water does: the top end goes first. */
  const depthRef = useRef<number | null>(null);


  useEffect(() => {
    return () => {
      try {
        whiteNoiseSourceRef.current?.stop();
      } catch {
        // The source may already be stopped if the page unmounts after a toggle.
      }
      whiteNoiseSourceRef.current?.disconnect();
      whiteNoiseGainRef.current?.disconnect();
      filterRef.current?.disconnect();
      filterRef.current = null;
      whiteNoiseSourceRef.current = null;
      whiteNoiseGainRef.current = null;
      whiteNoiseContextRef.current?.close();
      whiteNoiseContextRef.current = null;
    };
  }, []);

  async function getWhiteNoiseContext() {
    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextConstructor) return null;

    const context = whiteNoiseContextRef.current ?? new AudioContextConstructor();
    whiteNoiseContextRef.current = context;
    if (context.state === 'suspended') await context.resume();
    return context;
  }

  function createSeamlessLoopBuffer(context: AudioContext, source: AudioBuffer) {
    const trimSamples = Math.min(
      Math.floor(source.sampleRate * 0.04),
      Math.floor(source.length / 12),
    );
    const crossfadeSamples = Math.min(
      Math.floor(source.sampleRate * 0.65),
      Math.floor((source.length - trimSamples * 2) / 3),
    );
    if (crossfadeSamples <= 1) return source;

    const trimmedLength = source.length - trimSamples * 2;
    const loopLength = trimmedLength - crossfadeSamples;
    const loopBuffer = context.createBuffer(
      source.numberOfChannels,
      loopLength,
      source.sampleRate,
    );

    for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
      const input = source.getChannelData(channel);
      const output = loopBuffer.getChannelData(channel);
      let mean = 0;

      for (let i = 0; i < trimmedLength; i += 1) {
        mean += input[trimSamples + i];
      }
      mean /= trimmedLength;

      for (let i = 0; i < crossfadeSamples; i += 1) {
        const progress = i / (crossfadeSamples - 1);
        const fadeOut = Math.cos((progress * Math.PI) / 2);
        const fadeIn = Math.sin((progress * Math.PI) / 2);
        const tail = input[trimSamples + loopLength + i] - mean;
        const head = input[trimSamples + i] - mean;
        output[i] = tail * fadeOut + head * fadeIn;
      }

      for (let i = crossfadeSamples; i < loopLength; i += 1) {
        output[i] = input[trimSamples + i] - mean;
      }
    }

    return loopBuffer;
  }

  /**
   * Noise is synthesised here rather than decoded from a shipped file.
   * The app used to fetch /whitenoise.ogg and run it through
   * decodeAudioData, which Safari and iOS cannot do. Ogg Vorbis is
   * unsupported there, so white noise was silently dead for every iPhone
   * user. Generating it works on every browser, drops a 191 KB download,
   * and keeps working offline.
   */
  function createNoiseBuffer(context: AudioContext) {
    const seconds = 5;
    const length = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(2, length, context.sampleRate);

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      // Paul Kellet's pink-noise filter. Flat white noise is harsh over a
      // long session; pink rolls off the high end into the softer "shhh"
      // people actually want to study to.
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < length; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }

    return buffer;
  }

  async function getWhiteNoiseBuffer(context: AudioContext) {
    if (whiteNoiseBufferRef.current) return whiteNoiseBufferRef.current;

    const seamlessBuffer = createSeamlessLoopBuffer(context, createNoiseBuffer(context));
    whiteNoiseBufferRef.current = seamlessBuffer;
    return seamlessBuffer;
  }

  /** The lowpass cutoff for a depth: open at the surface, a low hush on the floor. */
  function cutoffFor(z: number | null) {
    if (z == null) return 20000;
    return 12000 * Math.pow(700 / 12000, Math.max(0, Math.min(1, z)));
  }

  /* Stable, so the timer can call it from an effect keyed on depth alone. */
  const setDepth = useCallback((z: number | null) => {
    depthRef.current = z;
    const filter = filterRef.current;
    const context = whiteNoiseContextRef.current;
    if (filter && context) filter.frequency.setTargetAtTime(cutoffFor(z), context.currentTime, 1.5);
  }, []);

  function stopWhiteNoise() {
    const context = whiteNoiseContextRef.current;
    const source = whiteNoiseSourceRef.current;
    const gain = whiteNoiseGainRef.current;
    const filter = filterRef.current;

    if (context && gain) {
      gain.gain.cancelScheduledValues(context.currentTime);
      gain.gain.setTargetAtTime(0, context.currentTime, 0.025);
    }

    window.setTimeout(() => {
      try {
        source?.stop();
      } catch {
        // Already stopped by cleanup.
      }
      source?.disconnect();
      gain?.disconnect();
      filter?.disconnect();
      if (filterRef.current === filter) filterRef.current = null;
      if (whiteNoiseSourceRef.current === source) whiteNoiseSourceRef.current = null;
      if (whiteNoiseGainRef.current === gain) whiteNoiseGainRef.current = null;
    }, 90);
    setWhiteNoiseOn(false);
  }

  /* Bound with useCallback so a timer screen can hand it straight to a button
     without re-rendering the header on every clock tick. The audio graph is
     held in refs, so the only real dependency is which way the toggle goes. */
  const toggle = useCallback(async () => {
    if (whiteNoiseStartingRef.current) return;

    if (whiteNoiseOn) {
      stopWhiteNoise();
      return;
    }

    whiteNoiseStartingRef.current = true;
    setWhiteNoiseError('');
    try {
      const context = await getWhiteNoiseContext();
      if (!context) {
        setWhiteNoiseError('Audio is unavailable on this device.');
        return;
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = await getWhiteNoiseBuffer(context);
      source.loop = true;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.45, context.currentTime + 0.12);
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      filter.frequency.value = cutoffFor(depthRef.current);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start();

      filterRef.current = filter;
      whiteNoiseSourceRef.current = source;
      whiteNoiseGainRef.current = gain;
      setWhiteNoiseOn(true);
    } catch (error) {
      console.error('Failed to play white noise:', error);
      setWhiteNoiseOn(false);
      // Tapping a button and having nothing happen, with the reason only in
      // the console, is indistinguishable from the app being broken.
      setWhiteNoiseError('Audio is unavailable on this device.');
    } finally {
      whiteNoiseStartingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whiteNoiseOn]);

  return {
    /** Whether the loop is currently playing. */
    on: whiteNoiseOn,
    /** Set when the device refused audio, for the caller to show inline. */
    error: whiteNoiseError,
    toggle,
    /** Darkens the noise with the ocean's depth; null leaves it as it was. */
    setDepth,
  };
}
