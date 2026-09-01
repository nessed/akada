'use client';

import { motion, useAnimation, PanInfo } from 'framer-motion';
import HandCheck from './notebook/HandCheck';

interface Props {
  children: React.ReactNode;
  /** Swipe right. Omit and the row does not open that way. */
  onComplete?: () => void;
  /** Swipe left. Omit and the row does not open that way. */
  onDelete?: () => void;
  /** Tints the "Complete" affordance — usually the course's own colour. */
  accent?: string;
  /** Classes for the row's own surface, which sits above the affordance. */
  surfaceClassName?: string;
  className?: string;
}

/** How far the row has to travel before letting go means something. */
const THRESHOLD = 70;

/**
 * A row that opens sideways onto an action.
 *
 * Three copies of this existed — in the dashboard's task list, in TaskItem
 * and in the stats session list — each with its own drag handling and its own
 * hand-rolled affordance, and none of them using the `.swipe-bg-complete` /
 * `.swipe-bg-delete` washes that were written for exactly this.
 */
export default function SwipeRow({
  children,
  onComplete,
  onDelete,
  accent,
  surfaceClassName = 'bg-bg',
  className = '',
}: Props) {
  const controls = useAnimation();

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    if (onComplete && info.offset.x > THRESHOLD) {
      onComplete();
    } else if (onDelete && info.offset.x < -THRESHOLD) {
      onDelete();
      // The row is going away; leaving it open would flash it back.
      return;
    }
    controls.start({ x: 0 });
  }

  return (
    <div className={`group relative overflow-hidden ${className}`}>
      {onComplete && (
        <div className="swipe-bg-complete pointer-events-none absolute inset-0 z-0 flex items-center justify-start px-4">
          <span
            className="eyebrow flex items-center gap-1.5 tracking-[0.08em]"
            style={{ color: accent || 'var(--ink)' }}
          >
            <HandCheck size={14} color="currentColor" strokeWidth={1.8} />
            Complete
          </span>
        </div>
      )}
      {onDelete && (
        <div className="swipe-bg-delete pointer-events-none absolute inset-0 z-0 flex items-center justify-end px-4">
          <span className="eyebrow flex items-center gap-1.5 text-warn tracking-[0.08em]">
            Delete
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      )}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        animate={controls}
        className={`relative z-10 ${surfaceClassName}`}
      >
        {children}
      </motion.div>
    </div>
  );
}
