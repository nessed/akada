import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import './notes.css';

export const metadata: Metadata = {
  title: 'Notes',
  description: 'Study notes, read quietly.',
  robots: { index: false, follow: false },
};

export default function NotesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
