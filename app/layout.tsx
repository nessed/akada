import type { Metadata, Viewport } from 'next';
import { Source_Serif_4, Schibsted_Grotesk, Space_Mono } from 'next/font/google';
import { TimerProvider } from '@/lib/timer-context';
import PreferencesBootstrap from '@/components/PreferencesBootstrap';
import NoticeProvider from '@/components/Notice';
import SWRRoot from '@/components/SWRRoot';
import TimerDocumentTitle from '@/components/TimerDocumentTitle';
import PaperDoodle from '@/components/notebook/PaperDoodle';
import { SITE_URL } from '@/lib/site-url';
import './globals.css';

// The three families the redesign runs on. Source Serif 4 carries every
// heading and every line of prose the app speaks in; Schibsted Grotesk is the
// structural sans; Space Mono grounds durations, dates and the clock. There is
// no fourth family and no picker: the old Inter / Fraunces / Caveat stack, and
// the heading-font choice that went with it, are gone.
const sans = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans',
  display: 'swap',
});

// Optical sizing is the reason this face is here: the 52px review masthead and
// a 13px italic aside are the same type cut two different ways.
const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif-family',
  display: 'swap',
});

const mono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Akada - Study Planner',
    template: '%s - Akada',
  },
  description:
    'Plan courses, manage assignments, log focused study sessions, and track academic progress.',
  applicationName: 'Akada',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Akada',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'Akada - Study Planner',
    description:
      'A calm academic planner for courses, tasks, study timers, and progress tracking.',
    type: 'website',
    siteName: 'Akada',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Akada - Study Planner',
    description:
      'A calm academic planner for courses, tasks, study timers, and progress tracking.',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
  },
};

export const viewport: Viewport = {
  // The shipped default paper tone. Kept in step with --bg in globals.css and
  // PAPER_TONES.paper, so the browser and PWA chrome match the page.
  themeColor: '#F5F1E8',
  width: 'device-width',
  initialScale: 1,
  // maximumScale / userScalable are deliberately not set: blocking pinch-zoom
  // fails WCAG 1.4.4 and there is nothing here that needs a fixed scale.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <body className="font-sans bg-bg text-ink antialiased">
        <PreferencesBootstrap />
        <SWRRoot>
          <TimerProvider>
            <TimerDocumentTitle />
            <NoticeProvider>{children}</NoticeProvider>
          </TimerProvider>
        </SWRRoot>
        <PaperDoodle />
      </body>
    </html>
  );
}
