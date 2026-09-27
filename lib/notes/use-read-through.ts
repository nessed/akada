'use client';

import { useEffect, useRef, useState } from 'react';
import { useTasks } from '@/lib/data-hooks';
import { useTimer } from '@/lib/timer-context';
import { AT_END, AT_TOP, CHECKPOINTS, advanceRun, finishRun, startRun, type ReadRun } from './reads';
import { readStore, removeStore, writeStore } from './store';
import type { NoteRead, StudyNote } from '@/lib/data/types';

const runKey = (id: string) => `akada.notes.run.${id}`;

function readRun(id: string): ReadRun | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = JSON.parse(readStore(runKey(id)) || 'null');
    if (!raw || typeof raw.sessionId !== 'string' || !Number.isFinite(raw.seenSeconds)) return null;
    const marks = Array.isArray(raw.marks) && raw.marks.length === CHECKPOINTS.length ? raw.marks : null;
    if (!marks) return null;
    return {
      sessionId: raw.sessionId,
      seenSeconds: Number(raw.seenSeconds),
      marks: marks.map((m: unknown) => (typeof m === 'number' && Number.isFinite(m) ? m : null)),
    };
  } catch {
    return null;
  }
}

function saveRun(id: string, run: ReadRun) {
  writeStore(runKey(id), JSON.stringify(run));
}

/** How often the run's clock is advanced while the note is being read. */
const TICK_MS = 1000;

/**
 * Times a read-through of a note, and hands it back once it reaches the end.
 *
 * A run only begins at the top, with a sitting running on the task the note
 * is studied under, and never on a note whose task is already finished (that
 * is a look-up, not a read). It lives in the browser, keyed to the sitting,
 * so it survives moving between the page and focus, and a sitting that ends
 * before the note does takes the run with it.
 *
 * The clock is the note's own, not the sitting's: it counts a second only
 * while the page is visible, the reader is on this note (`enabled`), and the
 * sitting is in focus, not paused or on a break. It used to be the sitting's
 * focus time from the moment the run began, so a note left open on another
 * tab counted as reading. And the run has to be seen passing a quarter, a
 * half and three quarters of the way down, with time between them, or a
 * jump to the end after a minute would have been kept as a read.
 */
export function useReadThrough({
  note,
  words,
  progress,
  enabled,
  onRead,
}: {
  note: Pick<StudyNote, 'id' | 'taskId'> | undefined;
  words: number;
  progress: number;
  enabled: boolean;
  onRead: (read: NoteRead) => void;
}) {
  const { active, hydrated } = useTimer();
  const { tasks } = useTasks();
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const [timing, setTiming] = useState(false);

  const id = note?.id;
  const taskDone = Boolean(note?.taskId && tasks.find((t) => t.id === note.taskId)?.completed);
  const onTask = !!active && !!note?.taskId && active.taskId === note.taskId && !taskDone;
  const sessionId = active?.sessionId ?? null;
  const counting = onTask && active?.phase === 'focus' && !active.isPaused;

  // Begin, drop or finish a run as the reader moves down the note.
  useEffect(() => {
    if (!id || !hydrated || !enabled) return;
    const run = readRun(id);
    if (run && (run.sessionId !== sessionId || taskDone)) {
      removeStore(runKey(id));
      setTiming(false);
      return;
    }
    if (!run) {
      if (onTask && sessionId && progress < AT_TOP) {
        saveRun(id, startRun(sessionId));
        setTiming(true);
      }
      return;
    }
    setTiming(true);
    const moved = advanceRun(run, progress, 0);
    if (progress >= AT_END) {
      removeStore(runKey(id));
      setTiming(false);
      const read = finishRun(moved, words, new Date().toISOString());
      if (read) onReadRef.current(read);
      return;
    }
    if (moved.marks.some((m, i) => m !== run.marks[i])) saveRun(id, moved);
  }, [id, hydrated, enabled, onTask, sessionId, progress, words, taskDone]);

  // The note's own clock: a second counts only while it is actually read.
  useEffect(() => {
    if (!id || !enabled || !counting) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const run = readRun(id);
      if (!run || run.sessionId !== sessionId) return;
      saveRun(id, advanceRun(run, progressRef.current, TICK_MS / 1000));
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [id, enabled, counting, sessionId]);

  /** Whether this note is being timed right now. */
  return Boolean(id && enabled && sessionId && timing);
}
