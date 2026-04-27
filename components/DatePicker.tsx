'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isoDate } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  compact?: boolean;
  allowClear?: boolean;
  className?: string;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function parseIso(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value + 'T00:00:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function formatDisplay(value: string): string {
  const date = parseIso(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Pick date',
  compact = false,
  allowClear = true,
  className = '',
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = parseIso(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthStart(selectedDate || new Date()));

  useEffect(() => {
    if (open) setViewMonth(monthStart(selectedDate || new Date()));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const days = useMemo(() => {
    const start = monthStart(viewMonth);
    const mondayOffset = (start.getDay() + 6) % 7;
    const cursor = new Date(start);
    cursor.setDate(start.getDate() - mondayOffset);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  const todayIso = isoDate();
  const selectedIso = value;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = isoDate(tomorrow);

  function selectDate(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 border border-line bg-bg-tint text-left text-ink-soft outline-none transition-colors hover:border-line-strong focus:border-ink ${
          compact
            ? 'rounded-md px-2.5 py-1.5 text-[11px]'
            : 'rounded-lg px-3 py-2.5 text-xs'
        }`}
      >
        <span className={value ? 'text-ink-soft' : 'text-muted-soft'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 text-muted"
        >
          <path
            d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[100] w-[min(20rem,calc(100vw-44px))] overflow-hidden rounded-[14px] border border-line bg-paper shadow-[0_18px_48px_rgba(26,25,21,0.16)] animate-slide-up">
          <div className="flex items-center justify-between border-b border-line bg-bg px-3.5 py-3">
            <button
              type="button"
              onClick={() => setViewMonth((date) => addMonths(date, -1))}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-bg-tint"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div className="text-center">
              <p className="m-0 font-serif text-[18px] font-medium tracking-[-0.01em]">
                {viewMonth.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <p className="mt-0.5 mb-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                due date
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((date) => addMonths(date, 1))}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-soft hover:bg-bg-tint"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          <div className="px-3.5 pb-3.5 pt-3">
            <div className="grid grid-cols-7 gap-1 pb-1.5">
              {WEEKDAYS.map((day, index) => (
                <span
                  key={`${day}-${index}`}
                  className="text-center text-[10px] font-semibold text-muted-soft"
                >
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((date) => {
                const dayIso = isoDate(date);
                const inMonth = date.getMonth() === viewMonth.getMonth();
                const isToday = dayIso === todayIso;
                const isSelected = dayIso === selectedIso;
                return (
                  <button
                    key={dayIso}
                    type="button"
                    onClick={() => selectDate(dayIso)}
                    className={`flex aspect-square items-center justify-center rounded-[9px] text-[12px] font-medium transition-colors ${
                      isSelected
                        ? 'bg-ink text-bg'
                        : isToday
                          ? 'bg-bg-tint text-ink'
                          : inMonth
                            ? 'text-ink-soft hover:bg-bg-tint'
                            : 'text-muted-soft/60 hover:bg-bg-tint'
                    }`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => selectDate(todayIso)}
                className="flex-1 rounded-full border border-line bg-bg-tint px-3 py-2 text-[11px] font-medium text-ink-soft"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => selectDate(tomorrowIso)}
                className="flex-1 rounded-full border border-line bg-bg-tint px-3 py-2 text-[11px] font-medium text-ink-soft"
              >
                Tomorrow
              </button>
              {allowClear && (
                <button
                  type="button"
                  onClick={() => selectDate('')}
                  className="flex-1 rounded-full border border-line bg-transparent px-3 py-2 text-[11px] font-medium text-muted"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
