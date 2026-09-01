'use client';

import { useEffect, useState } from 'react';
import type { Course } from '@/lib/data';

type Mode = 'menu' | 'pickCourseTimer' | 'pickCourseTask' | 'closed';

interface Props {
  courses: Course[];
  onStartTimer: (courseId: string) => void;
  onAddTask: (courseId: string) => void;
}

export default function FloatingActionButton({ courses, onStartTimer, onAddTask }: Props) {
  const [mode, setMode] = useState<Mode>('closed');

  useEffect(() => {
    if (mode === 'closed') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('closed');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode]);

  const open = mode !== 'closed';
  if (courses.length === 0) return null;

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMode('closed')}
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm animate-fade-in"
        />
      )}

      {/* Pinned to the page column, not the viewport edge: on a wide screen
          `right-5` stranded this button hundreds of pixels away from the
          cards it acts on. PageShell, BottomNav, ActiveTimerDock and the
          Stats undo toast all mirror this same width, change them together.
          The strip itself stays click-through so it does not cover the last
          card, only the menu and the button take pointer events. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 px-[var(--density-gutter)] md:px-8"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      >
        {/* From `lg` up the margins are wide enough to hold the button just
            outside the column, so it stops sitting on the last card's own
            timer button. Below that it behaves like a normal phone FAB. */}
        <div className="pointer-events-none mx-auto flex max-w-2xl md:max-w-3xl flex-col items-end gap-3 lg:translate-x-[72px]">
          {mode === 'menu' && (
            <div className="pointer-events-auto rounded-2xl bg-paper border border-line shadow-[0_18px_48px_rgba(26,25,21,0.16)] overflow-hidden animate-fade-in">
              <button
                type="button"
                onClick={() => setMode('pickCourseTimer')}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-bg-tint text-left"
              >
                <span className="w-8 h-8 rounded-full bg-bg-tint flex items-center justify-center">
                  <svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5l12 7-12 7V5z" />
                  </svg>
                </span>
                <span className="text-sm font-medium">Start timer</span>
              </button>
              <div className="h-px bg-line" />
              <button
                type="button"
                onClick={() => setMode('pickCourseTask')}
                className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-bg-tint text-left"
              >
                <span className="w-8 h-8 rounded-full bg-bg-tint flex items-center justify-center">
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="text-sm font-medium">Add task</span>
              </button>
            </div>
          )}

          {(mode === 'pickCourseTimer' || mode === 'pickCourseTask') && (
            <div className="pointer-events-auto rounded-2xl bg-paper border border-line shadow-[0_18px_48px_rgba(26,25,21,0.16)] overflow-hidden animate-fade-in min-w-[260px] max-w-[320px]">
              <div className="eyebrow px-5 pt-4 pb-2 text-muted">
                {mode === 'pickCourseTimer' ? 'Start timer for' : 'Add task to'}
              </div>
              <div className="max-h-72 overflow-y-auto pb-2 app-scroll">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      if (mode === 'pickCourseTimer') onStartTimer(c.id);
                      else onAddTask(c.id);
                      setMode('closed');
                    }}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-bg-tint text-left"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: c.color }}
                    />
                    <div className="min-w-0">
                      <div
                        className="eyebrow truncate"
                        style={{ color: c.color }}
                      >
                        {c.code}
                      </div>
                      <div className="font-serif font-medium text-[15px] text-ink truncate">
                        {c.name}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            aria-label={open ? 'Close quick actions' : 'Open quick actions'}
            onClick={() => setMode(open ? 'closed' : 'menu')}
            className="pointer-events-auto flex items-center justify-center rounded-full bg-paper border border-line text-ink transition-transform hover:border-line-strong"
            style={{
              width: 52,
              height: 52,
              boxShadow: '0 4px 12px rgba(26,25,21,0.05)',
            }}
          >
            <svg aria-hidden
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill={open ? 'none' : 'currentColor'}
              className={`transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
            >
              {open ? (
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path d="M7 5l12 7-12 7V5z" />
              )}
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
