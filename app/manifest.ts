import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Akada Study Planner',
    short_name: 'Akada',
    description:
      'Plan courses, manage assignments, log focused study sessions, and track academic progress.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAFAF6',
    theme_color: '#FAFAF6',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/apple-icon.svg',
        sizes: '180x180',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
