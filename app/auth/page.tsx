'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { db } from '@/lib/data';
import { ButtonSpinner } from '@/components/LoadingIndicator';
import {
  MIN_PASSWORD_LENGTH,
  authRedirectErrorMessage,
  friendlyAuthError,
} from '@/lib/auth-messages';

type Mode = 'signin' | 'signup';
type State = 'idle' | 'loading' | 'error';

/**
 * The post-auth destination from `?next=`, honoured only when it is a
 * same-origin relative path. Anything protocol-relative ("//evil.com"),
 * backslash-smuggled ("/\\evil.com") or absolute is dropped, so the parameter
 * can never turn one of these redirects into an open one. Deliberately the
 * same rule as safeNextPath in app/auth/callback/route.ts, which guards the
 * other end of the same journey.
 */
function readSafeNext(): string | null {
  const raw = new URLSearchParams(window.location.search).get('next');
  if (!raw || !raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingAction, setLoadingAction] =
    useState<'signin' | 'signup' | 'reset' | 'google' | null>(null);

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
    setLoadingAction(isSignUp ? 'signup' : 'signin');
    setErrorMsg('');

    try {
      const supabase = createClient();

      if (isSignUp) {
        const safeNext = readSafeNext();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`,
            data: name.trim() ? { display_name: name.trim() } : undefined,
          },
        });

        if (error) {
          setErrorMsg(friendlyAuthError(error.message, 'signup'));
          setState('error');
          setLoadingAction(null);
        } else if (data.session) {
          // Email confirmations are switched off in Supabase, so sign-up
          // returns a live session. Showing "check your email" here would
          // strand the user on a screen with nothing to wait for.
          await goToNextStep();
        } else {
          router.push('/auth/check-email?kind=signup');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          setErrorMsg(friendlyAuthError(error.message, 'signin'));
          setState('error');
          setLoadingAction(null);
        } else {
          await goToNextStep();
        }
      }
    } catch (error) {
      setErrorMsg(
        friendlyAuthError(error instanceof Error ? error.message : '', mode),
      );
      setState('error');
      setLoadingAction(null);
    }
  }

  async function goToNextStep() {
    let onboarded = false;
    try {
      onboarded = await db.isOnboardingComplete();
    } catch {
      onboarded = false;
    }
    router.replace(readSafeNext() ?? (onboarded ? '/dashboard' : '/onboarding'));
  }

  async function handleForgotPassword() {
    const target = email.trim();
    if (!target) {
      setErrorMsg('Enter your email address above first, then tap “Forgot password?”.');
      setState('error');
      return;
    }
    setState('loading');
    setLoadingAction('reset');
    setErrorMsg('');
    try {
      const next = encodeURIComponent('/auth/reset');
      const { error } = await createClient().auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      });
      if (error) {
        setErrorMsg(friendlyAuthError(error.message, 'reset'));
        setState('error');
        setLoadingAction(null);
        return;
      }
      router.push('/auth/check-email?kind=reset');
      setLoadingAction(null);
    } catch (error) {
      setErrorMsg(
        friendlyAuthError(error instanceof Error ? error.message : '', 'reset'),
      );
      setState('error');
      setLoadingAction(null);
    }
  }

  async function handleGoogleSignIn() {
    setState('loading');
    setLoadingAction('google');
    setErrorMsg('');

    try {
      const safeNext = readSafeNext();
      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Supabase sends the browser to Google, Google sends it back to
          // Supabase, and Supabase sends it here with a PKCE `code`. This URL
          // is the only one of the three we own, and it has to be on the
          // Supabase redirect allowlist or the round trip ends on an error
          // page instead.
          redirectTo: `${window.location.origin}/auth/callback${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`,
          // No access_type/prompt here on purpose. Offline access is what the
          // Calendar work needs, and asking for it now would put a consent
          // screen in front of every sign-in for a permission nothing in the
          // app uses yet. See docs/google-auth-plan.md.
        },
      });

      if (error) {
        setErrorMsg(friendlyAuthError(error.message, mode));
        setState('error');
        setLoadingAction(null);
      }
      // On success the browser is already on its way to Google. Leave the
      // spinner up rather than flashing the idle button under a page that is
      // being navigated away from.
    } catch (error) {
      setErrorMsg(
        friendlyAuthError(error instanceof Error ? error.message : '', mode),
      );
      setState('error');
      setLoadingAction(null);
    }
  }

  function switchMode() {
    setAuthMode(isSignUp ? 'signin' : 'signup');
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
            <p className="eyebrow mt-1 mb-0 text-muted">
              Study Planner
            </p>
          </div>
        </Link>

        <div className="mb-8">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-line bg-paper p-1">
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              disabled={state === 'loading'}
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
              disabled={state === 'loading'}
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]" aria-busy={state === 'loading'}>
          {isSignUp && (
            <Field label="Name" htmlFor="name">
              <UnderlineInput
                id="name"
                value={name}
                onChange={setName}
                placeholder="Your name"
                autoComplete="name"
                autoFocus
              />
            </Field>
          )}
          <Field label="Email" htmlFor="email">
            <UnderlineInput
              id="email"
              value={email}
              onChange={setEmail}
              placeholder="you@school.edu"
              type="email"
              autoComplete="email"
              autoFocus={!isSignUp}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <UnderlineInput
              id="password"
              value={password}
              onChange={setPassword}
              placeholder="Password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
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
            {state === 'loading' && loadingAction !== 'google'
              ? <span className="flex items-center justify-center gap-2.5"><ButtonSpinner />{loadingAction === 'signup' ? 'Creating your account…' : loadingAction === 'reset' ? 'Sending reset link…' : 'Signing you in…'}</span>
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
          <p role="alert" className="mt-3 text-center text-[13px] text-priority font-serif italic">
            {errorMsg}
          </p>
        )}

        <div className="my-6 flex items-center gap-4">
          <span aria-hidden className="h-px flex-1 bg-line" />
          <span className="font-serif italic text-[13px] text-muted-soft">or</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={state === 'loading'}
          className="w-full min-h-[56px] py-4 rounded-2xl border border-line-strong bg-transparent text-[15px] font-medium text-ink-soft flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
        >
          {loadingAction === 'google' ? (
            <>
              <ButtonSpinner />
              Opening Google…
            </>
          ) : (
            <>
              <GoogleMark />
              Continue with Google
            </>
          )}
        </button>

        <div className="mt-auto py-7 text-center">
          <span className="text-[13px] text-muted">
            {isSignUp ? 'Already have an account? ' : 'New here? '}
          </span>
          <button
            type="button"
            onClick={switchMode}
            disabled={state === 'loading'}
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

/**
 * Google's own G, at the four colours their identity guidelines require. It is
 * the one thing on this screen that does not answer to the paper palette, and
 * that is deliberate: a recoloured G is a trademark the app does not own.
 * Kept to 18px so it reads as a mark beside the label rather than a logo.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="eyebrow block text-muted mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function UnderlineInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={id}
      name={id}
      type={type}
      value={value}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary transition-colors placeholder:text-muted-soft"
    />
  );
}
