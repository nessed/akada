'use client';

import BottomNav from './BottomNav';
import Sidebar from './Sidebar';
import ActiveTimerDock from './ActiveTimerDock';
import PendingSessionLogSheet from './PendingSessionLogSheet';

interface Props {
  children: React.ReactNode;
  hideNav?: boolean;
}

// Sidebar takes over navigation at lg: (tablet-landscape and laptop); the
// content column shifts right by the same amount so nothing sits under it.
// Both Sidebar and BottomNav are always mounted and toggle via CSS
// (`lg:hidden` / `hidden lg:flex`) rather than JS, so there's no
// hydration mismatch and no navigation flash on resize.
export default function PageShell({ children, hideNav }: Props) {
  return (
    <div className="min-h-[100dvh] bg-bg">
      {!hideNav && <Sidebar />}
      <div className={!hideNav ? 'lg:pl-64' : ''}>
        <main
          className={`mx-auto max-w-2xl md:max-w-3xl lg:max-w-5xl px-[22px] md:px-10 lg:px-12 ${
            hideNav ? 'pb-8' : 'pb-[120px] lg:pb-16'
          } pt-[max(env(safe-area-inset-top),64px)] lg:pt-14`}
        >
          {children}
        </main>
      </div>
      {!hideNav && <ActiveTimerDock />}
      <PendingSessionLogSheet />
      {!hideNav && <BottomNav />}
    </div>
  );
}
