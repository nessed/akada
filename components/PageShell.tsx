'use client';

import BottomNav from './BottomNav';
import ActiveTimerDock from './ActiveTimerDock';
import PendingSessionLogSheet from './PendingSessionLogSheet';
import DesktopRail from './DesktopRail';

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
  return (
    <div className={`min-h-[100dvh] bg-bg ${hideNav ? '' : 'md:bg-[var(--desk)]'}`}>
      {!hideNav && <DesktopRail />}
      {/* On desktop the rail sits on the desk and the page is a sheet lying
          over it (.page-sheet in globals.css): no rule between them. */}
      {!hideNav && <div aria-hidden className="page-sheet hidden md:block" />}
      {/* data-scroll-content is what SmoothScroll pulls past the ends of
          the page. The rail, the dock and the bar are outside it on purpose. */}
      {/* --rail is the rail's width, set in globals.css from data-rail on
          <html>, which is written before the first paint. It was mirrored
          here from an effect, so a collapsed rail's page mounted at 232px and
          slid back on every navigation. The dock clears the rail by the same
          variable. */}
      <div
        data-scroll-content
        className={`relative transition-[padding] duration-200 ease-[cubic-bezier(0.2,0.7,0.2,1)] ${hideNav ? '' : 'md:pl-[var(--rail)]'}`}
      >
        <main
          className={`page-in mx-auto px-[var(--density-gutter)] md:px-12 ${
            wide ? 'md:max-w-[1136px]' : 'max-w-2xl md:max-w-3xl'
          } ${hideNav ? 'pb-8' : 'pb-[calc(152px+env(safe-area-inset-bottom))] md:pb-16'} pt-[max(env(safe-area-inset-top),64px)] md:pt-10`}
        >
          {children}
        </main>
      </div>
      {/* The running clock, on every size. The rail offers a start; once a
          sitting runs the dock is the only clock, so there is never a second
          one to disagree with it. */}
      {!hideNav && <ActiveTimerDock />}
      <PendingSessionLogSheet />
      {!hideNav && <BottomNav />}
    </div>
  );
}
