'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

type State = 'idle' | 'sending' | 'sent' | 'error';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    setErrorMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + '/auth/callback',
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setState('error');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center px-8">
      <div className="w-full max-w-[340px] animate-fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-7">
          <svg width="56" height="68" viewBox="0 0 56 68" fill="none">
            <path
              d="M6 4 H50 V60 L28 48 L6 60 Z"
              stroke="#1A1915"
              strokeWidth="1.4"
              fill="#FAFAF6"
            />
            <text
              x="28"
              y="32"
              textAnchor="middle"
              fontFamily="var(--font-serif), Georgia, serif"
              fontSize="22"
              fontStyle="italic"
              fill="#1A1915"
            >
              P
            </text>
          </svg>
        </div>

        {state === 'sent' ? (
          <div className="text-center">
            <h1 className="font-serif font-medium text-[28px] tracking-[-0.02em] mb-3">
              Check your email
            </h1>
            <p className="text-[15px] text-ink-soft leading-[1.6] max-w-[300px] mx-auto">
              We sent a magic link to{' '}
              <span className="font-medium text-ink">{email}</span>.
              <br />
              Click the link to sign in.
            </p>
            <button
              type="button"
              onClick={() => {
                setState('idle');
                setEmail('');
              }}
              className="mt-8 text-[13px] text-muted font-serif italic hover:text-ink transition-colors"
            >
              ← Use a different email
            </button>
          </div>
        ) : (
          <>
            <h1 className="font-serif font-medium text-[32px] tracking-[-0.02em] text-center mb-2">
              Sign in
            </h1>
            <p className="text-center text-[14px] text-ink-soft leading-[1.5] mb-8">
              Enter your email — we&apos;ll send a magic link.
              <br />
              <span className="font-serif italic text-muted text-[13px]">
                No password needed.
              </span>
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                required
                className="w-full bg-paper border border-line rounded-xl px-4 py-3.5 text-[15px] text-ink outline-none focus:border-ink transition-colors font-serif italic placeholder:text-muted-soft"
              />
              <button
                type="submit"
                disabled={state === 'sending' || !email.trim()}
                className="w-full py-4 rounded-xl bg-ink text-bg text-[15px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {state === 'sending' ? 'Sending…' : 'Send magic link'}
              </button>
            </form>

            {state === 'error' && errorMsg && (
              <p className="mt-4 text-center text-[13px] text-priority font-serif italic">
                {errorMsg}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
