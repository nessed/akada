import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Goals, term, courses and how the app looks.',
  robots: { index: false, follow: false },
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
