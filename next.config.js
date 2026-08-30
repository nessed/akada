/** @type {import('next').NextConfig} */

const isProd = process.env.NODE_ENV === 'production';

// The app talks to exactly one third-party origin: its own Supabase project.
// Derive it from the env var rather than hardcoding, so previews and
// production each lock down to their own backend.
let supabaseOrigin = '';
try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  }
} catch {
  // Malformed URL — leave it out of connect-src rather than breaking the build
  // here. lib/data/index.ts is what fails the build on missing config.
}

const connectSrc = ["'self'", supabaseOrigin, supabaseOrigin.replace(/^https:/, 'wss:')]
  .filter(Boolean)
  .join(' ');

// Note on 'unsafe-inline' in script-src: Next.js inlines its hydration
// payload, and the strict alternative (a per-request nonce from proxy.ts)
// forces every currently-static page to render dynamically. That is not a
// trade worth making the day before launch. This CSP still blocks
// attacker-hosted scripts, framing, plugins, base-tag hijacking and
// off-origin form posts. Tightening to a nonce is tracked in
// LAUNCH_CHECKLIST.md.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  // React writes inline style attributes, and next/font injects a <style> tag.
  "style-src 'self' 'unsafe-inline'",
  // Avatars may be https: URLs or base64 data: URLs.
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc}`,
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isProd ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: [
      'accelerometer=()',
      'camera=()',
      'display-capture=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  // Stop advertising the framework and version to every visitor.
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
