import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { TimerProvider } from '@/lib/timer-context';
import PreferencesBootstrap from '@/components/PreferencesBootstrap';
import NoticeProvider from '@/components/Notice';
import SWRRoot from '@/components/SWRRoot';
import TimerDocumentTitle from '@/components/TimerDocumentTitle';
import TimerHotkeys from '@/components/TimerHotkeys';
import PaperDoodle from '@/components/notebook/PaperDoodle';
import SmoothScroll from '@/components/SmoothScroll';
import { SITE_URL } from '@/lib/site-url';
import './globals.css';

/* Every face is served from app/fonts rather than next/font/google. The
   Google loader fetches the CSS at build time, and under Turbopack on Vercel
   that fetch intermittently came back in a shape it could not parse ("queries
   have exactly one entry"), failing production builds of commits whose
   previews had built fine. Local files build the same every time. They are
   the Latin variable cuts from Fontsource (all SIL OFL), the same subset the
   Google loader was asked for. */

const inter = localFont({
  src: './fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-sans',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
    { path: './fonts/ibm-plex-mono-latin-600-normal.woff2', weight: '600' },
    { path: './fonts/ibm-plex-mono-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-mono',
  display: 'swap',
  adjustFontFallback: false,
});

const fraunces = localFont({
  src: [
    { path: './fonts/fraunces-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
    { path: './fonts/fraunces-latin-wght-italic.woff2', weight: '100 900', style: 'italic' },
  ],
  variable: '--font-fraunces',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
});

const lora = localFont({
  src: [
    { path: './fonts/lora-latin-wght-normal.woff2', weight: '400 700', style: 'normal' },
    { path: './fonts/lora-latin-wght-italic.woff2', weight: '400 700', style: 'italic' },
  ],
  variable: '--font-lora',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
  // Only renders if chosen in Appearance, so it is not worth a preload on
  // every page load. Same for the other two alternates below.
  preload: false,
});

const merriweather = localFont({
  src: [
    { path: './fonts/merriweather-latin-wght-normal.woff2', weight: '300 900', style: 'normal' },
    { path: './fonts/merriweather-latin-wght-italic.woff2', weight: '300 900', style: 'italic' },
  ],
  variable: '--font-merriweather',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
  preload: false,
});

// Editorial alternative to the default Fraunces, offered in Appearance.
const cormorant = localFont({
  src: [
    { path: './fonts/cormorant-garamond-latin-wght-normal.woff2', weight: '300 700', style: 'normal' },
    { path: './fonts/cormorant-garamond-latin-wght-italic.woff2', weight: '300 700', style: 'italic' },
  ],
  variable: '--font-cormorant',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
  preload: false,
});

// Handwritten marginalia and notes (HandNote primitive, Caveat utility).
const caveat = localFont({
  src: './fonts/caveat-latin-wght-normal.woff2',
  weight: '400 700',
  variable: '--font-hand',
  display: 'swap',
  adjustFontFallback: false,
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
  // theme-color is deliberately absent here. It has to follow the paper the
  // reader chose, and a value in this export is a React-owned tag that Next
  // re-renders on every client navigation: it came back as the shipped cream
  // the moment someone on the night paper moved between pages, so the page
  // was dark inside a cream frame again. PREFERENCE_BOOTSTRAP_SCRIPT writes
  // the tag instead, before the first paint and out of React's hands, and
  // applyPreferences keeps it in step when the tone changes.
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
      // globals.css scrolls smoothly; this tells Next to drop that while it
      // moves between routes, so a new page opens at its top, not after a glide.
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${mono.variable} ${fraunces.variable} ${lora.variable} ${merriweather.variable} ${cormorant.variable} ${caveat.variable}`}
    >
      <body className="font-sans bg-bg text-ink antialiased">
        <PreferencesBootstrap />
        <SWRRoot>
          <TimerProvider>
            <TimerDocumentTitle />
            {/* P and K reach the running clock from every screen. See the
                component: they bind nothing unless a sitting is running. */}
            <TimerHotkeys />
            <NoticeProvider>{children}</NoticeProvider>
          </TimerProvider>
        </SWRRoot>
        <PaperDoodle />
        <SmoothScroll />
      </body>
    </html>
  );
}
