'use client';

// Centralised SWR-backed read/write hooks for the planner data layer.
//
// Why this exists: every page used to mount, run db.isOnboardingComplete()
// then several db.get*() calls in series. Switching tabs re-ran the whole
// chain → 2-3s blank screens. With SWR the first visit warms a global cache
// (keyed per resource) and every subsequent navigation reads from memory.
//
// Mutations call the underlying db.*() then `mutate(key)` to revalidate.
// Several of the hot paths use optimistic updates so the UI doesn't wait
// on the network round-trip (toggle task, add task, log session, etc.).
//
// Cache keys are simple strings since this app is single-user. If we ever
// went multi-tenant on the client we'd want to scope keys per user.

import useSWR, { mutate } from 'swr';
import type {
  Course,
  Session,
  Semester,
  NewSemesterInput,
  Task,
  UserSettings,
} from './data';
import { db } from './data';
import { clearStoredTimerState } from './timer-context';

const KEY = {
  onboarding: 'onboarding-complete',
  courses: 'courses',
  sessions: 'sessions',
  tasks: 'tasks',
  activeSemester: 'active-semester',
  semesters: 'semesters',
  userSettings: 'user-settings',
} as const;

/* ───────── Reads ───────── */

export function useOnboardingComplete() {
  const { data, error, isLoading } = useSWR(KEY.onboarding, () =>
    db.isOnboardingComplete(),
  );
  return { onboarded: data, error, isLoading };
}

export function useCourses() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(KEY.courses, () =>
    db.getCourses(),
  );
  return { courses: data ?? [], error, isLoading, revalidate };
}

export function useSessions() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(KEY.sessions, () =>
    db.getSessions(),
  );
  return { sessions: data ?? [], error, isLoading, revalidate };
}

export function useTasks() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(KEY.tasks, () =>
    db.getTasks(),
  );
  return { tasks: data ?? [], error, isLoading, revalidate };
}

/** The semester Dashboard/Tasks/Timer currently write into. */
export function useActiveSemester() {
  const { data, error, isLoading } = useSWR(KEY.activeSemester, () => db.getActiveSemester());
  return { semester: data ?? null, error, isLoading };
}

/** Every semester the user has, newest first — for the Settings archive list. */
export function useSemesters() {
  const { data, error, isLoading, mutate: revalidate } = useSWR(KEY.semesters, () =>
    db.getSemesters(),
  );
  return { semesters: data ?? [], error, isLoading, revalidate };
}

export function useUserSettings() {
  const { data, error, isLoading } = useSWR(KEY.userSettings, () =>
    db.getUserSettings(),
  );
  return { settings: data ?? null, error, isLoading };
}

/* ───────── Helpers ───────── */

// Optimistic id used for newly-created records before the server returns one.
// Pages should treat any id starting with `optimistic-` as not-yet-persisted.
function optimisticId() {
  return `optimistic-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

/* ───────── Course mutations ───────── */

export async function addCourseOptimistic(
  course: Omit<Course, 'id' | 'createdAt'>,
): Promise<Course> {
  const optimistic: Course = {
    ...course,
    id: optimisticId(),
    createdAt: nowIso(),
  };
  await mutate(
    KEY.courses,
    async (current: Course[] | undefined) => {
      const list = current ?? [];
      const saved = await db.addCourse(course);
      return [...list.filter((c) => c.id !== optimistic.id), saved];
    },
    {
      optimisticData: (current: Course[] | undefined) => [
        ...(current ?? []),
        optimistic,
      ],
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
  return optimistic;
}

export async function updateCourseOptimistic(
  id: string,
  patch: Partial<Course>,
) {
  await mutate(
    KEY.courses,
    async (current: Course[] | undefined) => {
      await db.updateCourse(id, patch);
      const list = current ?? [];
      return list.map((c) => (c.id === id ? { ...c, ...patch } : c));
    },
    {
      optimisticData: (current: Course[] | undefined) =>
        (current ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
}

export async function deleteCourseOptimistic(id: string) {
  await mutate(
    KEY.courses,
    async (current: Course[] | undefined) => {
      await db.deleteCourse(id);
      return (current ?? []).filter((c) => c.id !== id);
    },
    {
      optimisticData: (current: Course[] | undefined) =>
        (current ?? []).filter((c) => c.id !== id),
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
  // Sessions/tasks may reference this course — invalidate them.
  mutate(KEY.sessions);
  mutate(KEY.tasks);
}

/* ───────── Task mutations ───────── */

export async function addTaskOptimistic(
  task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>,
) {
  const optimistic: Task = {
    ...task,
    id: optimisticId(),
    completed: false,
    completedAt: null,
    createdAt: nowIso(),
  };
  await mutate(
    KEY.tasks,
    async (current: Task[] | undefined) => {
      const saved = await db.addTask(task);
      const list = current ?? [];
      return [...list.filter((t) => t.id !== optimistic.id), saved];
    },
    {
      optimisticData: (current: Task[] | undefined) => [
        ...(current ?? []),
        optimistic,
      ],
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
}

export async function updateTaskOptimistic(id: string, patch: Partial<Task>) {
  await mutate(
    KEY.tasks,
    async (current: Task[] | undefined) => {
      await db.updateTask(id, patch);
      const list = current ?? [];
      return list.map((t) => (t.id === id ? { ...t, ...patch } : t));
    },
    {
      optimisticData: (current: Task[] | undefined) =>
        (current ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
}

export async function toggleTaskOptimistic(task: Task) {
  const next: Partial<Task> = {
    completed: !task.completed,
    completedAt: !task.completed ? nowIso() : null,
  };
  return updateTaskOptimistic(task.id, next);
}

export async function deleteTaskOptimistic(id: string) {
  await mutate(
    KEY.tasks,
    async (current: Task[] | undefined) => {
      await db.deleteTask(id);
      return (current ?? []).filter((t) => t.id !== id);
    },
    {
      optimisticData: (current: Task[] | undefined) =>
        (current ?? []).filter((t) => t.id !== id),
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
}

/* ───────── Session mutations ───────── */

export async function addSessionOptimistic(
  session: Omit<Session, 'id' | 'createdAt'>,
) {
  const optimistic: Session = {
    ...session,
    id: optimisticId(),
    createdAt: nowIso(),
  };
  await mutate(
    KEY.sessions,
    async (current: Session[] | undefined) => {
      const saved = await db.addSession(session);
      const list = current ?? [];
      return [saved, ...list.filter((s) => s.id !== optimistic.id)];
    },
    {
      optimisticData: (current: Session[] | undefined) => [
        optimistic,
        ...(current ?? []),
      ],
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
}

export async function deleteSessionOptimistic(id: string) {
  await mutate(
    KEY.sessions,
    async (current: Session[] | undefined) => {
      await db.deleteSession(id);
      return (current ?? []).filter((s) => s.id !== id);
    },
    {
      optimisticData: (current: Session[] | undefined) =>
        (current ?? []).filter((s) => s.id !== id),
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
}

/* ───────── Settings & semester ───────── */

export async function updateUserSettingsOptimistic(patch: Partial<UserSettings>) {
  await mutate(
    KEY.userSettings,
    async (current: UserSettings | null | undefined) => {
      await db.updateUserSettings(patch);
      const base = current ?? {
        displayName: '',
        dailyGoalHours: 4,
        avatarUrl: '',
      };
      return { ...base, ...patch };
    },
    {
      optimisticData: (current: UserSettings | null | undefined) => {
        const base = current ?? {
          displayName: '',
          dailyGoalHours: 4,
          avatarUrl: '',
        };
        return { ...base, ...patch };
      },
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
}

/**
 * Starts a new semester and makes it active. Every course/task/session read
 * is scoped to the active semester, so the moment this resolves, Dashboard,
 * Tasks and Timer are looking at a blank slate — the previous semester's
 * data hasn't gone anywhere, it's just no longer what "active" points at.
 * Those three caches have to be dropped, not just the semester ones, or the
 * UI would keep showing the old semester's courses until something else
 * happened to trigger a refetch.
 */
export async function createSemesterOptimistic(input: NewSemesterInput): Promise<Semester> {
  const created = await db.createSemester(input);
  await Promise.all([
    mutate(KEY.activeSemester, created, { revalidate: false }),
    mutate(KEY.semesters),
    mutate(KEY.courses, [], { revalidate: false }),
    mutate(KEY.tasks, [], { revalidate: false }),
    mutate(KEY.sessions, [], { revalidate: false }),
  ]);
  return created;
}

export async function updateSemesterOptimistic(id: string, updates: NewSemesterInput) {
  await mutate(
    KEY.semesters,
    async (current: Semester[] | undefined) => {
      const updated = await db.updateSemester(id, updates);
      return (current ?? []).map((s) => (s.id === id ? updated : s));
    },
    {
      optimisticData: (current: Semester[] | undefined) =>
        (current ?? []).map((s) => (s.id === id ? { ...s, ...updates } : s)),
      rollbackOnError: true,
      populateCache: true,
      revalidate: false,
    },
  );
  // The active semester's own card (Dashboard's progress ribbon, etc.) may
  // be the one that was just edited.
  mutate(KEY.activeSemester);
}

/* ───────── Lifecycle ───────── */

export async function markOnboardingComplete() {
  await db.setOnboardingComplete();
  await mutate(KEY.onboarding, true, { revalidate: false });
}

export async function resetAllData() {
  clearStoredTimerState();
  await db.resetAll();
  // Wipe every cached resource so pages re-fetch fresh.
  await Promise.all([
    mutate(KEY.onboarding, false, { revalidate: false }),
    mutate(KEY.courses, [], { revalidate: false }),
    mutate(KEY.sessions, [], { revalidate: false }),
    mutate(KEY.tasks, [], { revalidate: false }),
    mutate(KEY.activeSemester, null, { revalidate: false }),
    mutate(KEY.semesters, [], { revalidate: false }),
    mutate(KEY.userSettings, null, { revalidate: false }),
  ]);
}

// Public re-exports so consumers can build their own SWR keys / call
// mutate(KEY.foo) without re-deriving the constant.
export const PLANNER_KEYS = KEY;
