'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTimer } from '@/lib/timer-context';
import { formatHHMMSS, isoDate, resolveTint } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import SessionLogModal from '@/components/SessionLogModal';
import {
  useCourses,
  useTasks,
  addSessionOptimistic,
} from '@/lib/data-hooks';

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

  const [logOpen, setLogOpen] = useState(false);
  const [goalMin, setGoalMin] = useState(50);
  const [saving, setSaving] = useState(false);
  const [whiteNoiseOn, setWhiteNoiseOn] = useState(false);
  const whiteNoiseContextRef = useRef<AudioContext | null>(null);
  const whiteNoiseBufferRef = useRef<AudioBuffer | null>(null);
  const whiteNoiseSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const whiteNoiseGainRef = useRef<GainNode | null>(null);
  const whiteNoiseStartingRef = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [online, setOnline] = useState(true);

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
    if (pendingLog) setLogOpen(true);
  }, [pendingLog]);

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

  async function getWhiteNoiseBuffer(context: AudioContext) {
    if (whiteNoiseBufferRef.current) return whiteNoiseBufferRef.current;

    const response = await fetch('/whitenoise.ogg');
    const audioData = await response.arrayBuffer();
    const buffer = await context.decodeAudioData(audioData);
    const seamlessBuffer = createSeamlessLoopBuffer(context, buffer);
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
    try {
      const context = await getWhiteNoiseContext();
      if (!context) return;

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
    } finally {
      whiteNoiseStartingRef.current = false;
    }
  }

  useEffect(() => {
    const updateOnline = () => setOnline(window.navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

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
      return;
    }
    setLogOpen(true);
  }

  async function handleSave(note: string) {
    if (!pendingLog) return;
    setSaveError('');
    if (!online) {
      setSaveError('You are offline. This session is still saved locally; reconnect and save again.');
      return;
    }
    const durationSeconds = clampSessionSeconds(pendingLog.durationSeconds);
    if (!isLoggableDuration(durationSeconds)) {
      handleDiscard();
      return;
    }
    setSaving(true);
    try {
      await addSessionOptimistic({
        courseId: pendingLog.courseId,
        taskId: pendingLog.taskId,
        date: pendingLog.date || isoDate(),
        durationSeconds,
        note,
      });
      setLogOpen(false);
      clearPendingLog();
      router.replace('/dashboard');
    } catch (error) {
      console.error('Failed to save session:', error);
      setSaveError('Could not save yet. This session is still saved locally; try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setLogOpen(false);
    setSaveError('');
    clearPendingLog();
    router.replace('/dashboard');
  }

  if (!course && !pendingLog) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="animate-pulse opacity-40 flex flex-col items-center">
          <div className="h-5 w-20 bg-line rounded mb-2" />
          <div className="h-8 w-48 bg-line rounded mb-16" />
          <div className="h-[264px] w-[264px] rounded-full border-[2.5px] border-line border-dashed" />
        </div>
      </div>
    );
  }

  const isPaused = active?.isPaused ?? false;
  const tint = course ? resolveTint(course.color, course.tint) : 'var(--bg-tint)';
  const actualSeconds = clampSessionSeconds(elapsedSeconds);
  const goalSec = Math.max(60, goalMin * 60);
  const pct = Math.min(1, actualSeconds / goalSec);
  const ringRadius = 132;
  const stroke = 2.5;
  const circumference = 2 * Math.PI * ringRadius;

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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Goal
            </span>
            {[25, 50, 90].map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => setGoalMin(goal)}
                className="rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold"
                style={{
                  background: goalMin === goal ? course.color : 'transparent',
                  color: goalMin === goal ? 'var(--ink)' : 'var(--muted)',
                }}
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
              className="m-0 text-[11px] font-semibold tracking-[0.22em] uppercase"
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

            <div className="relative mt-[34px] aspect-square w-full max-w-[284px]">
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 284 284"
                className="absolute inset-0 -rotate-90"
              >
                <circle
                  cx="142"
                  cy="142"
                  r={ringRadius}
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth={stroke}
                />
                <circle
                  cx="142"
                  cy="142"
                  r={ringRadius}
                  fill="none"
                  stroke={course.color}
                  strokeWidth={stroke * 1.4}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - pct)}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="font-mono font-semibold text-[clamp(34px,12vw,54px)] leading-none tracking-[-0.02em] text-ink tabular-nums transition-opacity duration-200"
                  style={{ opacity: isPaused ? 0.55 : 1 }}
                >
                  {formatHHMMSS(actualSeconds)}
                </div>
                <p
                  className={`mt-3.5 mb-0 text-[11px] tracking-[0.24em] uppercase text-muted font-semibold ${
                    isPaused ? '' : 'animate-tick'
                  }`}
                >
                  {isPaused ? 'Paused' : 'In session'}
                </p>
                <p className="mt-1.5 mb-0 font-mono text-[11px] text-muted-soft tabular-nums">
                  {Math.round(pct * 100)}% of {goalMin}m
                </p>
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
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 5l12 7-12 7V5z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
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
            style={{ background: course.color, color: '#1A1915' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop &amp; log
          </button>
        </div>
      )}

      <SessionLogModal
        open={logOpen}
        course={course}
        durationSeconds={pendingLog?.durationSeconds ?? 0}
        saving={saving}
        errorMessage={
          saveError ||
          (!online && pendingLog
            ? 'You are offline. This session is saved locally until you reconnect.'
            : '')
        }
        onCancel={handleDiscard}
        onSave={handleSave}
      />
    </div>
  );
}
