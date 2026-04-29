'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from './BottomNav';
import ActiveTimerDock from './ActiveTimerDock';
import { useTimer } from '@/lib/timer-context';

interface Props {
  children: React.ReactNode;
  hideNav?: boolean;
}

export default function PageShell({ children, hideNav }: Props) {
  const router = useRouter();
  const { pendingLog } = useTimer();

  useEffect(() => {
    if (pendingLog) router.push('/timer');
  }, [pendingLog, router]);

  return (
    <div className="min-h-[100dvh] bg-bg">
      <main
        className={`mx-auto max-w-2xl px-[22px] ${
          hideNav ? 'pb-8' : 'pb-[120px]'
        } pt-[max(env(safe-area-inset-top),64px)]`}
      >
        {children}
      </main>
      {!hideNav && <ActiveTimerDock />}
      {!hideNav && <BottomNav />}
    </div>
  );
}
