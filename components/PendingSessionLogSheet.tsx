'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  addSessionOptimistic,
  updateTaskOptimistic,
  useCourses,
  useNotes,
  useQuizzes,
  useTasks,
} from '@/lib/data-hooks';
import { loadQuizDraft } from '@/lib/quiz/draft';
import { sittingSuggestions, sittingWindow } from '@/lib/session-suggestions';
import { settled } from '@/lib/progression';
import { useProgression } from '@/lib/progression/use-progression';
import { useTimerState } from '@/lib/timer-context';
import { keepLine } from '@/lib/recall/actions';
import { formatHM, isoDate } from '@/lib/utils';
import { LONG_SITTING_SECONDS } from '@/lib/timer-idle';
import { useNotice } from './Notice';
import { clampSessionSeconds, isLoggableDuration } from '@/lib/session-safety';
import SessionLogModal from './SessionLogModal';
import SavePicture from './SavePicture';
import { usePreferences } from '@/lib/preferences';
import { courseKey, oceanKeyFromSegments } from '@/lib/ocean/key';
import { woodKeyFromSegments } from '@/lib/wood/clock';

/* Only fetched for a reader whose timer draws the deep, or the wood. */
const DiveRecap = dynamic(() => import('./DiveRecap'), { ssr: false });
const WoodRecap = dynamic(() => import('./WoodRecap'), { ssr: false });

/* The scene still under the sheet on the timer, for "this moment". */
const findScene = () => document.querySelector<HTMLElement>('[data-ocean-scene]');

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

export default function PendingSessionLogSheet() {
  const { active, pendingLog, clearPendingLog } = useTimerState();
  const { notify } = useNotice();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { tasks } = useTasks();
  // Notes and quizzes only feed the suggestions on a sitting's sheet, and
  // this sheet is on every screen. They load while a sitting runs, so they
  // are here by the time it ends, and are not read at all otherwise.
  const sittingLive = Boolean(active || pendingLog);
  const { quizzes } = useQuizzes(sittingLive);
  const { notes } = useNotes(sittingLive);
  // The pending sitting is folded into this reading, so `sitting` is what
  // saving it will do to the record, read before the reader decides.
  const { sitting, logged } = useProgression();
  const [{ timerDrawing, darkMode }] = usePreferences();
  // The deep's read of the session. A recovered sitting gets none: the clock
  // ran on without the reader, and the ocean would be telling them about a
  // dive they did not take.
  const diveKey =
    pendingLog && timerDrawing === 'ocean' && !pendingLog.recoveryReason
      ? oceanKeyFromSegments(pendingLog.courseId, pendingLog.segments)
      : null;
  // The wood's, under the same rule.
  const woodKey =
    pendingLog && timerDrawing === 'wood' && !pendingLog.recoveryReason
      ? woodKeyFromSegments(pendingLog.courseId, pendingLog.segments)
      : null;
  // The reader's usual sitting on this course, from the record without this
  // one in it, so the figure is what "usually" meant before today.
  const usual = pendingLog ? logged?.habits.byCourse.get(pendingLog.courseId)?.sittings ?? null : null;
  const [open, setOpen] = useState(false);
  // Keep the picture, opened from under the dive's recap.
  const [pictureOpen, setPictureOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [online, setOnline] = useState(true);
  // Whether to log the sitting cut where it went quiet rather than in full.
  // Held after no input, it opens cut; anything else opens in full and
  // offers the cut when there is one worth offering.
  const [useQuiet, setUseQuiet] = useState(false);
  useEffect(() => {
    setUseQuiet(Boolean(pendingLog?.quiet) && pendingLog?.recoveryReason === 'idle');
  }, [pendingLog]);
  const chosen =
    pendingLog && useQuiet && pendingLog.quiet
      ? pendingLog.quiet
      : pendingLog
        ? { durationSeconds: pendingLog.durationSeconds, breakSeconds: pendingLog.breakSeconds, segments: pendingLog.segments }
        : null;

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

  // What the record says happened while the clock ran, offered under "What
  // did you do?" so a quiz sat mid-sitting doesn't have to be typed back in.
  const suggestions = useMemo(() => {
    if (!pendingLog) return [];
    const startedQuizIds = new Set(
      quizzes
        .filter((quiz) => loadQuizDraft(quiz.id, quiz.questions.length))
        .map((quiz) => quiz.id),
    );
    return sittingSuggestions({
      window: sittingWindow(pendingLog.segments),
      courseId: pendingLog.courseId,
      task,
      quizzes,
      notes,
      tasks,
      startedQuizIds,
    });
  }, [notes, pendingLog, quizzes, task, tasks]);

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
    setPictureOpen(false);
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
    }
  }, [clearPendingLog, course, courses.length, coursesLoading, pendingLog]);

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
    const durationSeconds = clampSessionSeconds(chosen?.durationSeconds ?? pendingLog.durationSeconds);
    // A sitting the reader did not end, or cut back by hand from a very long
    // one: kept, but not a length records and habits should learn from.
    const recovery =
      pendingLog.recoveryReason ?? (useQuiet || durationSeconds > LONG_SITTING_SECONDS ? 'idle' : null);
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
        breakSeconds: chosen?.breakSeconds ?? pendingLog.breakSeconds,
        segments: chosen?.segments ?? pendingLog.segments,
        ...(recovery ? { recovery } : {}),
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
            completedVia: 'session',
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
  }

  return (
    <>
      <SessionLogModal
        open={open}
        course={course}
        task={task}
        durationSeconds={chosen?.durationSeconds ?? 0}
        breakSeconds={chosen?.breakSeconds ?? 0}
        segments={chosen?.segments ?? []}
        recap={
          diveKey && pendingLog ? (
            <>
              <DiveRecap
                sittingKey={diveKey}
                courseKey={courseKey(pendingLog.courseId)}
                focusSeconds={chosen?.durationSeconds ?? 0}
                dark={darkMode}
                className="mt-3"
              />
              {/* The sitting as one picture, kept before the sheet takes it
                  away. One quiet line, the same pencil link the notice uses. */}
              <button
                type="button"
                onClick={() => setPictureOpen(true)}
                className="hand-underline mt-2 bg-transparent px-0.5 font-serif text-[13px] italic text-ink-soft"
              >
                keep the picture of this sitting
              </button>
            </>
          ) : woodKey && pendingLog ? (
            <WoodRecap
              woodKey={woodKey}
              courseId={pendingLog.courseId}
              focusSeconds={chosen?.durationSeconds ?? 0}
              night={pendingLog.segments.some((s) => s.kind === 'focus' && s.targetSeconds == null)}
              className="mt-3"
            />
          ) : null
        }
        suggestions={suggestions}
        effect={pendingLog && sitting?.courseId === pendingLog.courseId ? sitting : null}
        usualSeconds={usual && settled(usual) ? usual.median : null}
        saving={saving}
        notice={
          pendingLog && course ? (
            <LogNotice
              log={pendingLog}
              courseCode={course.code}
              useQuiet={useQuiet}
              onUseQuiet={setUseQuiet}
            />
          ) : null
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
      {diveKey && pendingLog && (
        <SavePicture
          open={pictureOpen}
          onClose={() => setPictureOpen(false)}
          initial="sitting"
          momentRoot={findScene}
          sitting={{
            courseId: pendingLog.courseId,
            color: course?.color ?? '#A8B89B',
            segments: chosen?.segments ?? pendingLog.segments,
            tzOffset: new Date().getTimezoneOffset(),
          }}
          night={darkMode}
          name={`akada-sitting-${pendingLog.date || isoDate()}`}
        />
      )}
    </>
  );
}

type PendingLog = NonNullable<ReturnType<typeof useTimerState>['pendingLog']>;

function clockOf(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Why the sheet is on the screen, which it is on every screen until it is
 * answered, and anything to decide about the length. It used to say nothing
 * and simply follow the reader from tab to tab.
 */
function LogNotice({
  log,
  courseCode,
  useQuiet,
  onUseQuiet,
}: {
  log: PendingLog;
  courseCode: string;
  useQuiet: boolean;
  onUseQuiet: (value: boolean) => void;
}) {
  const full = formatHM(log.durationSeconds);
  const quiet = log.quiet;
  const link = 'hand-underline ml-1 bg-transparent px-0.5 not-italic text-[13px] text-ink';

  if (log.recoveryReason === 'idle' && quiet) {
    return useQuiet ? (
      <p className="m-0">
        You went quiet at {clockOf(quiet.at)}. Logging up to there,{' '}
        <span className="font-mono not-italic text-[12.5px]">{formatHM(quiet.durationSeconds)}</span>.
        <button type="button" onClick={() => onUseQuiet(false)} className={link}>
          Keep the full {full}
        </button>
      </p>
    ) : (
      <p className="m-0">
        Keeping the full <span className="font-mono not-italic text-[12.5px]">{full}</span>.
        <button type="button" onClick={() => onUseQuiet(true)} className={link}>
          Log up to {clockOf(quiet.at)} instead
        </button>
      </p>
    );
  }

  const why =
    log.recoveryReason === 'away'
      ? `The timer on ${courseCode} was left running while the page was closed, so it stopped where it was last open.`
      : log.recoveryReason === 'break'
        ? `The break ran past 45 minutes, so the ${courseCode} session was closed where it began.`
        : log.recoveryReason === 'max'
          ? `The ${courseCode} session reached the 18 hour limit and stopped there.`
          : `You stopped a ${full} session on ${courseCode} and haven't saved it.`;

  // Anything over four hours is asked about, however it ended.
  const long = log.durationSeconds > LONG_SITTING_SECONDS;
  return (
    <>
      <p className="m-0">{why}</p>
      {long && (
        <p className="m-0 mt-1">
          {full} is a long session. Is it right?
          {quiet && (
            <button type="button" onClick={() => onUseQuiet(!useQuiet)} className={link}>
              {useQuiet
                ? `Keep the full ${full}`
                : `Log up to ${clockOf(quiet.at)} instead, ${formatHM(quiet.durationSeconds)}`}
            </button>
          )}
        </p>
      )}
    </>
  );
}
