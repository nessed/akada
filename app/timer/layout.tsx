import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Timer',
  description: 'A focused study session, timed.',
  robots: { index: false, follow: false },
};

export default function TimerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
