'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import PageShell from '@/components/PageShell';
import ConfirmSheet from '@/components/ConfirmSheet';
import LoadingIndicator from '@/components/LoadingIndicator';
import JotTaskSheet from '@/components/JotTaskSheet';
import EditTaskSheet from '@/components/EditTaskSheet';
import TaskLine from '@/components/TaskLine';
import Tally from '@/components/notebook/Tally';
import GradeStanding from '@/components/course/GradeStanding';
import SessionLog from '@/components/course/SessionLog';
import { useArchivedCourse } from '@/components/course/useArchivedCourse';
import { Eyebrow, PageButton, PlayGlyph, Swipe, TextButton, Tick } from '@/components/notebook/Marks';
import type { Course, Session, Task } from '@/lib/data';
import { isLoggableDuration } from '@/lib/session-safety';
import { useTimer } from '@/lib/timer-context';
import { formatHM, isoDate, resolveTint, startOfWeek } from '@/lib/utils';
import { secondsInRange, weekBounds } from '@/lib/derive';
import {
  useOnboardingComplete,
  useCourses,
  useSessions,
  useTasks,
  toggleTaskOptimistic,
} from '@/lib/data-hooks';

/**
 * One course, on its own page.
 *
 * The redesign gives this screen the two things it could not say before: what
 * the course is worth, broken down piece by piece, and what the reader wrote
 * down while studying it. A session used to be a duration and nothing else,
 * which made the log a list of numbers; with the note attached it becomes the
 * only record of what actually happened in those hours.
 */
export default function CoursePage() {
  const params = useParams<{ courseId: string }>();
  const courseId = typeof params?.courseId === 'string' ? params.courseId : '';
  const router = useRouter();
  const { active, cancel } = useTimer();

  const { onboarded, isLoading: onboardingLoading, error: onboardingError } =
    useOnboardingComplete();
  const { courses, isLoading: coursesLoading } = useCourses();
  const { sessions: rawSessions, isLoading: sessionsLoading } = useSessions();
  const { tasks, isLoading: tasksLoading } = useTasks();

  const [jotting, setJotting] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  useEffect(() => {
    if (onboardingError) {
      router.replace('/auth');
      return;
    }
    if (!onboardingLoading && onboarded === false) router.replace('/onboarding');
  }, [onboarded, onboardingLoading, onboardingError, router]);

  const loading =
    onboardingLoading || onboarded === false || coursesLoading || sessionsLoading || tasksLoading;

  const course = courses.find((item) => item.id === courseId);

  // Only once the active semester has been read, and the course was not in it,
  // is it worth looking through the terms that have already finished.
  const { archived, searching } = useArchivedCourse(
    courseId,
    !loading && !course && courseId !== '',
  );

  const courseSessions = useMemo(
    () =>
      rawSessions.filter(
        (s) => s.courseId === courseId && isLoggableDuration(s.durationSeconds),
      ),
    [rawSessions, courseId],
  );

  const mine = useMemo(() => tasks.filter((t) => t.courseId === courseId), [tasks, courseId]);
  const open = useMemo(
    () =>
      mine
        .filter((t) => !t.completed && t.kind !== 'reading')
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
          return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
        }),
    [mine],
  );
  const readings = useMemo(() => mine.filter((t) => t.kind === 'reading'), [mine]);

  const today = isoDate();
  const weekSeconds = useMemo(() => {
    const [from, to] = weekBounds(new Date());
    return secondsInRange(courseSessions, from, to);
  }, [courseSessions]);
  const allSeconds = courseSessions.reduce((acc, s) => acc + s.durationSeconds, 0);

  /** The last nine weeks of this course, for the bars in the aside. */
  const weekBars = useMemo(() => {
    const bars: { key: string; seconds: number; isNow: boolean }[] = [];
    for (let i = 8; i >= 0; i -= 1) {
      const start = startOfWeek(new Date());
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      bars.push({
        key: isoDate(start),
        seconds: secondsInRange(courseSessions, isoDate(start), isoDate(end)),
        isNow: i === 0,
      });
    }
    return bars;
  }, [courseSessions]);

  function beginTimer() {
    if (!course) return;
    router.push(`/timer?course=${course.id}`);
  }

  function handleStartSession() {
    if (!course) return;
    // A timer already running on something else would be discarded, which is
    // the one thing here worth stopping to ask about.
    if (active && (active.courseId !== course.id || active.taskId !== null)) {
      setConfirmSwitch(true);
      return;
    }
    beginTimer();
  }

  function handleStartForTask(task: Task) {
    // A session already on the clock keeps it.
    if (active) {
      router.push('/timer');
      return;
    }
    router.push(`/timer?course=${task.courseId}&task=${task.id}`);
  }

  if (loading || searching) {
    return (
      <PageShell>
        <LoadingIndicator compact label="Opening the course" className="mb-6" />
      </PageShell>
    );
  }

  if (!course && archived) {
    return <ArchivedCourseView archived={archived} />;
  }

  if (!course) {
    return (
      <PageShell>
        <Link href="/dashboard" className="font-serif text-[13.5px] italic text-muted">
          ← courses
        </Link>
        <p className="mt-8 font-serif text-[20px] text-ink-soft">
          That course is not on this term&apos;s list.
        </p>
      </PageShell>
    );
  }

  const peak = Math.max(1, ...weekBars.map((b) => b.seconds));

  const aside = (
    <>
      <GradeStanding course={course} tasks={mine} today={today} />

      {readings.length > 0 && (
        <div className="mt-6 border-t border-line-strong pt-4">
          <Eyebrow className="mb-2.5">To read</Eyebrow>
          {readings.map((task, i) => (
            <div
              key={task.id}
              className={`flex items-baseline gap-2.5 py-2 ${
                i === readings.length - 1 ? '' : 'row-rule'
              } ${task.completed ? 'opacity-45' : ''}`}
            >
              <span className="min-w-0 flex-1 text-[13.5px]">{task.title}</span>
              {task.pages ? (
                <span
                  className="flex-none font-mono text-[11px]"
                  style={{
                    color:
                      !task.completed && task.dueDate && task.dueDate < today
                        ? 'var(--warn)'
                        : 'var(--muted)',
                  }}
                >
                  {task.pages}p
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mb-8 mt-6 border-t border-line-strong pt-4">
        <Eyebrow className="mb-3">Hours, week by week</Eyebrow>
        <div className="flex h-[60px] items-end gap-1.5">
          {weekBars.map((bar) => (
            <span
              key={bar.key}
              title={`${formatHM(bar.seconds)}`}
              className="flex-1"
              style={{
                height: `${Math.max(4, (bar.seconds / peak) * 100)}%`,
                background: bar.isNow
                  ? 'var(--ink)'
                  : bar.seconds > 0
                    ? course.color
                    : 'var(--bg-tint)',
              }}
            />
          ))}
        </div>
        <p className="mt-2.5 font-serif text-[13px] italic text-muted">
          Nine weeks. The dark one is this week.
        </p>
      </div>
    </>
  );

  return (
    <PageShell aside={aside} width="read">
      <Link href="/dashboard" className="font-serif text-[13.5px] italic text-muted">
        ← courses
      </Link>

      <div className="mt-5 flex flex-col items-start justify-between gap-6 md:flex-row">
        <div className="min-w-0">
          <Eyebrow style={{ color: course.color }}>
            {course.code}
            {course.section ? ` · section ${course.section}` : ''}
          </Eyebrow>
          <h1 className="mt-2 font-serif text-[30px] font-normal leading-[1.03] tracking-[-0.03em] md:text-[40px]">
            <Swipe color={resolveTint(course.color, course.tint)}>{course.name}</Swipe>
          </h1>
          {(course.instructor || course.meetingTime || course.credits) && (
            <p className="mt-3 flex flex-wrap items-center gap-3.5 text-[13px] text-ink-soft">
              {course.instructor && <span>{course.instructor}</span>}
              {course.instructor && course.meetingTime && <Tick />}
              {course.meetingTime && <span>{course.meetingTime}</span>}
              {course.credits ? (
                <>
                  <Tick />
                  <span className="font-mono text-xs">{course.credits} cr</span>
                </>
              ) : null}
            </p>
          )}
        </div>

        <div className="w-full flex-none md:w-auto">
          <PageButton
            size="sheet"
            icon={<PlayGlyph />}
            onClick={handleStartSession}
            className="md:px-7"
          >
            Start a session
          </PageButton>
        </div>
      </div>

      {/* The week against what was asked for. */}
      <div className="rule-ink mt-7 flex flex-col items-start gap-6 pt-4 md:flex-row md:items-end md:gap-11">
        <div>
          <Eyebrow>This week</Eyebrow>
          <p className="mt-2 font-mono text-[28px] font-bold leading-none tracking-[-0.03em] md:text-[34px]">
            {formatHM(weekSeconds)}
            <span className="font-serif text-[16px] font-normal italic text-muted">
              {' '}
              of {course.weeklyGoalHours}h you wanted
            </span>
          </p>
        </div>
        <div className="min-w-0 flex-1 pb-1.5">
          <Tally
            hours={weekSeconds / 3600}
            goal={course.weeklyGoalHours}
            height={30}
            width={3}
            gap={5}
            color={course.color}
            reading={false}
          />
        </div>
      </div>

      {/* Written down for this course. */}
      <section className="mt-8">
        <div className="flex items-baseline gap-3.5 border-b border-line pb-2.5">
          <p className="m-0 font-serif text-[19px]">Written down for this course</p>
          <span className="ml-auto font-mono text-[11px] text-muted">{open.length} open</span>
        </div>
        {open.length === 0 ? (
          <p className="py-4 font-serif text-[15px] italic text-muted">
            Nothing on the list for this one.
          </p>
        ) : (
          open.map((task) => (
            <TaskLine
              key={task.id}
              task={task}
              course={course}
              onToggle={() => toggleTaskOptimistic(task).catch(() => {})}
              onOpen={() => setEditing(task)}
              onStart={() => handleStartForTask(task)}
            />
          ))
        )}
        <div className="mt-2.5 flex items-baseline gap-5">
          <TextButton tone="quiet" onClick={() => setJotting(true)}>
            + add a task
          </TextButton>
          <Link
            href={`/tasks?course=${course.id}`}
            className="font-serif text-[13px] italic text-muted hover:text-muted"
          >
            see it in the list →
          </Link>
        </div>
      </section>

      {/* What you wrote down while studying. */}
      <SessionLog sessions={courseSessions} course={course} totalSeconds={allSeconds} />

      <JotTaskSheet
        open={jotting}
        onClose={() => setJotting(false)}
        courses={courses}
        defaultCourseId={course.id}
      />
      <EditTaskSheet task={editing} courses={courses} onClose={() => setEditing(null)} />

      <ConfirmSheet
        open={confirmSwitch}
        title="A timer is already running"
        body="Starting this one discards what is on the clock now."
        confirmLabel="Start the new one"
        onCancel={() => setConfirmSwitch(false)}
        onConfirm={() => {
          cancel();
          setConfirmSwitch(false);
          beginTimer();
        }}
      />
    </PageShell>
  );
}

/**
 * A course from a term that has already finished. Read-only by nature: there
 * is nothing to start and nothing to add, only what was done at the time.
 */
function ArchivedCourseView({
  archived,
}: {
  archived: { course: Course; semester: { label: string }; sessions: Session[] };
}) {
  const { course, semester, sessions } = archived;
  const total = sessions.reduce((acc, s) => acc + s.durationSeconds, 0);

  return (
    <PageShell width="read">
      <Link href="/dashboard" className="font-serif text-[13.5px] italic text-muted">
        ← courses
      </Link>
      <div className="mt-5">
        <Eyebrow style={{ color: course.color }}>{course.code}</Eyebrow>
        <h1 className="mt-2 font-serif text-[30px] font-normal leading-[1.03] tracking-[-0.03em] md:text-[40px]">
          {course.name}
        </h1>
        <p className="mt-3 font-serif text-[15px] italic text-muted">
          {semester.label}, finished. {formatHM(total)} across{' '}
          {sessions.length === 1 ? 'one sitting' : `${sessions.length} sittings`}.
        </p>
      </div>
      <SessionLog sessions={sessions} course={course} totalSeconds={total} />
    </PageShell>
  );
}
