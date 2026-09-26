import Link from 'next/link';
import AkadaMark from '@/components/notebook/AkadaMark';
import DocRail, { DocPager } from '@/components/docs/DocRail';

/**
 * The shell every document sits in: the guide, Akada in Claude, the
 * connector reference, the privacy policy and the terms. Drawn the way the
 * app is on a laptop: a rail on the desk with the reading list and the open
 * page's sections, and the page as a ruled sheet lying over it with the
 * notebook's margin rule. On a phone the rail folds into a bar at the top and
 * the pager at the foot. Set in the reading serif rather than the interface
 * sans, because these are documents rather than screens. A legal page says
 * when it last changed; the others say what they are for instead.
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
    <div className="min-h-[100dvh] bg-bg lg:flex lg:bg-[var(--desk)]">
      <DocRail />
      <main className="doc-sheet ruled-paper relative min-h-[100dvh] min-w-0 flex-1 overflow-hidden bg-bg lg:rounded-l-[26px] lg:[box-shadow:var(--sheet-shadow)]">
        <span aria-hidden className="margin-rule left-3 sm:left-5 lg:left-12" />

        <div className="flex items-center justify-between pl-8 pr-5 pt-6 sm:pl-14 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2.5 text-ink">
            <AkadaMark size={22} />
            <span className="font-serif text-[19px] font-medium tracking-[-0.01em]">Akada</span>
          </Link>
          <Link href="/dashboard" className="px-2 py-2 text-[14px] text-ink-soft hover:text-ink">
            Open Akada
          </Link>
        </div>

        <div className="max-w-[760px] pb-24 pl-8 pr-5 pt-12 sm:pl-14 sm:pr-10 lg:pl-28 lg:pt-24 xl:pl-32">
          {updated && <p className="eyebrow m-0 mb-5">Updated {updated}</p>}
          <h1 className="m-0 font-serif text-[40px] font-normal leading-[1.04] tracking-[-0.025em] sm:text-[54px] lg:text-[60px]">
            {title}
          </h1>
          {standfirst && (
            <p className="mt-5 mb-0 font-serif text-[18.5px] leading-[1.6] text-ink-soft sm:text-[21px]">
              {standfirst}
            </p>
          )}

          <div className="mt-12">{children}</div>

          <DocPager />
          <p className="mt-10 mb-0 font-serif text-[14px] italic text-muted">
            Akada, made at LUMS with quiet hands.
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * One titled part of a document, ruled off under its heading. `aside` is a
 * few words in the hand face: out in the margin beside the section where the
 * page is wide enough to have one, under the heading where it is not.
 */
export function Section({
  id,
  title,
  aside,
  children,
}: {
  id?: string;
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="relative scroll-mt-8 pt-14 first:pt-2">
      <h2 className="m-0 border-b border-line-strong pb-3 font-serif text-[27px] font-normal tracking-[-0.015em] sm:text-[32px]">
        {title}
      </h2>
      {aside && (
        <p className="m-0 mt-3 -rotate-1 font-hand text-[20px] leading-[1.15] text-muted xl:absolute xl:left-[calc(100%+48px)] xl:top-24 xl:mt-0 xl:w-[190px] xl:rotate-2 xl:text-[22px]">
          {aside}
        </p>
      )}
      <div className="legal-prose mt-5">{children}</div>
    </section>
  );
}
