import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Fraunces, Lora, Merriweather } from 'next/font/google';
import { TimerProvider } from '@/lib/timer-context';
import PreferencesBootstrap from '@/components/PreferencesBootstrap';
import SWRRoot from '@/components/SWRRoot';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-lora',
  display: 'swap',
});

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  variable: '--font-merriweather',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
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
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#FAFAF6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} ${fraunces.variable} ${lora.variable} ${merriweather.variable}`}
    >
      <body className="font-sans bg-bg text-ink antialiased">
        <PreferencesBootstrap />
        <SWRRoot>
          <TimerProvider>{children}</TimerProvider>
        </SWRRoot>
      </body>
    </html>
  );
}
