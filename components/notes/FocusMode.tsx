'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import { MarkdownReader, getMarkdownHeadings } from './MarkdownReader';
import Icon from './Icon';
import StudyThis from './StudyThis';
import { useTimer } from '@/lib/timer-context';
import { paperToneStyle, usePreferences } from '@/lib/preferences';
import { FOCUS_KEY, readStore, rememberReading, wordCount, writeStore, type CheckResult } from '@/lib/notes/store';
import { useReadThrough } from '@/lib/notes/use-read-through';
import type { Course, NoteRead } from '@/lib/data';

type Size = 'small' | 'medium' | 'large';
const SIZES: Size[] = ['small', 'medium', 'large'];

type FocusPrefs = { spot: boolean; lamp: boolean };
function readFocusPrefs(): FocusPrefs {
  try {
    const raw = JSON.parse(readStore(FOCUS_KEY) || '{}');
    return { spot: raw.spot !== false, lamp: raw.lamp === true };
  } catch {
    return { spot: true, lamp: false };
  }
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** The line a reader's eye sits on, as a share of the screen from the top. */
const READING_LINE = 0.36;

interface Props {
  note: { id: string; title: string; markdown: string; courseId: string | null; taskId: string | null };
  course?: { id: string; code: string; color: string };
  checks: Record<string, CheckResult>;
  onMarkCheck: (id: string, result: CheckResult) => void;
  size: Size;
  onSize: (size: Size) => void;
  measure: 'narrow' | 'wide';
  /** Where the reader was on the page behind, so focus opens on the same lines. */
  startAt?: string;
  /** The section it picked up in from the shelf, said once on the way in. */
  resumedAt?: string;
  /** A whole read, at this reader's pace. */
  minutes: number;
  courses: Course[];
  onSay: (text: string) => void;
  onRead: (read: NoteRead) => void;
  nextNote?: { id: string; title: string };
  onNext: () => void;
  /** Hands back the section being read, so the page behind can open on it. */
  onLeave: (headingId: string) => void;
}

/**
 * The note and nothing else.
 *
 * A sheet on the desk with the rail, the bar and the dock put away. The
 * section being read stays inked and the rest of the page lets its ink down,
 * the way a hand over the lines already read would. Everything the reader
 * might reach for sits in one bar across the top that goes away while they
 * read and comes back for a pointer or a scroll up.
 */
export default function FocusMode(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  if (!mounted) return null;
  return createPortal(<FocusSheet {...props} />, document.body);
}

function FocusSheet({ note, course, checks, onMarkCheck, size, onSize, measure, startAt, resumedAt, minutes, courses, onSay, onRead, nextNote, onNext, onLeave }: Props) {
  const [prefs] = usePreferences();
  const [focusPrefs, setFocusPrefs] = useState<FocusPrefs>(readFocusPrefs);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [chromeHidden, setChromeHidden] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeId, setActiveId] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef('');
  const wentFullscreen = useRef(false);

  const headings = useMemo(() => getMarkdownHeadings(note.markdown), [note.markdown]);
  const sections = useMemo(() => headings.filter((h) => h.level === 2), [headings]);
  const words = useMemo(() => wordCount(note.markdown), [note.markdown]);
  const [placed, setPlaced] = useState(false);
  const [resumeChip, setResumeChip] = useState(resumedAt ?? '');
  const timing = useReadThrough({ note, words, progress, enabled: placed, onRead });
  const minutesLeft = Math.round(minutes * (1 - progress));
  const activeIndex = sections.findIndex((s) => s.id === activeId);
  const activeTitle = activeIndex >= 0 ? sections[activeIndex].text : '';

  // Under the lamp: the night paper if the app is on daylight, the shipped
  // paper if the reader already works at night. Scoped to this sheet only.
  const onNight = prefs.paperTone === 'night';
  const lampStyle = focusPrefs.lamp ? paperToneStyle(onNight ? 'paper' : 'night') : undefined;

  const updatePrefs = (patch: Partial<FocusPrefs>) =>
    setFocusPrefs((current) => {
      const next = { ...current, ...patch };
      writeStore(FOCUS_KEY, JSON.stringify(next));
      return next;
    });

  /* ── Entering and leaving ─────────────────────────────────────────── */
  useEffect(() => {
    const body = document.body;
    const before = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = before;
    };
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.focus({ preventScroll: true });
    let second = 0;
    const frame = requestAnimationFrame(() => {
      const target = startAt ? document.getElementById(startAt) : null;
      if (target) scroller.scrollTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 96;
      // A frame for the scroll to be measured before a read can begin.
      second = requestAnimationFrame(() => setPlaced(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(second);
    };
    // Only on the way in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const leave = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    if (wentFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => onLeave(activeRef.current), reduced ? 0 : 200);
  }, [leaving, onLeave]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else {
      wentFullscreen.current = true;
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  /* ── Following the reader ─────────────────────────────────────────── */
  // Everything here is written straight onto the DOM, so a scroll never
  // re-renders the note itself: the spotlight is an attribute on the
  // section, not state.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let frame = 0;
    let save: number | undefined;
    let lastTop = scroller.scrollTop;
    const measure = () => {
      frame = 0;
      const body = pageRef.current?.querySelector('.markdown-body');
      const room = scroller.scrollHeight - scroller.clientHeight;
      const top = scroller.scrollTop;
      setProgress(room > 0 ? Math.min(1, Math.max(0, top / room)) : 1);

      // Scrolling down puts the bar away, scrolling back up brings it.
      if (top > 80 && top > lastTop + 6) setChromeHidden(true);
      else if (top < lastTop - 6 || top <= 80) setChromeHidden(false);
      lastTop = top;

      if (!body) return;
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight * READING_LINE;
      const atEnd = room > 0 && top >= room - 4;
      const children = Array.from(body.children) as HTMLElement[];
      // A section is one unit; whatever sits before the first section (the
      // title, an opening paragraph) is another.
      const unitOf = (el: HTMLElement) => (el.hasAttribute('data-reader-section') ? el : null);
      let lit: HTMLElement | null = null;
      let litIntro = false;
      for (const child of children) {
        const rect = child.getBoundingClientRect();
        if (rect.top <= line) {
          const unit = unitOf(child);
          lit = unit;
          litIntro = !unit;
        }
      }
      if (atEnd) {
        const lastSection = [...children].reverse().find((c) => c.hasAttribute('data-reader-section')) ?? null;
        if (lastSection) { lit = lastSection; litIntro = false; }
      }
      if (!lit && !litIntro) litIntro = true;
      for (const child of children) {
        const on = child.hasAttribute('data-reader-section') ? child === lit : litIntro;
        if (on) child.setAttribute('data-lit', '');
        else child.removeAttribute('data-lit');
      }
      const heading = lit?.querySelector('h2')?.id ?? '';
      if (heading !== activeRef.current) {
        activeRef.current = heading;
        setActiveId(heading);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
      window.clearTimeout(save);
      save = window.setTimeout(() => {
        const room = scroller.scrollHeight - scroller.clientHeight;
        const heading = headings.find((h) => h.id === activeRef.current);
        rememberReading(note.id, room > 0 ? scroller.scrollTop / room : 1, heading?.text ?? '');
      }, 300);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // Sections fold and checks open, which moves everything under the line.
    const observer = new ResizeObserver(onScroll);
    if (pageRef.current) observer.observe(pageRef.current);
    onScroll();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      observer.disconnect();
      window.clearTimeout(save);
      cancelAnimationFrame(frame);
    };
  }, [note.id, headings]);

  useEffect(() => {
    if (!resumeChip) return;
    const timer = window.setTimeout(() => setResumeChip(''), 9000);
    return () => window.clearTimeout(timer);
  }, [resumeChip]);
  const startFromTop = () => {
    setResumeChip('');
    rememberReading(note.id, 0, '');
    scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // A pointer that moves brings the bar back; one that rests lets it go again.
  useEffect(() => {
    let idle: number | undefined;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      setChromeHidden(false);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        if ((scrollerRef.current?.scrollTop ?? 0) > 80 && event.clientY > 110) setChromeHidden(true);
      }, 2400);
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.clearTimeout(idle);
    };
  }, []);

  const jumpTo = useCallback((id: string) => {
    const scroller = scrollerRef.current;
    const target = document.getElementById(id);
    if (!scroller || !target) return;
    const section = target.closest('[data-reader-section]');
    if (section?.getAttribute('data-collapsed') === 'true') {
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
    requestAnimationFrame(() => {
      const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 96;
      scroller.scrollTo({ top, behavior: 'smooth' });
    });
  }, []);

  const stepSection = useCallback((step: 1 | -1) => {
    if (!sections.length) return;
    const from = sections.findIndex((s) => s.id === activeRef.current);
    const to = from < 0 ? (step > 0 ? 0 : -1) : from + step;
    if (to < 0) scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    else if (to < sections.length) jumpTo(sections[to].id);
  }, [sections, jumpTo]);

  const stepSize = useCallback((step: 1 | -1) => {
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + step))];
    if (next !== size) onSize(next);
  }, [size, onSize]);

  /* ── Keys ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const key = event.key;
      if (key === 'Escape' || key === 'f') { event.preventDefault(); leave(); }
      // Sideways arrows walk the sections; up, down and space stay the
      // scroller's own. K is left alone, it belongs to the running clock.
      else if (key === 'ArrowRight') { event.preventDefault(); stepSection(1); }
      else if (key === 'ArrowLeft') { event.preventDefault(); stepSection(-1); }
      else if (key === 'd') { event.preventDefault(); updatePrefs({ spot: !focusPrefs.spot }); }
      else if (key === 'l') { event.preventDefault(); updatePrefs({ lamp: !focusPrefs.lamp }); }
      else if (key === '=' || key === '+') { event.preventDefault(); stepSize(1); }
      else if (key === '-') { event.preventDefault(); stepSize(-1); }
      else if (key === ']' && nextNote) { event.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [leave, stepSection, stepSize, focusPrefs, nextNote, onNext]);

  const toggleSection = useCallback((id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    }), []);

  return (
    <div
      className="notes"
      data-focus-root=""
    >
      <div
        className="nf"
        role="dialog"
        aria-label={`Focus: ${note.title}`}
        data-leaving={leaving || undefined}
        data-lamp={focusPrefs.lamp || undefined}
        data-spot={focusPrefs.spot || undefined}
        data-measure={measure}
        style={lampStyle as React.CSSProperties | undefined}
      >
        <header className="nf-bar" data-hidden={chromeHidden || undefined}>
          <div className="nf-bar-side">
            <button type="button" className="nf-leave" onClick={leave} title="Leave focus (Esc)">
              <Icon name="back" size={16} />
              <span>Leave</span>
              <span className="kbd">Esc</span>
            </button>
          </div>
          <div className="nf-where" aria-live="polite">
            {course && (
              <span className="nf-course">
                <span className="course-rule" style={{ ['--c' as string]: course.color }} />
                <span className="eyebrow">{course.code}</span>
              </span>
            )}
            <span className="nf-section" key={activeTitle || note.title}>{activeTitle || note.title}</span>
          </div>
          <div className="nf-bar-side nf-tools">
            <FocusClock course={course} timing={timing} />
            <StudyThis note={note} courses={courses} onSay={onSay} raised compact />
            <span className="nf-sep" aria-hidden />
            <button type="button" className="nf-tool" aria-pressed={focusPrefs.spot} onClick={() => updatePrefs({ spot: !focusPrefs.spot })} title="Spotlight the section you're on (D)" aria-label="Spotlight">
              <Icon name="spot" size={17} />
            </button>
            <button type="button" className="nf-tool" aria-pressed={focusPrefs.lamp} onClick={() => updatePrefs({ lamp: !focusPrefs.lamp })} title={onNight ? 'Daylight (L)' : 'Under the lamp (L)'} aria-label={onNight ? 'Daylight' : 'Lamp'}>
              <Icon name={onNight !== focusPrefs.lamp ? 'sun' : 'lamp'} size={16} />
            </button>
            <span className="nf-size" role="group" aria-label="Text size">
              <button type="button" className="nf-tool" onClick={() => stepSize(-1)} disabled={size === 'small'} aria-label="Smaller text" title="Smaller (−)">
                <span className="nf-a nf-a-sm">A</span>
              </button>
              <button type="button" className="nf-tool" onClick={() => stepSize(1)} disabled={size === 'large'} aria-label="Larger text" title="Larger (+)">
                <span className="nf-a">A</span>
              </button>
            </span>
            {canFullscreen && (
              <button type="button" className="nf-tool nf-wide-only" onClick={toggleFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} title={fullscreen ? 'Leave full screen' : 'Full screen'}>
                <Icon name={fullscreen ? 'shrink' : 'expand'} size={15} />
              </button>
            )}
          </div>
        </header>

        <div className="nf-scroll" ref={scrollerRef} tabIndex={-1}>
          <div className="nf-desk">
            <div className={`nf-page reading-size-${size}`} ref={pageRef}>
              <FocusArticle
                markdown={note.markdown}
                title={note.title}
                collapsed={collapsed}
                onToggleSection={toggleSection}
                checks={checks}
                onMarkCheck={onMarkCheck}
              />
              <footer className="nf-end">
                <HandCheck size={24} />
                <HandNote size={22} rotate={-2}>that’s the lot</HandNote>
                <SatFor />
                <div className="nf-end-actions">
                  {nextNote && nextNote.id !== note.id && (
                    <button type="button" className="btn btn-ghost" onClick={onNext}>
                      Next on the pile: <span className="nf-next-title">{nextNote.title}</span> →
                    </button>
                  )}
                  <button type="button" className="btn" onClick={leave}>Leave focus</button>
                </div>
              </footer>
            </div>
          </div>
        </div>

        {sections.length > 1 && (
          <nav className="nf-margin" aria-label="Sections">
            {sections.map((section, i) => (
              <button
                key={section.id}
                type="button"
                className="nf-mark"
                data-state={i === activeIndex ? 'on' : activeIndex >= 0 && i < activeIndex ? 'past' : undefined}
                onClick={() => jumpTo(section.id)}
                aria-current={i === activeIndex ? 'location' : undefined}
              >
                <span className="nf-mark-stroke" aria-hidden />
                <span className="nf-mark-label">{section.text}</span>
              </button>
            ))}
          </nav>
        )}

        {resumeChip && (
          <div className="nf-resume" role="status">
            <span>picked up in <em>{resumeChip}</em></span>
            <button type="button" onClick={startFromTop}>Start from the top</button>
          </div>
        )}

        <div className="nf-foot" aria-hidden>
          {sections.length > 1 && (
            <span className="nf-count">{Math.max(1, activeIndex + 1)}<span>/</span>{sections.length}</span>
          )}
          {timing && <span className="eyebrow nf-timing">timing this read</span>}
          <HandNote size={20} rotate={-3} className="nf-left">
            {progress >= 0.98 ? 'read through' : minutesLeft < 1 ? 'under a minute left' : `~ ${minutesLeft} min left`}
          </HandNote>
        </div>
      </div>
    </div>
  );
}

/** The note, kept out of the scroll's re-renders. */
const FocusArticle = memo(function FocusArticle({ markdown, title, collapsed, onToggleSection, checks, onMarkCheck }: {
  markdown: string;
  title: string;
  collapsed: Set<string>;
  onToggleSection: (id: string) => void;
  checks: Record<string, CheckResult>;
  onMarkCheck: (id: string, result: CheckResult) => void;
}) {
  const hasOwnTitle = /^\s*#\s+/.test(markdown);
  return (
    <>
      {!hasOwnTitle && <h1 className="nf-title">{title}</h1>}
      <MarkdownReader markdown={markdown} collapsedSections={collapsed} onToggleSection={onToggleSection} checks={checks} onMarkCheck={onMarkCheck} />
    </>
  );
});

/**
 * The clock in the bar: the sitting on the clock, in the course colour.
 * Starting one is StudyThis's, beside it.
 */
function FocusClock({ course, timing }: { course?: { id: string; code: string; color: string }; timing: boolean }) {
  const { active, focusSeconds, onBreak, hydrated } = useTimer();
  if (!hydrated) return null;
  if (active) {
    const m = Math.floor(focusSeconds / 60);
    const s = focusSeconds % 60;
    const h = Math.floor(m / 60);
    const shown = h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
    return (
      <span className="nf-clock" data-paused={active.isPaused || onBreak || undefined} title={onBreak ? 'On a break' : active.isPaused ? 'Held' : timing ? 'On the clock, timing this read' : 'On the clock'}>
        <span className="nf-clock-dot" style={{ background: course?.color ?? 'var(--ink-soft)' }} aria-hidden />
        <span className="nf-clock-digits">{shown}</span>
      </span>
    );
  }
  return null;
}

/** How long this sitting with the note has been, counted from the way in. */
function SatFor() {
  const [since, setSince] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const frame = requestAnimationFrame(() => {
      setSince(Date.now());
      tick();
    });
    const timer = window.setInterval(tick, 20_000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);
  const minutes = since ? Math.round((now - since) / 60_000) : 0;
  if (minutes < 1) return null;
  return (
    <p className="nf-sat">
      sat with it for <b>{minutes}</b> {minutes === 1 ? 'minute' : 'minutes'}
    </p>
  );
}
