import Link from 'next/link';
import AkadaMark from '@/components/notebook/AkadaMark';

/**
 * The shell the privacy policy, the terms and the guide sit in. A single
 * column of paper, set in the reading serif rather than the interface sans,
 * because these are documents rather than screens. A legal page says when it
 * last changed; the guide says what it is for instead.
 */
export default function LegalPage({
  title,
  updated,
  standfirst,
  children,
}: {
  title: string;
  updated?: string;
  standfirst?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[42rem] px-[var(--density-gutter)] pb-24 pt-14 md:px-8">
      <Link href="/" className="inline-flex items-center gap-2.5 text-ink">
        <AkadaMark size={22} />
        <span className="font-serif text-[17px] font-medium tracking-[-0.01em]">Akada</span>
      </Link>

      <h1 className="mt-10 mb-0 font-serif text-[36px] font-medium leading-[1.1] tracking-[-0.025em]">
        {title}
      </h1>
      {updated && <p className="eyebrow mt-3 mb-0">Updated {updated}</p>}
      {standfirst && (
        <p className="mt-4 mb-0 font-serif text-[17px] leading-[1.6] text-ink-soft">
          {standfirst}
        </p>
      )}

      <div className="mt-10 border-t border-line pt-2">{children}</div>
    </main>
  );
}

/** One titled part of a document, ruled off from the next. */
export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 border-b border-line py-7 last:border-b-0">
      <h2 className="mt-0 mb-3 font-serif text-[19px] font-medium tracking-[-0.01em]">
        {title}
      </h2>
      <div className="legal-prose">{children}</div>
    </section>
  );
}
