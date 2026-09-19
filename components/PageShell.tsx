'use client';

import BottomNav from './BottomNav';
import ActiveTimerDock from './ActiveTimerDock';
import PendingSessionLogSheet from './PendingSessionLogSheet';
import { useReviewWaiting } from '@/lib/data-hooks';

interface Props {
  children: React.ReactNode;
  /**
   * The secondary column: the week spine, the reading backlog, where the grade
   * stands. It is not a second column any more. The sheet is one centred
   * measure at every width, so this falls in underneath the main content the
   * way it always did on a phone.
   *
   * It stays a single React tree rendered once. Rendering it twice, once per
   * breakpoint, would keep two copies of anything the reader had typed into it.
   */
  aside?: React.ReactNode;
  hideNav?: boolean;
  /**
   * Kept so callers do not all have to change at once. The sheet has one
   * measure now, so this no longer widens anything.
   */
  width?: 'full' | 'read';
}

/**
 * One centred sheet, a bottom bar, and nothing pinned to an edge.
 *
 * The editorial redesign turned this into a 74px rail on the left and a 374px
 * spine on the right with the content wedged between them, which on a wide
 * display left the reading column hard against the left edge and most of the
 * screen empty. This is the pre-overhaul shell restored: more room becomes
 * margin, not more columns.
 *
 * BottomNav, ActiveTimerDock and the review's undo toast mirror this width so
 * they stay aligned with the page. Change all four together.
 */
export default function PageShell({ children, aside, hideNav }: Props) {
  const reviewWaiting = useReviewWaiting();

  return (
    <div className="min-h-[100dvh] bg-bg">
      <main
        className={`mx-auto w-full max-w-2xl md:max-w-3xl px-[var(--density-gutter)] md:px-8 ${
          hideNav ? 'pb-8' : 'pb-[calc(152px+env(safe-area-inset-bottom))]'
        } pt-[max(env(safe-area-inset-top),48px)] md:pt-16`}
      >
        {children}

        {aside && <div className="mt-12 border-t border-line pt-8">{aside}</div>}
      </main>

      {!hideNav && <ActiveTimerDock />}
      <PendingSessionLogSheet />
      {!hideNav && <BottomNav reviewWaiting={reviewWaiting} />}
    </div>
  );
}
