'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { db } from '@/lib/data';
import {
  MIN_PASSWORD_LENGTH,
  authRedirectErrorMessage,
  friendlyAuthError,
} from '@/lib/auth-messages';

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
  const [successKind, setSuccessKind] = useState<'signup' | 'reset'>('signup');

  const isSignUp = mode === 'signup';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get('mode');
    const requestedError = params.get('error');

    if (requestedMode === 'signup') {
      setMode('signup');
    } else if (requestedMode === 'signin') {
      setMode('signin');
    }

    if (requestedError) {
      setErrorMsg(authRedirectErrorMessage(requestedError));
      setState('error');
    }
  }, []);

  function setAuthMode(nextMode: Mode) {
    setMode(nextMode);
    setState('idle');
    setErrorMsg('');
    setSuccessMsg('');

    const url = new URL(window.location.href);
    if (nextMode === 'signup') {
      url.searchParams.set('mode', 'signup');
    } else {
      url.searchParams.delete('mode');
    }
    url.searchParams.delete('error');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setState('loading');
    setErrorMsg('');

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + '/auth/callback',
            data: name.trim() ? { display_name: name.trim() } : undefined,
          },
        });

        if (error) {
          setErrorMsg(friendlyAuthError(error.message, 'signup'));
          setState('error');
        } else if (data.session) {
          // Email confirmations are switched off in Supabase, so sign-up
          // returns a live session. Showing "check your email" here would
          // strand the user on a screen with nothing to wait for.
          await goToNextStep();
        } else {
          setSuccessKind('signup');
          setSuccessMsg(email.trim());
          setState('success');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setErrorMsg(friendlyAuthError(error.message, 'signin'));
          setState('error');
        } else {
          await goToNextStep();
        }
      }
    } catch (error) {
      setErrorMsg(
        friendlyAuthError(error instanceof Error ? error.message : '', mode),
      );
      setState('error');
    }
  }

  async function goToNextStep() {
    let onboarded = false;
    try {
      onboarded = await db.isOnboardingComplete();
    } catch {
      onboarded = false;
    }
    router.replace(onboarded ? '/dashboard' : '/onboarding');
  }

  async function handleForgotPassword() {
    const target = email.trim();
    if (!target) {
      setErrorMsg('Enter your email address above first, then tap “Forgot password?”.');
      setState('error');
      return;
    }
    setState('loading');
    setErrorMsg('');
    try {
      const next = encodeURIComponent('/auth/reset');
      const { error } = await createClient().auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      });
      if (error) {
        setErrorMsg(friendlyAuthError(error.message, 'reset'));
        setState('error');
        return;
      }
      setSuccessKind('reset');
      setSuccessMsg(target);
      setState('success');
    } catch (error) {
      setErrorMsg(
        friendlyAuthError(error instanceof Error ? error.message : '', 'reset'),
      );
      setState('error');
    }
  }

  function switchMode() {
    setAuthMode(isSignUp ? 'signin' : 'signup');
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
            {successKind === 'reset' ? (
              <>
                If an account exists for{' '}
                <span className="font-medium text-ink">{successMsg}</span>, we have
                sent a link to reset the password.
              </>
            ) : (
              <>
                We sent a confirmation link to{' '}
                <span className="font-medium text-ink">{successMsg}</span>.
                <br />
                Click it to finish setting up Akada.
              </>
            )}
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
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-line bg-paper p-1">
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              aria-pressed={!isSignUp}
              className={`rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                !isSignUp
                  ? 'bg-primary text-primary-contrast'
                  : 'text-ink-soft hover:bg-bg-tint'
              }`}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('signup')}
              aria-pressed={isSignUp}
              className={`rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                isSignUp
                  ? 'bg-primary text-primary-contrast'
                  : 'text-ink-soft hover:bg-bg-tint'
              }`}
            >
              Create account
            </button>
          </div>
          <h1 className="m-0 font-serif font-medium text-[34px] tracking-[-0.025em] leading-[1.05]">
            {isSignUp ? (
              <>
                Create your<br />
                <span className="italic font-normal">study plan.</span>
              </>
            ) : (
              <>
                Welcome back<br />
                <span className="italic font-normal">
                  to <span className="hl">Akada</span>.
                </span>
              </>
            )}
          </h1>
          <p className="mt-3 mb-0 font-serif italic text-[14px] text-muted leading-[1.55] max-w-[300px]">
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
            {isSignUp && (
              <p className="mt-2 mb-0 text-[11.5px] text-muted-soft">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            )}
          </Field>

          <button
            type="submit"
            disabled={
              state === 'loading' ||
              !email.trim() ||
              (isSignUp ? password.length < MIN_PASSWORD_LENGTH : password.length === 0) ||
              (isSignUp && !name.trim())
            }
            className="mt-2.5 w-full min-h-[56px] py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium tracking-[0.01em] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {state === 'loading'
              ? isSignUp
                ? 'Creating account...'
                : 'Signing in...'
              : isSignUp
                ? 'Create account'
                : 'Sign in'}
          </button>

          {!isSignUp && (
            <button
              type="button"
              className="mt-1 self-center bg-transparent border-0 cursor-pointer font-serif italic text-[13px] text-muted underline underline-offset-4 decoration-line-strong min-h-[44px] px-3"
              onClick={handleForgotPassword}
              disabled={state === 'loading'}
            >
              Forgot password?
            </button>
          )}
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
            {isSignUp ? 'Log in' : 'Create account'}
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
      className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary transition-colors placeholder:text-muted-soft"
    />
  );
}
