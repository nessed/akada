import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Akada to reach your courses, tasks and study log.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
