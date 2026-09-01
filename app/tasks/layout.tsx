import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tasks',
  description: 'Everything due, by course.',
  robots: { index: false, follow: false },
};

export default function TasksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
