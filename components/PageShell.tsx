'use client';

import BottomNav from './BottomNav';
import SideRail from './nav/SideRail';
import ActiveTimerDock from './ActiveTimerDock';
import PendingSessionLogSheet from './PendingSessionLogSheet';
import { useReviewWaiting } from '@/lib/data-hooks';

interface Props {
  children: React.ReactNode;
  /**
   * The right-hand column: the week spine, the reading backlog, where the
   * grade stands. On a desktop it is a 374px page of its own, on a phone it
   * falls in underneath the main column. It is the same React tree in both
   * cases — rendered twice, an aside with a textarea in it would keep two
   * copies of what the reader typed.
   */
  aside?: React.ReactNode;
  hideNav?: boolean;
  /**
   * Screens that are a single reading column (settings, a course) cap their
   * width. The month grid and the dashboard want the whole page.
   */
  width?: 'full' | 'read';
}

export default function PageShell({ children, aside, hideNav, width = 'full' }: Props) {
  const reviewWaiting = useReviewWaiting();

  return (
    <div className="min-h-[100dvh] bg-bg">
      {!hideNav && <SideRail reviewWaiting={reviewWaiting} />}

      <div className={hideNav ? '' : 'md:pl-[74px]'}>
        <div className="flex flex-col lg:flex-row">
          <main
            className={`min-w-0 flex-1 px-[var(--density-gutter)] md:px-11 ${
              width === 'read' ? 'max-w-[900px]' : ''
            } pt-[max(env(safe-area-inset-top),22px)] md:pt-9 ${
              hideNav ? 'pb-10' : 'pb-[calc(140px+env(safe-area-inset-bottom))] lg:pb-14'
            }`}
          >
            {children}
          </main>

          {aside && (
            <aside
              className="app-scroll w-full flex-none border-t border-line bg-paper-2 px-[var(--density-gutter)] pb-10 pt-8 md:px-8 lg:sticky lg:top-0 lg:h-[100dvh] lg:w-[374px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pb-0 lg:pt-9"
            >
              <div className="flex min-h-full flex-col">{aside}</div>
            </aside>
          )}
        </div>
      </div>

      {!hideNav && <ActiveTimerDock />}
      <PendingSessionLogSheet />
      {!hideNav && <BottomNav reviewWaiting={reviewWaiting} />}
    </div>
  );
}
