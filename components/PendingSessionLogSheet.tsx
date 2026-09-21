'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addSessionOptimistic,
  updateTaskOptimistic,
  useCourses,
  useTasks,
} from '@/lib/data-hooks';
import { useProgression } from '@/lib/progression/use-progression';
import { useTimer } from '@/lib/timer-context';
import { isoDate } from '@/lib/utils';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import SessionLogModal from './SessionLogModal';

interface Props {
  onResolved?: () => void;
}

export default function PendingSessionLogSheet({ onResolved }: Props) {
  const { pendingLog, clearPendingLog } = useTimer();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks } = useTasks();
  // The pending sitting is folded into this reading, so `sitting` is what
  // saving it will do to the record, read before the reader decides.
  const { sitting } = useProgression();
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

  async function handleSave(note: string, markTaskDone: boolean) {
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
      await addSessionOptimistic({
        courseId: pendingLog.courseId,
        taskId: pendingLog.taskId,
        date: pendingLog.date || isoDate(),
        durationSeconds,
        note,
        breakSeconds: pendingLog.breakSeconds,
        segments: pendingLog.segments,
      });
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
