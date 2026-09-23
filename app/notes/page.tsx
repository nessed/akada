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
import {
  DOCS_KEY, READER_KEY, checksKey, dateLabel, downloadNote, draftKey, loadChecks, loadNotes, minutesFor, newNoteId,
  noteColor, readStore, relativeLabel, removeStore, sampleNote, scrollKey, titleFromMarkdown, unwrapFence, wordCount,
  writeStore, type CheckResult, type Note,
} from '@/lib/notes/store';

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

  const [notes, setNotes] = useState<Note[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [reader, setReader] = useState<Reader>({ size: 'medium', measure: 'narrow' });
  const [readerOpen, setReaderOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeHeading, setActiveHeading] = useState('');
  const [progress, setProgress] = useState(0);
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
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
      setNotes(loadNotes());
      setReader(readReader());
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (ready) writeStore(DOCS_KEY, JSON.stringify(notes)); }, [notes, ready]);

  const mode: 'library' | 'read' | 'edit' = writingNew || editing ? 'edit' : openId ? 'read' : 'library';
  const active = notes.find((n) => n.id === openId);

  const go = useCallback((search: string) => {
    router.push(search ? `/notes?${search}` : '/notes');
  }, [router]);

  /* ── Reading ──────────────────────────────────────────────────────── */
  const markdown = active?.markdown ?? '';
  const headings = useMemo(() => getMarkdownHeadings(markdown), [markdown]);
  const words = useMemo(() => wordCount(markdown), [markdown]);
  const totalChecks = useMemo(() => countChecks(markdown), [markdown]);
  const hasOwnTitle = /^\s*#\s+/.test(markdown);
  const minutes = minutesFor(words);
  const minutesLeft = Math.round(minutes * (1 - progress));
  const index = notes.findIndex((n) => n.id === openId);
  const nextNote = index >= 0 && notes.length > 1 ? notes[(index + 1) % notes.length] : undefined;
  const sectionIds = headings.filter((h) => h.level === 2).map((h) => h.id);
  const allFolded = sectionIds.length > 0 && sectionIds.every((id) => collapsed.has(id));

  useEffect(() => {
    if (!openId) return;
    const frame = requestAnimationFrame(() => {
      setChecks(loadChecks(openId));
      setCollapsed(new Set());
    });
    return () => cancelAnimationFrame(frame);
  }, [openId]);

  // Back where the reader left the note.
  useEffect(() => {
    if (!ready || mode !== 'read' || !openId) return;
    const y = Number(readStore(scrollKey(openId)) || 0);
    const timer = window.setTimeout(() => window.scrollTo({ top: Number.isFinite(y) ? y : 0, behavior: 'instant' }), 60);
    return () => window.clearTimeout(timer);
  }, [openId, mode, ready]);

  useEffect(() => {
    if (mode !== 'read') return;
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
        timer = window.setTimeout(() => writeStore(scrollKey(openId), String(window.scrollY)), 200);
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
  }, [headings, openId, mode, collapsed]);

  useEffect(() => {
    if (!readerOpen) return;
    const onDown = (event: MouseEvent) => {
      if (readerRef.current && !readerRef.current.contains(event.target as Node)) setReaderOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [readerOpen]);

  const markCheck = useCallback((id: string, result: CheckResult) => {
    setChecks((current) => {
      const next = { ...current };
      if (next[id] === result) delete next[id];
      else next[id] = result;
      writeStore(checksKey(openId), JSON.stringify(next));
      return next;
    });
  }, [openId]);

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

  const saveDraft = useCallback(() => {
    const text = unwrapFence(draft);
    if (!text.trim()) return;
    const id = writingNew || !active ? newNoteId() : active.id;
    const now = Date.now();
    const next: Note = { id, title: titleFromMarkdown(text), markdown: text, updatedAt: now, createdAt: active && !writingNew ? active.createdAt : now };
    setNotes((previous) => [next, ...previous.filter((n) => n.id !== id)]);
    removeStore(draftKey);
    if (writingNew) writeStore(scrollKey(id), '0');
    router.replace(`/notes?n=${encodeURIComponent(id)}`);
  }, [active, draft, writingNew, router]);

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
  const addNotes = useCallback((incoming: Note[], message?: string) => {
    if (!incoming.length) return;
    setNotes((previous) => [...incoming, ...previous]);
    go(`n=${encodeURIComponent(incoming[0].id)}`);
    say(message ?? (incoming.length === 1 ? `Opened “${incoming[0].title}”.` : `Opened ${incoming.length} notes.`));
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
        const now = Date.now();
        const title = /^#\s+/m.test(text) ? titleFromMarkdown(text) : file.name.replace(/\.[^.]+$/, '');
        return { id: newNoteId(), title, markdown: text, updatedAt: now, createdAt: now };
      } catch {
        return null;
      }
    }));
    addNotes(read.filter((n): n is NonNullable<typeof n> => n !== null));
  }, [addNotes, say]);

  const onFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    await importFiles(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const deleteNote = useCallback((id: string) => {
    const at = notes.findIndex((n) => n.id === id);
    const gone = notes[at];
    if (!gone) return;
    setNotes((current) => current.filter((n) => n.id !== id));
    if (openId === id) router.replace('/notes');
    say(`Deleted “${gone.title}”.`, {
      label: 'Undo',
      run: () => setNotes((current) => {
        const copy = current.filter((n) => n.id !== gone.id);
        copy.splice(Math.min(at, copy.length), 0, gone);
        return copy;
      }),
    });
  }, [notes, openId, router, say]);

  const copyMarkdown = async () => {
    if (!active) return;
    try {
      await navigator.clipboard.writeText(active.markdown);
      say('Markdown copied.');
    } catch {
      say('Couldn’t reach the clipboard.');
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? notes.filter((n) => n.title.toLowerCase().includes(q) || n.markdown.toLowerCase().includes(q)) : notes;
  }, [notes, query]);
  const shelfMinutes = useMemo(() => notes.reduce((sum, n) => sum + minutesFor(wordCount(n.markdown)), 0), [notes]);

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
      if (mod || event.altKey || isTyping(event.target) || contentsOpen || promptOpen) return;
      if (event.key === 'e' && mode === 'read' && active) { event.preventDefault(); go(`n=${encodeURIComponent(active.id)}&edit=1`); }
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
  }, [mode, active, notes, index, contentsOpen, promptOpen, saveDraft, cancelEdit, go, router]);

  // Pasting markdown onto the page makes a note of it. This is the other half
  // of the AI prompt: copy the answer, come back, paste.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (mode === 'edit' || isTyping(event.target)) return;
      const text = unwrapFence(event.clipboardData?.getData('text/plain') ?? '');
      if (text.trim().length < 20) return;
      event.preventDefault();
      setPromptOpen(false);
      const now = Date.now();
      addNotes([{ id: newNoteId(), title: titleFromMarkdown(text), markdown: text, updatedAt: now, createdAt: now }], 'Pasted as a new note.');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [mode, addNotes]);

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
    document.title = mode === 'edit' ? 'Writing - Akada' : active ? `${active.title} - Akada` : 'Notes - Akada';
  }, [mode, active]);

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
  } else if (mode === 'read' && active) {
    body = (
      <div className={`reader ${showToc ? 'has-toc' : ''}`} data-measure={reader.measure}>
        <div className="reader-main">
          <button type="button" className="back" onClick={() => go('')}>← Notes</button>
          <header className="page-head">
            <p className="standfirst">
              Edited {dateLabel(active.updatedAt)} · {words.toLocaleString()} words · {minutes} min read
            </p>
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={() => go(`n=${encodeURIComponent(active.id)}&edit=1`)} title="Edit (E)">
                <Icon name="write" size={16} />Edit
              </button>
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
          <button type="button" className="link" onClick={() => addNotes([sampleNote()], 'Here’s a sample to read.')}>or read a sample note first</button>
        </div>
        <div className="keys" aria-label="Keyboard shortcuts">
          <div><span className="kbd">N</span> new note</div>
          <div><span className="kbd">O</span> open a file</div>
          <div><span className="kbd">Ctrl V</span> paste markdown as a note</div>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        <header className="page-head">
          <div>
            <p className="standfirst">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'} · {shelfMinutes} min of reading
            </p>
            <h1 className="screen-title">Notes</h1>
          </div>
          <div className="actions">
            {notes.length > 3 && (
              <label className="search">
                <Icon name="search" size={14} />
                <span className="sr-only">Search notes</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
              </label>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setPromptOpen(true)} title="A prompt for your AI">
              <Icon name="copy" size={16} />AI prompt
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} title="Open .md (O)">
              <Icon name="upload" size={16} />Open
            </button>
            <button type="button" className="btn btn-primary" onClick={() => go('new=1')} title="New note (N)">
              <Icon name="plus" size={16} />New note
            </button>
          </div>
        </header>
        <div className="fold" />
        <ul className="shelf">
          {shown.map((note) => {
            const noteWords = wordCount(note.markdown);
            const total = countChecks(note.markdown);
            const results = total ? loadChecks(note.id) : {};
            const firstLine = note.markdown.replace(/^\s*#.*$/m, '').replace(/[#>*_`=$[\]!]/g, '').trim().split('\n').find((l) => l.trim()) ?? '';
            return (
              <li key={note.id}>
                <div
                  className="shelf-row"
                  role="link"
                  tabIndex={0}
                  onClick={() => go(`n=${encodeURIComponent(note.id)}`)}
                  onKeyDown={(event) => { if (event.key === 'Enter') go(`n=${encodeURIComponent(note.id)}`); }}
                  style={{ ['--c' as string]: noteColor(note.id) }}
                >
                  <span className="stripe" aria-hidden />
                  <span className="body">
                    <span className="title">{note.title}</span>
                    <span className="sub">{relativeLabel(note.updatedAt)}{firstLine ? ` · ${firstLine}` : ''}</span>
                  </span>
                  {total > 0 && (
                    <span className="mini" aria-label={`${Object.values(results).filter((r) => r === 'got').length} of ${total} checks got`}>
                      {Array.from({ length: total }, (_, i) => <span key={i} data-r={results[String(i)] ?? ''} />)}
                    </span>
                  )}
                  <span className="mins">{minutesFor(noteWords)}m</span>
                  <button
                    type="button"
                    className="del"
                    aria-label={`Delete ${note.title}`}
                    title="Delete"
                    onClick={(event) => { event.stopPropagation(); deleteNote(note.id); }}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {shown.length === 0 && <p className="standfirst" style={{ marginTop: 20 }}>No note mentions that.</p>}
      </>
    );
  }

  return (
    <PageShell wide>
      <div className="notes">
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
