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

      <div
        className="fixed right-5 z-50 flex flex-col items-end gap-3"
        style={{ bottom: 'calc(84px + env(safe-area-inset-bottom))' }}
      >
        {mode === 'menu' && (
          <div className="rounded-2xl bg-paper border border-line shadow-xl overflow-hidden animate-fade-in">
            <button
              type="button"
              onClick={() => setMode('pickCourseTimer')}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-bg-tint text-left"
            >
              <span className="w-8 h-8 rounded-full bg-bg-tint flex items-center justify-center">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span className="text-sm font-medium">Add task</span>
            </button>
          </div>
        )}

        {(mode === 'pickCourseTimer' || mode === 'pickCourseTask') && (
          <div className="rounded-2xl bg-paper border border-line shadow-xl overflow-hidden animate-fade-in min-w-[260px] max-w-[320px]">
            <div className="px-5 pt-4 pb-2 text-[11px] font-semibold tracking-[0.16em] uppercase text-muted">
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
                      className="text-[10px] font-semibold uppercase tracking-[0.16em] truncate"
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
          className="w-13 h-13 rounded-full bg-ink text-bg flex items-center justify-center transition-transform"
          style={{
            width: 52,
            height: 52,
            boxShadow: '0 4px 12px rgba(26,25,21,0.18)',
          }}
        >
          <svg
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
    </>
  );
}
