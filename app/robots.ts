import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/auth'],
      // Everything behind the auth gate is per-user and has nothing to index.
      disallow: ['/dashboard', '/timer', '/tasks', '/stats', '/onboarding', '/auth/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
