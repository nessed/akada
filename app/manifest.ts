import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Akada Study Planner',
    short_name: 'Akada',
    description:
      'Plan courses, manage assignments, log focused study sessions, and track academic progress.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F5F1E8',
    theme_color: '#F5F1E8',
    orientation: 'portrait',
    // The PNGs are generated from icon.svg by scripts/build-icons.mjs. The
    // SVG stays first for anything that prefers it; the raster sizes are what
    // Android checks before offering to install.
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
