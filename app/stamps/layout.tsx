import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Record',
  description: 'The run in weeks, every course page, and the impressions struck so far.',
  robots: { index: false, follow: false },
};

export default function RecordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
