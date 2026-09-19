'use client';

import { dueLabel } from '@/lib/utils';

interface DueDateBadgeProps {
  dueDate: string | null;
  className?: string;
  /** Slightly larger, for the reading view rather than a list line. */
  size?: 'sm' | 'md';
}

/**
 * A due date, written rather than badged.
 *
 * This used to be a bordered capsule with an emoji and a drop shadow, which
 * is three of the things the app is defined by not doing. A date is data, so
 * it is set in mono; the only date the page raises its voice for is today,
 * and it does that with a swipe of highlighter. Overdue is a warm clay, not
 * a red alert.
 */
export default function DueDateBadge({
  dueDate,
  className = '',
  size = 'sm',
}: DueDateBadgeProps) {
  const due = dueLabel(dueDate);
  if (!due) return null;

  const scale = size === 'md' ? 'text-[12px]' : 'text-[11px]';

  let tone = 'text-muted';
  let mark = '';
  if (due.category === 'overdue') {
    tone = 'text-warn';
  } else if (due.category === 'today') {
    tone = 'text-ink';
    mark = 'hl-swipe';
  } else if (due.category === 'tomorrow') {
    tone = 'text-ink-soft';
  }

  return (
    <span
      className={`tnum inline-block font-mono tracking-[0.02em] ${scale} ${tone} ${mark} ${className}`}
      title={due.formattedDate ? `Due ${due.formattedDate}` : undefined}
    >
      {due.text}
    </span>
  );
}
