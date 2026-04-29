'use client';

import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[100dvh] bg-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Something went wrong
        </p>
        <h1 className="mt-3 mb-0 font-serif text-[30px] font-medium tracking-[-0.02em] text-ink">
          Akada hit a snag.
        </h1>
        <p className="mt-3 mb-0 text-sm leading-[1.6] text-muted">
          Your planner data is still safe. Try reloading this screen.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-7 h-12 rounded-full bg-ink px-6 text-sm font-semibold text-bg"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
