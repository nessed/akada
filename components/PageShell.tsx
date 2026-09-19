'use client';

import { useEffect, useState } from 'react';
import BottomNav from './BottomNav';
import ActiveTimerDock from './ActiveTimerDock';
import PendingSessionLogSheet from './PendingSessionLogSheet';
import DesktopRail, { RAIL_WIDTHS } from './DesktopRail';

interface Props {
  children: React.ReactNode;
  hideNav?: boolean;
  /**
   * Desktop pages lay themselves out against a 1040px measure with their own
   * two-column grids, so they opt out of the phone column's max width. Phone
   * is unaffected either way.
   */
  wide?: boolean;
}

/**
 * The app frame.
 *
 * Phone is what it always was: a centred sheet with the bottom bar and the
 * timer dock floating over it. Desktop gets the rail instead, and the content
 * recentres in what is left rather than staying pinned to a phone-width
 * column in the middle of a 1440px screen.
 */
export default function PageShell({ children, hideNav, wide }: Props) {
  const [railWidth, setRailWidth] = useState(RAIL_WIDTHS.wide);

  /* The rail's width has to reach the content's left margin, and the rail is
     fixed, so the gutter cannot simply be a sibling in a flex row: the page
     would jump on every collapse before the rail finished animating. The
     width is mirrored here instead and both move together. */
  useEffect(() => {
    if (hideNav) return;
    const read = () => {
      try {
        return window.localStorage.getItem('akada.rail.collapsed') === 'true';
      } catch {
        return false;
      }
    };
    const apply = (collapsed: boolean) =>
      setRailWidth(collapsed ? RAIL_WIDTHS.narrow : RAIL_WIDTHS.wide);

    apply(read());
    const onRail = (e: Event) => apply(Boolean((e as CustomEvent).detail));
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'akada.rail.collapsed') apply(e.newValue === 'true');
    };
    window.addEventListener('akada:rail', onRail);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('akada:rail', onRail);
      window.removeEventListener('storage', onStorage);
    };
  }, [hideNav]);

  return (
    <div className="min-h-[100dvh] bg-bg">
      {!hideNav && <DesktopRail />}
      <div
        className="transition-[padding] duration-200 md:pl-[var(--rail)]"
        style={
          hideNav
            ? undefined
            : ({ ['--rail' as string]: `${railWidth}px` } as React.CSSProperties)
        }
      >
        <main
          className={`mx-auto px-[var(--density-gutter)] md:px-12 ${
            wide ? 'md:max-w-[1136px]' : 'max-w-2xl md:max-w-3xl'
          } ${hideNav ? 'pb-8' : 'pb-[calc(152px+env(safe-area-inset-bottom))] md:pb-16'} pt-[max(env(safe-area-inset-top),64px)] md:pt-10`}
        >
          {children}
        </main>
      </div>
      {/* The dock is the phone's timer chrome. On desktop the rail carries the
          clock instead, so the dock hides itself there rather than doubling it. */}
      {!hideNav && <ActiveTimerDock />}
      <PendingSessionLogSheet />
      {!hideNav && <BottomNav />}
    </div>
  );
}
