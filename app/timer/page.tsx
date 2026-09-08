'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTimer } from '@/lib/timer-context';
import { formatHHMMSS, resolveTint } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import PendingSessionLogSheet from '@/components/PendingSessionLogSheet';
import LoadingIndicator from '@/components/LoadingIndicator';
import { useCourses, useTasks } from '@/lib/data-hooks';

export default function TimerPage() {
  const router = useRouter();
  const {
    active,
    pendingLog,
    elapsedSeconds,
    pause,
    resume,
    cancel,
    clearPendingLog,
    stop,
  } = useTimer();

  const { courses } = useCourses();
  const { tasks } = useTasks();

  const [goalMin, setGoalMin] = useState(50);
  const [whiteNoiseOn, setWhiteNoiseOn] = useState(false);
  const [whiteNoiseError, setWhiteNoiseError] = useState('');
  const whiteNoiseContextRef = useRef<AudioContext | null>(null);
  const whiteNoiseBufferRef = useRef<AudioBuffer | null>(null);
  const whiteNoiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const whiteNoiseGainRef = useRef<GainNode | null>(null);
  const whiteNoiseStartingRef = useRef(false);
  const timerCourseId = active?.courseId ?? pendingLog?.courseId ?? null;
  const timerTaskId = active?.taskId ?? pendingLog?.taskId ?? null;

  const course = useMemo(
    () => (timerCourseId ? courses.find((c) => c.id === timerCourseId) ?? null : null),
    [courses, timerCourseId],
  );
  const task = useMemo(
    () => (timerTaskId ? tasks.find((t) => t.id === timerTaskId) ?? null : null),
    [tasks, timerTaskId],
  );

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
    setWhiteNoiseOn(false);
  }

  async function toggleWhiteNoise() {
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
      source.connect(gain);
      gain.connect(context.destination);
      source.start();

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
  }

  // If neither timer nor pending log exists, bounce to dashboard.
  // If a timer points at a course we no longer have (e.g. deleted while
  // running), cancel + bounce so we don't render a stale screen.
  useEffect(() => {
    if (!active && !pendingLog) {
      router.replace('/dashboard');
      return;
    }
    if (timerCourseId && courses.length > 0 && !course) {
      cancel();
      clearPendingLog();
      router.replace('/dashboard');
    }
  }, [active, cancel, clearPendingLog, course, courses.length, pendingLog, router, timerCourseId]);

  function handleStop() {
    const result = stop();
    if (!result) {
      router.replace('/dashboard');
      return;
    }
    const durationSeconds = clampSessionSeconds(result.durationSeconds);
    if (!isLoggableDuration(durationSeconds)) {
      clearPendingLog();
      router.replace('/dashboard');
    }
  }

  if (!course && !pendingLog) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <LoadingIndicator compact label="Loading your timer" className="mb-8" />
          <div className="animate-pulse opacity-40 flex flex-col items-center" aria-hidden>
          <div className="h-5 w-20 bg-line rounded mb-2" />
          <div className="h-8 w-48 bg-line rounded mb-16" />
          <div className="h-[264px] w-[264px] rounded-full border-[2.5px] border-line border-dashed" />
          </div>
        </div>
      </div>
    );
  }

  const isPaused = active?.isPaused ?? false;
  const tint = course ? resolveTint(course.color, course.tint) : 'var(--bg-tint)';
  const actualSeconds = clampSessionSeconds(elapsedSeconds);
  const goalSec = Math.max(60, goalMin * 60);
  const pct = Math.min(1, actualSeconds / goalSec);
  const ringRadius = 126;
  const stroke = 3.5;
  const circumference = 2 * Math.PI * ringRadius;
  const s = Math.max(0, Math.floor(actualSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const hh = String(hrs).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  return (
    <div
      className="min-h-[100dvh] flex flex-col animate-fade-in"
      style={{
        background: course
          ? `linear-gradient(180deg, ${tint} 0%, var(--bg) 60%)`
          : 'var(--bg)',
      }}
    >
      <div className="flex items-center justify-between px-[22px] pt-[max(env(safe-area-inset-top),60px)]">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          aria-label="Back"
          className="w-[38px] h-[38px] rounded-full border border-line bg-paper flex items-center justify-center text-ink-soft"
        >
          <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {course && (
          <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper py-1.5 pl-3 pr-2">
            <span className="eyebrow text-muted">
              Goal
            </span>
            {[25, 50, 90].map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => setGoalMin(goal)}
                className={`bg-transparent px-0.5 font-mono text-[11px] font-semibold ${
                  goalMin === goal ? 'hl-swipe text-ink' : 'text-muted'
                }`}
                style={
                  goalMin === goal
                    ? ({ '--hl': course.tint || course.color } as React.CSSProperties)
                    : undefined
                }
              >
                {goal}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-7">
        {course && (
          <>
            <p
              className="eyebrow m-0"
              style={{ color: course.color }}
            >
              {course.code}
            </p>
            <h1 className="mt-2 mb-0 font-serif font-medium text-[26px] tracking-[-0.01em]">
              {course.name}
            </h1>
            {task && (
              <p className="mt-2 mb-0 text-[13px] text-ink-soft font-serif italic">
                {task.title}
              </p>
            )}

            <div className="relative mt-[34px] aspect-square w-full max-w-[284px] flex items-center justify-center">
              {/* Subtle outer breathing pulse ring when active */}
              {!isPaused && (
                <div
                  className="absolute -inset-1 rounded-full pointer-events-none animate-pulse transition-opacity duration-700"
                  style={{
                    border: `1.5px solid ${course.color}`,
                    opacity: 0.22,
                  }}
                />
              )}

              {/* Soft radial backdrop glow */}
              <div
                className="absolute inset-[10px] rounded-full pointer-events-none transition-opacity duration-700 ease-out"
                style={{
                  background: `radial-gradient(circle, ${resolveTint(course.color, course.tint)} 0%, transparent 70%)`,
                  opacity: isPaused ? 0.35 : 0.85,
                }}
              />

              {/* Subtle tactile inner depth border */}
              <div className="absolute inset-[14px] rounded-full border border-line/40 pointer-events-none shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]" />

              {/* Smooth circular progress ring */}
              <svg
                aria-hidden
                width="100%"
                height="100%"
                viewBox="0 0 284 284"
                className="absolute inset-0 -rotate-90 pointer-events-none"
              >
                <defs>
                  <filter id="timerRingGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow
                      dx="0"
                      dy="0"
                      stdDeviation="2.5"
                      floodColor={course.color}
                      floodOpacity={isPaused ? "0" : "0.35"}
                    />
                  </filter>
                </defs>
                {/* Subtle soft track */}
                <circle
                  cx="142"
                  cy="142"
                  r={ringRadius}
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth={stroke}
                  opacity="0.45"
                />
                {/* Crisp colored progress stroke with rounded caps */}
                <circle
                  cx="142"
                  cy="142"
                  r={ringRadius}
                  fill="none"
                  stroke={course.color}
                  strokeWidth={stroke * 1.3}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - pct)}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                  filter={isPaused ? undefined : 'url(#timerRingGlow)'}
                />
              </svg>

              {/* Clock face content */}
              <div className="relative z-10 flex flex-col items-center justify-center select-none">
                {/* Clean, bold, balanced digital readout with clear hours/minutes/seconds styling */}
                <div
                  className="font-mono flex items-baseline justify-center tracking-tight tabular-nums transition-opacity duration-300"
                  style={{ opacity: isPaused ? 0.6 : 1 }}
                >
                  <div className="flex flex-col items-center">
                    <span
                      className={`text-[clamp(26px,7.5vw,38px)] font-bold leading-none ${
                        hrs > 0 ? 'text-ink' : 'text-muted-soft/60'
                      }`}
                    >
                      {hh}
                    </span>
                    <span className="text-[9px] font-sans font-semibold uppercase tracking-widest text-muted mt-1 select-none">
                      hr
                    </span>
                  </div>

                  <span className="text-[clamp(18px,4.5vw,24px)] text-muted-soft/60 font-light px-1.5 -translate-y-2 select-none">
                    :
                  </span>

                  <div className="flex flex-col items-center">
                    <span className="text-[clamp(26px,7.5vw,38px)] font-bold text-ink leading-none">
                      {mm}
                    </span>
                    <span className="text-[9px] font-sans font-semibold uppercase tracking-widest text-muted mt-1 select-none">
                      min
                    </span>
                  </div>

                  <span className="text-[clamp(18px,4.5vw,24px)] text-muted-soft/60 font-light px-1.5 -translate-y-2 select-none">
                    :
                  </span>

                  <div className="flex flex-col items-center">
                    <span className="text-[clamp(26px,7.5vw,38px)] font-semibold text-ink-soft leading-none">
                      {ss}
                    </span>
                    <span className="text-[9px] font-sans font-semibold uppercase tracking-widest text-muted mt-1 select-none">
                      sec
                    </span>
                  </div>
                </div>

                {/* Subtle visual polish for active vs paused status */}
                {isPaused ? (
                  <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-bg-tint/80 border border-line">
                    <span className="inline-block w-2 h-2 rounded-full bg-muted-soft" />
                    <span className="eyebrow tracking-[0.18em] text-muted font-medium">
                      Paused
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-paper/90 border border-line shadow-xs">
                    <span className="relative flex h-2 w-2">
                      <span
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
                        style={{ backgroundColor: course.color }}
                      />
                      <span
                        className="relative inline-flex rounded-full h-2 w-2"
                        style={{ backgroundColor: course.color }}
                      />
                    </span>
                    <span className="eyebrow tracking-[0.18em] text-ink font-semibold">
                      In session
                    </span>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-9 max-w-[280px] font-serif italic text-sm text-muted leading-[1.6]">
              {isPaused
                ? '"The pause is part of the page."'
                : '"Slow is smooth. Smooth is steady."'}
            </p>
          </>
        )}
      </div>

      {whiteNoiseError && (
        <p className="m-0 px-[22px] text-center text-[12px] text-muted" role="status">
          {whiteNoiseError}
        </p>
      )}

      {course && active && (
        <div className="flex items-center justify-center gap-3.5 px-[22px] pt-4 pb-[calc(28px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={toggleWhiteNoise}
            aria-label={whiteNoiseOn ? 'Stop white noise' : 'Play white noise'}
            title={whiteNoiseOn ? 'Stop white noise' : 'Play white noise'}
            className="w-14 h-14 rounded-full border border-line bg-paper text-ink flex items-center justify-center transition-colors"
            style={{
              color: whiteNoiseOn ? course.color : 'var(--ink-soft)',
              boxShadow: whiteNoiseOn ? `inset 0 0 0 1px ${course.color}` : 'none',
            }}
          >
            <svg aria-hidden width="19" height="19" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 14.5c1.7 0 1.7-5 3.4-5s1.7 5 3.4 5 1.7-5 3.4-5 1.7 5 3.4 5 1.7-5 3.4-5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={isPaused ? resume : pause}
            aria-label={isPaused ? 'Resume' : 'Pause'}
            className="w-14 h-14 rounded-full bg-paper border border-line text-ink flex items-center justify-center"
          >
            {isPaused ? (
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5l12 7-12 7V5z" />
              </svg>
            ) : (
              <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 5v14M15 5v14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="h-14 px-7 rounded-full text-sm font-semibold inline-flex items-center gap-2 tracking-[0.01em]"
            style={{ background: course.color, color: 'var(--ink)' }}
          >
            <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop &amp; log
          </button>
        </div>
      )}

      <PendingSessionLogSheet onResolved={() => router.replace('/dashboard')} />
    </div>
  );
}
