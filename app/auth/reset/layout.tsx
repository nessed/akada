import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset password',
  description: 'Set a new password for your Akada account.',
  robots: { index: false, follow: false },
};

export default function AuthResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
