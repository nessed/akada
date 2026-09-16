import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The list',
  description: 'Everything written down, grouped by when.',
  robots: { index: false, follow: false },
};

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
