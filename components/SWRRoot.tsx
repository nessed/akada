'use client';

import { SWRConfig } from 'swr';

// Sane defaults for the planner:
// - revalidateOnFocus: when the user returns to the tab we re-check the
//   server. This is what makes coming back from another app feel "live".
// - dedupingInterval: collapse identical requests fired within 4s into one.
// - keepPreviousData: when a key changes (rare in this app) we keep the
//   stale view until the new fetch resolves so there's no blank flash.
// - errorRetryCount: bounded so a permanently-failing endpoint doesn't
//   spam the network.
export default function SWRRoot({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 4000,
        keepPreviousData: true,
        errorRetryCount: 3,
        errorRetryInterval: 2000,
        shouldRetryOnError: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
