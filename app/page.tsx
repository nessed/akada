'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/data';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const onboarded = await db.isOnboardingComplete();
        router.replace(onboarded ? '/dashboard' : '/onboarding');
      } catch {
        router.replace('/auth');
      }
    })();
  }, [router]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center">
      <div className="text-muted-soft text-sm font-serif italic">Loading…</div>
    </div>
  );
}
