'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import AkadaMark from '@/components/notebook/AkadaMark';

/** The reading, in the order a newcomer would want it. */
export const DOC_PAGES = [
  { href: '/guide', title: 'How Akada works' },
  { href: '/claude', title: 'Akada in Claude' },
  { href: '/docs', title: 'Connector reference' },
  { href: '/privacy', title: 'Privacy' },
  { href: '/terms', title: 'Terms' },
] as const;

interface Heading {
  id: string;
  title: string;
}

/**
 * The page's own sections, read off the sheet once it is on screen rather
 * than passed in, so every document gets them without restating its
 * headings: any `section[id]` with an h2 counts. The one being read is
 * followed as the reader scrolls.
 */
function useSections(): { headings: Heading[]; current: string | null } {
  const pathname = usePathname();
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const found = Array.from(document.querySelectorAll<HTMLElement>('.doc-sheet section[id]'))
      .map((el) => ({ id: el.id, title: el.querySelector('h2')?.textContent?.trim() ?? '' }))
      .filter((h) => h.title);
    setHeadings(found);
    setCurrent(found[0]?.id ?? null);
    if (found.length === 0) return;

    const onScroll = () => {
      // The last section whose heading has passed a third of the way down.
      const line = window.innerHeight / 3;
      let at = found[0].id;
      for (const h of found) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= line) at = h.id;
      }
      setCurrent(at);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  return { headings, current };
}

/**
 * The margin of the documents, on the desk the way the app's rail is: the
 * reading list, the open page's sections under it, and a way into the app.
 * Desktop only; a phone gets the pager at the foot of the page instead.
 */
export default function DocRail() {
  const pathname = usePathname();
  const { headings, current } = useSections();

  return (
    <aside className="top-0 hidden lg:sticky h-[100dvh] w-[272px] shrink-0 flex-col overflow-y-auto px-7 py-9 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 text-ink">
        <AkadaMark size={22} />
        <span className="font-serif text-[21px] font-medium tracking-[-0.01em]">Akada</span>
      </Link>

      <nav aria-label="Reading" className="mt-10">
        <p className="eyebrow m-0 mb-2 px-3">Reading</p>
        <ul className="m-0 list-none p-0">
          {DOC_PAGES.map((page) => {
            const here = pathname === page.href;
            return (
              <li key={page.href}>
                <Link
                  href={page.href}
                  aria-current={here ? 'page' : undefined}
                  className={`block rounded-[10px] px-3 py-2 font-serif text-[16.5px] ${
                    here ? 'bg-bg-tint text-ink' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {page.title}
                </Link>
                {here && headings.length > 0 && (
                  <ul className="m-0 mb-2 ml-5 mt-1 list-none border-l border-line-strong py-1 pl-4">
                    {headings.map((h) => (
                      <li key={h.id}>
                        <a
                          href={`#${h.id}`}
                          className={`block py-1.5 text-[13.5px] leading-[1.35] ${
                            current === h.id ? 'text-ink' : 'text-muted hover:text-ink-soft'
                          }`}
                        >
                          {h.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-auto flex flex-col gap-2 pt-10">
        <p className="m-0 -rotate-2 font-hand text-[19px] text-muted">new here?</p>
        <Link
          href="/auth?mode=signup"
          className="rounded-[12px] bg-primary px-4 py-3 text-center text-[14.5px] font-medium text-primary-contrast"
        >
          Create account
        </Link>
        <Link href="/dashboard" className="py-2 text-center text-[14px] text-ink-soft hover:text-ink">
          Open Akada
        </Link>
      </div>
    </aside>
  );
}

/** Previous and next in the reading list, at the foot of every document. */
export function DocPager() {
  const pathname = usePathname();
  const i = DOC_PAGES.findIndex((p) => p.href === pathname);
  const prev = i > 0 ? DOC_PAGES[i - 1] : null;
  const next = i >= 0 && i < DOC_PAGES.length - 1 ? DOC_PAGES[i + 1] : null;
  if (!prev && !next) return null;
  return (
    <nav aria-label="More reading" className="mt-20 grid grid-cols-2 border-t border-line-strong">
      {prev ? (
        <Link href={prev.href} className="flex flex-col gap-1.5 py-6 pr-4 text-ink">
          <span className="eyebrow">Previous</span>
          <span className="font-serif text-[18px] sm:text-[21px]">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={next.href} className="flex flex-col gap-1.5 border-l border-line-strong py-6 pl-4 text-right text-ink">
          <span className="eyebrow">Next</span>
          <span className="font-serif text-[18px] sm:text-[21px]">{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
