import type { Task } from './types';

/**
 * The order a course's tasks read in when the student has arranged them.
 *
 * `position` is what a task was dragged into on its course page, or placed at
 * by the MCP's reorder_tasks. It is optional on purpose, the way
 * Course.position is: a task nobody has placed, one added since, and every
 * task on a project that has not re-run supabase/schema.sql have none. Those
 * follow the placed ones in the "what matters" order the list always had:
 * high priority first, then soonest due, undated last. So before anything is
 * dragged this is exactly the old order, and a new task lands at the bottom.
 */
export function compareTaskOrder(a: Task, b: Task): number {
  const ap = typeof a.position === 'number' ? a.position : Number.MAX_SAFE_INTEGER;
  const bp = typeof b.position === 'number' ? b.position : Number.MAX_SAFE_INTEGER;
  if (ap !== bp) return ap - bp;
  if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
  const due = (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  if (due !== 0) return due;
  return a.createdAt.localeCompare(b.createdAt);
}
