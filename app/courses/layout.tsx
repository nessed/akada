import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Courses',
  description: 'Every course this term, against its weekly goal.',
  robots: { index: false, follow: false },
};

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
