'use client';

import { ChangeEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageShell from '@/components/PageShell';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import { MarkdownReader, countChecks, getMarkdownHeadings, openHeadingSection } from '@/components/notes/MarkdownReader';
import Editor from '@/components/notes/Editor';
import Sheet from '@/components/notes/Sheet';
import PromptSheet from '@/components/notes/PromptSheet';
import Icon from '@/components/notes/Icon';
import { CheckStrokes, MinutesLeft, TocList } from '@/components/notes/Contents';
import FocusMode from '@/components/notes/FocusMode';
import StudyThis from '@/components/notes/StudyThis';
import Shelf from '@/components/notes/Shelf';
import QuizShelf from '@/components/notes/QuizShelf';
import ConfirmSheet from '@/components/ConfirmSheet';
import {
  DOCS_KEY, READER_KEY, checksKey, dateLabel, downloadNote, draftKey, loadChecks, loadNotes,
  readProgress, readSection, readStore, rememberReading, removeStore, sampleNote, scrollKey, titleFromMarkdown, unwrapFence, wordCount,
  writeStore, type CheckResult, type Note,
} from '@/lib/notes/store';
import { useCourses, useNotes, saveNote, deleteNoteOptimistic, deleteQuizOptimistic, setNoteChecksOptimistic, addNoteReadOptimistic } from '@/lib/data-hooks';
import type { NoteRead, NoteSource, StudyNote } from '@/lib/data';
import { minutesForNote, readingPace } from '@/lib/notes/reads';
import { useReadThrough } from '@/lib/notes/use-read-through';

/** The page's view of a stored note: times as numbers, the way it compares them. */
type ShelfNote = Note & { courseId: string | null; checks: Record<string, CheckResult>; source: NoteSource; taskId: string | null; reads: NoteRead[]; stored: StudyNote };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Slip = { id: number; text: string; action?: { label: string; run: () => void } };
type Reader = { size: 'small' | 'medium' | 'large'; measure: 'narrow' | 'wide' };

const SIZES: { v: Reader['size']; l: string }[] = [
  { v: 'small', l: 'Small' },
  { v: 'medium', l: 'Default' },
  { v: 'large', l: 'Large' },
];
const MEASURES: { v: Reader['measure']; l: string }[] = [
  { v: 'narrow', l: 'Narrow' },
  { v: 'wide', l: 'Wide' },
];

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
const looksLikeMarkdownFile = (file: File) => /\.(md|markdown|mdown|txt)$/i.test(file.name) || /^text\//.test(file.type);

function readReader(): Reader {
  try {
    const raw = JSON.parse(readStore(READER_KEY) || '{}');
    return {
      size: SIZES.some((s) => s.v === raw.size) ? raw.size : 'medium',
      measure: MEASURES.some((m) => m.v === raw.measure) ? raw.measure : 'narrow',
    };
  } catch {
    return { size: 'medium', measure: 'narrow' };
  }
}

export default function NotesPage() {
  return (
    <Suspense fallback={<PageShell wide>{null}</PageShell>}>
      <NotesContent />
    </Suspense>
  );
}

function NotesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get('n') ?? '';
  const editing = params.get('edit') === '1';
  const writingNew = params.get('new') === '1';
  const focusParam = params.get('focus') === '1';
  // Focus opened from outside the page (a task's sheet) picks up where the
  // note was left, the way the shelf's Focus does.
  const fromSaved = params.get('from') === 'saved';

  const { notes: stored, loaded, available } = useNotes();
  const { courses } = useCourses();
  const notes: ShelfNote[] = useMemo(
    () => stored.map((n) => ({
      id: n.id,
      title: n.title,
      markdown: n.markdown,
      updatedAt: Date.parse(n.updatedAt) || Date.now(),
      createdAt: Date.parse(n.createdAt) || Date.now(),
      courseId: n.courseId,
      checks: n.checks,
      source: n.source,
      taskId: n.taskId,
      reads: n.reads,
      stored: n,
    })),
    [stored],
  );
  const [prefsReady, setPrefsReady] = useState(false);
  const ready = prefsReady && loaded;
  const [draft, setDraft] = useState('');
  const [reader, setReader] = useState<Reader>({ size: 'medium', measure: 'narrow' });
  const [readerOpen, setReaderOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeHeading, setActiveHeading] = useState('');
  const [progress, setProgress] = useState(0);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);
  const originalDraft = useRef('');

  const say = useCallback((text: string, action?: Slip['action']) => setSlip({ id: Date.now(), text, action }), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setReader(readReader());
      setPrefsReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Notes written before they lived in the account were kept in this
  // browser. Carry them up once, results and all, then forget the local copy.
  const movedRef = useRef(false);
  useEffect(() => {
    if (!loaded || !available || movedRef.current) return;
    const local = loadNotes();
    if (!local.length) return;
    movedRef.current = true;
    (async () => {
      let moved = 0;
      for (const note of local) {
        try {
          await saveNote({
            id: UUID.test(note.id) ? note.id : undefined,
            title: note.title,
            markdown: note.markdown,
            checks: loadChecks(note.id),
            createdAt: new Date(note.createdAt ?? note.updatedAt).toISOString(),
            source: 'import',
          });
          removeStore(checksKey(note.id));
          moved++;
        } catch {
          /* Left in the browser; the next visit tries again. */
          return;
        }
      }
      removeStore(DOCS_KEY);
      if (moved) say(`Moved ${moved} ${moved === 1 ? 'note' : 'notes'} from this browser into your account.`);
    })();
  }, [loaded, available, say]);

  const mode: 'library' | 'read' | 'edit' = writingNew || editing ? 'edit' : openId ? 'read' : 'library';
  const active = notes.find((n) => n.id === openId);
  const focusing = mode === 'read' && focusParam && !!active;
  const checks = useMemo(() => active?.checks ?? {}, [active]);
  const activeCourse = active?.courseId ? courses.find((c) => c.id === active.courseId) : undefined;

  const go = useCallback((search: string) => {
    router.push(search ? `/notes?${search}` : '/notes');
  }, [router]);

  /* ── Reading ──────────────────────────────────────────────────────── */
  const markdown = active?.markdown ?? '';
  const headings = useMemo(() => getMarkdownHeadings(markdown), [markdown]);
  const words = useMemo(() => wordCount(markdown), [markdown]);
  const totalChecks = useMemo(() => countChecks(markdown), [markdown]);
  const hasOwnTitle = /^\s*#\s+/.test(markdown);
  const pace = useMemo(() => readingPace(stored), [stored]);
  const minutes = active ? minutesForNote(active, words, pace) : 1;
  const minutesLeft = Math.round(minutes * (1 - progress));
  const index = notes.findIndex((n) => n.id === openId);
  const nextNote = index >= 0 && notes.length > 1 ? notes[(index + 1) % notes.length] : undefined;
  const sectionIds = headings.filter((h) => h.level === 2).map((h) => h.id);
  const allFolded = sectionIds.length > 0 && sectionIds.every((id) => collapsed.has(id));

  useEffect(() => {
    if (!openId) return;
    const frame = requestAnimationFrame(() => setCollapsed(new Set()));
    return () => cancelAnimationFrame(frame);
  }, [openId]);

  // Back where the reader left the note. Coming out of focus, that is the
  // section focus was on, since the two pages are laid out differently and
  // a pixel offset from one lands somewhere else on the other.
  const returnHeading = useRef('');
  const [focusStart, setFocusStart] = useState('');
  // The note whose place has been put back. Until then the page sits at the
  // top for a frame, which must not read as a read from the top.
  const [placedId, setPlacedId] = useState('');
  useEffect(() => {
    if (!ready || mode !== 'read' || !openId || focusing) return;
    const heading = returnHeading.current;
    returnHeading.current = '';
    const y = Number(readStore(scrollKey(openId)) || 0);
    const saved = readProgress(openId);
    const timer = window.setTimeout(() => {
      const el = heading ? document.getElementById(heading) : null;
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 32, behavior: 'instant' });
      else window.scrollTo({ top: Number.isFinite(y) ? y : 0, behavior: 'instant' });
      setPlacedId(openId);
      // Opening a note partway through says where it picked up, and offers
      // the top: a read from the top is the one that gets timed.
      if (!el && y > 40 && saved > 0.03 && saved < 0.98) {
        const section = readSection(openId);
        say(section ? `Picked up in “${section}”.` : 'Picked up where you left off.', {
          label: 'Start from the top',
          run: () => {
            rememberReading(openId, 0, '');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          },
        });
      }
    }, 60);
    return () => window.clearTimeout(timer);
    // `say` is stable; the place is put back once per note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, mode, ready, focusing]);

  const onRead = useCallback((read: NoteRead) => {
    if (!active) return;
    const mins = Math.max(1, Math.round(read.seconds / 60));
    addNoteReadOptimistic(active.stored, read)
      .then(() => say(`Read through in ${mins} min on the clock. Kept for your pace.`))
      .catch((cause) => say(cause instanceof Error && cause.message ? cause.message : 'That read-through didn’t save.'));
  }, [active, say]);
  const timing = useReadThrough({ note: active, words, progress, enabled: ready && mode === 'read' && !focusing && placedId === openId, onRead });

  useEffect(() => {
    if (mode !== 'read' || focusing) return;
    let frame = 0;
    let timer: number | undefined;
    const measure = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 1);
      let current = headings[0]?.id || '';
      for (const heading of headings) {
        const el = document.getElementById(heading.id);
        if (el && el.getClientRects().length && el.getBoundingClientRect().top <= 120) current = heading.id;
      }
      if (scrollable > 0 && window.scrollY >= scrollable - 4 && headings.length) current = headings[headings.length - 1].id;
      setActiveHeading(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
      if (openId) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          writeStore(scrollKey(openId), String(window.scrollY));
          const scrollable = document.documentElement.scrollHeight - window.innerHeight;
          const section = headings
            .filter((h) => h.level === 2)
            .filter((h) => (document.getElementById(h.id)?.getBoundingClientRect().top ?? Infinity) <= 120)
            .pop();
          rememberReading(openId, scrollable > 0 ? window.scrollY / scrollable : 1, window.scrollY > 40 ? section?.text ?? '' : '');
        }, 200);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [headings, openId, mode, collapsed, focusing]);

  useEffect(() => {
    if (!readerOpen) return;
    const onDown = (event: MouseEvent) => {
      if (readerRef.current && !readerRef.current.contains(event.target as Node)) setReaderOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [readerOpen]);

  const markCheck = useCallback((id: string, result: CheckResult) => {
    if (!openId) return;
    const next = { ...checks };
    if (next[id] === result) delete next[id];
    else next[id] = result;
    setNoteChecksOptimistic(openId, next).catch(() => say('That result didn’t save. Try again in a moment.'));
  }, [openId, checks, say]);

  const toggleSection = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const foldAll = () => setCollapsed(allFolded ? new Set() : new Set(sectionIds));
  const jumpTo = (id: string) => {
    setContentsOpen(false);
    openHeadingSection(id);
    setActiveHeading(id);
  };
  const updateReader = (patch: Partial<Reader>) =>
    setReader((current) => {
      const next = { ...current, ...patch };
      writeStore(READER_KEY, JSON.stringify(next));
      return next;
    });

  /* ── Writing ──────────────────────────────────────────────────────── */
  // Seed the editor whenever the URL puts us in it.
  useEffect(() => {
    if (!ready || mode !== 'edit') return;
    let pending: { target: string; text: string } | null = null;
    try {
      pending = JSON.parse(readStore(draftKey) || 'null');
    } catch {
      pending = null;
    }
    const target = writingNew ? 'new' : openId;
    const base = writingNew ? '' : active?.markdown ?? '';
    originalDraft.current = base;
    const restored = pending && pending.target === target && pending.text.trim() ? pending.text : null;
    const frame = requestAnimationFrame(() => {
      setDraft(restored ?? base);
      if (restored) say('Picked up the draft you left open.');
    });
    return () => cancelAnimationFrame(frame);
    // Only when entering the editor, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, mode, writingNew, openId]);

  useEffect(() => {
    if (!ready || mode !== 'edit') return;
    const timer = window.setTimeout(() => {
      if (draft.trim() && draft !== originalDraft.current)
        writeStore(draftKey, JSON.stringify({ target: writingNew ? 'new' : openId, text: draft }));
      else removeStore(draftKey);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, mode, ready, writingNew, openId]);

  const [saving, setSaving] = useState(false);
  const saveDraft = useCallback(async () => {
    const text = unwrapFence(draft);
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const saved = await saveNote({
        id: writingNew || !active ? undefined : active.id,
        title: titleFromMarkdown(text),
        markdown: text,
        source: writingNew || !active ? 'app' : undefined,
      });
      removeStore(draftKey);
      if (writingNew) writeStore(scrollKey(saved.id), '0');
      router.replace(`/notes?n=${encodeURIComponent(saved.id)}`);
    } catch (cause) {
      say(cause instanceof Error && cause.message ? cause.message : 'The note didn’t save. Your draft is still here.');
    } finally {
      setSaving(false);
    }
  }, [active, draft, writingNew, router, saving, say]);

  const cancelEdit = useCallback(() => {
    const kept = draft;
    const wasNew = writingNew;
    const from = openId;
    removeStore(draftKey);
    router.replace(from && !wasNew ? `/notes?n=${encodeURIComponent(from)}` : '/notes');
    if (kept.trim() && kept !== originalDraft.current) {
      say('Changes set aside.', {
        label: 'Bring back',
        run: () => {
          writeStore(draftKey, JSON.stringify({ target: wasNew ? 'new' : from, text: kept }));
          router.push(wasNew ? '/notes?new=1' : `/notes?n=${encodeURIComponent(from)}&edit=1`);
        },
      });
    }
  }, [draft, writingNew, openId, router, say]);

  /* ── Shelf ────────────────────────────────────────────────────────── */
  const addNotes = useCallback(async (incoming: { title: string; markdown: string }[], message?: string, source: NoteSource = 'import') => {
    if (!incoming.length) return;
    const saved: StudyNote[] = [];
    try {
      for (const note of incoming) saved.push(await saveNote({ title: note.title, markdown: note.markdown, source }));
    } catch (cause) {
      say(cause instanceof Error && cause.message ? cause.message : 'That didn’t save. Try again in a moment.');
    }
    if (!saved.length) return;
    go(`n=${encodeURIComponent(saved[0].id)}`);
    say(message ?? (saved.length === 1 ? `Opened “${saved[0].title}”.` : `Opened ${saved.length} notes.`));
  }, [go, say]);

  const importFiles = useCallback(async (files: File[]) => {
    const usable = files.filter(looksLikeMarkdownFile);
    if (!usable.length) {
      if (files.length) say('That doesn’t look like a markdown file.');
      return;
    }
    const read = await Promise.all(usable.map(async (file) => {
      try {
        const text = unwrapFence(await file.text());
        const title = /^#\s+/m.test(text) ? titleFromMarkdown(text) : file.name.replace(/\.[^.]+$/, '');
        return { title, markdown: text };
      } catch {
        return null;
      }
    }));
    await addNotes(read.filter((n): n is NonNullable<typeof n> => n !== null));
  }, [addNotes, say]);

  const onFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    await importFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const deleteNote = useCallback((id: string) => {
    const gone = notes.find((n) => n.id === id)?.stored;
    if (!gone) return;
    if (openId === id) router.replace('/notes');
    deleteNoteOptimistic(id).catch(() => say('That note didn’t delete. Try again in a moment.'));
    say(`Deleted “${gone.title}”.`, {
      label: 'Undo',
      run: () => {
        saveNote({
          id: gone.id,
          title: gone.title,
          markdown: gone.markdown,
          courseId: gone.courseId,
          checks: gone.checks,
          source: gone.source,
          createdAt: gone.createdAt,
        }).catch(() => say('It couldn’t be put back.'));
      },
    });
  }, [notes, openId, router, say]);

  const [quizToDelete, setQuizToDelete] = useState<{ id: string; title: string } | null>(null);
  const confirmDeleteQuiz = () => {
    if (!quizToDelete) return;
    const { title } = quizToDelete;
    deleteQuizOptimistic(quizToDelete.id).then(
      () => say(`Deleted “${title}”.`),
      () => say('That quiz didn’t delete. Try again in a moment.'),
    );
    setQuizToDelete(null);
  };
  const quizShelf = <QuizShelf onDelete={(id, title) => setQuizToDelete({ id, title })} />;

  const linkCourse = (courseId: string | null) => {
    if (!active) return;
    saveNote({ id: active.id, title: active.title, markdown: active.markdown, courseId }).catch(() =>
      say('The course didn’t save. Try again in a moment.'),
    );
  };

  const copyMarkdown = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.markdown);
      say('Markdown copied.');
    } catch {
      say('Couldn’t reach the clipboard.');
    }
  };

  /* ── Focus ────────────────────────────────────────────────────────── */
  const [focusResumed, setFocusResumed] = useState('');
  const savedStart = useMemo(() => {
    if (!fromSaved || !active || !ready) return { id: '', text: '' };
    const saved = readProgress(active.id);
    const text = readSection(active.id);
    const heading = text && saved > 0.03 && saved < 0.98
      ? getMarkdownHeadings(active.markdown).find((h) => h.level === 2 && h.text === text)
      : undefined;
    return { id: heading?.id ?? '', text: heading?.text ?? '' };
  }, [fromSaved, active, ready]);
  const enterFocus = useCallback((id: string) => {
    // From the page behind, focus opens on the section being read. From the
    // shelf, on the section the note was left in, and says so.
    if (id === openId && mode === 'read') {
      setFocusStart(window.scrollY > 120 ? activeHeading : '');
      setFocusResumed('');
    } else {
      const note = notes.find((n) => n.id === id);
      const saved = readProgress(id);
      const text = readSection(id);
      const heading = note && text && saved > 0.03 && saved < 0.98
        ? getMarkdownHeadings(note.markdown).find((h) => h.level === 2 && h.text === text)
        : undefined;
      setFocusStart(heading?.id ?? '');
      setFocusResumed(heading?.text ?? '');
    }
    go(`n=${encodeURIComponent(id)}&focus=1`);
  }, [go, openId, mode, activeHeading, notes]);
  const leaveFocus = useCallback((heading: string) => {
    if (!active) return;
    returnHeading.current = heading;
    router.replace(`/notes?n=${encodeURIComponent(active.id)}`);
  }, [active, router]);
  const focusNext = useCallback(() => {
    if (!nextNote) return;
    setFocusStart('');
    setFocusResumed('');
    router.replace(`/notes?n=${encodeURIComponent(nextNote.id)}&focus=1`);
  }, [nextNote, router]);

  /* ── Keys, paste, drop ────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mode === 'edit') {
        if (mod && event.key.toLowerCase() === 's') {
          event.preventDefault();
          saveDraft();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          cancelEdit();
        }
        return;
      }
      if (mod || event.altKey || isTyping(event.target) || contentsOpen || promptOpen || focusing) return;
      if (event.key === 'e' && mode === 'read' && active) { event.preventDefault(); go(`n=${encodeURIComponent(active.id)}&edit=1`); }
      else if (event.key === 'f' && mode === 'read' && active) { event.preventDefault(); enterFocus(active.id); }
      else if (event.key === 'n') { event.preventDefault(); go('new=1'); }
      else if (event.key === 'o') { event.preventDefault(); fileRef.current?.click(); }
      else if (event.key === 'Escape' && mode === 'read') { event.preventDefault(); go(''); }
      else if ((event.key === '[' || event.key === ']') && mode === 'read' && notes.length > 1) {
        const step = event.key === ']' ? 1 : -1;
        const to = notes[(index + step + notes.length) % notes.length];
        if (to) router.replace(`/notes?n=${encodeURIComponent(to.id)}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, active, notes, index, contentsOpen, promptOpen, focusing, saveDraft, cancelEdit, go, router, enterFocus]);

  // Pasting markdown onto the page makes a note of it. This is the other half
  // of the AI prompt: copy the answer, come back, paste.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (mode === 'edit' || focusing || isTyping(event.target)) return;
      const text = unwrapFence(event.clipboardData?.getData('text/plain') ?? '');
      if (text.trim().length < 20) return;
      event.preventDefault();
      setPromptOpen(false);
      void addNotes([{ title: titleFromMarkdown(text), markdown: text }], 'Pasted as a new note.', 'app');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [mode, focusing, addNotes]);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (event: DragEvent) => { if (hasFiles(event)) event.preventDefault(); };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void importFiles(Array.from(event.dataTransfer?.files ?? []));
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [importFiles]);

  useEffect(() => {
    if (!slip) return;
    const timer = window.setTimeout(() => setSlip(null), slip.action ? 6000 : 3600);
    return () => window.clearTimeout(timer);
  }, [slip]);

  useEffect(() => {
    document.title = mode === 'edit' ? 'Writing - Akada' : active ? `${focusing ? 'Focus · ' : ''}${active.title} - Akada` : 'Notes - Akada';
  }, [mode, active, focusing]);

  /* ── Render ───────────────────────────────────────────────────────── */
  const showToc = mode === 'read' && !!active && (headings.length > 0 || totalChecks > 0);
  let body: React.ReactNode = null;

  if (!ready) body = null;
  else if (mode === 'edit') {
    body = (
      <>
        <button type="button" className="back" onClick={cancelEdit}>← {active && !writingNew ? active.title : 'Notes'}</button>
        <Editor
          draft={draft}
          onChange={setDraft}
          isNew={writingNew || !active}
          title={draft.trim() ? titleFromMarkdown(draft) : active?.title ?? 'Untitled'}
          onSave={saveDraft}
          onCancel={cancelEdit}
          onOpenFile={() => fileRef.current?.click()}
        />
      </>
    );
  } else if (mode === 'read' && !active) {
    body = (
      <div className="empty">
        <p className="standfirst">Not on this shelf</p>
        <h1 className="screen-title">That note isn’t here.</h1>
        <p className="lede">Notes are kept in the browser they were written in. It may live on another device.</p>
        <button type="button" className="btn" onClick={() => go('')}>Back to notes</button>
      </div>
    );
  } else if (focusing && active) {
    body = (
      <FocusMode
        key={active.id}
        note={active}
        course={activeCourse}
        checks={checks}
        onMarkCheck={markCheck}
        size={reader.size}
        onSize={(size) => updateReader({ size })}
        measure={reader.measure}
        startAt={focusStart || savedStart.id}
        resumedAt={focusResumed || savedStart.text}
        minutes={minutes}
        courses={courses}
        onSay={say}
        onRead={onRead}
        nextNote={nextNote}
        onNext={focusNext}
        onLeave={leaveFocus}
      />
    );
  } else if (mode === 'read' && active) {
    body = (
      <div className={`reader ${showToc ? 'has-toc' : ''}`} data-measure={reader.measure}>
        <div className="reader-main">
          <button type="button" className="back" onClick={() => go('')}>← Notes</button>
          <header className="page-head">
            <p className="standfirst">
              {activeCourse && (
                <span style={{ fontStyle: 'normal', marginRight: 8 }}>
                  <span className="course-rule" style={{ ['--c' as string]: activeCourse.color, marginRight: 6 }} />
                  <span className="eyebrow" style={{ color: 'var(--ink-soft)' }}>{activeCourse.code}</span>
                </span>
              )}
              {active.source === 'mcp' ? 'From your assistant' : 'Edited'} {dateLabel(active.updatedAt)} · {words.toLocaleString()} words ·{' '}
              {active.reads.length ? `read in ${Math.max(1, Math.round(active.reads[active.reads.length - 1].seconds / 60))} min last time` : pace.personal ? `~${minutes} min at your pace` : `${minutes} min read`}
              {timing && <span className="timing"> · timing this read</span>}
            </p>
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={() => go(`n=${encodeURIComponent(active.id)}&edit=1`)} title="Edit (E)">
                <Icon name="write" size={16} />Edit
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => enterFocus(active.id)} title="Read in focus (F)">
                <Icon name="focus" size={16} />Focus
              </button>
              <StudyThis note={active} courses={courses} onSay={say} />
              {showToc && (
                <button type="button" className="btn btn-ghost btn-icon toc-toggle" onClick={() => setContentsOpen(true)} aria-label="Contents" title="Contents">
                  <Icon name="contents" size={16} />
                </button>
              )}
              {sectionIds.length > 1 && (
                <button type="button" className="btn btn-ghost btn-icon" onClick={foldAll} aria-label={allFolded ? 'Open every section' : 'Fold every section'} title={allFolded ? 'Open every section' : 'Fold every section'}>
                  <Icon name={allFolded ? 'unfold' : 'fold'} size={16} />
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-icon" onClick={copyMarkdown} aria-label="Copy markdown" title="Copy markdown">
                <Icon name="copy" size={16} />
              </button>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => downloadNote(active)} aria-label="Download .md" title="Download .md">
                <Icon name="download" size={16} />
              </button>
              <div ref={readerRef} style={{ position: 'relative' }}>
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => setReaderOpen((o) => !o)} aria-expanded={readerOpen} aria-label="Text settings" title="Text settings">
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15 }}>Aa</span>
                </button>
                {readerOpen && (
                  <div className="popover" role="dialog" aria-label="Text settings">
                    <div className="set-group">
                      <span className="eyebrow">Text</span>
                      <div className="choice-row">
                        {SIZES.map((s) => (
                          <button key={s.v} type="button" className="choice" aria-pressed={reader.size === s.v} onClick={() => updateReader({ size: s.v })}><span>{s.l}</span></button>
                        ))}
                      </div>
                    </div>
                    <div className="set-group">
                      <span className="eyebrow">Column</span>
                      <div className="choice-row">
                        {MEASURES.map((m) => (
                          <button key={m.v} type="button" className="choice" aria-pressed={reader.measure === m.v} onClick={() => updateReader({ measure: m.v })}><span>{m.l}</span></button>
                        ))}
                      </div>
                    </div>
                    {courses.length > 0 && (
                      <div className="set-group">
                        <span className="eyebrow">Course</span>
                        <div className="choice-row">
                          <button type="button" className="choice" aria-pressed={!active.courseId} onClick={() => linkCourse(null)}><span>None</span></button>
                          {courses.map((c) => (
                            <button key={c.id} type="button" className="choice" aria-pressed={active.courseId === c.id} onClick={() => linkCourse(c.id)}><span>{c.code}</span></button>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="set-note">Paper and heading font follow Appearance in Settings.</p>
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => deleteNote(active.id)} aria-label="Delete note" title="Delete note">
                <Icon name="trash" size={16} />
              </button>
            </div>
          </header>
          {!hasOwnTitle && <h1 className="screen-title" style={{ marginBottom: 28 }}>{active.title}</h1>}
          <div className={`reading-size-${reader.size}`}>
            <MarkdownReader
              key={active.id}
              markdown={active.markdown}
              collapsedSections={collapsed}
              onToggleSection={toggleSection}
              checks={checks}
              onMarkCheck={markCheck}
            />
          </div>
          <footer className="note-end">
            <HandCheck size={22} />
            <HandNote size={20} rotate={-2}>that’s the lot</HandNote>
            {nextNote && nextNote.id !== active.id && (
              <p className="next">
                Next on the pile:{' '}
                <button type="button" className="btn btn-ghost" style={{ height: 32, fontStyle: 'normal' }} onClick={() => router.replace(`/notes?n=${encodeURIComponent(nextNote.id)}`)}>
                  {nextNote.title} →
                </button>
              </p>
            )}
          </footer>
        </div>
        {showToc && (
          <aside className="toc-col" aria-label="On this page">
            <div className="toc-sticky">
              {headings.length > 0 && (
                <div className="toc-block">
                  <span className="eyebrow">On this page</span>
                  <TocList headings={headings} activeId={activeHeading} onJump={jumpTo} />
                  <MinutesLeft minutes={minutesLeft} progress={progress} />
                </div>
              )}
              {totalChecks > 0 && (
                <div className="toc-block">
                  <CheckStrokes total={totalChecks} checks={checks} />
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    );
  } else if (notes.length === 0) {
    body = (
      <div className="empty">
        <p className="standfirst">Nothing on the shelf yet</p>
        <h1 className="screen-title">Notes</h1>
        <p className="lede">
          A quiet place to read what you’re studying. Open a <span className="hl-swipe">.md</span> file, drop one anywhere on the page, or have your AI write one.
        </p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => go('new=1')}><Icon name="write" size={16} />New note</button>
          <button type="button" className="btn btn-dashed" onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} />Open .md</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPromptOpen(true)}><Icon name="copy" size={16} />AI prompt</button>
        </div>
        <div style={{ marginTop: 18 }}>
          <button type="button" className="link" onClick={() => void addNotes([sampleNote()], 'Here’s a sample to read.', 'app')}>or read a sample note first</button>
        </div>
        <div className="keys" aria-label="Keyboard shortcuts">
          <div><span className="kbd">N</span> new note</div>
          <div><span className="kbd">O</span> open a file</div>
          <div><span className="kbd">Ctrl V</span> paste markdown as a note</div>
        </div>
        {quizShelf}
      </div>
    );
  } else {
    body = (
      <Shelf
        notes={notes}
        courses={courses}
        onOpen={(id) => go(`n=${encodeURIComponent(id)}`)}
        onFocus={enterFocus}
        onDelete={deleteNote}
        onNew={() => go('new=1')}
        onOpenFile={() => fileRef.current?.click()}
        onPrompt={() => setPromptOpen(true)}
        quizzes={quizShelf}
      />
    );
  }

  return (
    <PageShell wide>
      <div className="notes">
        {loaded && !available && (
          <p className="standfirst" role="status" style={{ marginBottom: 16, color: 'var(--warn)' }}>
            Notes aren’t set up in the database yet. Run the latest supabase/schema.sql once and they’ll save to your account.
          </p>
        )}
        <input ref={fileRef} type="file" accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain" multiple hidden onChange={onFileInput} />
        {body}

        {contentsOpen && (
          <Sheet title="On this page" onClose={() => setContentsOpen(false)}>
            <TocList headings={headings} activeId={activeHeading} onJump={jumpTo} />
            {sectionIds.length > 1 && (
              <div className="toc-tools">
                <button type="button" onClick={foldAll}>{allFolded ? 'Open every section' : 'Fold every section'}</button>
              </div>
            )}
            <MinutesLeft minutes={minutesLeft} progress={progress} />
            {totalChecks > 0 && (
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line-soft)' }}>
                <CheckStrokes total={totalChecks} checks={checks} />
              </div>
            )}
          </Sheet>
        )}
        <ConfirmSheet
          open={!!quizToDelete}
          title="Delete this quiz?"
          body={quizToDelete ? `“${quizToDelete.title}” and every mark on it go for good.` : undefined}
          confirmLabel="Delete"
          onConfirm={confirmDeleteQuiz}
          onCancel={() => setQuizToDelete(null)}
        />
        {promptOpen && (
          <PromptSheet
            onClose={() => setPromptOpen(false)}
            onPasteAnswer={() => { setPromptOpen(false); go('new=1'); }}
          />
        )}
        {slip && (
          <div className="slip-wrap" role="status" aria-live="polite">
            <div className="slip" key={slip.id}>
              <span>{slip.text}</span>
              {slip.action && (
                <button type="button" onClick={() => { slip.action?.run(); setSlip(null); }}>{slip.action.label}</button>
              )}
            </div>
          </div>
        )}
        {dragging && (
          <div className="drop-veil" aria-hidden>
            <div>
              <Icon name="upload" size={22} />
              <strong>Drop to open</strong>
              <span className="standfirst" style={{ margin: 0 }}>.md, .markdown or .txt</span>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
