'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#F8F5EF',
            color: '#1A1915',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          <div style={{ maxWidth: 360, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase' }}>
              Something went wrong
            </p>
            <h1 style={{ margin: '14px 0 0', fontSize: 30, fontWeight: 600 }}>
              Akada needs a reload.
            </h1>
            <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6 }}>
              Your local timer state is preserved where the browser allows it.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 28,
                height: 48,
                border: 0,
                borderRadius: 999,
                padding: '0 24px',
                background: '#1A1915',
                color: '#F8F5EF',
                fontWeight: 700,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
