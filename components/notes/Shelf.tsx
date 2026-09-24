'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import Icon from './Icon';
import { countChecks, getMarkdownHeadings } from './MarkdownReader';
import { noteColor, readLastRead, readProgress, relativeLabel, wordCount, type CheckResult } from '@/lib/notes/store';
import { minutesForNote, readingPace, type ReadingPace } from '@/lib/notes/reads';
import type { NoteRead } from '@/lib/data';
import { resolveTint } from '@/lib/utils';
import type { Course } from '@/lib/data';

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
}

/**
 * The shelf. The note last read leads the page, the way Up next leads Today,
 * and the rest are rows written under the fold, sorted and filtered with
 * highlighter rather than tabs.
 */
export default function Shelf({ notes, courses, onOpen, onFocus, onDelete, onNew, onOpenFile, onPrompt }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const courseOf = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
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

  const filters = useMemo(() => {
    const used = new Set(notes.map((n) => n.courseId).filter((id): id is string => !!id && courseOf.has(id)));
    const list = courses.filter((c) => used.has(c.id));
    const unfiled = notes.some((n) => !n.courseId || !courseOf.has(n.courseId));
    return { list, unfiled };
  }, [notes, courses, courseOf]);

  const q = query.trim();
  const shown = useMemo(() => {
    const needle = q.toLowerCase();
    let list = notes.filter((n) => {
      if (filter === 'none' && n.courseId && courseOf.has(n.courseId)) return false;
      if (filter !== 'all' && filter !== 'none' && n.courseId !== filter) return false;
      return !needle || n.title.toLowerCase().includes(needle) || n.markdown.toLowerCase().includes(needle);
    });
    list = [...list].sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : b.updatedAt - a.updatedAt));
    return list;
  }, [notes, q, filter, sort, courseOf]);

  const groups = useMemo(() => {
    if (sort !== 'recent' || q) return [{ label: '', notes: shown }];
    const cut = Date.now() - WEEK;
    const recent = shown.filter((n) => n.updatedAt >= cut);
    const earlier = shown.filter((n) => n.updatedAt < cut);
    if (!recent.length || !earlier.length) return [{ label: '', notes: shown }];
    return [{ label: 'This week', notes: recent }, { label: 'Earlier', notes: earlier }];
  }, [shown, sort, q]);

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
        onOpen(shown[cursor].id);
      } else if (event.key === 'f') {
        const target = cursor >= 0 ? shown[cursor] : last?.note ?? shown[0];
        if (target) {
          event.preventDefault();
          onFocus(target.id);
        }
      } else if (event.key === '/' && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, cursor, last, onOpen, onFocus]);

  const indexOf = new Map(shown.map((n, i) => [n.id, i]));
  const searchable = notes.length > 3;

  return (
    <>
      <header className="page-head">
        <div>
          <p className="standfirst">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'} · {hoursLabel(stats.minutes)} of reading{pace.personal ? ' at your pace' : ''}
            {stats.revisit > 0 && <> · {stats.revisit} {stats.revisit === 1 ? 'check' : 'checks'} to revisit</>}
          </p>
          <h1 className="screen-title">Notes</h1>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onPrompt} title="A prompt for your AI">
            <Icon name="copy" size={16} />AI prompt
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenFile} title="Open .md (O)">
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
        {(filters.list.length > 0) && (
          <div className="marks" role="group" aria-label="Show">
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
              <span className="sr-only">Search notes</span>
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every note" />
              {!query && <span className="kbd search-kbd" aria-hidden>/</span>}
            </label>
          )}
        </div>
      </div>

      <ul className="shelf" ref={listRef}>
        {groups.map((group) => (
          <Fragment key={group.label || 'all'}>
            {group.label && <li className="shelf-group"><span className="eyebrow">{group.label}</span></li>}
            {group.notes.map((note) => {
              const i = indexOf.get(note.id) ?? -1;
              const course = note.courseId ? courseOf.get(note.courseId) : undefined;
              const minutes = minutesOf(note);
              const done = reading.get(note.id) ?? 0;
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
                    <span className="mins" title={note.reads.length ? `Read through in ${minutes} min last time, on the clock` : done >= 0.98 ? 'Read through' : done > 0.03 ? `${minutes} min in all` : undefined}>
                      {done >= 0.98 ? <span className="read-through"><HandCheck size={14} /></span>
                        : done > 0.03 ? <>{Math.max(1, Math.round(minutes * (1 - done)))}m <em>left</em></>
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
            })}
          </Fragment>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="standfirst" style={{ marginTop: 20 }}>
          {q ? 'No note mentions that.' : 'Nothing filed here yet.'}
        </p>
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
