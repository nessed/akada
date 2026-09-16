'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AkadaMark from '../notebook/AkadaMark';
import Marginalia from '../notebook/Marginalia';
import { TABS, isActive } from './tabs';
import { useUserSettings } from '@/lib/data-hooks';
import { initialsFrom } from '@/lib/avatar';

/**
 * The desktop rail. 74px of tinted paper down the left edge, the bookmark at
 * the top, four destinations, and the reader's own initial at the foot where
 * it opens Settings.
 *
 * A lit tab is a panel of page colour with a line round it — the tab is
 * literally the page showing through the rail, which is why there is no fill
 * and no rounded chrome. The rail only exists at md and up; below that the
 * same four destinations are a bar across the foot of the screen.
 */

export default function SideRail({ reviewWaiting }: { reviewWaiting?: boolean }) {
  const pathname = usePathname();
  const { settings } = useUserSettings();
  const onSettings = pathname === '/settings' || pathname?.startsWith('/settings/');

  return (
    <nav className="fixed inset-y-0 left-0 z-40 hidden w-[74px] flex-col items-center border-r border-line bg-bg-tint pb-[18px] pt-[22px] md:flex">
      <Link href="/dashboard" aria-label="Akada">
        <AkadaMark size={26} />
      </Link>

      <div className="mt-[30px] flex w-full flex-col items-center gap-1.5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex w-[52px] flex-col items-center gap-[5px] px-0 pb-[7px] pt-[9px] ${
                active ? 'border border-line bg-bg text-ink' : 'text-muted hover:text-ink-soft'
              }`}
            >
              {tab.icon(active ? 1.7 : 1.5)}
              <span className="text-[8.5px] font-semibold uppercase tracking-[0.1em]">
                {tab.label}
              </span>
              {/* The one thing in the app allowed to ask for attention, and it
                  is a 5px dot that breathes rather than a count in a circle. */}
              {tab.href === '/stats' && reviewWaiting && !active && (
                <span
                  aria-hidden
                  className="absolute right-[9px] top-[7px] h-[5px] w-[5px] animate-tick rounded-full bg-warn"
                />
              )}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3.5">
        <Marginalia mark="squiggle" width={30} />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full font-serif text-[15px] text-ink"
          style={{
            background: 'var(--peach)',
            border: onSettings ? '2px solid var(--ink)' : '1px solid var(--line-strong)',
          }}
        >
          {settings?.avatarUrl ? (
            /* A stored data URL, already shrunk by resizeAvatar; next/image
               would only wrap a loader round a string that is in memory. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsFrom(settings?.displayName || '') || 'A'
          )}
        </Link>
      </div>
    </nav>
  );
}
