import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Course',
  description: 'One course, and everything written down for it.',
  robots: { index: false, follow: false },
};

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
