'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Pink noise for a session, synthesised in the browser.
 *
 * This was ~190 lines sitting inside the timer page, which made that page
 * mostly an audio module with a clock at the end of it. Nothing about it
 * changed in the move; it is here so the timer screen can be read.
 */
export function useAmbientNoise() {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const whiteNoiseContextRef = useRef<AudioContext | null>(null);
  const whiteNoiseBufferRef = useRef<AudioBuffer | null>(null);
  const whiteNoiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const whiteNoiseGainRef = useRef<GainNode | null>(null);
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

  function stopWhiteNoise() {
    const context = whiteNoiseContextRef.current;
    const source = whiteNoiseSourceRef.current;
    const gain = whiteNoiseGainRef.current;

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
      if (whiteNoiseSourceRef.current === source) whiteNoiseSourceRef.current = null;
      if (whiteNoiseGainRef.current === gain) whiteNoiseGainRef.current = null;
    }, 90);
    setPlaying(false);
  }

  async function toggleWhiteNoise() {
    if (whiteNoiseStartingRef.current) return;

    if (playing) {
      stopWhiteNoise();
      return;
    }

    whiteNoiseStartingRef.current = true;
    setError('');
    try {
      const context = await getWhiteNoiseContext();
      if (!context) {
        setError('Audio is unavailable on this device.');
        return;
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = await getWhiteNoiseBuffer(context);
      source.loop = true;
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.gain.linearRampToValueAtTime(0.45, context.currentTime + 0.12);
      source.connect(gain);
      gain.connect(context.destination);
      source.start();

      whiteNoiseSourceRef.current = source;
      whiteNoiseGainRef.current = gain;
      setPlaying(true);
    } catch (error) {
      console.error('Failed to play white noise:', error);
      setPlaying(false);
      // Tapping a button and having nothing happen, with the reason only in
      // the console, is indistinguishable from the app being broken.
      setError('Audio is unavailable on this device.');
    } finally {
      whiteNoiseStartingRef.current = false;
    }
  }


  return { playing, error, toggle: toggleWhiteNoise, stop: stopWhiteNoise };
}
