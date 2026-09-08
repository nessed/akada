'use client';

import { dueLabel } from '@/lib/utils';

interface DueDateBadgeProps {
  dueDate: string | null;
  className?: string;
  showIcon?: boolean;
}

export default function DueDateBadge({
  dueDate,
  className = '',
  showIcon = true,
}: DueDateBadgeProps) {
  const due = dueLabel(dueDate);
  if (!due) return null;

  let pillStyles = '';
  let iconNode: React.ReactNode = null;
  let text = '';

  switch (due.category) {
    case 'overdue':
      pillStyles =
        'bg-priorityTint/90 text-prioritySoft border-priority/40 shadow-[0_1px_2px_rgba(201,122,107,0.12)] font-semibold';
      iconNode = (
        <span aria-hidden className="text-[10px] leading-none shrink-0">
          ⚠️
        </span>
      );
      text = `${Math.abs(due.days)}d overdue`;
      break;

    case 'today':
      pillStyles =
        'bg-[#FEF5D4] text-[#7C530A] border-[#E8CE73] shadow-[0_1px_2px_rgba(217,197,140,0.18)] font-semibold';
      iconNode = (
        <span aria-hidden className="text-[10px] leading-none shrink-0">
          📌
        </span>
      );
      text = 'Today';
      break;

    case 'tomorrow':
      pillStyles =
        'bg-peach-tint text-[#934E24] border-peach/50 shadow-[0_1px_2px_rgba(226,181,148,0.15)] font-medium';
      iconNode = (
        <svg
          aria-hidden
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 opacity-80"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
      text = 'Tomorrow';
      break;

    case 'upcoming':
    default:
      pillStyles =
        'bg-paper-2 text-ink-soft border-line shadow-[0_1px_2px_rgba(0,0,0,0.03)] font-medium';
      iconNode = (
        <svg
          aria-hidden
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
      text = due.formattedDate;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] leading-tight border transition-all select-none ${pillStyles} ${className}`}
      title={due.formattedDate ? `Due ${due.formattedDate}` : undefined}
    >
      {showIcon && iconNode}
      <span>{text}</span>
    </span>
  );
}
