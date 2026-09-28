'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import Icon from './Icon';
import { NoQuizzesYet, QuizRow, quizDone, quizHref, quizStatus, quizTouched } from './QuizShelf';
import { countChecks, getMarkdownHeadings } from './markdown-outline';
import { noteColor, readLastRead, readProgress, readStore, relativeLabel, wordCount, writeStore, type CheckResult } from '@/lib/notes/store';
import { minutesForNote, readingPace, type ReadingPace } from '@/lib/notes/reads';
import type { NoteRead } from '@/lib/data';
import { resolveTint } from '@/lib/utils';
import type { Course, Quiz } from '@/lib/data';
import { useQuizzes, useTasks } from '@/lib/data-hooks';

export type ShelfEntry = {
  id: string;
  title: string;
  markdown: string;
  updatedAt: number;
  courseId: string | null;
  checks: Record<string, CheckResult>;
  source: string;
  taskId: string | null;
  reads: NoteRead[];
};

type Sort = 'recent' | 'title';
type Kind = 'all' | 'notes' | 'quizzes';
// What the shelf shows, and whether Done is open, stay put between visits:
// coming back out of a note should not undo them.
const SHELF_KEY = 'akada.notes.shelf.v1';

function readShelf(): { kind: Kind; doneOpen: boolean } {
  try {
    const raw = JSON.parse(readStore(SHELF_KEY) || '{}');
    return { kind: raw.kind === 'notes' || raw.kind === 'quizzes' ? raw.kind : 'all', doneOpen: raw.doneOpen === true };
  } catch {
    return { kind: 'all', doneOpen: false };
  }
}

/** A row on the shelf: a note or a quiz, and whether anything is left to do on it. */
type Item =
  | { kind: 'note'; id: string; title: string; at: number; courseId: string | null; done: boolean; note: ShelfEntry }
  | { kind: 'quiz'; id: string; title: string; at: number; courseId: string | null; done: boolean; quiz: Quiz };
const WEEK = 7 * 86_400_000;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Markdown down to the words a person would read aloud. */
function plain(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/^\s*\|.*$/gm, ' ')
    .replace(/^\s*#.*$/gm, ' ')
    .replace(/\[![\w-]+\]/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`=$[\]!|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words around a search hit, with the hit itself marked. */
function Snippet({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{text.slice(0, 120)}</>;
  const from = Math.max(0, at - 36);
  const to = Math.min(text.length, at + query.length + 70);
  return (
    <>
      {from > 0 && '…'}
      {text.slice(from, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length, to)}
      {to < text.length && '…'}
    </>
  );
}

function hoursLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  notes: ShelfEntry[];
  courses: Course[];
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onOpenFile: () => void;
  onPrompt: () => void;
  onDeleteQuiz: (id: string, title: string) => void;
}

/**
 * The shelf. The note last read leads the page, the way Up next leads Today,
 * and everything else, notes and quizzes together, is rows written under the
 * fold, sorted and filtered with highlighter rather than tabs. What still
 * wants something (a note not read through, a quiz not taken or not marked)
 * is on the page; what is finished folds away under Done at the foot.
 */
export default function Shelf({ notes, courses, onOpen, onFocus, onDelete, onNew, onOpenFile, onPrompt, onDeleteQuiz }: Props) {
  const router = useRouter();
  const { quizzes: allQuizzes, loaded: quizzesLoaded, available: quizzesAvailable } = useQuizzes();
  const quizzes = useMemo(() => (quizzesAvailable ? allQuizzes : []), [allQuizzes, quizzesAvailable]);
  const { tasks } = useTasks();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  // The shelf only renders once the page's prefs are read on the client.
  const [kind, setKind] = useState<Kind>(() => readShelf().kind);
  const [sort, setSort] = useState<Sort>('recent');
  const [doneOpen, setDoneOpen] = useState(() => readShelf().doneOpen);
  useEffect(() => { writeStore(SHELF_KEY, JSON.stringify({ kind, doneOpen })); }, [kind, doneOpen]);
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const courseOf = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const taskOf = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const pace = useMemo(() => readingPace(notes), [notes]);
  const minutesOf = (note: ShelfEntry) => minutesForNote(note, wordCount(note.markdown), pace);

  // Reading positions live in this browser, so they are read on the client
  // only; the shelf does not render before the page's own prefs are in.
  const reading = useMemo(() => {
    const map = new Map<string, number>();
    for (const note of notes) map.set(note.id, readProgress(note.id));
    return map;
  }, [notes]);
  const last = useMemo(() => {
    const record = readLastRead();
    const note = record ? notes.find((n) => n.id === record.id) : undefined;
    return record && note ? { note, section: record.section, at: record.at } : null;
  }, [notes]);

  const stats = useMemo(() => {
    let minutes = 0;
    let revisit = 0;
    for (const note of notes) {
      minutes += minutesForNote(note, wordCount(note.markdown), pace);
      revisit += Object.values(note.checks).filter((r) => r === 'miss').length;
    }
    return { minutes, revisit };
  }, [notes, pace]);

  const items = useMemo<Item[]>(() => [
    ...notes.map((note): Item => ({ kind: 'note', id: note.id, title: note.title, at: note.updatedAt, courseId: note.courseId, done: (reading.get(note.id) ?? 0) >= 0.98, note })),
    ...quizzes.map((quiz): Item => ({ kind: 'quiz', id: quiz.id, title: quiz.title, at: quizTouched(quiz), courseId: quiz.courseId, done: quizDone(quiz), quiz })),
  ], [notes, quizzes, reading]);

  const filters = useMemo(() => {
    const used = new Set(items.map((n) => n.courseId).filter((id): id is string => !!id && courseOf.has(id)));
    const list = courses.filter((c) => used.has(c.id));
    const unfiled = items.some((n) => !n.courseId || !courseOf.has(n.courseId));
    return { list, unfiled };
  }, [items, courses, courseOf]);

  const q = query.trim();
  const matched = useMemo(() => {
    const needle = q.toLowerCase();
    const has = (text: string) => text.toLowerCase().includes(needle);
    const list = items.filter((item) => {
      if (kind === 'notes' && item.kind !== 'note') return false;
      if (kind === 'quizzes' && item.kind !== 'quiz') return false;
      if (filter === 'none' && item.courseId && courseOf.has(item.courseId)) return false;
      if (filter !== 'all' && filter !== 'none' && item.courseId !== filter) return false;
      if (!needle) return true;
      if (has(item.title)) return true;
      return item.kind === 'note'
        ? has(item.note.markdown)
        : has(item.quiz.context) || item.quiz.questions.some((question) => has(question.prompt));
    });
    return list.sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : b.at - a.at));
  }, [items, q, kind, filter, sort, courseOf]);

  const open = useMemo(() => matched.filter((item) => !item.done), [matched]);
  const done = useMemo(() => matched.filter((item) => item.done), [matched]);
  // A search looks through the finished ones too, so they open for it.
  const doneShown = doneOpen || !!q;
  const shown = useMemo(() => (doneShown ? [...open, ...done] : open), [open, done, doneShown]);

  const groups = useMemo(() => {
    if (sort !== 'recent' || q) return [{ label: '', items: open }];
    const cut = Date.now() - WEEK;
    const recent = open.filter((n) => n.at >= cut);
    const earlier = open.filter((n) => n.at < cut);
    if (!recent.length || !earlier.length) return [{ label: '', items: open }];
    return [{ label: 'This week', items: recent }, { label: 'Earlier', items: earlier }];
  }, [open, sort, q]);

  // The cursor walks what is shown; changing what is shown puts it down.
  const shownKey = shown.map((n) => n.id).join(',');
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCursor(-1));
    return () => cancelAnimationFrame(frame);
  }, [shownKey]);

  useEffect(() => {
    if (cursor < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[aria-modal="true"], .notes .sheet-wrap')) return;
      if (isTyping(event.target)) {
        if (event.key === 'Escape' && event.target === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        } else if (event.key === 'ArrowDown' && event.target === searchRef.current && shown.length) {
          event.preventDefault();
          searchRef.current?.blur();
          setCursor(0);
        }
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor((c) => Math.min(shown.length - 1, c + 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (event.key === 'Enter' && cursor >= 0 && shown[cursor]) {
        event.preventDefault();
        const item = shown[cursor];
        if (item.kind === 'quiz') router.push(quizHref(item.id));
        else onOpen(item.id);
      } else if (event.key === 'f') {
        const at = cursor >= 0 ? shown[cursor] : undefined;
        const id = at ? (at.kind === 'note' ? at.id : '') : last?.note.id ?? shown.find((item) => item.kind === 'note')?.id;
        if (id) {
          event.preventDefault();
          onFocus(id);
        }
      } else if (event.key === '/' && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, cursor, last, onOpen, onFocus, router]);

  const indexOf = new Map(shown.map((n, i) => [n.id, i]));
  const searchable = items.length > 3;
  const quizLine = quizStatus(quizzes);

  const row = (item: Item) => {
    const i = indexOf.get(item.id) ?? -1;
    const course = item.courseId ? courseOf.get(item.courseId) : undefined;
    if (item.kind === 'quiz') {
      return (
        <li key={`q-${item.id}`}>
          <QuizRow quiz={item.quiz} course={course} task={item.quiz.taskId ? taskOf.get(item.quiz.taskId) : undefined} index={i} cursor={i === cursor} onDelete={onDeleteQuiz} />
        </li>
      );
    }
    const note = item.note;
    const minutes = minutesOf(note);
    const read = reading.get(note.id) ?? 0;
    const total = countChecks(note.markdown);
    const text = plain(note.markdown);
    const parts = [course?.code, relativeLabel(note.updatedAt), note.source === 'mcp' ? 'from your assistant' : ''].filter(Boolean).join(' · ');
    return (
      <li key={note.id}>
        <div
          className="shelf-row"
          role="link"
          tabIndex={0}
          data-index={i}
          data-cursor={i === cursor || undefined}
          onClick={() => onOpen(note.id)}
          onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget) onOpen(note.id); }}
          style={{ ['--c' as string]: course?.color ?? noteColor(note.id) }}
        >
          <span className="stripe" aria-hidden />
          <span className="body">
            <span className="title">{note.title}</span>
            <span className="sub">
              {parts}
              {text && <span className="gist"> · {q ? <Snippet text={text} query={q} /> : text.slice(0, 140)}</span>}
            </span>
          </span>
          {total > 0 && (
            <span className="mini" aria-label={`${Object.values(note.checks).filter((r) => r === 'got').length} of ${total} checks got`}>
              {Array.from({ length: total }, (_, k) => <span key={k} data-r={note.checks[String(k)] ?? ''} />)}
            </span>
          )}
          <span className="mins" title={note.reads.length ? `About ${minutes} min, from ${note.reads.length === 1 ? 'the one timed read' : `the ${note.reads.length} timed reads`}` : read >= 0.98 ? 'Read through' : read > 0.03 ? `${minutes} min in all` : undefined}>
            {read >= 0.98 ? <span className="read-through"><HandCheck size={14} /></span>
              : read > 0.03 ? <>{Math.max(1, Math.round(minutes * (1 - read)))}m <em>left</em></>
                : <>{minutes}m</>}
          </span>
          <span className="row-tools">
            <button
              type="button"
              className="row-tool"
              aria-label={`Read ${note.title} in focus`}
              title="Read in focus (F)"
              onClick={(event) => { event.stopPropagation(); onFocus(note.id); }}
            >
              <Icon name="focus" size={15} />
            </button>
            <button
              type="button"
              className="row-tool del"
              aria-label={`Delete ${note.title}`}
              title="Delete"
              onClick={(event) => { event.stopPropagation(); onDelete(note.id); }}
            >
              <Icon name="trash" size={15} />
            </button>
          </span>
        </div>
      </li>
    );
  };

  return (
    <>
      <header className="page-head">
        <div>
          <p className="standfirst">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} · {hoursLabel(stats.minutes)} of reading{pace.personal ? ' at your pace' : ''}
            {stats.revisit > 0 && <> · {stats.revisit} {stats.revisit === 1 ? 'check' : 'checks'} to revisit</>}
            {quizzes.length > 0 && <> · {quizzes.length} {quizzes.length === 1 ? 'quiz' : 'quizzes'}{quizLine && <>, {quizLine}</>}</>}
          </p>
          <h1 className="screen-title">Study</h1>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onPrompt} title="A prompt for your AI">
            <Icon name="copy" size={16} />Prompt for an AI
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenFile} title="Open a file (O)">
            <Icon name="upload" size={16} />Open
          </button>
          <button type="button" className="btn btn-primary" onClick={onNew} title="New note (N)">
            <Icon name="plus" size={16} />New note
          </button>
        </div>
      </header>

      {last && <LeadBand pace={pace} note={last.note} section={last.section} at={last.at} progress={reading.get(last.note.id) ?? 0} course={last.note.courseId ? courseOf.get(last.note.courseId) : undefined} onOpen={onOpen} onFocus={onFocus} />}

      <div className="fold" />

      <div className="shelf-tools">
        {quizzes.length > 0 && (
          <div className="marks kinds" role="group" aria-label="Show">
            <button type="button" className="mark" aria-pressed={kind === 'all'} onClick={() => setKind('all')}><span>Everything</span></button>
            <button type="button" className="mark" aria-pressed={kind === 'notes'} onClick={() => setKind(kind === 'notes' ? 'all' : 'notes')}><span>Notes</span></button>
            <button type="button" className="mark" aria-pressed={kind === 'quizzes'} onClick={() => setKind(kind === 'quizzes' ? 'all' : 'quizzes')}><span>Quizzes</span></button>
          </div>
        )}
        {(filters.list.length > 0) && (
          <div className="marks" role="group" aria-label="Course">
            <button type="button" className="mark" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}><span>All</span></button>
            {filters.list.map((c) => (
              <button
                key={c.id}
                type="button"
                className="mark"
                aria-pressed={filter === c.id}
                onClick={() => setFilter(filter === c.id ? 'all' : c.id)}
                style={{ ['--hl' as string]: resolveTint(c.color, c.tint), ['--c' as string]: c.color }}
              >
                <span className="course-rule" aria-hidden />
                <span>{c.code}</span>
              </button>
            ))}
            {filters.unfiled && (
              <button type="button" className="mark" aria-pressed={filter === 'none'} onClick={() => setFilter(filter === 'none' ? 'all' : 'none')}><span>Unfiled</span></button>
            )}
          </div>
        )}
        <div className="shelf-tools-end">
          <div className="marks" role="group" aria-label="Order">
            <button type="button" className="mark" aria-pressed={sort === 'recent'} onClick={() => setSort('recent')}><span>Recent</span></button>
            <button type="button" className="mark" aria-pressed={sort === 'title'} onClick={() => setSort('title')}><span>A–Z</span></button>
          </div>
          {searchable && (
            <label className="search">
              <Icon name="search" size={14} />
              <span className="sr-only">{quizzes.length ? 'Search notes and quizzes' : 'Search notes'}</span>
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={quizzes.length ? 'Search everything' : 'Search every note'} />
              {!query && <span className="kbd search-kbd" aria-hidden>/</span>}
            </label>
          )}
        </div>
      </div>

      {open.length === 0 && done.length > 0 && !q && (
        <p className="standfirst" style={{ marginTop: 20 }}>All read and taken. The finished ones are under Done.</p>
      )}
      <ul className="shelf" ref={listRef}>
        {groups.map((group) => (
          <Fragment key={group.label || 'all'}>
            {group.label && <li className="shelf-group"><span className="eyebrow">{group.label}</span></li>}
            {group.items.map(row)}
          </Fragment>
        ))}
        {done.length > 0 && (
          <li className="shelf-group shelf-done">
            {q ? <span className="eyebrow">Done</span> : (
              <button type="button" className="done-fold" aria-expanded={doneShown} onClick={() => setDoneOpen((o) => !o)}>
                <span className="eyebrow">Done</span>
                <span className="n">{done.length}</span>
                <Icon name={doneShown ? 'fold' : 'unfold'} size={13} />
              </button>
            )}
          </li>
        )}
        {doneShown && done.map(row)}
      </ul>
      {matched.length === 0 ? (
        <p className="standfirst" style={{ marginTop: 20 }}>
          {q ? 'Nothing mentions that.' : 'Nothing filed here yet.'}
        </p>
      ) : null}

      {quizzesLoaded && quizzesAvailable && quizzes.length === 0 && (
        <p className="quiz-hint"><span className="eyebrow">Quizzes</span> <NoQuizzesYet /></p>
      )}

      <PaceLine pace={pace} />

      <div className="keys keys-foot" aria-label="Keyboard shortcuts">
        <span><span className="kbd">↑</span><span className="kbd">↓</span> move</span>
        <span><span className="kbd">Enter</span> read</span>
        <span><span className="kbd">F</span> focus</span>
        {searchable && <span><span className="kbd">/</span> search</span>}
        <span><span className="kbd">N</span> new</span>
        <span><span className="kbd">O</span> open a file</span>
      </div>
    </>
  );
}

/**
 * The note last read, set across the page. Its sections are drawn as strokes,
 * the ones behind the reader inked in the course colour, the way HourStrokes
 * draws a week: "four of seven" is where you are in a note, a bar would only
 * say how much.
 */
function LeadBand({ pace, note, section, at, progress, course, onOpen, onFocus }: {
  pace: ReadingPace;
  note: ShelfEntry;
  section: string;
  at: number;
  progress: number;
  course?: Course;
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const sections = useMemo(() => getMarkdownHeadings(note.markdown).filter((h) => h.level === 2), [note.markdown]);
  const at2 = sections.findIndex((s) => s.text === section);
  const minutes = minutesForNote(note, wordCount(note.markdown), pace);
  const left = Math.max(0, Math.round(minutes * (1 - progress)));
  const finished = progress >= 0.98;
  const excerpt = useMemo(() => {
    // The opening lines of the section they were in, so the band says
    // what they were reading and not only its name.
    const lines = note.markdown.split(/\r?\n/);
    const start = section ? lines.findIndex((l) => /^#{2}\s+/.test(l) && l.replace(/^#{2}\s+/, '').replace(/[*_`~]/g, '').trim() === section) : -1;
    const tail = start >= 0 ? lines.slice(start + 1) : lines;
    const end = start >= 0 ? tail.findIndex((l) => /^#{2}\s+/.test(l)) : -1;
    return plain((end >= 0 ? tail.slice(0, end) : tail).join('\n')).slice(0, 220);
  }, [note.markdown, section]);
  const total = countChecks(note.markdown);
  const missed = Object.values(note.checks).filter((r) => r === 'miss').length;

  return (
    <section className="lead" style={{ ['--c' as string]: course?.color ?? noteColor(note.id) }} aria-label="Where you left off">
      <div className="lead-main">
        <span className="eyebrow">{finished ? 'Last read' : 'Where you left off'}</span>
        <button type="button" className="lead-title" onClick={() => onOpen(note.id)}>{note.title}</button>
        <p className="lead-meta">
          {course && (
            <span className="lead-course">
              <span className="course-rule" />
              <span className="eyebrow">{course.code}</span>
            </span>
          )}
          {section && !finished ? <>in <em>{section}</em> · </> : null}
          {relativeLabel(at).toLowerCase()}
        </p>
        {excerpt && <p className="lead-excerpt">{excerpt}{excerpt.length >= 220 ? '…' : ''}</p>}
        <div className="lead-actions">
          <button type="button" className="btn btn-primary" onClick={() => onOpen(note.id)}>
            <Icon name="read" size={16} />{finished ? 'Read again' : 'Keep reading'}
          </button>
          <button type="button" className="btn" onClick={() => onFocus(note.id)} title="Read in focus (F)">
            <Icon name="focus" size={16} />Focus
          </button>
        </div>
      </div>
      <div className="lead-side">
        <HandNote size={21} rotate={-3}>{finished ? 'read through' : left < 1 ? 'nearly there' : `~ ${left} min left`}</HandNote>
        {sections.length > 1 && (
          <div className="lead-strokes">
            <div className="strokes" aria-hidden>
              {sections.map((s, i) => (
                <span key={s.id} data-state={finished || i < at2 ? 'past' : i === at2 ? 'on' : undefined} />
              ))}
            </div>
            <p className="strokes-label">
              {finished ? <>all <b>{sections.length}</b> sections</> : <>section <b>{Math.max(1, at2 + 1)}</b> of <b>{sections.length}</b></>}
            </p>
          </div>
        )}
        {total > 0 && (
          <p className="strokes-label">
            {missed > 0 ? <><b>{missed}</b> {missed === 1 ? 'check' : 'checks'} to revisit</> : <><b>{total}</b> {total === 1 ? 'check' : 'checks'} inside</>}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * What the timed reads have taught, said back in a line. Before any read has
 * been timed it says how that happens, once, since otherwise the minutes on
 * every row are a guess nobody knows how to improve.
 */
function PaceLine({ pace }: { pace: ReadingPace }) {
  if (!pace.timed) {
    return (
      <p className="pace-line">
        minutes assume 200 words a minute until you time a read from the top, on a task’s clock
      </p>
    );
  }
  return (
    <div className="pace-line pace-known">
      <span className="eyebrow">Your reading</span>
      <p>
        {pace.personal ? <>about <b>{Math.round(pace.wpm)}</b> words a minute · </> : null}
        a read-through takes you <b>{Math.max(1, Math.round(pace.medianMinutes))}</b> min · <b>{pace.timed}</b> timed across <b>{pace.notesTimed}</b> {pace.notesTimed === 1 ? 'note' : 'notes'}
        {!pace.personal && <> · one more and the minutes here are yours</>}
      </p>
    </div>
  );
}
