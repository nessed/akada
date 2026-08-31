'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * The app's way of saying something went wrong.
 *
 * It replaces `alert()`, which is unstyleable operating-system chrome in a
 * system font — the loudest thing that could appear on a page made of paper,
 * and it blocks the thread while it sits there. This is a quiet slip of paper
 * that slides in above the nav, says one sentence, and leaves on its own.
 */

interface NoticeApi {
  /** Say one thing, briefly. Keep it a statement, not an instruction. */
  notify: (message: string) => void;
}

const NoticeContext = createContext<NoticeApi | null>(null);

const DWELL_MS = 4200;

export function useNotice(): NoticeApi {
  const context = useContext(NoticeContext);
  // Falling back to a no-op keeps a component usable outside the provider
  // (tests, storybook) rather than throwing on render.
  return context ?? { notify: () => {} };
}

export default function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((next: string) => {
    const text = next.trim();
    if (!text) return;
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(null), DWELL_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <NoticeContext.Provider value={api}>
      {children}
      {message && (
        <div
          // Above the bottom nav and the floating dock, below the sheets —
          // a sheet that reports its own failure has to stay on top of this.
          className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[75] flex justify-center px-[22px]"
          role="status"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="pointer-events-auto max-w-md rounded-[12px] border border-line bg-paper/95 px-4 py-3 text-left font-serif text-[13px] italic leading-[1.5] text-ink-soft shadow-[0_18px_48px_rgba(26,25,21,0.16)] backdrop-blur-sm animate-fade-in"
          >
            {message}
          </button>
        </div>
      )}
    </NoticeContext.Provider>
  );
}
