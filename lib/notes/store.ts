import { sampleMarkdown } from './sample';

export type Note = { id: string; title: string; markdown: string; updatedAt: number; createdAt?: number };

/*
 * Notes live in this browser for now, the way Markd kept them. Nothing here
 * touches Supabase; a synced table is the next step, not this one.
 */
export const DOCS_KEY = 'akada.notes.v1';
export const scrollKey = (id: string) => `akada.notes.scroll.${id}`;
export const checksKey = (id: string) => `akada.notes.checks.${id}`;
export const draftKey = 'akada.notes.draft.v1';
export const READER_KEY = 'akada.notes.reader.v1';
/** How far through a note the reader got, 0 to 1, for the shelf's "4m left". */
export const progressKey = (id: string) => `akada.notes.progress.${id}`;
/** The note last read, and the section it was left in, for "Where you left off". */
export const LAST_READ_KEY = 'akada.notes.last.v1';
/** Focus mode's own choices: the spotlight and the lamp. */
export const FOCUS_KEY = 'akada.notes.focus.v1';

export type LastRead = { id: string; at: number; section: string };
export function readLastRead(): LastRead | null {
  try {
    const raw = JSON.parse(readStore(LAST_READ_KEY) || 'null');
    return raw && typeof raw.id === 'string' ? { id: raw.id, at: Number(raw.at) || 0, section: String(raw.section ?? '') } : null;
  } catch {
    return null;
  }
}
export function readProgress(id: string) {
  const value = Number(readStore(progressKey(id)));
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
/** Kept together, since both are written from the same scroll. */
export function rememberReading(id: string, progress: number, section: string) {
  writeStore(progressKey(id), progress.toFixed(3));
  writeStore(LAST_READ_KEY, JSON.stringify({ id, at: Date.now(), section }));
}

export function readStore(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage can be disabled or full. */
  }
}
export function removeStore(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Keep the reader usable. */
  }
}

export function titleFromMarkdown(markdown: string) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`~]/g, '').trim();
  return title || `Untitled · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

export function loadNotes(): Note[] {
  try {
    const raw = readStore(DOCS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed))
        return parsed.filter(
          (item) => typeof item?.id === 'string' && typeof item?.markdown === 'string' && typeof item?.title === 'string',
        );
    }
  } catch {
    /* Corrupt storage reads as an empty shelf rather than a crash. */
  }
  return [];
}

export function sampleNote(): Note {
  const now = Date.now();
  return { id: `sample-${now}`, title: titleFromMarkdown(sampleMarkdown), markdown: sampleMarkdown, updatedAt: now, createdAt: now };
}

export function newNoteId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Words in the prose, with code, math and markup stripped. */
export function wordCount(markdown: string) {
  const prose = markdown
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]+\$/g, ' x ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^>\s*\[![\w-]+\]/gm, ' ')
    .replace(/[#>*_`~|=-]/g, ' ');
  return prose.split(/\s+/).filter(Boolean).length;
}

/** Study pace, not skimming pace: notes are read slower than articles. */
export const minutesFor = (words: number) => Math.max(1, Math.round(words / 200));

export function dateLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeLabel(timestamp: number) {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Each note gets a pastel from the course palette, picked from its id so it
 * never moves, and drawn as the same 3px stripe a course carries in the rail.
 */
const PASTELS = ['--sage', '--rose', '--lav', '--peach', '--sky', '--clay', '--butter', '--mint', '--slate', '--mauve'];
export function noteColor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return `var(${PASTELS[Math.abs(hash) % PASTELS.length]})`;
}

export function downloadNote(note: Note) {
  const blob = new Blob([note.markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${note.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'note'}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type CheckResult = 'got' | 'miss';
export function loadChecks(id: string): Record<string, CheckResult> {
  try {
    const parsed = JSON.parse(readStore(checksKey(id)) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * AI chats hand markdown back inside a fenced block. Pasting that straight
 * in would render the whole note as code, so one outer fence is peeled off.
 */
export function unwrapFence(text: string) {
  const trimmed = text.trim();
  const match = /^(`{3,}|~{3,})[\w-]*[ \t]*\n([\s\S]*?)\n\1[ \t]*$/.exec(trimmed);
  return match && !match[2].includes(match[1]) ? match[2] : text;
}
