import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stats',
  description: 'Hours logged, streaks and how the term has gone.',
  robots: { index: false, follow: false },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
