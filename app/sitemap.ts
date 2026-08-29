import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

// Only the two publicly reachable pages belong in the sitemap; the rest of
// the app requires a session.
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE_URL, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${SITE_URL}/auth`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
  ];
}
