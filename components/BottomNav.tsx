'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TABS, isActive } from './nav/tabs';

/**
 * The same four destinations as the rail, laid across the foot of a phone.
 *
 * The bar fades the page out from underneath rather than sitting on a solid
 * strip, so a list scrolling past it dissolves instead of being cut off. The
 * fade has to finish before the icons start, or a card passing underneath
 * stays legible behind the labels; the tall pt is that fade region, not
 * padding round the icons. Outside the tabs themselves the bar is
 * click-through, so it does not swallow taps on whatever is under it.
 */
export default function BottomNav({ reviewWaiting }: { reviewWaiting?: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center justify-around px-4 pt-10 md:hidden"
      style={{
        paddingBottom: 'calc(18px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(180deg, transparent 0%, var(--bg) 38%, var(--bg) 100%)',
      }}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-2xl items-center justify-around">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-1 px-3 py-1.5 ${
                active ? 'text-ink' : 'pb-[18px] text-muted'
              }`}
            >
              {tab.icon(active ? 1.8 : 1.4)}
              <span
                className={`whitespace-nowrap text-[11px] tracking-[0.01em] ${
                  active ? 'font-semibold' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
              {/* A straight rule under the lit tab, not a pill behind it. */}
              {active && <span aria-hidden className="h-[1.5px] w-[18px] bg-ink" />}
              {tab.href === '/stats' && reviewWaiting && !active && (
                <span
                  aria-hidden
                  className="absolute right-2 top-[-1px] h-[5px] w-[5px] animate-tick rounded-full bg-warn"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
