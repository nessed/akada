import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Term',
  description: 'The month, with the weighted pieces marked on it.',
  robots: { index: false, follow: false },
};

export default function TermLayout({ children }: { children: React.ReactNode }) {
  return children;
}
