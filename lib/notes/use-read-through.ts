'use client';

import { useEffect, useRef } from 'react';
import { useTimer } from '@/lib/timer-context';
import { isKeepableRead } from './reads';
import { readStore, removeStore, writeStore } from './store';
import type { NoteRead, StudyNote } from '@/lib/data/types';

/** A read-through in progress: which sitting it is on, and the clock at the top. */
type Run = { sessionId: string; startFocus: number };
const runKey = (id: string) => `akada.notes.run.${id}`;

function readRun(id: string): Run | null {
  try {
    const raw = JSON.parse(readStore(runKey(id)) || 'null');
    return raw && typeof raw.sessionId === 'string' && Number.isFinite(raw.startFocus) ? raw : null;
  } catch {
    return null;
  }
}

/** At or above the top of the note. */
const AT_TOP = 0.03;
/** Read to the end. */
const AT_END = 0.98;

/**
 * Times a read-through on the note's task clock, and hands it back once it
 * reaches the end.
 *
 * A run only begins at the top, with a sitting running on the task the note
 * is studied under: a note opened halfway down, or read with no clock, says
 * nothing about how long the whole one takes, so neither is timed. It lives
 * in the browser and is keyed to the sitting, so it survives moving between
 * the page and focus, and a sitting that ends before the note does takes the
 * run with it. The time is the sitting's focus time, so a break taken in the
 * middle is not counted as reading.
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
  const { active, focusSeconds, hydrated } = useTimer();
  const onReadRef = useRef(onRead);
  useEffect(() => {
    onReadRef.current = onRead;
  }, [onRead]);

  const id = note?.id;
  const onTask = !!active && !!note?.taskId && active.taskId === note.taskId;
  const sessionId = active?.sessionId ?? null;

  useEffect(() => {
    if (!id || !hydrated || !enabled) return;
    const run = readRun(id);
    if (run && run.sessionId !== sessionId) {
      removeStore(runKey(id));
      return;
    }
    if (!run) {
      if (onTask && sessionId && progress < AT_TOP) {
        writeStore(runKey(id), JSON.stringify({ sessionId, startFocus: focusSeconds }));
      }
      return;
    }
    if (progress >= AT_END) {
      removeStore(runKey(id));
      const read: NoteRead = { seconds: Math.round(focusSeconds - run.startFocus), words, at: new Date().toISOString() };
      if (isKeepableRead(read)) onReadRef.current(read);
    }
  }, [id, hydrated, enabled, onTask, sessionId, progress, focusSeconds, words]);

  /** Whether this note is being timed right now. */
  return Boolean(id && enabled && sessionId && readRunSafe(id)?.sessionId === sessionId);
}

function readRunSafe(id: string) {
  return typeof window === 'undefined' ? null : readRun(id);
}
