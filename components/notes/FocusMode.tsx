'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import HandNote from '@/components/notebook/HandNote';
import HandCheck from '@/components/notebook/HandCheck';
import { MarkdownReader } from './MarkdownReader';
import { getMarkdownHeadings } from './markdown-outline';
import Icon from './Icon';
import StudyThis from './StudyThis';
import { useTimer } from '@/lib/timer-context';
import { paperToneStyle, usePreferences } from '@/lib/preferences';
import { FOCUS_KEY, readStore, rememberReading, wordCount, writeStore, type CheckResult } from '@/lib/notes/store';
import { useReadThrough } from '@/lib/notes/use-read-through';
import type { Course, NoteRead } from '@/lib/data';

type Size = 'small' | 'medium' | 'large';
const SIZES: Size[] = ['small', 'medium', 'large'];

/** How far a pinch takes the page, as a multiple of the chosen text size. */
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type FocusPrefs = { spot: boolean; lamp: boolean; zoom: number };
function readFocusPrefs(): FocusPrefs {
  try {
    const raw = JSON.parse(readStore(FOCUS_KEY) || '{}');
    const zoom = typeof raw.zoom === 'number' && Number.isFinite(raw.zoom) ? clampZoom(raw.zoom) : 1;
    return { spot: raw.spot !== false, lamp: raw.lamp === true, zoom };
  } catch {
    return { spot: true, lamp: false, zoom: 1 };
  }
}

/** Safari's own pinch event, which TypeScript's DOM types leave out. */
type GestureEvent = Event & { scale: number; clientX: number; clientY: number };

/** The block a point on the page lands in, so a zoom can hold it still. */
function blockAt(page: HTMLElement, y: number): HTMLElement | null {
  const body = page.querySelector('.markdown-body');
  if (!body) return null;
  const box = body.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, y);
  if (!hit || !body.contains(hit)) return null;
  return (hit.closest('p, li, h1, h2, h3, h4, pre, blockquote, table, figure, img, hr, .katex-display') as HTMLElement | null) ?? (hit as HTMLElement);
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
  const [zoom, setZoom] = useState(focusPrefs.zoom);
  const zoomRef = useRef(focusPrefs.zoom);
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
    // A finger has no cursor to move, so a tap on the page does it: the way a
    // reader app brings its bar back. Only a tap, one that stayed put and did
    // not land on a link or a control, and only while the bar is away.
    let down: { id: number; x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      down = event.pointerType === 'mouse' ? null : { id: event.pointerId, x: event.clientX, y: event.clientY };
    };
    const onUp = (event: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
      const target = event.target as HTMLElement | null;
      if (!target || !scrollerRef.current?.contains(target)) return;
      if (target.closest('a, button, input, textarea, select, summary, [role="button"]')) return;
      setChromeHidden(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
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

  /* ── Zoom ─────────────────────────────────────────────────────────── */
  // A pinch ends as a reflow, not a magnification: the type and the measure
  // grow together until the measure meets the screen, then the lines rewrap,
  // so nothing runs off the side. Reflowing a whole note costs a layout, far
  // too much to pay on every frame of a gesture, which is what made the first
  // version stutter. So while the fingers move the sheet is only scaled on
  // the compositor, from the point between them, and the reflow happens once,
  // when they let go, holding the block under them where it was.
  const saveZoom = useRef<number | undefined>(undefined);
  const live = useRef<{ from: number; z: number; y: number } | null>(null);

  const applyZoom = useCallback((next: number, anchorY?: number) => {
    const z = clampZoom(next);
    const scroller = scrollerRef.current;
    const page = pageRef.current;
    if (!scroller || !page) return;
    const scaled = page.style.scale !== '';
    if (!scaled && Math.abs(z - zoomRef.current) < 0.001) return;
    const y = anchorY ?? scroller.getBoundingClientRect().top + scroller.clientHeight * READING_LINE;
    // Measured as it is seen, scale and all: a share of a block's height is
    // the same under a scale as without one.
    const block = blockAt(page, y);
    const before = block?.getBoundingClientRect();
    const share = before && before.height ? (y - before.top) / before.height : 0;
    zoomRef.current = z;
    page.style.scale = '';
    page.style.transformOrigin = '';
    page.style.willChange = '';
    page.style.setProperty('--nf-zoom', String(z));
    if (block && before) {
      const after = block.getBoundingClientRect();
      scroller.scrollTop += after.top + share * after.height - y;
    }
    // The scaled glyphs give way to the reflowed ones under a short fade
    // rather than a hard swap.
    if (scaled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      page.querySelector('.markdown-body')?.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
    }
    setZoom(z);
    window.clearTimeout(saveZoom.current);
    saveZoom.current = window.setTimeout(() => {
      setFocusPrefs((current) => {
        const kept = { ...current, zoom: zoomRef.current };
        writeStore(FOCUS_KEY, JSON.stringify(kept));
        return kept;
      });
    }, 400);
  }, []);
  useEffect(() => () => window.clearTimeout(saveZoom.current), []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    /** A frame of a gesture: a scale on the compositor, no layout. */
    const preview = (next: number, x: number, y: number) => {
      const page = pageRef.current;
      if (!page) return;
      if (!live.current) {
        const rect = page.getBoundingClientRect();
        page.style.transformOrigin = `${x - rect.left}px ${y - rect.top}px`;
        page.style.willChange = 'scale';
        live.current = { from: zoomRef.current, z: zoomRef.current, y };
      }
      const z = clampZoom(next);
      live.current.z = z;
      page.style.scale = String(z / live.current.from);
    };
    const current = () => live.current?.z ?? zoomRef.current;
    /** The gesture is over: reflow once, at the zoom it arrived at. */
    const settle = () => {
      const gesture = live.current;
      live.current = null;
      if (gesture) applyZoom(gesture.z, gesture.y);
    };

    // A trackpad pinch in Chrome, Edge and Firefox, and ctrl with a wheel.
    // There is no end event, so a short quiet is taken as one.
    let quiet: number | undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      preview(current() * Math.exp(-Math.max(-25, Math.min(25, delta)) / 100), event.clientX, event.clientY);
      window.clearTimeout(quiet);
      quiet = window.setTimeout(settle, 140);
    };

    // A trackpad pinch in Safari, and the pinch iOS reports alongside touches.
    let gestureFrom = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      gestureFrom = zoomRef.current;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as GestureEvent;
      preview(gestureFrom * gesture.scale, gesture.clientX, gesture.clientY);
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      settle();
    };

    // Two fingers on a touch screen.
    let pinch: { span: number; zoom: number } | null = null;
    const spanOf = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) pinch = { span: spanOf(event.touches), zoom: zoomRef.current };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const [a, b] = [event.touches[0], event.touches[1]];
      if (pinch.span > 0) preview(pinch.zoom * (spanOf(event.touches) / pinch.span), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2 && pinch) {
        pinch = null;
        settle();
      }
    };

    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('gesturestart', onGestureStart);
    scroller.addEventListener('gesturechange', onGestureChange);
    scroller.addEventListener('gestureend', onGestureEnd);
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', onTouchEnd);
    return () => {
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('gesturestart', onGestureStart);
      scroller.removeEventListener('gesturechange', onGestureChange);
      scroller.removeEventListener('gestureend', onGestureEnd);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
      window.clearTimeout(quiet);
    };
  }, [applyZoom]);

  /* ── Keys ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // The browser's own zoom keys zoom the note instead while it is open.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && ['=', '+', '-', '0'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '0') applyZoom(1);
        else applyZoom(zoomRef.current * (event.key === '-' ? 1 / 1.1 : 1.1));
        return;
      }
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
  }, [leave, stepSection, stepSize, applyZoom, focusPrefs, nextNote, onNext]);

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
            {Math.abs(zoom - 1) > 0.02 && (
              <button type="button" className="nf-tool nf-zoom" onClick={() => applyZoom(1)} aria-label="Reset zoom" title="Back to 100% (Ctrl 0)">
                {Math.round(zoom * 100)}%
              </button>
            )}
            {canFullscreen && (
              <button type="button" className="nf-tool nf-wide-only" onClick={toggleFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} title={fullscreen ? 'Leave full screen' : 'Full screen'}>
                <Icon name={fullscreen ? 'shrink' : 'expand'} size={15} />
              </button>
            )}
          </div>
        </header>

        <div className="nf-scroll" ref={scrollerRef} tabIndex={-1}>
          <div className="nf-desk">
            <div className={`nf-page reading-size-${size}`} ref={pageRef} style={{ ['--nf-zoom' as string]: zoom }}>
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
