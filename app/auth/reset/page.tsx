'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { db } from '@/lib/data';
import { MIN_PASSWORD_LENGTH, friendlyAuthError } from '@/lib/auth-messages';
import LoadingIndicator, { ButtonSpinner } from '@/components/LoadingIndicator';

type Stage = 'checking' | 'ready' | 'no-session' | 'saving';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // The recovery link is exchanged for a session by /auth/callback before we
  // get here. No session means the link was expired, already used, or opened
  // in a different browser.
  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!active) return;
        setStage(data.user ? 'ready' : 'no-session');
      })
      .catch(() => {
        if (active) setStage('no-session');
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(`Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Those passwords do not match.');
      return;
    }

    setStage('saving');
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setErrorMsg(friendlyAuthError(error.message, 'reset'));
        setStage('ready');
        return;
      }
      // updateUser leaves the recovery session signed in, so send them
      // straight on rather than asking them to log in again.
      let onboarded = false;
      try {
        onboarded = await db.isOnboardingComplete();
      } catch {
        onboarded = false;
      }
      router.replace(onboarded ? '/dashboard' : '/onboarding');
    } catch (error) {
      setErrorMsg(
        friendlyAuthError(error instanceof Error ? error.message : '', 'reset'),
      );
      setStage('ready');
    }
  }

  if (stage === 'checking') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-8">
        <LoadingIndicator
          label="Checking your reset link"
          detail="This only takes a moment."
        />
      </div>
    );
  }

  if (stage === 'no-session') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-8 animate-fade-in">
        <div className="w-full max-w-[340px] text-center">
          <h1 className="font-serif font-medium text-[28px] tracking-[-0.02em] mb-3">
            This link has expired
          </h1>
          <p className="m-0 text-[15px] text-ink-soft leading-[1.6]">
            Password reset links can only be used once, and they expire. Request a
            fresh one and we will email it straight over.
          </p>
          <Link
            href="/auth"
            className="mt-8 inline-block text-[13px] text-muted font-serif italic underline underline-offset-4 decoration-line-strong"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  const saving = stage === 'saving';

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center px-7 animate-fade-in">
      <div className="mx-auto w-full max-w-[360px]">
        <h1 className="m-0 font-serif font-medium text-[34px] tracking-[-0.025em] leading-[1.05]">
          Choose a new
          <br />
          <span className="italic font-normal">password.</span>
        </h1>
        <p className="mt-3 mb-8 font-serif italic text-[14px] text-muted leading-[1.55]">
          At least {MIN_PASSWORD_LENGTH} characters. You will stay signed in on this device.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div>
            <label
              htmlFor="new-password"
              className="eyebrow block text-muted mb-2"
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary transition-colors placeholder:text-muted-soft"
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="eyebrow block text-muted mb-2"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="w-full bg-transparent border-0 border-b border-line-strong rounded-none px-0.5 py-2.5 text-[15px] text-ink outline-none focus:border-primary transition-colors placeholder:text-muted-soft"
            />
          </div>

          <button
            type="submit"
            disabled={saving || password.length < MIN_PASSWORD_LENGTH || !confirm}
            className="mt-2.5 w-full min-h-[56px] py-4 rounded-2xl bg-primary text-primary-contrast text-[15px] font-medium tracking-[0.01em] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? <span className="flex items-center justify-center gap-2.5"><ButtonSpinner />Saving password…</span> : 'Save password'}
          </button>
        </form>

        {errorMsg && (
          <p className="mt-3 text-center text-[13px] text-priority font-serif italic">
            {errorMsg}
          </p>
        )}
      </div>
    </div>
  );
}
