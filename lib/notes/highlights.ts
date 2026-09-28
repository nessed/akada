/**
 * What a reader has run the highlighter over, on one note.
 *
 * A mark is a stretch of the note's text as the reader reads it (the rendered
 * words, not the markdown), kept as where it starts and ends in that text and
 * the words themselves. The words are what matter: a note edited since, or a
 * check opened above it, moves the offsets, and a mark is found again by its
 * words before it is given up.
 */
export type Mark = { s: number; e: number; t: string };

export const marksKey = (id: string) => `akada.notes.marks.${id}`;

const WORD = /[\p{L}\p{N}_'’]/u;

/** A stretch widened to whole words, with the space at its ends let go. */
export function snapToWords(text: string, s: number, e: number): [number, number] | null {
  let start = Math.max(0, Math.min(s, e));
  let end = Math.min(text.length, Math.max(s, e));
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  if (start >= end) return null;
  while (start > 0 && WORD.test(text[start - 1]) && WORD.test(text[start])) start--;
  while (end < text.length && WORD.test(text[end]) && WORD.test(text[end - 1])) end++;
  if (!WORD.test(text.slice(start, end))) return null;
  return [start, end];
}

/** A new stretch laid on the page, run together with any it touches. */
export function addMark(marks: Mark[], text: string, s: number, e: number): Mark[] {
  const snapped = snapToWords(text, s, e);
  if (!snapped) return marks;
  const spans = [...marks.map((m) => [m.s, m.e] as [number, number]), snapped].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged.map(([a, b]) => ({ s: a, e: b, t: text.slice(a, b) }));
}

/** The mark a tap at this point in the text lands in, taken off. */
export function removeMarkAt(marks: Mark[], at: number): Mark[] {
  const next = marks.filter((m) => !(at >= m.s && at <= m.e));
  return next.length === marks.length ? marks : next;
}

/**
 * Stored marks placed on the text as it is now: where they were if the words
 * are still there, else the first place the words are found, else dropped.
 */
export function resolveMarks(marks: Mark[], text: string): Mark[] {
  const out: Mark[] = [];
  for (const mark of marks) {
    if (!mark || typeof mark.t !== 'string' || !mark.t) continue;
    if (text.slice(mark.s, mark.e) === mark.t) {
      out.push(mark);
      continue;
    }
    if (mark.t.length < 3) continue;
    // The nearest copy of the words to where they were.
    let best = -1;
    for (let at = text.indexOf(mark.t); at >= 0; at = text.indexOf(mark.t, at + 1)) {
      if (best < 0 || Math.abs(at - mark.s) < Math.abs(best - mark.s)) best = at;
    }
    if (best >= 0) out.push({ s: best, e: best + mark.t.length, t: mark.t });
  }
  return out.sort((a, b) => a.s - b.s);
}

export function parseMarks(raw: string | null): Mark[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is Mark => m && typeof m.s === 'number' && typeof m.e === 'number' && typeof m.t === 'string' && m.e > m.s,
    );
  } catch {
    return [];
  }
}
