'use client';

/**
 * A quiz being sat, kept on this device as it is filled in, so a refresh or a
 * closed tab doesn't throw away half an hour of answers. It is written on
 * every change and cleared once the paper is filed or started again. Under
 * the 'akada.' prefix, so signing out clears it with everything else.
 */
export interface QuizDraft {
  picks: number[];
  written: Record<string, string>;
  unclear: number[];
}

const key = (quizId: string) => `akada.quiz.draft.v1.${quizId}`;

export function loadQuizDraft(quizId: string, questionCount: number): QuizDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(quizId)) || 'null') as Partial<QuizDraft> | null;
    if (!raw || !Array.isArray(raw.picks) || raw.picks.length !== questionCount) return null;
    const picks = raw.picks.map((p) => (Number.isInteger(p) ? (p as number) : -1));
    const written: Record<string, string> = {};
    if (raw.written && typeof raw.written === 'object') {
      for (const [k, v] of Object.entries(raw.written)) if (typeof v === 'string' && Number(k) < questionCount) written[k] = v;
    }
    const unclear = Array.isArray(raw.unclear) ? raw.unclear.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < questionCount) : [];
    return isEmpty({ picks, written, unclear }) ? null : { picks, written, unclear };
  } catch {
    return null;
  }
}

export function saveQuizDraft(quizId: string, draft: QuizDraft): void {
  if (typeof window === 'undefined') return;
  try {
    if (isEmpty(draft)) window.localStorage.removeItem(key(quizId));
    else window.localStorage.setItem(key(quizId), JSON.stringify(draft));
  } catch {
    // Private mode or a full quota: the paper still works, it just won't survive a refresh.
  }
}

export function clearQuizDraft(quizId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(quizId));
  } catch {
    // Nothing to do.
  }
}

function isEmpty(d: QuizDraft) {
  return d.picks.every((p) => p < 0) && !Object.values(d.written).some((t) => t.trim()) && !d.unclear.length;
}
