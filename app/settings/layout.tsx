import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Paper, courses, the term and your data.',
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
