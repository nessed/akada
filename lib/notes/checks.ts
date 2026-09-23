/**
 * The "Check yourself" blocks in a note, in the order the reader numbers
 * them. The index is the key a result is stored under, so this has to agree
 * with the reader: one per `> [!CHECK]` blockquote, fenced code skipped.
 */

export type CheckResult = 'got' | 'miss';

export interface NoteCheck {
  index: number;
  question: string;
  answer: string;
}

const CHECK_START = /^ {0,3}>\s*\[!CHECK\]\s*/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

export function extractChecks(markdown: string): NoteCheck[] {
  const lines = markdown.split(/\r?\n/);
  const checks: NoteCheck[] = [];
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence || !CHECK_START.test(line)) continue;
    const body: string[] = [line.replace(CHECK_START, '')];
    while (i + 1 < lines.length && /^ {0,3}>/.test(lines[i + 1])) {
      i++;
      body.push(lines[i].replace(/^ {0,3}>\s?/, ''));
    }
    const text = body.join('\n').trim();
    // The answer is whatever follows the first blank line, or an explicit
    // "Answer" label, whichever comes first.
    const labelled = /\n?\s*\*{0,2}answers?:?\*{0,2}:?\s*/i.exec(text);
    const blank = text.indexOf('\n\n');
    let cut = -1;
    if (labelled && (blank < 0 || labelled.index <= blank + 2)) cut = labelled.index;
    else if (blank >= 0) cut = blank;
    const question = (cut >= 0 ? text.slice(0, cut) : text).trim();
    const answer = cut >= 0 ? text.slice(cut).replace(/^\s*\*{0,2}answers?:?\*{0,2}:?\s*/i, '').trim() : '';
    checks.push({ index: checks.length, question, answer });
  }
  return checks;
}

export function cleanChecks(value: unknown, total?: number): Record<string, CheckResult> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, CheckResult> = {};
  for (const [key, result] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{1,3}$/.test(key)) continue;
    if (total !== undefined && Number(key) >= total) continue;
    if (result === 'got' || result === 'miss') out[key] = result;
  }
  return out;
}
