import type { Metadata } from 'next';
import Link from 'next/link';
import AkadaMark from '@/components/notebook/AkadaMark';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

/**
 * A mistyped URL used to land on Next.js's own white "404: This page could
 * not be found." Anyone who reached it had no way back and no sign they were
 * still on Akada.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center px-8 text-center">
      <AkadaMark size={34} />

      <p className="eyebrow mt-8 mb-0">Page not found</p>

      <h1 className="mt-3 mb-0 font-serif text-[36px] font-medium leading-[1.1] tracking-[-0.025em]">
        This page is <span className="italic">blank</span>.
      </h1>

      <p className="mt-3 mb-0 max-w-[300px] font-serif text-[14px] italic leading-[1.6] text-muted">
        Nothing was ever written here.
      </p>

      <div className="mt-9 flex flex-col items-center gap-4">
        <Link
          href="/dashboard"
          className="rounded-2xl bg-primary px-6 py-3.5 text-[15px] font-medium text-primary-contrast"
        >
          Back to your planner
        </Link>
        <Link href="/" className="hand-underline font-serif text-[13px] text-muted">
          Or start from the beginning
        </Link>
      </div>
    </main>
  );
}
