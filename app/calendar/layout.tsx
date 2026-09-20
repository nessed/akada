import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Calendar',
  description: 'The month, with what is due and what got done.',
  robots: { index: false, follow: false },
};

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
