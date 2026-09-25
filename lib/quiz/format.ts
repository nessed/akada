import type { QuizAttempt, QuizQuestion } from '@/lib/data/types';

/**
 * The quiz format, written once. The connector hands it to an assistant so a
 * quiz sent from a chat parses the same way every time, and the parser below
 * is what holds it to it. Plain text rather than JSON on purpose: a model
 * writes this shape without slipping, and a person can read it back.
 */
export const QUIZ_FORMAT_RULES = `QUIZ FORMAT

Plain text, one quiz per call. Nothing else in the text: no preamble, no code fences, no HTML.

# Quiz title
Optional one line of context (course, chapter, pages).

1. The question, on one or more lines.
A) First option
B) Second option
C) Third option
D) Fourth option
Answer: B
Why: One or two sentences on why B is right, and why the tempting wrong one is wrong.

2. The next question.
A) ...
B) ...
Answer: A
Why: ...

RULES
1. The first line is "# " and the title. The line after it, if it is not a question, is kept as the context line.
2. Number questions "1.", "2.", ... at the start of the line. A question can run over several lines until its first option.
3. Options are a capital letter and ")" at the start of the line: "A) ", "B) ", up to "F) ". Between 2 and 6 options, in order, no gaps.
4. Exactly one right answer per question, given as "Answer: " and its letter.
5. "Why: " is optional but wanted. It is shown after the student answers, so explain the idea, not just the letter.
6. Plain words. $inline LaTeX$ is fine. No "All of the above" or "None of the above".
7. Between 1 and 50 questions. Leave a blank line between questions.`;

export const QUIZ_TITLE_MAX = 300;
export const QUIZ_TEXT_MAX = 100_000;
export const QUIZ_QUESTIONS_MAX = 50;
/** Attempts kept per quiz, oldest dropped first. */
export const QUIZ_ATTEMPTS_MAX = 30;

export interface ParsedQuiz {
  title: string;
  context: string;
  questions: QuizQuestion[];
}

export type ParseResult = { ok: true; quiz: ParsedQuiz } | { ok: false; errors: string[] };

const QUESTION = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const OPTION = /^\s*\(?([A-Fa-f])[.)]\s+(.*)$/;
const ANSWER = /^\s*\**answer\**\s*[:：]\**\s*\(?([A-Fa-f])\)?\b/i;
const WHY = /^\s*\**(why|explanation|because)\**\s*[:：]\**\s*(.*)$/i;
const TITLE = /^\s*#\s+(.+)$/;

/**
 * Reads a quiz written in QUIZ_FORMAT_RULES. Every problem is reported with
 * its question number, so an assistant can fix the text and send it again.
 */
export function parseQuiz(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').replace(/^\s*```[\w-]*\s*\n|\n\s*```\s*$/g, '').split('\n');
  const errors: string[] = [];
  let title = '';
  let context = '';
  const questions: QuizQuestion[] = [];
  type Draft = { n: number; prompt: string[]; options: string[]; letters: string[]; answer: string | null; why: string[]; mode: 'prompt' | 'options' | 'why' };
  let draft: Draft | null = null;

  const close = () => {
    if (!draft) return;
    const d = draft;
    draft = null;
    const label = `Question ${d.n}`;
    const prompt = d.prompt.join(' ').replace(/\s+/g, ' ').trim();
    if (!prompt) errors.push(`${label}: the question text is empty.`);
    if (d.options.length < 2) errors.push(`${label}: needs at least 2 options written "A) ...", "B) ...".`);
    if (d.options.length > 6) errors.push(`${label}: has ${d.options.length} options; 6 at most.`);
    const expected = 'ABCDEF'.slice(0, d.letters.length);
    if (d.letters.join('') !== expected) errors.push(`${label}: options must run A, B, C… in order with no gaps (got ${d.letters.join(', ')}).`);
    if (!d.answer) errors.push(`${label}: missing an "Answer: " line with the right letter.`);
    const answer = d.answer ? d.letters.indexOf(d.answer) : -1;
    if (d.answer && answer < 0) errors.push(`${label}: the answer ${d.answer} is not one of its options.`);
    if (d.options.some((o) => !o.trim())) errors.push(`${label}: an option is empty.`);
    const explain = d.why.join(' ').replace(/\s+/g, ' ').trim();
    questions.push({ prompt, options: d.options.map((o) => o.trim()), answer: Math.max(0, answer), ...(explain ? { explain } : {}) });
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (draft && (draft as Draft).mode === 'why') (draft as Draft).mode = 'options';
      continue;
    }
    const t = TITLE.exec(line);
    if (t && !draft && !questions.length && !title) {
      title = t[1].replace(/[*_`~]/g, '').trim();
      continue;
    }
    const q = QUESTION.exec(line);
    if (q) {
      close();
      draft = { n: Number(q[1]), prompt: [q[2]], options: [], letters: [], answer: null, why: [], mode: 'prompt' };
      continue;
    }
    if (!draft) {
      if (title && !context && !questions.length) context = line.trim();
      else errors.push(`Line "${line.trim().slice(0, 60)}" is outside any question. Start each question with its number, like "1. ".`);
      continue;
    }
    const d: Draft = draft;
    const a = ANSWER.exec(line);
    if (a) {
      d.answer = a[1].toUpperCase();
      d.mode = 'options';
      continue;
    }
    const w = WHY.exec(line);
    if (w) {
      d.why.push(w[2]);
      d.mode = 'why';
      continue;
    }
    const o = OPTION.exec(line);
    if (o && d.mode !== 'why') {
      d.letters.push(o[1].toUpperCase());
      d.options.push(o[2]);
      d.mode = 'options';
      continue;
    }
    if (d.mode === 'prompt') d.prompt.push(line.trim());
    else if (d.mode === 'why') d.why.push(line.trim());
    else if (d.options.length && !d.answer) d.options[d.options.length - 1] += ` ${line.trim()}`;
    else errors.push(`Question ${d.n}: could not place the line "${line.trim().slice(0, 60)}".`);
  }
  close();

  if (!questions.length && !errors.length) errors.push('No questions found. Number each one "1. ", "2. " at the start of its line.');
  if (questions.length > QUIZ_QUESTIONS_MAX) errors.push(`${questions.length} questions; ${QUIZ_QUESTIONS_MAX} at most in one quiz.`);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    quiz: {
      title: (title || 'Quiz').slice(0, QUIZ_TITLE_MAX),
      context: context.slice(0, 300),
      questions,
    },
  };
}

/** Questions from storage, with anything malformed dropped rather than trusted. */
export function cleanQuestions(value: unknown): QuizQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: QuizQuestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const q = item as Record<string, unknown>;
    const options = Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === 'string') : [];
    const answer = Number(q.answer);
    if (typeof q.prompt !== 'string' || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;
    out.push({ prompt: q.prompt, options, answer, ...(typeof q.explain === 'string' && q.explain ? { explain: q.explain } : {}) });
  }
  return out;
}

export function cleanAttempts(value: unknown): QuizAttempt[] {
  if (!Array.isArray(value)) return [];
  const out: QuizAttempt[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const picks = Array.isArray(a.picks) ? a.picks.map((p) => (Number.isInteger(p) ? (p as number) : -1)) : [];
    const score = Number(a.score);
    const total = Number(a.total);
    if (typeof a.at !== 'string' || !Number.isFinite(score) || !Number.isFinite(total) || total < 1) continue;
    out.push({ at: a.at, picks, score, total });
  }
  return out.slice(-QUIZ_ATTEMPTS_MAX);
}

/** Marks a set of picks against the key. An unanswered question is -1 and counts wrong. */
export function markQuiz(questions: QuizQuestion[], picks: number[]): QuizAttempt {
  const clean = questions.map((_, i) => (Number.isInteger(picks[i]) ? picks[i] : -1));
  const score = questions.reduce((n, q, i) => n + (clean[i] === q.answer ? 1 : 0), 0);
  return { at: new Date().toISOString(), picks: clean, score, total: questions.length };
}

export const LETTERS = 'ABCDEF';
