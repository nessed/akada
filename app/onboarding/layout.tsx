import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Setup',
  description: 'Add your courses and set a weekly study goal.',
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
