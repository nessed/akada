import type {
  Course,
  RecallAnswer,
  RecallRecord,
  RecallSource,
  RecallVerdict,
  Task,
} from '../data';
import { daysBetween, isoDate, logicalDateOf } from '../utils';
import {
  RECALL_EXAM_MIN_WEIGHT,
  RECALL_EXAM_RUNUP_DAYS,
  RECALL_EXAM_WINDOW_DAYS,
  RECALL_HISTORY_MAX,
  RECALL_INTERVALS,
  RECALL_PER_COURSE_PER_DAY,
  RECALL_PER_DAY,
  RECALL_PROMPT_MAX,
  RECALL_SETTLED_RUN,
} from './constants';

export * from './constants';

/**
 * Recall.
 *
 * Everything else in Akada measures the hours going in. This is the one part
 * that asks what came out of them: whether a reading finished last week can
 * still be given back with the book shut, whether the conjugate trick a
 * problem set drilled on Saturday is still there on Wednesday. It asks a few
 * of those a day, at widening gaps, and it believes the answer.
 *
 * It asks because asking is the studying. Pulling a thing back out of memory
 * does more for keeping it than reading it again, and a gap before the asking
 * does more than no gap; the two together are the best supported study
 * techniques there are. It also tells the reader something no hour count can,
 * which is what they actually no longer have. A student who believes the
 * readings are fine does not open them, and the belief is almost always
 * formed while the book is still open.
 *
 * Like the progression layer, nothing here is stored except facts. The facts
 * are the answers. When a thing next comes up is worked out from its answers
 * on every read, so there is no schedule to drift out of step with the
 * history that made it, and a finished reading needs no row at all until it
 * is first answered: it is read straight off the task. That is what lets a
 * term that started before this existed arrive with its readings already in
 * it, rather than empty.
 */

export interface RecallItem {
  key: string;
  courseId: string;
  prompt: string;
  source: RecallSource;
  ref: string | null;
  /** The task behind the item, when it still exists. */
  task: Task | null;
  /** The step behind a step item, when it still exists. */
  subtaskId: string | null;
  /** The day the thing entered memory: a reading finished, a line kept. */
  origin: string;
  history: RecallAnswer[];
  letGo: boolean;
  /** The stored row. A finished reading never answered or let go has none. */
  record: RecallRecord | null;
  /**
   * Other finished tasks for the same reading, written down twice and asked
   * about once, as this item. Their task sheets point here rather than
   * offering to keep them again.
   */
  twins: string[];
}

/** Never asked yet, or how the last asking went. */
export type RecallStanding = 'new' | RecallVerdict;

export interface RecallState extends RecallItem {
  /**
   * How far out the schedule has got: one gap further for each clear, one
   * back for a hazy, back to the start for gone. Capped at the last interval.
   */
  box: number;
  /** The last answers clear, on enough separate days running. See RECALL_SETTLED_RUN. */
  settled: boolean;
  dueOn: string;
  due: boolean;
  standing: RecallStanding;
  last: RecallAnswer | null;
  /**
   * Days to the exam pulling this course forward, if one is near. It orders
   * the asking and pulls the date in; it is never said.
   */
  examDays: number | null;
}

export interface CourseRecall {
  courseId: string;
  /** Kept and not let go. */
  kept: number;
  /** Clear on several separate days running. */
  settled: number;
  /** Clear last time, and not settled yet. */
  clear: number;
  hazy: number;
  gone: number;
  /** Kept but never asked yet. */
  fresh: number;
  due: number;
  /** Due first, in asking order, then by when each next comes up. */
  states: RecallState[];
}

export interface RecallReading {
  today: string;
  /** Everything kept and not let go. */
  states: RecallState[];
  /** Everything due, in the order it would be asked. */
  due: RecallState[];
  /** What Today asks for now: what is due, within the day's few. */
  queue: RecallState[];
  /** Items answered today, which the day's few are counted against. */
  answeredToday: number;
  byCourse: Map<string, CourseRecall>;
  /** Everything let go, so keeping one again can bring it back with its answers. */
  letGo: RecallItem[];
}

export interface RecallInput {
  courses: Course[];
  tasks: Task[];
  records: RecallRecord[];
  today?: string;
  /**
   * The reader's day for a stored instant: when a reading was finished, when
   * a line was kept. This device's day by default, honouring the late-night
   * cutoff the way `today` does. The connector runs in UTC and passes the
   * student's own offset instead.
   */
  dayOf?: (instant: Date) => string;
}

/* ── What counts as a reading ─────────────────────────────────────────── */

const READ_PREFIX = /^\s*(re-?read|reading|read)\b[\s:–—-]*/i;
// "(2011)", "(1912)", "(2013a)": an author-date citation, which is how a
// syllabus names a reading and how nothing else on a task list is written.
const CITATION = /\(\s*(1[5-9]|20)\d{2}[a-z]?\s*\)/;
const CHAPTER = /\b(ch\.?|chapters?)\s*\d+/i;
// "— done with Claude", "- done": a completion written into the title.
const DONE_SUFFIX = /\s+[–—-]+\s*done\b.*$/i;

/**
 * Whether a finished task is a reading, for the purpose of recalling it.
 *
 * `kind` says so when anybody set it. Most tasks arrive without one, typed
 * quickly or read off a syllabus, so the title is read as well, for the three
 * ways a reading announces itself on a list: it starts with "Read", it cites
 * an author and a year, or it names a chapter. A false match costs one tap,
 * since anything can be let go; a missed one costs a reading that is never
 * asked about, which is the more expensive mistake.
 */
export function looksLikeReading(task: Pick<Task, 'kind' | 'title'>): boolean {
  if (task.kind === 'reading') return true;
  if (task.kind === 'exam') return false;
  const title = task.title ?? '';
  return READ_PREFIX.test(title) || CITATION.test(title) || CHAPTER.test(title);
}

/** The reading as it is asked about: no "Read:" in front, no "— done" behind. */
export function readingPrompt(title: string): string {
  const cleaned = title.replace(READ_PREFIX, '').replace(DONE_SUFFIX, '').trim();
  return (cleaned || title).slice(0, RECALL_PROMPT_MAX);
}

// The class meeting a title is filed under ("— Session 4", "- week 3"): when
// it is due, not what it is.
const MEETING_SUFFIX = /\s*[–—-]+\s*(session|week|class|lecture|seminar|tutorial)\s*\d+\b.*$/i;
// Everything before an author-date citation, the year with its letter, and
// everything after it.
const CITED = /^(.*?)\(\s*((?:1[5-9]|20)\d{2}[a-z]?)\s*\)(.*)$/i;

function words(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * How a finished reading is filed, so the same reading written down twice,
 * once off the syllabus and once when it was done, is asked about once.
 *
 * `work` is the author and the year with its letter when the title cites one,
 * otherwise the whole title; `rest` is everything the title says after the
 * citation, word for word, less a leading article and the class meeting it
 * was set for. Two copies are one reading when both match, so Waltz (1979)
 * Ch. 1 and Ch. 6, Keohane (1984) After Hegemony and his other 1984, and a
 * primary source and its critique filed under the same year all stay apart.
 * Comparing every word rather than picking out chapter numbers is on purpose:
 * a merge that should not have happened hides a reading from recall for good,
 * while one that should have and did not costs a single extra question.
 */
function readingFile(title: string): { work: string; rest: string } {
  const prompt = readingPrompt(title).replace(MEETING_SUFFIX, '');
  const cited = prompt.match(CITED);
  if (!cited) return { work: words(prompt), rest: '' };
  return {
    work: `${words(cited[1])} ${cited[2].toLowerCase()}`,
    rest: words(cited[3]).replace(/^(the|a|an) /, ''),
  };
}

/* ── Dates ────────────────────────────────────────────────────────────── */

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** A stored timestamp as the reader's day it fell on. */
function dayFrom(
  timestamp: string | null | undefined,
  dayOf: (instant: Date) => string,
  fallback: string,
): string {
  if (!timestamp) return fallback;
  const d = new Date(timestamp);
  return Number.isNaN(d.getTime()) ? fallback : dayOf(d);
}

/* ── The schedule ─────────────────────────────────────────────────────── */

/**
 * When a thing next comes up, from its answers alone.
 *
 * Replayed oldest first: clear moves it one gap further out, hazy one gap
 * back in, gone all the way back to tomorrow. A thing never asked comes up
 * the day after it was learned, which is the recall that does the most good.
 *
 * `examOn` is the nearest exam in the thing's course, when one is close. If
 * the ordinary gap would carry the next asking past the day before that exam,
 * and the thing has not been asked in the few days before that already, it is
 * pulled in to the eve, so everything kept for an exam is asked once more
 * with the exam in view. Something asked in the run-up keeps its ordinary
 * gap, which also means the pull can never land on a day already answered.
 */
export function scheduleRecall(
  history: RecallAnswer[],
  origin: string,
  examOn: string | null = null,
): { box: number; dueOn: string } {
  let box = 0;
  for (const answer of history) {
    if (answer.verdict === 'clear') box = Math.min(box + 1, RECALL_INTERVALS.length - 1);
    else if (answer.verdict === 'hazy') box = Math.max(box - 1, 0);
    else box = 0;
  }
  const last = history.at(-1) ?? null;
  const from = last ? last.on : origin;
  let dueOn = addDays(from, last ? RECALL_INTERVALS[box] : 1);
  if (examOn) {
    const eve = addDays(examOn, -1);
    if (dueOn > eve && from < addDays(eve, -RECALL_EXAM_RUNUP_DAYS)) dueOn = eve;
  }
  return { box, dueOn };
}

/** How many of the latest answers came back clear, counting back from the last. */
export function clearRun(history: RecallAnswer[]): number {
  let run = 0;
  for (let i = history.length - 1; i >= 0 && history[i].verdict === 'clear'; i -= 1) run += 1;
  return run;
}

/**
 * The history after answering. A second answer on the same day replaces the
 * first rather than joining it, so a changed mind is one answer, and putting
 * back an answer is putting back the history it replaced. Kept in date order
 * whatever order the answers arrive in, since the last one is read as the
 * latest: a quiz in a chat can land an answer dated before one given on Today.
 */
export function applyVerdict(
  history: RecallAnswer[],
  verdict: RecallVerdict,
  on: string = isoDate(),
): RecallAnswer[] {
  const kept = history.filter((answer) => answer.on !== on);
  return [...kept, { on, verdict }]
    .sort((a, b) => a.on.localeCompare(b.on))
    .slice(-RECALL_HISTORY_MAX);
}

/* ── Exams ────────────────────────────────────────────────────────────── */

// A midterm or a final, named as one.
const MAJOR_EXAM = /\b(mid-?terms?|finals?|exams?|examinations?)\b/i;

/**
 * Whether a piece is one to prepare for, and so pulls its course's recall in.
 * By its weight whenever the weight is known, exam or not: a weekly quiz is
 * marked as an exam as often as not, and one worth two per cent pulling
 * everything in every week undoes the widening gaps as surely as a weekly
 * problem set would. With no weight, only an exam that calls itself a
 * midterm, a final or an exam, which is what an unweighted midterm looks
 * like on a list.
 */
function preparesFor(task: Task): boolean {
  if (task.weight != null) return task.weight >= RECALL_EXAM_MIN_WEIGHT;
  return task.kind === 'exam' && MAJOR_EXAM.test(task.title);
}

/**
 * The nearest exam, or heavily weighted piece, still ahead in each course,
 * within the window that pulls recall forward.
 */
function nearestExams(tasks: Task[], today: string): Map<string, string> {
  const exams = new Map<string, string>();
  for (const task of tasks) {
    if (task.completed || !task.dueDate || task.dueDate < today) continue;
    if (!preparesFor(task)) continue;
    if (daysBetween(today, task.dueDate) > RECALL_EXAM_WINDOW_DAYS) continue;
    const held = exams.get(task.courseId);
    if (!held || task.dueDate < held) exams.set(task.courseId, task.dueDate);
  }
  return exams;
}

/* ── Reading it all ───────────────────────────────────────────────────── */

/** Everything kept, answered or not, before any of it is scheduled. */
function readItems(
  courses: Course[],
  tasks: Task[],
  records: RecallRecord[],
  today: string,
  dayOf: (instant: Date) => string,
): RecallItem[] {
  const courseIds = new Set(courses.map((c) => c.id));
  const byKey = new Map(records.map((record) => [record.key, record]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const items: RecallItem[] = [];
  const used = new Set<string>();

  // Finished readings, read straight off the tasks. The same reading written
  // down twice, once off the syllabus and once when it was done, is one thing
  // to remember; the copy that has been answered wins, then the one finished
  // first, and the others are its twins.
  const readings = new Map<string, Map<string, RecallItem[]>>();
  for (const task of tasks) {
    if (!task.completed || !courseIds.has(task.courseId) || !looksLikeReading(task)) continue;
    const key = `task:${task.id}`;
    const record = byKey.get(key) ?? null;
    const item: RecallItem = {
      key,
      courseId: task.courseId,
      prompt: readingPrompt(task.title),
      source: record?.source === 'task' ? 'task' : 'reading',
      ref: task.id,
      task,
      subtaskId: null,
      origin: dayFrom(task.completedAt ?? task.createdAt, dayOf, today),
      history: record?.history ?? [],
      letGo: record?.letGo ?? false,
      record,
      twins: [],
    };
    used.add(key);
    const { work, rest } = readingFile(task.title);
    const shelf = `${task.courseId}|${work}`;
    const copies = readings.get(shelf) ?? new Map<string, RecallItem[]>();
    copies.set(rest, [...(copies.get(rest) ?? []), item]);
    readings.set(shelf, copies);
  }
  for (const copies of readings.values()) {
    // A copy with nothing after its citation ("Hobson (2012) — done") is the
    // same reading as a titled one only when there is exactly one titled
    // reading of that work for it to be. Beside two, it could be either, so
    // it stays a reading of its own.
    const bare = copies.get('');
    const titled = [...copies.keys()].filter((rest) => rest !== '');
    if (bare && titled.length === 1) {
      copies.get(titled[0])?.push(...bare);
      copies.delete('');
    }
    for (const same of copies.values()) {
      const [first, ...others] = [...same].sort(readingOrder);
      items.push({ ...first, twins: others.map((copy) => copy.ref as string) });
    }
  }

  // Everything else was kept on purpose and has a row.
  for (const record of records) {
    if (used.has(record.key) || !courseIds.has(record.courseId)) continue;
    const [taskId, subtaskId] = splitRef(record);
    const task = taskId ? (taskById.get(taskId) ?? null) : null;
    // A whole task put back on the list is being worked on again, and asking
    // for it from memory in the meantime would be asking the wrong question.
    // A step is different: "gone" unticks it on purpose and it still has to
    // come back tomorrow.
    if (task && !task.completed && (record.source === 'reading' || record.source === 'task')) continue;
    const step = subtaskId ? task?.subtasks?.find((s) => s.id === subtaskId) : undefined;
    // The task's own words while it exists, so a renamed step reads as it is
    // now; the stored prompt once it is gone, which is what the prompt is
    // stored for.
    const live = step
      ? step.title
      : task && record.source !== 'step'
        ? record.source === 'reading'
          ? readingPrompt(task.title)
          : task.title
        : '';
    items.push({
      key: record.key,
      courseId: record.courseId,
      prompt: live || record.prompt,
      source: record.source,
      ref: record.ref,
      task,
      subtaskId: step ? step.id : subtaskId,
      origin: dayFrom(record.createdAt, dayOf, today),
      history: record.history,
      letGo: record.letGo,
      record,
      twins: [],
    });
  }

  return items;
}

/** Which copy of a reading written down twice is the one asked about: the most answered, then the first finished. */
function readingOrder(a: RecallItem, b: RecallItem): number {
  const answered = (item: RecallItem) => item.history.length + (item.letGo ? 1 : 0);
  return answered(b) - answered(a) || a.origin.localeCompare(b.origin) || a.key.localeCompare(b.key);
}

function splitRef(record: RecallRecord): [string | null, string | null] {
  if (!record.ref) return [null, null];
  if (record.source !== 'step') return [record.ref, null];
  const at = record.ref.indexOf(':');
  return at < 0 ? [record.ref, null] : [record.ref.slice(0, at), record.ref.slice(at + 1)];
}

const ASKING_RANK: Record<RecallStanding, number> = { gone: 0, hazy: 1, new: 2, clear: 3 };

/**
 * The order things are asked in. What slipped comes first, since relearning
 * is the whole reason for asking; then what has never been asked, because the
 * first recall after learning is the one that does the most; then the clear
 * ones coming round again. A near exam lifts its course within each of those,
 * and the longest waiting goes first after that.
 */
function askingOrder(a: RecallState, b: RecallState): number {
  return (
    ASKING_RANK[a.standing] - ASKING_RANK[b.standing] ||
    (a.examDays ?? 999) - (b.examDays ?? 999) ||
    a.dueOn.localeCompare(b.dueOn) ||
    a.origin.localeCompare(b.origin) ||
    a.key.localeCompare(b.key)
  );
}

export function readRecall({
  courses,
  tasks,
  records,
  today = isoDate(),
  dayOf = logicalDateOf,
}: RecallInput): RecallReading {
  const exams = nearestExams(tasks, today);
  const items = readItems(courses, tasks, records, today, dayOf);

  const states: RecallState[] = items
    .filter((item) => !item.letGo)
    .map((item) => {
      const examOn = exams.get(item.courseId) ?? null;
      const { box, dueOn } = scheduleRecall(item.history, item.origin, examOn);
      const last = item.history.at(-1) ?? null;
      return {
        ...item,
        box,
        settled: clearRun(item.history) >= RECALL_SETTLED_RUN,
        dueOn,
        due: dueOn <= today,
        standing: last ? last.verdict : 'new',
        last,
        examDays: examOn ? daysBetween(today, examOn) : null,
      };
    });

  const due = states.filter((state) => state.due).sort(askingOrder);
  const answeredToday = states.filter((state) => state.last?.on === today).length;

  // The day's few, spread across courses. A course may take three of the
  // five; if the others have nothing due, it takes the rest too, since a
  // quiet course is no reason to ask less.
  const room = Math.max(0, RECALL_PER_DAY - answeredToday);
  const queue: RecallState[] = [];
  const perCourse = new Map<string, number>();
  const held: RecallState[] = [];
  for (const state of due) {
    if (queue.length >= room) break;
    const taken = perCourse.get(state.courseId) ?? 0;
    if (taken >= RECALL_PER_COURSE_PER_DAY) {
      held.push(state);
      continue;
    }
    perCourse.set(state.courseId, taken + 1);
    queue.push(state);
  }
  for (const state of held) {
    if (queue.length >= room) break;
    queue.push(state);
  }

  const byCourse = new Map<string, CourseRecall>();
  for (const course of courses) {
    const mine = states.filter((state) => state.courseId === course.id);
    if (mine.length === 0) continue;
    const dueHere = mine.filter((state) => state.due).sort(askingOrder);
    const later = mine
      .filter((state) => !state.due)
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.key.localeCompare(b.key));
    byCourse.set(course.id, {
      courseId: course.id,
      kept: mine.length,
      settled: mine.filter((state) => state.settled).length,
      clear: mine.filter((state) => state.standing === 'clear' && !state.settled).length,
      hazy: mine.filter((state) => state.standing === 'hazy').length,
      gone: mine.filter((state) => state.standing === 'gone').length,
      fresh: mine.filter((state) => state.standing === 'new').length,
      due: dueHere.length,
      states: [...dueHere, ...later],
    });
  }

  return {
    today,
    states,
    due,
    queue,
    answeredToday,
    byCourse,
    letGo: items.filter((item) => item.letGo),
  };
}

/**
 * Where a whole task stands in recall: the thing asked about for it, which may
 * be filed under a copy of the same reading written down twice, or the thing
 * let go. Null when recall has nothing on it.
 */
export function recallOfTask(
  reading: RecallReading,
  taskId: string,
): { kept: RecallState; letGo: null } | { kept: null; letGo: RecallItem } | null {
  const mine = (item: RecallItem) =>
    item.source !== 'step' && (item.ref === taskId || item.twins.includes(taskId));
  const kept = reading.states.find(mine);
  if (kept) return { kept, letGo: null };
  const letGo = reading.letGo.find(mine);
  return letGo ? { kept: null, letGo } : null;
}

/**
 * The line written under a thing being recalled: what to actually do with the
 * book shut. Short, and never "you should".
 */
export function recallCue(state: Pick<RecallItem, 'source'>): string {
  switch (state.source) {
    case 'reading':
      return 'the argument, without looking';
    case 'step':
    case 'task':
      return 'do one fresh, nothing in front of you';
    default:
      return 'say it back, without your notes';
  }
}
