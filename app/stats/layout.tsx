import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Review',
  description: 'A week you close: where the hours went, and one question.',
  robots: { index: false, follow: false },
};

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
