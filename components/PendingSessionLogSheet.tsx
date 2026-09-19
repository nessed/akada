'use client';

import { useEffect, useMemo, useState } from 'react';
import { addSessionOptimistic, useCourses } from '@/lib/data-hooks';
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

  async function handleSave(note: string) {
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
      });
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
      durationSeconds={pendingLog?.durationSeconds ?? 0}
      saving={saving}
      contextMessage={
        pendingLog?.recoveryReason === 'away'
          ? 'Recovered while you were away.'
          : pendingLog?.recoveryReason === 'max'
            ? 'Reached the session limit.'
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
