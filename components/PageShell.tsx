'use client';

import BottomNav from './BottomNav';
import ActiveTimerDock from './ActiveTimerDock';
import PendingSessionLogSheet from './PendingSessionLogSheet';

interface Props {
  children: React.ReactNode;
  hideNav?: boolean;
}

export default function PageShell({ children, hideNav }: Props) {
  return (
    <div className="min-h-[100dvh] bg-bg">
      {/* The sheet gets a little wider on a bigger screen, and the margins
          around it get a lot wider, per readmedesign.md, more room should
          become whitespace, not more columns. BottomNav, ActiveTimerDock and
          the Stats undo toast mirror this exact width so they stay aligned
          with the page; change all four together. */}
      <main
        className={`mx-auto max-w-2xl md:max-w-3xl px-[var(--density-gutter)] md:px-8 ${
          hideNav ? 'pb-8' : 'pb-[120px]'
        } pt-[max(env(safe-area-inset-top),64px)] md:pt-20`}
      >
        {children}
      </main>
      {!hideNav && <ActiveTimerDock />}
      <PendingSessionLogSheet />
      {!hideNav && <BottomNav />}
    </div>
  );
}
