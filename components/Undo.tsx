'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNotice } from './Notice';
import { updateTaskOptimistic, useCourses, useTasks } from '@/lib/data-hooks';
import type { Task } from '@/lib/data';
import LogTimeSheet from './LogTimeSheet';

/**
 * The one way back, app wide.
 *
 * A tick is one tap on a phone and one stray click with a mouse, and a list
 * that hides finished work takes the row away as it lands, so a task ticked
 * by mistake used to vanish with nothing on screen to say where it went. Every
 * change worth taking back leaves one slip here, naming what it did, with an
 * Undo on it. `Z` reaches the same Undo from the keyboard, and so does `⌘Z`,
 * which is where a hand goes first.
 *
 * There is only ever one. A new change replaces the slip rather than stacking
 * under it, and undo takes back the change the slip names, never an older one
 * the reader can no longer see.
 */

export interface UndoEntry {
  /** What happened, as a statement: "Finished Problem set 3". */
  label: string;
  /** Put it back. Runs once, and the slip is gone before it does. */
  restore: () => Promise<void>;
  /**
   * A finished task. While its slip is up, Enter opens the Log time sheet
   * for it, since a tick is the moment the time is still remembered.
   */
  task?: Task;
}

interface UndoApi {
  offer: (entry: UndoEntry) => void;
}

const UndoContext = createContext<UndoApi | null>(null);

/** Long enough to be read and reached, on a phone as well. */
const DWELL_MS = 8000;

export function useUndo(): UndoApi {
  const context = useContext(UndoContext);
  return context ?? { offer: () => {} };
}

export default function UndoProvider({ children }: { children: React.ReactNode }) {
  const { notify } = useNotice();
  const { courses } = useCourses();
  const { tasks } = useTasks();
  const [entry, setEntry] = useState<UndoEntry | null>(null);
  const entryRef = useRef<UndoEntry | null>(null);
  /* The task being logged against. Kept after the sheet closes so it can
     lower on its way out rather than vanish. */
  const [logging, setLogging] = useState<Task | null>(null);
  const [loggingOpen, setLoggingOpen] = useState(false);

  const offer = useCallback((next: UndoEntry) => {
    entryRef.current = next;
    setEntry(next);
  }, []);

  const run = useCallback(async () => {
    const current = entryRef.current;
    if (!current) return;
    entryRef.current = null;
    setEntry(null);
    try {
      await current.restore();
    } catch (error) {
      console.error('Failed to undo:', error);
      notify('That could not be undone.');
    }
  }, [notify]);

  useEffect(() => {
    if (!entry) return;
    const t = window.setTimeout(() => {
      if (entryRef.current === entry) entryRef.current = null;
      setEntry((current) => (current === entry ? null : current));
    }, DWELL_MS);
    return () => window.clearTimeout(t);
  }, [entry]);

  const logTime = useCallback(() => {
    const current = entryRef.current;
    if (!current?.task) return;
    entryRef.current = null;
    setEntry(null);
    setLogging(current.task);
    setLoggingOpen(true);
  }, []);

  // Enter, only while a tick's slip is up. Bound in the capture phase so the
  // Tasks list, which opens the row under the cursor on Enter, does not
  // answer the same press.
  useEffect(() => {
    if (!entry?.task) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Enter') return;
      if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=true]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      logTime();
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [entry, logTime]);

  // Bound only while there is something to take back, so Z and ⌘Z are left
  // alone the rest of the time.
  useEffect(() => {
    if (!entry) return;
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'z') return;
      if (event.altKey || event.shiftKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable=true]')) return;
      event.preventDefault();
      void run();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry, run]);

  const api = useMemo(() => ({ offer }), [offer]);

  return (
    <UndoContext.Provider value={api}>
      {children}
      {entry && (
        <div
          // Clear of the bottom nav and the Tasks bulk bar on a phone.
          className="pointer-events-none fixed inset-x-0 bottom-[calc(160px+env(safe-area-inset-bottom))] z-40 flex animate-fade-in justify-center px-4 md:bottom-[calc(6rem+env(safe-area-inset-bottom))]"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-[10px] border border-line bg-paper py-2 pl-3.5 pr-2 shadow-[0_8px_20px_rgba(57,48,36,.12)]">
            <span className="min-w-0 truncate text-[13px] text-ink">{entry.label}</span>
            {entry.task && (
              <button
                type="button"
                onClick={logTime}
                aria-keyshortcuts="Enter"
                className="h-9 touch:h-11 shrink-0 rounded-[8px] px-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:bg-bg-tint hover:text-ink"
              >
                Log time
              </button>
            )}
            <button
              type="button"
              onClick={() => void run()}
              aria-keyshortcuts="Z"
              className="h-9 touch:h-11 shrink-0 rounded-[8px] px-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-bg-tint"
            >
              Undo
            </button>
          </div>
        </div>
      )}
      {logging && courses.find((c) => c.id === logging.courseId) && (
        <LogTimeSheet
          open={loggingOpen}
          course={courses.find((c) => c.id === logging.courseId)!}
          tasks={tasks.filter((t) => t.courseId === logging.courseId)}
          initialTaskId={logging.id}
          onClose={() => setLoggingOpen(false)}
          onSaved={(minutes) => notify(`${minutes} min logged on ${logging.title}.`)}
        />
      )}
    </UndoContext.Provider>
  );
}

/**
 * The slip a tick leaves: the task goes back to open, with no finish time,
 * exactly as it was before the tick.
 */
export function finishedUndo(task: Task): UndoEntry {
  return {
    label: `Done: ${task.title}`,
    task,
    restore: async () => {
      await updateTaskOptimistic(task.id, { completed: false, completedAt: null });
    },
  };
}

/** The slip a skip leaves: the task back on the list, not finished any way. */
export function skippedUndo(task: Task): UndoEntry {
  return {
    label: `Skipped: ${task.title}`,
    restore: async () => {
      await updateTaskOptimistic(task.id, { completed: false, completedAt: null, completedVia: null });
    },
  };
}
