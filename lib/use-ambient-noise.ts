'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ambient pink noise for a study session.
 *
 * Lifted out of app/timer/page.tsx when the timer was rebuilt around the
 * study fan; the audio graph is unchanged, only its home is. Nothing here
 * touches the DOM, so the timer screen can stay about the session.
 */
/* The lowpass at either end of `muffle`: open air, and deep under a canopy. */
const OPEN_HZ = 18000;
const MUFFLED_HZ = 1100;

function cutoff(muffle: number): number {
  const m = Math.min(1, Math.max(0, muffle));
  // Exponential, because pitch is heard that way: halfway is not 9.5kHz.
  return OPEN_HZ * Math.pow(MUFFLED_HZ / OPEN_HZ, m);
}

/**
 * `muffle`, 0 to 1, closes the noise down the way a canopy overhead does,
 * with a lowpass that follows it slowly. The wood sets it as the trees come
 * in; everything else leaves it at 0 and hears the noise as it always was.
 */
export function useAmbientNoise(muffle = 0) {
  const [whiteNoiseOn, setWhiteNoiseOn] = useState(false);
  const [whiteNoiseError, setWhiteNoiseError] = useState('');
  const whiteNoiseContextRef = useRef<AudioContext | null>(null);
  const whiteNoiseBufferRef = useRef<AudioBuffer | null>(null);
  const whiteNoiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const whiteNoiseGainRef = useRef<GainNode | null>(null);
  const whiteNoiseFilterRef = useRef<BiquadFilterNode | null>(null);
  const muffleRef = useRef(muffle);

  useEffect(() => {
    muffleRef.current = muffle;
    const context = whiteNoiseContextRef.current;
    const filter = whiteNoiseFilterRef.current;
    if (context && filter) filter.frequency.setTargetAtTime(cutoff(muffle), context.currentTime, 1.5);
  }, [muffle]);
  const whiteNoiseStartingRef = useRef(false);


  useEffect(() => {
    return () => {
      try {
        whiteNoiseSourceRef.current?.stop();
      } catch {
        // The source may already be stopped if the page unmounts after a toggle.
      }
      whiteNoiseSourceRef.current?.disconnect();
      whiteNoiseGainRef.current?.disconnect();
      whiteNoiseFilterRef.current?.disconnect();
      whiteNoiseSourceRef.current = null;
      whiteNoiseGainRef.current = null;
      whiteNoiseFilterRef.current = null;
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

  function stopWhiteNoise() {
    const context = whiteNoiseContextRef.current;
    const source = whiteNoiseSourceRef.current;
    const gain = whiteNoiseGainRef.current;
    const filter = whiteNoiseFilterRef.current;

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
      if (whiteNoiseFilterRef.current === filter) whiteNoiseFilterRef.current = null;
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
      filter.frequency.setValueAtTime(cutoff(muffleRef.current), context.currentTime);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start();

      whiteNoiseSourceRef.current = source;
      whiteNoiseGainRef.current = gain;
      whiteNoiseFilterRef.current = filter;
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
  };
}
