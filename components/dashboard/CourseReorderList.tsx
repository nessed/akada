'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Course } from '@/lib/data';

interface Props {
  /** Already in the order they should read, first card first. */
  courses: Course[];
  /**
   * Persists the new order. Resolving means it is written; rejecting means
   * the caller has rolled its own copy back and the cards return to where
   * they were.
   */
  onReorder: (orderedIds: string[]) => Promise<void>;
  /** The card itself. This component owns only the space around it. */
  renderCourse: (course: Course) => React.ReactNode;
}

/** How far a mouse has to travel before a click becomes a carry. */
const MOUSE_SLOP = 6;
/** How far a finger may wander during the press and still be a press. */
const TOUCH_SLOP = 9;
/** How long a finger rests before the sheet lifts. Shorter reads as a mis-tap. */
const PRESS_MS = 320;
/** How close to the edge of the window the carried card starts scrolling. */
const EDGE = 84;

interface Slot {
  top: number;
  height: number;
}

interface Carry {
  pointerId: number;
  /** Where the carried card started in the list. */
  from: number;
  /** Where it would land if it were let go now. */
  to: number;
  /** Distance between the pointer and the top of the card it picked up. */
  grab: number;
  /** Pointer position in page coordinates, so a scroll mid-carry still lands right. */
  pageY: number;
  slots: Slot[];
  gap: number;
  /** Top of the list itself, page coordinates. */
  listTop: number;
}

interface Press {
  pointerId: number;
  index: number;
  pointerType: string;
  startX: number;
  startY: number;
  timer: number | null;
}

/** Where a card ends up when it is moved from one index to another. */
function reindex(ids: string[], from: number, to: number): string[] {
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/**
 * The dashboard's course stack, rearrangeable.
 *
 * Written against pointer events by hand, with no drag-and-drop library, for
 * three reasons the libraries fight: the whole card is already a link, the
 * page beneath it already scrolls under a finger, and the thing being carried
 * has to keep looking like a sheet of paper rather than a dragged widget.
 *
 * Tap and carry stay out of each other's way by asking for different things.
 * A mouse must travel {@link MOUSE_SLOP} before anything lifts, which a click
 * never does. A finger must rest for {@link PRESS_MS} without wandering
 * further than {@link TOUCH_SLOP}, so a tap opens the course and a swipe
 * scrolls the page, exactly as before; only a deliberate press picks a card
 * up. Whatever click the browser then synthesises at the end of a carry is
 * swallowed on the way up, so a card is never carried and opened at once.
 */
export default function CourseReorderList({ courses, onReorder, renderCourse }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const listRef = useRef<HTMLOListElement | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  /**
   * The order shown while a write is in flight, so the cards move the instant
   * they are let go. Cleared once the write settles, at which point the
   * caller's own copy (updated, or rolled back) is what shows.
   */
  const [pendingOrder, setPendingOrder] = useState<string[] | null>(null);
  const [carry, setCarry] = useState<Carry | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const carryRef = useRef<Carry | null>(null);
  const pressRef = useRef<Press | null>(null);
  const suppressClickRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const clientYRef = useRef(0);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const ordered = useMemo(() => {
    if (!pendingOrder) return courses;
    const byId = new Map(courses.map((course) => [course.id, course]));
    const seen = new Set(pendingOrder);
    const front = pendingOrder
      .map((id) => byId.get(id))
      .filter((course): course is Course => Boolean(course));
    // A course added from another tab while a write was in flight is not in
    // the pending order; it keeps the place the caller gave it.
    return [...front, ...courses.filter((course) => !seen.has(course.id))];
  }, [courses, pendingOrder]);

  const setCarryState = useCallback((next: Carry | null) => {
    carryRef.current = next;
    setCarry(next);
  }, []);

  /** Nothing about a carry is allowed to outlive it. */
  const endCarry = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    document.removeEventListener('touchmove', blockTouchScroll);
    setCarryState(null);
  }, [setCarryState]);

  useEffect(() => endCarry, [endCarry]);

  const commitOrder = useCallback(
    (ids: string[], said: string) => {
      setPendingOrder(ids);
      setAnnouncement(said);
      writeQueueRef.current = writeQueueRef.current
        .then(() => onReorder(ids))
        .then(
          () => {
            setPendingOrder((current) => (current === ids ? null : current));
          },
          () => {
            // The caller has already put its own copy back; dropping the
            // pending order is what lets that show through.
            setPendingOrder((current) => (current === ids ? null : current));
            setAnnouncement('That order was not saved.');
          },
        );
    },
    [onReorder],
  );

  /** Where the carried card would land, read off the slots it is over. */
  const landingFor = useCallback((next: Carry): number => {
    const { slots, from, grab, pageY } = next;
    const centre = pageY - grab + slots[from].height / 2;
    let landing = from;
    for (let i = 0; i < from; i += 1) {
      if (centre < slots[i].top + slots[i].height / 2) {
        landing = i;
        break;
      }
    }
    for (let i = from + 1; i < slots.length; i += 1) {
      if (centre > slots[i].top + slots[i].height / 2) landing = i;
    }
    return landing;
  }, []);

  const trackPointer = useCallback(
    (clientY: number) => {
      const current = carryRef.current;
      if (!current) return;
      clientYRef.current = clientY;
      const next: Carry = { ...current, pageY: clientY + window.scrollY };
      next.to = landingFor(next);
      setCarryState(next);
    },
    [landingFor, setCarryState],
  );

  /** Carrying a card near the top or bottom of the window walks the page. */
  const scrollTick = useCallback(() => {
    if (!carryRef.current) {
      scrollFrameRef.current = null;
      return;
    }
    const y = clientYRef.current;
    const height = window.innerHeight;
    let delta = 0;
    if (y < EDGE) delta = -Math.ceil((EDGE - y) / 5);
    else if (y > height - EDGE) delta = Math.ceil((y - (height - EDGE)) / 5);
    if (delta !== 0) {
      window.scrollBy(0, delta);
      trackPointer(y);
    }
    scrollFrameRef.current = requestAnimationFrame(scrollTick);
  }, [trackPointer]);

  const beginCarry = useCallback(
    (index: number, pointerId: number, clientY: number, element: HTMLElement) => {
      const list = listRef.current;
      if (!list) return;
      const items = itemRefs.current.slice(0, ordered.length);
      if (items.some((item) => !item)) return;
      const scrollY = window.scrollY;
      const slots: Slot[] = items.map((item) => {
        const rect = (item as HTMLLIElement).getBoundingClientRect();
        return { top: rect.top + scrollY, height: rect.height };
      });
      const gap =
        slots.length > 1 ? Math.max(0, slots[1].top - (slots[0].top + slots[0].height)) : 0;
      const pageY = clientY + scrollY;
      const next: Carry = {
        pointerId,
        from: index,
        to: index,
        grab: pageY - slots[index].top,
        pageY,
        slots,
        gap,
        listTop: list.getBoundingClientRect().top + scrollY,
      };
      clientYRef.current = clientY;
      // A mouse that started a carry may have begun selecting the card's text
      // on the way; nothing should stay highlighted behind the lifted sheet.
      window.getSelection()?.removeAllRanges();
      try {
        element.setPointerCapture(pointerId);
      } catch {
        // Safari throws if the pointer has already been released; the
        // window-level move handling below still carries the card.
      }
      // A finger that has not scrolled yet can still be told not to. Passive
      // listeners cannot, hence the explicit registration.
      document.addEventListener('touchmove', blockTouchScroll, { passive: false });
      setCarryState(next);
      setAnnouncement(`${ordered[index].code} picked up. Move it, then let go.`);
      if (scrollFrameRef.current === null) {
        scrollFrameRef.current = requestAnimationFrame(scrollTick);
      }
    },
    [ordered, scrollTick, setCarryState],
  );

  const cancelPress = useCallback(() => {
    const press = pressRef.current;
    if (press?.timer !== null && press?.timer !== undefined) {
      window.clearTimeout(press.timer);
    }
    pressRef.current = null;
  }, []);

  function handlePointerDown(event: React.PointerEvent<HTMLLIElement>, index: number) {
    if (carryRef.current || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const grip = target.closest('[data-course-grip]');
    // Every other real button on the card (the menu, the timer) keeps its own
    // press. The link underneath does not: carrying starts on top of it and
    // the click it would have fired is swallowed below.
    if (!grip && target.closest('button')) return;

    // The grip is the one control that means nothing else, so it lifts at
    // once. A mouse anywhere else on the card waits to see a drag.
    if (grip) {
      beginCarry(index, event.pointerId, event.clientY, event.currentTarget);
      return;
    }
    if (event.pointerType === 'mouse') {
      pressRef.current = {
        pointerId: event.pointerId,
        index,
        pointerType: event.pointerType,
        startX: event.clientX,
        startY: event.clientY,
        timer: null,
      };
      return;
    }

    const element = event.currentTarget;
    const { pointerId, clientX, clientY } = event;
    pressRef.current = {
      pointerId,
      index,
      pointerType: event.pointerType,
      startX: clientX,
      startY: clientY,
      timer: window.setTimeout(() => {
        pressRef.current = null;
        beginCarry(index, pointerId, clientY, element);
      }, PRESS_MS),
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLLIElement>) {
    const current = carryRef.current;
    if (current) {
      if (event.pointerId !== current.pointerId) return;
      trackPointer(event.clientY);
      return;
    }
    const press = pressRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    const travelled = Math.hypot(event.clientX - press.startX, event.clientY - press.startY);
    if (press.pointerType === 'mouse') {
      if (travelled > MOUSE_SLOP) {
        cancelPress();
        beginCarry(press.index, event.pointerId, event.clientY, event.currentTarget);
      }
      return;
    }
    // A finger that moves before the sheet lifts was scrolling the page.
    if (travelled > TOUCH_SLOP) cancelPress();
  }

  function handlePointerUp(event: React.PointerEvent<HTMLLIElement>) {
    const current = carryRef.current;
    cancelPress();
    if (!current || event.pointerId !== current.pointerId) return;
    // A carry always ends by swallowing the click the browser is about to
    // synthesise, even one that lands back where it started, so letting go
    // never also opens the course.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 400);
    const { from, to } = current;
    endCarry();
    const course = ordered[from];
    if (!course) return;
    if (from === to) {
      setAnnouncement(`${course.code} put back in place.`);
      return;
    }
    commitOrder(
      reindex(
        ordered.map((item) => item.id),
        from,
        to,
      ),
      `${course.code} moved to ${to + 1} of ${ordered.length}.`,
    );
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLLIElement>) {
    cancelPress();
    if (carryRef.current?.pointerId === event.pointerId) endCarry();
  }

  /**
   * Capture is released on its own the moment a pointer goes up, so this
   * normally fires with the carry already finished. It matters for the times
   * it does not: a browser taking the pointer away mid-carry would otherwise
   * leave a card stranded above the page.
   */
  function handleLostCapture(event: React.PointerEvent<HTMLLIElement>) {
    if (carryRef.current?.pointerId === event.pointerId) endCarry();
  }

  function handleClickCapture(event: React.MouseEvent<HTMLLIElement>) {
    if (!suppressClickRef.current && !carryRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  /** The path that does not need a pointer at all. */
  function handleGripKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const to = index + delta;
    if (to < 0 || to >= ordered.length) return;
    const course = ordered[index];
    commitOrder(
      reindex(
        ordered.map((item) => item.id),
        index,
        to,
      ),
      `${course.code} moved to ${to + 1} of ${ordered.length}.`,
    );
  }

  /** How far a card that is not being carried steps aside. */
  function shiftFor(index: number): number {
    // A course added or deleted mid-carry leaves the measurements behind; the
    // stack simply stops stepping aside rather than reading past its slots.
    if (!carry || !carry.slots[carry.from] || index >= carry.slots.length) return 0;
    const { from, to, slots, gap } = carry;
    const step = slots[from].height + gap;
    if (to > from && index > from && index <= to) return -step;
    if (to < from && index >= to && index < from) return step;
    return 0;
  }

  const landingTop = (() => {
    if (!carry) return 0;
    const { from, to, slots, listTop } = carry;
    if (!slots[from] || !slots[to]) return 0;
    if (to === from) return slots[from].top - listTop;
    if (to > from) return slots[to].top + slots[to].height - slots[from].height - listTop;
    return slots[to].top - listTop;
  })();

  const ease = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

  return (
    <div className="relative">
      {/* The space the card will settle into. A pencil rule around an empty
          slot, not a filled drop-zone: it suggests where the sheet goes
          without announcing it. */}
      {carry && (
        <div
          aria-hidden
          className="deckle pointer-events-none absolute inset-x-0 z-0"
          style={{
            top: landingTop,
            height: carry.slots[carry.from]?.height ?? 0,
            border: '1px dashed var(--line-strong)',
            opacity: 0.45,
            transition: `top 180ms ${ease}`,
          }}
        />
      )}

      <ol
        ref={listRef}
        aria-label="Courses, in the order you arranged them"
        className="relative m-0 flex list-none flex-col gap-3 p-0"
        style={carry ? { touchAction: 'none' } : undefined}
      >
        {ordered.map((course, index) => {
          const slot = carry?.slots[index];
          const carried = carry?.from === index && Boolean(slot);
          const offset =
            carried && carry && slot ? carry.pageY - carry.grab - slot.top : shiftFor(index);
          return (
            <li
              key={course.id}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className="group/course relative"
              onPointerDown={(event) => handlePointerDown(event, index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onLostPointerCapture={handleLostCapture}
              onClickCapture={handleClickCapture}
              onDragStart={(event) => event.preventDefault()}
              style={{
                transform: carried
                  ? `translate3d(0, ${offset}px, 0)${
                      reducedMotion ? '' : ' rotate(-0.45deg) scale(1.012)'
                    }`
                  : `translate3d(0, ${offset}px, 0)`,
                transition: carried ? 'none' : `transform 180ms ${ease}`,
                zIndex: carried ? 20 : 1,
                // A sheet lifted off the page, not a widget with a shadow box:
                // the blur follows the card's own cut corners, and the warm
                // tone is the one the sticky note already casts.
                filter: carried
                  ? 'drop-shadow(0 1px 0 rgba(90, 76, 50, 0.05)) drop-shadow(0 10px 18px rgba(120, 100, 60, 0.17))'
                  : undefined,
                cursor: carried ? 'grabbing' : undefined,
                touchAction: carried ? 'none' : undefined,
                userSelect: carry ? 'none' : undefined,
                WebkitUserSelect: carry ? 'none' : undefined,
              }}
            >
              {/* Two pencil strokes at the top edge, where you would take hold
                  of a sheet to move it. Drawn rather than stocked, and only
                  there when the card is under a cursor, under focus, or in
                  the middle of being carried. It takes no pointer event until
                  then, so on a touch screen, where nothing ever hovers, a tap
                  in that spot still opens the course exactly as before; a
                  finger rearranges by pressing and holding the card itself. */}
              <button
                type="button"
                data-course-grip
                aria-label={`Reorder ${course.name}, ${index + 1} of ${ordered.length}`}
                aria-keyshortcuts="ArrowUp ArrowDown"
                title="Drag, or press the up and down arrow keys"
                onKeyDown={(event) => handleGripKey(event, index)}
                className={`pointer-events-none absolute left-1/2 top-0 z-20 flex h-6 w-11 -translate-x-1/2 items-center justify-center text-muted-soft transition-opacity hover:text-muted focus:pointer-events-auto focus:opacity-100 focus-visible:opacity-100 group-hover/course:pointer-events-auto group-hover/course:opacity-100 ${
                  carried ? 'pointer-events-auto opacity-100' : 'opacity-0'
                }`}
                style={{ cursor: carried ? 'grabbing' : 'grab', touchAction: 'none' }}
              >
                <svg width="20" height="9" viewBox="0 0 20 9" fill="none" aria-hidden>
                  <path
                    d="M2.5 3.1 Q7 2.2 11 3 T17.5 2.7"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M3 6.4 Q8 5.6 12 6.3 T17 6"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              {renderCourse(course)}
            </li>
          );
        })}
      </ol>

      {/* What a screen reader hears when a card moves, by drag or by key. */}
      <p aria-live="polite" className="sr-only m-0">
        {announcement}
      </p>
    </div>
  );
}

/** Kept module-level so add and remove are always the same reference. */
function blockTouchScroll(event: TouchEvent) {
  if (event.cancelable) event.preventDefault();
}
