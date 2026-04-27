'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';

type Mode = 'signin' | 'signup';
type State = 'idle' | 'loading' | 'success' | 'error';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isSignUp = mode === 'signup';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setState('loading');
    setErrorMsg('');

    const supabase = createClient();

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin + '/auth/callback',
          data: name.trim() ? { display_name: name.trim() } : undefined,
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

  function switchMode() {
    setMode(isSignUp ? 'signin' : 'signup');
    setState('idle');
    setErrorMsg('');
  }

  if (state === 'success') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-8 animate-fade-in">
        <div className="w-full max-w-[340px] text-center">
          <div className="mx-auto mb-7">
            <Mark size={56} />
          </div>
          <h1 className="font-serif font-medium text-[28px] tracking-[-0.02em] mb-3">
            Check your email
          </h1>
          <p className="text-[15px] text-ink-soft leading-[1.6] max-w-[300px] mx-auto">
            We sent a confirmation link to{' '}
            <span className="font-medium text-ink">{successMsg}</span>.
            <br />
            Click it to finish setting up Akada.
          </p>
          <button
            type="button"
            onClick={() => {
              setState('idle');
              setMode('signin');
            }}
            className="mt-8 text-[13px] text-muted font-serif italic hover:text-ink transition-colors"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] flex flex-col px-7 animate-fade-in">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to bottom, transparent 0, transparent 31px, var(--line) 31px, var(--line) 32px)',
          maskImage:
            'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)',
        }}
      />

      <div className="relative mx-auto w-full max-w-[360px] flex flex-col flex-1">
        <Link
          href="/"
          className="pt-[max(env(safe-area-inset-top),88px)] mb-9 flex items-center gap-3.5"
        >
          <Mark size={34} />
          <div>
            <p className="m-0 font-serif text-[22px] font-medium tracking-[-0.02em] leading-none">
              Akada
            </p>
            <p className="mt-1 mb-0 text-[10px] tracking-[0.22em] uppercase text-muted font-semibold">
              Study Planner
            </p>
          </div>
        </Link>

        <div className="mb-8">
          <h1 className="m-0 font-serif font-medium text-[32px] tracking-[-0.02em] leading-[1.1] whitespace-pre-line">
            {isSignUp ? 'Create your\nstudy plan.' : 'Welcome back\nto Akada.'}
          </h1>
          <p className="mt-3 mb-0 text-[14px] text-ink-soft leading-[1.55] max-w-[300px]">
            {isSignUp
              ? 'Track courses, tasks, and focused study sessions in one calm workspace.'
              : 'Sign in to manage your courses, tasks, timer, and progress.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          {isSignUp && (
            <Field label="Name">
              <UnderlineInput
                value={name}
                onChange={setName}
                placeholder="Your name"
                autoFocus
              />
            </Field>
          )}
          <Field label="Email">
            <UnderlineInput
              value={email}
              onChange={setEmail}
              placeholder="you@school.edu"
              type="email"
              autoFocus={!isSignUp}
            />
          </Field>
          <Field label="Password">
            <UnderlineInput
              value={password}
              onChange={setPassword}
              placeholder="Password"
              type="password"
            />
          </Field>

          <button
            type="submit"
            disabled={
              state === 'loading' ||
              !email.trim() ||
              password.length < 6 ||
              (isSignUp && !name.trim())
            }
            className="mt-2.5 w-full py-4 rounded-xl bg-ink text-bg text-[15px] font-medium tracking-[0.01em] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {state === 'loading'
              ? isSignUp
                ? 'Creating account...'
                : 'Signing in...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </button>
        </form>

        {state === 'error' && errorMsg && (
          <p className="mt-3 text-center text-[13px] text-priority font-serif italic">
            {errorMsg}
          </p>
        )}

        <div className="mt-auto py-7 text-center">
          <span className="text-[13px] text-muted">
            {isSignUp ? 'Already have an account? ' : 'New here? '}
          </span>
          <button
            type="button"
            onClick={switchMode}
            className="bg-transparent border-0 cursor-pointer font-serif italic text-[14px] text-ink underline underline-offset-4 decoration-line-strong"
          >
            {isSignUp ? 'Sign in' : 'Start planning'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Mark({ size = 34 }: { size?: number }) {
  const w = size;
  const h = Math.round(size * (68 / 56));
  return (
    <svg width={w} height={h} viewBox="0 0 56 68" fill="none" aria-hidden>
      <path
        d="M6 4 H50 V60 L28 48 L6 60 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="var(--paper)"
      />
      <text
        x="28"
        y="33"
        textAnchor="middle"
        fontFamily="var(--font-serif), Georgia, serif"
        fontSize="22"
        fontStyle="italic"
        fontWeight="500"
        fill="currentColor"
      >
        A
      </text>
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold tracking-[0.16em] uppercase text-muted mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function UnderlineInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-ink transition-colors placeholder:text-muted-soft"
    />
  );
}
