'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { db } from '@/lib/data';
import AkadaMark from '@/components/notebook/AkadaMark';
import { Eyebrow, PageButton } from '@/components/notebook/Marks';
import {
  MIN_PASSWORD_LENGTH,
  authRedirectErrorMessage,
  friendlyAuthError,
} from '@/lib/auth-messages';

type Mode = 'signin' | 'signup';
type State = 'idle' | 'loading' | 'error';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingAction, setLoadingAction] = useState<'signin' | 'signup' | 'reset' | null>(null);

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
        const requestedNext = new URLSearchParams(window.location.search).get('next');
        const safeNext =
          requestedNext &&
          requestedNext.startsWith('/') &&
          !requestedNext.startsWith('//') &&
          !requestedNext.startsWith('/\\')
            ? requestedNext
            : null;
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
    const requestedNext = new URLSearchParams(window.location.search).get('next');
    const safeNext =
      requestedNext &&
      requestedNext.startsWith('/') &&
      !requestedNext.startsWith('//') &&
      !requestedNext.startsWith('/\\')
        ? requestedNext
        : null;
    router.replace(safeNext ?? (onboarded ? '/dashboard' : '/onboarding'));
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

  function switchMode() {
    setAuthMode(isSignUp ? 'signin' : 'signup');
  }

  return (
    <div className="flex min-h-[100dvh] animate-fade-in">
      <div className="relative flex min-w-0 flex-1 flex-col px-7">
        {/* Ruled paper behind the form, faded out at both ends so the rules
            never run into the edge of the screen. */}
        <span
          aria-hidden
          className="ruled pointer-events-none absolute inset-0 opacity-70"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent, #000 25%, #000 75%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent, #000 25%, #000 75%, transparent)',
          }}
        />

        <div className="relative mx-auto flex w-full max-w-[380px] flex-1 flex-col">
          <Link
            href="/"
            className="mb-12 flex items-center gap-3 pt-[max(env(safe-area-inset-top),56px)]"
          >
            <AkadaMark size={24} />
            <span className="font-serif text-[20px] tracking-[-0.02em]">Akada</span>
          </Link>

          <h1 className="m-0 font-serif text-[32px] font-normal leading-[1.06] tracking-[-0.03em] md:text-[38px]">
            {isSignUp ? (
              <>
                Start the term
                <br />
                <em className="italic">on one page.</em>
              </>
            ) : (
              <>
                Back to the
                <br />
                <em className="italic">notebook.</em>
              </>
            )}
          </h1>

          <form
            onSubmit={handleSubmit}
            className="mt-9 flex flex-col gap-6"
            aria-busy={state === 'loading'}
          >
            {isSignUp && (
              <Field label="Name" htmlFor="name">
                <RuledInput
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
              <RuledInput
                id="email"
                value={email}
                onChange={setEmail}
                placeholder="you@university.edu"
                type="email"
                autoComplete="email"
                autoFocus={!isSignUp}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <RuledInput
                id="password"
                value={password}
                onChange={setPassword}
                placeholder="Password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
              {isSignUp && (
                <p className="mb-0 mt-2 text-[11.5px] text-muted">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </Field>

            <PageButton
              type="submit"
              className="mt-2"
              disabled={
                state === 'loading' ||
                !email.trim() ||
                (isSignUp ? password.length < MIN_PASSWORD_LENGTH : password.length === 0) ||
                (isSignUp && !name.trim())
              }
            >
              {state === 'loading'
                ? loadingAction === 'signup'
                  ? 'Creating your account…'
                  : loadingAction === 'reset'
                    ? 'Sending reset link…'
                    : 'Signing you in…'
                : isSignUp
                  ? 'Create account'
                  : 'Sign in'}
            </PageButton>

            {/* Two quiet words under the button rather than a second pair of
                buttons: switching mode and forgetting a password are both
                things you read your way to, not things you press. */}
            <div className="flex items-baseline justify-between gap-4">
              <button
                type="button"
                onClick={switchMode}
                disabled={state === 'loading'}
                className="border-b border-line-strong bg-transparent pb-px font-serif text-[13.5px] italic text-ink-soft"
              >
                {isSignUp ? 'I already have an account' : 'Create an account'}
              </button>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={state === 'loading'}
                  className="bg-transparent font-serif text-[13.5px] italic text-muted"
                >
                  Forgot it?
                </button>
              )}
            </div>
          </form>

          {state === 'error' && errorMsg && (
            <p role="alert" className="mt-5 font-serif text-[13.5px] italic text-priority">
              {errorMsg}
            </p>
          )}

          <p className="mb-8 mt-auto pt-10 font-serif text-[12.5px] italic text-muted">
            Your courses, tasks and hours are yours alone. No one at Akada can read them.
          </p>
        </div>
      </div>

      {/* What the notebook is, alongside. The design puts the reader\u2019s own
          week here; before they have signed in the app does not have one, and
          filling the panel with a plausible-looking term would be inventing
          their data on the sign-in screen. So it says what is true instead. */}
      <aside className="hidden w-[420px] flex-none border-l border-line bg-paper-2 py-14 pl-10 pr-10 lg:block">
        <Eyebrow>What is in here</Eyebrow>
        <p className="mt-2.5 max-w-[18ch] font-serif text-[24px] leading-[1.25]">
          Fifteen weeks, on one page.
        </p>
        <div className="rule-ink mt-7">
          {[
            ['Your real timetable', 'Sections out of the course catalog, meeting times included.'],
            ['What each piece is worth', 'Enter the weighting once and every deadline carries it.'],
            ['A clock to hide behind', 'A block, the list for it, and the screen locked to the time.'],
            ['The week, read back', 'On Sunday, in plain words, with one question.'],
          ].map(([title, detail]) => (
            <div key={title} className="row-rule py-3.5">
              <p className="m-0 font-serif text-[16px]">{title}</p>
              <p className="m-0 mt-1 text-[13px] leading-[1.5] text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </aside>
    </div>
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
      <label htmlFor={htmlFor} className="eyebrow mb-2 block">
        {label}
      </label>
      {children}
    </div>
  );
}

/** A field is a ruled line, and the rule goes to full ink when it has focus. */
function RuledInput({
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
      className="w-full border-0 border-b-[1.4px] border-line-strong bg-transparent px-0.5 pb-2.5 text-[16px] text-ink transition-colors placeholder:text-muted focus:border-ink"
    />
  );
}
