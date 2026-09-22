'use client';

import type { RecallRecord, RecallRecordInput, RecallSource, RecallVerdict, Task } from '../data';
import { saveRecallOptimistic, updateTaskOptimistic } from '../data-hooks';
import { cleanRecallPrompt } from '../planner-safety';
import { isoDate } from '../utils';
import { applyVerdict, looksLikeReading, readingPrompt, type RecallState } from './index';

/**
 * What the recall surfaces do, in one place, so a card on Today and a card on
 * a course page cannot answer the same thing two different ways.
 *
 * Every function here returns what it takes to put the change back: the row
 * as it was, and whether a step was unticked. Undo is offered after every
 * answer, because an answer is one tap on a phone and a wrong one moves a
 * thing weeks out of sight.
 */

export interface RecallChange {
  state: RecallState;
  /** The row before the change. Null for a reading that had never been answered. */
  before: RecallRecord | null;
  /** Set when a step was unticked on its task, so undo can tick it again. */
  unticked: Task | null;
}

function inputOf(state: RecallState, patch: Partial<RecallRecordInput>): RecallRecordInput {
  return {
    key: state.key,
    courseId: state.courseId,
    prompt: state.prompt,
    source: state.source,
    ref: state.ref,
    history: state.history,
    letGo: state.letGo,
    ...patch,
  };
}

/**
 * Record how a recall went.
 *
 * A step answered `gone` is also unticked on its task. The tick on a concept
 * list means "I can do this fresh", and a recall that could not do it is the
 * one piece of evidence that settles whether that is still true; leaving the
 * tick in place would leave the list claiming something the reader has just
 * found out is false.
 */
export async function answerRecall(
  state: RecallState,
  verdict: RecallVerdict,
  on: string = isoDate(),
): Promise<RecallChange> {
  const before = state.record;
  await saveRecallOptimistic(inputOf(state, { history: applyVerdict(state.history, verdict, on) }));

  let unticked: Task | null = null;
  if (verdict === 'gone' && state.source === 'step' && state.task && state.subtaskId) {
    const task = state.task;
    const subtasks = task.subtasks ?? [];
    if (subtasks.some((step) => step.id === state.subtaskId && step.completed)) {
      try {
        await updateTaskOptimistic(task.id, {
          subtasks: subtasks.map((step) =>
            step.id === state.subtaskId ? { ...step, completed: false } : step,
          ),
        });
        unticked = task;
      } catch (error) {
        // The answer is what matters and it is saved. The tick staying is a
        // smaller wrong than the answer being lost with it.
        console.error('Failed to untick the step:', error);
      }
    }
  }
  return { state, before, unticked };
}

/** Stop asking about a thing. Kept as a row rather than deleted, so a finished reading stays out. */
export async function letGoRecall(state: RecallState): Promise<RecallChange> {
  const before = state.record;
  await saveRecallOptimistic(inputOf(state, { letGo: true }));
  return { state, before, unticked: null };
}

/** Put a change back exactly as it was. */
export async function undoRecall(change: RecallChange): Promise<void> {
  const { state, before, unticked } = change;
  await saveRecallOptimistic(
    before
      ? {
          key: before.key,
          courseId: before.courseId,
          prompt: before.prompt,
          source: before.source,
          ref: before.ref,
          history: before.history,
          letGo: before.letGo,
        }
      : // A reading that had never been answered had no row. An empty one
        // schedules exactly the same, since a reading's first asking is
        // counted from the day it was finished, not from its row.
        inputOf(state, { history: [], letGo: false }),
  );
  if (unticked && state.subtaskId) {
    await updateTaskOptimistic(unticked.id, {
      subtasks: (unticked.subtasks ?? []).map((step) =>
        step.id === state.subtaskId ? { ...step, completed: true } : step,
      ),
    });
  }
}

function randomTail(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // Fall through to the plain one.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Keep a line the reader wrote: at the end of a sitting, or on a course page.
 * Returns null for a line with nothing in it.
 */
export async function keepLine(
  courseId: string,
  text: string,
  source: Extract<RecallSource, 'note' | 'own'> = 'own',
): Promise<RecallRecord | null> {
  const prompt = cleanRecallPrompt(text);
  if (!prompt) return null;
  return saveRecallOptimistic({
    key: `${source}:${randomTail()}`,
    courseId,
    prompt,
    source,
    ref: null,
    history: [],
    letGo: false,
  });
}

/**
 * Keep a whole finished task. A reading comes into recall on its own, so this
 * is for everything else, and for bringing back a reading that was let go,
 * which keeps its reading's wording and its reading's question.
 */
export async function keepTask(task: Task): Promise<RecallRecord> {
  const reading = looksLikeReading(task);
  return saveRecallOptimistic({
    key: `task:${task.id}`,
    courseId: task.courseId,
    prompt: cleanRecallPrompt(reading ? readingPrompt(task.title) : task.title),
    source: reading ? 'reading' : 'task',
    ref: task.id,
    history: [],
    letGo: false,
  });
}

/**
 * Keep the ticked steps of a task. The steps a list of concepts has ticked
 * are the ones its reader claims to be able to do fresh, so those are the
 * ones worth checking; the unticked ones are still being learned.
 */
export async function keepTickedSteps(task: Task, alreadyKept: Set<string>): Promise<number> {
  const steps = (task.subtasks ?? []).filter(
    (step) => step.completed && !alreadyKept.has(`step:${task.id}:${step.id}`),
  );
  for (const step of steps) {
    await saveRecallOptimistic({
      key: `step:${task.id}:${step.id}`,
      courseId: task.courseId,
      prompt: cleanRecallPrompt(step.title),
      source: 'step',
      ref: `${task.id}:${step.id}`,
      history: [],
      letGo: false,
    });
  }
  return steps.length;
}
