import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stamps',
  description: 'The streak, this week’s challenge, and the stamps earned so far.',
  robots: { index: false, follow: false },
};

export default function StampsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
