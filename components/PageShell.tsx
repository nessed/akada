'use client';

import BottomNav from './BottomNav';

interface Props {
  children: React.ReactNode;
  hideNav?: boolean;
}

export default function PageShell({ children, hideNav }: Props) {
  return (
    <div className="min-h-[100dvh] bg-bg">
      <main
        className={`mx-auto max-w-2xl px-[22px] ${
          hideNav ? 'pb-8' : 'pb-[120px]'
        } pt-[max(env(safe-area-inset-top),64px)]`}
      >
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
