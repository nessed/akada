import type { Metadata } from 'next';
import Link from 'next/link';
import AkadaMark from '@/components/notebook/AkadaMark';

export const metadata: Metadata = {
  title: 'Check your email',
  description: 'A link is on its way.',
  robots: { index: false, follow: false },
};

/**
 * The page you land on after signing up or asking for a reset link.
 *
 * This used to be a state inside the auth form, which meant refreshing the
 * tab, or coming back to it, dropped you onto a blank sign-in page with no
 * idea whether the email had been sent.
 *
 * The address itself is deliberately not in the URL: it would end up in
 * browser history and in the host's request logs, and the person reading the
 * page is the one who just typed it.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const isReset = kind === 'reset';

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center animate-fade-in">
      <AkadaMark size={48} />

      <h1 className="mt-7 mb-0 font-serif text-[28px] font-medium tracking-[-0.02em]">
        Check your email
      </h1>

      <p className="mx-auto mt-3 mb-0 max-w-[320px] text-[15px] leading-[1.6] text-ink-soft">
        {isReset
          ? 'If there is an account for that address, a link to set a new password is on its way.'
          : 'We sent a link to the address you signed up with. Open it to finish setting up Akada.'}
      </p>

      <p className="mx-auto mt-5 mb-0 max-w-[300px] font-serif text-[13px] italic leading-[1.6] text-muted">
        Nothing yet? It can take a minute, and it sometimes lands in spam.
      </p>

      <Link
        href="/auth"
        className="mt-9 font-serif text-[13px] italic text-muted transition-colors hover:text-ink"
      >
        Back to sign in
      </Link>
    </main>
  );
}
