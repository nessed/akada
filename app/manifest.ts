import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Akada Study Planner',
    short_name: 'Akada',
    description:
      'Plan courses, manage assignments, log focused study sessions, and track academic progress.',
    start_url: '/',
    display: 'standalone',
    // The night paper's ground, since that is the tone the app opens on.
    background_color: '#1A1815',
    theme_color: '#1A1815',
    // Not locked. A phone reads it upright anyway, but a tablet or a laptop
    // folded back lies on its side as often as not, and the rail and the
    // two-column pages are laid out for exactly that.
    orientation: 'any',
    // The PNGs are generated from app-icon.svg by scripts/build-icons.mjs,
    // the full-bleed tile on the night paper (icon.svg is the transparent tab
    // favicon and would sit on nothing on a home screen). The SVG stays first for anything that prefers it; the raster sizes are what
    // Android checks before offering to install.
    icons: [
      { src: '/app-icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
