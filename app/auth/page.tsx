'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Mode = 'signin' | 'signup';
type State = 'idle' | 'loading' | 'success' | 'error';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setState('loading');
    setErrorMsg('');

    const supabase = createClient();

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin + '/auth/callback',
        },
      });

      if (error) {
        setErrorMsg(error.message);
        setState('error');
      } else {
        setSuccessMsg(email.trim());
        setState('success');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        setState('error');
      } else {
        router.push('/dashboard');
      }
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
              A
            </text>
          </svg>
        </div>

        {state === 'success' ? (
          <div className="text-center">
            <h1 className="font-serif font-medium text-[28px] tracking-[-0.02em] mb-3">
              Check your email
            </h1>
            <p className="text-[15px] text-ink-soft leading-[1.6] max-w-[300px] mx-auto">
              We sent a confirmation link to{' '}
              <span className="font-medium text-ink">{successMsg}</span>.
              <br />
              Click it to activate your account.
            </p>
            <button
              type="button"
              onClick={() => {
                setState('idle');
                setMode('signin');
              }}
              className="mt-8 text-[13px] text-muted font-serif italic hover:text-ink transition-colors"
            >
              ← Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h1 className="font-serif font-medium text-[32px] tracking-[-0.02em] text-center mb-2">
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-center text-[14px] text-ink-soft leading-[1.5] mb-8">
              {mode === 'signin'
                ? 'Sign in to pick up where you left off.'
                : 'Start tracking your study hours.'}
            </p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                required
                className="w-full bg-paper border border-line rounded-xl px-4 py-3.5 text-[15px] text-ink outline-none focus:border-ink transition-colors placeholder:text-muted-soft"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={6}
                className="w-full bg-paper border border-line rounded-xl px-4 py-3.5 text-[15px] text-ink outline-none focus:border-ink transition-colors placeholder:text-muted-soft"
              />
              <button
                type="submit"
                disabled={state === 'loading' || !email.trim() || !password}
                className="w-full py-4 rounded-xl bg-ink text-bg text-[15px] font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity mt-1"
              >
                {state === 'loading'
                  ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                  : (mode === 'signin' ? 'Sign in' : 'Sign up')}
              </button>
            </form>

            {state === 'error' && errorMsg && (
              <p className="mt-4 text-center text-[13px] text-priority font-serif italic">
                {errorMsg}
              </p>
            )}

            <p className="mt-6 text-center text-[13px] text-muted">
              {mode === 'signin' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setState('idle'); setErrorMsg(''); }}
                    className="text-ink font-medium hover:underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signin'); setState('idle'); setErrorMsg(''); }}
                    className="text-ink font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
