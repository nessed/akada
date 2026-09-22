'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addSessionOptimistic,
  updateTaskOptimistic,
  useCourses,
  useTasks,
} from '@/lib/data-hooks';
import { settled } from '@/lib/progression';
import { useProgression } from '@/lib/progression/use-progression';
import { useTimer } from '@/lib/timer-context';
import { keepLine } from '@/lib/recall/actions';
import { isoDate } from '@/lib/utils';
import { useNotice } from './Notice';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import SessionLogModal from './SessionLogModal';

interface Props {
  onResolved?: () => void;
}

/**
 * How many log sheets are on the page.
 *
 * PageShell carries one, so every tab has one, and the timer screen brings
 * its own. A handful of screens have neither. Ending a sitting from a key
 * has to know which it is standing on, or it would leave the reader on the
 * privacy policy wondering where their sitting went.
 */
let mountedSheets = 0;

export function isLogSheetMounted(): boolean {
  return mountedSheets > 0;
}

export default function PendingSessionLogSheet({ onResolved }: Props) {
  const { pendingLog, clearPendingLog } = useTimer();
  const { notify } = useNotice();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks } = useTasks();
  // The pending sitting is folded into this reading, so `sitting` is what
  // saving it will do to the record, read before the reader decides.
  const { sitting, logged } = useProgression();
  // The reader's usual sitting on this course, from the record without this
  // one in it, so the figure is what "usually" meant before today.
  const usual = pendingLog ? logged?.habits.byCourse.get(pendingLog.courseId)?.sittings ?? null : null;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [online, setOnline] = useState(true);

  const course = useMemo(
    () =>
      pendingLog
        ? courses.find((item) => item.id === pendingLog.courseId) ?? null
        : null,
    [courses, pendingLog],
  );

  const task = useMemo(
    () =>
      pendingLog?.taskId ? tasks.find((item) => item.id === pendingLog.taskId) ?? null : null,
    [pendingLog, tasks],
  );

  useEffect(() => {
    mountedSheets += 1;
    return () => {
      mountedSheets -= 1;
    };
  }, []);

  useEffect(() => {
    if (pendingLog) {
      setOpen(true);
      return;
    }
    setOpen(false);
    setSaveError('');
    setSaving(false);
  }, [pendingLog]);

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

  useEffect(() => {
    if (pendingLog && !coursesLoading && courses.length > 0 && !course) {
      clearPendingLog();
      onResolved?.();
    }
  }, [clearPendingLog, course, courses.length, coursesLoading, onResolved, pendingLog]);

  async function handleSave(
    note: string,
    markTaskDone: boolean,
    keep: string,
    practice: { score: number; outOf: number } | null,
  ) {
    if (!pendingLog) return;
    setSaveError('');
    if (!online) {
      setSaveError('Offline. Kept on this device.');
      return;
    }
    const durationSeconds = clampSessionSeconds(pendingLog.durationSeconds);
    if (!isLoggableDuration(durationSeconds)) {
      handleDiscard();
      return;
    }
    setSaving(true);
    try {
      const saved = await addSessionOptimistic({
        courseId: pendingLog.courseId,
        taskId: pendingLog.taskId,
        date: pendingLog.date || isoDate(),
        durationSeconds,
        note,
        breakSeconds: pendingLog.breakSeconds,
        segments: pendingLog.segments,
        ...(practice ? { score: practice.score, scoreOutOf: practice.outOf } : {}),
      });
      // A score the database had nowhere to put: the sitting is saved and the
      // score is not, which is said once rather than left to vanish from the
      // list a moment after it was typed.
      if (practice && saved && saved.score == null) {
        notify('Saved, without the score. Run the latest supabase/schema.sql once to keep practice scores.');
      }
      // The session is what must not be lost, so it is written first and a
      // failure to tick the task off afterwards does not undo it.
      if (markTaskDone && task && !task.completed) {
        try {
          await updateTaskOptimistic(task.id, {
            completed: true,
            completedAt: new Date().toISOString(),
          });
        } catch (error) {
          console.error('Failed to complete the task:', error);
        }
      }
      // The line kept for recall, last and on its own, for the same reason:
      // the sitting is the record, and a kept line that failed to save is
      // said out loud rather than taking the sitting down with it.
      if (keep.trim()) {
        try {
          await keepLine(pendingLog.courseId, keep, 'note');
        } catch (error) {
          console.error('Failed to keep the line:', error);
          notify(error instanceof Error ? error.message : 'The line to keep did not save.');
        }
      }
      setOpen(false);
      clearPendingLog();
      onResolved?.();
    } catch (error) {
      console.error('Failed to save session:', error);
      setSaveError('Did not save. Kept on this device.');
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setOpen(false);
    setSaveError('');
    clearPendingLog();
    onResolved?.();
  }

  return (
    <SessionLogModal
      open={open}
      course={course}
      task={task}
      durationSeconds={pendingLog?.durationSeconds ?? 0}
      breakSeconds={pendingLog?.breakSeconds ?? 0}
      segments={pendingLog?.segments ?? []}
      effect={pendingLog && sitting?.courseId === pendingLog.courseId ? sitting : null}
      usualSeconds={usual && settled(usual) ? usual.median : null}
      saving={saving}
      contextMessage={
        pendingLog?.recoveryReason === 'away'
          ? 'Recovered while you were away.'
          : pendingLog?.recoveryReason === 'max'
            ? 'Reached the session limit.'
            : pendingLog?.recoveryReason === 'break'
              ? 'The break ran long, so the sitting was closed at that point.'
              : ''
      }
      errorMessage={
        saveError ||
        (!online && pendingLog
          ? 'Offline. Kept on this device.'
          : '')
      }
      onCancel={handleDiscard}
      onSave={handleSave}
    />
  );
}
